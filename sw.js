/*
  Simple Service Worker for Pokédex
  - Basic caching of static assets
  - Simple network-first strategy for all requests
*/

const CACHE_NAME = "pokedex-v4";

const STATIC_FILES = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/index.js",
  "/js/api.js",
  "/js/controller.js",
  "/js/dom.js",
  "/js/ui.js",
  "/js/search.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install - pre-cache static files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting()),
  );
});

// Activate - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch - smart caching strategy
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Cache-first for static assets (JS, CSS, HTML)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((response) => {
          // Only cache genuine same-origin ("basic") 200s — never an opaque
          // or cross-origin redirect that slipped through.
          if (response.status === 200 && response.type === "basic") {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      }),
    );
    return;
  }

  // Stale-While-Revalidate for API calls: return cached data immediately while fetching fresh data in background
  if (url.hostname === "pokeapi.co") {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Fetch fresh data in the background
        const fetchPromise = fetch(event.request).then((response) => {
          // Update cache with fresh response
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        }).catch((error) => {
          // If network request fails, return cached response if available
          if (cachedResponse) {
            return cachedResponse;
          }
          throw error;
        });

        // Return cached response if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Cache-first for images (sprites are immutable). Cross-origin sprite
  // responses are opaque (status 0), so cache on ok OR opaque.
  if (event.request.destination === "image") {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && (response.ok || response.type === "opaque")) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Default: try network, fallback to cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)),
  );
});

// Handle messages to skip waiting
self.addEventListener("message", (event) => {
  // Ignore messages from any other origin (defense-in-depth).
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
