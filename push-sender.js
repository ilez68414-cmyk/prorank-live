// ============================================================
// ОТПРАВКА PUSH-УВЕДОМЛЕНИЙ
// ============================================================

import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
// Временно отключаем Cloud Functions, используем Service Worker
// import { getFunctions, httpsCallable } from "firebase/functions";

const db = getFirestore();
const auth = getAuth();
// const functions = getFunctions();

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
    const subscription = await getUserPushSubscription(userId);
    if (!subscription) {
        console.log(`⚠️ Нет подписки у пользователя ${userId}`);
        return false;
    }
    
    try {
        // Отправляем через Service Worker (работает без сервера)
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
    return sendPushNotification(toUserId, '🥊 Новый вызов!', `${fromName} вызывает тебя на спарринг!`, '/challenges.html');
}

// ===== ОТПРАВИТЬ УВЕДОМЛЕНИЕ О ПРИНЯТИИ ВЫЗОВА =====
export async function notifyAboutChallengeAccepted(fromUserId, toUserId, toName) {
    return sendPushNotification(fromUserId, '✅ Вызов принят!', `${toName} принял твой вызов!`, '/chats.html');
}

// ===== ОТПРАВИТЬ УВЕДОМЛЕНИЕ О НОВОМ СООБЩЕНИИ =====
export async function notifyAboutNewMessage(userId, fromName, message, chatId) {
    const body = message.length > 50 ? message.substring(0, 50) + '...' : message;
    return sendPushNotification(userId, `💬 Новое сообщение от ${fromName}`, body, `/chat.html?id=${chatId}`);
}

// ===== ОТПРАВИТЬ УВЕДОМЛЕНИЕ О ПРЕМИУМЕ =====
export async function notifyAboutPremium(userId, action, days = null) {
    if (action === 'activated') {
        return sendPushNotification(userId, '👑 Премиум активирован!', 'Премиум-доступ открыт! Наслаждайся преимуществами.', '/shop.html');
    } else if (action === 'expiring_soon') {
        return sendPushNotification(userId, '⏰ Премиум истекает!', `У вас осталось ${days} дней. Продлите сейчас!`, '/shop.html');
    } else if (action === 'expired') {
        return sendPushNotification(userId, '❌ Премиум истёк', 'Ваш премиум-доступ закончился. Активируйте снова!', '/shop.html');
    }
    return false;
}