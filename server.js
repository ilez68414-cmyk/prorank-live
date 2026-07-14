const webPush = require('web-push');

// Вставь свои ключи
const VAPID_PUBLIC_KEY = 'BEc0VMnnJAe2-6mi4JKR8fu6XJzf8C7a9znurNwYahcJ9nsoNlrcfCcvD2mRCKpGDSpjsG-uW1qWWHarLpJnXsI';
const VAPID_PRIVATE_KEY = 'KhC9NZ1OqHTwuEUhI0YhI4ar4Kf9vhFUDM9AfkPqEDk';

webPush.setVapidDetails(
    'mailto:support@prorank.ru',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// Функция отправки
function sendPush(subscription, payload) {
    return webPush.sendNotification(subscription, JSON.stringify(payload));
}