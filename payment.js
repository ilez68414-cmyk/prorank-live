// ============================================================
// МОДУЛЬ ПЛАТЕЖЕЙ И БЕЙДЖЕЙ — ПОЛНАЯ ВЕРСИЯ
// ============================================================

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, serverTimestamp, runTransaction } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { notifyAboutPremium } from './push-sender.js';

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
// КОНФИГУРАЦИЯ ЮKASSA
// ============================================================
const YOOKASSA_SHOP_ID = 'ВАШ_SHOP_ID';           // ← ВСТАВИТЬ
const YOOKASSA_SECRET_KEY = 'ВАШ_SECRET_KEY';     // ← ВСТАВИТЬ
const YOOKASSA_AGENT_ID = 'ВАШ_AGENT_ID';         // ← Твой shopId в ЮKassa (получишь после подключения)

const PLATFORM_COMMISSION = 0.10; // 10% комиссия платформы
const PAYMENT_MODE = 'test'; // 'test' или 'production'

// ============================================================
// ВСЕ БЕЙДЖИ
// ============================================================
export const ALL_BADGES = [
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
// ТОВАРЫ (цифровые)
// ============================================================
export const PRODUCTS = {
    CHALLENGE_5: { id: 'challenge_5', name: '5 вызовов', price: 500, type: 'challenge', amount: 5 },
    CHALLENGE_10: { id: 'challenge_10', name: '10 вызовов', price: 900, type: 'challenge', amount: 10 },
    CHALLENGE_25: { id: 'challenge_25', name: '25 вызовов', price: 2000, type: 'challenge', amount: 25 },
    PREMIUM_MONTH: { id: 'premium_month', name: 'Премиум 1 месяц', price: 200, type: 'premium', duration: 30 },
    PREMIUM_3MONTHS: { id: 'premium_3months', name: 'Премиум 3 месяца', price: 500, type: 'premium', duration: 90 },
    PREMIUM_6MONTHS: { id: 'premium_6months', name: 'Премиум 6 месяцев', price: 850, type: 'premium', duration: 180 },
    PREMIUM_YEAR: { id: 'premium_year', name: 'Премиум 12 месяцев', price: 1500, type: 'premium', duration: 365 },
    FIGHTER_PACK: { id: 'fighter_pack', name: 'Набор "Боец"', price: 1400, type: 'pack', challenges: 15, premiumDays: 30 },
    CHAMPION_PACK: { id: 'champion_pack', name: 'Набор "Чемпион"', price: 3500, type: 'pack', challenges: 40, premiumDays: 90 },
};

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
export function getBadgeImage(badgeId) {
    return `./badges/${badgeId}.png`;
}

export async function ensureUserFields(userId) {
    if (!userId) return;
    const userRef = doc(db, "fighters", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    const userData = userSnap.data();
    const updates = {};
    let needUpdate = false;
    
    if (userData.premiumUntil === undefined) { updates.premiumUntil = null; needUpdate = true; }
    if (userData.badges === undefined) { updates.badges = []; needUpdate = true; }
    if (userData.orders === undefined) { updates.orders = []; needUpdate = true; }
    if (userData.totalPaid === undefined) { updates.totalPaid = 0; needUpdate = true; }
    if (userData.selectedBadge === undefined) { updates.selectedBadge = null; needUpdate = true; }
    if (userData.lastPremiumRefresh === undefined) { updates.lastPremiumRefresh = null; needUpdate = true; }
    
    if (needUpdate) {
        await updateDoc(userRef, updates);
        console.log('✅ Добавлены поля:', Object.keys(updates).join(', '));
    }
    return true;
}

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

export async function getAvailableBadges(userId) {
    await ensureUserFields(userId);
    const userRef = doc(db, "fighters", userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    if (!userData) return [];
    const ownedBadges = userData.badges || [];
    const isPremium = userData.premium || false;
    
    if (isPremium) {
        return ALL_BADGES.map(b => ({ ...b, isOwned: ownedBadges.includes(b.id), isAvailable: true }));
    }
    return ALL_BADGES.map(b => ({
        ...b,
        isOwned: ownedBadges.includes(b.id),
        isAvailable: ownedBadges.includes(b.id)
    }));
}

export async function getSelectedBadge(userId) {
    await ensureUserFields(userId);
    const userRef = doc(db, "fighters", userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();
    if (!userData) return null;
    return userData.selectedBadge || null;
}

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
// НАЧИСЛЕНИЕ ЦИФРОВОГО ТОВАРА
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
            const now = new Date();
            const currentUntil = userData.premiumUntil?.toDate() || now;
            const newUntil = new Date(Math.max(now.getTime(), currentUntil.getTime()) + product.duration * 24 * 60 * 60 * 1000);
            updates.premium = true;
            updates.premiumUntil = newUntil;
            updates.totalPaid = (userData.totalPaid || 0) + product.price;
            
            const allBadgeIds = ALL_BADGES.map(b => b.id);
            const currentBadges = userData.badges || [];
            const newBadges = [...new Set([...currentBadges, ...allBadgeIds])];
            updates.badges = newBadges;
            if (!userData.selectedBadge) {
                updates.selectedBadge = 'badge_crown';
            }
            const currentFree = userData.freeChallenges || 0;
            updates.freeChallenges = currentFree + 5;
            updates.lastPremiumRefresh = new Date();
            
            await notifyAboutPremium(userId, 'activated');
            break;
        }
        case 'pack': {
            const now = new Date();
            const currentUntil = userData.premiumUntil?.toDate() || now;
            const newUntil = new Date(Math.max(now.getTime(), currentUntil.getTime()) + product.premiumDays * 24 * 60 * 60 * 1000);
            updates.premium = true;
            updates.premiumUntil = newUntil;
            const currentPurchased = userData.purchasedChallenges || 0;
            updates.purchasedChallenges = currentPurchased + product.challenges;
            const allBadgeIds = ALL_BADGES.map(b => b.id);
            const currentBadges = userData.badges || [];
            const newBadges = [...new Set([...currentBadges, ...allBadgeIds])];
            updates.badges = newBadges;
            if (!userData.selectedBadge) {
                updates.selectedBadge = 'badge_crown';
            }
            updates.totalPaid = (userData.totalPaid || 0) + product.price;
            updates.lastPremiumRefresh = new Date();
            
            await notifyAboutPremium(userId, 'activated');
            break;
        }
        default:
            throw new Error('❌ Неизвестный тип товара');
    }

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
// 1. ЦИФРОВЫЕ ТОВАРЫ (shop.html)
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

    if (PAYMENT_MODE === 'test') {
        console.log('🧪 ТЕСТОВЫЙ РЕЖИМ: оплата без реальных денег');
        setTimeout(async () => {
            try {
                await updateDoc(orderRef, {
                    status: 'paid',
                    paidAt: new Date(),
                    paymentId: 'test_payment_' + Date.now()
                });
                await applyProduct(userId, product, orderId);
                console.log(`✅ Тестовый платёж успешно проведён`);
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
            isTest: true
        };
    }

    try {
        const siteUrl = 'https://ilez68414-cmyk.github.io/prorank-live';
        
        const response = await fetch('https://api.yookassa.ru/v3/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotence-Key': orderId,
                'Authorization': `Basic ${btoa(YOOKASSA_SHOP_ID + ':' + YOOKASSA_SECRET_KEY)}`
            },
            body: JSON.stringify({
                amount: {
                    value: product.price.toFixed(2),
                    currency: 'RUB'
                },
                capture: true,
                confirmation: {
                    type: 'redirect',
                    return_url: `${siteUrl}/shop.html?payment=success&order=${orderId}`
                },
                description: product.name,
                receipt: {
                    items: [{
                        description: product.name,
                        quantity: 1,
                        amount: {
                            value: product.price.toFixed(2),
                            currency: 'RUB'
                        },
                        vat_code: 1,
                        payment_mode: 'full_payment',
                        payment_subject: 'service'
                    }]
                },
                metadata: {
                    orderId: orderId,
                    userId: userId,
                    productId: product.id
                }
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(`❌ Ошибка оплаты: ${data.description || 'Неизвестная ошибка'}`);

        await updateDoc(orderRef, {
            paymentId: data.id,
            paymentStatus: data.status
        });

        return {
            orderId: orderId,
            status: data.status,
            amount: product.price,
            productName: product.name,
            paymentUrl: data.confirmation.confirmation_url,
            paymentId: data.id,
            isTest: false
        };

    } catch (err) {
        console.error('❌ Ошибка создания платежа:', err);
        throw err;
    }
}

// ============================================================
// 2. МАРКЕТПЛЕЙС — ХОЛД + СПЛИТ (catalog.html, cart.html)
// ============================================================
export async function createMarketplacePayment(productId, buyerId, sellerId, price, sellerShopId) {
    if (!productId || !buyerId || !sellerId || !price) {
        throw new Error('❌ Недостаточно данных для оплаты');
    }
    
    if (!sellerShopId || sellerShopId === 'null' || sellerShopId === 'undefined') {
        throw new Error('❌ Продавец не подключён к ЮKassa (нет shopId)');
    }
    
    await ensureUserFields(buyerId);
    
    const commission = Math.round(price * PLATFORM_COMMISSION * 100) / 100;
    const sellerAmount = price - commission;
    
    const orderData = {
        buyerId: buyerId,
        sellerId: sellerId,
        sellerShopId: sellerShopId,
        productId: productId,
        totalAmount: price,
        commission: commission,
        sellerAmount: sellerAmount,
        status: 'pending',
        createdAt: new Date(),
        paidAt: null,
        paymentId: null,
        holdUntil: null,
        metadata: {
            type: 'marketplace',
            productId: productId
        }
    };
    
    const orderRef = await addDoc(collection(db, "marketplace_orders"), orderData);
    const orderId = orderRef.id;
    
    if (PAYMENT_MODE === 'test') {
        console.log('🧪 ТЕСТОВЫЙ РЕЖИМ: оплата товара в маркетплейсе с холдом');
        setTimeout(async () => {
            try {
                await updateDoc(orderRef, {
                    status: 'held',
                    paidAt: new Date(),
                    paymentId: 'test_payment_' + Date.now()
                });
                console.log(`✅ Тестовый платёж в маркетплейсе создан (холд)`);
            } catch (err) {
                console.error('❌ Ошибка:', err);
                await updateDoc(orderRef, { status: 'failed' });
            }
        }, 2000);
        
        return {
            orderId: orderId,
            status: 'pending',
            amount: price,
            commission: commission,
            sellerAmount: sellerAmount,
            paymentUrl: '#',
            isTest: true
        };
    }
    
    try {
        const siteUrl = 'https://ilez68414-cmyk.github.io/prorank-live';
        const productName = `Товар в маркетплейсе #${productId}`;
        
        const response = await fetch('https://api.yookassa.ru/v3/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotence-Key': orderId,
                'Authorization': `Basic ${btoa(YOOKASSA_SHOP_ID + ':' + YOOKASSA_SECRET_KEY)}`
            },
            body: JSON.stringify({
                amount: {
                    value: price.toFixed(2),
                    currency: 'RUB'
                },
                capture: false,
                confirmation: {
                    type: 'redirect',
                    return_url: `${siteUrl}/my-orders.html?payment=success&order=${orderId}`
                },
                description: productName,
                receipt: {
                    items: [{
                        description: productName,
                        quantity: 1,
                        amount: {
                            value: price.toFixed(2),
                            currency: 'RUB'
                        },
                        vat_code: 1,
                        payment_mode: 'full_payment',
                        payment_subject: 'service'
                    }]
                },
                transfers: [
                    {
                        account_id: sellerShopId,
                        amount: {
                            value: sellerAmount.toFixed(2),
                            currency: 'RUB'
                        }
                    },
                    {
                        account_id: YOOKASSA_AGENT_ID,
                        amount: {
                            value: commission.toFixed(2),
                            currency: 'RUB'
                        }
                    }
                ],
                metadata: {
                    orderId: orderId,
                    buyerId: buyerId,
                    sellerId: sellerId,
                    productId: productId,
                    type: 'marketplace'
                }
            })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(`❌ Ошибка оплаты: ${data.description || 'Неизвестная ошибка'}`);
        
        await updateDoc(orderRef, {
            paymentId: data.id,
            paymentStatus: data.status,
            holdUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
        
        return {
            orderId: orderId,
            status: data.status,
            amount: price,
            commission: commission,
            sellerAmount: sellerAmount,
            paymentUrl: data.confirmation.confirmation_url,
            paymentId: data.id,
            isTest: false
        };
        
    } catch (err) {
        console.error('❌ Ошибка создания платежа в маркетплейсе:', err);
        throw err;
    }
}

// ============================================================
// 3. ПОДТВЕРЖДЕНИЕ ПОЛУЧЕНИЯ (my-orders.html)
// ============================================================
export async function confirmMarketplaceOrder(orderId) {
    const orderRef = doc(db, "marketplace_orders", orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) throw new Error('❌ Заказ не найден');
    
    const order = orderSnap.data();
    if (order.status !== 'held') throw new Error('❌ Заказ не в статусе холда');
    if (!order.paymentId) throw new Error('❌ Нет paymentId');
    
    if (PAYMENT_MODE === 'test') {
        await updateDoc(orderRef, {
            status: 'completed',
            completedAt: new Date()
        });
        return { success: true };
    }
    
    try {
        const response = await fetch(`https://api.yookassa.ru/v3/payments/${order.paymentId}/capture`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${btoa(YOOKASSA_SHOP_ID + ':' + YOOKASSA_SECRET_KEY)}`
            },
            body: JSON.stringify({
                amount: {
                    value: order.totalAmount.toFixed(2),
                    currency: 'RUB'
                },
                transfers: [
                    {
                        account_id: order.sellerShopId,
                        amount: {
                            value: order.sellerAmount.toFixed(2),
                            currency: 'RUB'
                        }
                    },
                    {
                        account_id: YOOKASSA_AGENT_ID,
                        amount: {
                            value: order.commission.toFixed(2),
                            currency: 'RUB'
                        }
                    }
                ]
            })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.description);
        
        await updateDoc(orderRef, {
            status: 'completing',
            confirmedAt: new Date()
        });
        
        return { success: true, status: data.status };
        
    } catch (err) {
        console.error('❌ Ошибка подтверждения:', err);
        throw err;
    }
}

// ============================================================
// 4. ОТМЕНА ЗАКАЗА (my-orders.html, partner-orders.html)
// ============================================================
export async function cancelMarketplaceOrder(orderId, reason = 'Отменено пользователем') {
    const orderRef = doc(db, "marketplace_orders", orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) throw new Error('❌ Заказ не найден');
    
    const order = orderSnap.data();
    if (order.status === 'completed') throw new Error('❌ Нельзя отменить завершённый заказ');
    if (!order.paymentId) throw new Error('❌ Нет paymentId');
    
    if (PAYMENT_MODE === 'test') {
        await updateDoc(orderRef, {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelReason: reason
        });
        return { success: true };
    }
    
    try {
        const response = await fetch(`https://api.yookassa.ru/v3/payments/${order.paymentId}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${btoa(YOOKASSA_SHOP_ID + ':' + YOOKASSA_SECRET_KEY)}`
            }
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.description);
        
        await updateDoc(orderRef, {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelReason: reason
        });
        
        return { success: true };
        
    } catch (err) {
        console.error('❌ Ошибка отмены:', err);
        throw err;
    }
}

// ============================================================
// 5. ПОПОЛНЕНИЕ БАЛАНСА (buyer-wallet.html)
// ============================================================
export async function createDepositPayment(userId, amount, description = 'Пополнение баланса') {
    if (!userId || !amount || amount < 100) {
        throw new Error('❌ Минимальная сумма пополнения — 100 ₽');
    }

    if (PAYMENT_MODE === 'test') {
        return {
            status: 'pending',
            paymentUrl: null,
            isTest: true
        };
    }

    try {
        const siteUrl = 'https://ilez68414-cmyk.github.io/prorank-live';
        const orderId = 'deposit_' + Date.now() + '_' + userId.slice(0, 6);

        const response = await fetch('https://api.yookassa.ru/v3/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotence-Key': orderId,
                'Authorization': `Basic ${btoa(YOOKASSA_SHOP_ID + ':' + YOOKASSA_SECRET_KEY)}`
            },
            body: JSON.stringify({
                amount: {
                    value: amount.toFixed(2),
                    currency: 'RUB'
                },
                capture: true,
                confirmation: {
                    type: 'redirect',
                    return_url: `${siteUrl}/buyer-wallet.html?payment=success`
                },
                description: description,
                receipt: {
                    items: [{
                        description: description,
                        quantity: 1,
                        amount: {
                            value: amount.toFixed(2),
                            currency: 'RUB'
                        },
                        vat_code: 1,
                        payment_mode: 'full_payment',
                        payment_subject: 'service'
                    }]
                },
                metadata: {
                    type: 'deposit',
                    userId: userId,
                    amount: amount
                }
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.description);

        return {
            status: data.status,
            paymentUrl: data.confirmation.confirmation_url,
            paymentId: data.id
        };
    } catch (err) {
        console.error('❌ Ошибка создания платежа:', err);
        throw err;
    }
}

// ============================================================
// 6. ПОЛУЧИТЬ SHOP_ID ПРОДАВЦА
// ============================================================
export async function getSellerShopId(sellerId) {
    if (!sellerId) throw new Error('❌ Не указан ID продавца');
    
    const sellerRef = doc(db, "partners", sellerId);
    const sellerSnap = await getDoc(sellerRef);
    
    if (!sellerSnap.exists()) {
        throw new Error('❌ Продавец не найден');
    }
    
    const shopId = sellerSnap.data().yookassaShopId;
    if (!shopId || shopId === 'null' || shopId === 'undefined') {
        throw new Error('❌ Продавец не подключён к ЮKassa (нет shopId)');
    }
    
    return shopId;
}

// ============================================================
// 7. ЗАЧИСЛЕНИЕ ДЕНЕГ ПАРТНЁРУ
// ============================================================
export async function addToPartnerWallet(partnerId, amount, orderId, description = '') {
    if (!partnerId || !amount || amount <= 0) return false;
    
    try {
        const balanceRef = doc(db, "wallet_balances", partnerId);
        
        await runTransaction(db, async (transaction) => {
            const balanceSnap = await transaction.get(balanceRef);
            const currentData = balanceSnap.exists() ? balanceSnap.data() : { available: 0, totalEarned: 0 };
            
            transaction.set(balanceRef, {
                available: (currentData.available || 0) + amount,
                totalEarned: (currentData.totalEarned || 0) + amount,
                updatedAt: new Date()
            }, { merge: true });
        });
        
        await addDoc(collection(db, "wallet_transactions"), {
            userId: partnerId,
            userType: "partner",
            type: "deposit",
            amount: amount,
            status: "completed",
            orderId: orderId,
            description: description || `Зачисление за заказ ${orderId?.slice(0, 8) || ''}`,
            createdAt: new Date()
        });
        
        console.log(`✅ Зачислено ${amount} ₽ партнёру ${partnerId}`);
        return true;
    } catch (err) {
        console.error('❌ Ошибка зачисления партнёру:', err);
        return false;
    }
}

// ============================================================
// 8. ПРОВЕРКА СТАТУСА ПЛАТЕЖА
// ============================================================
export async function checkPaymentStatus(paymentId) {
    if (PAYMENT_MODE === 'test') {
        return { status: 'succeeded' };
    }

    try {
        const response = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${btoa(YOOKASSA_SHOP_ID + ':' + YOOKASSA_SECRET_KEY)}`
            }
        });

        const data = await response.json();
        return data;
    } catch (err) {
        console.error('❌ Ошибка проверки платежа:', err);
        return null;
    }
}

// ============================================================
// 9. ПРОВЕРКА СТАТУСА ЗАКАЗА ПО ID
// ============================================================
export async function checkOrderStatus(orderId) {
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) return null;
    const data = orderSnap.data();
    return {
        id: orderSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
        paidAt: data.paidAt?.toDate(),
    };
}

// ============================================================
// 10. ПОЛУЧИТЬ ВСЕ ЗАКАЗЫ ПОЛЬЗОВАТЕЛЯ
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
// 11. ВЕБХУК ДЛЯ ЮKASSA
// ============================================================
export async function handleYookassaWebhook(req, res) {
    try {
        const event = req.body;
        const metadata = event.object?.metadata || {};
        const orderId = metadata.orderId;
        
        console.log('📩 Получен вебхук:', event.object?.status, 'orderId:', orderId);
        
        // ===== ПОПОЛНЕНИЕ БАЛАНСА =====
        if (metadata.type === 'deposit' && event.object?.status === 'succeeded') {
            const userId = metadata.userId;
            const amount = parseFloat(metadata.amount);
            
            if (!userId || !amount) {
                console.error('❌ Недостаточно данных для пополнения');
                return res.status(400).send('Missing metadata');
            }
            
            const { depositFunds } = await import('./wallet.js');
            await depositFunds(userId, amount, 'ЮKassa');
            
            console.log(`✅ Баланс пользователя ${userId} пополнен на ${amount} ₽`);
            return res.status(200).send('OK');
        }
        
        // ===== МАРКЕТПЛЕЙС — ХОЛД =====
        if (metadata.type === 'marketplace' && event.object?.status === 'waiting_for_capture') {
            if (!orderId) return res.status(400).send('Missing orderId');
            
            const orderRef = doc(db, "marketplace_orders", orderId);
            const orderSnap = await getDoc(orderRef);
            
            if (!orderSnap.exists()) {
                console.error(`❌ Заказ ${orderId} не найден`);
                return res.status(404).send('Order not found');
            }
            
            const order = orderSnap.data();
            if (order.status !== 'pending') {
                console.log(`ℹ️ Заказ ${orderId} уже обработан (статус: ${order.status})`);
                return res.status(200).send('Already processed');
            }
            
            await updateDoc(orderRef, {
                status: 'held',
                paymentStatus: 'waiting_for_capture',
                heldAt: new Date()
            });
            
            console.log(`✅ Заказ ${orderId} заморожен (холд)`);
            return res.status(200).send('OK');
        }
        
        // ===== МАРКЕТПЛЕЙС — ПОДТВЕРЖДЁН =====
        if (metadata.type === 'marketplace' && event.object?.status === 'succeeded') {
            if (!orderId) return res.status(400).send('Missing orderId');
            
            const orderRef = doc(db, "marketplace_orders", orderId);
            const orderSnap = await getDoc(orderRef);
            
            if (!orderSnap.exists()) {
                console.error(`❌ Заказ ${orderId} не найден`);
                return res.status(404).send('Order not found');
            }
            
            const order = orderSnap.data();
            if (order.status === 'completed') {
                console.log(`ℹ️ Заказ ${orderId} уже завершён`);
                return res.status(200).send('Already completed');
            }
            
            await updateDoc(orderRef, {
                status: 'completed',
                completedAt: new Date(),
                paymentStatus: 'succeeded'
            });
            
            await addDoc(collection(db, "wallet_transactions"), {
                orderId: orderId,
                buyerId: metadata.buyerId,
                sellerId: metadata.sellerId,
                amount: order.totalAmount,
                commission: order.commission,
                type: 'marketplace_sale',
                status: 'completed',
                createdAt: new Date()
            });
            
            console.log(`✅ Заказ ${orderId} завершён, средства распределены`);
            return res.status(200).send('OK');
        }
        
        // ===== МАРКЕТПЛЕЙС — ОТМЕНЁН =====
        if (metadata.type === 'marketplace' && event.object?.status === 'canceled') {
            if (!orderId) return res.status(400).send('Missing orderId');
            
            const orderRef = doc(db, "marketplace_orders", orderId);
            const orderSnap = await getDoc(orderRef);
            
            if (orderSnap.exists()) {
                await updateDoc(orderRef, {
                    status: 'cancelled',
                    cancelledAt: new Date(),
                    cancelReason: 'Отменено ЮKassa (истекло время или отклонено)'
                });
                console.log(`❌ Заказ ${orderId} отменён ЮKassa`);
            }
            return res.status(200).send('OK');
        }
        
        // ===== ЦИФРОВЫЕ ТОВАРЫ (shop.html) =====
        if (metadata.productId && event.object?.status === 'succeeded') {
            const userId = metadata.userId;
            const productId = metadata.productId;
            
            if (!orderId || !userId || !productId) {
                console.error('❌ Недостаточно данных в webhook');
                return res.status(400).send('Missing metadata');
            }
            
            const orderRef = doc(db, "orders", orderId);
            const orderSnap = await getDoc(orderRef);
            
            if (!orderSnap.exists()) {
                console.error(`❌ Заказ ${orderId} не найден`);
                return res.status(404).send('Order not found');
            }
            
            const orderData = orderSnap.data();
            if (orderData.status === 'paid') {
                console.log(`ℹ️ Заказ ${orderId} уже оплачен`);
                return res.status(200).send('Already paid');
            }
            
            const product = Object.values(PRODUCTS).find(p => p.id === productId);
            if (!product) {
                console.error(`❌ Товар ${productId} не найден`);
                return res.status(400).send('Product not found');
            }
            
            await applyProduct(userId, product, orderId);
            console.log(`✅ Заказ ${orderId} успешно оплачен и начислен`);
            return res.status(200).send('OK');
        }
        
        return res.status(200).send('OK');
        
    } catch (err) {
        console.error('❌ Ошибка обработки webhook:', err);
        return res.status(500).send('Internal Server Error');
    }
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