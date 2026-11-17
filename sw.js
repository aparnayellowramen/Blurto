// Offline support. Network first (so updates show up straight away),
// falling back to the cache when offline or when the network is slow.
const CACHE = 'blurto-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon.svg',
  'data/topics.json',
  'src/styles.css',
  'src/app.js',
  'src/frameworks.js',
  'src/queue.js',
  'src/timer.js',
  'src/storage.js',
  'src/device.js',
  'src/mascot.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(req), timeout(4000)]);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = (await cache.match(req, { ignoreSearch: true }))
        || (req.mode === 'navigate' && (await cache.match('index.html')));
      return hit || Response.error();
    }
  })());
});
