import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAlg, rankAlgs } from '../src/ergonomics/score.js';
import { findTriggers, buildTriggers } from '../src/ergonomics/triggers.js';

test('triggery se najdou včetně zrcadel a delší mají přednost', () => {
  const t = findTriggers("F R U R' U' F' R U R' U' L' U' L U");
  assert.deepEqual(t.map((x) => x.name), ["F sexy F'", 'Sexy move', 'Sexy move (L)']);
  assert.deepEqual(t.map((x) => x.start), [0, 6, 10]);
});

test('zrcadla se neduplikují', () => {
  const names = buildTriggers().map((t) => t.alg);
  assert.equal(new Set(names).size, names.length);
});

test('rotace jsou drahé', () => {
  const plain = scoreAlg("R U R'");
  const rotated = scoreAlg("y R U R' y'");
  assert.ok(rotated.total - plain.total >= 20);
  assert.equal(rotated.breakdown.rotations, 20);
});

test('RU je pohodlnější než B a slice', () => {
  assert.ok(scoreAlg("R U R' U'").total < scoreAlg("B U B' U'").total);
  assert.ok(scoreAlg("R U R' U'").total < scoreAlg("S U S' U'").total);
});

test('trigger snižuje skóre oproti stejným tahům bez bonusu', () => {
  const withBonus = scoreAlg("R U R' U'");
  const without = scoreAlg("R U R' U'", { triggerBonusScale: 0 });
  assert.ok(withBonus.total < without.total);
  assert.equal(withBonus.breakdown.triggerBonus, -1.2);
});

test('přehmat zápěstí při opakovaném R jedním směrem', () => {
  assert.equal(scoreAlg("R U R U R").breakdown.regrips, 2.5);
  assert.equal(scoreAlg("R U R' U R").breakdown.regrips, 0);
});

test('změna úchopu mezi F a D', () => {
  assert.equal(scoreAlg("F D").breakdown.gripChanges, 0.6);
  assert.equal(scoreAlg("F R D").breakdown.gripChanges, 0);
});

test('pořadí podle ergonomie', () => {
  const ranked = rankAlgs(["y' U' L' U L", "U R U' R'", "F' U' F"]);
  assert.equal(ranked[0].alg, "U R U' R'");
  assert.equal(ranked[2].alg, "y' U' L' U L");
});

test('rozpis odpovídá součtu', () => {
  const s = scoreAlg("R U R' U' M' x F2 D L'");
  const sum = Object.values(s.breakdown).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s.total - sum) < 0.02);
  assert.equal(s.perMove.length, 9);
});
