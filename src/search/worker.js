// Web Worker: hledání běží mimo hlavní vlákno, takže UI nezamrzá.
//
// Vstup:  { type: 'search', start, target, constraints, moves, options, ergonomics }
// Výstup: { type: 'progress' | 'solutions' | 'done' | 'error', ... }

import { prepare, search } from './engine.js';
import { scoreAlg } from '../ergonomics/score.js';
import { buildTriggers } from '../ergonomics/triggers.js';

self.onmessage = ({ data }) => {
  if (data.type !== 'search') return;
  try {
    run(data);
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};

function run({ start, target, constraints, moves, options, ergonomics }) {
  const t0 = Date.now();
  self.postMessage({ type: 'progress', phase: 'tables', table: 0, tables: 0 });
  const problem = prepare({
    constraints, moves, target: Uint8Array.from(target),
    onTable: (info) => self.postMessage({ type: 'progress', phase: 'tables', ...info }),
  });
  const tablesMs = Date.now() - t0;

  const config = { ...ergonomics, triggers: buildTriggers() };
  let batch = [];
  let lastFlush = Date.now();
  const flush = () => {
    if (batch.length) self.postMessage({ type: 'solutions', items: batch });
    batch = [];
    lastFlush = Date.now();
  };

  const res = search(problem, Uint8Array.from(start), {
    ...options,
    onSolution: (alg) => {
      batch.push({ alg, score: scoreAlg(alg, config) });
      if (batch.length >= 50 || Date.now() - lastFlush > 200) flush();
    },
    onProgress: (info) => {
      flush();
      self.postMessage({ type: 'progress', phase: 'search', ...info, elapsed: Date.now() - t0 });
    },
  });
  flush();
  self.postMessage({
    type: 'done', reason: res.reason, optimal: res.optimal, nodes: res.nodes,
    found: res.solutions.length, tablesMs, elapsed: Date.now() - t0,
  });
}
