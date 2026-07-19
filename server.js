// server.js
import webPush from 'web-push';
import admin from 'firebase-admin';

// Инициализация Firebase
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

// Настройка VAPID
webPush.setVapidDetails(
    'mailto:support@prorank.ru',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// ГЛАВНАЯ ФУНКЦИЯ
export default async function handler(req, res) {
    // Ответ для GET запросов (чтобы проверить, что сервер жив)
    if (req.method === 'GET') {
        return res.status(200).json({ status: 'ok', message: 'Push server is running' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { title, body, icon, targetUid, url } = req.body;

        if (!title || !body) {
            return res.status(400).json({ error: 'Title and body are required' });
        }

        let subscriptions = [];
        if (targetUid) {
            const doc = await db.collection('users').doc(targetUid)
                .collection('push_subscription').doc('default').get();
            if (doc.exists) subscriptions = [doc.data()];
        } else {
            const snapshot = await db.collectionGroup('push_subscription').get();
            subscriptions = snapshot.docs.map(doc => doc.data());
        }

        if (subscriptions.length === 0) {
            return res.status(404).json({ error: 'Нет подписок' });
        }

        const payload = JSON.stringify({
            title,
            body,
            icon: icon || '/prorank-live/icons/icon-192.png',
            data: { url: url || '/prorank-live/' }
        });

        const results = [];
        for (const sub of subscriptions) {
            try {
                await webPush.sendNotification(sub, payload);
                results.push({ success: true });
            } catch (e) {
                results.push({ success: false, error: e.message });
            }
        }

        return res.status(200).json({
            success: true,
            sent: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        });

    } catch (error) {
        console.error('🔥 Ошибка:', error);
        return res.status(500).json({ error: error.message });
    }
}