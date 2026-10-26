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
import { constraintsKey, mergeConstraints } from '../core/rules.js';

const P = getPuzzle('333');

/** Paměť databází pro všechna hledání jednoho workeru (stejné tahy a cíle se nepočítají znovu). */
export function memoryCache(maxBytes = 160 * 2 ** 20) {
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
 * Rychlejší zápis cíle pro hledání: skupinové pravidlo „na těchto místech některý ze
 * skupiny dílků, natočený“ (OLL: natočit horní vrstvu), kde ostatní dílky skupiny už
 * musí být hotové na svých místech – pak na těch místech můžou být jen zbylé dílky
 * skupiny a pravidlo = „zbylé dílky natočené“ (omezení po dílcích, silná heuristika).
 * Cíl se nemění, jen se líp hledá.
 */
export function simplifyGoal(goal) {
  const classes = goal['#classes'];
  if (!classes?.length) return goal;
  const out = { ...goal };
  const keep = [];
  for (const c of classes) {
    const rest = c.pieces.filter((n) => goal[n] !== 'solved');
    const slotsOf = c.places.map((pl) => P.slots.find((s) => s.facelets.includes(pl[0])));
    // ostatní místa stejného druhu musí být hotová – jinak by dílek skupiny mohl být i tam
    const others = slotsOf[0] ? P.slots.filter((s) => s.facelets.length === slotsOf[0].facelets.length && !slotsOf.includes(s)) : [];
    const oriOnly = c.stickers.every((st) => st.length === 1 && st[0] === 0) && c.places.every((pl) => pl.length === 1)
      && slotsOf.every((s, k) => s && s.facelets[0] === c.places[k][0]);
    // ostatní místa hotová (drží své dílky) → na místech skupiny jsou přesně dílky, které
    // tam mají domov; patří-li všechny do skupiny, pravidlo = „tyto dílky natočené“
    // (OLL po F2L, EOLine: všechny hrany natočené)
    const ok = oriOnly && others.every((s) => goal[s.name] === 'solved') && slotsOf.every((s) => c.pieces.includes(s.name));
    if (!ok) { keep.push(c); continue; }
    for (const n of rest) if (slotsOf.some((s) => s.name === n) && (!out[n] || out[n] === 'ignore')) out[n] = 'orientation';
  }
  // zůstane-li jiné skupinové pravidlo, nechat cíl, jak je (pravidla se můžou ovlivňovat)
  if (keep.length) return goal;
  delete out['#classes'];
  return out;
}

/**
 * Vytvoří řešič kroků pro plán.
 * @param {object} plan viz výše
 * @param {{nearLimit?: number, virtual?: boolean, quick?: boolean}} [opts] virtual = čas podle práce (testy),
 *   quick = první nejkratší řešení bez vylepšování (zamíchání pro nácvik)
 */
export function makeStepSolver(plan, { nearLimit = Math.floor(NEAR_LIMIT * 0.4), virtual = false, quick = false, shared = null } = {}) {
  const config = { ...(plan.ergonomics ?? {}), triggers: buildTriggers() };
  // databáze a nalezená řešení: `shared` přežije změnu plánu (objevitel metod zkouší
  // úpravy na stejných zamícháních – nezměněné kroky se nehledají znovu)
  const cache = shared?.cache ?? memoryCache();
  const memo = shared?.memo ?? new Map(); // stejný stav a krok → stejné řešení (opakovaná simulace)
  // otisk kroku: co ovlivní hledání (tahy, držení, čas, pohled, délka, váhy)
  const ergoKey = JSON.stringify([plan.lambda ?? 0.5, plan.ergonomics ?? null]);
  const stepKeys = new Map();
  const stepKey = (v, i) => {
    const k = `${v}|${i}`;
    if (!stepKeys.has(k)) {
      const step = plan.variants[v].steps[i], o = plan.stepOpts[i];
      stepKeys.set(k, JSON.stringify([step.moves.map((m) => P.moveToString(m)), step.held.map((m) => P.moveToString(m)), o.time, o.view, o.maxLen, quick, ergoKey]));
    }
    return stepKeys.get(k);
  };

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
    const fast = simplifyGoal(constraints);
    if (virtual) clock.setVirtual(true, 1);
    try {
      const full = prepare({ puzzle: P, constraints: fast, moves, targets: [target], nearLimit, cache });
      if (quick) {
        const res = engineSearch(full, state, { maxLength: opts.maxLen || 20, extraDepth: 0, maxResults: 1, timeLimit: 20000 * timeScale });
        for (const alg of res.solutions) handlers.onSolution(alg);
      } else explore({
        P, start: state, target, constraints: fast, moves, held, auf: null,
        options: { lambda: plan.lambda ?? 0.5, maxLength: opts.maxLen || 20, extraDepth: 1, maxResults: 800, timeLimit: (opts.time ?? 3000) * timeScale, nearLimit, library: (step.candidates ?? []).map((c) => c.model) },
        config, handlers, tracker, scoreOf, onTable: () => {}, t0: clock.now(), full, cache,
      });
    } finally {
      if (virtual) clock.setVirtual(false);
    }
    // jen řešení, která cíl opravdu splní (etapy a bloky znají jen část cíle)
    const reaches = compileGoal(constraints).test;
    const list = [...seen].filter(([model]) => { try { return (!opts.maxLen || model.split(' ').length <= opts.maxLen) && reaches(P.applyAlg(state, model)); } catch { return false; } })
      .map(([model, score]) => ({ model, score, m: styleMetrics(score, true) }));
    if (!list.length) return null;
    const best = rankResults(list, opts.view ?? 'speed', { lambda: plan.lambda ?? 0.5 })[0];
    return { model: best.model, display: toHeld(best.model), score: best.m.total, source: 'search' };
  }

  /**
   * Krok na dvě etapy (záloha, když hledání celého kroku v čase nic nenajde – třeba OLL
   * při krátkém hledání): nejdřív hrany kroku, pak zbytek; bez hran půlka dílků. Delší
   * řešení (jako 2-look), ale přijde rychle.
   */
  function twoStage(i, state, v, goal, done) {
    const parts = plan.variants[v].steps[i].parts ?? {};
    const isEdge = (n) => { try { return P.slotByName(n).facelets.length === 2; } catch { return false; } };
    let A = {};
    for (const [n, c] of Object.entries(parts)) {
      if (n === '#classes') { const e = c.filter((x) => x.pieces.every(isEdge)); if (e.length && e.length < c.length) A['#classes'] = e; } else if (isEdge(n)) A[n] = c;
    }
    const keys = Object.keys(parts).filter((n) => n !== '#classes');
    if (!Object.keys(A).length || Object.keys(A).length === Object.keys(parts).length && !A['#classes']) {
      if (keys.length < 2 || parts['#classes']) return null;
      A = Object.fromEntries(keys.slice(0, Math.ceil(keys.length / 2)).map((n) => [n, parts[n]]));
    }
    const first = search(i, state, v, mergeConstraints(done, A), 1);
    if (!first) return null;
    const mid = P.applyAlg(state, first.model);
    const rest = search(i, mid, v, goal, 1);
    if (!rest) return null;
    const join = (a, b) => [a, b].filter(Boolean).join(' ');
    return { model: join(first.model, rest.model), display: join(first.display, rest.display), score: first.score + rest.score, source: 'search' };
  }

  /** Řešení kroku i ze stavu (orientace v, cíl goal = dosud hotové + dílky kroku, done = dosud hotové). */
  async function solveStep(i, state, test, v, goal = plan.variants[v].goals[i], done = null) {
    const step = plan.variants[v].steps[i];
    const opts = plan.stepOpts[i];
    let r = null;
    // sada se zkouší vždy (učením se během testu mění), hledání se pamatuje
    if (opts.mode !== 'search' && step.candidates?.length) r = pickFromSet(state, test, step.candidates, step.adjust);
    if (!r && opts.mode === 'set') r = { model: '', display: '', score: 0, source: 'missing' };
    if (r) return r;
    const key = `${stepKey(v, i)}|${constraintsKey(goal)}|${state.join(',')}`;
    if (memo.has(key)) return memo.get(key);
    // hledání: když v čase nic nenajde, zkusí to znovu déle (krok se musí složit)
    // krok algoritmů: případ se hledá jednou a pak se algoritmus používá – radši déle a celý
    // (etapy by daly dlouhý „2-look“ algoritmus); intuitivní krok: etapy hned po prvním pokusu
    for (const scale of opts.cases ? [1, 3, 'stages', 10] : [1, 'stages', 3, 10]) {
      if (r) break;
      r = scale === 'stages' ? (done ? twoStage(i, state, v, goal, done) : null) : search(i, state, v, goal, scale);
      if (r && !test(P.applyAlg(state, r.model))) r = null;
    }
    if (memo.size > 50000) memo.delete(memo.keys().next().value);
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
