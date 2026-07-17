// ============================================================
// ОТПРАВКА PUSH-УВЕДОМЛЕНИЙ
// ============================================================

import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ===== КОНФИГ FIREBASE (ДОЛЖЕН БЫТЬ ЗДЕСЬ!) =====
const firebaseConfig = {
    apiKey: "AIzaSyDUGYJY7pX7q02MS5SACMIIQXpjpQ97mPw",
    authDomain: "proranklive.firebaseapp.com",
    projectId: "proranklive",
    storageBucket: "proranklive.firebasestorage.app",
    messagingSenderId: "716836144015",
    appId: "1:716836144015:web:f1575147750608d0f881fa"
};

// ===== ИНИЦИАЛИЗАЦИЯ (ЕСЛИ ЕЩЁ НЕ ИНИЦИАЛИЗИРОВАНА) =====
let app;
try {
    app = initializeApp(firebaseConfig);
    console.log('✅ Firebase инициализирован из push-sender.js');
} catch (err) {
    console.log('ℹ️ Firebase уже инициализирован');
}

const db = getFirestore(app);
const auth = getAuth(app);

// ===== ПОЛУЧИТЬ ПОДПИСКУ ПОЛЬЗОВАТЕЛЯ =====
export async function getUserPushSubscription(userId) {
    if (!userId) return null;
    
    try {
        const subDoc = await getDoc(doc(db, "users", userId, "push_subscription", "default"));
        if (!subDoc.exists()) return null;
        return subDoc.data();
    } catch (err) {
        console.error('❌ Ошибка получения подписки:', err);
        return null;
    }
}

// ===== ОТПРАВИТЬ PUSH-УВЕДОМЛЕНИЕ (через Service Worker) =====
export async function sendPushNotification(userId, title, body, url = '/', icon = '/icons/icon-192.png') {
    const currentUser = auth.currentUser;
    if (currentUser && userId === currentUser.uid) {
        console.log('ℹ️ Не отправляем уведомление самому себе');
        return false;
    }

    if (!userId) {
        console.warn('⚠️ Не указан userId для отправки уведомления');
        return false;
    }

    const subscription = await getUserPushSubscription(userId);
    if (!subscription) {
        console.log(`⚠️ Нет подписки у пользователя ${userId}`);
        return false;
    }
    
    try {
        if (!('serviceWorker' in navigator)) {
            console.warn('⚠️ Service Worker не поддерживается');
            return false;
        }
        
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, {
            body: body,
            icon: icon,
            badge: icon,
            vibrate: [200, 100, 200],
            data: { url: url }
        });
        
        console.log(`✅ Уведомление отправлено через Service Worker: ${title}`);
        return true;
    } catch (err) {
        console.error('❌ Ошибка отправки push:', err);
        return false;
    }
}

// ===== ОТПРАВИТЬ УВЕДОМЛЕНИЕ О ВЫЗОВЕ =====
export async function notifyAboutChallenge(fromUserId, toUserId, fromName) {
    const currentUser = auth.currentUser;
    if (currentUser && toUserId === currentUser.uid) {
        console.log('ℹ️ Не отправляем вызов самому себе');
        return false;
    }
    return sendPushNotification(toUserId, '🥊 Новый вызов!', `${fromName} вызывает тебя на спарринг!`, '/prorank-live/challenges.html');
}

// ===== ОТПРАВИТЬ УВЕДОМЛЕНИЕ О ПРИНЯТИИ ВЫЗОВА =====
export async function notifyAboutChallengeAccepted(fromUserId, toUserId, toName) {
    const currentUser = auth.currentUser;
    if (currentUser && fromUserId === currentUser.uid) {
        console.log('ℹ️ Не отправляем уведомление о принятии вызова самому себе');
        return false;
    }
    return sendPushNotification(fromUserId, '✅ Вызов принят!', `${toName} принял твой вызов!`, '/prorank-live/chats.html');
}

// ===== ОТПРАВИТЬ УВЕДОМЛЕНИЕ О НОВОМ СООБЩЕНИИ =====
export async function notifyAboutNewMessage(userId, fromName, message, chatId) {
    const currentUser = auth.currentUser;
    if (currentUser && userId === currentUser.uid) {
        console.log('ℹ️ Не отправляем уведомление о сообщении самому себе');
        return false;
    }

    if (!message) {
        console.warn('⚠️ Пустое сообщение, уведомление не отправлено');
        return false;
    }

    const body = message.length > 50 ? message.substring(0, 50) + '...' : message;
    
    // ✅ ИСПРАВЛЕНО: правильный путь к чату
    return sendPushNotification(
        userId, 
        `💬 Новое сообщение от ${fromName}`, 
        body, 
        `/prorank-live/chat.html?id=${chatId}`
    );
}

// ===== ОТПРАВИТЬ УВЕДОМЛЕНИЕ О ПРЕМИУМЕ =====
export async function notifyAboutPremium(userId, action, days = null) {
    const currentUser = auth.currentUser;
    if (currentUser && userId === currentUser.uid) {
        console.log('ℹ️ Не отправляем уведомление о премиуме самому себе');
        return false;
    }

    if (action === 'activated') {
        return sendPushNotification(userId, '👑 Премиум активирован!', 'Премиум-доступ открыт! Наслаждайся преимуществами.', '/prorank-live/shop.html');
    } else if (action === 'expiring_soon') {
        return sendPushNotification(userId, '⏰ Премиум истекает!', `У вас осталось ${days} дней. Продлите сейчас!`, '/prorank-live/shop.html');
    } else if (action === 'expired') {
        return sendPushNotification(userId, '❌ Премиум истёк', 'Ваш премиум-доступ закончился. Активируйте снова!', '/prorank-live/shop.html');
    }
    return false;
}