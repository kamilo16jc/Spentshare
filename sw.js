const CACHE_NAME = 'spentshare-v18';
// Relative paths (resolved against the SW's own location) so the same file
// works both on GitHub Pages (/Spentshare/) and on the custom domain (root).
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/base.css',
  'css/splash.css',
  'css/auth.css',
  'css/groups.css',
  'css/modals.css',
  'css/dashboard.css',
  'css/forms.css',
  'css/stats.css',
  'css/profile.css',
  'js/firebase.js',
  'js/state.js',
  'js/i18n.js',
  'js/ui.js',
  'js/currency.js',
  'js/auth.js',
  'js/avatar.js',
  'js/members.js',
  'js/groups.js',
  'js/expenses.js',
  'js/balances.js',
  'js/stats.js',
  'js/profile.js',
  'js/app.js'
];

// Install — cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Add each asset independently so one 404 can't abort the whole install
      // (which would leave the old service worker serving stale files forever).
      Promise.all(ASSETS.map(url => cache.add(url).catch(() => null)))
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
