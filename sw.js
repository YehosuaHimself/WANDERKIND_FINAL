/**
 * Wanderkind Service Worker
 *
 * Strategy:
 *   - HTML: network-first with cache fallback (so updates land fast)
 *   - CSS / JS / fonts: stale-while-revalidate (instant load, fresh in bg)
 *   - Images: cache-first (long-lived)
 *   - API (Supabase REST): network-only (never cache user data)
 *
 * Versioning: bump VERSION → activate purges all old caches, claims
 * clients, and force-reloads any open tabs so users land on the new
 * bundle without manual refresh.
 */

const VERSION = '0.1.36-day4-pass-public';
const CACHE_NAME = `wk-${VERSION}`;
const PRECACHE = [
  '/',
  '/index.html',     // marketing landing (desktop)
  '/install.html',   // mobile gate
  '/app.html',       // the actual PWA shell
  '/map.html',       // map register page
  '/u/index.html',   // public-pass page (404 routes /u/<X> to ?id=X)
  '/js/pass-public.js',
  '/auth.html',      // magic-link sign-in
  '/me.html',        // signed-in profile
  '/more.html',      // central hub
  '/me-edit.html',   // profile editor
  '/settings.html',  // placeholder (Coming soon)
  '/host.html',      // placeholder (Coming soon)
  '/way.html',       // placeholder (Coming soon)
  '/pass.html',      // placeholder (Coming soon)
  '/vouches.html',   // placeholder (Coming soon)
  '/privacy-policy.html',
  '/terms.html',
  '/imprint.html',
  '/404.html',
  '/manifest.json',
  '/version.json',
  '/css/tokens.css',
  '/css/base.css',
  '/css/typography.css',
  '/css/components.css',
  '/js/main.js',
  '/js/sw-register.js',
  '/js/install-gate.js',
  '/js/auth.js',
  '/js/session.js',
  '/js/me.js',
  '/js/more.js',
  '/js/me-edit.js',
  '/js/uploads.js',
  '/js/wk-tabbar.js',
  '/js/supabase-config.js',
  '/js/auth-bypass.js',
  '/js/map-session-aware.js',
  '/js/map-leaflet.js',
  '/js/vendor/leaflet.js',
  '/css/vendor/leaflet.css',
  '/css/vendor/images/marker-icon.png',
  '/css/vendor/images/marker-icon-2x.png',
  '/css/vendor/images/marker-shadow.png',
  '/css/vendor/images/layers.png',
  '/css/vendor/images/layers-2x.png',
  '/js/pwa-mode.js',

  /* Icons — offline first-load needs these or every seal renders as
     a broken-image. Lightweight (<200KB combined). */
  '/assets/icons/seal.svg',
  '/assets/icons/seal-parchment.svg',
  '/assets/icons/seal-icon.svg',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-512.png',
  '/assets/icons/favicon-16.png',
  '/assets/icons/favicon-32.png',
  '/assets/icons/favicon.ico',
  '/assets/icons/qr-wanderkind.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache what we can; tolerate missing files during early development.
    await Promise.all(PRECACHE.map(url =>
      cache.add(url).catch(() => { /* file may not exist yet */ })
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Purge old caches
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
    // Force any open clients to reload onto the new bundle
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(client.url); } catch { /* ignore */ }
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept cross-origin or non-GET requests
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never cache the Supabase API or version probe — always network
  if (url.pathname === '/version.json') {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // HTML — network-first
  if (req.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(networkFirst(req));
    return;
  }

  // CSS / JS / fonts — stale-while-revalidate
  if (['style', 'script', 'font'].includes(req.destination)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Images — cache-first
  if (req.destination === 'image') {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Everything else — try cache then network
  event.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    const url = new URL(req.url);
    return (
      (await cache.match(req)) ||
      (await cache.match(url.pathname)) ||
      (await cache.match('/404.html')) ||
      (await cache.match('/index.html')) ||
      Response.error()
    );
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(res => {
    cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => cached || Response.error());
  return cached || fetchPromise;
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    return Response.error();
  }
}
