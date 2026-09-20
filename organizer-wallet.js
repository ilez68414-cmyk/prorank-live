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
const ORG_SHARE = 0.8;
const PLATFORM_SHARE = 0.2;
const MIN_WITHDRAWAL = 100;
const ESCROW_ACCOUNT = "prorank_escrow";
const PLATFORM_ACCOUNT = "prorank_system";

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ЭСКРОУ
// Вызывать один раз при деплое — создаст документ, если его нет
// ============================================================
export async function ensureEscrowAccount() {
    const escrowRef = doc(db, "wallet_balances", ESCROW_ACCOUNT);
    const snap = await getDoc(escrowRef);
    if (!snap.exists()) {
        await setDoc(escrowRef, {
            userId: ESCROW_ACCOUNT,
            userType: "system",
            available: 0,
            totalDeposited: 0,
            totalReleased: 0,
            totalRefunded: 0,
            updatedAt: new Date()
        });
    }
    const platformRef = doc(db, "wallet_balances", PLATFORM_ACCOUNT);
    const psnap = await getDoc(platformRef);
    if (!psnap.exists()) {
        await setDoc(platformRef, {
            userId: PLATFORM_ACCOUNT,
            userType: "system",
            available: 0,
            totalEarned: 0,
            updatedAt: new Date()
        });
    }
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ
// ============================================================
async function logTransaction(data) {
    try {
        await addDoc(collection(db, "wallet_transactions"), {
            ...data,
            createdAt: new Date()
        });
    } catch (err) {
        console.error("Ошибка записи транзакции:", err);
    }
}

// ============================================================
// БАЗОВЫЕ ФУНКЦИИ ОРГАНИЗАТОРА
// ============================================================
export async function getOrganizerBalance(orgId) {
    if (!orgId) return { available: 0, pending: 0, totalEarned: 0, totalWithdrawn: 0 };
    try {
        const ref = doc(db, "wallet_balances", orgId);
        const snap = await getDoc(ref);
        if (snap.exists()) return snap.data();
        const defaultBalance = {
            userId: orgId, userType: "organizer",
            available: 0, pending: 0, pendingWithdraw: 0,
            totalEarned: 0, totalWithdrawn: 0, totalRefunded: 0,
            hasPayout: false, updatedAt: new Date()
        };
        await setDoc(ref, defaultBalance);
        return defaultBalance;
    } catch (err) {
        console.error("Ошибка получения баланса организатора:", err);
        return { available: 0, pending: 0, totalEarned: 0, totalWithdrawn: 0 };
    }
}

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
            return { id: d.id, ...data, createdAt: data.createdAt?.toDate() || new Date() };
        });
    } catch (err) {
        console.error("Ошибка получения транзакций организатора:", err);
        return [];
    }
}

export async function requestOrganizerWithdrawal(orgId, amount, method, details) {
    if (!orgId) throw new Error("Организация не указана");
    if (!amount || amount < MIN_WITHDRAWAL) throw new Error(`Минимум вывода — ${MIN_WITHDRAWAL} ₽`);
    if (!details) throw new Error("Укажите реквизиты для вывода");

    const balanceRef = doc(db, "wallet_balances", orgId);

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(balanceRef);
        if (!snap.exists()) throw new Error("Кошелёк не найден");
        const data = snap.data();
        const available = data.available || 0;
        if (available < amount) throw new Error(`Недостаточно средств. Доступно: ${available} ₽`);
        tx.update(balanceRef, {
            available: round2(available - amount),
            pendingWithdraw: round2((data.pendingWithdraw || 0) + amount),
            updatedAt: new Date()
        });
    });

    const withdrawalRef = await addDoc(collection(db, "withdrawals"), {
        userId: orgId, userType: "organizer",
        amount, method, details, status: "pending",
        createdAt: new Date(), updatedAt: new Date()
    });

    await logTransaction({
        userId: orgId, userType: "organizer",
        type: "withdrawal", amount, status: "pending",
        withdrawalId: withdrawalRef.id,
        description: `Заявка на вывод ${amount} ₽ (${method})`
    });

    return { id: withdrawalRef.id, status: "pending" };
}

