import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg } from '../src/core/cube.js';
import { compileGoal } from '../src/core/constraints.js';
import { MoveSet } from '../src/core/moveset.js';
import { findAlgs } from '../src/search/engine.js';
import { simulate, summarize, pickFromSet, lengthOf, seededRandom, stepTime } from '../src/sim/simulate.js';
import { buildPlan } from '../src/sim/plan.js';
import { solveScrambles } from '../src/sim/stepsolver.js';
import { practiceState } from '../src/timer/practice.js';

const T = "R U R' U' R' F R2 U' R' U' R U R' F'";
const J = "R U R' F' R U R' U' R' F R2 U' R'";
const inverse = (alg) => alg.split(' ').reverse().map((m) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : `${m}'`)).join(' ');
const ALL = Object.fromEntries(['UF', 'UR', 'UB', 'UL', 'UFR', 'URB', 'UBL', 'ULF', 'DF', 'DR', 'DB', 'DL', 'DFR', 'DRB', 'DBL', 'DLF', 'FR', 'BR', 'BL', 'FL'].map((n) => [n, 'solved']));

/** Deterministická náhoda (LCG), jako randomInt(n). */
function seeded(seed) {
  let s = seed >>> 0;
  return (n) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s % n; };
}

test('sada: vybere algoritmus, který případ vyřeší, i s AUF před ním', () => {
  const test = compileGoal(ALL).test;
  const cands = [{ model: J, display: J, score: 10, name: 'J' }, { model: T, display: T, score: 12, name: 'T' }];
  const plain = applyAlg(solved(), inverse(T));
  assert.equal(pickFromSet(plain, test, cands).name, 'T');
  const turned = applyAlg(plain, 'U');
  const aufs = [{ model: '', display: '' }, { model: 'U', display: 'U' }, { model: "U'", display: "U'" }, { model: 'U2', display: 'U2' }];
  const r = pickFromSet(turned, test, cands, { pre: aufs });
  assert.equal(r.name, 'T');
  assert.equal(r.display, `U' ${T}`);
  assert.ok(test(applyAlg(turned, r.model)));
  assert.equal(pickFromSet(applyAlg(solved(), 'R U R\''), test, cands, { pre: aufs, post: aufs }), null);
});

test('sada: s časem z trenažéru vyhraje rychlejší, jinak méně náročný', () => {
  const test = compileGoal(ALL).test;
  const state = applyAlg(solved(), inverse(T));
  const a = { model: T, display: T, score: 12, name: 'a' };
  const b = { model: `${T} U4`.replace(' U4', ''), display: T, score: 9, name: 'b' };
  assert.equal(pickFromSet(state, test, [a, b]).name, 'b');
  assert.equal(pickFromSet(state, test, [{ ...a, time: 1.4 }, b]).name, 'a');
});

test('simulace: kroky se skládají postupně, výsledek splňuje všechny cíle a souhrn sedí', async () => {
  const goals = [{ DF: 'solved' }, { DF: 'solved', DR: 'solved' }, { DF: 'solved', DR: 'solved', DB: 'solved' }];
  const faces = MoveSet.preset('faces');
  const { solves } = await simulate({
    count: 4, goals, rand: seeded(7),
    solveStep: async (i, state) => {
      const res = findAlgs({ start: state, constraints: goals[i], moveSet: faces, maxLength: 8, extraDepth: 0, maxResults: 1, timeLimit: 20000 });
      const alg = res.solutions[0];
      return alg ? { model: alg, display: alg, score: lengthOf(alg) * 1.5, source: 'search' } : null;
    },
  });
  assert.equal(solves.length, 4);
  for (const s of solves) {
    assert.ok(s.ok);
    let state = s.start;
    s.steps.forEach((st, i) => {
      state = applyAlg(state, st.model);
      assert.ok(compileGoal(goals[i]).test(state), `krok ${i}`);
    });
  }
  const sum = summarize(solves, goals.length);
  assert.equal(sum.count, 4);
  const total = solves.reduce((a, s) => a + s.steps.reduce((b, x) => b + x.length, 0), 0) / 4;
  assert.ok(Math.abs(sum.moves - total) < 1e-9);
  assert.ok(Math.abs(sum.steps.reduce((a, st) => a + st.share, 0) - 1) < 1e-9);
  assert.equal(sum.hist.reduce((a, h) => a + h.n, 0), 4);
  assert.ok(sum.worst >= 0 && sum.worst < 3);
});

test('simulace: zastavení a krok bez řešení', async () => {
  let calls = 0;
  const { solves } = await simulate({
    count: 5, goals: [{ DF: 'solved' }], rand: seeded(3),
    solveStep: async () => { calls++; return null; },
    stopped: () => calls >= 2,
  });
  assert.ok(solves.length <= 2);
  assert.ok(solves.every((s) => !s.ok));
  assert.equal(summarize(solves, 1).count, 0);
});

