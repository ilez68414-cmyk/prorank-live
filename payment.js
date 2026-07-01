// ============================================================
// МОДУЛЬ ПЛАТЕЖЕЙ И БЕЙДЖЕЙ
// ============================================================

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDUGYJY7pX7q02MS5SACMIIQXpjpQ97mPw",
    authDomain: "proranklive.firebaseapp.com",
    projectId: "proranklive",
    storageBucket: "proranklive.firebasestorage.app",
    messagingSenderId: "716836144015",
    appId: "1:716836144015:web:f1575147750608d0f881fa"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth();

// ============================================================
// ВСЕ БЕЙДЖИ (>20 ШТУК)
// ============================================================
export const ALL_BADGES = [
    // === ПРЕМИУМ БЕЙДЖИ (ВЫДАЮТСЯ С ПРЕМИУМОМ) ===
    { id: 'badge_crown', name: 'Корона', emoji: '👑', isPremium: true },
    { id: 'badge_legend', name: 'Легенда', emoji: '⭐', isPremium: true },
    { id: 'badge_elite', name: 'Элита', emoji: '💎', isPremium: true },
    { id: 'badge_warrior', name: 'Воин', emoji: '⚔️', isPremium: true },
    { id: 'badge_viking', name: 'Викинг', emoji: '🪓', isPremium: true },
    { id: 'badge_samurai', name: 'Самурай', emoji: '🗡️', isPremium: true },
    { id: 'badge_knight', name: 'Рыцарь', emoji: '🛡️', isPremium: true },
    { id: 'badge_dragon', name: 'Дракон', emoji: '🐉', isPremium: true },
    { id: 'badge_phoenix', name: 'Феникс', emoji: '🔥', isPremium: true },
    { id: 'badge_wolf', name: 'Волк', emoji: '🐺', isPremium: true },
    { id: 'badge_eagle', name: 'Орёл', emoji: '🦅', isPremium: true },
    { id: 'badge_shark', name: 'Акула', emoji: '🦈', isPremium: true },
    { id: 'badge_lion', name: 'Лев', emoji: '🦁', isPremium: true },
    { id: 'badge_tiger', name: 'Тигр', emoji: '🐯', isPremium: true },
    { id: 'badge_bear', name: 'Медведь', emoji: '🐻', isPremium: true },
    { id: 'badge_snake', name: 'Змея', emoji: '🐍', isPremium: true },
    { id: 'badge_unicorn', name: 'Единорог', emoji: '🦄', isPremium: true },
    { id: 'badge_skull', name: 'Череп', emoji: '💀', isPremium: true },
    { id: 'badge_star', name: 'Звезда', emoji: '🌟', isPremium: true },
    { id: 'badge_lightning', name: 'Молния', emoji: '⚡', isPremium: true },
    { id: 'badge_flame', name: 'Пламя', emoji: '🔥', isPremium: true },
    { id: 'badge_crystal', name: 'Кристалл', emoji: '🔮', isPremium: true },
];

// ============================================================
// ТОВАРЫ
// ============================================================
export const PRODUCTS = {
    // === ВЫЗОВЫ ===
    CHALLENGE_5: { id: 'challenge_5', name: '5 вызовов', price: 100, type: 'challenge', amount: 5 },
    CHALLENGE_10: { id: 'challenge_10', name: '10 вызовов', price: 180, type: 'challenge', amount: 10 },
    CHALLENGE_25: { id: 'challenge_25', name: '25 вызовов', price: 350, type: 'challenge', amount: 25 },
    
    // === ПРЕМИУМ ===
    PREMIUM_MONTH: { id: 'premium_month', name: 'Премиум 1 месяц', price: 200, type: 'premium', duration: 30 },
    PREMIUM_3MONTHS: { id: 'premium_3months', name: 'Премиум 3 месяца', price: 500, type: 'premium', duration: 90 },
    PREMIUM_6MONTHS: { id: 'premium_6months', name: 'Премиум 6 месяцев', price: 850, type: 'premium', duration: 180 },
    PREMIUM_YEAR: { id: 'premium_year', name: 'Премиум 12 месяцев', price: 1500, type: 'premium', duration: 365 },
    
    // === НАБОРЫ ===
    FIGHTER_PACK: { id: 'fighter_pack', name: 'Набор "Боец"', price: 400, type: 'pack', challenges: 15, premiumDays: 30 },
    CHAMPION_PACK: { id: 'champion_pack', name: 'Набор "Чемпион"', price: 1000, type: 'pack', challenges: 40, premiumDays: 90 },
};

// ============================================================
// ПОЛУЧИТЬ БЕЙДЖ ПО ID
// ============================================================
export function getBadgeById(badgeId) {
    return ALL_BADGES.find(b => b.id === badgeId);
}

