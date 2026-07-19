// api/index.js — ФИНАЛЬНАЯ ВЕРСИЯ ДЛЯ VERCEL
import webPush from 'web-push';
import admin from 'firebase-admin';

// === 1. ИНИЦИАЛИЗАЦИЯ FIREBASE ===
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'proranklive',
    });
}

const db = admin.firestore();

// === 2. НАСТРОЙКА VAPID ===
webPush.setVapidDetails(
    'mailto:support@prorank.ru',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// === 3. ГЛАВНАЯ ФУНКЦИЯ ===
export default async function handler(req, res) {
    // Разрешаем только POST
    if (req.method === 'GET') {
        return res.status(200).json({ message: 'Push API is running. Use POST to send notifications.' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { title, body, icon, targetUid, url } = req.body;

        if (!title || !body) {
            return res.status(400).json({ error: 'Title and body are required' });
        }

        // Получаем подписки
        let subscriptions = [];
        
        if (targetUid) {
            const doc = await db.collection('users').doc(targetUid)
                .collection('push_subscription').doc('default').get();
            if (doc.exists) {
                subscriptions = [doc.data()];
            }
        } else {
            const snapshot = await db.collectionGroup('push_subscription').get();
            subscriptions = snapshot.docs.map(doc => doc.data());
        }

        if (subscriptions.length === 0) {
            return res.status(404).json({ error: 'No subscriptions found' });
        }

        // Отправляем
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

        const results = [];
        for (const sub of subscriptions) {
            try {
                if (!sub.endpoint || !sub.keys) continue;
                await webPush.sendNotification(sub, payload);
                results.push({ success: true });
            } catch (error) {
                results.push({ success: false, error: error.message });
            }
        }

        return res.status(200).json({
            success: true,
            sent: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        });

    } catch (error) {
        console.error('🔥 Error:', error);
        return res.status(500).json({ 
            error: error.message || 'Internal server error'
        });
    }
}