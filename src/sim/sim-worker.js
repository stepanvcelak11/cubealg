// Worker simulátoru metody: dostane plán (plan.js) a pak skládá jedno zamíchání po
// druhém (stepsolver.js). Víc workerů skládá různá zamíchání souběžně; databáze
// a už vyřešené kroky si každý pamatuje mezi zamícháními.
//
// Vstup:  { type: 'plan', plan } · { type: 'solve', id, start }
// Výstup: { type: 'solved', id, solve } · { type: 'error', id, message }

import { makeStepSolver, betterFor } from './stepsolver.js';
import { simulate } from './simulate.js';
import { initKernel } from '../search/kernel.js';

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
  if (data.type !== 'solve') return;
  try {
    const { solves } = await simulate({ starts: [Uint8Array.from(data.start)], variants: plan.variants, solveStep: solver.solveStep, better: betterFor(plan), countRotation: plan.rotation === 'move' });
    // jen to, co potřebuje souhrn (bez zápisu tahů modelu)
    const solve = solves[0];
    self.postMessage({ type: 'solved', id: data.id, solve: { ...solve, start: Array.from(solve.start), steps: solve.steps.map(({ model, ...x }) => x) } });
  } catch (e) {
    self.postMessage({ type: 'error', id: data.id, message: e.message });
  }
};
