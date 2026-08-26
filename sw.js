/* Borneo Arts Festival 2026 — Service Worker */
const CACHE = 'baf2026-v2';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Let cross-origin (Firebase, gstatic, CDNs, QR API) go straight to network.
  if (url.origin !== self.location.origin) return;

  // App navigations: network-first, fall back to cached shell (offline / standalone launch).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Same-origin static assets: cache-first, then update.
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});

/* =========================================================
   BAF 2026 — Web Push Notification Handler
   ========================================================= */

self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    try {
      data = event.data ? { body: event.data.text() } : {};
    } catch (_) {
      data = {};
    }
  }

  const title = data.title || 'BAF 2026';
  const body = data.body || 'Makluman baharu tersedia.';

  const options = {
    body,
    icon: data.icon || './icon-192.png',
    badge: data.badge || './icon-192.png',
    tag: data.tag || `baf-${data.type || 'general'}-${data.matchId || Date.now()}`,
    renotify: Boolean(data.renotify),
    requireInteraction: Boolean(data.requireInteraction),
    data: {
      url: data.url || './',
      type: data.type || 'general',
      category: data.category || '',
      session: data.session || '',
      matchId: data.matchId || '',
      teamA: data.teamA || '',
      teamB: data.teamB || '',
      scoreA: data.scoreA ?? '',
      scoreB: data.scoreB ?? '',
      winner: data.winner || ''
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || './';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      for (const client of clientList) {
        try {
          const current = new URL(client.url);
          const target = new URL(targetUrl, self.location.origin);

          if (current.origin === target.origin && 'focus' in client) {
            if ('navigate' in client && current.href !== target.href) {
              return client.navigate(target.href).then(() => client.focus());
            }
            return client.focus();
          }
        } catch (_) {}
      }

      return clients.openWindow
        ? clients.openWindow(new URL(targetUrl, self.location.origin).href)
        : undefined;
    })
  );
});

self.addEventListener('notificationclose', () => {});
