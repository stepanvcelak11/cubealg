// Výuka metody pro nováčka (Průvodce i Učebnice): vysvětlení každého kroku
// (sim/explain.js) s nastavením kroku, zápis tahů a ukázkové složení – jedno
// skutečné složení z posledního testu metody, krok po kroku s kostkou po každém kroku.

import { storage } from './dom.js';
import { algs } from './store.js';
import { stepConfig, solveByOf } from './stepcfg.js';
import { buildPlan, stepBases } from '../sim/plan.js';
import { explainStep, MOVE_TEXT } from '../sim/explain.js';
import { holdOf } from '../core/hold.js';
import { applyAlg, solved, toFacelets, equals } from '../core/cube.js';
import { solve as twoPhase } from '../timer/twophase.js';

const invert = (m) => (m.endsWith("'") ? m.slice(0, -1) : m.endsWith('2') ? m : `${m}'`);

/** Vysvětlení kroku i metody (viz sim/explain.js). */
export function teachStep(method, guide, i) {
  const st = guide.steps[i];
  const cfg = stepConfig(method, st);
  const solveBy = solveByOf(cfg, st);
  return explainStep({
    steps: guide.steps, i, frame: guide.frame, cfg, solveBy,
    algCount: st.set ? algs.inSet(st.set).length : 0,
    moves: solveBy === 'fixed' ? [] : stepBases(cfg),
  });
}

/** Zápis tahů použitých v metodě: [[tah, vysvětlení]]. */
export function notationOf(method, guide) {
  const used = new Set();
  for (const st of guide.steps) {
    const cfg = stepConfig(method, st);
    if (solveByOf(cfg, st) === 'fixed') for (const m of String(cfg.fixedAlg ?? '').match(/[A-Za-z]/g) ?? []) used.add(m);
    else for (const b of stepBases(cfg)) used.add(b);
  }
  return [...used].filter((b) => MOVE_TEXT[b]).sort((a, b) => Object.keys(MOVE_TEXT).indexOf(a) - Object.keys(MOVE_TEXT).indexOf(b)).map((b) => [b, MOVE_TEXT[b]]);
}

/**
 * Ukázkové složení z posledního testu metody: zamíchání a každý krok (tahy, otočení,
 * kostka po kroku). Tahy kroků se ověří – když složení nesedí (metoda se mezitím
 * změnila), vezme se další; bez vhodného testu null.
 * @returns {{scramble: string, steps: {id, title, alg, rotation, skipped, fixed, facelets, hold, label}[]}|null}
 */
export function exampleSolve(method, guide) {
  const run = storage.get('ergocube.sim.run');
  if (!run?.solves?.length || run.meta?.method !== method) return null;
  const ids = run.meta.stepIds ?? [];
  if (!ids.every((id) => guide.steps.some((st) => st.id === id))) return null;
  let plan;
  try {
    const config = Object.fromEntries(guide.steps.map((st) => [st.id, stepConfig(method, st)]));
    ({ plan } = buildPlan({ guide, config, setAlgs: (id) => algs.list().filter((a) => (a.set ?? 'default') === id) }));
  } catch { return null; }
  if (plan.variants[0].steps.length !== ids.length) return null;
  const goal = solved();
  // nejkratší z ověřitelných složení (u ukázky je lepší jednodušší)
  const candidates = run.solves.filter((s) => s.ok && s.start && s.steps.every((x) => x.source === 'skip' || x.display != null))
    .sort((a, b) => a.steps.reduce((t, x) => t + (x.length ?? 0), 0) - b.steps.reduce((t, x) => t + (x.length ?? 0), 0));
  for (const s of candidates.slice(0, 12)) {
    let state = Uint8Array.from(s.start);
    const steps = [];
    let ok = true;
    for (const [j, x] of s.steps.entries()) {
      const v = plan.variants[x.variant ?? 0] ?? plan.variants[0];
      const title = guide.steps.find((st) => st.id === ids[j])?.title || `Krok ${j + 1}`;
      const fixed = !!plan.variants[0].steps[j]?.fixed;
      if (x.source !== 'skip' && x.display) {
        try { state = applyAlg(state, x.model || holdOf(v.hold).toModelString(x.display)); } catch { ok = false; break; }
      }
      steps.push({ id: ids[j], title, alg: x.source === 'skip' ? '' : x.display, rotation: x.rotation ?? '', skipped: x.source === 'skip', fixed, facelets: toFacelets(state), hold: v.hold, label: v.label, length: x.length ?? 0 });
    }
    if (!ok || !equals(state, goal)) continue;
    let scramble = '';
    try { scramble = (twoPhase(toFacelets(Uint8Array.from(s.start)), { timeLimit: 1500 }) ?? '').split(' ').filter(Boolean).reverse().map(invert).join(' '); } catch { /* bez zápisu */ }
    if (!scramble) continue;
    return { scramble, start: toFacelets(Uint8Array.from(s.start)), firstHold: plan.variants[s.variant ?? 0]?.hold ?? '', firstLabel: plan.variants[s.variant ?? 0]?.label ?? '', steps };
  }
  return null;
}
