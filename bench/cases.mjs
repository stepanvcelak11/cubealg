// Kolik algoritmů si test metody vytvoří u kroků „algoritmy – vygenerovat“: složí
// zamíchání jako simulátor v aplikaci (algoritmy nalezené u dřívějších zamíchání se
// hned používají, sim/learn.js) a vypíše počet případů po krocích.
//   node bench/cases.mjs [zamíchání] [sekund na krok] [filtr metody]

import { buildPlan } from '../src/sim/plan.js';
import { makeStepSolver, betterFor } from '../src/sim/stepsolver.js';
import { simulate, seededRandom } from '../src/sim/simulate.js';
import { makeLearner, candidateIn } from '../src/sim/learn.js';
import { practiceState } from '../src/timer/practice.js';
import { DEFAULT_FRAME } from '../src/ui/parts.js';
import { initKernel } from '../src/search/kernel.js';
import { getPuzzle } from '../src/puzzles/index.js';
import { TEMPLATES, templateGuide } from '../src/sim/templates.js';

const P = getPuzzle('333');
const count = Number(process.argv[2] ?? 40);
const seconds = Number(process.argv[3] ?? 1);
const filter = process.argv[4] ?? 'separation';

await initKernel();
let seq = 0;
const newStep = (title) => ({ id: `k${++seq}`, title });
for (const t of TEMPLATES.filter((x) => x.id === filter || x.name.includes(filter))) {
  const guide = templateGuide(t, DEFAULT_FRAME, newStep);
  const config = Object.fromEntries(guide.steps.map((st) => [st.id, { time: seconds, ...(st.sim ?? {}) }]));
  const { plan, steps } = buildPlan({ guide, config });
  const solver = makeStepSolver(plan);
  const learner = makeLearner(plan);
  const rand = seededRandom(1);
  const searched = steps.map(() => 0);
  const t0 = Date.now();
  for (let k = 0; k < count; k++) {
    const { solves } = await simulate({ starts: [practiceState({}, rand)], variants: plan.variants, solveStep: solver.solveStep, better: betterFor(plan) });
    let state = solves[0].start;
    solves[0].steps.forEach((x, i) => {
      if (!x.model) return;
      if (x.source === 'search' && plan.stepOpts[i].cases) {
        searched[i]++;
        const { entry, fresh } = learner.offer(i, { ...x, state, variant: x.variant });
        if (fresh && plan.stepOpts[i].learn) plan.variants.forEach((v, j) => v.steps[i].candidates.push(candidateIn(plan, j, { display: entry.display, score: x.score })));
      }
      state = P.applyAlg(state, x.model);
    });
    if (!solves[0].ok) console.log(`  zamíchání ${k}: nesloženo`);
  }
  console.log(`\n${t.name}: ${count} zamíchání, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  steps.forEach((x, i) => {
    if (!plan.stepOpts[i].cases) return;
    const list = learner.list(i);
    console.log(`  ${x.st.title.padEnd(16)} ${String(list.length).padStart(3)} algoritmů (hledáno ${searched[i]}×, natočení ${plan.variants[0].steps[i].adjust.pre.length > 4 ? 'U+D' : plan.variants[0].steps[i].adjust.pre.length > 1 ? 'U' : '–'})  ${list.slice(0, 4).map((e) => `${e.display} (${e.n}×)`).join(' · ')}`);
  });
}
