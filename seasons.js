// ============================================================
// seasons.js — модуль сезонов PRORANK
// ============================================================
// 🔧 Добавляет логику сезонов. Не трогает существующий код.
// Подключается через initSeasons(db, auth) из header.js
// ============================================================

import {
    doc, getDoc, setDoc, updateDoc,
    collection, getDocs, query, where, orderBy, limit,
    Timestamp, runTransaction, serverTimestamp, increment
} from "firebase/firestore";

let _db = null;
let _auth = null;
let _activeSeasonCache = null;
let _activeSeasonCacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 минута

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
export function initSeasons(db, auth) {
    _db = db;
    _auth = auth;
}

function _ensureInit() {
    if (!_db) throw new Error('seasons.js: вызови initSeasons(db, auth) перед использованием');
}

// ============================================================
// ЧТЕНИЕ СЕЗОНОВ
// ============================================================

/**
 * Получить активный сезон (status === 'active').
 * Кэшируется на 1 минуту.
 */
export async function getActiveSeason(forceRefresh = false) {
    _ensureInit();

    const now = Date.now();
    if (!forceRefresh && _activeSeasonCache && (now - _activeSeasonCacheTime) < CACHE_TTL) {
        return _activeSeasonCache;
    }

    try {
        const q = query(
            collection(_db, "seasons"),
            where("status", "==", "active"),
            limit(1)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            _activeSeasonCache = null;
            _activeSeasonCacheTime = now;
            return null;
        }

        const d = snap.docs[0];
        _activeSeasonCache = { id: d.id, ...d.data() };
        _activeSeasonCacheTime = now;
        return _activeSeasonCache;
    } catch (e) {
        console.warn('⚠️ seasons.js: getActiveSeason error', e);
        return null;
    }
}

/**
 * Получить сезон по ID.
 */
export async function getSeason(seasonId) {
    _ensureInit();
    if (!seasonId) return null;
    try {
        const ref = doc(_db, "seasons", seasonId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() };
    } catch (e) {
        console.warn('⚠️ seasons.js: getSeason error', e);
        return null;
    }
}

/**
 * Сбросить кэш активного сезона (вызывать после изменений в админке).
 */
export function clearActiveSeasonCache() {
    _activeSeasonCache = null;
    _activeSeasonCacheTime = 0;
}

// ============================================================
// ЛЕНИВЫЙ СБРОС FRS
// ============================================================

/**
 * Ленивый сброс FRS бойца.
 * Если боец не в текущем сезоне — переносим frs → allTimeFrs, обнуляем frs.
 * НЕ трогает партнёров и клубных юзеров (проверка — на стороне header.js).
 *
 * @returns {object|null} обновлённые данные бойца или null
 */
export async function lazyResetFighter(uid) {
    _ensureInit();
    if (!uid) return null;

    const activeSeason = await getActiveSeason();
    if (!activeSeason) return null; // нет активного сезона — ничего не делаем

    try {
        const fighterRef = doc(_db, "fighters", uid);
        const fighterSnap = await getDoc(fighterRef);
        if (!fighterSnap.exists()) return null;

        const data = fighterSnap.data();

        // Если боец уже в текущем сезоне — ничего не делаем
        if (data.currentSeasonId === activeSeason.id) {
            return data;
        }

        // Переносим старый FRS в историю
        const oldFrs = data.frs || 0;
        const oldSeasonId = data.currentSeasonId || null;
        const oldSeasonName = data.currentSeasonName || null;

        const seasonHistory = Array.isArray(data.seasonHistory) ? [...data.seasonHistory] : [];

        // Записываем в историю ТОЛЬКО если был активный прошлый сезон
        if (oldSeasonId && oldSeasonId !== activeSeason.id) {
            seasonHistory.push({
                seasonId: oldSeasonId,
                seasonName: oldSeasonName || oldSeasonId,
                frs: oldFrs,
                place: null,   // будет заполнено при завершении сезона админом
                prize: 0,
                archivedAt: Timestamp.now()
            });
        }

        const updates = {
            allTimeFrs: (data.allTimeFrs || 0) + oldFrs,
            frs: 0,
            currentSeasonId: activeSeason.id,
            currentSeasonName: activeSeason.name,
            seasonHistory: seasonHistory,
            lastSeasonResetAt: serverTimestamp()
        };

        await updateDoc(fighterRef, updates);

        console.log(`🔄 seasons.js: FRS сброшен для ${uid}: ${oldFrs} → 0 (всего: ${updates.allTimeFrs})`);

        return { ...data, ...updates };
    } catch (e) {
        console.warn('⚠️ seasons.js: lazyResetFighter error', e);
        return null;
    }
}

