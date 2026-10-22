// Worker simulátoru metody: dostane plán (plan.js) a pak skládá jedno zamíchání po
// druhém (stepsolver.js). Víc workerů skládá různá zamíchání souběžně; databáze
// a už vyřešené kroky si každý pamatuje mezi zamícháními.
//
// Vstup:  { type: 'plan', plan } · { type: 'solve', id, start }
// Výstup: { type: 'solved', id, solve } · { type: 'error', id, message }

import { makeStepSolver } from './stepsolver.js';
import { simulate } from './simulate.js';
import { initKernel } from '../search/kernel.js';

const kernel = initKernel();
let plan = null;
let solver = null;

const better = (a, b) => {
  const view = plan.stepOpts[0].view ?? 'speed';
  const ka = view === 'efficient' ? [a.length, a.score] : [a.score, a.length];
  const kb = view === 'efficient' ? [b.length, b.score] : [b.score, b.length];
  return ka[0] !== kb[0] ? ka[0] < kb[0] : ka[1] < kb[1];
};

self.onmessage = async ({ data }) => {
  await kernel;
  if (data.type === 'plan') {
    plan = data.plan;
    solver = makeStepSolver(plan);
    return;
  }
  if (data.type !== 'solve') return;
  try {
    const { solves } = await simulate({ starts: [Uint8Array.from(data.start)], variants: plan.variants, solveStep: solver.solveStep, better });
    // jen to, co potřebuje souhrn (bez zápisu tahů modelu)
    const solve = solves[0];
    self.postMessage({ type: 'solved', id: data.id, solve: { ...solve, start: Array.from(solve.start), steps: solve.steps.map(({ model, ...x }) => x) } });
  } catch (e) {
    self.postMessage({ type: 'error', id: data.id, message: e.message });
  }
};
