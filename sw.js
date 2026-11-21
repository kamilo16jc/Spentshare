// v32: notificaciones al teléfono (Web Push).
// Cambiar el número en cada publicación.
const CACHE_NAME = 'spentshare-v32';
// Relative paths (resolved against the SW's own location) so the same file
// works both on GitHub Pages (/Spentshare/) and on the custom domain (root).
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'js/firebase.js',
  'js/i18n.js',
  'js/core.js',
  'js/data.js',
  'js/views.js',
  'js/sheets.js',
  'js/app.js',
  'js/push.js',
  'functions/merchants.js',
  'brand/logo-3d-392.webp',
  'brand/logo-3d-588.webp',
  'brand/logo-3d-392.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-192.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'favicon-32.png',
  'favicon-48.png'
];

// Install — cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Add each asset independently so one 404 can't abort the whole install
      // (which would leave the old service worker serving stale files forever).
      // cache:'reload' = pedirlo al servidor, no a la memoria del navegador: GitHub Pages deja
      // cada archivo 10 min en esa memoria y la caché nueva quedaba con JS/CSS viejos mezclados.
      Promise.all(ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)))
    )
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Notificaciones (Web Push, functions/push.js): {title, body, url, tag}
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'SpentShare', {
    body: d.body || '', icon: 'icon-192.png', badge: 'favicon-48.png',
    tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || './' },
  }));
});
// Tocar el aviso: abre la app (o la que ya está abierta) en ese cobro o gasto
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) return open.navigate(url).then(c => (c || open).focus()).catch(() => open.focus());
    return self.clients.openWindow(url);
  }));
});

// Fetch strategy:
//  - Only GET requests (POST to Cloud Functions etc. must never be cached)
//  - Firebase/Firestore → always network
//  - HTML navigations → network first (so deploys arrive), cache fallback offline
//  - Static assets (css/js/img/fonts) → cache first (instant loads), refresh in background
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (url.includes('firestore.googleapis.com') ||
      url.includes('firebase') ||
      url.includes('cloudfunctions.net') ||
      url.includes('gstatic.com/firebasejs')) {
    return;
  }

  // HTML: network first
  if (e.request.mode === 'navigate' || url.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets: cache first + background refresh (stale-while-revalidate)
  e.respondWith(
    caches.match(e.request).then(cached => {
      // los de este sitio se revalidan con el servidor (304 si no cambiaron)
      const sameOrigin = new URL(url).origin === self.location.origin;
      const network = fetch(sameOrigin ? new Request(e.request, { cache: 'no-cache' }) : e.request)
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
