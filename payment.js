// ============================================================
// МОДУЛЬ ПЛАТЕЖЕЙ И БЕЙДЖЕЙ
// ============================================================

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, serverTimestamp, runTransaction } from "firebase/firestore";
import { getAuth } from "firebase/auth";
// ===== ДОБАВЛЕНО: ИМПОРТ ДЛЯ PUSH-УВЕДОМЛЕНИЙ =====
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
// КОНФИГУРАЦИЯ ЮKASSA — ВСТАВЬ СВОИ КЛЮЧИ!
// ============================================================
const YOOKASSA_SHOP_ID = 'ВАШ_SHOP_ID';        // ← ВСТАВИТЬ
const YOOKASSA_SECRET_KEY = 'ВАШ_SECRET_KEY';   // ← ВСТАВИТЬ

// 🔧 РЕЖИМ: 'test' — заглушка (без реальных денег), 'production' — реальные платежи
const PAYMENT_MODE = 'test'; // 'test' или 'production'

// ============================================================
// ВСЕ БЕЙДЖИ (>20 ШТУК)
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
// ТОВАРЫ
// ============================================================
export const PRODUCTS = {
    CHALLENGE_5: { id: 'challenge_5', name: '5 вызовов', price: 100, type: 'challenge', amount: 5 },
    CHALLENGE_10: { id: 'challenge_10', name: '10 вызовов', price: 180, type: 'challenge', amount: 10 },
    CHALLENGE_25: { id: 'challenge_25', name: '25 вызовов', price: 350, type: 'challenge', amount: 25 },
    PREMIUM_MONTH: { id: 'premium_month', name: 'Премиум 1 месяц', price: 200, type: 'premium', duration: 30 },
    PREMIUM_3MONTHS: { id: 'premium_3months', name: 'Премиум 3 месяца', price: 500, type: 'premium', duration: 90 },
    PREMIUM_6MONTHS: { id: 'premium_6months', name: 'Премиум 6 месяцев', price: 850, type: 'premium', duration: 180 },
    PREMIUM_YEAR: { id: 'premium_year', name: 'Премиум 12 месяцев', price: 1500, type: 'premium', duration: 365 },
    FIGHTER_PACK: { id: 'fighter_pack', name: 'Набор "Боец"', price: 400, type: 'pack', challenges: 15, premiumDays: 30 },
    CHAMPION_PACK: { id: 'champion_pack', name: 'Набор "Чемпион"', price: 1000, type: 'pack', challenges: 40, premiumDays: 90 },
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
            
            // ===== ДОБАВЛЕНО: УВЕДОМЛЕНИЕ О ПРЕМИУМЕ =====
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
            
            // ===== ДОБАВЛЕНО: УВЕДОМЛЕНИЕ О ПРЕМИУМЕ =====
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
// СОЗДАНИЕ ПЛАТЕЖА (ЮKassa + ЗАГЛУШКА)
// ============================================================
export async function createPayment(productId, userId) {
    await ensureUserFields(userId);
    
    const product = Object.values(PRODUCTS).find(p => p.id === productId);
    if (!product) throw new Error('❌ Товар не найден');

    const user = auth.currentUser;
    if (!user || user.uid !== userId) throw new Error('❌ Не авторизован');

    // Создаём заказ в Firestore
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

    // ============================================================
    // 🔥 РЕЖИМ: 'test' — ЗАГЛУШКА (без денег)
    // ============================================================
    if (PAYMENT_MODE === 'test') {
        console.log('🧪 ТЕСТОВЫЙ РЕЖИМ: оплата без реальных денег');
        console.log(`💳 Заказ создан: ${orderId}`);
        console.log(`💰 Сумма: ${product.price} ₽`);
        console.log(`📦 Товар: ${product.name}`);

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

    // ============================================================
    // 🔥 РЕЖИМ: 'production' — РЕАЛЬНЫЕ ПЛАТЕЖИ (ЮKassa)
    // ============================================================
    try {
        // Получаем ссылку на страницу с реквизитами
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

        if (!response.ok) {
            console.error('❌ Ошибка ЮKassa:', data);
            throw new Error(`❌ Ошибка оплаты: ${data.description || 'Неизвестная ошибка'}`);
        }

        await updateDoc(orderRef, {
            paymentId: data.id,
            paymentStatus: data.status
        });

        console.log(`✅ Платёж создан: ${data.id}`);
        console.log(`🔗 Ссылка на оплату: ${data.confirmation.confirmation_url}`);

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
// WEBHOOK ДЛЯ ОБРАБОТКИ УВЕДОМЛЕНИЙ ОТ ЮKASSA
// ============================================================
export async function handleYookassaWebhook(req, res) {
    try {
        const event = req.body;
        
        // Проверяем, что это уведомление об успешной оплате
        if (event.object && event.object.status === 'succeeded') {
            const orderId = event.object.metadata?.orderId;
            const userId = event.object.metadata?.userId;
            const productId = event.object.metadata?.productId;
            
            if (!orderId || !userId || !productId) {
                console.error('❌ Недостаточно данных в webhook:', event.object.metadata);
                return res.status(400).send('Missing metadata');
            }
            
            // Находим заказ
            const orderRef = doc(db, "orders", orderId);
            const orderSnap = await getDoc(orderRef);
            
            if (!orderSnap.exists()) {
                console.error(`❌ Заказ ${orderId} не найден`);
                return res.status(404).send('Order not found');
            }
            
            const orderData = orderSnap.data();
            
            // Проверяем, не оплачен ли уже заказ
            if (orderData.status === 'paid') {
                console.log(`ℹ️ Заказ ${orderId} уже оплачен`);
                return res.status(200).send('Already paid');
            }
            
            // Находим товар
            const product = Object.values(PRODUCTS).find(p => p.id === productId);
            if (!product) {
                console.error(`❌ Товар ${productId} не найден`);
                return res.status(400).send('Product not found');
            }
            
            // Начисляем товар пользователю
            await applyProduct(userId, product, orderId);
            
            console.log(`✅ Заказ ${orderId} успешно оплачен и начислен`);
            return res.status(200).send('OK');
        }
        
        // Если это другое событие — просто подтверждаем получение
        return res.status(200).send('OK');
    } catch (err) {
        console.error('❌ Ошибка обработки webhook:', err);
        return res.status(500).send('Internal Server Error');
    }
}

// ============================================================
// МАРКЕТПЛЕЙС — ОПЛАТА ТОВАРА С КОМИССИЕЙ
// ============================================================
export async function createMarketplacePayment(productId, buyerId, sellerId, price) {
    if (!productId || !buyerId || !sellerId || !price) {
        throw new Error('❌ Недостаточно данных для оплаты');
    }
    
    await ensureUserFields(buyerId);
    
    const commission = Math.round(price * 0.1); // 10% комиссия
    const sellerAmount = price - commission;
    
    // Создаём заказ в маркетплейсе
    const orderData = {
        buyerId: buyerId,
        sellerId: sellerId,
        productId: productId,
        totalAmount: price,
        commission: commission,
        sellerAmount: sellerAmount,
        status: 'pending',
        createdAt: new Date(),
        paidAt: null,
        metadata: {
            type: 'marketplace',
            productId: productId
        }
    };
    
    const orderRef = await addDoc(collection(db, "marketplace_orders"), orderData);
    const orderId = orderRef.id;
    
    // ============================================================
    // 🔥 РЕЖИМ: 'test' — ЗАГЛУШКА
    // ============================================================
    if (PAYMENT_MODE === 'test') {
        console.log('🧪 ТЕСТОВЫЙ РЕЖИМ: оплата товара в маркетплейсе');
        console.log(`💳 Заказ создан: ${orderId}`);
        console.log(`💰 Сумма: ${price} ₽ (комиссия: ${commission} ₽, продавцу: ${sellerAmount} ₽)`);
        
        setTimeout(async () => {
            try {
                await updateDoc(orderRef, {
                    status: 'paid',
                    paidAt: new Date()
                });
                
                // Зачисляем деньги продавцу
                await addToPartnerWallet(sellerId, sellerAmount, orderId, `Продажа товара (комиссия ${commission} ₽)`);
                console.log(`✅ Тестовый платёж в маркетплейсе проведён`);
            } catch (err) {
                console.error('❌ Ошибка начисления:', err);
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
    
    // ============================================================
    // 🔥 РЕЖИМ: 'production' — РЕАЛЬНЫЕ ПЛАТЕЖИ
    // ============================================================
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
                capture: true,
                confirmation: {
                    type: 'redirect',
                    return_url: `${siteUrl}/marketplace.html?payment=success&order=${orderId}`
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
        
        if (!response.ok) {
            console.error('❌ Ошибка ЮKassa:', data);
            throw new Error(`❌ Ошибка оплаты: ${data.description || 'Неизвестная ошибка'}`);
        }
        
        await updateDoc(orderRef, {
            paymentId: data.id,
            paymentStatus: data.status
        });
        
        console.log(`✅ Платёж в маркетплейсе создан: ${data.id}`);
        
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
// ЗАЧИСЛЕНИЕ ДЕНЕГ ПАРТНЁРУ (ДЛЯ МАРКЕТПЛЕЙСА)
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
// ПРОВЕРКА СТАТУСА ЗАКАЗА ПО PAYMENT_ID (ЮKassa)
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
// ПРОВЕРКА СТАТУСА ЗАКАЗА ПО ID
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