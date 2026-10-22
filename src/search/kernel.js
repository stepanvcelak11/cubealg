// Jádro hledání ve WebAssembly (zdroj: wasm/src/lib.rs, build: npm run wasm).
//
// engine.js ho použije pro search a searchCost, když je načtené (initKernel);
// jinak hledá JS verze se stejnými výsledky. Úloha (prepare) se do paměti jádra
// zkopíruje při prvním hledání a uvolní se, až ji JS zahodí (FinalizationRegistry).

const DONE = 0, BUDGET = 1, SOLUTION = 2, NEED_COST = 3;
export const CODES = { DONE, BUDGET, SOLUTION, NEED_COST };

let K = null; // exporty instance
// úloha zahozená v JS: uvolnit v jádru (jen v instanci, do které patří)
const registry = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry(({ h, k }) => { if (k === K) free(h); }) : null;

// Paměť jádra: úlohy, které JS zahodí, se uvolní (FinalizationRegistry), ale na to se
// nedá spoléhat – hledání jich vytváří hodně (podmnožiny tahů, kola zlepšování). Když
// zkopírované úlohy přesáhnou rozpočet, uvolní se nejdéle nepoužité (při dalším
// hledání se zkopírují znovu).
const MEMORY_BUDGET = 320 * 2 ** 20;
const live = new Map(); // h → { ref: WeakRef(úloha), bytes, used }
let liveBytes = 0, tick = 0;
function free(h) {
  const e = live.get(h);
  if (!e) return;
  live.delete(h);
  liveBytes -= e.bytes;
  K?.problem_free(h);
  const p = e.ref.deref?.();
  if (p) { delete p.kernel; delete p.kernelOf; delete p.kernelCost; registry?.unregister(p); }
}
function touch(h) { const e = live.get(h); if (e) e.used = ++tick; }
function trim(keep) {
  while (liveBytes > MEMORY_BUDGET && live.size > 1) {
    let old = null;
    for (const [h, e] of live) if (h !== keep && (!old || e.used < live.get(old).used)) old = h;
    if (old === null) break;
    free(old);
  }
}

/** Načte jádro z bajtů (synchronně – v workeru a v Node). */
export function loadKernel(bytes) {
  const { exports } = new WebAssembly.Instance(new WebAssembly.Module(bytes), {});
  K = exports;
  live.clear();
  liveBytes = 0;
  return true;
}

