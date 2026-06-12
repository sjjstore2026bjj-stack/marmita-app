// ─── SERVICE WORKER — Dona Leninha v5 ────────────────────────
// Monitora Firestore via REST quando a aba está em segundo plano

const CACHE_NAME = 'dona-leninha-v5';
const ASSETS_STATIC  = ['./logo.jpg'];
const ASSETS_NETWORK = ['./', './index.html', './manifest.json'];

// ── Instalação ────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c =>
      c.addAll([...ASSETS_STATIC, ...ASSETS_NETWORK])
    )
  );
  self.skipWaiting();
});

// ── Ativação ──────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Cache strategy ────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if(url.hostname.includes('googleapis.com') ||
     url.hostname.includes('gstatic.com') ||
     url.hostname.includes('firebaseapp.com')) return;

  if(ASSETS_STATIC.some(a => url.pathname.endsWith(a.replace('./','')))){
    e.respondWith(
      caches.match(e.request).then(c => c || fetch(e.request).then(r => {
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, r.clone()));
        return r;
      }))
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(r => { caches.open(CACHE_NAME).then(c => c.put(e.request, r.clone())); return r; })
      .catch(() => caches.match(e.request))
  );
});

// ── MONITOR BACKGROUND ────────────────────────────────────────
let _monitorTimer = null;
let _ultimoId     = null;
let _projectId    = null;
let _apiKey       = null;

async function checarNovoPedido() {
  if(!_projectId || !_apiKey) return;
  try {
    // Busca o pedido mais recente via Firestore REST API
    const url =
      `https://firestore.googleapis.com/v1/projects/${_projectId}/databases/(default)/documents:runQuery?key=${_apiKey}`;

    const body = {
      structuredQuery: {
        from: [{ collectionId: 'pedidos' }],
        orderBy: [{ field: { fieldPath: 'criadoEm' }, direction: 'DESCENDING' }],
        limit: 1
      }
    };

    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const json = await res.json();
    const doc  = json?.[0]?.document;
    if(!doc) return;

    // Extrai o ID do documento (último segmento do name)
    const id = doc.name.split('/').pop();
    if(!id || id === _ultimoId) return;

    const fields = doc.fields || {};
    const nome   = fields.nome?.stringValue       || 'Cliente';
    const prod   = fields.nomeProduto?.stringValue || 'Marmita';
    const hora   = fields.horario?.stringValue     || '';
    const criadoEm = fields.criadoEm?.stringValue  || '';

    // Marca como visto independente de notificar ou não
    _ultimoId = id;

    // Ignora pedidos antigos (criados há mais de 2 minutos) — evita
    // notificação "fantasma" de pedido já existente quando o SW
    // acorda e vê o último pedido do banco por primeira vez.
    if(criadoEm){
      const criadoTs = Date.parse(criadoEm);
      if(!isNaN(criadoTs) && (Date.now() - criadoTs) > 120000) return;
    }

    // Notifica o SW → mostra no celular
    self.registration.showNotification('🍱 Novo Pedido — Dona Leninha', {
      body: `${nome} — ${prod}${hora ? ' ('+hora+')' : ''}`,
      icon: './logo.jpg',
      badge: './logo.jpg',
      vibrate: [200, 100, 200, 100, 200],
      tag: 'novo-pedido',
      renotify: true,
      data: { url: './' }
    });

    // Avisa a aba (se estiver aberta em background) para atualizar o estado
    self.clients.matchAll({ type: 'window' }).then(list => {
      list.forEach(c => c.postMessage({ tipo: 'NOVO_PEDIDO_ID', id }));
    });

  } catch(err) {
    console.warn('[SW] checarNovoPedido erro:', err);
  }
}

function pararMonitor() {
  if(_monitorTimer) { clearInterval(_monitorTimer); _monitorTimer = null; }
}

function iniciarMonitor(ultimoId, projectId, apiKey) {
  pararMonitor();
  _ultimoId   = ultimoId;
  _projectId  = projectId;
  _apiKey     = apiKey;
  // Verifica imediatamente e depois a cada 20 segundos
  checarNovoPedido();
  _monitorTimer = setInterval(checarNovoPedido, 20000);
  console.log('[SW] Monitor background iniciado. Último ID:', ultimoId);
}

// ── MENSAGENS DA PÁGINA ───────────────────────────────────────
self.addEventListener('message', e => {
  const { tipo } = e.data || {};

  if(tipo === 'START_MONITOR'){
    const { ultimoId, projectId, apiKey } = e.data;
    iniciarMonitor(ultimoId, projectId, apiKey);
  }

  if(tipo === 'STOP_MONITOR'){
    pararMonitor();
    console.log('[SW] Monitor background parado (aba voltou ao foco)');
  }

  if(tipo === 'SET_CREDENCIAIS'){
    // Guarda credenciais para uso pelo Periodic Background Sync,
    // sem ligar o setInterval (que é encerrado junto com o SW).
    const { ultimoId, projectId, apiKey } = e.data;
    if(ultimoId) _ultimoId = ultimoId;
    _projectId = projectId;
    _apiKey    = apiKey;
    console.log('[SW] Credenciais recebidas. Último ID:', _ultimoId);
  }
});

// ── PERIODIC BACKGROUND SYNC ──────────────────────────────────
// Disparado pelo navegador periodicamente, mesmo com o app fechado
// (requer PWA instalado + permissão concedida). Substitui o setInterval,
// que é encerrado quando o navegador finaliza o Service Worker ocioso.
self.addEventListener('periodicsync', e => {
  if(e.tag === 'checar-pedidos'){
    e.waitUntil(checarNovoPedido());
  }
});

// ── NOTIFICATIONCLICK: toca na notificação → abre o app ──────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for(const client of list){
        if(client.url.includes(self.location.origin) && 'focus' in client)
          return client.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// ── PUSH: FCM futuro ─────────────────────────────────────────
self.addEventListener('push', e => {
  let data = { titulo: '🍱 Novo Pedido!', corpo: 'Um novo pedido chegou.' };
  try { if(e.data) data = e.data.json(); } catch(_){}
  e.waitUntil(
    self.registration.showNotification(data.titulo, {
      body: data.corpo,
      icon: './logo.jpg',
      badge: './logo.jpg',
      vibrate: [200, 100, 200, 100, 200],
      tag: 'novo-pedido',
      renotify: true
    })
  );
});
