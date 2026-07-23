// SPDX-License-Identifier: GPL-3.0-or-later
/*
  Service Worker for Pokédex.
  Per-resource caching, each in its own bucket:
   - shell : cache-first for the app shell (precached on install)
   - api   : stale-while-revalidate for PokeAPI JSON, capped (FIFO eviction)
   - img   : cache-first for sprites (immutable), capped (FIFO eviction)
*/

const VERSION = "v10";
const SHELL_CACHE = `pokedex-shell-${VERSION}`;
const API_CACHE = `pokedex-api-${VERSION}`;
const IMG_CACHE = `pokedex-img-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, API_CACHE, IMG_CACHE];

// Caps keep the persistent caches from growing without bound as the user
// browses the full dex — otherwise storage pressure can evict the whole
// origin cache and break offline support.
const MAX_API_ENTRIES = 400;
const MAX_IMG_ENTRIES = 400;

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

// Evict oldest entries (FIFO — Cache.keys() is insertion-ordered) once a
// cache exceeds its cap.
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxItems; i++) {
    await cache.delete(keys[i]);
  }
}

// Install - pre-cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting()),
  );
});

// Activate - drop any cache that is not part of this version
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (!CURRENT_CACHES.includes(key)) return caches.delete(key);
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Cache-first for the app shell (same-origin JS/CSS/HTML/icons/manifest)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          // Only cache genuine same-origin ("basic") 200s.
          if (response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Stale-while-revalidate for PokeAPI JSON (capped)
  if (url.hostname === "pokeapi.co") {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response.status === 200) {
              const clone = response.clone();
              caches.open(API_CACHE).then((cache) =>
                cache
                  .put(event.request, clone)
                  .then(() => trimCache(API_CACHE, MAX_API_ENTRIES)),
              );
            }
            return response;
          })
          .catch((error) => {
            if (cached) return cached;
            throw error;
          });
        return cached || fetchPromise;
      }),
    );
    return;
  }

  // Cache-first for sprites (immutable, capped). Cross-origin sprite responses
  // are opaque (status 0), so cache on ok OR opaque.
  if (event.request.destination === "image") {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && (response.ok || response.type === "opaque")) {
            const clone = response.clone();
            caches.open(IMG_CACHE).then((cache) =>
              cache
                .put(event.request, clone)
                .then(() => trimCache(IMG_CACHE, MAX_IMG_ENTRIES)),
            );
          }
          return response;
        });
      }),
    );
    return;
  }

  // Default: network, fall back to any cache
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// Handle messages to skip waiting
self.addEventListener("message", (event) => {
  // Ignore messages from any other origin (defense-in-depth).
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
