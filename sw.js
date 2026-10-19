// Service worker: aplikace funguje i bez připojení.
//
// Strategie „nejdřív síť“: online se vždy načte aktuální verze (a uloží se),
// offline se použije uložená. Při nasazení se do VERSION doplní commit
// a do precache.json seznam všech souborů, takže se uloží předem celé.

const VERSION = '__VERSION__';
const CACHE = `ergocube-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch('precache.json', { cache: 'no-store' });
      if (res.ok) await cache.addAll(await res.json());
    } catch { /* bez seznamu (vývoj) se soubory ukládají průběžně */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('./')) ?? (await cache.match('index.html')) ?? Response.error();
      return Response.error();
    }
  })());
});
