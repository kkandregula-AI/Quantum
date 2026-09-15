/* QuantumX service worker — offline after first load.
   Strategy:
   - Precache the core files that exist alongside this worker.
   - Runtime: stale-while-revalidate for everything else (incl. Google Fonts),
     so the whole app + fonts are available offline once visited.
   Bump CACHE when you ship a new build to force an update. */

const CACHE = 'quantumx-v3';

/* Core same-origin assets. The HTML document itself is cached at runtime on
   first navigation, so this works whether the page is index.html or
   quantumx.html — no need to hardcode the document filename. */
const CORE = ['./', 'manifest.json', 'icon.svg'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // add individually so one missing file can't abort the whole install
      Promise.allSettled(CORE.map((url) => cache.add(url)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function putInCache(cache, request, response) {
  // Only cache complete, cacheable responses. Opaque (status 0) responses are
  // skipped; Google Fonts serves proper CORS responses, so they cache fine.
  if (response && response.status === 200 && response.type !== 'opaqueredirect') {
    try { cache.put(request, response.clone()); } catch (e) { /* ignore */ }
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);

    // Kick off a network refresh in the background (stale-while-revalidate).
    const network = fetch(req)
      .then((res) => putInCache(cache, req, res))
      .catch(() => undefined);

    if (cached) return cached;

    const fresh = await network;
    if (fresh) return fresh;

    // Offline and uncached: for a page navigation, fall back to the app shell.
    if (req.mode === 'navigate') {
      const shell = (await cache.match('./')) || (await cache.match('index.html'));
      if (shell) return shell;
    }
    return new Response('Offline and not cached yet.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  })());
});
