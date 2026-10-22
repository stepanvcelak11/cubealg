// Web Worker pro zamíchání (2×2 a 4×4 z náhodného stavu potřebují řešič).

import { scramble, bigOrientation } from './scramble.js';
import { scramble222 } from './random-state.js';

// 4×4 z náhodného stavu (tabulky se staví při prvním použití); při chybě náhodné tahy.
async function scramble444(event) {
  try {
    const { scramble444: random } = await import('./fourbyfour.js');
    const text = random();
    return event === '444bf' ? [text, bigOrientation()].filter(Boolean).join(' ') : text;
  } catch {
    return scramble(event);
  }
}

// nácvik kroku metody: předchozí kroky hotové (3×3)
async function practice(fixed) {
  const { practiceScramble } = await import('./practice.js');
  return practiceScramble(fixed) || scramble('333');
}

// nácvik kroku po krocích s pravidly (kříž z kterýchkoli hran, separace…): náhodné
// zamíchání se složí podle předchozích kroků metody (simulátor) a zamíchání vede do
// výsledného stavu – jako by je skladač právě udělal
async function practiceSim(plan) {
  const [{ makeStepSolver, betterFor }, { simulate }, { practiceState }, { solve }, { toFacelets, applyAlg }, { initKernel }] = await Promise.all([
    import('../sim/stepsolver.js'), import('../sim/simulate.js'), import('./practice.js'), import('./twophase.js'), import('../core/cube.js'), import('../search/kernel.js')]);
  await initKernel().catch(() => false);
  const solver = makeStepSolver(plan, { quick: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    const start = practiceState({});
    const { solves } = await simulate({ starts: [start], variants: plan.variants, solveStep: solver.solveStep, better: betterFor(plan) });
    if (!solves[0]?.ok) continue;
    let state = start;
    for (const x of solves[0].steps) if (x.model) state = applyAlg(state, x.model);
    const sol = solve(toFacelets(state));
    const moves = sol ? sol.split(' ').filter(Boolean) : [];
    if (moves.length >= 2) return moves.reverse().map((m) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : `${m}'`)).join(' ');
  }
  return null;
}

self.onmessage = async ({ data }) => {
  try {
    const text = data.opts?.plan ? (await practiceSim(data.opts.plan)) ?? (await practice(data.opts.fixed ?? {}))
      : data.opts?.fixed ? await practice(data.opts.fixed)
      : data.event === '222' ? scramble222()
      : data.event === '444' || data.event === '444bf' ? await scramble444(data.event)
        : scramble(data.event, data.opts);
    self.postMessage({ id: data.id, scramble: text });
  } catch (e) {
    self.postMessage({ id: data.id, error: e.message });
  }
};
