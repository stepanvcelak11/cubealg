import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg } from '../src/core/cube.js';
import { compileGoal } from '../src/core/constraints.js';
import { MoveSet } from '../src/core/moveset.js';
import { findAlgs } from '../src/search/engine.js';
import { simulate, summarize, pickFromSet, lengthOf } from '../src/sim/simulate.js';

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
  const r = pickFromSet(turned, test, cands, aufs);
  assert.equal(r.name, 'T');
  assert.equal(r.display, `U' ${T}`);
  assert.ok(test(applyAlg(turned, r.model)));
  assert.equal(pickFromSet(applyAlg(solved(), 'R U R\''), test, cands, aufs), null);
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
