// Worker simulátoru metody: dostane plán (plan.js) a pak skládá jedno zamíchání po
// druhém (stepsolver.js). Víc workerů skládá různá zamíchání souběžně; databáze
// a už vyřešené kroky si každý pamatuje mezi zamícháními.
//
// Vstup:  { type: 'plan', plan } · { type: 'solve', id, start }
// Výstup: { type: 'solved', id, solve } · { type: 'error', id, message }

import { makeStepSolver, betterFor, memoryCache } from './stepsolver.js';
import { simulate } from './simulate.js';
import { initKernel } from '../search/kernel.js';
import { getPuzzle } from '../puzzles/index.js';
import { colorsOfState } from '../core/cases.js';
import { scoreFor } from '../ergonomics/puzzles.js';
import { candidateIn } from './learn.js';

const P = getPuzzle('333');
const ALL = Object.fromEntries(P.slots.map((s) => [s.name, 'solved']));
const colors = (loc) => colorsOfState(P, loc, ALL).join('');

/** Případ kroku pro Lab: barvy před krokem (jen dílky cíle), cíl (vybarvené pevné dílky) a omezení. */
function missOf(state, goal, variant) {
  const fixed = Object.fromEntries(Object.entries(goal).filter(([n, c]) => !n.startsWith('#') && c && c !== 'ignore'));
  return { a: colorsOfState(P, state, goal).join(''), b: colorsOfState(P, P.solved(), fixed).join(''), goal, hold: plan.variants[variant]?.hold ?? '' };
}

const kernel = initKernel();
let plan = null;
let solver = null;
// databáze a nalezená řešení kroků přes plány (objevitel metod posílá jeden plán za druhým)
const shared = { cache: memoryCache(), memo: new Map() };


self.onmessage = async ({ data }) => {
  await kernel;
  if (data.type === 'plan') {
    plan = data.plan;
    solver = makeStepSolver(plan, { shared });
    return;
  }
  // nový algoritmus kroku (test ho našel u jiného zamíchání): další případy ho už použijí
  if (data.type === 'learn') {
    const score = scoreFor(P, data.display, solver.config).total;
    plan.variants.forEach((v, j) => v.steps[data.step]?.candidates.push(candidateIn(plan, j, { display: data.display, name: data.name, score })));
    return;
  }
  if (data.type !== 'solve') return;
  try {
    const { solves } = await simulate({ starts: [Uint8Array.from(data.start)], variants: plan.variants, solveStep: solver.solveStep, better: betterFor(plan), countRotation: plan.rotation === 'move' });
    // jen to, co potřebuje souhrn (bez zápisu tahů modelu)
    const solve = solves[0];
    // u kroků řešených hledáním i případ (barvy před a po) – z nalezených řešení jde
    // vytvořit sada algoritmů kroku (simulator.js)
    let state = solve.start;
    const steps = solve.steps.map(({ model, goal, ...x }, i) => {
      // případ, na který sada kroku nemá algoritmus: obrázek a zadání pro Lab (simulator.js)
      if (goal && (x.source === 'missing' || (x.source === 'search' && plan.variants[0].steps[i]?.candidates?.length))) x.miss = missOf(state, goal, x.variant ?? 0);
      if (!model) return x;
      const after = P.applyAlg(state, model);
      // u kroků algoritmů případ celý (stav, cíl, orientace) – simulátor řešení slučuje po případech
      // intuitivní krok: řešení není algoritmus k naučení – případ se nepředává (nesbírá se do sady)
      const out = x.source !== 'search' || plan.stepOpts[i]?.intuitive ? (data.keepModel ? { ...x, model } : x) : plan.stepOpts[i]?.cases
        ? { ...x, model, case: { state: Array.from(state), goal, variant: x.variant ?? 0 } }
        : { ...x, ...(data.keepModel ? { model } : {}), case: { a: colors(state), b: colors(after), hold: plan.variants[x.variant ?? 0]?.hold ?? '' } };
      state = after;
      return out;
    });
    self.postMessage({ type: 'solved', id: data.id, solve: { ...solve, start: Array.from(solve.start), steps, end: colors(state) } });
  } catch (e) {
    self.postMessage({ type: 'error', id: data.id, message: e.message });
  }
};
