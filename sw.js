// 1. Versioning: Update this (v2, v3, etc.) whenever you push a new version to GitHub.
// This forces the browser to recognize a change and clean up old files.
const CACHE_NAME = 'dnd-sheet-v2';
const ASSETS = ['./', './index.html', './manifest.json'];

// 2. Install Event: Cache core assets immediately
self.addEventListener('install', (e) => {
  // Forces this new service worker to become active immediately, skipping the "waiting" state
  self.skipWaiting();

  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }),
  );
});

// 3. Activate Event: Clean up old caches from previous versions
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache', key);
            return caches.delete(key);
          }
        }),
      );
    }),
  );
  // Tell the Service Worker to take control of all open pages immediately
  return self.clients.claim();
});

// 4. Fetch Event: Network-First Strategy
self.addEventListener('fetch', (e) => {
  // Ignore Firebase/Google API requests (let them go to network standardly)
  if (e.request.url.includes('googleapis.com') || e.request.url.includes('firebaseapp.com')) {
    return;
  }

  // Network First Logic:
  // 1. Try to fetch from the network (GitHub)
  // 2. If successful, update the cache with the new version and return it
  // 3. If offline/failed, return the cached version
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response (streams can only be read once)
        const responseToCache = response.clone();

        // Update the cache with the new file from the network
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        // If the network fails (offline), fall back to the cache
        return caches.match(e.request);
      }),
  );
});
