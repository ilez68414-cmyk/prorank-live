// ============================================================
// premium.js — ЛОГИКА ПРЕМИУМА
// ============================================================
// Бонусы: +5 выз./мес, +5% FRS, защита рейтинга, скидка 15%
// ============================================================

import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
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
// ПРОВЕРКА АКТИВНОГО ПРЕМИУМА
// ============================================================
export async function checkPremium(userId) {
    if (!userId) return false;
    
    try {
        const userRef = doc(db, "fighters", userId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        
        if (!userData) return false;
        
        // Проверяем premiumUntil
        const premiumUntil = userData.premiumUntil?.toDate();
        if (!premiumUntil) return false;
        
        const now = new Date();
        const isActive = premiumUntil > now;
        
        // Если истёк — обновляем статус
        if (!isActive && userData.premium) {
            await updateDoc(userRef, { premium: false });
            return false;
        }
        
        return isActive;
    } catch (err) {
        console.error('Ошибка проверки премиума:', err);
        return false;
    }
}

// ============================================================
// НАЧИСЛЕНИЕ БЕСПЛАТНЫХ ВЫЗОВОВ ЗА МЕСЯЦ (ДЛЯ ПРЕМИУМ)
// ============================================================
export async function applyMonthlyPremiumChallenges(userId) {
    if (!userId) return;
    
    try {
        const userRef = doc(db, "fighters", userId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        
        if (!userData) return;
        
        // Проверяем премиум
        const isPremium = await checkPremium(userId);
        if (!isPremium) return;
        
        // Проверяем последнее начисление
        const lastRefresh = userData.lastPremiumRefresh?.toDate();
        const now = new Date();
        
        // Если прошёл месяц или никогда не обновлялось
        if (!lastRefresh || 
            now.getMonth() !== lastRefresh.getMonth() || 
            now.getFullYear() !== lastRefresh.getFullYear()) {
            
            // Начисляем 5 бесплатных вызовов
            const currentFree = userData.freeChallenges || 0;
            await updateDoc(userRef, {
                freeChallenges: currentFree + 5,
                lastPremiumRefresh: now
            });
            
            console.log(`✅ Премиум: начислено 5 бесплатных вызовов для ${userId}`);
            return true;
        }
        
        return false;
    } catch (err) {
        console.error('Ошибка начисления премиум-вызовов:', err);
        return false;
    }
}

// ============================================================
// БОНУС +5% К FRS ЗА ПОБЕДУ
// ============================================================
export async function applyFrsBonus(userId, baseFrs) {
    if (!userId || !baseFrs) return baseFrs;
    
    try {
        const userRef = doc(db, "fighters", userId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        
        if (!userData) return baseFrs;
        
        const isPremium = await checkPremium(userId);
        if (!isPremium) return baseFrs;
        
        // +5% бонус
        const bonus = Math.round(baseFrs * 0.05);
        const total = baseFrs + bonus;
        
        // Обновляем FRS в базе
        const currentFrs = userData.frs || 0;
        await updateDoc(userRef, {
            frs: currentFrs + total
        });
        
        console.log(`✅ Премиум: +${bonus} FRS бонус (${baseFrs} + 5%)`);
        return total;
    } catch (err) {
        console.error('Ошибка начисления FRS бонуса:', err);
        return baseFrs;
    }
}

// ============================================================
// ЗАЩИТА РЕЙТИНГА — ПОТЕРЯ НА 20% МЕНЬШЕ
// ============================================================
export async function applyRatingProtection(userId, frsLoss) {
    if (!userId || !frsLoss) return frsLoss;
    
    try {
        const userRef = doc(db, "fighters", userId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        
        if (!userData) return frsLoss;
        
        const isPremium = await checkPremium(userId);
        if (!isPremium) return frsLoss;
        
        // Защита: теряем на 20% меньше
        const protectedLoss = Math.round(frsLoss * 0.8);
        const saved = frsLoss - protectedLoss;
        
        // Обновляем FRS
        const currentFrs = userData.frs || 0;
        await updateDoc(userRef, {
            frs: Math.max(0, currentFrs - protectedLoss)
        });
        
        console.log(`✅ Премиум: защита рейтинга — сэкономлено ${saved} FRS`);
        return protectedLoss;
    } catch (err) {
        console.error('Ошибка применения защиты рейтинга:', err);
        return frsLoss;
    }
}

// ============================================================
// ПОЛУЧИТЬ ИНФОРМАЦИЮ О ПРЕМИУМЕ (для отображения)
// ============================================================
export async function getPremiumInfo(userId) {
    if (!userId) return { active: false, daysLeft: 0, until: null };
    
    try {
        const userRef = doc(db, "fighters", userId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        
        if (!userData) return { active: false, daysLeft: 0, until: null };
        
        const isActive = await checkPremium(userId);
        const premiumUntil = userData.premiumUntil?.toDate();
        
        if (isActive && premiumUntil) {
            const now = new Date();
            const daysLeft = Math.ceil((premiumUntil - now) / (1000 * 60 * 60 * 24));
            return {
                active: true,
                daysLeft: Math.max(0, daysLeft),
                until: premiumUntil
            };
        }
        
        return { active: false, daysLeft: 0, until: null };
    } catch (err) {
        console.error('Ошибка получения информации о премиуме:', err);
        return { active: false, daysLeft: 0, until: null };
    }
}

// ============================================================
// ПРОВЕРКА СКИДКИ (15% ДЛЯ ПРЕМИУМ)
// ============================================================
export async function getPremiumDiscount(userId) {
    const isPremium = await checkPremium(userId);
    return isPremium ? 0.85 : 1.0; // 15% скидка
}

// ============================================================
// ПРИМЕНЕНИЕ СКИДКИ К ЦЕНЕ
// ============================================================
export async function applyDiscount(userId, price) {
    const discount = await getPremiumDiscount(userId);
    return Math.round(price * discount);
}

// ============================================================
// ПРОВЕРКА И ПРИМЕНЕНИЕ ВСЕХ ПРЕМИУМ-БОНУСОВ ПРИ ЗАГРУЗКЕ
// ============================================================
export async function applyAllPremiumBonuses(userId) {
    if (!userId) return;
    
    try {
        // Проверяем и начисляем ежемесячные вызовы
        await applyMonthlyPremiumChallenges(userId);
        
        // Проверяем активность и обновляем статус
        await checkPremium(userId);
        
        console.log(`✅ Премиум-бонусы применены для ${userId}`);
        return true;
    } catch (err) {
        console.error('Ошибка применения премиум-бонусов:', err);
        return false;
    }
}