// Řešení jednoho kroku simulace: algoritmus z tvé sady (pickFromSet), jinak hledání
// stejné jako v Labu (explore v jednom vlákně) – nejlepší podle zvoleného pohledu.
// Používá ho worker simulátoru (sim-worker.js) i měření v Node (bench/method.mjs).
//
// Plán simulace (plan) je čistě datový, aby šel poslat do workeru:
//   { lambda, ergonomics, rotation, variants: [{ goals, next, rotation, steps: [krok] }], stepOpts: [...] }
//   krok: { moves, held (tahy modelu a jak je děláš), adjust: {pre, post, helpers}, candidates, parts }
//   stepOpts[i]: { mode: 'auto' | 'set' | 'search', view: 'speed' | 'efficient' | 'balanced', time (ms) }

import { getPuzzle } from '../puzzles/index.js';
import { prepare, search as engineSearch, NEAR_LIMIT } from '../search/engine.js';
import { explore, makeTracker } from '../search/explore.js';
import { scoreFor } from '../ergonomics/puzzles.js';
import { buildTriggers } from '../ergonomics/triggers.js';
import { styleMetrics, rankResults } from '../ergonomics/style.js';
import { clock } from '../search/clock.js';
import { simulate, pickFromSet } from './simulate.js';
import { compileGoal } from '../core/constraints.js';
import { constraintsKey } from '../core/rules.js';

const P = getPuzzle('333');

/** Paměť databází pro všechna hledání jednoho workeru (stejné tahy a cíle se nepočítají znovu). */
function memoryCache(maxBytes = 160 * 2 ** 20) {
  const map = new Map();
  let bytes = 0;
  return {
    get: (key) => { const v = map.get(key); if (v) { map.delete(key); map.set(key, v); } return v; },
    set(key, dist) {
      map.set(key, dist);
      bytes += dist.byteLength;
      for (const [k, v] of map) { if (bytes <= maxBytes) break; map.delete(k); bytes -= v.byteLength; }
    },
  };
}

/**
 * Vytvoří řešič kroků pro plán.
 * @param {object} plan viz výše
 * @param {{nearLimit?: number, virtual?: boolean, quick?: boolean}} [opts] virtual = čas podle práce (testy),
 *   quick = první nejkratší řešení bez vylepšování (zamíchání pro nácvik)
 */
export function makeStepSolver(plan, { nearLimit = Math.floor(NEAR_LIMIT * 0.4), virtual = false, quick = false } = {}) {
  const config = { ...(plan.ergonomics ?? {}), triggers: buildTriggers() };
  const cache = memoryCache();
  const memo = new Map(); // stejný stav a krok → stejné řešení (opakovaná simulace)

  function search(i, state, v, constraints, timeScale = 1) {
    const step = plan.variants[v].steps[i];
    const opts = plan.stepOpts[i];
    const { moves, held } = step;
    const name = new Map(moves.map((m, k) => [P.moveToString(m), P.moveToString(held[k])]));
    const toHeld = (alg) => alg.split(' ').map((t) => name.get(t) ?? t).join(' ');
    const scoreOf = (alg) => scoreFor(P, toHeld(alg), config);
    const tracker = makeTracker(P, plan.lambda ?? 0.5);
    const seen = new Map();
    const handlers = {
      onSolution: (alg, pre = null, post = null) => {
        const model = [pre, alg, post].filter(Boolean).join(' ');
        if (seen.has(model)) return;
        const score = scoreOf(model);
        seen.set(model, score);
        tracker.add({ alg: model, pre: null, post: null }, score);
      },
      context: {}, proof: { cleared: 0 }, onProgress: () => {},
    };
    const target = P.solved();
    if (virtual) clock.setVirtual(true, 1);
    try {
      const full = prepare({ puzzle: P, constraints, moves, targets: [target], nearLimit, cache });
      if (quick) {
        const res = engineSearch(full, state, { maxLength: 20, extraDepth: 0, maxResults: 1, timeLimit: 20000 * timeScale });
        for (const alg of res.solutions) handlers.onSolution(alg);
      } else explore({
        P, start: state, target, constraints, moves, held, auf: null,
        options: { lambda: plan.lambda ?? 0.5, maxLength: 20, extraDepth: 1, maxResults: 800, timeLimit: (opts.time ?? 3000) * timeScale, nearLimit, library: (step.candidates ?? []).map((c) => c.model) },
        config, handlers, tracker, scoreOf, onTable: () => {}, t0: clock.now(), full, cache,
      });
    } finally {
      if (virtual) clock.setVirtual(false);
    }
    // jen řešení, která cíl opravdu splní (etapy a bloky znají jen část cíle)
    const reaches = compileGoal(constraints).test;
    const list = [...seen].filter(([model]) => { try { return reaches(P.applyAlg(state, model)); } catch { return false; } })
      .map(([model, score]) => ({ model, score, m: styleMetrics(score, true) }));
    if (!list.length) return null;
    const best = rankResults(list, opts.view ?? 'speed', { lambda: plan.lambda ?? 0.5 })[0];
    return { model: best.model, display: toHeld(best.model), score: best.m.total, source: 'search' };
  }

  /** Řešení kroku i ze stavu (orientace v, cíl goal = dosud hotové + dílky kroku). */
  async function solveStep(i, state, test, v, goal = plan.variants[v].goals[i]) {
    const step = plan.variants[v].steps[i];
    const opts = plan.stepOpts[i];
    const key = `${v}|${i}|${constraintsKey(goal)}|${state.join(',')}`;
    if (memo.has(key)) return memo.get(key);
    let r = null;
    if (opts.mode !== 'search' && step.candidates?.length) r = pickFromSet(state, test, step.candidates, step.adjust);
    if (!r && opts.mode === 'set') r = { model: '', display: '', score: 0, source: 'missing' };
    // hledání: když v čase nic nenajde, zkusí to znovu déle (krok se musí složit)
    for (const scale of [1, 3, 10]) {
      if (r) break;
      r = search(i, state, v, goal, scale);
      if (r && !test(P.applyAlg(state, r.model))) r = null;
    }
    memo.set(key, r);
    return r;
  }

  return { solveStep, config };
}

/** Složí daná zamíchání podle plánu (jedno vlákno). */
export async function solveScrambles(plan, starts, opts = {}) {
  const { solveStep } = makeStepSolver(plan, opts);
  return simulate({ starts, variants: plan.variants, solveStep, better: betterFor(plan), countRotation: plan.rotation === 'move', onProgress: opts.onProgress, stopped: opts.stopped });
}

/** Porovnání řešení kroku podle jeho pohledu (rychlost: náročnost, úspornost: tahy). */
export function betterFor(plan) {
  return (a, b, i = 0) => {
    const view = plan.stepOpts[i]?.view ?? 'speed';
    const ka = view === 'efficient' ? [a.length, a.score] : [a.score, a.length];
    const kb = view === 'efficient' ? [b.length, b.score] : [b.score, b.length];
    return ka[0] !== kb[0] ? ka[0] < kb[0] : ka[1] < kb[1];
  };
}
