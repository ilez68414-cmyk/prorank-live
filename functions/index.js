const functions = require('firebase-functions');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();

// VAPID-ключи
const VAPID_PUBLIC_KEY = 'BEc0VMnnJAe2-6mi4JKR8fu6XJzf8C7a9znurNwYahcJ9nsoNlrcfCcvD2mRCKpGDSpjsG-uW1qWWHarLpJnXsI';
const VAPID_PRIVATE_KEY = 'KhC9NZ1OqHTwuEUhI0YhI4ar4Kf9vhFUDM9AfkPqEDk';

webpush.setVapidDetails(
  'mailto:support@prorank.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Cloud Function: отправка push-уведомлений
exports.sendPush = functions.https.onCall(async (data, context) => {
  const { subscription, payload } = data;

  // Проверка авторизации
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Требуется авторизация');
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/icons/icon-192.png',
        url: payload.url || '/',
        vibrate: payload.vibrate || [200, 100, 200]
      })
    );

    return { success: true };
  } catch (error) {
    console.error('Ошибка отправки:', error);

    // Если подписка невалидна — удаляем
    if (error.statusCode === 410 || error.statusCode === 404) {
      const userId = context.auth.uid;
      await admin.firestore()
        .doc(`users/${userId}/push_subscription/default`)
        .delete();
      console.log('🗑️ Невалидная подписка удалена');
    }

    return { success: false, error: error.message };
  }
});