// Klient pro hledání ve Web Workerech. Hledání běží v několika workerech
// najednou (podle počtu jader), každý prohledá svůj díl (shard, viz worker.js);
// klient jejich zprávy spojí, jako by šlo o jedno hledání. Zrušení je ukončí.

import { NEAR_LIMIT, BIG_TABLE_LIMIT } from './engine.js';

/** Kolik workerů spustit: o jeden méně než jader (UI má svoje), nejvýš 4; při málo paměti 2. */
export function workerCount() {
  const cores = globalThis.navigator?.hardwareConcurrency ?? 2;
  const memory = globalThis.navigator?.deviceMemory ?? 8;
  return Math.max(1, Math.min(memory < 4 ? 2 : 4, cores - 1));
}

/**
 * Velké databáze (skupiny 5–6 dílků, po 4 bitech ~4 MB na skupinu): jen zařízení,
 * která hlásí aspoň 8 GB paměti (první sestavení trvá jednotky sekund, pak se načítají).
 */
export const bigTables = () => (globalThis.navigator?.deviceMemory ?? 0) >= 8;

export class SearchClient {
  constructor() {
    this.workers = [];
  }

  get running() {
    return this.workers.length > 0;
  }

  /**
   * @param {object} job viz src/search/worker.js (shard doplní klient)
   * @param {{onProgress?:Function, onSolutions?:Function, onDone?:Function, onError?:Function}} handlers
   * @param {{workers?: number}} [opts]
   */
  start(job, { onProgress, onSolutions, onDone, onError } = {}, { workers } = {}) {
    this.cancel();
    const count = job.puzzle === 'sq1' ? 1 : workers ?? workerCount();
    // víc workerů = víc tabulek v paměti; tabulka blízko cíle se zmenší
    const nearLimit = count > 2 ? Math.floor(NEAR_LIMIT * 0.6) : NEAR_LIMIT;
    const state = Array.from({ length: count }, () => ({ progress: null, done: null }));
    const list = [];
    this.workers = list;
    const live = () => this.workers === list;
    const fail = (message) => { if (!live()) return; this.cancel(); onError?.(new Error(message)); };

    const merged = (p) => {
      const ps = state.map((s) => s.progress).filter(Boolean);
      const bests = ps.map((x) => x.best).filter((x) => x !== null && x !== undefined);
      return {
        ...p,
        found: ps.reduce((a, x) => a + (x.found ?? 0), 0),
        best: bests.length ? Math.min(...bests) : null,
        // délky pod `cleared` prohledal úplnou sadou bez řešení každý díl
        cleared: Math.min(...state.map((s) => s.done?.cleared ?? s.progress?.cleared ?? 0)),
        elapsed: Math.max(...ps.map((x) => x.elapsed ?? 0)),
        workers: count,
      };
    };

    const finish = () => {
      const ds = state.map((s) => s.done);
      const reasons = ds.map((d) => d.reason);
      const optimals = ds.map((d) => d.optimal).filter((x) => x !== null && x !== undefined);
      const found = ds.reduce((a, d) => a + (d.found ?? 0), 0);
      let reason;
      if (reasons.includes('already-solved')) reason = 'already-solved';
      else if (reasons.every((r) => r === 'unsolvable')) reason = 'unsolvable';
      else if (found) reason = reasons.includes('time') ? 'time' : reasons.includes('results') ? 'results' : 'done';
      else reason = reasons.includes('time') ? 'time' : 'not-found';
      this.cancel();
      onDone?.({
        reason, found,
        optimal: optimals.length ? Math.min(...optimals) : null,
        cleared: Math.min(...ds.map((d) => d.cleared ?? 0)),
        // nejpohodlnější je dokázané, jen když to dokázal každý díl
        speedOptimal: ds.every((d) => d.speedOptimal),
        nodes: ds.reduce((a, d) => a + (d.nodes ?? 0), 0),
        elapsed: Math.max(...ds.map((d) => d.elapsed ?? 0)),
        workers: count,
      });
    };

    // s velkými databázemi: první worker je připraví a uloží; ostatní se spustí, až jsou
    // uložené (jen je načtou – nestaví každý svých ~40 MB souběžně), a dostanou o to kratší
    // čas. S běžnými databázemi začnou všechny hned (stavění zabere jen chvilku).
    const t0 = Date.now();
    const allowBig = bigTables() && job.puzzle !== 'sq1';
    const options = { ...job.options, nearLimit, ...(allowBig ? { tableLimit: BIG_TABLE_LIMIT } : {}) };
    // postupné spuštění jen když se velké databáze možná budou stavět (dlouhé hledání)
    const big = allowBig && (job.options?.timeLimit ?? 0) >= 30000;
    const launch = (index) => {
      const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      list[index] = worker;
      worker.onmessage = ({ data }) => {
        if (!live()) return;
        if (data.type === 'ready') {
          if (big && index === 0) for (let i = 1; i < count; i++) launch(i);
        } else if (data.type === 'progress') {
          if (data.phase === 'tables') { if (index === 0) onProgress?.(data); return; }
          state[index].progress = data;
          onProgress?.(merged(data));
        } else if (data.type === 'solutions') onSolutions?.(data.items);
        else if (data.type === 'done') {
          state[index].done = data;
          // hotovo dřív, než ostatní začaly (např. výchozí stav už je složený)
          if (index === 0 && list.filter(Boolean).length < count) for (let i = 1; i < count; i++) if (!list[i]) state[i].done = { ...data, found: 0 };
          if (state.every((s) => s.done)) finish();
        } else if (data.type === 'error') fail(data.message);
      };
      worker.onerror = (e) => fail(e.message || 'Chyba ve workeru');
      const spent = Date.now() - t0;
      worker.postMessage({
        type: 'search',
        ...job,
        options: { ...options, timeLimit: Math.max(500, (options.timeLimit ?? 15000) - spent) },
        shard: { index, count },
        start: Array.from(job.start),
        target: Array.from(job.target),
      });
    };
    if (big) launch(0);
    else for (let i = 0; i < count; i++) launch(i);
  }

  cancel() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }
}