/**
 * Ленивый сброс clubFRS клуба.
 *
 * ⚠️ ВАЖНО: clubFRS — денормализованное поле (сумма FRS членов).
 * При сбросе НЕ ставим 0, а ПЕРЕСЧИТЫВАЕМ как сумму FRS членов,
 * которые УЖЕ находятся в новом сезоне. Иначе потеряем FRS тех,
 * кто уже зашёл и сбросился, но чей вклад в клуб ещё висит.
 */
export async function lazyResetClub(clubId) {
    _ensureInit();
    if (!clubId) return null;

    const activeSeason = await getActiveSeason();
    if (!activeSeason) return null;

    try {
        const clubRef = doc(_db, "clubs", clubId);
        const clubSnap = await getDoc(clubRef);
        if (!clubSnap.exists()) return null;

        const data = clubSnap.data();

        // Если клуб уже в текущем сезоне — ничего не делаем
        if (data.currentSeasonId === activeSeason.id) {
            return data;
        }

        const oldClubFrs = data.clubFRS || 0;
        const oldSeasonId = data.currentSeasonId || null;
        const oldSeasonName = data.currentSeasonName || null;
        const members = Array.isArray(data.members) ? data.members : [];

        // Переносим старый clubFRS в историю
        const seasonHistory = Array.isArray(data.seasonHistory) ? [...data.seasonHistory] : [];

        if (oldSeasonId && oldSeasonId !== activeSeason.id) {
            seasonHistory.push({
                seasonId: oldSeasonId,
                seasonName: oldSeasonName || oldSeasonId,
                clubFRS: oldClubFrs,
                place: null,
                prize: 0,
                archivedAt: Timestamp.now()
            });
        }

        // Пересчитываем clubFRS: сумма FRS членов, УЖЕ находящихся в новом сезоне
        let newClubFrs = 0;
        if (members.length > 0) {
            // Читаем пачкой (Firestore не умеет одним запросом, но до 50 — ок)
            const chunks = [];
            for (let i = 0; i < members.length; i += 30) {
                chunks.push(members.slice(i, i + 30));
            }

            for (const chunk of chunks) {
                const promises = chunk.map(uid => getDoc(doc(_db, "fighters", uid)));
                const snaps = await Promise.all(promises);
                snaps.forEach(s => {
                    if (s.exists()) {
                        const m = s.data();
                        // Считаем только тех, кто уже в новом сезоне
                        if (m.currentSeasonId === activeSeason.id) {
                            newClubFrs += (m.frs || 0);
                        }
                    }
                });
            }
        }

        const updates = {
            allTimeFrs: (data.allTimeFrs || 0) + oldClubFrs,
            clubFRS: newClubFrs,
            currentSeasonId: activeSeason.id,
            currentSeasonName: activeSeason.name,
            seasonHistory: seasonHistory,
            lastSeasonResetAt: serverTimestamp()
        };

        await updateDoc(clubRef, updates);

        console.log(`🔄 seasons.js: clubFRS сброшен для клуба ${clubId}: ${oldClubFrs} → ${newClubFrs} (всего: ${updates.allTimeFrs})`);

        return { ...data, ...updates };
    } catch (e) {
        console.warn('⚠️ seasons.js: lazyResetClub error', e);
        return null;
    }
}

// ============================================================
// ТОП-3 БОЙЦА И КЛУБА
// ============================================================

/**
 * Топ-N бойцов сезона (по frs), БЕЗ партнёров.
 * Фильтр по isPartner делаем в JS, чтобы не требовать индекс.
 */
export async function getTopFighters(seasonId, count = 3) {
    _ensureInit();
    if (!seasonId) return [];

    try {
        const q = query(
            collection(_db, "fighters"),
            where("currentSeasonId", "==", seasonId),
            orderBy("frs", "desc"),
            limit(count * 3) // берём с запасом, отфильтруем партнёров
        );
        const snap = await getDocs(q);
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return all.filter(f => f.isPartner !== true).slice(0, count);
    } catch (e) {
        console.warn('⚠️ seasons.js: getTopFighters error', e);
        return [];
    }
}

