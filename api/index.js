// api/send-push.js
import webpush from 'web-push';
import admin from 'firebase-admin';

// === 1. ИНИЦИАЛИЗАЦИЯ FIREBASE ADMIN ===
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'proranklive',
    });
}

const db = admin.firestore();

// === 2. НАСТРОЙКА WEB-PUSH ===
webpush.setVapidDetails(
    'mailto:ilez@prorank.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// === 3. ОСНОВНАЯ ФУНКЦИЯ ===
export default async function handler(req, res) {
    // Разрешаем только POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { title, body, icon, targetUid, url } = req.body;

        if (!title || !body) {
            return res.status(400).json({ error: 'Title and body are required' });
        }

        // === 4. ПОЛУЧАЕМ ПОДПИСКИ ===
        let subscriptions = [];
        
        if (targetUid) {
            // Отправка конкретному пользователю
            const doc = await db.collection('users').doc(targetUid)
                .collection('push_subscription').doc('default').get();
            
            if (doc.exists) {
                subscriptions = [doc.data()];
            }
        } else {
            // Отправка всем (получаем все подписки из коллекции)
            const snapshot = await db.collectionGroup('push_subscription').get();
            subscriptions = snapshot.docs.map(doc => doc.data());
        }

        if (subscriptions.length === 0) {
            return res.status(404).json({ error: 'No subscriptions found' });
        }

        // === 5. ОТПРАВЛЯЕМ ===
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
                if (!sub.endpoint || !sub.keys) {
                    console.log('⚠️ Невалидная подписка:', sub);
                    continue;
                }

                await webpush.sendNotification(sub, payload);
                results.push({ success: true, endpoint: sub.endpoint });
            } catch (error) {
                console.error('❌ Ошибка:', error.message);
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
        console.error('🔥 Ошибка:', error);
        return res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    }
}