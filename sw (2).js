const CACHE_NAME = 'dona-leninha-v1';
const ASSETS = [
  './',
  './index.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Requisições ao Firebase e APIs externas: sempre vai na rede
  const url = e.request.url;
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('nominatim.openstreetmap.org') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Demais assets: cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
