// ============================================================
// PUSH-УВЕДОМЛЕНИЯ
// ============================================================

import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { initializeApp } from "firebase/app";

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
const auth = getAuth(app);

// ===== ВАШ VAPID КЛЮЧ (получить в Firebase Console → Project Settings → Cloud Messaging) =====
const VAPID_KEY = 'BEc0VMnnJAe2-6mi4JKR8fu6XJzf8C7a9znurNwYahcJ9nsoNlrcfCcvD2mRCKpGDSpjsG-uW1qWWHarLpJnXsI';

// ===== ПРОВЕРКА ПОДДЕРЖКИ =====
export function isPushSupported() {
    return 'Notification' in window && 
           'serviceWorker' in navigator && 
           'PushManager' in window;
}

// ===== ЗАПРОС РАЗРЕШЕНИЯ =====
export async function requestNotificationPermission() {
    if (!isPushSupported()) {
        console.log('❌ Push-уведомления не поддерживаются');
        return null;
    }

    if (Notification.permission === 'denied') {
        console.log('❌ Разрешение на уведомления отклонено');
        return null;
    }

    if (Notification.permission === 'granted') {
        console.log('✅ Разрешение уже есть');
        return await subscribeToPush();
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        console.log('❌ Пользователь отклонил уведомления');
        return null;
    }

    console.log('✅ Разрешение получено');
    return await subscribeToPush();
}

// ===== ПОДПИСКА НА PUSH =====
export async function subscribeToPush() {
    if (!isPushSupported()) {
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
            console.log('✅ Подписка уже существует');
            await saveSubscription(subscription);
            return subscription;
        }

        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: VAPID_KEY
        });

        console.log('✅ Новая подписка создана');
        await saveSubscription(subscription);
        return subscription;
    } catch (err) {
        console.error('❌ Ошибка подписки:', err);
        return null;
    }
}

// ===== СОХРАНЕНИЕ ПОДПИСКИ В FIRESTORE =====
async function saveSubscription(subscription) {
    const user = auth.currentUser;
    if (!user) {
        console.log('⚠️ Пользователь не авторизован');
        return;
    }

    try {
        const subData = {
            endpoint: subscription.endpoint,
            keys: subscription.toJSON().keys,
            updatedAt: new Date()
        };

        await setDoc(doc(db, "users", user.uid, "push_subscription", "default"), subData);
        console.log('✅ Подписка сохранена в Firestore');
    } catch (err) {
        console.error('❌ Ошибка сохранения подписки:', err);
    }
}

// ===== ОТПИСКА ОТ PUSH =====
export async function unsubscribeFromPush() {
    if (!isPushSupported()) {
        return false;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
            await subscription.unsubscribe();
            console.log('✅ Отписка успешна');
        }

        const user = auth.currentUser;
        if (user) {
            await setDoc(doc(db, "users", user.uid, "push_subscription", "default"), {
                unsubscribed: true,
                unsubscribedAt: new Date()
            });
        }
        
        return true;
    } catch (err) {
        console.error('❌ Ошибка отписки:', err);
        return false;
    }
}

// ===== ПРОВЕРКА СТАТУСА ПОДПИСКИ =====
export async function getPushStatus() {
    if (!isPushSupported()) {
        return { supported: false, subscribed: false };
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        return {
            supported: true,
            subscribed: !!subscription,
            permission: Notification.permission
        };
    } catch (err) {
        console.error('❌ Ошибка проверки статуса:', err);
        return { supported: true, subscribed: false, permission: Notification.permission };
    }
}

// ===== ПРОВЕРКА, ПОДПИСАН ЛИ ПОЛЬЗОВАТЕЛЬ =====
export async function isUserSubscribed() {
    if (!isPushSupported()) return false;
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        return !!subscription;
    } catch (err) {
        console.error('Ошибка проверки подписки:', err);
        return false;
    }
}

// ===== ОТПРАВКА ТЕСТОВОГО УВЕДОМЛЕНИЯ =====
export async function sendTestNotification() {
    const status = await getPushStatus();
    if (!status.subscribed) {
        console.log('⚠️ Нет активной подписки');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification('🔔 PRORANK', {
            body: 'Тестовое уведомление! Всё работает 🎉',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            vibrate: [200, 100, 200]
        });
        console.log('✅ Тестовое уведомление отправлено');
    } catch (err) {
        console.error('❌ Ошибка отправки тестового уведомления:', err);
    }
}