// sw.js - Service Worker для PRORANK PWA
const CACHE_NAME = 'prorank-v1.0.0';
const OFFLINE_URL = '/offline.html';

// Файлы для кэширования при установке
const STATIC_FILES = [
  '/',
  '/index.html',
  '/catalog.html',
  '/cart.html',
  '/my-orders.html',
  '/profile.html',
  '/rating.html',
  '/challenges.html',
  '/chats.html',
  '/leagues.html',
  '/rules.html',
  '/halls.html',
  '/shop.html',
  '/buyer-wallet.html',
  '/deposit.html',
  '/wallet.html',
  '/partner-dashboard.html',
  '/login.html',
  '/about.html',
  '/privacy.html',
  '/disclaimer.html',
  '/header.js',
  '/style.css',
  '/Avatar.png',
  '/manifest.json',
  '/offline.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700;14..32,800;14..32,900&display=swap',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js'
];

// Установка — кэшируем файлы
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

// Активация — удаляем старые кэши
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

// Стратегия загрузки: сначала сеть, при ошибке — кэш
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Firebase API не кэшируем
  if (url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') ||
      url.hostname.includes('cloudinary')) {
    return;
  }
  
  // HTML страницы — сначала сеть, при ошибке кэш или офлайн страница
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;
          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }
  
  // Статика — сначала кэш, потом сеть
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
      .catch(() => {
        if (event.request.destination === 'image') {
          return new Response('', { status: 404 });
        }
        return new Response('Офлайн. Проверьте соединение.', { status: 404 });
      })
  );
});

// Push-уведомления (подготовка)
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || 'Новое уведомление от PRORANK',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'PRORANK', options)
  );
});

// Клик по уведомлению
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
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