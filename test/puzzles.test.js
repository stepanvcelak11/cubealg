import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUBE3 } from '../src/puzzles/cube3.js';
import { CUBE2 } from '../src/puzzles/cube2.js';
import { PYRAMINX } from '../src/puzzles/pyraminx.js';
import { SKEWB } from '../src/puzzles/skewb.js';
import { prepare, search } from '../src/search/engine.js';
import { compileGoal } from '../src/core/constraints.js';
import { taskOps } from '../src/core/task.js';

const PERM = [CUBE3, CUBE2, PYRAMINX, SKEWB];
const isSolved = (loc) => loc.every((v, i) => v === i);

test('tahy mají správný řád, nerozbijí dílky a inverze vrací zpět', () => {
  for (const P of PERM) {
    for (const base of P.bases) {
      let loc = P.solved();
      for (let i = 0; i < P.orderOf(base); i++) loc = P.applyAlg(loc, base);
      assert.ok(isSolved(loc), `${P.name} ${base}`);
      const to = P.perm({ base, amount: 1 });
      for (const s of P.slots) assert.equal(new Set(s.facelets.map((f) => P.SLOT_OF[to[f]])).size, 1, `${P.name} ${base} ${s.name}`);
    }
    const alg = P.bases.slice(0, 4).map((b, i) => (i % 2 ? `${b}'` : b)).join(' ');
    assert.ok(isSolved(P.applyAlg(P.applyAlg(P.solved(), alg), P.invertAlg(alg))), P.name);
  }
});

test('počty dílků', () => {
  const count = (P) => P.slots.reduce((m, s) => ({ ...m, [s.type]: (m[s.type] ?? 0) + 1 }), {});
  assert.deepEqual(count(CUBE2), { corner: 8 });
  assert.deepEqual(count(PYRAMINX), { tip: 4, center: 4, edge: 6 });
  assert.deepEqual(count(SKEWB), { center: 6, corner: 8 });
});

function solveAll(P, scramble, bases) {
  const constraints = Object.fromEntries(P.slots.map((s) => [s.name, 'solved']));
  const moves = bases.flatMap((base) => P.amountsOf(base).map((amount) => ({ base, amount })));
  const start = P.applyAlg(P.solved(), scramble);
  const problem = prepare({ puzzle: P, constraints, moves });
  const res = search(problem, start, { maxLength: 8, extraDepth: 0, maxResults: 5, timeLimit: 20000 });
  assert.ok(res.solutions.length, `${P.name}: ${res.reason}`);
  const goal = compileGoal(constraints, P.solved(), P);
  for (const alg of res.solutions) assert.ok(goal.test(P.applyAlg(start, alg)), `${P.name} ${alg}`);
  return res;
}

test('hledání řeší Pyraminx, Skewb a 2×2', () => {
  assert.equal(solveAll(PYRAMINX, "R U' L B u", ['R', 'U', 'L', 'B', 'u', 'r', 'l', 'b']).optimal, 5);
  assert.equal(solveAll(SKEWB, "R U' L", ['R', 'U', 'L', 'B']).optimal, 3);
  assert.equal(solveAll(CUBE2, "R U R' F", ['R', 'U', 'F']).optimal, 4);
});

test('zadání vybarvením funguje i na Pyraminxu', () => {
  const ops = taskOps(PYRAMINX);
  const colors = ops.moveColors(ops.homeColors(['UL', 'UR', 'u', 'U']), "R U'");
  const { pieces, errors } = ops.identifyPieces(colors);
  assert.deepEqual(errors, []);
  assert.equal(pieces.size, 4);
  const constraints = Object.fromEntries(PYRAMINX.slots.map((s) => [s.name, ['UL', 'UR'].includes(s.name) ? 'solved' : 'ignore']));
  const { loc } = ops.buildStart(colors, constraints);
  assert.ok(compileGoal(constraints, PYRAMINX.solved(), PYRAMINX).test(PYRAMINX.applyAlg(loc, "U R'")));
});
