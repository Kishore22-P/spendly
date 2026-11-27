// Spendly — Offline-Friendly App Shell Service Worker
const CACHE_NAME = 'spendly-shell-v18';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './login.html',
  './register.html',
  './forgot-password.html',
  './dashboard.html',
  './add-expense.html',
  './daily-report.html',
  './weekly-report.html',
  './monthly-report.html',
  './history.html',
  './budget.html',
  './profile.html',
  './manifest.json',
  './css/style.css',
  './css/auth.css',
  './css/dashboard.css',
  './css/responsive.css',
  './js/firebase.js',
  './js/utils.js',
  './js/ui.js',
  './js/store.js',
  './js/auth.js',
  './js/dashboard.js',
  './js/expense.js',
  './js/daily-report.js',
  './js/weekly-report.js',
  './js/monthly-report.js',
  './js/history.js',
  './js/budget.js',
  './js/profile.js',
  './assets/images/logo.png',
  './assets/images/logo-icon.png',
  './assets/images/favicon.png',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png',
  './assets/images/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Skip Firebase Auth & PostgreSQL API requests
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    return;
  }

  // Only handle same-origin requests with network-first + cache fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
