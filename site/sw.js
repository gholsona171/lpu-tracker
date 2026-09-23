// App shell cache. Same-origin GETs are served stale-while-revalidate so the app opens
// offline and picks up new versions on the next launch. API calls are never cached.
const CACHE = 'lpu-shell-v2';
const SHELL = ['./', 'index.html', 'checkin.html', 'css/app.css', 'manifest.webmanifest', 'icons/logo-160.png',
  'icons/icon-192.png', 'js/app.js', 'js/checkin-page.js', 'js/config.js', 'vendor/qrcode.mjs'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isPage = url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: isPage });
    const net = fetch(e.request).then((r) => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    // Pages and scripts are network-first so a new deploy shows up on the next open; the cache is the offline fallback.
    return isPage || url.pathname.endsWith('.js') || url.pathname.endsWith('.mjs') || url.pathname.endsWith('.css') ? net.then((r) => r || hit) : hit || net;
  }));
});
