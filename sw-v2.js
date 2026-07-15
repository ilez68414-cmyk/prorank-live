// sw.js - Service Worker для PRORANK PWA
const CACHE_NAME = 'prorank-v2.0.0'; // ← ИЗМЕНЕНО! Это форсирует обновление
const OFFLINE_URL = '/prorank-live/offline.html';

// ============================================================
// ВСЕ ФАЙЛЫ ДЛЯ КЭШИРОВАНИЯ (полный список)
// ============================================================
const STATIC_FILES = [
  // === HTML СТРАНИЦЫ ===
  '/prorank-live/',
  '/prorank-live/index.html',
  '/prorank-live/about.html',
  '/prorank-live/achievements.html',      // ← НОВОЕ
  '/prorank-live/admin.html',             // ← НОВОЕ
  '/prorank-live/boxing.html',            // ← НОВОЕ
  '/prorank-live/buyer-wallet.html',
  '/prorank-live/cart.html',
  '/prorank-live/catalog.html',
  '/prorank-live/challenges.html',
  '/prorank-live/chat.html',              // ← НОВОЕ
  '/prorank-live/chats.html',
  '/prorank-live/disclaimer.html',
  '/prorank-live/halls.html',
  '/prorank-live/leagues.html',
  '/prorank-live/login.html',
  '/prorank-live/mma.html',               // ← НОВОЕ
  '/prorank-live/my-orders.html',
  '/prorank-live/offline.html',
  '/prorank-live/partner-dashboard.html',
  '/prorank-live/partner-orders.html',
  '/prorank-live/partner-products.html',
  '/prorank-live/partner-reviews.html',
  '/prorank-live/privacy.html',
  '/prorank-live/profile.html',
  '/prorank-live/rating.html',
  '/prorank-live/reset-password.html',    // ← НОВОЕ
  '/prorank-live/rules.html',
  '/prorank-live/shop.html',
  '/prorank-live/wallet.html',
  '/prorank-live/wrestling.html',         // ← НОВОЕ

  // === JAVASCRIPT ===
  '/prorank-live/header.js',
  '/prorank-live/script.js',              // ← НОВОЕ
  '/prorank-live/profile.js',             // ← НОВОЕ
  '/prorank-live/payment.js',             // ← НОВОЕ
  '/prorank-live/wallet.js',              // ← НОВОЕ
  '/prorank-live/premium.js',             // ← НОВОЕ
  '/prorank-live/error-handler.js',       // ← НОВОЕ
  '/prorank-live/push-notifications.js',  // ← НОВОЕ
  '/prorank-live/push-sender.js',         // ← НОВОЕ
  '/prorank-live/server.js',              // ← НОВОЕ

  // === CSS ===
  '/prorank-live/style.css',

  // === ИКОНКИ И ГРАФИКА ===
  '/prorank-live/Avatar.png',
  '/prorank-live/favicon.ico',

  // === ПАПКИ С ИКОНКАМИ (ВАЖНО!) ===
  '/prorank-live/icons/icon-72.png',      // ← НОВОЕ
  '/prorank-live/icons/icon-96.png',      // ← НОВОЕ
  '/prorank-live/icons/icon-128.png',     // ← НОВОЕ
  '/prorank-live/icons/icon-144.png',     // ← НОВОЕ
  '/prorank-live/icons/icon-152.png',     // ← НОВОЕ
  '/prorank-live/icons/icon-192.png',     // ← НОВОЕ
  '/prorank-live/icons/icon-384.png',     // ← НОВОЕ
  '/prorank-live/icons/icon-512.png',     // ← НОВОЕ
  
  // Если в папках много файлов, добавьте основные
  // Или используйте динамическое кэширование (см. fetch ниже)

  // === MANIFEST ===
  '/prorank-live/manifest.json',

  // === ВНЕШНИЕ РЕСУРСЫ ===
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700;14..32,800;14..32,900&display=swap',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js'
];

// ============================================================
// ДИНАМИЧЕСКОЕ КЭШИРОВАНИЕ ДЛЯ ПАПОК С ИКОНКАМИ
// ============================================================
self.addEventListener('install', event => {
  console.log('[SW] Установка v2.0.0...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        console.log('[SW] Кэширование статических файлов...');
        try {
          await cache.addAll(STATIC_FILES);
          console.log('[SW] Статика закэширована');
          
          // Дополнительно кэшируем иконки из папок рекурсивно
          console.log('[SW] Кэширование иконок из папок...');
          const iconFolders = [
            '/prorank-live/icons/',
            '/prorank-live/league-icons/',
            '/prorank-live/achiev-icons/',
            '/prorank-live/functions/'
          ];
          
          for (const folder of iconFolders) {
            try {
              const response = await fetch(folder);
              // Это не сработает для папок, поэтому используем стратегию в fetch
            } catch (e) {
              console.log('[SW] Папка не доступна для предкэширования:', folder);
            }
          }
          
        } catch (err) {
          console.error('[SW] Ошибка кэширования:', err);
        }
      })
  );
  self.skipWaiting();
});

// ============================================================
// АКТИВАЦИЯ - удаляем старые кэши
// ============================================================
self.addEventListener('activate', event => {
  console.log('[SW] Активация v2.0.0...');
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
    }).then(() => {
      // Забираем контроль над всеми клиентами
      return self.clients.claim();
    })
  );
});

// ============================================================
// FETCH — ОБНОВЛЕННАЯ СТРАТЕГИЯ
// ============================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // === Firebase и внешние API — только сеть ===
  if (url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') ||
      url.hostname.includes('cloudinary') ||
      url.hostname.includes('api.telegram.org')) {
    return;
  }
  
  // === Иконки и изображения — кэш с приоритетом ===
  if (url.pathname.includes('/icons/') || 
      url.pathname.includes('/league-icons/') ||
      url.pathname.includes('/achiev-icons/') ||
      url.pathname.includes('/functions/')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            return response;
          }
          // Если нет в кэше - грузим из сети и сохраняем
          return fetch(event.request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, clone);
                });
              }
              return networkResponse;
            })
            .catch(() => {
              // Если иконка не загрузилась - возвращаем заглушку
              return new Response('', { status: 404 });
            });
        })
    );
    return;
  }
  
  // === HTML страницы — сеть с fallback на кэш ===
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
  
  // === Статика (CSS, JS) — кэш с обновлением из сети ===
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          // Фоновое обновление кэша
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(() => {});
          return response;
        }
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
// PUSH-УВЕДОМЛЕНИЯ (без изменений)
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
  
  if (event.action === 'close') {
    return;
  }
  
  const url = event.notification.data?.url || '/prorank-live/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then(windowClients => {
        for (let client of windowClients) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// ============================================================
// ОБРАБОТКА СООБЩЕНИЙ
// ============================================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

const VAPID_KEY = 'BEc0VMnnJAe2-6mi4JKR8fu6XJzf8C7a9znurNwYahcJ9nsoNlrcfCcvD2mRCKpGDSpjsG-uW1qWWHarLpJnXsI';

console.log('[SW] Service Worker загружен, версия:', CACHE_NAME);