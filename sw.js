// Service worker: celá aplikace (i hledání algoritmů a test metody – běží v prohlížeči,
// ve WebAssembly a workerech) funguje bez připojení.
//
// Při nasazení se do VERSION doplní commit a do precache.json seznam všech souborů.
// Instalace je uloží všechny předem (každý zvlášť, s opakováním – jeden výpadek
// nezahodí celý seznam); stará verze se smaže, až když je nová uložená celá.
// Soubory verze se pak berou z uložených (rychle a stejně online i offline, žádné
// čekání na slabý signál); nová verze se projeví při dalším otevření aplikace.
// Bez seznamu (vývoj) „nejdřív síť“: vždy aktuální soubory, offline uložené.

const VERSION = '__VERSION__';
const CACHE = `ergocube-${VERSION}`;
const DEV = !/^[0-9a-f]{6,}$/.test(VERSION);
const DONE = '__complete__'; // značka: verze je uložená celá

async function precache() {
  const cache = await caches.open(CACHE);
  let list;
  try {
    const res = await fetch('precache.json', { cache: 'no-store' });
    if (!res.ok) return null;
    list = await res.json();
  } catch { return null; }
  const missing = [];
  // po skupinách, každý soubor až třikrát
  for (let i = 0; i < list.length; i += 8) {
    await Promise.all(list.slice(i, i + 8).map(async (url) => {
      if (await cache.match(url)) return;
      for (let k = 0; k < 3; k++) {
        try { await cache.add(new Request(url, { cache: 'reload' })); return; } catch { /* znovu */ }
      }
      missing.push(url);
    }));
  }
  if (!missing.length) await cache.put(DONE, new Response(JSON.stringify({ files: list.length, at: Date.now() })));
  return { files: list.length, missing: missing.length };
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await precache();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // starou verzi pryč, jen když je nová celá (jinak by offline chyběly soubory)
    if (DEV || await cache.match(DONE)) for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// stav pro Nastavení: { ready, files, version } – a doplnění chybějících souborů
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'offline-status') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let done = await cache.match(DONE);
    if (!done && !DEV) { await precache(); done = await cache.match(DONE); }
    const info = done ? await done.json() : null;
    event.source?.postMessage({ type: 'offline-status', ready: !!info, files: info?.files ?? (await cache.keys()).length, version: VERSION, dev: DEV });
  })());
});

const fromAny = (req) => caches.match(req, { ignoreSearch: true });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const navigate = req.mode === 'navigate';
    if (!DEV) {
      // uložená verze (stránka i všechny soubory stejné verze)
      const hit = navigate ? (await cache.match('./')) ?? (await cache.match('index.html')) : await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await fromAny(req);
      if (hit) return hit;
      if (navigate) return (await fromAny('./')) ?? (await fromAny('index.html')) ?? Response.error();
      return Response.error();
    }
  })());
});
