import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUBE3 } from '../src/puzzles/cube3.js';
import { MoveSet } from '../src/core/moveset.js';
import { buildTable, improve, simplify } from '../src/search/improve.js';
import { prepare } from '../src/search/engine.js';
import { scoreAlg } from '../src/ergonomics/score.js';

const table = buildTable(CUBE3, new MoveSet({ bases: ['R', 'U', 'F'] }).moves(), { maxEntries: 20000 });
const same = (a, b) => CUBE3.applyAlg(CUBE3.solved(), a).every((v, i) => v === CUBE3.applyAlg(CUBE3.solved(), b)[i]);

const len = (a) => a.split(' ').length;

test('vylepšení: zbytečné tahy zmizí (efektivita)', () => {
  // U' U uprostřed se zruší a R U R' U' F R U R' F' … se zkrátí
  const alg = "R U R' U' F U' U R U R' F'";
  const res = improve(table, alg, (a) => [len(a), scoreAlg(a).total], { deadline: Date.now() + 3000 });
  assert.ok(len(res.alg) < len(alg), res.alg);
  assert.ok(same(res.alg, alg), 'stejný účinek na kostku');
});

test('vylepšení: výsledek má vždy stejný účinek a není horší', () => {
  const alg = "R U R' U' R U R' U' R U R' U' R U R' U' R U R' U' R U2 R' U2 F";
  const value = (a) => [len(a), scoreAlg(a).total];
  const res = improve(table, alg, value, { deadline: Date.now() + 1500 });
  assert.ok(same(res.alg, alg));
  assert.ok(len(res.alg) <= len(alg));
});

test('vylepšení: pohodlnější rovnocenný algoritmus a průběžné hlášení', () => {
  const alg = "F R F' R' F R F' R'"; // stejný účinek má i pohodlnější zápis
  const seen = [];
  const res = improve(table, alg, (a) => [scoreAlg(a).total], { deadline: Date.now() + 3000, onImproved: (a) => seen.push(a) });
  assert.ok(scoreAlg(res.alg).total <= scoreAlg(alg).total);
  for (const a of [res.alg, ...seen]) assert.ok(same(a, alg), a);
});

test('zjednodušení: tahy jedné osy, které jsou dohromady jeden tah, se sloučí', () => {
  const moves = new MoveSet({ bases: ['R', 'U', 'r', 'M'] }).moves();
  assert.equal(simplify(CUBE3, moves, "R' M' r' U"), 'R2 U');
  assert.equal(simplify(CUBE3, moves, "r R' U"), "M' U");
  assert.equal(simplify(CUBE3, moves, 'R2 r2 U'), 'M2 U');
  assert.equal(simplify(CUBE3, moves, "R U R' U'"), "R U R' U'");
  // hledání takové dvojice rovnou přeskakuje
  const all = Object.fromEntries(CUBE3.slots.map((s) => [s.name, 'solved']));
  const pr = prepare({ puzzle: CUBE3, constraints: all, moves });
  const at = (a, b) => pr.redundant[pr.names.indexOf(a) * pr.moveCount + pr.names.indexOf(b)];
  assert.equal(at("M'", "r'"), 1);
  assert.equal(at('R', "M'"), 1);
  assert.equal(at('R', 'U'), 0);
  assert.equal(at('r', 'U'), 0);
});
