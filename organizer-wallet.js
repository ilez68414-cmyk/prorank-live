// organizer-wallet.js
// ============================================================
// Модуль финансов организатора + эскроу для турниров
// Отдельная роль. Не пересекается с wallet.js (бойцы, партнёры).
// Все операции — через runTransaction (атомарно).
// ============================================================

import {
    getFirestore,
    doc, getDoc, setDoc, updateDoc,
    addDoc, collection,
    query, where, orderBy, limit, getDocs,
    runTransaction,
    increment
} from "firebase/firestore";

const db = getFirestore();

// ============================================================
// КОНСТАНТЫ
// ============================================================

const ORG_SHARE = 0.8;          // 80% организатору
const PLATFORM_SHARE = 0.2;     // 20% платформе
const MIN_WITHDRAWAL = 100;     // минимум вывода
const ESCROW_ACCOUNT = "prorank_escrow"; // виртуальный кошелёк эскроу

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ
// ============================================================

/**
 * Округление до копеек (чтобы не было 0.30000000004)
 */
function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Записать транзакцию в общий журнал
 */
async function logTransaction(data) {
    try {
        await addDoc(collection(db, "wallet_transactions"), {
            ...data,
            createdAt: new Date()
        });
    } catch (err) {
        console.error("Ошибка записи транзакции:", err);
        // Не бросаем — основная операция уже прошла
    }
}

// ============================================================
// БАЗОВЫЕ ФУНКЦИИ ОРГАНИЗАТОРА
// ============================================================

/**
 * Получить баланс организатора
 * @param {string} orgId - ID организации
 * @returns {Promise<Object>} - { available, pending, totalEarned, totalWithdrawn, ... }
 */
export async function getOrganizerBalance(orgId) {
    if (!orgId) return { available: 0, pending: 0, totalEarned: 0, totalWithdrawn: 0 };

    try {
        const ref = doc(db, "wallet_balances", orgId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
            return snap.data();
        }

        // Создаём дефолтный кошелёк
        const defaultBalance = {
            userId: orgId,
            userType: "organizer",
            available: 0,
            pending: 0,
            pendingWithdraw: 0,
            totalEarned: 0,
            totalWithdrawn: 0,
            totalRefunded: 0,
            hasPayout: false,
            updatedAt: new Date()
        };
        await setDoc(ref, defaultBalance);
        return defaultBalance;
    } catch (err) {
        console.error("Ошибка получения баланса организатора:", err);
        return { available: 0, pending: 0, totalEarned: 0, totalWithdrawn: 0 };
    }
}

/**
 * Получить историю транзакций организатора
 * @param {string} orgId
 * @param {number} txLimit
 */
export async function getOrganizerTransactions(orgId, txLimit = 50) {
    if (!orgId) return [];

    try {
        const q = query(
            collection(db, "wallet_transactions"),
            where("userId", "==", orgId),
            where("userType", "==", "organizer"),
            orderBy("createdAt", "desc"),
            limit(txLimit)
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                createdAt: data.createdAt?.toDate() || new Date()
            };
        });
    } catch (err) {
        console.error("Ошибка получения транзакций организатора:", err);
        return [];
    }
}

/**
 * Создать заявку на вывод средств
 * @param {string} orgId
 * @param {number} amount
 * @param {string} method - 'card' | 'sbp'
 * @param {string} details - реквизиты
 */
export async function requestOrganizerWithdrawal(orgId, amount, method, details) {
    if (!orgId) throw new Error("Организация не указана");
    if (!amount || amount < MIN_WITHDRAWAL) throw new Error(`Минимум вывода — ${MIN_WITHDRAWAL} ₽`);
    if (!details) throw new Error("Укажите реквизиты для вывода");

    const balanceRef = doc(db, "wallet_balances", orgId);

    // 1. Резервируем средства атомарно
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(balanceRef);
        if (!snap.exists()) throw new Error("Кошелёк не найден");

        const data = snap.data();
        const available = data.available || 0;

        if (available < amount) {
            throw new Error(`Недостаточно средств. Доступно: ${available} ₽`);
        }

        tx.update(balanceRef, {
            available: round2(available - amount),
            pendingWithdraw: round2((data.pendingWithdraw || 0) + amount),
            updatedAt: new Date()
        });
    });

    // 2. Создаём заявку
    const withdrawalRef = await addDoc(collection(db, "withdrawals"), {
        userId: orgId,
        userType: "organizer",
        amount,
        method,
        details,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date()
    });

    // 3. Транзакция в журнал
    await logTransaction({
        userId: orgId,
        userType: "organizer",
        type: "withdrawal",
        amount,
        status: "pending",
        withdrawalId: withdrawalRef.id,
        description: `Заявка на вывод ${amount} ₽ (${method})`
    });

    return { id: withdrawalRef.id, status: "pending" };
}