/**
 * Топ-N клубов сезона (по clubFRS).
 */
export async function getTopClubs(seasonId, count = 3) {
    _ensureInit();
    if (!seasonId) return [];

    try {
        const q = query(
            collection(_db, "clubs"),
            where("currentSeasonId", "==", seasonId),
            where("status", "==", "approved"),
            orderBy("clubFRS", "desc"),
            limit(count)
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.warn('⚠️ seasons.js: getTopClubs error', e);
        return [];
    }
}

// ============================================================
// НАГРАДЫ — «ЗАБРАТЬ»
// ============================================================

/**
 * Получить награду бойца за сезон (если есть pending).
 */
export async function getFighterReward(uid, seasonId) {
    _ensureInit();
    if (!uid || !seasonId) return null;

    try {
        // ID документа: `${seasonId}_fighter_${uid}`
        const rewardId = `${seasonId}_fighter_${uid}`;
        const ref = doc(_db, "season_rewards", rewardId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() };
    } catch (e) {
        console.warn('⚠️ seasons.js: getFighterReward error', e);
        return null;
    }
}

/**
 * Получить награду клуба за сезон (если есть pending).
 */
export async function getClubReward(clubId, seasonId) {
    _ensureInit();
    if (!clubId || !seasonId) return null;

    try {
        const rewardId = `${seasonId}_club_${clubId}`;
        const ref = doc(_db, "season_rewards", rewardId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() };
    } catch (e) {
        console.warn('⚠️ seasons.js: getClubReward error', e);
        return null;
    }
}

/**
 * Забрать награду бойца.
 * Атомарно: помечает reward paid + начисляет на wallet_balances + пишет транзакцию.
 */
export async function claimFighterReward(uid, seasonId) {
    _ensureInit();
    if (!uid || !seasonId) throw new Error('uid и seasonId обязательны');

    const rewardId = `${seasonId}_fighter_${uid}`;

    return await runTransaction(_db, async (tx) => {
        const rewardRef = doc(_db, "season_rewards", rewardId);
        const rewardSnap = await tx.get(rewardRef);

        if (!rewardSnap.exists()) {
            throw new Error('Награда не найдена');
        }

        const reward = rewardSnap.data();

        if (reward.status === 'paid') {
            throw new Error('Награда уже получена');
        }

        if (reward.recipientType !== 'fighter' || reward.recipientId !== uid) {
            throw new Error('Несоответствие получателя');
        }

        const amount = reward.amount || 0;
        if (amount <= 0) throw new Error('Сумма награды некорректна');

        // 1. Обновляем баланс
        const balanceRef = doc(_db, "wallet_balances", uid);
        const balanceSnap = await tx.get(balanceRef);

        if (!balanceSnap.exists()) {
            // Создаём кошелёк, если нет
            tx.set(balanceRef, {
                available: amount,
                pending: 0,
                pendingWithdraw: 0,
                totalEarned: amount,
                totalSpent: 0,
                totalRefunded: 0,
                totalWithdrawn: 0,
                hasDeposit: false,
                hasPurchase: false,
                hasPayout: true,
                userType: 'fighter',
                updatedAt: serverTimestamp()
            });
        } else {
            tx.update(balanceRef, {
                available: increment(amount),
                totalEarned: increment(amount),
                hasPayout: true,
                updatedAt: serverTimestamp()
            });
        }

        // 2. Помечаем reward paid
        tx.update(rewardRef, {
            status: 'paid',
            paidAt: serverTimestamp()
        });

        // 3. Пишем транзакцию
        const txRef = doc(collection(_db, "wallet_transactions"));
        tx.set(txRef, {
            userId: uid,
            userType: 'fighter',
            type: 'season_prize',
            amount: amount,
            status: 'completed',
            relatedId: seasonId,
            relatedType: 'season',
            description: `Награда за ${reward.seasonName || seasonId} — ${reward.place}-е место`,
            metadata: {
                seasonId,
                place: reward.place,
                frs: reward.frs || 0
            },
            createdAt: serverTimestamp()
        });

        // 4. Помечаем, что боец забрал
        const fighterRef = doc(_db, "fighters", uid);
        const fighterSnap = await tx.get(fighterRef);
        if (fighterSnap.exists()) {
            const fd = fighterSnap.data();
            const claimed = Array.isArray(fd.claimedRewards) ? [...fd.claimedRewards] : [];
            if (!claimed.includes(seasonId)) claimed.push(seasonId);
            tx.update(fighterRef, { claimedRewards: claimed });
        }

        return { amount, place: reward.place };
    });
}

/**
 * Забрать награду клуба (распределяет пропорционально FRS между участниками).
 * Вызывается только владельцем клуба.
 */
export async function claimClubReward(clubId, seasonId, members, memberFrsMap) {
    _ensureInit();
    if (!clubId || !seasonId) throw new Error('clubId и seasonId обязательны');
    if (!Array.isArray(members) || members.length === 0) throw new Error('В клубе нет участников');

    const rewardId = `${seasonId}_club_${clubId}`;

    return await runTransaction(_db, async (tx) => {
        const rewardRef = doc(_db, "season_rewards", rewardId);
        const rewardSnap = await tx.get(rewardRef);

        if (!rewardSnap.exists()) throw new Error('Награда клуба не найдена');
        const reward = rewardSnap.data();

        if (reward.status === 'paid') throw new Error('Награда уже получена');
        if (reward.recipientType !== 'club' || reward.recipientId !== clubId) {
            throw new Error('Несоответствие получателя');
        }

        const totalAmount = reward.amount || 0;
        if (totalAmount <= 0) throw new Error('Сумма награды некорректна');

        // Считаем сумму FRS участников
        const totalFrs = members.reduce((sum, uid) => sum + (memberFrsMap[uid] || 0), 0);
        if (totalFrs <= 0) throw new Error('У участников нет FRS для распределения');

        // Распределяем
        const splits = [];
        for (const uid of members) {
            const frs = memberFrsMap[uid] || 0;
            if (frs <= 0) continue;
            const share = Math.floor((totalAmount * frs) / totalFrs);
            if (share > 0) splits.push({ uid, frs, share });
        }

        // Остаток от округления — первому
        const sumShares = splits.reduce((s, x) => s + x.share, 0);
        const remainder = totalAmount - sumShares;
        if (remainder > 0 && splits.length > 0) {
            splits[0].share += remainder;
        }

        // Начисляем каждому
        for (const { uid, share, frs } of splits) {
            const balanceRef = doc(_db, "wallet_balances", uid);
            const balanceSnap = await tx.get(balanceRef);

            if (!balanceSnap.exists()) {
                tx.set(balanceRef, {
                    available: share,
                    pending: 0,
                    pendingWithdraw: 0,
                    totalEarned: share,
                    totalSpent: 0,
                    totalRefunded: 0,
                    totalWithdrawn: 0,
                    hasDeposit: false,
                    hasPurchase: false,
                    hasPayout: true,
                    userType: 'fighter',
                    updatedAt: serverTimestamp()
                });
            } else {
                tx.update(balanceRef, {
                    available: increment(share),
                    totalEarned: increment(share),
                    hasPayout: true,
                    updatedAt: serverTimestamp()
                });
            }

            // Транзакция участнику
            const txRef = doc(collection(_db, "wallet_transactions"));
            tx.set(txRef, {
                userId: uid,
                userType: 'fighter',
                type: 'season_prize_split',
                amount: share,
                status: 'completed',
                relatedId: seasonId,
                relatedType: 'season_club',
                description: `Доля клуба «${reward.recipientName || clubId}» за ${reward.seasonName || seasonId}`,
                metadata: {
                    seasonId,
                    clubId,
                    place: reward.place,
                    clubTotal: totalAmount,
                    memberFrs: frs,
                    totalFrs
                },
                createdAt: serverTimestamp()
            });
        }

        // Помечаем reward paid
        tx.update(rewardRef, {
            status: 'paid',
            paidAt: serverTimestamp(),
            splitDetails: splits
        });

        // Помечаем клуб
        const clubRef = doc(_db, "clubs", clubId);
        const clubSnap = await tx.get(clubRef);
        if (clubSnap.exists()) {
            const cd = clubSnap.data();
            const claimed = Array.isArray(cd.claimedRewards) ? [...cd.claimedRewards] : [];
            if (!claimed.includes(seasonId)) claimed.push(seasonId);
            tx.update(clubRef, { claimedRewards: claimed });
        }

        return { totalAmount, splits };
    });
}

// ============================================================
// ЭКСПОРТ ДЛЯ ОТЛАДКИ
// ============================================================
export function _debug() {
    return { _db, _auth, _activeSeasonCache };
}