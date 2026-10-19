import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg, caseOf } from '../src/core/cube.js';
import { compileGoal, makeConstraints, presetConstraints } from '../src/core/constraints.js';
import { ROTATIONS } from '../src/core/rotations.js';
import { COMMUNITY_ALGS } from '../src/data/community.js';
import { matchCommunity } from '../src/search/community.js';

// Případ algoritmu musí zachovat tyto dílky (až na natočení celé kostky).
const KEEP = {
  F2L: makeConstraints({ solved: ['centers', 'cross', 'pair-FL', 'pair-BL', 'pair-BR'] }),
  OLL: presetConstraints('f2l'),
  PLL: presetConstraints('oll'),
};
const SOLVES = { F2L: 'f2l-fr', OLL: 'oll', PLL: 'pll' };

const upToRotation = (goal, loc) => ROTATIONS.some((r) => goal.test(applyAlg(loc, r)));
// Případ algoritmu se středy na místě: alg + závěrečná rotace vrátí složenou kostku.
const cases = (alg) => ROTATIONS.map((r) => caseOf(`${alg} ${r}`));

for (const entry of COMMUNITY_ALGS) {
  test(`${entry.set} ${entry.name}: ${entry.alg}`, () => {
    const keep = compileGoal(KEEP[entry.set]);
    const c = cases(entry.alg).find((x) => keep.test(x));
    assert.ok(c, 'rozbíjí, co nemá');
    assert.ok(!compileGoal(presetConstraints(SOLVES[entry.set])).test(c), 'případ je už vyřešený');
  });
}

test('srovnání najde komunitní algoritmus i s AUF', () => {
  const goal = compileGoal(presetConstraints('pll'));
  const start = applyAlg(caseOf("R U R' U' R' F R2 U' R' U' R U R' F'"), 'U');
  const m = matchCommunity(start, goal);
  assert.ok(m.some((x) => x.name === 'T' && x.set === 'PLL'));
  for (const x of m) assert.ok(upToRotation(goal, applyAlg(start, x.alg)), x.alg);
});

test('srovnání respektuje cíl', () => {
  const goal = compileGoal(presetConstraints('f2l-fr'));
  assert.ok(matchCommunity(caseOf("R U R'"), goal).some((x) => x.base === "R U R'"));
  assert.deepEqual(matchCommunity(solved(), compileGoal(presetConstraints('cross')))
    .filter((x) => x.set === 'PLL').length > 0, true); // vše „řeší“ už složený kříž
});
