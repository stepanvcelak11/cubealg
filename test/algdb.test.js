import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, caseKey, parseAlgText, groupByCase } from '../src/ergonomics/algdb.js';

test('knihovna: druh případu a stejný případ i s jiným AUF', () => {
  assert.equal(kindOf("R U R' U R U2 R'"), 'OLL');
  assert.equal(kindOf("R U R' U' R' F R2 U' R' U' R U R' F'"), 'PLL');
  assert.equal(kindOf("U R U' R'"), 'F2L');
  // Sune a Sune s AUF před ním i jiný algoritmus na stejný případ
  assert.equal(caseKey("R U R' U R U2 R'"), caseKey("U R U R' U R U2 R'"));
  assert.equal(caseKey("R U R' U R U2 R'"), caseKey("R U R' U R U2 R' U"));
  assert.notEqual(caseKey("R U R' U R U2 R'"), caseKey("R U2 R' U' R U' R'"));
  // T-perm dvěma zápisy
  assert.equal(caseKey("R U R' U' R' F R2 U' R' U' R U R' F'"), caseKey("U R U R' U' R' F R2 U' R' U' R U R' F' U'"));
});

test('knihovna: vložený text a seřazení podle vah', () => {
  const items = parseAlgText(`OLL 27 (Sune): R U R' U R U2 R'
Sune 2 - y' R' U2 R U R' U R
1. R U2 R' U' R U' R'
T-perm	R U R' U' R' F R2 U' R' U' R U R' F' (oblíbený)
nějaký text bez tahů
Rw U Rw' R U R' U' Rw U' Rw'`);
  assert.equal(items.length, 5);
  assert.deepEqual(items[0], { name: 'OLL 27 (Sune)', alg: "R U R' U R U2 R'" });
  assert.equal(items[1].alg, "y' R' U2 R U R' U R");
  assert.equal(items[4].alg, "r U r' R U R' U' r U' r'");
  assert.equal(items[3].alg, "R U R' U' R' F R2 U' R' U' R U R' F'");
  const groups = groupByCase(items, {});
  const pll = groups.find((g) => g.kind === 'PLL');
  // levý Sune s y' je tentýž případ jako jiný z vložených (otočení se převede)
  assert.ok(groups.every((g) => g.kind !== 'jiné'), JSON.stringify(groups.map((g) => g.kind)));
  assert.equal(pll.algs.length, 1);
  for (const g of groups) for (let i = 1; i < g.algs.length; i++) assert.ok(g.algs[i - 1].value <= g.algs[i].value);
});
