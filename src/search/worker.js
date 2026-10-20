// Web Worker: hledání běží mimo hlavní vlákno, takže UI nezamrzá.
//
// Vstup:  { type: 'search', puzzle, start, target, constraints, moves, options, ergonomics, sq1 }
//         puzzle = id hlavolamu ('333', '222', 'pyram', 'skewb', 'sq1');
//         sq1 = { shape, top, bottom } jen pro Square-1
// Výstup: { type: 'progress' | 'solutions' | 'done' | 'error', ... }
//
// Postup (hlavolamy kromě Square-1):
//   1. první řešení – s mnoha druhy tahů (např. R U F L S) rychlá fáze s trojicemi
//      R U x, jinak úplné hledání s částí času (jednoduché úlohy doběhnou celé),
//   2. vylepšování – nejlepší řešení pro rychlost, efektivitu a všestrannost se
//      postupně zlepšují výměnou úseků za rovnocenné sekvence (viz improve.js),
//   3. úplné hledání kratších řešení ve zbytku času,
//   4. dovylepšení toho, co přineslo úplné hledání.

import { prepare, search, NEAR_LIMIT } from './engine.js';
import { prepareSq1, searchSq1 } from './sq1engine.js';
import { getPuzzle } from '../puzzles/index.js';
import { scoreFor } from '../ergonomics/puzzles.js';
import { buildTriggers } from '../ergonomics/triggers.js';
import { styleMetrics, speedKey } from '../ergonomics/style.js';
import { buildTable, improve } from './improve.js';

