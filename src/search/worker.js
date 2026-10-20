// Web Worker: hledání běží mimo hlavní vlákno, takže UI nezamrzá.
//
// Vstup:  { type: 'search', puzzle, start, target, constraints, moves, options, ergonomics, sq1 }
//         puzzle = id hlavolamu ('333', '222', 'pyram', 'skewb', 'sq1');
//         sq1 = { shape, top, bottom } jen pro Square-1
// Výstup: { type: 'progress' | 'solutions' | 'done' | 'error', ... }
//
// S mnoha druhy tahů (např. R U F L S) je úplné hledání dlouhých algoritmů (PLL)
// pomalé. Proto se nejdřív rychle prohledají trojice druhů tahů (R U F, R U L, …) –
// najdou výsledky za pár sekund – a teprve ve zbytku času běží úplné hledání.

import { prepare, search } from './engine.js';
import { prepareSq1, searchSq1 } from './sq1engine.js';
import { getPuzzle } from '../puzzles/index.js';
import { scoreFor } from '../ergonomics/puzzles.js';
import { buildTriggers } from '../ergonomics/triggers.js';

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
  const handlers = {
    onSolution: (alg) => {
      if (seen.has(alg)) return;
      seen.add(alg);
      batch.push({ alg, score: scoreFor(P, alg, config) });
      if (batch.length >= 50 || Date.now() - lastFlush > 200) flush();
    },
    onProgress: (info) => {
      flush();
      self.postMessage({ type: 'progress', phase: 'search', ...info, elapsed: Date.now() - t0 });
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
    const timeLimit = options.timeLimit ?? 15000;
    const problem = prepare({ puzzle: P, constraints, moves, target: Uint8Array.from(target), onTable });
    const quick = quickPhase({ P, problem, start, target, constraints, moves, options, handlers, budget: timeLimit * 0.35 });
    res = search(problem, Uint8Array.from(start), { ...options, ...handlers, timeLimit: Math.max(1000, timeLimit - (Date.now() - t0)) });
    if (res.optimal === null && quick.optimal !== null) res.optimal = quick.optimal;
    if (res.reason === 'unsolvable' && quick.optimal !== null) res.reason = 'done';
  }
  flush();
  self.postMessage({
    type: 'done', reason: res.reason, optimal: res.optimal, nodes: res.nodes,
    found: seen.size || res.solutions.length, elapsed: Date.now() - t0,
  });
}

/**
 * Rychlá fáze: hledání jen s trojicemi druhů tahů (nejdřív ty s R a U). Jen když
 * je druhů tahů aspoň 4 a úloha vypadá dlouhá (odhad aspoň 9 tahů).
 */
function quickPhase({ P, problem: full, start, target, constraints, moves, options, handlers, budget }) {
  const out = { optimal: null };
  const bases = [...new Set(moves.map((m) => m.base))];
  if (bases.length < 4) return out;
  const t0 = Date.now();
  // krátké úlohy (do 8 tahů) najde úplné hledání rychle samo
  const probe = search(full, Uint8Array.from(start), { maxLength: 8, extraDepth: 0, maxResults: 1, timeLimit: 300 });
  if (probe.solutions.length || probe.reason === 'already-solved' || probe.reason === 'unsolvable') return out;

  const rank = (b) => (b === 'R' ? 0 : b === 'U' ? 1 : 2);
  const subsets = [];
  for (let i = 0; i < bases.length; i++) for (let j = i + 1; j < bases.length; j++) for (let k = j + 1; k < bases.length; k++) {
    subsets.push([bases[i], bases[j], bases[k]]);
  }
  subsets.sort((a, b) => a.reduce((s, x) => s + rank(x), 0) - b.reduce((s, x) => s + rank(x), 0));
  // s R i U jen trojice R U x (nejběžnější prstoklady), jinak nejvýš šest trojic
  const withRU = subsets.filter((x) => x.includes('R') && x.includes('U'));
  const tries = (withRU.length ? withRU : subsets).slice(0, 6);
  for (let i = 0; i < tries.length; i++) {
    const left = budget - (Date.now() - t0);
    if (left < 300) break;
    const sub = new Set(tries[i]);
    const label = tries[i].join(' ');
    self.postMessage({ type: 'progress', phase: 'quick', label, step: i + 1, steps: tries.length });
    const problem = prepare({ puzzle: P, constraints, moves: moves.filter((m) => sub.has(m.base)), target: Uint8Array.from(target) });
    const res = search(problem, Uint8Array.from(start), {
      ...options, timeLimit: left / (tries.length - i), onSolution: handlers.onSolution,
    });
    if (res.optimal !== null && (out.optimal === null || res.optimal < out.optimal)) out.optimal = res.optimal;
  }
  return out;
}
