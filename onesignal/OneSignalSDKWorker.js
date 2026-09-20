/* ============================================================================
   OneSignal Service Worker — актуальный путь
   (/prorank-live/onesignal/OneSignalSDKWorker.js).

   Scope этого воркера: /prorank-live/onesignal/
   Поэтому он не конфликтует с PWA-воркером /prorank-live/sw.js, который
   владеет основным scope и отвечает за офлайн-режим.

   ВАЖНО: адрес CDN — .../web/v16/OneSignalSDK.sw.js.
   Прежний адрес .../OneSignalSDKWorker.js отдаёт 404, из-за чего воркер
   не устанавливался и push-уведомления не работали.
   ========================================================================= */

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
