const CACHE_NAME = 'dnd-sheet-v1';
const ASSETS = [
    './',
    './index.html',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (e) => {
    // Check if the request is for Firebase/Google services
    if (event.request.url.includes('googleapis.com') || 
        event.request.url.includes('firebaseapp.com')) {
      // Let these requests go straight to the network
      return;
    }

    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        })
    );
});
