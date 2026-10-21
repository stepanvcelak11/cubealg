// Uložené pattern databáze (IndexedDB): stejné databáze (hlavolam, tahy, cíle
// dílků) se při dalším hledání nepočítají znovu – u celé kostky s cílem „složeno“
// jsou stejné pro všechny případy. Worker si před hledáním načte jen ty, které
// bude potřebovat (engine.tableKeys), nově spočtené uloží. Bez IndexedDB (testy
// v Node) se nic neukládá.

const DB = 'ergocube-tables';
const STORE = 'tables';
const META = 'meta'; // klíč → [čas uložení, bajty] (pro úklid nejstarších)
const MAX = 120; // nejvýš tolik databází (nejstarší se mažou)
const MAX_BYTES = 160 * 2 ** 20; // a nejvýš tolik dat (velké databáze mají jednotky MB)

function openDb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); req.result.createObjectStore(META); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

const done = (tx) => new Promise((resolve) => { tx.oncomplete = tx.onerror = tx.onabort = () => resolve(); });

/** Mezipaměť pro engine.prepare({ cache }): get/set synchronně, load/flush asynchronně. */
export async function openTableCache() {
  const db = await openDb();
  const mem = new Map();
  const fresh = new Map();
  return {
    hits: 0,
    get(key) { const v = mem.get(key); if (v) this.hits++; return v; },
    has(key) { return mem.has(key); },
    set(key, dist) { mem.set(key, dist); fresh.set(key, dist); },
    /** Načte uložené databáze s danými klíči. */
    async load(keys) {
      if (!db || !keys.length) return;
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      for (const key of new Set(keys)) {
        if (mem.has(key)) continue;
        const req = store.get(key);
        req.onsuccess = () => { if (req.result instanceof Uint8Array) mem.set(key, req.result); };
      }
      await done(tx);
    },
    /** Uloží nově spočtené databáze (a smaže nejstarší nad limit). */
    async flush() {
      if (!db || !fresh.size) return;
      const entries = [...fresh];
      fresh.clear();
      const tx = db.transaction([STORE, META], 'readwrite');
      const store = tx.objectStore(STORE);
      const meta = tx.objectStore(META);
      const now = Date.now();
      for (const [key, dist] of entries) { store.put(dist, key); meta.put([now, dist.byteLength], key); }
      // úklid: nad limit počtu nebo velikosti se smažou nejstarší
      const keysReq = meta.getAllKeys();
      const timesReq = meta.getAll();
      timesReq.onsuccess = () => {
        const keys = keysReq.result;
        // starší záznamy mají jen čas (velikost neznámá – malé databáze)
        const info = timesReq.result.map((v) => (Array.isArray(v) ? v : [v, 400000]));
        let bytes = info.reduce((a, v) => a + v[1], 0);
        let count = keys.length;
        const order = keys.map((k, i) => [k, ...info[i]]).sort((a, b) => a[1] - b[1]);
        for (const [old, , size] of order) {
          if (count <= MAX && bytes <= MAX_BYTES) break;
          store.delete(old); meta.delete(old);
          count--; bytes -= size;
        }
      };
      await done(tx);
    },
  };
}
