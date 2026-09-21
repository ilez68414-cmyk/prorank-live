/* ============================================================================
   PRORANK — Service Worker (PWA Core) · v3.1.0
   ----------------------------------------------------------------------------
   Что делает этот файл:
     1) Кэширует оболочку приложения (index.html, style.css, скрипты, иконки),
        поэтому сайт открывается даже без интернета.
     2) Стратегии:
          • загрузка страниц (mode: navigate) → Network First + фоллбэк в кэш
          • статика своего домена             → Cache First + ревалидация в фоне
          • статические CDN (шрифты, FA, SDK) → Cache First + ревалидация в фоне
          • API / Firebase / аналитика        → только сеть (никогда не кэшируем)
     3) Если интернета нет вообще — вместо белого экрана и стандартной ошибки
        браузера «Нет подключения» открывается локальная копия интерфейса
        с плашкой «Офлайн-режим. Проверьте сеть».
     4) Поддерживает push-уведомления и обмен сообщениями со страницей.

   ВАЖНО: файл самодостаточен и его можно подключать через importScripts()
   (весь код обёрнут в IIFE, поэтому не конфликтует с OneSignalSDKWorker.js).
   ========================================================================= */

(function () {
    'use strict';

    /* =======================================================================
       1. КОНСТАНТЫ И КОНФИГУРАЦИЯ
       ======================================================================= */

    //🔧ФИКС: версия поднята до 3.1.0 — после перехода картинок на WebP нужно
    // гарантированно выкинуть старые кэши у пользователей (activate чистит их).
    const SW_VERSION = '3.1.0';
    const CACHE_PREFIX = 'prorank-cache';
    const CORE_CACHE = CACHE_PREFIX + '-core-v' + SW_VERSION;      // оболочка
    const PAGES_CACHE = CACHE_PREFIX + '-pages-v' + SW_VERSION;    // страницы
    const RUNTIME_CACHE = CACHE_PREFIX + '-runtime-v' + SW_VERSION; // всё остальное
    //🔧ФИКС: отдельный кэш под картинки контента (обложки турниров, товары).
    // Отдельный — чтобы тяжёлая графика не вытесняла код интерфейса.
    const IMAGE_CACHE = CACHE_PREFIX + '-img-v' + SW_VERSION;
    const KEEP_CACHES = [CORE_CACHE, PAGES_CACHE, RUNTIME_CACHE, IMAGE_CACHE];

    const NAV_TIMEOUT = 5000;          // мс ожидания сети при загрузке страницы
    //🔧ФИКС: если сеть не ответила за это время, мгновенно отдаём локальную
    // копию страницы (сайт открывается за ~0.1 сек), а сеть продолжает
    // обновлять кэш в фоне — свежесть контента не теряется.
    const NAV_RACE_MS = 700;
    const MAX_RUNTIME_ITEMS = 150;     // лимит файлов в runtime-кэше
    const MAX_IMAGE_ITEMS = 120;       // лимит картинок контента в кэше
    const BANNER_ID = 'prorankOfflineBanner';

    // Корень приложения = scope воркера (/prorank-live/). Поэтому пути не
    // ломаются ни на GitHub Pages, ни при локальном запуске.
    const BASE = self.registration.scope;
    const appUrl = (path) => new URL(path, BASE).href;

    const OFFLINE_PAGE_URL = appUrl('offline.html');
    const APP_SHELL_URL = appUrl('index.html');

    // Оболочка приложения: кэшируется сразу при установке Service Worker.
    // Это минимум, который позволяет интерфейсу открыться без интернета.
    const CORE_ASSETS = [
        '',                       // каталог /prorank-live/ (отдаёт index.html)

        // ── Оболочка приложения ──────────────────────────────────────────
        'index.html',
        'offline.html',
        'style.css',
        'manifest.json',

        // 🔧ФИКС: раньше кэшировались только 4 JS-файла, поэтому переходы по
        // разделам каждый раз тянули модули из сети. Теперь вся общая обвязка
        // (модули интерфейса и PWA) кладётся в кэш при первой установке —
        // повторные открытия и навигация происходят мгновенно.
        // Мёртвые script.js / fix-prompt.js / virtual-list.js / print-utils.js
        // удалены из проекта и отсюда тоже — нечего скачивать.
        'header.js',
        'seasons.js',
        'error-handler.js',
        'premium.js',
        'payment.js',
        'wallet.js',
        'organizer-wallet.js',
        'push-notifications.js',
        'push-sender.js',
        'voice-recorder.js',
        'voice-uploader.js',

        // 🔧ФИКС: основные экраны кэшируются заранее (Cache First для статики
        // + мгновенная отдача навигации при медленной сети).
        'login.html',
        'tournaments.html',
        'tournament-details.html',
        'tournament-create.html',
        'live-judging.html',
        'my-tournaments.html',
        'catalog.html',
        'favorites.html',
        'profile.html',
        'profile.js',
        'rating.html',
        'leagues.html',
        'achievements.html',
        'challenges.html',
        'wallet.html',
        'chats.html',

        // ── Иконки (мелкие PNG для PWA) ──────────────────────────────────
        'Avatar.png',
        'icons/icon-48.png',
        'icons/icon-72.png',
        'icons/icon-96.png',
        'icons/icon-128.png',
        'icons/icon-144.png',
        'icons/icon-152.png',
        'icons/icon-192.png',
        'icons/icon-384.png',
        'icons/icon-512.webp'
    ].map(appUrl);

    // Хосты с живыми данными: кэш здесь только вредит.
    const LIVE_DATA_HOSTS = [
        'firestore.googleapis.com',
        'firebaseinstallations.googleapis.com',
        'identitytoolkit.googleapis.com',
        'securetoken.googleapis.com',
        'firebasestorage.googleapis.com',
        'cdn.onesignal.com',
        'api.onesignal.com',
        'api.telegram.org',
        'res.cloudinary.com',
        'www.google-analytics.com',
        'region1.google-analytics.com'
    ];

    // Сторонние статические ресурсы, которые полезно держать в кэше,
    // чтобы иконки и шрифты не пропадали в офлайне.
    const STATIC_CDN_HOSTS = [
        'cdnjs.cloudflare.com',
        'fonts.googleapis.com',
        'fonts.gstatic.com'
    ];

    //🔧ФИКС: хосты, с которых приходят картинки контента (обложки турниров,
    // фото товаров). Кэшируем ТОЛЬКО запросы destination === 'image' и в
    // отдельный кэш — чтобы офлайн-режим показывал реальные изображения,
    // а не заглушки, и чтобы графика не вытесняла код интерфейса.
    const CONTENT_IMAGE_HOSTS = [
        'res.cloudinary.com',
        'firebasestorage.googleapis.com'
    ];
    const isContentImage = (url, request) =>
        request.destination === 'image' && CONTENT_IMAGE_HOSTS.indexOf(url.hostname) !== -1;

    const log = (...args) => console.log('[PRORANK SW]', ...args);

    const isHttp = (url) => url.protocol === 'http:' || url.protocol === 'https:';
    const isFirebaseSdk = (url) =>
        url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0;
    const isCacheableCdn = (url) =>
        isFirebaseSdk(url) || STATIC_CDN_HOSTS.indexOf(url.hostname) !== -1;
    const isLiveData = (url) => LIVE_DATA_HOSTS.indexOf(url.hostname) !== -1;
    const isCacheableResponse = (response) =>
        !!response && response.status !== 206 && (response.ok || response.type === 'opaque');

    /* =======================================================================
       2. НИЗКОУРОВНЕВЫЕ ХЕЛПЕРЫ
       ======================================================================= */

    // fetch с таймаутом — чтобы на медленной сети не ждать вечно
    function fetchWithTimeout(request, ms, init) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        const options = Object.assign({ signal: controller.signal }, init || {});
        return fetch(request, options).finally(() => clearTimeout(timer));
    }

    //🔧ФИКС: «гонка» с сетью — нужна, чтобы отдать локальную копию, если
    // сеть отвечает дольше NAV_RACE_MS, и не держать пользователя в ожидании.
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    //🔧ФИКС: единая точка поиска локальной копии страницы во всех кэшах
    function matchCachedPage(request) {
        return caches.match(request, { ignoreSearch: true }).catch(() => null);
    }

    // Аккуратно чистим runtime-кэш, чтобы он не разросся бесконечно
    async function trimCache(cacheName, maxItems) {
        try {
            const cache = await caches.open(cacheName);
            const keys = await cache.keys();
            if (keys.length <= maxItems) return;
            const extra = keys.slice(0, keys.length - maxItems);
            await Promise.all(extra.map((key) => cache.delete(key)));
        } catch (error) {
            /* чистка кэша — не критично, молча продолжаем */
        }
    }

    async function putInCache(cacheName, request, response, maxItems) {
        try {
            if (!isCacheableResponse(response)) return;
            const cache = await caches.open(cacheName);
            // Запросы навигации кэшируем по URL: у них особый mode
            const key = (request && request.mode === 'navigate') ? request.url : request;
            await cache.put(key, response);
            trimCache(cacheName, maxItems || MAX_RUNTIME_ITEMS);
        } catch (error) {
            /* кэширование не удалось — не повод ломать запрос */
        }
    }

    // Заглушка вместо «упавшего» файла, чтобы страница не выглядела поломанной
    const PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" ' +
        'viewBox="0 0 96 96" fill="none"><rect width="96" height="96" rx="20" fill="#1a1a1a"/>' +
        '<path d="M28 60h40M34 46c8-8 20-8 28 0M42 34c3-3 9-3 12 0" stroke="#fbbf24" ' +
        'stroke-width="3" stroke-linecap="round" opacity="0.55"/></svg>';

    function offlineStub(request) {
        switch (request.destination) {
            case 'image':
                return new Response(PLACEHOLDER_SVG, {
                    status: 200,
                    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }
                });
            case 'style':
                return new Response('/* PRORANK: файл стилей недоступен в офлайне */', {
                    status: 200,
                    headers: { 'Content-Type': 'text/css; charset=utf-8' }
                });
            case 'script':
                return new Response('/* PRORANK: скрипт недоступен в офлайне */', {
                    status: 200,
                    headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
                });
            case 'font':
                return new Response('', { status: 200, headers: { 'Content-Type': 'font/woff2' } });
            default:
                return new Response('', { status: 504, statusText: 'Offline' });
        }
    }

    /* =======================================================================
       3. СТРАТЕГИИ КЭШИРОВАНИЯ
       ======================================================================= */

    // Cache First + фоновая ревалидация (Stale-While-Revalidate):
    // пользователь мгновенно получает локальную копию, а свежая версия
    // незаметно подтягивается в кэш для следующего визита.
    async function cacheFirst(request, cacheName, options) {
        const settings = options || {};
        const cache = await caches.open(cacheName);
        const matchOptions = settings.ignoreSearch === false ? {} : { ignoreSearch: true };
        const cached = await cache.match(request, matchOptions);

        const fromNetwork = fetch(request)
            .then((response) => {
                if (isCacheableResponse(response)) {
                    putInCache(cacheName, request, response.clone(), settings.maxItems);
                }
                return response;
            })
            .catch(() => null);

        if (cached) return cached;

        const fresh = await fromNetwork;
        if (fresh) return fresh;

        return offlineStub(request);
    }

    /* =======================================================================
       4. УСТАНОВКА: кэшируем оболочку приложения
       ======================================================================= */

    self.addEventListener('install', (event) => {
        event.waitUntil((async () => {
            const cache = await caches.open(CORE_CACHE);
            const results = await Promise.allSettled(CORE_ASSETS.map(async (url) => {
                const request = new Request(url, { cache: 'reload', credentials: 'same-origin' });
                const response = await fetch(request);
                if (!response || !response.ok) {
                    throw new Error('HTTP ' + (response ? response.status : '?') + ' для ' + url);
                }
                await cache.put(url, response);
            }));

            const failed = results.filter((result) => result.status === 'rejected');
            log('Установка v' + SW_VERSION + ': закэшировано ' +
                (CORE_ASSETS.length - failed.length) + '/' + CORE_ASSETS.length + ' файлов оболочки');
            failed.forEach((item) =>
                console.warn('[PRORANK SW] Не закэшировано:', item.reason && item.reason.message));

            // Новая версия воркера становится активной сразу
            await self.skipWaiting();
        })());
    });

    /* =======================================================================
       5. АКТИВАЦИЯ: чистим устаревшие кэши, включаем navigation preload
       ======================================================================= */

    self.addEventListener('activate', (event) => {
        event.waitUntil((async () => {
            if (self.registration.navigationPreload) {
                try {
                    await self.registration.navigationPreload.enable();
                } catch (error) {
                    log('navigation preload недоступен:', error && error.message);
                }
            }

            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map((cacheName) => {
                const isProrankCache = cacheName.indexOf(CACHE_PREFIX) === 0 ||
                                       cacheName.indexOf('prorank-v') === 0;
                if (isProrankCache && KEEP_CACHES.indexOf(cacheName) === -1) {
                    log('Удаляем устаревший кэш:', cacheName);
                    return caches.delete(cacheName);
                }
                return null;
            }));

            await self.clients.claim();
            log('Активация v' + SW_VERSION + ' завершена — офлайн-режим готов');
        })());
    });

    /* =======================================================================
       6. ЗАГРУЗКА СТРАНИЦ: Network First + локальная копия при офлайне
       ======================================================================= */

    async function handleNavigation(event) {
        const request = event.request;

        //🔧ФИКС: сеть и локальная копия работают параллельно, чтобы убрать
        // «белый экран» на медленной сети:
        //   • сеть ответила быстро        → отдаём свежую страницу как есть;
        //   • сеть молчит дольше 0.7 сек  → мгновенно отдаём локальную копию,
        //     а сеть в фоне обновляет кэш для следующего визита;
        //   • сети нет совсем             → локальная копия + плашка офлайна.
        const cached = await matchCachedPage(request);

        let networkFailed = false;
        const networkPromise = (async () => {
            const preloaded = event.preloadResponse ? await event.preloadResponse : null;
            return preloaded || await fetchWithTimeout(request, NAV_TIMEOUT);
        })().catch((error) => {
            networkFailed = true;
            log('Сеть для страницы недоступна:', request.url, '(' + (error && error.message) + ')');
            return null;
        });

        if (cached) {
            const fresh = await Promise.race([networkPromise, delay(NAV_RACE_MS)]);

            if (fresh && fresh.ok) {
                putInCache(PAGES_CACHE, request, fresh.clone(), 40);
                return fresh;
            }

            // Ответ сети, если он всё-таки придёт позже, тихо уходит в кэш
            networkPromise.then((response) => {
                if (response && response.ok) putInCache(PAGES_CACHE, request, response.clone(), 40);
            }).catch(() => null);

            if (networkFailed || navigator.onLine === false) {
                log('Отдаём локальную копию с плашкой офлайна:', request.url);
                return withOfflineBanner(cached);
            }

            // Сеть медленная, но живая — плашку не показываем, страница работает
            return cached;
        }

        try {
            const response = await networkPromise;

            if (response && response.ok) {
                putInCache(PAGES_CACHE, request, response.clone(), 40);
                return response; // онлайн: страница отдаётся ровно как есть
            }
            throw new Error('HTTP ' + (response ? response.status : 'нет ответа'));
        } catch (error) {
            log('Сети нет — открываем локальную копию:', request.url, '(' + (error && error.message) + ')');
            return openOfflineCopy(request);
        }
    }

    // Достаём из кэша максимально близкую копию запрошенной страницы.
    // Последний рубеж — синтезированная страница офлайн-режима, чтобы
    // вместо белого экрана и ошибки браузера всегда был интерфейс PRORANK.
    async function openOfflineCopy(request) {
        // Сама страница офлайн-режима уже содержит свою плашку «Офлайн-режим.
        // Проверьте сеть» — отдаём её как есть, без повторной инъекции баннера.
        if (request.url.indexOf('offline.html') !== -1) {
            const offlinePage = await caches.match(OFFLINE_PAGE_URL, { ignoreSearch: true });
            if (offlinePage) return offlinePage;
            return buildOfflinePageResponse();
        }

        const pages = await caches.open(PAGES_CACHE);

        let cached = await pages.match(request, { ignoreSearch: true });
        if (!cached) cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return withOfflineBanner(cached);

        const shell = await caches.match(APP_SHELL_URL);
        if (shell) return withOfflineBanner(shell);

        const offlinePage = await caches.match(OFFLINE_PAGE_URL, { ignoreSearch: true });
        if (offlinePage) return offlinePage;

        return buildOfflinePageResponse();
    }

    /* =======================================================================
       7. ГЛАВНЫЙ ОБРАБОТЧИК ЗАПРОСОВ
       ======================================================================= */

    self.addEventListener('fetch', (event) => {
        const request = event.request;

        // Кэшируем только GET-запросы
        if (request.method !== 'GET') return;

        let url;
        try {
            url = new URL(request.url);
        } catch (error) {
            return;
        }
        if (!isHttp(url)) return;              // chrome-extension:// и прочее

        //🔧ФИКС: картинки контента (обложки турниров, фото товаров) кладём в
        // отдельный кэш — в офлайне они видны, при повторном визите отдаются
        // мгновенно, а код интерфейса ими не вытесняется.
        if (isContentImage(url, request)) {
            event.respondWith(cacheFirst(request, IMAGE_CACHE, {
                ignoreSearch: false,
                maxItems: MAX_IMAGE_ITEMS
            }));
            return;
        }

        if (isLiveData(url)) return;           // Firebase / API / аналитика — только сеть
        // Явный запрет кэша (например, проверка связи) — всегда в сеть
        if (request.cache === 'no-store') return;

        // 1) Загрузка страниц → Network First с фоллбэком на локальную копию
        if (request.mode === 'navigate') {
            event.respondWith(handleNavigation(event));
            return;
        }

        // 2) Статика своего домена → Cache First + ревалидация в фоне
        if (url.origin === self.location.origin) {
            const cacheName = request.destination === 'document' ? PAGES_CACHE : RUNTIME_CACHE;
            event.respondWith(cacheFirst(request, cacheName, { ignoreSearch: true }));
            return;
        }

        // 3) Статика внешних CDN (шрифты, Font Awesome, SDK Firebase) → Cache First
        if (isCacheableCdn(url)) {
            event.respondWith(cacheFirst(request, RUNTIME_CACHE, { ignoreSearch: false }));
            return;
        }

        // 4) Всё остальное (OneSignal CDN и т.п.) — напрямую в сеть
    });

    /* =======================================================================
       8. ПЛАШКА «ОФЛАЙН-РЕЖИМ. ПРОВЕРЬТЕ СЕТЬ»
       -----------------------------------------------------------------------
       Добавляется ТОЛЬКО в офлайне, поверх локальной копии страницы.
       Все классы имеют префикс prorank-offline-, поэтому существующий
       дизайн (style.css, цвета, шрифты, вёрстка) не меняется: онлайн
       страница отдаётся браузеру ровно такой, какой её вернул сервер.
       ======================================================================= */

    const BANNER_CSS = [
        '#prorankOfflineBanner{position:fixed!important;top:0!important;left:0!important;',
        'right:0!important;z-index:2147483000!important;display:flex!important;align-items:center!important;',
        'gap:10px!important;padding:10px 14px!important;margin:0!important;box-sizing:border-box!important;',
        "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif!important;",
        'font-size:13px!important;font-weight:600!important;line-height:1.35!important;letter-spacing:.2px!important;',
        'color:#fbbf24!important;background:linear-gradient(135deg,#1a1a1a 0%,#0f0f0f 60%,#1a1a1a 100%)!important;',
        'border-bottom:1px solid rgba(251,191,36,.35)!important;box-shadow:0 8px 24px rgba(0,0,0,.55)!important;',
        'transform:translateY(-110%)!important;transition:transform .35s ease,color .35s ease!important;}',
        '#prorankOfflineBanner.prorank-offline-visible{transform:translateY(0)!important;}',
        '#prorankOfflineBanner.prorank-offline-restored{color:#4ade80!important;',
        'border-bottom-color:rgba(74,222,128,.45)!important;}',
        '#prorankOfflineBanner .prorank-offline-dot{width:9px!important;height:9px!important;',
        'min-width:9px!important;border-radius:50%!important;background:#fbbf24!important;',
        'animation:prorankOfflinePulse 1.6s ease-out infinite!important;}',
        '#prorankOfflineBanner.prorank-offline-restored .prorank-offline-dot{background:#4ade80!important;',
        'animation:none!important;}',
        '#prorankOfflineBanner .prorank-offline-text{flex:1 1 auto!important;color:inherit!important;',
        'text-align:left!important;}',
        '#prorankOfflineBanner .prorank-offline-retry{flex:0 0 auto!important;padding:7px 16px!important;',
        'border:1px solid rgba(251,191,36,.45)!important;border-radius:40px!important;',
        'background:rgba(251,191,36,.12)!important;color:#fbbf24!important;font:inherit!important;',
        'font-size:12px!important;font-weight:700!important;cursor:pointer!important;}',
        '#prorankOfflineBanner .prorank-offline-retry:active{transform:scale(.96)!important;}',
        '@keyframes prorankOfflinePulse{0%{box-shadow:0 0 0 0 rgba(251,191,36,.55);}',
        '70%{box-shadow:0 0 0 10px rgba(251,191,36,0);}100%{box-shadow:0 0 0 0 rgba(251,191,36,0);}}',
        '@media (max-width:420px){#prorankOfflineBanner{font-size:12px!important;',
        'padding:9px 12px!important;gap:8px!important;}',
        '#prorankOfflineBanner .prorank-offline-retry{padding:6px 13px!important;}}'
    ].join('');

    const BANNER_MARKUP =
        '<div id="' + BANNER_ID + '" role="status" aria-live="polite">' +
            '<span class="prorank-offline-dot"></span>' +
            '<span class="prorank-offline-text">Офлайн-режим. Проверьте сеть</span>' +
            '<button type="button" class="prorank-offline-retry" onclick="window.location.reload()">Обновить</button>' +
        '</div>';

    // Скрипт плашки: сам проверяет связь и сообщает, когда интернет вернулся
    const BANNER_SCRIPT = '<script>(function(){' +
        'var b=document.getElementById("' + BANNER_ID + '");' +
        'if(!b||b.getAttribute("data-prorank-ready"))return;b.setAttribute("data-prorank-ready","1");' +
        'var label=b.querySelector(".prorank-offline-text");var restored=false;' +
        'function show(){b.classList.add("prorank-offline-visible");}' +
        'function setText(t){if(label){label.textContent=t;}}' +
        'function restore(){if(restored)return;restored=true;b.classList.add("prorank-offline-restored");' +
        'setText("Соединение восстановлено. Обновите страницу");' +
        'setTimeout(function(){b.classList.remove("prorank-offline-visible");},4000);}' +
        'function probe(){if(navigator.onLine===false)return;' +
        'fetch(window.location.href,{method:"HEAD",cache:"no-store"}).then(restore).catch(function(){});}' +
        'window.addEventListener("offline",function(){restored=false;' +
        'b.classList.remove("prorank-offline-restored");setText("Офлайн-режим. Проверьте сеть");show();});' +
        'window.addEventListener("online",probe);' +
        'requestAnimationFrame(show);' +
        'setInterval(function(){if(!restored)probe();},15000);' +
        '})();<\/script>';

    // Вставляем плашку в HTML, не трогая остальную разметку страницы
    function addOfflineUi(html) {
        if (!html) return html;
        // Плашка уже присутствует в разметке — второй раз не добавляем.
        // Проверяем и баннер Service Worker'а, и собственную плашку offline.html.
        if (html.indexOf('id="' + BANNER_ID + '"') !== -1) return html;
        if (html.indexOf('class="offline-badge"') !== -1) return html;

        let result = html;
        const styleTag = '<style id="prorankOfflineBannerStyles">' + BANNER_CSS + '</style>';
        const banner = BANNER_MARKUP + BANNER_SCRIPT;

        if (/<\/head>/i.test(result)) result = result.replace(/<\/head>/i, styleTag + '</head>');
        else result = styleTag + result;

        if (/<\/body>/i.test(result)) result = result.replace(/<\/body>/i, banner + '</body>');
        else result += banner;

        return result;
    }

    function htmlHeaders(source, offline) {
        const headers = new Headers(source ? source.headers : undefined);
        // Тело ответа уже распаковано, поэтому транспортные заголовки убираем
        headers.delete('content-encoding');
        headers.delete('content-length');
        headers.delete('transfer-encoding');
        headers.delete('etag');
        headers.delete('last-modified');
        headers.set('Content-Type', 'text/html; charset=utf-8');
        headers.set('Cache-Control', 'no-store');
        headers.set('X-PRORANK-Offline', offline ? '1' : '0');
        return headers;
    }

    // Отдаём локальную копию страницы + плашку «Офлайн-режим. Проверьте сеть»
    async function withOfflineBanner(response) {
        try {
            const type = response.headers.get('content-type') || '';
            if (type.indexOf('text/html') === -1) return response;
            const html = await response.text();
            return new Response(addOfflineUi(html), {
                status: 200,
                statusText: 'OK',
                headers: htmlHeaders(response, true)
            });
        } catch (error) {
            log('Локальную копию обработать не удалось:', error && error.message);
            return buildOfflinePageResponse();
        }
    }

    // Самая крайняя ситуация: кэша нет вовсе (первый визит без интернета).
    // Вместо ошибки браузера отдаём готовую страницу PRORANK.
    function buildOfflinePageHtml() {
        return '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">' +
            '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">' +
            '<meta name="theme-color" content="#fbbf24"><title>Офлайн-режим | PRORANK</title>' +
            '<style id="prorankOfflineBannerStyles">' + BANNER_CSS + '</style>' +
            '<style>html,body{margin:0;padding:0;min-height:100%;background:#0f0f1a;}' +
            'body{display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;' +
            "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff;}" +
            '.prorank-offline-card{max-width:320px;}</style></head><body>' +
            '<div class="prorank-offline-card">' +
            '<img src="' + appUrl('icons/icon-192.png') + '" alt="PRORANK" width="96" height="96" ' +
            'style="border-radius:22px;margin-bottom:18px;">' +
            '<h1 style="font-size:1.35rem;margin:0 0 8px;">Офлайн-режим</h1>' +
            '<p style="color:#aaa;font-size:.9rem;line-height:1.5;margin:0 0 22px;">' +
            'Проверьте сеть — интернет недоступен, поэтому открыта локальная копия приложения.</p>' +
            '<button type="button" onclick="window.location.reload()" ' +
            'style="padding:12px 26px;border:1px solid rgba(251,191,36,.45);border-radius:40px;' +
            'background:rgba(251,191,36,.12);color:#fbbf24;font-size:.85rem;font-weight:700;cursor:pointer;">' +
            'Обновить</button></div>' + BANNER_MARKUP + BANNER_SCRIPT + '</body></html>';
    }

    function buildOfflinePageResponse() {
        return new Response(buildOfflinePageHtml(), {
            status: 200,
            statusText: 'OK',
            headers: htmlHeaders(null, true)
        });
    }

    /* =======================================================================
       9. ОБМЕН СООБЩЕНИЯМИ СО СТРАНИЦЕЙ
       ======================================================================= */

    // Прогреваем кэш страницы, которую пользователь посетил (для офлайна)
    async function warmUpUrls(urls) {
        const cache = await caches.open(PAGES_CACHE);
        await Promise.allSettled(urls.map(async (url) => {
            const response = await fetch(new Request(url, { credentials: 'same-origin' }));
            if (response && response.ok) await cache.put(url, response);
        }));
    }

    self.addEventListener('message', (event) => {
        const data = event.data || {};

        if (data.type === 'SKIP_WAITING') {
            self.skipWaiting();
            return;
        }

        if (data.type === 'GET_VERSION') {
            const payload = { version: SW_VERSION, caches: KEEP_CACHES };
            if (event.ports && event.ports[0]) event.ports[0].postMessage(payload);
            return;
        }

        if (data.type === 'WARM_PAGE' && Array.isArray(data.urls) && data.urls.length) {
            event.waitUntil(warmUpUrls(data.urls));
            return;
        }

        if (data.type === 'CLEAR_CACHES') {
            event.waitUntil((async () => {
                await Promise.all(KEEP_CACHES.map((cacheName) => caches.delete(cacheName)));
                log('Кэши очищены по запросу страницы');
                if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok: true });
            })());
        }
    });

    /* =======================================================================
       10. PUSH-УВЕДОМЛЕНИЯ
       -----------------------------------------------------------------------
       Обрабатываем только обычные JSON-пейлоады. Шифрованные рассылки
       OneSignal обрабатывает собственный воркер (/prorank-live/onesignal/),
       поэтому здесь они игнорируются и дубли уведомлений не появляются.
       ======================================================================= */

    self.addEventListener('push', (event) => {
        let payload = null;
        try {
            payload = event.data ? event.data.json() : null;
        } catch (error) {
            payload = null;
        }
        if (!payload || typeof payload !== 'object') return;

        const title = payload.title || payload.heading || 'PRORANK';
        const options = {
            body: payload.body || payload.content || 'Новое уведомление от PRORANK',
            icon: payload.icon || appUrl('icons/icon-192.png'),
            badge: appUrl('icons/icon-72.png'),
            vibrate: [200, 100, 200],
            data: {
                url: payload.url || payload.data && payload.data.url || BASE,
                messageId: payload.messageId || null
            }
        };

        event.waitUntil(self.registration.showNotification(title, options));
    });

    self.addEventListener('notificationclick', (event) => {
        event.notification.close();
        const targetUrl = (event.notification.data && event.notification.data.url) || BASE;

        event.waitUntil((async () => {
            const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            for (const client of clientList) {
                if (client.url === targetUrl && 'focus' in client) return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
            return null;
        })());
    });

    log('Service Worker загружен: v' + SW_VERSION + ' · scope ' + BASE);

})();