// ============================================================
// ЭСКРОУ
// ============================================================
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

// ============================================================
// 🔧 ФИКС: РЕГИСТРАЦИЯ + ОПЛАТА — ОДНА АТОМАРНАЯ ОПЕРАЦИЯ
//
// Что делаем внутри одной транзакции:
//   1. Проверяем турнир (существует, открыт набор, есть места)
//   2. Проверяем дубль (по детерминированному ID)
//   3. Проверяем баланс бойца
//   4. Списываем у бойца
//   5. Кладём в общий эскроу
//   6. Увеличиваем escrowAmount турнира
//   7. Увеличиваем participantCount
//   8. Создаём регистрацию
//
// Всё — либо сработает целиком, либо не сработает вообще.
// ============================================================
export async function payTournamentEntry(params) {
    const {
        fighterId, fighterName, fighterWeight, fighterClub,
        amount, tournamentId, tournamentName,
        organizationId, weightClass, ageGroup, paymentMethod
    } = params || {};

    if (!fighterId || !tournamentId) throw new Error("Не указан боец или турнир");
    if (amount == null || amount < 0) throw new Error("Неверная сумма взноса");

    const regId = `${fighterId}_${tournamentId}`;
    const regRef = doc(db, "tournament_registrations", regId);
    const fighterRef = doc(db, "wallet_balances", fighterId);
    const escrowRef = doc(db, "wallet_balances", ESCROW_ACCOUNT);
    const tournamentRef = doc(db, "tournaments", tournamentId);

    await runTransaction(db, async (tx) => {
        // 1. Читаем всё параллельно
        const [tournamentSnap, regSnap, fighterSnap, escrowSnap] = await Promise.all([
            tx.get(tournamentRef),
            tx.get(regRef),
            tx.get(fighterRef),
            tx.get(escrowRef)
        ]);

        // 2. Турнир
        if (!tournamentSnap.exists()) throw new Error("Турнир не найден");
        const t = tournamentSnap.data();

        if (t.status !== "registration") throw new Error("Набор закрыт — турнир уже начался");
        if (t.paidOutToOrganizer) throw new Error("Оплата уже была выплачена организатору");
        if (t.deleted) throw new Error("Турнир удалён");

        const participantCount = t.participantCount || 0;
        const maxParticipants = t.maxParticipants || 0;
        if (maxParticipants > 0 && participantCount >= maxParticipants) {
            throw new Error(`Мест нет. Максимум: ${maxParticipants}`);
        }

        // 3. Дубль регистрации
        if (regSnap.exists()) {
            const r = regSnap.data();
            if (r.status === 'approved' || r.status === 'pending') {
                throw new Error("Вы уже записаны на этот турнир");
            }
        }

        // 4. Кошелёк бойца
        if (!fighterSnap.exists()) throw new Error("Кошелёк бойца не найден");
        const fighterData = fighterSnap.data();
        const fighterAvailable = fighterData.available || 0;
        if (fighterAvailable < amount) {
            throw new Error(`Недостаточно средств. Доступно: ${fighterAvailable} ₽, нужно: ${amount} ₽`);
        }

        // 5. Эскроу (создаём если нет)
        const escrowData = escrowSnap.exists()
            ? escrowSnap.data()
            : { available: 0, totalDeposited: 0, totalReleased: 0, totalRefunded: 0 };

        // 6. Списываем с бойца
        tx.update(fighterRef, {
            available: round2(fighterAvailable - amount),
            totalSpent: round2((fighterData.totalSpent || 0) + amount),
            updatedAt: new Date()
        });

        // 7. Кладём в общий эскроу
        tx.set(escrowRef, {
            userId: ESCROW_ACCOUNT,
            userType: "system",
            available: round2((escrowData.available || 0) + amount),
            totalDeposited: round2((escrowData.totalDeposited || 0) + amount),
            totalReleased: escrowData.totalReleased || 0,
            totalRefunded: escrowData.totalRefunded || 0,
            updatedAt: new Date()
        }, { merge: true });

        // 8. Увеличиваем эскроу турнира и счётчик участников
        tx.update(tournamentRef, {
            escrowAmount: round2((t.escrowAmount || 0) + amount),
            participantCount: participantCount + 1,
            updatedAt: new Date().toISOString()
        });

        // 9. Создаём регистрацию
        tx.set(regRef, {
            tournamentId,
            organizationId: organizationId || t.organizationId || null,
            fighterId,
            fighterName: fighterName || "Боец",
            fighterWeight: fighterWeight || null,
            fighterClub: fighterClub || null,
            weightClass: weightClass || null,
            ageGroup: ageGroup || null,
            status: "approved",
            paymentStatus: amount > 0 ? "paid" : "free",
            paymentAmount: amount,
            paymentMethod: paymentMethod || "balance",
            processedAt: new Date().toISOString(),
            processedBy: "system",
            createdAt: new Date().toISOString()
        });
    });

    // 10. Журнал (после успешной транзакции)
    await logTransaction({
        userId: fighterId, userType: "fighter",
        type: "tournament_entry", amount: -amount, status: "completed",
        relatedId: tournamentId, relatedType: "tournament",
        metadata: { tournamentName, organizationId },
        description: `Взнос за турнир «${tournamentName || ''}»`
    });
    await logTransaction({
        userId: ESCROW_ACCOUNT, userType: "system",
        type: "escrow_hold", amount, status: "completed",
        relatedId: tournamentId, relatedType: "tournament",
        metadata: { tournamentName, fighterId, fighterName },
        description: `Эскроу: взнос от ${fighterName || "бойца"}`
    });

    return { success: true, amount };
}

