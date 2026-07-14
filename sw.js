// sw.js - Service Worker для PRORANK PWA
const CACHE_NAME = 'prorank-v1.1.0';
const OFFLINE_URL = '/prorank-live/offline.html';

// Файлы для кэширования при установке
const STATIC_FILES = [
  '/prorank-live/',
  '/prorank-live/index.html',
  '/prorank-live/catalog.html',
  '/prorank-live/cart.html',
  '/prorank-live/my-orders.html',
  '/prorank-live/profile.html',
  '/prorank-live/rating.html',
  '/prorank-live/challenges.html',
  '/prorank-live/chats.html',
  '/prorank-live/leagues.html',
  '/prorank-live/rules.html',
  '/prorank-live/halls.html',
  '/prorank-live/shop.html',
  '/prorank-live/buyer-wallet.html',
  '/prorank-live/wallet.html',
  '/prorank-live/partner-dashboard.html',
  '/prorank-live/partner-products.html',
  '/prorank-live/partner-orders.html',
  '/prorank-live/partner-reviews.html',
  '/prorank-live/login.html',
  '/prorank-live/about.html',
  '/prorank-live/privacy.html',
  '/prorank-live/disclaimer.html',
  '/prorank-live/header.js',
  '/prorank-live/style.css',
  '/prorank-live/Avatar.png',
  '/prorank-live/manifest.json',
  '/prorank-live/offline.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700;14..32,800;14..32,900&display=swap',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js'
];

// ============================================================
// УСТАНОВКА
// ============================================================
self.addEventListener('install', event => {
  console.log('[SW] Установка...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Кэширование файлов');
        return cache.addAll(STATIC_FILES);
      })
      .catch(err => console.error('[SW] Ошибка кэширования:', err))
  );
  self.skipWaiting();
});

// ============================================================
// АКТИВАЦИЯ
// ============================================================
self.addEventListener('activate', event => {
  console.log('[SW] Активация...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Удаляем старый кэш:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ============================================================
// FETCH — СТРАТЕГИЯ ЗАГРУЗКИ
// ============================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Firebase и внешние API — только сеть
  if (url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') ||
      url.hostname.includes('cloudinary') ||
      url.hostname.includes('api.telegram.org')) {
    return;
  }
  
  // HTML страницы — сеть с fallback на кэш или офлайн
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          console.log('[SW] Офлайн-режим: показываем кэш или offline.html');
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;
          const offlinePage = await caches.match(OFFLINE_URL);
          if (offlinePage) return offlinePage;
          return new Response('Нет соединения с интернетом', { 
            status: 503, 
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/html' })
          });
        })
    );
    return;
  }
  
  // Статика — кэш, потом сеть
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
      .catch(() => {
        if (event.request.destination === 'image') {
          return new Response('', { status: 404 });
        }
        if (event.request.destination === 'style' || event.request.destination === 'script') {
          return new Response('', { 
            status: 200, 
            headers: new Headers({ 
              'Content-Type': event.request.destination === 'style' ? 'text/css' : 'application/javascript' 
            }) 
          });
        }
        return new Response('Офлайн. Проверьте соединение.', { status: 404 });
      })
  );
});

// ============================================================
// PUSH-УВЕДОМЛЕНИЯ
// ============================================================
self.addEventListener('push', event => {
  console.log('[SW] Получено push-уведомление');
  
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch (e) {
    data = { 
      title: 'PRORANK', 
      body: event.data?.text() || 'Новое уведомление' 
    };
  }
  
  const options = {
    body: data.body || 'Новое уведомление от PRORANK',
    icon: '/prorank-live/icons/icon-192.png',
    badge: '/prorank-live/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: { 
      url: data.url || '/prorank-live/',
      messageId: data.messageId || null,
      challengeId: data.challengeId || null
    },
    actions: [
      { action: 'open', title: '📱 Открыть' },
      { action: 'close', title: '❌ Закрыть' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'PRORANK', options)
  );
});

// ============================================================
// КЛИК ПО УВЕДОМЛЕНИЮ
// ============================================================
self.addEventListener('notificationclick', event => {
  console.log('[SW] Клик по уведомлению:', event.action);
  event.notification.close();
  
  // Закрыть — ничего не делаем
  if (event.action === 'close') {
    return;
  }
  
  const url = event.notification.data?.url || '/prorank-live/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then(windowClients => {
        // Если есть открытое окно — фокусируем его
        for (let client of windowClients) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // Иначе открываем новое окно
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// ============================================================
// ОБРАБОТКА СООБЩЕНИЙ ОТ КЛИЕНТА
// ============================================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

// VAPID-ключ для push-уведомлений
const VAPID_KEY = 'BEc0VMnnJAe2-6mi4JKR8fu6XJzf8C7a9znurNwYahcJ9nsoNlrcfCcvD2mRCKpGDSpjsG-uW1qWWHarLpJnXsI';

console.log('[SW] Service Worker загружен, версия:', CACHE_NAME);