// ═══════════════════════════════════════════════════════
//  2026 HOME RUN DERBY — SERVICE WORKER
//  Bump CACHE_VERSION whenever the app HTML changes so
//  users always get the latest version automatically.
// ═══════════════════════════════════════════════════════

const CACHE_VERSION = 'derby-v4';
const CACHE_STATIC  = 'derby-static-v4';
const CACHE_FONTS   = 'derby-fonts-v1';   // fonts rarely change — separate cache

// Assets to pre-cache on install
const PRECACHE_URLS = [
  './',           // the HTML shell
  './index.html',
];

// ── INSTALL — pre-cache shell ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())   // activate immediately, don't wait for old SW
  );
});

// ── ACTIVATE — purge stale caches ─────────────────────
self.addEventListener('activate', event => {
  const keep = new Set([CACHE_STATIC, CACHE_FONTS]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !keep.has(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())  // take control of all open tabs immediately
  );
});

// ── FETCH — routing logic ──────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // ── MLB Stats API — network only, no caching ──
  // Live HR data must always be fresh. If offline, fail gracefully.
  if (url.hostname === 'statsapi.mlb.com') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => new Response(
          JSON.stringify({ leagueLeaders: [], stats: [], transactions: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ))
    );
    return;
  }

  // ── Google Fonts CSS + font files — cache-first ──
  // Fonts are versioned by Google, safe to cache indefinitely.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_FONTS).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // ── App shell (HTML, icons, manifest) — network-first, cache fallback ──
  // Try network so updates are picked up; fall back to cached version offline.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          caches.open(CACHE_STATIC)
            .then(cache => cache.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ── PUSH NOTIFICATIONS (already wired in app) ─────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const { title, body, icon, badge, tag } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, { body, icon, badge, tag, renotify: true })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Focus existing open window if there is one
        const existing = clientList.find(c => c.url && 'focus' in c);
        if (existing) return existing.focus();
        return clients.openWindow('./');
      })
  );
});
