// Simulátor metody: náhodná zamíchání (náhodný stav 3×3) se složí krok po kroku
// podle metody – po kroku i musí být hotové dílky kroků 0…i (goals). Každý krok
// řeší buď algoritmus z tvé sady (když nějaký případ vyřeší), nebo hledání.
// Ze všech složení pak vyjde průměrný počet tahů a náročnost celé metody i
// jednotlivých kroků – a který krok nejvíc zdržuje.
//
// Logika je oddělená od UI (ui/simulator.js), aby šla spustit i v Node (testy).

import { compileGoal } from '../core/constraints.js';
import { applyAlg } from '../core/cube.js';
import { practiceState } from '../timer/practice.js';

/** Počet tahů zápisu (každý token je tah, AUF i rotace se počítají). */
export const lengthOf = (alg) => (alg ? alg.trim().split(/\s+/).filter(Boolean).length : 0);

/**
 * Algoritmus ze sady, který krok vyřeší (případně s AUF před ním).
 * @param {Uint8Array} state stav kostky
 * @param {(loc: Uint8Array) => boolean} test cíl kroku
 * @param {{model: string, display: string, score: number, time?: number, name?: string}[]} candidates
 *   algoritmy ze sady (model = zápis v tazích modelu, display = jak ho děláš)
 * @param {{model: string, display: string}[]} aufs natočení před algoritmem (včetně prázdného)
 * @returns nejlepší podle tvého času z trenažéru (když ho má), jinak podle náročnosti; nebo null
 */
export function pickFromSet(state, test, candidates, aufs = [{ model: '', display: '' }]) {
  let best = null;
  const key = (c) => [c.time ?? Infinity, c.score];
  const better = (a, b) => { const x = key(a), y = key(b); return x[0] !== y[0] ? x[0] < y[0] : x[1] < y[1]; };
  for (const c of candidates) {
    for (const auf of aufs) {
      const model = [auf.model, c.model].filter(Boolean).join(' ');
      let after;
      try { after = applyAlg(state, model); } catch { continue; }
      if (!test(after)) continue;
      const display = [auf.display, c.display].filter(Boolean).join(' ');
      const item = { model, display, score: c.score, time: c.time, name: c.name, source: 'set' };
      if (!best || better(item, best)) best = item;
      break; // nejkratší AUF pro tento algoritmus stačí
    }
  }
  return best;
}

/**
 * Spustí simulaci.
 * @param {object} p
 * @param {number} p.count počet zamíchání
 * @param {Record<string,string>[]} p.goals omezení po každém kroku (kumulativně)
 * @param {(i: number, state: Uint8Array, test: Function) => Promise<{model: string, display: string, score: number, source: string, name?: string}|null>} p.solveStep
 * @param {(n: number) => number} [p.rand] náhoda (randomInt)
 * @param {(info: {solve: number, step: number, solves: object[]}) => void} [p.onProgress]
 * @param {() => boolean} [p.stopped]
 * @returns {Promise<{solves: {steps: object[], ok: boolean}[]}>}
 */
export async function simulate({ count, goals, solveStep, rand, onProgress, stopped = () => false }) {
  const tests = goals.map((g) => compileGoal(g).test);
  const solves = [];
  for (let k = 0; k < count && !stopped(); k++) {
    let state = practiceState({}, rand);
    const start = state;
    const steps = [];
    let ok = true;
    for (let i = 0; i < goals.length && !stopped(); i++) {
      onProgress?.({ solve: k, step: i, solves });
      if (tests[i](state)) { steps.push({ model: '', display: '', length: 0, score: 0, source: 'skip' }); continue; }
      const r = await solveStep(i, state, tests[i]);
      if (stopped()) break;
      if (!r) { ok = false; steps.push({ model: '', display: '', length: 0, score: 0, source: 'none' }); break; }
      const after = applyAlg(state, r.model);
      if (!tests[i](after)) { ok = false; steps.push({ ...r, length: lengthOf(r.display), source: 'none' }); break; }
      state = after;
      steps.push({ ...r, length: lengthOf(r.display) });
    }
    if (stopped() && steps.length < goals.length) break;
    solves.push({ start, steps, ok });
  }
  onProgress?.({ solve: solves.length, step: goals.length, solves });
  return { solves };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)) : 0; };

/**
 * Souhrn: pro každý krok průměrné tahy a náročnost, podíl na celku, jak často
 * se krok přeskočil a kolikrát pomohla tvoje sada; celkový průměr a rozložení.
 */
export function summarize(solves, stepCount) {
  const done = solves.filter((s) => s.ok);
  const steps = Array.from({ length: stepCount }, (_, i) => {
    const items = done.map((s) => s.steps[i]).filter(Boolean);
    const solvedBy = (src) => items.filter((x) => x.source === src).length;
    const needed = items.filter((x) => x.source !== 'skip').length;
    return {
      moves: mean(items.map((x) => x.length)),
      score: mean(items.map((x) => x.score)),
      max: Math.max(0, ...items.map((x) => x.length)),
      skipped: items.length ? solvedBy('skip') / items.length : 0,
      fromSet: solvedBy('set'),
      searched: solvedBy('search'),
      needed,
    };
  });
  const totals = done.map((s) => s.steps.reduce((a, x) => a + x.length, 0));
  const scores = done.map((s) => s.steps.reduce((a, x) => a + x.score, 0));
  const total = mean(totals);
  for (const st of steps) st.share = total ? st.moves / total : 0;
  const worst = steps.reduce((w, st, i) => (st.moves > (steps[w]?.moves ?? -1) ? i : w), 0);
  const lo = Math.min(...totals), hi = Math.max(...totals);
  const width = Math.max(1, Math.ceil((hi - lo + 1) / 10));
  const hist = [];
  if (totals.length) for (let a = lo; a <= hi; a += width) hist.push({ from: a, to: a + width - 1, n: totals.filter((t) => t >= a && t < a + width).length });
  return {
    count: done.length, failed: solves.length - done.length,
    moves: total, movesSd: sd(totals), score: mean(scores), min: totals.length ? lo : 0, max: totals.length ? hi : 0,
    steps, worst, hist,
  };
}