// ============================================================
// 🔧 ФИКС: ВОЗВРАТ — читаем сумму из регистрации, не из аргумента
// Идемпотентно: если уже возвращено — ничего не делаем
// ============================================================
export async function refundTournamentEntry(fighterId, tournamentId, reason = "Возврат взноса") {
    if (!fighterId || !tournamentId) throw new Error("Не указан боец или турнир");

    const regId = `${fighterId}_${tournamentId}`;
    const regRef = doc(db, "tournament_registrations", regId);
    const fighterRef = doc(db, "wallet_balances", fighterId);
    const escrowRef = doc(db, "wallet_balances", ESCROW_ACCOUNT);
    const tournamentRef = doc(db, "tournaments", tournamentId);

    let refundedAmount = 0;

    await runTransaction(db, async (tx) => {
        const [regSnap, fighterSnap, escrowSnap, tournamentSnap] = await Promise.all([
            tx.get(regRef),
            tx.get(fighterRef),
            tx.get(escrowRef),
            tx.get(tournamentRef)
        ]);

        if (!regSnap.exists()) throw new Error("Регистрация не найдена");
        const reg = regSnap.data();

        // Идемпотентность
        if (reg.paymentStatus === 'refunded') {
            refundedAmount = 0;
            return;
        }
        if (reg.paymentStatus !== 'paid' || !(reg.paymentAmount > 0)) {
            refundedAmount = 0;
            return;
        }

        const amount = round2(reg.paymentAmount);
        refundedAmount = amount;

        if (!tournamentSnap.exists()) throw new Error("Турнир не найден");
        const t = tournamentSnap.data();
        if (t.status === 'active' || t.status === 'completed') {
            throw new Error("Возврат невозможен — турнир уже начался");
        }

        const currentTournamentEscrow = t.escrowAmount || 0;
        if (currentTournamentEscrow < amount) {
            throw new Error("В эскроу турнира недостаточно средств");
        }

        const escrowData = escrowSnap.exists()
            ? escrowSnap.data()
            : { available: 0, totalDeposited: 0, totalReleased: 0, totalRefunded: 0 };

        const fighterData = fighterSnap.exists()
            ? fighterSnap.data()
            : { available: 0, totalRefunded: 0 };

        // 1. Возвращаем бойцу
        tx.set(fighterRef, {
            userId: fighterId, userType: "fighter",
            available: round2((fighterData.available || 0) + amount),
            totalRefunded: round2((fighterData.totalRefunded || 0) + amount),
            updatedAt: new Date()
        }, { merge: true });

        // 2. Списываем с общего эскроу
        tx.set(escrowRef, {
            userId: ESCROW_ACCOUNT, userType: "system",
            available: round2((escrowData.available || 0) - amount),
            totalDeposited: escrowData.totalDeposited || 0,
            totalReleased: escrowData.totalReleased || 0,
            totalRefunded: round2((escrowData.totalRefunded || 0) + amount),
            updatedAt: new Date()
        }, { merge: true });

        // 3. Уменьшаем эскроу турнира + счётчик
        const newParticipantCount = Math.max(0, (t.participantCount || 0) - 1);
        tx.update(tournamentRef, {
            escrowAmount: round2(currentTournamentEscrow - amount),
            participantCount: newParticipantCount,
            updatedAt: new Date().toISOString()
        });

        // 4. Помечаем регистрацию
        tx.update(regRef, {
            paymentStatus: 'refunded',
            status: 'refunded',
            refundedAt: new Date().toISOString(),
            refundReason: reason
        });
    });

    if (refundedAmount > 0) {
        await logTransaction({
            userId: fighterId, userType: "fighter",
            type: "tournament_refund", amount: refundedAmount, status: "completed",
            relatedId: tournamentId, relatedType: "tournament",
            description: reason
        });
        await logTransaction({
            userId: ESCROW_ACCOUNT, userType: "system",
            type: "escrow_release", amount: -refundedAmount, status: "completed",
            relatedId: tournamentId, relatedType: "tournament",
            description: `Эскроу: возврат (${reason})`
        });
    }

    return { success: true, amount: refundedAmount };
}

