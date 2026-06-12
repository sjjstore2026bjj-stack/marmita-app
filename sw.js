// ─── SERVICE WORKER — Dona Leninha ───────────────────────────
// Versão com suporte a notificações em segundo plano (PWA minimizado)

const CACHE_NAME = 'dona-leninha-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './logo.jpg'
];

// ── Instalação: cache dos assets essenciais ──────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ── Ativação: limpa caches antigos ───────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: serve do cache quando offline ─────────────────────
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ── NOTIFICATIONCLICK: abre/foca o app ao tocar na notificação ─
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
      // Se já tem uma aba/janela do app aberta, foca nela
      for(const client of list){
        if(client.url.includes(self.location.origin) && 'focus' in client){
          return client.focus();
        }
      }
      // Se não tem, abre uma nova
      return clients.openWindow('./');
    })
  );
});

// ── PUSH: recebe push do servidor (para uso futuro com FCM) ──
self.addEventListener('push', e => {
  let data = { titulo: '🍱 Novo Pedido!', corpo: 'Um novo pedido chegou.' };
  try { if(e.data) data = e.data.json(); } catch(_){}
  e.waitUntil(
    self.registration.showNotification(data.titulo, {
      body: data.corpo,
      icon: './logo.jpg',
      badge: './logo.jpg',
      vibrate: [200,100,200,100,200],
      tag: 'novo-pedido',
      renotify: true
    })
  );
});
