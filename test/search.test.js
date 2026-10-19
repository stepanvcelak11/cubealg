import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg, caseOf } from '../src/core/cube.js';
import { compileGoal } from '../src/core/constraints.js';
import { spec as makeConstraints, preset as presetConstraints } from './helpers.js';
import { MoveSet } from '../src/core/moveset.js';
import { findAlgs } from '../src/search/engine.js';

test('F2L FR: najde optimum a všechna řešení splňují cíl', () => {
  const constraints = presetConstraints('f2l-fr');
  const start = caseOf("U R U' R' U' F' U F");
  const res = findAlgs({ start, constraints, moveSet: MoveSet.preset('RUF'), maxLength: 9, extraDepth: 1 });
  assert.equal(res.reason, 'done');
  assert.ok(res.optimal <= 8);
  assert.ok(res.solutions.length > 1);
  const goal = compileGoal(constraints);
  for (const alg of res.solutions) {
    assert.ok(goal.test(applyAlg(start, alg)), alg);
    assert.ok(!/[LDB]/.test(alg), alg); // jen povolené tahy
  }
});

test('optimum souhlasí s délkou známého řešení', () => {
  const res = findAlgs({
    start: caseOf("R U R'"), constraints: presetConstraints('f2l-fr'),
    moveSet: MoveSet.preset('RU'), maxLength: 6, extraDepth: 0,
  });
  assert.equal(res.optimal, 3);
  assert.ok(res.solutions.includes("R U R'"));
});

test('řešení neobsahují zbytečné koncové tahy', () => {
  const res = findAlgs({
    start: caseOf("R U R'"), constraints: presetConstraints('f2l-fr'),
    moveSet: MoveSet.preset('RU'), maxLength: 6, extraDepth: 2,
  });
  // „R U R' U“ by splňovalo cíl už po třech tazích
  assert.ok(!res.solutions.some((a) => a.startsWith("R U R' ")));
});

test('slice tahy a omezení na orientaci (EO)', () => {
  const start = applyAlg(solved(), "F");
  const constraints = makeConstraints({ orientation: ['edges'] });
  const res = findAlgs({ start, constraints, moveSet: new MoveSet({ bases: ['F', 'U', 'R'] }), maxLength: 3, extraDepth: 0 });
  assert.equal(res.optimal, 1);
  assert.ok(res.solutions.includes('F') && res.solutions.includes("F'"));
});

test('PLL s M tahy: U perm', () => {
  const start = caseOf("M2 U M U2 M' U M2");
  const res = findAlgs({
    start, constraints: presetConstraints('pll'),
    moveSet: new MoveSet({ bases: ['M', 'U'] }), maxLength: 7, extraDepth: 0,
  });
  assert.equal(res.optimal, 7);
  assert.ok(res.solutions.length >= 1);
});

test('nedosažitelný cíl a už splněný cíl', () => {
  const unsolvable = findAlgs({
    start: applyAlg(solved(), 'F'), constraints: presetConstraints('cross'),
    moveSet: MoveSet.preset('RU'), maxLength: 5,
  });
  assert.equal(unsolvable.reason, 'unsolvable');
  const already = findAlgs({ start: applyAlg(solved(), 'U'), constraints: presetConstraints('f2l') });
  assert.equal(already.reason, 'already-solved');
});

test('limit počtu výsledků', () => {
  const res = findAlgs({
    start: caseOf("R U R' U' R U R'"), constraints: presetConstraints('f2l-fr'),
    moveSet: MoveSet.preset('F2L'), maxLength: 10, extraDepth: 3, maxResults: 5,
  });
  assert.equal(res.reason, 'results');
  assert.equal(res.solutions.length, 5);
});
