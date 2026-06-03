// wallet.js - Полностью исправленная версия

import { getFirestore, doc, getDoc, updateDoc, addDoc, collection, runTransaction } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const db = getFirestore();
const auth = getAuth();

// Получить баланс пользователя
export async function getWalletBalance(userId) {
    try {
        const balanceDoc = await getDoc(doc(db, "wallet_balances", userId));
        if (balanceDoc.exists()) {
            return balanceDoc.data();
        }
        // Создаём баланс по умолчанию
        const defaultBalance = {
            userId: userId,
            userType: "fighter",
            available: 0,
            pending: 0,
            totalEarned: 0,
            totalWithdrawn: 0,
            totalSpent: 0,
            updatedAt: new Date()
        };
        await setDoc(doc(db, "wallet_balances", userId), defaultBalance);
        return defaultBalance;
    } catch (err) {
        console.error("Ошибка получения баланса:", err);
        return { available: 0, pending: 0, totalEarned: 0, totalWithdrawn: 0 };
    }
}

// Проверить достаточно ли средств
export async function hasSufficientBalance(userId, amount) {
    const balance = await getWalletBalance(userId);
    return (balance.available || 0) >= amount;
}

// Списать средства (при оплате с баланса)
export async function deductFunds(userId, amount, orderId) {
    const balanceRef = doc(db, "wallet_balances", userId);
    const balanceDoc = await getDoc(balanceRef);
    const currentBalance = balanceDoc.exists() ? balanceDoc.data() : { available: 0 };
    
    await updateDoc(balanceRef, {
        available: (currentBalance.available || 0) - amount,
        updatedAt: new Date()
    });
    
    await addDoc(collection(db, "wallet_transactions"), {
        userId: userId,
        userType: "fighter",
        type: "payment",
        amount: amount,
        status: "completed",
        orderId: orderId,
        description: `Оплата заказа ${orderId.slice(0, 8)}`,
        createdAt: new Date()
    });
}

// Заморозить средства (холд)
export async function holdFunds(userId, amount, orderId) {
    const balanceRef = doc(db, "wallet_balances", userId);
    const balanceDoc = await getDoc(balanceRef);
    const currentBalance = balanceDoc.exists() ? balanceDoc.data() : { available: 0, pending: 0 };
    
    await updateDoc(balanceRef, {
        available: (currentBalance.available || 0) - amount,
        pending: (currentBalance.pending || 0) + amount,
        updatedAt: new Date()
    });
    
    await addDoc(collection(db, "wallet_transactions"), {
        userId: userId,
        userType: "fighter",
        type: "hold",
        amount: amount,
        status: "completed",
        orderId: orderId,
        description: `Заморозка по заказу ${orderId.slice(0, 8)}`,
        createdAt: new Date()
    });
}

// РАЗМОРОЗИТЬ И ПЕРЕВЕСТИ ПРОДАВЦУ (ИСПРАВЛЕНА)
export async function releaseFunds(buyerId, sellerId, totalAmount, orderId) {
    if (!sellerId || sellerId === 'null' || sellerId === 'undefined') {
        console.error('❌ releaseFunds: неверный sellerId', sellerId);
        throw new Error('Не указан ID продавца');
    }
    
    const sellerAmount = totalAmount * 0.9;
    const commissionAmount = totalAmount * 0.1;
    
    console.log('💰 releaseFunds запущен:', { buyerId, sellerId, totalAmount, sellerAmount, commissionAmount });
    
    const buyerRef = doc(db, "wallet_balances", buyerId);
    const sellerRef = doc(db, "wallet_balances", sellerId);
    const prorankRef = doc(db, "wallet_balances", "prorank_system");
    
    try {
        // Получаем текущие балансы
        const [buyerDoc, sellerDoc, prorankDoc] = await Promise.all([
            getDoc(buyerRef),
            getDoc(sellerRef),
            getDoc(prorankRef)
        ]);
        
        const buyerBalance = buyerDoc.exists() ? buyerDoc.data() : { pending: 0, totalSpent: 0 };
        const sellerBalance = sellerDoc.exists() ? sellerDoc.data() : { available: 0, totalEarned: 0 };
        const prorankBalance = prorankDoc.exists() ? prorankDoc.data() : { available: 0, totalEarned: 0 };
        
        // Обновляем балансы
        await Promise.all([
            updateDoc(buyerRef, {
                pending: (buyerBalance.pending || 0) - totalAmount,
                totalSpent: (buyerBalance.totalSpent || 0) + totalAmount,
                updatedAt: new Date()
            }),
            updateDoc(sellerRef, {
                available: (sellerBalance.available || 0) + sellerAmount,
                totalEarned: (sellerBalance.totalEarned || 0) + sellerAmount,
                updatedAt: new Date()
            }),
            updateDoc(prorankRef, {
                available: (prorankBalance.available || 0) + commissionAmount,
                totalEarned: (prorankBalance.totalEarned || 0) + commissionAmount,
                updatedAt: new Date()
            })
        ]);
        
        // Создаём транзакции
        await Promise.all([
            addDoc(collection(db, "wallet_transactions"), {
                userId: sellerId,
                userType: "partner",
                type: "release",
                amount: sellerAmount,
                status: "completed",
                orderId: orderId,
                description: `Поступление за заказ ${orderId.slice(0, 8)} (90%)`,
                createdAt: new Date()
            }),
            addDoc(collection(db, "wallet_transactions"), {
                userId: "prorank_system",
                userType: "system",
                type: "commission",
                amount: commissionAmount,
                status: "completed",
                orderId: orderId,
                description: `Комиссия с заказа ${orderId.slice(0, 8)} (10%)`,
                createdAt: new Date()
            })
        ]);
        
        console.log('✅ releaseFunds завершён успешно!');
        return true;
    } catch (err) {
        console.error('❌ Ошибка в releaseFunds:', err);
        throw err;
    }
}

// Пополнить баланс
export async function depositFunds(userId, amount, method) {
    const balanceRef = doc(db, "wallet_balances", userId);
    const balanceDoc = await getDoc(balanceRef);
    const currentBalance = balanceDoc.exists() ? balanceDoc.data() : { available: 0 };
    
    await updateDoc(balanceRef, {
        available: (currentBalance.available || 0) + amount,
        updatedAt: new Date()
    });
    
    await addDoc(collection(db, "wallet_transactions"), {
        userId: userId,
        userType: "fighter",
        type: "deposit",
        amount: amount,
        status: "completed",
        description: `Пополнение баланса на ${amount} ₽ (${method})`,
        createdAt: new Date()
    });
}

// Возврат средств
export async function refundFunds(userId, amount, orderId) {
    const balanceRef = doc(db, "wallet_balances", userId);
    const balanceDoc = await getDoc(balanceRef);
    const currentBalance = balanceDoc.exists() ? balanceDoc.data() : { available: 0 };
    
    await updateDoc(balanceRef, {
        available: (currentBalance.available || 0) + amount,
        totalRefunded: (currentBalance.totalRefunded || 0) + amount,
        updatedAt: new Date()
    });
    
    await addDoc(collection(db, "wallet_transactions"), {
        userId: userId,
        userType: "fighter",
        type: "refund",
        amount: amount,
        status: "completed",
        orderId: orderId,
        description: `Возврат по заказу ${orderId.slice(0, 8)}`,
        createdAt: new Date()
    });
}