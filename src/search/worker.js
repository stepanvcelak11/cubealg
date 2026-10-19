// Web Worker: hledání běží mimo hlavní vlákno, takže UI nezamrzá.
//
// Vstup:  { type: 'search', puzzle, start, target, constraints, moves, options, ergonomics, sq1 }
//         puzzle = id hlavolamu ('333', '222', 'pyram', 'skewb', 'sq1');
//         sq1 = { shape, top, bottom } jen pro Square-1
// Výstup: { type: 'progress' | 'solutions' | 'done' | 'error', ... }

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
  const handlers = {
    onSolution: (alg) => {
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
    const problem = prepare({ puzzle: P, constraints, moves, target: Uint8Array.from(target), onTable });
    res = search(problem, Uint8Array.from(start), { ...options, ...handlers });
  }
  flush();
  self.postMessage({
    type: 'done', reason: res.reason, optimal: res.optimal, nodes: res.nodes,
    found: res.solutions.length, elapsed: Date.now() - t0,
  });
}
