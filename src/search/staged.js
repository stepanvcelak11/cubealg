// Etapové hledání prvního řešení: když přímé hledání nejkratšího řešení trvá
// moc dlouho (velký případ, mnoho druhů tahů), složí se cíl postupně jako člověk.
// Každá etapa najde nejkratší sekvenci, po které zůstanou splněné všechny už
// hotové dílky a přibude aspoň jeden další (může jich přibýt víc). Když zbývá
// jen pár dílků, dokončí se úplným hledáním (silná heuristika a tabulka blízko
// cíle). Výsledek bývá dlouhý, ale přijde rychle – zlepšování (worker.js) ho pak
// zkracuje a zpříjemňuje.

import { encode, groupTable, search } from './engine.js';

const GROUP = 3; // dílků v jedné pattern databázi hotových dílků (24³ hodnot – hned)

/**
 * @param {ReturnType<import('./engine.js').prepare>} problem úplná úloha (všechny sledované dílky)
 * @param {Uint8Array} start výchozí stav (loc)
 * @param {object} opts
 * @param {number} opts.deadline čas (Date.now()), do kdy skončit
 * @param {number} [opts.finish] kolik zbývajících dílků už dokončit úplným hledáním
 * @param {number} [opts.stageDepth] nejdelší etapa
 * @param {number} [opts.seed] jiné pořadí zkoušených tahů (víc workerů → různá řešení)
 * @param {(info:{done:number, total:number, length:number}) => void} [opts.onStage]
 * @returns {{alg: string|null, reason: string}}
 */
export function stagedSolve(problem, start, { deadline, finish = 4, stageDepth = 14, seed = 0, onStage }) {
  const { pieces, trans, moveCount, redundant, names, puzzle } = problem;
  const n = pieces.length;
  const sizes = pieces.map((p) => p.size);
  const tr = pieces.map((p) => trans[p.kind]);
  const ok = pieces.map((p) => p.oks[0]);
  const single = pieces.map((_, i) => groupTable(problem, [i]).dist);
  let loc = Uint8Array.from(start);
  let v = encode(problem, loc);
  if (pieces.some((_, i) => single[i][v[i]] === 255)) return { alg: null, reason: 'unsolvable' };
  const path = [];
  const done = new Set();
  const tables = []; // { idx: number[], sizes, dist }
  let loose = [];    // hotové dílky zatím bez společné databáze
  const markDone = () => {
    for (let i = 0; i < n; i++) if (!done.has(i) && ok[i][v[i]] === 1) { done.add(i); loose.push(i); }
    while (loose.length >= GROUP) {
      const idx = loose.splice(0, GROUP);
      const t = groupTable(problem, idx);
      tables.push({ idx, sizes: t.sizes, dist: t.dist });
    }
  };
  markDone();

  const order = Array.from({ length: moveCount }, (_, i) => i);
  for (let i = moveCount - 1, r = seed * 7919 + 1; seed && i > 0; i--) {
    r = (r * 1103515245 + 12345) % 2147483648;
    const j = r % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const stack = Array.from({ length: stageDepth + 1 }, () => new Uint8Array(n));
  const moves = new Int16Array(stageDepth);
  let nodes = 0, timeUp = false;

  /** Nejkratší sekvence, po které platí hotové dílky a přibude aspoň jeden. */
  const stage = (prevMove) => {
    const remain = [];
    for (let i = 0; i < n; i++) if (!done.has(i)) remain.push(i);
    const lower = (s) => {
      let h = 0;
      for (const t of tables) {
        let idx = 0;
        for (let k = 0; k < t.idx.length; k++) idx = idx * t.sizes[k] + s[t.idx[k]];
        if (t.dist[idx] > h) h = t.dist[idx];
      }
      for (const i of loose) if (single[i][s[i]] > h) h = single[i][s[i]];
      let next = 255;
      for (const i of remain) if (single[i][s[i]] < next) next = single[i][s[i]];
      return Math.max(h, next);
    };
    const goal = (s) => {
      for (const i of done) if (ok[i][s[i]] !== 1) return false;
      for (const i of remain) if (ok[i][s[i]] === 1) return true;
      return false;
    };
    let bound;
    const dfs = (depth, prev) => {
      const cur = stack[depth], next = stack[depth + 1];
      for (let q = 0; q < moveCount; q++) {
        const m = order[q];
        if (prev >= 0 && redundant[prev * moveCount + m]) continue;
        for (let i = 0; i < n; i++) next[i] = tr[i][m * sizes[i] + cur[i]];
        if (++nodes % 4096 === 0 && Date.now() > deadline) { timeUp = true; return false; }
        moves[depth] = m;
        if (depth + 1 === bound) { if (goal(next)) return true; continue; }
        if (lower(next) > bound - depth - 1) continue;
        if (dfs(depth + 1, m)) return true;
        if (timeUp) return false;
      }
      return false;
    };
    stack[0].set(v);
    for (bound = Math.max(1, lower(v)); bound <= stageDepth; bound++) {
      if (dfs(0, prevMove)) return Array.from(moves.subarray(0, bound));
      if (timeUp) return null;
    }
    return null;
  };

  while (n - done.size > finish) {
    if (Date.now() > deadline) return { alg: null, reason: 'time' };
    const seq = stage(path.length ? path[path.length - 1] : -1);
    if (!seq) return { alg: null, reason: timeUp ? 'time' : 'not-found' };
    for (const m of seq) {
      path.push(m);
      for (let i = 0; i < n; i++) v[i] = tr[i][m * sizes[i] + v[i]];
    }
    markDone();
    onStage?.({ done: done.size, total: n, length: path.length });
  }
  // zbytek úplným hledáním (všechny cíle, silná heuristika)
  const prefix = path.map((m) => names[m]).join(' ');
  if (n - done.size > 0 || pieces.some((_, i) => ok[i][v[i]] !== 1)) {
    loc = prefix ? puzzle.applyAlg(start, prefix) : loc;
    const res = search(problem, loc, { maxLength: 20, extraDepth: 0, maxResults: 1, timeLimit: Math.max(0, deadline - Date.now()) });
    if (!res.solutions.length) return { alg: null, reason: res.reason === 'time' ? 'time' : 'not-found' };
    return { alg: [prefix, res.solutions[0]].filter(Boolean).join(' '), reason: 'done' };
  }
  return { alg: prefix, reason: 'done' };
}
