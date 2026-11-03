// DOOD service worker: makes the app installable. It never stores data or pages, so what you see is always live.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request).catch(() => new Response('<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:sans-serif;padding:2rem"><h2>DOOD cannot connect</h2><p>Check your internet or office network, then reload.</p>', { headers: { 'Content-Type': 'text/html' } })));
});