/** Načte jádro ze souboru vedle tohoto modulu (prohlížeč i Node); bez něj zůstane JS verze. */
export async function initKernel() {
  if (K) return true;
  try {
    const url = new URL('./kernel.wasm', import.meta.url);
    let bytes;
    if (url.protocol === 'file:') {
      const { readFile } = await import('node:fs/promises');
      bytes = await readFile(url);
    } else {
      const res = await fetch(url);
      if (!res.ok) return false;
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    return loadKernel(bytes);
  } catch {
    return false;
  }
}

export const kernelReady = () => K !== null;
/** Jádro umí úlohu (hodnoty dílků se vejdou do 32bitové masky). */
export const kernelFits = (problem) => K !== null && problem.pieces.every((p) => p.size <= 32);
/** Vypne jádro (testy porovnávají s JS verzí). */
export function disableKernel() { K = null; }

const mem = () => K.memory.buffer;

/** Zkopíruje pole do paměti jádra jako buffer úlohy h; vrací číslo bufferu. */
function adoptBuf(h, arr, size) {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  size.bytes += bytes.length;
  const ptr = K.alloc(bytes.length) >>> 0;
  new Uint8Array(mem(), ptr, bytes.length).set(bytes);
  return K.problem_buffer(h, ptr, bytes.length);
}

/** Dočasné pole u32 v paměti jádra (pro předání seznamu). */
function withU32(list, fn) {
  const ptr = K.alloc(list.length * 4 || 4) >>> 0;
  new Uint32Array(mem(), ptr, list.length).set(list);
  try { return fn(ptr); } finally { K.free(ptr, list.length * 4 || 4); }
}

/** Úloha v jádru (zkopíruje se jednou a pamatuje u úlohy). */
function handleOf(problem, ev) {
  if (problem.kernel !== undefined && problem.kernelOf === K) { touch(problem.kernel); return problem.kernel; }
  delete problem.kernelCost;
  const { pieces, moveCount, trans, tables, near, targetCount, redundant } = problem;
  const h = K.problem_new(pieces.length, moveCount, targetCount);
  const size = { bytes: 0 };
  const adopt = (hh, arr) => adoptBuf(hh, arr, size);
  const transBuf = new Map();
  for (const p of pieces) {
    if (!transBuf.has(p.kind)) transBuf.set(p.kind, adopt(h, trans[p.kind]));
    K.problem_piece(h, p.size, transBuf.get(p.kind));
  }
  for (let t = 0; t < targetCount; t++) for (const p of pieces) K.problem_ok(h, adopt(h, p.oks[t]));
  K.problem_redundant(h, adopt(h, redundant));
  for (const t of ev.order) {
    const dist = adopt(h, tables[t].dist);
    withU32(ev.tableIdx[t], (ids) => withU32(tables[t].sizes, (sizes) => K.problem_table(h, ids, sizes, ev.tableIdx[t].length, dist, tables[t].packed ? 1 : 0)));
  }
  withU32(ev.rest, (ids) => K.problem_rest(h, ids, ev.rest.length));
  if (near) K.problem_near(h, adopt(h, near.keys), adopt(h, near.dist), near.mask, near.radius);
  K.problem_finish(h);
  problem.kernel = h;
  problem.kernelOf = K;
  registry?.register(problem, { h, k: K }, problem);
  // sloty tabulky blízko cíle (2 B na slot) místo jejích vzdáleností
  if (near) size.bytes += near.dist.length;
  live.set(h, { ref: typeof WeakRef === 'function' ? new WeakRef(problem) : { deref: () => problem }, bytes: size.bytes, used: ++tick });
  liveBytes += size.bytes;
  trim(h);
  return h;
}

/** Databáze ceny (costTables) do jádra – jen když se změnily. */
function useCostTables(problem, h, hcost) {
  if (!hcost) return 0;
  if (problem.kernelCost === hcost) return 1;
  const { ids, sizes, dists, q } = hcost.data;
  const size = { bytes: 0 };
  dists.forEach((dist, t) => {
    const buf = adoptBuf(h, dist, size);
    withU32(ids[t], (pi) => withU32(sizes[t], (ps) => K.problem_cost_table(h, pi, ps, ids[t].length, buf, q, t === 0 ? 1 : 0)));
  });
  problem.kernelCost = hcost;
  // předchozí databáze ceny jádro uvolnilo (reset); počítá se jen poslední sada
  const e = live.get(h);
  if (e) { liveBytes += size.bytes - (e.cost ?? 0); e.bytes += size.bytes - (e.cost ?? 0); e.cost = size.bytes; }
  trim(h);
  return 1;
}

/**
 * IDA* pro jeden výchozí stav a jednu mez. `st` = { nodes, branch, done } se průběžně
 * aktualizuje; onBudget() po každých 8192 uzlech (true = zastavit), onSolution(path, goal)
 * (true = zastavit). Vrací 'done' nebo 'stopped'.
 */
export function idaRoot(problem, ev, v, bound, skip, shard, st, onBudget, onSolution) {
  const h = handleOf(problem, ev);
  const io = () => new Int32Array(mem(), ioPtr, 4 + 64);
  const ioPtr = K.ida_new(h) >>> 0;
  new Uint8Array(mem(), K.ida_state() >>> 0, v.length).set(v);
  let base = st.nodes % 8192;
  let a = io();
  a[0] = base; a[1] = st.branch; a[2] = st.done;
  K.ida_start(bound, skip, shard ? shard.index : 0, shard ? shard.count : 0);
  for (;;) {
    const code = K.ida_run();
    a = io();
    st.nodes += a[0] - base;
    base = a[0];
    st.branch = a[1]; st.done = a[2];
    if (code === DONE) return 'done';
    if (code === BUDGET) { if (onBudget()) return 'stopped'; continue; }
    if (onSolution(Array.from(a.subarray(4, 4 + bound)), a[3])) return 'stopped';
  }
}

/**
 * Větve a meze podle ceny (všechny výchozí stavy). Ceny tahů se doplňují z modelu
 * `cost` (step/cost) po celých stavech ruky. `st` = { nodes, found, bound, done, skip }.
 * onSolution(path, total, goal, root).
 */
export function costSearch(problem, ev, { cost, minMove, length, hcost, finish, shard }, roots, st, onBudget, onSolution) {
  const h = handleOf(problem, ev);
  const useH = useCostTables(problem, h, hcost);
  const M = problem.moveCount;
  const ioPtr = K.cost_new(h, length, minMove, useH, problem.targetCount, shard ? shard.index : 0, shard ? shard.count : 0) >>> 0;
  const io = () => new Float64Array(mem(), ioPtr, 8);
  new Float64Array(mem(), K.cost_finish() >>> 0, problem.targetCount).set(Array.from({ length: problem.targetCount }, (_, t) => (finish ? finish(t) : 0)));
  const nextBuf = new Int32Array(M), priceBuf = new Float64Array(M);
  for (const root of roots) {
    if (root.skipRoot) continue;
    new Uint8Array(mem(), K.cost_state() >>> 0, root.v.length).set(root.v);
    let base = st.nodes % 8192;
    let a = io();
    a[0] = base; a[1] = 0; a[2] = st.bound; a[3] = st.done;
    K.cost_start(root.index, st.skip, cost.start, root.g0 ?? 0);
    for (;;) {
      const code = K.cost_run();
      a = io();
      st.nodes += a[0] - base;
      base = a[0];
      st.bound = a[2]; st.done = a[3];
      if (code === DONE) break;
      if (code === BUDGET) { if (onBudget()) return 'stopped'; continue; }
      if (code === NEED_COST) {
        const ctx = a[6];
        for (let m = 0; m < M; m++) { priceBuf[m] = cost.cost(ctx, m); nextBuf[m] = cost.step(ctx, m); }
        const pn = K.alloc(M * 4) >>> 0, pp = K.alloc(M * 8) >>> 0;
        new Int32Array(mem(), pn, M).set(nextBuf);
        new Float64Array(mem(), pp, M).set(priceBuf);
        K.cost_fill(ctx, pn, pp);
        K.free(pn, M * 4); K.free(pp, M * 8);
        continue;
      }
      st.found++;
      const goal = a[4], total = a[5];
      onSolution(Array.from(new Int32Array(mem(), K.cost_path() >>> 0, length)), total, goal, root);
    }
  }
  return 'done';
}

/**
 * Předá skupinu dílků jádru (velikosti, inverzní přechody, povolené hodnoty pro cíle)
 * a zavolá fn s ukazateli; dočasnou paměť pak uvolní.
 */
function withGroup(group, invTrans, fn) {
  const temp = [];
  const put = (arr) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    const ptr = K.alloc(bytes.length || 1) >>> 0;
    new Uint8Array(mem(), ptr, bytes.length).set(bytes);
    temp.push([ptr, bytes.length || 1]);
    return ptr;
  };
  const invPtr = new Map();
  const inv = group.map((p) => { if (!invPtr.has(p.kind)) invPtr.set(p.kind, put(invTrans[p.kind])); return invPtr.get(p.kind); });
  const targets = group[0].oks.length;
  const oks = [];
  for (let t = 0; t < targets; t++) for (const p of group) oks.push(put(p.oks[t]));
  try {
    return fn({ sizes: put(Uint32Array.from(group, (p) => p.size)), inv: put(Uint32Array.from(inv)), oks: put(Uint32Array.from(oks)), targets, put, temp });
  } finally {
    for (const [ptr, len] of temp) K.free(ptr, len);
  }
}