test('sada: natočení po algoritmu a pomocný algoritmus (oprava parity) před ním', () => {
  const test = compileGoal(ALL).test;
  const cands = [{ model: T, display: T, score: 12, name: 'T' }];
  const layer = ['', 'U', "U'", 'U2'].map((d) => ({ model: d, display: d }));
  // po T je potřeba ještě U2
  const after = applyAlg(solved(), `U2 ${inverse(T)}`);
  const r = pickFromSet(after, test, cands, { pre: layer, post: layer });
  assert.ok(r && test(applyAlg(after, r.model)));
  assert.equal(r.extra, 1);
  // T po opravě: stav = inverze (oprava + T)
  const fix = 'M2 U2 M2';
  const par = applyAlg(solved(), inverse(`${fix} ${T}`));
  assert.equal(pickFromSet(par, test, cands, { pre: layer }), null);
  const h = pickFromSet(par, test, cands, { pre: layer, helpers: [{ model: fix, display: fix }] });
  assert.equal(h.helper, fix);
  assert.ok(test(applyAlg(par, h.model)));
});

test('semínko: stejná zamíchání, odhad času kroku', () => {
  const a = seededRandom(5), b = seededRandom(5);
  assert.deepEqual(Array.from(practiceState({}, a)), Array.from(practiceState({}, b)));
  assert.notDeepEqual(Array.from(practiceState({}, seededRandom(6))), Array.from(practiceState({}, seededRandom(5))));
  assert.equal(stepTime({ length: 8, source: 'search' }, { tps: 4, recog: 0.5 }), 2.5);
  assert.equal(stepTime({ length: 8, source: 'set', time: 1200, extra: 1 }, { tps: 4, recog: 0.5 }), 0.5 + 1.2 + 0.25);
  assert.equal(stepTime({ length: 0, source: 'skip' }, { recog: 1 }), 0);
});

const parts = (names, style = 'solved') => Object.fromEntries(names.map((n) => [n, style]));
const guide = { frame: { down: 'D', front: 'F' }, steps: [
  { id: 'a', title: 'Hrana', parts: parts(['DF']) },
  { id: 'b', title: 'Druhá', parts: parts(['DR']) },
  { id: 'c', title: 'Třetí', parts: parts(['DB']) },
] };

test('plán: kumulativní cíle, středy až na konci, vypnutý krok, orientace', () => {
  const { plan, steps } = buildPlan({ guide });
  assert.equal(steps.length, 3);
  assert.deepEqual(plan.variants[0].goals[1], { DF: 'solved', DR: 'solved' });
  assert.equal(plan.variants[0].goals[2].U, 'solved');
  const off = buildPlan({ guide, config: { b: { on: false } } });
  assert.deepEqual(off.steps.map((x) => x.st.id), ['a', 'c']);
  assert.deepEqual(Object.keys(off.plan.variants[0].goals[0]), ['DF']);
  assert.equal(buildPlan({ guide, neutral: 'dual' }).plan.variants.length, 2);
  const all = buildPlan({ guide, neutral: 'all' }).plan;
  assert.equal(all.variants.length, 6);
  // druhá orientace: tytéž dílky vůči držení = jiné dílky kostky (dole je U)
  assert.deepEqual(Object.keys(buildPlan({ guide, neutral: 'dual' }).plan.variants[1].goals[0]), ['UF']);
  const custom = buildPlan({ guide, config: { a: { moves: 'custom', custom: ['R', 'U'] } } }).plan;
  assert.deepEqual([...new Set(custom.variants[0].steps[0].held.map((m) => m.base))], ['R', 'U']);
});

test('řešič kroků: sada, „jen sada“ s chybějícím případem a barevná neutralita', async () => {
  const setAlgs = () => [{ alg: "R U R'", name: 'trojice', task: {} }];
  const g2 = { frame: { down: 'D', front: 'F' }, steps: [{ id: 'p', title: 'Pár', set: 's', parts: parts(['DFR', 'FR']) }] };
  // případ, který trojice vyřeší (i s AUF před ní)
  const start = applyAlg(solved(), "U R U' R'");
  const { plan } = buildPlan({ guide: g2, setAlgs, config: { p: { time: 1 } } });
  const { solves } = await solveScrambles(plan, [start], { virtual: true });
  assert.equal(solves[0].steps[0].source, 'set');
  assert.ok(solves[0].ok);
  const only = buildPlan({ guide: g2, setAlgs, config: { p: { mode: 'set' } } }).plan;
  const miss = await solveScrambles(only, [applyAlg(solved(), "R U2 R' F' U F")], { virtual: true });
  assert.equal(miss.solves[0].steps[0].source, 'missing');
  assert.equal(summarize(miss.solves, 1).steps[0].missing, 1);
  const dual = buildPlan({ guide, neutral: 'dual', config: { a: { time: 1 }, b: { time: 1 }, c: { time: 1 } } }).plan;
  const res = await solveScrambles(dual, [practiceState({}, seededRandom(3)), practiceState({}, seededRandom(4))], { virtual: true });
  assert.ok(res.solves.every((s) => s.ok));
});