// ============================================================
// ПОЛУЧИТЬ ПУТЬ К КАРТИНКЕ БЕЙДЖА
// ============================================================
export function getBadgeImage(badgeId) {
    return `./badges/${badgeId}.png`;
}

// ============================================================
// АВТОМАТИЧЕСКОЕ ДОБАВЛЕНИЕ ПОЛЕЙ
// ============================================================
export async function ensureUserFields(userId) {
    if (!userId) return;
    const userRef = doc(db, "fighters", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    const userData = userSnap.data();
    const updates = {};
    let needUpdate = false;
    
    if (userData.premiumUntil === undefined) {
        updates.premiumUntil = null;
        needUpdate = true;
    }
    if (userData.badges === undefined) {
        updates.badges = [];
        needUpdate = true;
    }
    if (userData.orders === undefined) {
        updates.orders = [];
        needUpdate = true;
    }
    if (userData.totalPaid === undefined) {
        updates.totalPaid = 0;
        needUpdate = true;
    }
    if (userData.selectedBadge === undefined) {
        updates.selectedBadge = null;
        needUpdate = true;
    }
    if (userData.lastPremiumRefresh === undefined) {
        updates.lastPremiumRefresh = null;
        needUpdate = true;
    }
    
    if (needUpdate) {
        await updateDoc(userRef, updates);
        console.log('✅ Добавлены поля:', Object.keys(updates).join(', '));
    }
    return true;
}

// ============================================================
// СОЗДАНИЕ ПЛАТЕЖА (ЗАГЛУШКА)
// ============================================================
export async function createPayment(productId, userId) {
    await ensureUserFields(userId);
    
    const product = Object.values(PRODUCTS).find(p => p.id === productId);
    if (!product) throw new Error('❌ Товар не найден');
    
    const user = auth.currentUser;
    if (!user || user.uid !== userId) throw new Error('❌ Не авторизован');
    
    const orderData = {
        userId: userId,
        productId: product.id,
        productName: product.name,
        amount: product.price,
        currency: 'RUB',
        status: 'pending',
        createdAt: new Date(),
        paidAt: null,
        metadata: {
            type: product.type,
            amount: product.amount || null,
            duration: product.duration || null,
        }
    };
    
    const orderRef = await addDoc(collection(db, "orders"), orderData);
    const orderId = orderRef.id;
    
    console.log(`💳 Заказ создан: ${orderId}`);
    console.log(`💰 Сумма: ${product.price} ₽`);
    console.log(`📦 Товар: ${product.name}`);
    
    // Заглушка: через 2 секунды "оплата"
    setTimeout(async () => {
        try {
            await updateDoc(orderRef, {
                status: 'paid',
                paidAt: new Date(),
                paymentId: 'test_payment_' + Date.now()
            });
            await applyProduct(userId, product, orderId);
            console.log(`✅ Платёж успешно проведён (заглушка)`);
        } catch (err) {
            console.error('❌ Ошибка начисления:', err);
            await updateDoc(orderRef, { status: 'failed' });
        }
    }, 2000);
    
    return {
        orderId: orderId,
        status: 'pending',
        amount: product.price,
        productName: product.name,
        paymentUrl: '#',
    };
}

// ============================================================
// НАЧИСЛЕНИЕ ТОВАРА
// ============================================================
export async function applyProduct(userId, product, orderId) {
    await ensureUserFields(userId);
    
    const userRef = doc(db, "fighters", userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    if (!userData) throw new Error('❌ Пользователь не найден');
    
    const updates = {};
    
    switch (product.type) {
        case 'challenge': {
            const currentPurchased = userData.purchasedChallenges || 0;
            updates.purchasedChallenges = currentPurchased + product.amount;
            updates.totalPaid = (userData.totalPaid || 0) + product.price;
            break;
        }
        
        case 'premium': {
            // Начисляем премиум
            const now = new Date();
            const currentUntil = userData.premiumUntil?.toDate() || now;
            const newUntil = new Date(Math.max(now.getTime(), currentUntil.getTime()) + product.duration * 24 * 60 * 60 * 1000);
            
            updates.premium = true;
            updates.premiumUntil = newUntil;
            updates.totalPaid = (userData.totalPaid || 0) + product.price;
            
            // ✅ ВЫДАЁМ ВСЕ БЕЙДЖИ (ВСЕ >20 ШТУК)
            const allBadgeIds = ALL_BADGES.map(b => b.id);
            const currentBadges = userData.badges || [];
            const newBadges = [...new Set([...currentBadges, ...allBadgeIds])];
            updates.badges = newBadges;
            
            // Если нет выбранного бейджа — ставим корону
            if (!userData.selectedBadge) {
                updates.selectedBadge = 'badge_crown';
            }
            
            // Начисляем +5 бесплатных вызовов сразу
            const currentFree = userData.freeChallenges || 0;
            updates.freeChallenges = currentFree + 5;
            updates.lastPremiumRefresh = new Date();
            
            break;
        }
        
        case 'pack': {
            // Набор: вызовы + премиум
            const now = new Date();
            const currentUntil = userData.premiumUntil?.toDate() || now;
            const newUntil = new Date(Math.max(now.getTime(), currentUntil.getTime()) + product.premiumDays * 24 * 60 * 60 * 1000);
            
            updates.premium = true;
            updates.premiumUntil = newUntil;
            
            // Вызовы
            const currentPurchased = userData.purchasedChallenges || 0;
            updates.purchasedChallenges = currentPurchased + product.challenges;
            
            // Бейджи
            const allBadgeIds = ALL_BADGES.map(b => b.id);
            const currentBadges = userData.badges || [];
            const newBadges = [...new Set([...currentBadges, ...allBadgeIds])];
            updates.badges = newBadges;
            
            if (!userData.selectedBadge) {
                updates.selectedBadge = 'badge_crown';
            }
            
            updates.totalPaid = (userData.totalPaid || 0) + product.price;
            updates.lastPremiumRefresh = new Date();
            break;
        }
        
        default:
            throw new Error('❌ Неизвестный тип товара');
    }
    
    // Добавляем заказ в историю
    const orders = userData.orders || [];
    orders.push(orderId);
    updates.orders = orders;
    
    await updateDoc(userRef, updates);
    await updateDoc(doc(db, "orders", orderId), {
        status: 'paid',
        paidAt: new Date()
    });
    
    console.log(`✅ Товар "${product.name}" начислен пользователю ${userId}`);
    return true;
}

// ============================================================
// ПРОВЕРКА ПРЕМИУМ-СТАТУСА
// ============================================================
export async function checkPremium(userId) {
    await ensureUserFields(userId);
    const userRef = doc(db, "fighters", userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    if (!userData) return false;
    
    const premiumUntil = userData.premiumUntil?.toDate();
    if (!premiumUntil) return false;
    
    const now = new Date();
    const isActive = premiumUntil > now;
    
    if (!isActive && userData.premium) {
        await updateDoc(userRef, { premium: false });
        return false;
    }
    
    return isActive;
}

// ============================================================
// ПОЛУЧЕНИЕ ДОСТУПНЫХ БЕЙДЖЕЙ
// ============================================================
export async function getAvailableBadges(userId) {
    await ensureUserFields(userId);
    const userRef = doc(db, "fighters", userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    if (!userData) return [];
    
    const ownedBadges = userData.badges || [];
    const isPremium = userData.premium || false;
    
    // Если есть премиум — доступны все бейджи
    if (isPremium) {
        return ALL_BADGES.map(b => ({ ...b, isOwned: ownedBadges.includes(b.id), isAvailable: true }));
    }
    
    // Без премиума — доступны только купленные отдельно (но у нас их нет)
    return ALL_BADGES.map(b => ({
        ...b,
        isOwned: ownedBadges.includes(b.id),
        isAvailable: ownedBadges.includes(b.id)
    }));
}

// ============================================================
// ПОЛУЧИТЬ ВЫБРАННЫЙ БЕЙДЖ
// ============================================================
export async function getSelectedBadge(userId) {
    await ensureUserFields(userId);
    const userRef = doc(db, "fighters", userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    if (!userData) return null;
    return userData.selectedBadge || null;
}

// ============================================================
// ВЫБРАТЬ БЕЙДЖ
// ============================================================
export async function selectBadge(userId, badgeId) {
    await ensureUserFields(userId);
    const userRef = doc(db, "fighters", userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    if (!userData) throw new Error('❌ Пользователь не найден');
    
    const available = await getAvailableBadges(userId);
    const badge = available.find(b => b.id === badgeId);
    if (!badge || !badge.isAvailable) {
        throw new Error('❌ Бейдж недоступен');
    }
    
    await updateDoc(userRef, { selectedBadge: badgeId });
    return badgeId;
}

// ============================================================
// ПОЛУЧИТЬ ВСЕ ЗАКАЗЫ ПОЛЬЗОВАТЕЛЯ
// ============================================================
export async function getUserOrders(userId) {
    const q = query(
        collection(db, "orders"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    const orders = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        orders.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate(),
            paidAt: data.paidAt?.toDate(),
        });
    });
    return orders;
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
export function formatPremiumDate(date) {
    if (!date) return '—';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function getPremiumDaysLeft(date) {
    if (!date) return 0;
    const d = date.toDate ? date.toDate() : new Date(date);
    const now = new Date();
    const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
}