self.onmessage = ({ data }) => {
  if (data.type !== 'search') return;
  try {
    run(data);
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};

function run({ puzzle: id = '333', start, target, constraints, moves, options, ergonomics, sq1 }) {
  const P = getPuzzle(id);
  const t0 = Date.now();
  const onTable = (info) => self.postMessage({ type: 'progress', phase: 'tables', ...info });
  self.postMessage({ type: 'progress', phase: 'tables', table: 0, tables: 0 });
  const config = P.ergonomics === 'cube' ? { ...ergonomics, triggers: buildTriggers() } : ergonomics;

  let batch = [];
  let lastFlush = Date.now();
  const flush = () => {
    if (batch.length) self.postMessage({ type: 'solutions', items: batch });
    batch = [];
    lastFlush = Date.now();
  };
  const seen = new Set();
  const tracker = makeTracker(P);
  const handlers = {
    onSolution: (alg) => {
      if (seen.has(alg)) return;
      seen.add(alg);
      const score = scoreFor(P, alg, config);
      tracker.add(alg, score);
      batch.push({ alg, score });
      if (batch.length >= 50 || Date.now() - lastFlush > 200) flush();
    },
    context: {},
    onProgress: (info) => {
      flush();
      self.postMessage({ type: 'progress', phase: 'search', ...info, ...handlers.context, found: seen.size, best: tracker.shortest(), bests: tracker.snapshot(), elapsed: Date.now() - t0 });
    },
  };

  let res;
  if (P.kind === 'sq1') {
    const problem = prepareSq1({ constraints, target: Int8Array.from(target), ...sq1, onTable });
    res = searchSq1(problem, Int8Array.from(start), {
      ...options, ...handlers,
      turnCost: (a, c) => scoreFor(P, `(${a},${c})`, config).total,
    });
  } else {
    res = explore({ P, start: Uint8Array.from(start), target, constraints, moves, options, config, handlers, tracker, onTable, t0 });
  }
  flush();
  self.postMessage({
    type: 'done', reason: res.reason, optimal: res.optimal, nodes: res.nodes,
    found: seen.size || res.solutions.length, elapsed: Date.now() - t0,
  });
}

/**
 * Nejlepší zatím nalezené řešení pro každý pohled (rychlost, efektivita,
 * všestrannost) – hodnoty jako pohledy v Labu (lexikograficky, nižší = lepší).
 */
function makeTracker(P) {
  const cube = P.ergonomics === 'cube';
  const lex = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  const values = (score) => {
    const m = styleMetrics(score, cube);
    return { speed: speedKey(m), efficient: [m.length, m.total], balanced: [m.total + 2 * (m.regrips + m.rotations)] };
  };
  const bests = {};
  let changed = false;
  return {
    values,
    add(alg, score) {
      const v = values(score);
      for (const id of Object.keys(v)) {
        if (!bests[id] || lex(v[id], bests[id].value) < 0) { bests[id] = { alg, value: v[id] }; changed = true; }
      }
    },
    /** Zda se od posledního dotazu některá nejlepší změnila. */
    takeChanged() { const c = changed; changed = false; return c; },
    shortest: () => bests.efficient?.value[0] ?? null,
    snapshot: () => Object.fromEntries(Object.entries(bests).map(([id, b]) => [id, { alg: b.alg, value: b.value }])),
    bests,
  };
}

/**
 * Hledání s postupným zlepšováním. Úlohy: trojice druhů tahů R U x (jen když je
 * druhů tahů aspoň 4 a úloha je dlouhá) a úplná sada tahů. V kolech se každá
 * úloha prohloubí o jeden tah (od své nejkratší délky po nejkratší + „tahů nad
 * optimum“); každé kolo přinese nová, delší a různorodější řešení. Nejlepší řešení
 * každého pohledu se po změně krátce doladí výměnou úseků (improve.js).
 */
function explore({ P, start, target, constraints, moves, options, config, handlers, tracker, onTable, t0 }) {
  const timeLimit = options.timeLimit ?? 15000;
  const deadline = t0 + timeLimit;
  const left = () => deadline - Date.now();
  const extra = options.extraDepth ?? 0;
  const maxLength = options.maxLength ?? 20;
  const full = prepare({ puzzle: P, constraints, moves, target: Uint8Array.from(target), nearLimit: NEAR_LIMIT, onTable });

  const tasks = [];
  const bases = [...new Set(moves.map((m) => m.base))];
  // krátké úlohy (do 8 tahů) najde úplné hledání rychle samo
  const probe = bases.length >= 4 ? search(full, start, { maxLength: 8, extraDepth: 0, maxResults: 1, timeLimit: 300 }) : null;
  if (probe && !probe.solutions.length && probe.reason !== 'already-solved' && probe.reason !== 'unsolvable') {
    const rank = (b) => (b === 'R' ? 0 : b === 'U' ? 1 : 2);
    const subsets = [];
    for (let i = 0; i < bases.length; i++) for (let j = i + 1; j < bases.length; j++) for (let k = j + 1; k < bases.length; k++) subsets.push([bases[i], bases[j], bases[k]]);
    subsets.sort((a, b) => a.reduce((s, x) => s + rank(x), 0) - b.reduce((s, x) => s + rank(x), 0));
    const withRU = subsets.filter((x) => x.includes('R') && x.includes('U'));
    for (const sub of (withRU.length ? withRU : subsets).slice(0, 6)) {
      const set = new Set(sub);
      tasks.push({ label: sub.join(' '), moves: moves.filter((m) => set.has(m.base)), problem: null });
    }
  }
  tasks.push({ label: null, moves, problem: full, full: true });

  let table = null;
  let last = { reason: 'done', optimal: null, nodes: 0 };
  const polish = () => {
    if (!tracker.takeChanged() || left() < 1500) return;
    table ??= buildTable(P, moves);
    for (const [id, b] of Object.entries(tracker.bests)) {
      const value = (alg) => (alg.split(' ').length > maxLength ? [Infinity] : tracker.values(scoreFor(P, alg, config))[id]);
      improve(table, b.alg, value, { deadline: Math.min(deadline - 500, Date.now() + 300), onImproved: (alg) => handlers.onSolution(alg) });
    }
    tracker.takeChanged();
  };

  for (let round = 0; left() > 300 && tasks.some((t) => !t.done); round++) {
    for (const task of tasks) {
      if (task.done || left() < 300) continue;
      const active = tasks.filter((t) => !t.done).length;
      // úplná sada tahů dostane větší díl času (hledá kratší řešení), trojice menší
      const slice = Math.max(1000, task.full ? left() * (active > 1 ? 0.4 : 1) : Math.min(10000, left() / (2 * active)));
      task.problem ??= prepare({ puzzle: P, constraints, moves: task.moves, target: Uint8Array.from(target), nearLimit: NEAR_LIMIT });
      handlers.context = { label: task.label, task: task.full ? 'full' : 'subset', round };
      const first = task.depth === undefined;
      const res = search(task.problem, start, first
        ? { minLength: task.resume ?? 1, maxLength, extraDepth: 0, maxResults: options.maxResults, timeLimit: slice, onSolution: handlers.onSolution, onProgress: handlers.onProgress }
        : { minLength: task.depth, maxLength: task.depth, extraDepth: 0, maxResults: options.maxResults, timeLimit: slice, onSolution: handlers.onSolution, onProgress: handlers.onProgress });
      if (task.full) last = res;
      if (first) {
        if (res.optimal !== null) { task.opt = res.optimal; task.depth = res.optimal + 1; }
        // úplná sada příště pokračuje od délky, kterou nestihla (kratší nejsou)
        else if (res.reason === 'time' && task.full && left() > 2000) task.resume = res.depth;
        else task.done = true;
      } else if (res.reason === 'time') task.done = true; // další délka by se už nestihla
      else task.depth += 1;
      if (task.depth > Math.min(maxLength, (task.opt ?? 0) + extra)) task.done = true;
      polish();
      handlers.onProgress({ depth: task.depth ?? res.depth ?? 0, nodes: res.nodes ?? 0 });
    }
  }
  const optimal = tracker.shortest();
  const reason = tracker.shortest() === null ? last.reason : left() <= 300 ? 'time' : 'done';
  return { reason, optimal, nodes: last.nodes, solutions: [] };
}
