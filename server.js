// server.js — ЕДИНСТВЕННАЯ ТОЧКА ВХОДА (Весь код здесь)
import webPush from 'web-push';
import admin from 'firebase-admin';

// === 1. ИНИЦИАЛИЗАЦИЯ FIREBASE ===
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: 'proranklive',
        });
        console.log('✅ Firebase initialized');
    } catch (err) {
        console.error('❌ Ошибка инициализации Firebase:', err.message);
    }
}

const db = admin.firestore();

// === 2. НАСТРОЙКА VAPID ===
try {
    webPush.setVapidDetails(
        'mailto:support@prorank.ru',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
    console.log('✅ VAPID configured');
} catch (err) {
    console.error('❌ Ошибка настройки VAPID:', err.message);
}

// === 3. ГЛАВНАЯ ФУНКЦИЯ ДЛЯ VERCEL ===
export default async function handler(req, res) {
    // Отвечаем на GET запросы (проверка работоспособности)
    if (req.method === 'GET') {
        return res.status(200).json({ 
            status: 'ok', 
            message: 'Push server is running. Use POST to send notifications.' 
        });
    }

    // Разрешаем только POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    try {
        const { title, body, icon, targetUid, url } = req.body;

        // Базовая валидация
        if (!title || !body) {
            return res.status(400).json({ error: 'Title and body are required' });
        }

        // === 4. ПОЛУЧАЕМ ПОДПИСКИ ИЗ FIRESTORE ===
        let subscriptions = [];
        
        if (targetUid) {
            // Отправка конкретному пользователю
            const doc = await db.collection('users').doc(targetUid)
                .collection('push_subscription').doc('default').get();
            if (doc.exists) {
                subscriptions = [doc.data()];
                console.log(`✅ Найдена подписка для ${targetUid}`);
            } else {
                console.log(`⚠️ Нет подписки для ${targetUid}`);
            }
        } else {
            // Отправка всем (получаем все подписки из коллекции)
            const snapshot = await db.collectionGroup('push_subscription').get();
            subscriptions = snapshot.docs.map(doc => doc.data());
            console.log(`✅ Найдено ${subscriptions.length} подписок`);
        }

        if (subscriptions.length === 0) {
            return res.status(404).json({ error: 'No subscriptions found' });
        }

        // === 5. ФОРМИРУЕМ PAYLOAD ===
        const payload = JSON.stringify({
            title,
            body,
            icon: icon || '/prorank-live/icons/icon-192.png',
            vibrate: [200, 100, 200],
            data: {
                url: url || '/prorank-live/',
                timestamp: Date.now()
            }
        });

        // === 6. ОТПРАВЛЯЕМ УВЕДОМЛЕНИЯ ===
        const results = [];
        for (const sub of subscriptions) {
            try {
                if (!sub.endpoint || !sub.keys) {
                    console.warn('⚠️ Невалидная подписка, пропускаем');
                    continue;
                }

                await webPush.sendNotification(sub, payload);
                results.push({ success: true, endpoint: sub.endpoint.substring(0, 50) + '...' });
                console.log('✅ Уведомление отправлено');
            } catch (error) {
                console.error('❌ Ошибка отправки:', error.message);
                results.push({ success: false, error: error.message });
            }
        }

        // === 7. ВОЗВРАЩАЕМ ОТВЕТ ===
        const sentCount = results.filter(r => r.success).length;
        const failedCount = results.filter(r => !r.success).length;

        return res.status(200).json({
            success: true,
            message: `Отправлено ${sentCount} из ${subscriptions.length}`,
            sent: sentCount,
            failed: failedCount,
            results: results
        });

    } catch (error) {
        console.error('🔥 КРИТИЧЕСКАЯ ОШИБКА:', error);
        return res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    }
}