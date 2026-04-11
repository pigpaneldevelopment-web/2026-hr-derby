// ═══════════════════════════════════════════════════════════════
//  HR Derby Pool — Service Worker
//  Strategy: Cache-first for app shell, network-only for MLB API
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME   = 'hrderby-v1';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap',
];

// MLB Stats API — never cache, always network
const NEVER_CACHE = [
  'statsapi.mlb.com',
  'fonts.gstatic.com', // font files — browser handles these
];

// ── INSTALL: cache the app shell ──────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing…');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── ACTIVATE: clean up old caches ────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating…');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => { console.log('[SW] Deleting old cache:', key); return caches.delete(key); })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: cache-first for shell, network for API ────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always go to network for MLB API and external data
  const isExternal = NEVER_CACHE.some(host => url.hostname.includes(host));
  if (isExternal || url.hostname !== self.location.hostname) {
    // For MLB API: network with a timeout, don't cache
    if (url.hostname.includes('statsapi.mlb.com')) {
      event.respondWith(
        fetch(event.request, { signal: AbortSignal.timeout?.(8000) })
          .catch(() => new Response(JSON.stringify({ error: 'offline' }), {
            headers: { 'Content-Type': 'application/json' }
          }))
      );
      return;
    }
    // Other external (fonts etc.) — network first, cache fallback
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Same-origin app shell — cache first, network fallback
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
      .catch(() => caches.match('./index.html')) // fallback to app shell
  );
});

// ── MESSAGE: force update ─────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
