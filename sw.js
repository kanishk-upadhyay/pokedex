/*
  Service Worker for Pokédex
  - Caches static assets (app shell) for faster repeat loads
  - Caches API responses (PokeAPI) with network-first strategy
  - Caches images (sprites) with cache-first strategy
  - Cleans up old caches on activation
*/

const STATIC_CACHE = 'pokedex-static-v1';
const API_CACHE = 'pokedex-api-v1';
const IMAGE_CACHE = 'pokedex-images-v1';

const PRECACHE_URLS = [
  '/', // allow navigating directly to root
  '/index.html',
  '/css/style.css',
  '/css/animations.css',
  '/js/pokedex.js'
];

// Install - pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        // install shouldn't fail the whole SW if caching optional assets fail
        console.warn('SW install caching failed:', err);
      })
  );
});

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
  const allowed = [STATIC_CACHE, API_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.map((k) => {
          if (!allowed.includes(k)) return caches.delete(k);
          return Promise.resolve(); // keep allowed caches
        })
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch - routing strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) PokeAPI requests -> network-first with cache fallback
  if (url.hostname.includes('pokeapi.co')) {
    event.respondWith(networkFirst(req, API_CACHE, { jsonFallback: true }));
    return;
  }

  // 2) Images / sprites -> cache-first (fast) with network fallback
  if (req.destination === 'image' || /\.(png|jpg|jpeg|gif|svg|webp)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req, IMAGE_CACHE));
    return;
  }

  // 3) App shell and same-origin navigation/static assets -> cache-first with background update
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  // 4) Default to network, fallback to cache
  event.respondWith(defaultNetworkFallback(req));
});

// Utility: network-first for APIs
async function networkFirst(request, cacheName, options = {}) {
  try {
    const networkResponse = await fetch(request);
    // Only cache successful responses (status 200)
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // network failed, try cache
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    if (options.jsonFallback) {
      // Return a small JSON error response so the app can handle it gracefully
      return new Response(JSON.stringify({ error: 'offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return Response.error();
  }
}

// Utility: cache-first for images
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // No network and no cache - respond with error
    return Response.error();
  }
}

// Utility: stale-while-revalidate for static assets (serve cache, but update in background)
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Kick off an update in background
  const fetchUpdate = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
    })
    .catch(() => {
      // ignore network errors in update
    });

  // If we have a cached response, return it immediately and update in background
  if (cached) {
    // ensure the update runs but do not wait for it
    fetchUpdate;
    return cached;
  }

  // Otherwise, wait for the network and cache it
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // fallback to cache (already attempted) or error
    const fallback = await cache.match('/index.html');
    return fallback || Response.error();
  }
}

// Default: try network, fallback to any cache match
async function defaultNetworkFallback(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

// Allow pages to send a message to activate new SW immediately
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