// ============================================================
// ВОЗВРАТ ВСЕХ (отмена турнира)
// ============================================================
export async function refundAllFromTournament(tournamentId, reason = "Турнир отменён") {
    if (!tournamentId) throw new Error("Tournament ID is required");

    const regQuery = query(
        collection(db, "tournament_registrations"),
        where("tournamentId", "==", tournamentId),
        where("paymentStatus", "==", "paid")
    );
    const regSnap = await getDocs(regQuery);
    const registrations = regSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    let refunded = 0;
    const errors = [];
    for (const reg of registrations) {
        try {
            const res = await refundTournamentEntry(reg.fighterId, tournamentId, reason);
            if (res.amount > 0) refunded++;
        } catch (err) {
            console.error(`Ошибка возврата ${reg.fighterId}:`, err);
            errors.push({ fighterId: reg.fighterId, error: err.message });
        }
    }

    await updateDoc(doc(db, "tournaments", tournamentId), {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelReason: reason
    });

    return { refunded, errors };
}

// ============================================================
// 🔧 ФИКС: ВЫПЛАТА ПРИ СТАРТЕ
//
// Работает ТОЛЬКО с tournament.escrowAmount.
// Общий эскроу — агрегат, для отображения.
// Если организатор не найден — кидаем понятную ошибку.
// Защита от двойной выплаты — флаг внутри транзакции.
// ============================================================
export async function payoutTournamentToOrganizer(organizerId, tournamentId, tournamentName) {
    if (!organizerId) throw new Error("Не указан организатор (organizationId пустой)");
    if (!tournamentId) throw new Error("Не указан турнир");

    const tournamentRef = doc(db, "tournaments", tournamentId);
    const organizerRef = doc(db, "wallet_balances", organizerId);
    const escrowRef = doc(db, "wallet_balances", ESCROW_ACCOUNT);
    const platformRef = doc(db, "wallet_balances", PLATFORM_ACCOUNT);

    let totalAmount = 0, organizerAmount = 0, platformAmount = 0;

    await runTransaction(db, async (tx) => {
        const [tournamentSnap, orgSnap, escrowSnap, platformSnap] = await Promise.all([
            tx.get(tournamentRef),
            tx.get(organizerRef),
            tx.get(escrowRef),
            tx.get(platformRef)
        ]);

        if (!tournamentSnap.exists()) throw new Error("Турнир не найден");
        const t = tournamentSnap.data();

        if (t.paidOutToOrganizer) throw new Error("Выплата уже была произведена");
        if (t.status !== "registration" && t.status !== "scheduled") {
            throw new Error("Выплата возможна только при старте турнира");
        }

        totalAmount = round2(t.escrowAmount || 0);
        if (totalAmount <= 0) throw new Error("Нет средств для выплаты (эскроу турнира пуст)");

        organizerAmount = round2(totalAmount * ORG_SHARE);
        platformAmount = round2(totalAmount * PLATFORM_SHARE);

        const orgData = orgSnap.exists() ? orgSnap.data() : { available: 0, totalEarned: 0 };
        const platformData = platformSnap.exists() ? platformSnap.data() : { available: 0, totalEarned: 0 };
        const escrowData = escrowSnap.exists() ? escrowSnap.data() : { available: 0, totalDeposited: 0, totalReleased: 0, totalRefunded: 0 };

        // 1. Организатору 80%
        tx.set(organizerRef, {
            userId: organizerId, userType: "organizer",
            available: round2((orgData.available || 0) + organizerAmount),
            totalEarned: round2((orgData.totalEarned || 0) + organizerAmount),
            hasPayout: true,
            updatedAt: new Date()
        }, { merge: true });

        // 2. Платформе 20%
        tx.set(platformRef, {
            userId: PLATFORM_ACCOUNT, userType: "system",
            available: round2((platformData.available || 0) + platformAmount),
            totalEarned: round2((platformData.totalEarned || 0) + platformAmount),
            updatedAt: new Date()
        }, { merge: true });

        // 3. Списываем с общего эскроу
        tx.set(escrowRef, {
            userId: ESCROW_ACCOUNT, userType: "system",
            available: round2((escrowData.available || 0) - totalAmount),
            totalDeposited: escrowData.totalDeposited || 0,
            totalReleased: round2((escrowData.totalReleased || 0) + totalAmount),
            totalRefunded: escrowData.totalRefunded || 0,
            updatedAt: new Date()
        }, { merge: true });

        // 4. Обнуляем эскроу турнира + флаги
        tx.update(tournamentRef, {
            escrowAmount: 0,
            paidOutToOrganizer: true,
            paidOutAt: new Date().toISOString(),
            organizerIncome: organizerAmount,
            platformFee: platformAmount,
            updatedAt: new Date().toISOString()
        });
    });

    await logTransaction({
        userId: organizerId, userType: "organizer",
        type: "organizer_payout", amount: organizerAmount, status: "completed",
        relatedId: tournamentId, relatedType: "tournament",
        metadata: { tournamentName, share: "80%" },
        description: `Выплата 80% за «${tournamentName || ''}»`
    });
    await logTransaction({
        userId: PLATFORM_ACCOUNT, userType: "system",
        type: "platform_fee", amount: platformAmount, status: "completed",
        relatedId: tournamentId, relatedType: "tournament",
        metadata: { tournamentName, share: "20%", organizerId },
        description: `Комиссия 20% за «${tournamentName || ''}»`
    });
    await logTransaction({
        userId: ESCROW_ACCOUNT, userType: "system",
        type: "escrow_release", amount: -totalAmount, status: "completed",
        relatedId: tournamentId, relatedType: "tournament",
        metadata: { tournamentName, organizerAmount, platformAmount },
        description: `Раскрытие эскроу «${tournamentName || ''}»`
    });

    return { success: true, totalAmount, organizerAmount, platformAmount };
}

// ============================================================
// ЭКСПОРТ
// ============================================================
export const OrganizerWallet = {
    ensureEscrowAccount,
    getBalance: getOrganizerBalance,
    getTransactions: getOrganizerTransactions,
    requestWithdrawal: requestOrganizerWithdrawal,
    getEscrowBalance,
    payEntry: payTournamentEntry,
    refundEntry: refundTournamentEntry,
    refundAll: refundAllFromTournament,
    payoutToOrganizer: payoutTournamentToOrganizer,
    ORG_SHARE, PLATFORM_SHARE, MIN_WITHDRAWAL, ESCROW_ACCOUNT
};