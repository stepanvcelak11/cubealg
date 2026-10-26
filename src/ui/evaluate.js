// Test metody na zamíchání ve workerech pro objevitel a vymýšlení metod: stejné
// workery (sim/sim-worker.js), stejný model skladače jako test metody. Workery zůstávají
// mezi metodami a zamíchání k má vždy tentýž worker – nezměněné kroky má spočítané.

import { algs } from './store.js';
import { buildPlan } from '../sim/plan.js';
import { summarize, seededRandom } from '../sim/simulate.js';
import { practiceState } from '../timer/practice.js';
import { makeLearner } from '../sim/learn.js';
import { constraintsKey } from '../core/rules.js';

export const workerCount = () => Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));
/** Workery pro evaluate (ukončit: for (const w of pool) w.terminate()). */
export const workerPool = () => Array.from({ length: workerCount() }, () => new Worker(new URL('../sim/sim-worker.js', import.meta.url), { type: 'module' }));

/**
 * Otestuje nastavení kroků na zamícháních (souběžně ve workerech) → souhrn a počet algoritmů.
 * @returns {Promise<{sum: object, algs: number, failed: number}>}
 */
export async function evaluate({ guide, config, lab, count, seconds, level, stopped, onSolve, pool, counter }) {
  const setAlgs = (id) => algs.list().filter((a) => a.set === id);
  const { plan, steps } = buildPlan({ guide, config, setAlgs, rotation: 'free', ergonomics: lab.ergo, lambda: lab.lambda });
  // kratší hledání než v testu (návrhů je hodně) – pro všechny stejné, porovnání je férové
  // (kroky algoritmů ne pod 2 s: případ se hledá jen jednou, pak se algoritmus opakuje)
  plan.stepOpts = plan.stepOpts.map((o) => ({ ...o, time: Math.min(o.time, Math.max(seconds * 1000, o.cases ? 2000 : 0)) }));
  const learner = makeLearner(plan);
  plan.stepOpts.forEach((o, i) => learner.seed(i, plan.variants[0].steps[i].candidates));
  const rand = seededRandom(7);
  const starts = Array.from({ length: count }, () => practiceState({}, rand));
  const solves = [];
  // případy kroků algoritmů (souběžně se skládáním)
  const isAlg = (x) => x.cfg.kind === 'alg' && !x.fixed && x.cfg.solveBy !== 'intuitive';
  const counts = Promise.all(steps.map((x, i) => (isAlg(x) && !plan.variants[0].steps[i].fixed ? counter.count(plan, i) : null)));
  // workery zůstávají mezi návrhy a zamíchání k má vždy tentýž worker: nezměněné kroky
  // na stejném zamíchání má worker už spočítané (paměť řešení ve workeru)
  await new Promise((resolve) => {
    let active = pool.length;
    const queues = pool.map((_, w) => starts.map((_, k) => k).filter((k) => k % pool.length === w));
    const feed = (w, wi) => {
      if (stopped() || !queues[wi].length) { if (--active === 0) resolve(); return; }
      const k = queues[wi].shift();
      w.postMessage({ type: 'solve', id: k, start: Array.from(starts[k]) });
    };
    pool.forEach((w, wi) => {
      w.onmessage = ({ data }) => {
        if (data.type === 'solved') {
          data.solve.steps.forEach((x, i) => {
            if (x.case?.state && x.display) {
              const { entry, fresh } = learner.offer(i, { display: x.display, model: x.model, state: Uint8Array.from(x.case.state), goal: x.case.goal, variant: x.case.variant, score: x.score });
              if (fresh && plan.stepOpts[i]?.learn) for (const p of pool) p.postMessage({ type: 'learn', step: i, display: entry.display, name: `${i}` });
            }
          });
          solves.push({ ...data.solve, id: data.id });
          onSolve?.();
        }
        feed(w, wi);
      };
      w.onerror = () => feed(w, wi);
      w.postMessage({ type: 'plan', plan });
    });
    pool.forEach((w, wi) => feed(w, wi));
  });
  const kinds = steps.map((x) => x.cfg.kind ?? 'intuitive');
  const sum = summarize(solves, steps.length, { tps: 4, recog: plan.stepOpts.map((o) => o.recog), kinds, level, styles: steps.map((x) => x.cfg.style) });
  // algoritmy: kroky algoritmů – sada kroku + nové případy, které test potkal
  // (různé případy – víc algoritmů sady na tentýž případ je jeden; intuitivní kroky žádné)
  // odhad z výčtu případů; když nejde, případy, které test potkal (aspoň tolik)
  const counted = await counts;
  const perStep = steps.map((x, i) => (isAlg(x) ? (counted[i]?.cases ?? learner.cases(i)) : 0));
  const algCount = perStep.reduce((a, b) => a + b, 0);
  const approx = steps.some((x, i) => isAlg(x) && !counted[i]?.exact);
  return { ids: steps.map((x) => x.st.id), sum, algs: algCount, approx, perStep: steps.map((x, i) => [x.st.title || `Krok ${i + 1}`, perStep[i]]).filter(([, n]) => n), failed: sum.failed };
}


/**
 * Otisk metody: co je po každém kroku hotové, kolik míst smí krok mít, jak se řeší –
 * dvě metody se stejným otiskem se skládají stejně (null = metoda nejde sestavit).
 */
export function methodSig(guide, config) {
  try {
    const { plan, steps } = buildPlan({ guide, config });
    return JSON.stringify(steps.map((x, i) => [constraintsKey(plan.variants[0].steps[i].parts), plan.choices[i], x.cfg.kind, x.cfg.solveBy === 'intuitive']));
  } catch { return null; }
}

/**
 * Párový rozdíl b − a: jen zamíchání, která složily obě (nesložená by zkreslila průměr),
 * nejistota (90 %) z rozdílů na každém zamíchání zvlášť.
 * @returns {{dt: number, dm: number, err: number, n: number}}
 */
export function paired(a, b) {
  const ids = Object.keys(b.solveTimes).filter((k) => k in a.solveTimes);
  const d = ids.map((k) => b.solveTimes[k] - a.solveTimes[k]);
  const mean = (x) => x.reduce((p, q) => p + q, 0) / Math.max(1, x.length);
  const dt = mean(d), dm = mean(ids.map((k) => b.solveMoves[k] - a.solveMoves[k]));
  const sd = d.length > 1 ? Math.sqrt(d.reduce((p, q) => p + (q - dt) ** 2, 0) / (d.length - 1)) : Infinity;
  return { dt, dm, err: d.length > 1 ? (1.64 * sd) / Math.sqrt(d.length) : Infinity, n: ids.length };
}
