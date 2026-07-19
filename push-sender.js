// ============================================================
// ОТПРАВКА PUSH-УВЕДОМЛЕНИЙ
// ============================================================

import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ===== КОНФИГ FIREBASE =====
const firebaseConfig = {
    apiKey: "AIzaSyDUGYJY7pX7q02MS5SACMIIQXpjpQ97mPw",
    authDomain: "proranklive.firebaseapp.com",
    projectId: "proranklive",
    storageBucket: "proranklive.firebasestorage.app",
    messagingSenderId: "716836144015",
    appId: "1:716836144015:web:f1575147750608d0f881fa"
};

// ===== ИНИЦИАЛИЗАЦИЯ =====
let app;
try {
    app = initializeApp(firebaseConfig);
    console.log('✅ Firebase инициализирован из push-sender.js');
} catch (err) {
    console.log('ℹ️ Firebase уже инициализирован');
}

const db = getFirestore(app);
const auth = getAuth(app);

// ===== ПОЛУЧИТЬ ПОДПИСКУ =====
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

// ===== ОТПРАВИТЬ PUSH (БЕЗ ПРОВЕРКИ НА СЕБЯ) =====
export async function sendPushNotification(userId, title, body, url = '/', icon = '/icons/icon-192.png') {
    if (!userId) {
        console.warn('⚠️ Не указан userId');
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
        
        console.log(`✅ Уведомление отправлено: ${title}`);
        return true;
    } catch (err) {
        console.error('❌ Ошибка отправки push:', err);
        return false;
    }
}

// ===== УВЕДОМЛЕНИЕ О ВЫЗОВЕ =====
export async function notifyAboutChallenge(fromUserId, toUserId, fromName) {
    return sendPushNotification(toUserId, '🥊 Новый вызов!', `${fromName} вызывает тебя на спарринг!`, '/prorank-live/challenges.html');
}

// ===== УВЕДОМЛЕНИЕ О ПРИНЯТИИ ВЫЗОВА =====
export async function notifyAboutChallengeAccepted(fromUserId, toUserId, toName) {
    return sendPushNotification(fromUserId, '✅ Вызов принят!', `${toName} принял твой вызов!`, '/prorank-live/chats.html');
}

// ===== УВЕДОМЛЕНИЕ О НОВОМ СООБЩЕНИИ (С ПРОВЕРКОЙ НА СЕБЯ) =====
export async function notifyAboutNewMessage(userId, fromName, message, chatId) {
    // ✅ ПРОВЕРКА: НЕ ОТПРАВЛЯЕМ САМОМУ СЕБЕ
    const currentUser = auth.currentUser;
    if (currentUser && userId === currentUser.uid) {
        console.log('ℹ️ Не отправляем уведомление о сообщении самому себе');
        return false;
    }

    if (!message) {
        console.warn('⚠️ Пустое сообщение');
        return false;
    }

    const body = message.length > 50 ? message.substring(0, 50) + '...' : message;
    return sendPushNotification(
        userId, 
        `💬 Новое сообщение от ${fromName}`, 
        body, 
        `/prorank-live/chat.html?id=${chatId}`
    );
}

// ===== УВЕДОМЛЕНИЕ О ПРЕМИУМЕ =====
export async function notifyAboutPremium(userId, action, days = null) {
    if (action === 'activated') {
        return sendPushNotification(userId, '👑 Премиум активирован!', 'Премиум-доступ открыт!', '/prorank-live/shop.html');
    } else if (action === 'expiring_soon') {
        return sendPushNotification(userId, '⏰ Премиум истекает!', `Осталось ${days} дней`, '/prorank-live/shop.html');
    } else if (action === 'expired') {
        return sendPushNotification(userId, '❌ Премиум истёк', 'Активируйте снова!', '/prorank-live/shop.html');
    }
    return false;
}

// ============================================================
// НОВАЯ ФУНКЦИЯ: ОТПРАВКА ЧЕРЕЗ VERCEL
// ============================================================

// Вызывай эту функцию, когда хочешь отправить уведомление через Vercel
export async function sendPushViaVercel({ title, body, targetUid = null, icon = null, url = '/' }) {
    try {
        const response = await fetch('/api/send-push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title,
                body,
                targetUid,
                icon: icon || '/prorank-live/icons/icon-192.png',
                url
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка отправки');
        }

        console.log('✅ Уведомление отправлено через Vercel:', data);
        return data;

    } catch (error) {
        console.error('❌ Ошибка отправки через Vercel:', error);
        return null;
    }
}



console.log('📦 push-sender.js загружен');