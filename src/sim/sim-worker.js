// Worker simulátoru metody: dostane plán (plan.js) a pak skládá jedno zamíchání po
// druhém (stepsolver.js). Víc workerů skládá různá zamíchání souběžně; databáze
// a už vyřešené kroky si každý pamatuje mezi zamícháními.
//
// Vstup:  { type: 'plan', plan } · { type: 'solve', id, start }
// Výstup: { type: 'solved', id, solve } · { type: 'error', id, message }

import { makeStepSolver, betterFor } from './stepsolver.js';
import { simulate } from './simulate.js';
import { initKernel } from '../search/kernel.js';
import { getPuzzle } from '../puzzles/index.js';
import { colorsOfState } from '../core/cases.js';
import { scoreFor } from '../ergonomics/puzzles.js';
import { candidateIn } from './learn.js';

const P = getPuzzle('333');
const ALL = Object.fromEntries(P.slots.map((s) => [s.name, 'solved']));
const colors = (loc) => colorsOfState(P, loc, ALL).join('');

const kernel = initKernel();
let plan = null;
let solver = null;


self.onmessage = async ({ data }) => {
  await kernel;
  if (data.type === 'plan') {
    plan = data.plan;
    solver = makeStepSolver(plan);
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
      if (!model) return x;
      const after = P.applyAlg(state, model);
      // u kroků algoritmů případ celý (stav, cíl, orientace) – simulátor řešení slučuje po případech
      const out = x.source !== 'search' ? x : plan.stepOpts[i]?.cases
        ? { ...x, model, case: { state: Array.from(state), goal, variant: x.variant ?? 0 } }
        : { ...x, case: { a: colors(state), b: colors(after), hold: plan.variants[x.variant ?? 0]?.hold ?? '' } };
      state = after;
      return out;
    });
    self.postMessage({ type: 'solved', id: data.id, solve: { ...solve, start: Array.from(solve.start), steps, end: colors(state) } });
  } catch (e) {
    self.postMessage({ type: 'error', id: data.id, message: e.message });
  }
};
