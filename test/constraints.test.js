import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg, caseOf } from '../src/core/cube.js';
import { compileGoal } from '../src/core/constraints.js';
import { spec as makeConstraints, preset as presetConstraints } from './helpers.js';
import { MoveSet } from '../src/core/moveset.js';

const reaches = (goal, start, alg) => goal.test(applyAlg(start, alg));

test('složená kostka splňuje každý preset', () => {
  for (const id of ['full', 'cross', 'f2l-fr', 'f2l', 'oll', 'eo', 'cp']) {
    assert.ok(compileGoal(presetConstraints(id)).test(solved()), id);
  }
});

test('F2L slot FR: algoritmus řeší svůj případ, poslední vrstva je jedno', () => {
  const goal = compileGoal(presetConstraints('f2l-fr'));
  const start = caseOf("R U R' U' R U R'");
  assert.ok(!goal.test(start));
  assert.ok(reaches(goal, start, "R U R' U' R U R'"));
  // tah U po vyřešení nevadí
  assert.ok(reaches(goal, start, "R U R' U' R U R' U2"));
  // ale pokažený slot ano
  assert.ok(!reaches(goal, start, "R U R' U' R U R' R"));
});

test('orientace vs. permutace u jednoho dílku', () => {
  const base = { solved: ['centers', 'f2l'] };
  const onlyOri = compileGoal(makeConstraints({ ...base, orientation: ['u-layer'] }));
  const onlyPerm = compileGoal(makeConstraints({ ...base, permutation: ['u-layer'] }));
  const both = compileGoal(makeConstraints({ ...base, solved: [...base.solved, 'u-layer'] }));

  // T-perm: permutuje, neorientuje
  const tperm = applyAlg(solved(), "R U R' U' R' F R2 U' R' U' R U R' F'");
  assert.ok(onlyOri.test(tperm));
  assert.ok(!onlyPerm.test(tperm));
  assert.ok(!both.test(tperm));

  // Sune mění orientaci rohů
  const sune = applyAlg(solved(), "R U R' U R U2 R'");
  assert.ok(!onlyOri.test(sune));

  // Twist dvou rohů na místě: permutace drží, orientace ne
  const x = "R' D' R D R' D' R D", xi = "D' R' D R D' R' D R";
  const twist = applyAlg(solved(), `${x} U ${xi} U'`);
  assert.ok(onlyPerm.test(twist));
  assert.ok(!onlyOri.test(twist));
  assert.ok(!both.test(twist));
});

test('EO: F mění orientaci hran, R ne', () => {
  const eo = compileGoal(presetConstraints('eo'));
  assert.ok(eo.test(applyAlg(solved(), "R U L' D2 R2 B2")));
  assert.ok(!eo.test(applyAlg(solved(), 'F')));
  assert.equal(eo.violations(applyAlg(solved(), 'F')), 4);
});

test('cílový stav B nemusí být složená kostka', () => {
  const target = applyAlg(solved(), 'U');
  const goal = compileGoal(makeConstraints({ solved: ['centers', 'u-layer'] }), target);
  assert.ok(!goal.test(solved()));
  assert.ok(goal.test(applyAlg(solved(), 'U')));
});


test('MoveSet respektuje povolené tahy', () => {
  const ms = new MoveSet({ bases: ['R', 'U', 'M'], amounts: [1, -1] });
  assert.deepEqual(ms.moves().map((m) => `${m.base}${m.amount}`), ['R1', 'R-1', 'M1', 'M-1', 'U1', 'U-1']);
  assert.deepEqual(ms.check("R U2 F M'"), ['U2', 'F']);
  assert.ok(MoveSet.redundant({ base: 'R', amount: 1 }, { base: 'R', amount: 2 }));
  assert.ok(MoveSet.redundant({ base: 'L', amount: 1 }, { base: 'R', amount: 1 }));
  assert.ok(!MoveSet.redundant({ base: 'R', amount: 1 }, { base: 'L', amount: 1 }));
  assert.ok(!MoveSet.redundant({ base: 'R', amount: 1 }, { base: 'U', amount: 1 }));
  assert.equal(MoveSet.preset('all').bases.includes('x'), false);
});