// ============================================================
// ЭСКРОУ И ТУРНИРНЫЕ ОПЕРАЦИИ
// ============================================================

/**
 * Получить текущий эскроу турнира
 */
export async function getEscrowBalance(tournamentId) {
    if (!tournamentId) return 0;
    try {
        const ref = doc(db, "tournaments", tournamentId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return 0;
        return snap.data().escrowAmount || 0;
    } catch (err) {
        console.error("Ошибка получения эскроу:", err);
        return 0;
    }
}

/**
 * 1. БОЕЦ ПЛАТИТ ВЗНОС
 *    Списываем с бойца, кладём в эскроу турнира
 *
 * @param {string} fighterId
 * @param {number} amount
 * @param {string} tournamentId
 * @param {string} tournamentName
 * @param {string} organizationId
 * @param {string} fighterName
 */
export async function payTournamentEntry(
    fighterId, amount, tournamentId, tournamentName, organizationId, fighterName
) {
    if (!fighterId || !amount || amount <= 0 || !tournamentId) {
        throw new Error("Неверные параметры оплаты");
    }

    // 🔧 ФИКС: защита от двойной записи
    try {
        const existingRegs = await getDocs(query(
            collection(db, "tournament_registrations"),
            where("tournamentId", "==", tournamentId),
            where("fighterId", "==", fighterId)
        ));
        const active = existingRegs.docs.find(d => {
            const s = d.data().status;
            return s === 'pending' || s === 'approved';
        });
        if (active) {
            throw new Error("Вы уже записаны на этот турнир");
        }
    } catch (e) {
        if (e.message === "Вы уже записаны на этот турнир") throw e;
        // Если запрос упал по другой причине (индексы и т.п.) — логируем, но не блокируем
        console.warn("⚠️ payTournamentEntry: не удалось проверить дубликат", e);
    }

    // 🔧 ФИКС: запрет для забаненных бойцов
    try {
        const fighterDoc = await getDoc(doc(db, "fighters", fighterId));
        if (fighterDoc.exists() && fighterDoc.data().banned === true) {
            throw new Error("Ваш аккаунт заблокирован");
        }
    } catch (e) {
        if (e.message === "Ваш аккаунт заблокирован") throw e;
        console.warn("⚠️ payTournamentEntry: не удалось проверить бан", e);
    }

    const fighterRef = doc(db, "wallet_balances", fighterId);
    const escrowRef = doc(db, "wallet_balances", ESCROW_ACCOUNT);
    const tournamentRef = doc(db, "tournaments", tournamentId);
    
    await runTransaction(db, async (tx) => {
        // 1. Проверяем бойца
        const fighterSnap = await tx.get(fighterRef);
        if (!fighterSnap.exists()) throw new Error("Кошелёк бойца не найден");

        const fighterData = fighterSnap.data();
        const fighterAvailable = fighterData.available || 0;

        if (fighterAvailable < amount) {
            throw new Error(`Недостаточно средств. Доступно: ${fighterAvailable} ₽`);
        }

        // 2. Проверяем турнир
        const tournamentSnap = await tx.get(tournamentRef);
        if (!tournamentSnap.exists()) throw new Error("Турнир не найден");

        const tournamentData = tournamentSnap.data();
        if (tournamentData.status !== "registration") {
            throw new Error("Приём оплаты закрыт — турнир уже начался");
        }
        if (tournamentData.paidOutToOrganizer) {
            throw new Error("Оплата уже была выплачена организатору");
        }

        // 3. Проверяем эскроу-счёт
        const escrowSnap = await tx.get(escrowRef);
        const escrowData = escrowSnap.exists()
            ? escrowSnap.data()
            : { available: 0, totalDeposited: 0, totalReleased: 0, totalRefunded: 0 };

        // 4. Списываем с бойца
        tx.update(fighterRef, {
            available: round2(fighterAvailable - amount),
            totalSpent: round2((fighterData.totalSpent || 0) + amount),
            hasPurchase: true,
            updatedAt: new Date()
        });

        // 5. Кладём в эскроу
        tx.set(escrowRef, {
            userId: ESCROW_ACCOUNT,
            userType: "system",
            available: round2((escrowData.available || 0) + amount),
            totalDeposited: round2((escrowData.totalDeposited || 0) + amount),
            totalReleased: escrowData.totalReleased || 0,
            totalRefunded: escrowData.totalRefunded || 0,
            updatedAt: new Date()
        }, { merge: true });

        // 6. Увеличиваем эскроу турнира
        tx.update(tournamentRef, {
            escrowAmount: round2((tournamentData.escrowAmount || 0) + amount),
            escrowHistory: [
                ...(tournamentData.escrowHistory || []),
                {
                    action: "entry",
                    fighterId,
                    fighterName: fighterName || "Боец",
                    amount,
                    at: new Date().toISOString()
                }
            ],
            updatedAt: new Date().toISOString()
        });
    });

    // 7. Транзакции в журнал (после успешной атомарной операции)
    await logTransaction({
        userId: fighterId,
        userType: "fighter",
        type: "tournament_entry",
        amount: -amount,
        status: "completed",
        relatedId: tournamentId,
        relatedType: "tournament",
        metadata: {
            tournamentName,
            organizationId,
            description: "Оплата взноса за турнир"
        },
        description: `Взнос за турнир «${tournamentName}»`
    });

    await logTransaction({
        userId: ESCROW_ACCOUNT,
        userType: "system",
        type: "escrow_hold",
        amount,
        status: "completed",
        relatedId: tournamentId,
        relatedType: "tournament",
        metadata: { tournamentName, fighterId, fighterName },
        description: `Эскроу: взнос от ${fighterName || "бойца"} за «${tournamentName}»`
    });

    return { success: true, amount };
}

/**
 * 2. ВОЗВРАТ БОЙЦУ С ЭСКРОУ (до старта турнира)
 *    Списываем с эскроу, кладём обратно бойцу
 *
 * @param {string} fighterId
 * @param {number} amount
 * @param {string} tournamentId
 * @param {string} reason
 */
export async function refundTournamentEntry(fighterId, amount, tournamentId, reason = "Возврат взноса") {
    if (!fighterId || !amount || amount <= 0 || !tournamentId) {
        throw new Error("Неверные параметры возврата");
    }

    const fighterRef = doc(db, "wallet_balances", fighterId);
    const escrowRef = doc(db, "wallet_balances", ESCROW_ACCOUNT);
    const tournamentRef = doc(db, "tournaments", tournamentId);

    await runTransaction(db, async (tx) => {
        // 1. Проверяем эскроу
        const escrowSnap = await tx.get(escrowRef);
        if (!escrowSnap.exists()) throw new Error("Эскроу-счёт не найден");

        const escrowData = escrowSnap.data();
        const escrowAvailable = escrowData.available || 0;

        if (escrowAvailable < amount) {
            throw new Error("Недостаточно средств в эскроу");
        }

        // 2. Проверяем турнир
        const tournamentSnap = await tx.get(tournamentRef);
        if (!tournamentSnap.exists()) throw new Error("Турнир не найден");

        const tournamentData = tournamentSnap.data();

        // ❗ Возврат только до старта
        if (tournamentData.status === "active" || tournamentData.status === "completed") {
            throw new Error("Возврат невозможен — турнир уже начался");
        }

        const currentEscrow = tournamentData.escrowAmount || 0;
        if (currentEscrow < amount) {
            throw new Error("В эскроу турнира недостаточно средств");
        }

        // 3. Проверяем бойца (может не быть кошелька — создаём)
        const fighterSnap = await tx.get(fighterRef);
        const fighterData = fighterSnap.exists()
            ? fighterSnap.data()
            : { available: 0, totalRefunded: 0 };

        // 4. Возвращаем бойцу
        tx.set(fighterRef, {
            userId: fighterId,
            userType: "fighter",
            available: round2((fighterData.available || 0) + amount),
            totalRefunded: round2((fighterData.totalRefunded || 0) + amount),
            updatedAt: new Date()
        }, { merge: true });

        // 5. Списываем с эскроу
        tx.update(escrowRef, {
            available: round2(escrowAvailable - amount),
            totalRefunded: round2((escrowData.totalRefunded || 0) + amount),
            updatedAt: new Date()
        });

        // 6. Уменьшаем эскроу турнира
        tx.update(tournamentRef, {
            escrowAmount: round2(currentEscrow - amount),
            escrowHistory: [
                ...(tournamentData.escrowHistory || []),
                {
                    action: "refund",
                    fighterId,
                    amount,
                    reason,
                    at: new Date().toISOString()
                }
            ],
            updatedAt: new Date().toISOString()
        });
    });

    // 7. Транзакции в журнал
    await logTransaction({
        userId: fighterId,
        userType: "fighter",
        type: "tournament_refund",
        amount: amount,
        status: "completed",
        relatedId: tournamentId,
        relatedType: "tournament",
        description: reason
    });

    await logTransaction({
        userId: ESCROW_ACCOUNT,
        userType: "system",
        type: "escrow_release",
        amount: -amount,
        status: "completed",
        relatedId: tournamentId,
        relatedType: "tournament",
        description: `Эскроу: возврат бойцу (${reason})`
    });

    return { success: true, amount };
}

/**
 * 3. ОТМЕНА ТУРНИРА — возврат всем бойцам
 *    Организатор отменяет турнир (только в статусе registration)
 *
 * @param {string} tournamentId
 * @param {string} reason
 */
export async function refundAllFromTournament(tournamentId, reason = "Турнир отменён") {
    if (!tournamentId) throw new Error("Tournament ID is required");

    // 1. Загружаем все заявки с оплатой
    const regQuery = query(
        collection(db, "tournament_registrations"),
        where("tournamentId", "==", tournamentId),
        where("paymentStatus", "==", "paid")
    );
    const regSnap = await getDocs(regQuery);
    const registrations = regSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!registrations.length) {
        // Нечего возвращать, но статус всё равно меняем
        await updateDoc(doc(db, "tournaments", tournamentId), {
            status: "cancelled",
            cancelledAt: new Date().toISOString(),
            cancelReason: reason
        });
        return { refunded: 0 };
    }

    // 2. Возвращаем каждого
    let refunded = 0;
    const errors = [];

    for (const reg of registrations) {
        try {
            await refundTournamentEntry(
                reg.fighterId,
                reg.paymentAmount || 0,
                tournamentId,
                reason
            );
            refunded++;
        } catch (err) {
            console.error(`Ошибка возврата ${reg.fighterId}:`, err);
            errors.push({ fighterId: reg.fighterId, error: err.message });
        }
    }

    // 3. Меняем статус турнира
    await updateDoc(doc(db, "tournaments", tournamentId), {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelReason: reason
    });

    return { refunded, errors };
}