const totalOf = (group) => group.reduce((a, p) => a * p.size, 1);

/** Pattern databáze zpětným BFS v jádru (jako buildTable v engine.js); null = bez jádra. */
export function buildTableKernel(group, moveCount, invTrans) {
  if (!K || group.length > 16) return null;
  const total = totalOf(group);
  return withGroup(group, invTrans, (g) => {
    const dist = K.alloc(total) >>> 0;
    g.temp.push([dist, total]);
    K.build_table(group.length, g.sizes, g.inv, g.targets, g.oks, moveCount, dist, total);
    return new Uint8Array(mem(), dist, total).slice();
  });
}

/** Databáze ceny v jádru (jako buildCostTable); null = bez jádra. */
export function buildCostTableKernel(group, moveCount, invTrans, weights) {
  if (!K || group.length > 16) return null;
  const total = totalOf(group);
  return withGroup(group, invTrans, (g) => {
    const dist = K.alloc(total * 2) >>> 0;
    g.temp.push([dist, total * 2]);
    K.build_cost_table(group.length, g.sizes, g.inv, g.targets, g.oks, moveCount, g.put(Uint32Array.from(weights)), dist, total);
    return new Uint16Array(mem(), dist, total).slice();
  });
}

/**
 * Tabulka blízko cíle v jádru (jako buildNear): { keys, dist, radius, count }; null = bez jádra.
 * cap = počet slotů (mocnina dvou), limit = max. počet stavů.
 */
export function buildNearKernel(pieces, moveCount, invTrans, limit, cap) {
  if (!K || !pieces.every((p) => p.size <= 255)) return null;
  const n = pieces.length;
  return withGroup(pieces, invTrans, (g) => {
    K.build_near(n, g.sizes, g.inv, g.targets, g.oks, moveCount, limit, cap);
    const [, radius, count, keysPtr, distPtr] = new Uint32Array(mem(), K.near_out() >>> 0, 5);
    const keys = new Uint8Array(mem(), keysPtr, cap * n).slice();
    const dist = new Uint8Array(mem(), distPtr, cap).slice();
    K.free(keysPtr, cap * n);
    K.free(distPtr, cap);
    return { keys, dist, radius, count };
  });
}
