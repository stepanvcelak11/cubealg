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
  assert.equal(all.variants.length, 24);
  assert.equal(all.choices[0], 12); // hrana kamkoli: 12 míst (každé ze dvou orientací)
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

test('volnost kroku: pár v kterémkoli slotu, otočení kostky, kříž libovolnou barvou', async () => {
  const pairs = { frame: { down: 'D', front: 'F' }, steps: [
    { id: 'c', title: 'Kříž', parts: parts(['DF', 'DR', 'DB', 'DL']) },
    { id: 'p', title: 'Pár', parts: parts(['DFR', 'FR']) },
  ] };
  const side = buildPlan({ guide: pairs, config: { c: { time: 1 }, p: { time: 1, free: 'side' } } }).plan;
  assert.equal(side.variants.length, 4);
  assert.equal(side.choices[1], 4);
  assert.deepEqual(side.variants[0].next[1], [0, 1, 2, 3]);
  assert.equal(side.variants[0].rotation[side.variants[0].next[1][1]].split(' ').length, 1);
  // stav: kříž hotový, pár DRB+BR hotový, pár DFR+FR rozbitý
  const broken = applyAlg(solved(), "R U R'");
  const fixed = buildPlan({ guide: pairs, config: { c: { time: 1 }, p: { time: 1 } } }).plan;
  const a = await solveScrambles(fixed, [broken], { virtual: true });
  assert.ok(a.solves[0].ok);
  assert.ok(a.solves[0].steps[1].length > 0);
  // s volností je hotový pár v jiném slotu = krok přeskočený
  const b = await solveScrambles(side, [broken], { virtual: true });
  assert.equal(b.solves[0].steps[1].source, 'skip');
  assert.notEqual(b.solves[0].steps[1].variant, 0);
  // otočení kostky jako tah: řešení kroku v jiné orientaci nese zápis otočení
  const rot = buildPlan({ guide: pairs, rotation: 'move', config: { c: { time: 1 }, p: { time: 1, free: 'side' } } }).plan;
  assert.equal(rot.rotation, 'move');
  const c = await solveScrambles(rot, [applyAlg(solved(), "R U R' L' U L B U B' U B' U' B U2")], { virtual: true });
  assert.ok(c.solves[0].ok);
  // kříž zůstal a jeden z párů je hotový; otočení se započítalo, když se orientace změnila
  let state = c.solves[0].start;
  for (const x of c.solves[0].steps) state = applyAlg(state, x.model);
  assert.ok(compileGoal(parts(['DF', 'DR', 'DB', 'DL'])).test(state));
  assert.ok([['DFR', 'FR'], ['DRB', 'BR'], ['DBL', 'BL'], ['DLF', 'FL']].some((p) => compileGoal(parts(p)).test(state)));
  const p2 = c.solves[0].steps[1];
  assert.notEqual(p2.source, 'skip');
  if (p2.variant !== 0) assert.equal(p2.length, lengthOf(p2.display) + 1);
  // kříž libovolnou barvou: hotový kříž na bílé (U) = přeskočeno
  const cn = buildPlan({ guide: pairs, config: { c: { time: 1, free: 'all' }, p: { time: 1, free: 'side' } } }).plan;
  assert.equal(cn.choices[0], 6);
  const d = await solveScrambles(cn, [applyAlg(solved(), "D R2 D' F2 L B'")], { virtual: true });
  assert.ok(d.solves[0].ok);
  const e = await solveScrambles(cn, [applyAlg(solved(), 'D')], { virtual: true });
  assert.equal(e.solves[0].steps[0].source, 'skip'); // bílý kříž je hotový
});

test('krok „jen někdy“: parita M2 U2 M2 jen při liché vrstvě, pak další krok', async () => {
  const { fixedNeeded, layerOdd } = await import('../src/sim/simulate.js');
  const guide = { steps: [
    { id: 'p', title: 'Parita', cells: {} },
    { id: 'e', title: 'Hrany', cells: { UR: { own: 'solved' }, UL: { own: 'solved' } } },
  ] };
  const config = { p: { solveBy: 'fixed', fixedAlg: 'M2 U2 M2', when: 'parity' }, e: { time: 1 } };
  const { plan, steps } = buildPlan({ guide, config });
  assert.equal(steps.length, 2);
  const fixed = plan.variants[0].steps[0].fixed;
  assert.ok(fixed.algs.length === 1 && fixed.layers.U.length === 8);
  // výchozí držení (bílá dole): nahoře žlutá vrstva = skutečná D
  assert.equal(layerOdd(solved(), fixed.layers.U), 0);
  const odd = applyAlg(solved(), fixed.algs[0].model); // zápis podle držení (bílá dole)
  assert.ok(fixedNeeded(fixed, odd));
  assert.ok(!fixedNeeded(fixed, applyAlg(solved(), 'U'))); // natočení vrstvy paritu nemění
  const { solves } = await solveScrambles(plan, [odd, applyAlg(solved(), 'D')], { virtual: true });
  assert.equal(solves[0].steps[0].source, 'fixed');
  assert.equal(solves[0].steps[0].length, 3);
  assert.equal(solves[0].steps[1].source, 'skip');
  assert.equal(solves[1].steps[0].source, 'skip');
  assert.ok(solves.every((s) => s.ok));
});