/**
 * 4. ВЫПЛАТА ОРГАНИЗАТОРУ ПРИ СТАРТЕ ТУРНИРА
 *    80% → организатору, 20% → PRORANK
 *    Эскроу обнуляется
 *
 * @param {string} organizerId - organizationId
 * @param {string} tournamentId
 * @param {string} tournamentName
 */
export async function payoutTournamentToOrganizer(organizerId, tournamentId, tournamentName) {
    if (!organizerId || !tournamentId) {
        throw new Error("Неверные параметры выплаты");
    }

    const tournamentRef = doc(db, "tournaments", tournamentId);
    const organizerRef = doc(db, "wallet_balances", organizerId);
    const escrowRef = doc(db, "wallet_balances", ESCROW_ACCOUNT);
    const platformRef = doc(db, "wallet_balances", "prorank_system");

    let totalAmount = 0;
    let organizerAmount = 0;
    let platformAmount = 0;

    await runTransaction(db, async (tx) => {
        // 1. Проверяем турнир
        const tournamentSnap = await tx.get(tournamentRef);
        if (!tournamentSnap.exists()) throw new Error("Турнир не найден");

        const tournamentData = tournamentSnap.data();

        // ❗ Защита от двойной выплаты
        if (tournamentData.paidOutToOrganizer) {
            throw new Error("Выплата уже была произведена ранее");
        }
        if (tournamentData.status !== "registration" && tournamentData.status !== "scheduled") {
            throw new Error("Выплата возможна только при старте турнира");
        }

        totalAmount = round2(tournamentData.escrowAmount || 0);
        if (totalAmount <= 0) {
            throw new Error("Нет средств для выплаты");
        }

        organizerAmount = round2(totalAmount * ORG_SHARE);
        platformAmount = round2(totalAmount * PLATFORM_SHARE);

        // 2. Проверяем эскроу
        const escrowSnap = await tx.get(escrowRef);
        if (!escrowSnap.exists()) throw new Error("Эскроу-счёт не найден");

        const escrowData = escrowSnap.data();
        if ((escrowData.available || 0) < totalAmount) {
            throw new Error("Недостаточно средств в общем эскроу");
        }

        // 3. Проверяем организатора
        const orgSnap = await tx.get(organizerRef);
        const orgData = orgSnap.exists()
            ? orgSnap.data()
            : { available: 0, totalEarned: 0, userType: "organizer" };

        // 4. Проверяем платформу
        const platformSnap = await tx.get(platformRef);
        const platformData = platformSnap.exists()
            ? platformSnap.data()
            : { available: 0, totalEarned: 0 };

        // 5. Зачисляем организатору 80%
        tx.set(organizerRef, {
            userId: organizerId,
            userType: "organizer",
            available: round2((orgData.available || 0) + organizerAmount),
            totalEarned: round2((orgData.totalEarned || 0) + organizerAmount),
            hasPayout: true,
            updatedAt: new Date()
        }, { merge: true });

        // 6. Зачисляем платформе 20%
        tx.set(platformRef, {
            userId: "prorank_system",
            userType: "system",
            available: round2((platformData.available || 0) + platformAmount),
            totalEarned: round2((platformData.totalEarned || 0) + platformAmount),
            updatedAt: new Date()
        }, { merge: true });

        // 7. Списываем с эскроу
        tx.update(escrowRef, {
            available: round2((escrowData.available || 0) - totalAmount),
            totalReleased: round2((escrowData.totalReleased || 0) + totalAmount),
            updatedAt: new Date()
        });

        // 8. Обнуляем эскроу турнира + ставим флаг
        tx.update(tournamentRef, {
            escrowAmount: 0,
            paidOutToOrganizer: true,
            paidOutAt: new Date().toISOString(),
            organizerIncome: organizerAmount,
            platformFee: platformAmount,
            updatedAt: new Date().toISOString()
        });
    });

    // 9. Транзакции в журнал
    await logTransaction({
        userId: organizerId,
        userType: "organizer",
        type: "organizer_payout",
        amount: organizerAmount,
        status: "completed",
        relatedId: tournamentId,
        relatedType: "tournament",
        metadata: { tournamentName, share: "80%" },
        description: `Выплата 80% за турнир «${tournamentName}»`
    });

    await logTransaction({
        userId: "prorank_system",
        userType: "system",
        type: "platform_fee",
        amount: platformAmount,
        status: "completed",
        relatedId: tournamentId,
        relatedType: "tournament",
        metadata: { tournamentName, share: "20%", organizerId },
        description: `Комиссия платформы 20% за «${tournamentName}»`
    });

    await logTransaction({
        userId: ESCROW_ACCOUNT,
        userType: "system",
        type: "escrow_release",
        amount: -totalAmount,
        status: "completed",
        relatedId: tournamentId,
        relatedType: "tournament",
        metadata: { tournamentName, organizerAmount, platformAmount },
        description: `Раскрытие эскроу турнира «${tournamentName}»`
    });

    return {
        success: true,
        totalAmount,
        organizerAmount,
        platformAmount
    };
}

// ============================================================
// ЭКСПОРТ ВСЕГО НЕОБХОДИМОГО
// ============================================================

export const OrganizerWallet = {
    // Базовое
    getBalance: getOrganizerBalance,
    getTransactions: getOrganizerTransactions,
    requestWithdrawal: requestOrganizerWithdrawal,

    // Эскроу и турниры
    getEscrowBalance,
    payEntry: payTournamentEntry,
    refundEntry: refundTournamentEntry,
    refundAll: refundAllFromTournament,
    payoutToOrganizer: payoutTournamentToOrganizer,

    // Константы
    ORG_SHARE,
    PLATFORM_SHARE,
    MIN_WITHDRAWAL,
    ESCROW_ACCOUNT
};