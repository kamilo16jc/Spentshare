const CACHE_NAME = 'spentshare-v6';
const ASSETS = [
  '/Spentshare/',
  '/Spentshare/index.html',
  '/Spentshare/manifest.json',
  '/Spentshare/css/base.css',
  '/Spentshare/css/splash.css',
  '/Spentshare/css/auth.css',
  '/Spentshare/css/groups.css',
  '/Spentshare/css/modals.css',
  '/Spentshare/css/dashboard.css',
  '/Spentshare/css/forms.css',
  '/Spentshare/css/stats.css',
  '/Spentshare/css/profile.css',
  '/Spentshare/js/firebase.js',
  '/Spentshare/js/state.js',
  '/Spentshare/js/i18n.js',
  '/Spentshare/js/ui.js',
  '/Spentshare/js/currency.js',
  '/Spentshare/js/auth.js',
  '/Spentshare/js/avatar.js',
  '/Spentshare/js/members.js',
  '/Spentshare/js/groups.js',
  '/Spentshare/js/expenses.js',
  '/Spentshare/js/balances.js',
  '/Spentshare/js/stats.js',
  '/Spentshare/js/profile.js',
  '/Spentshare/js/app.js',
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;900&family=Nunito+Sans:wght@300;400;600&display=swap'
];

// Install — cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
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
      const network = fetch(e.request)
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
