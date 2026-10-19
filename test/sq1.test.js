import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solvedState, applySq1, invertSq1, parseSq1, sq1AlgToString, canSlash, turn, slash, sq1Ops, PIECE_NAMES, sq1Polygons } from '../src/puzzles/sq1.js';
import { prepareSq1, searchSq1 } from '../src/search/sq1engine.js';

const same = (a, b) => a.every((v, i) => v === b[i]);

test('Square-1: řez ze složeného stavu, (1,0)/ a (0,-1)/ jdou, (-1,0)/ ne', () => {
  const s = solvedState();
  assert.ok(canSlash(s));
  assert.ok(canSlash(turn(s, 1, 0)));
  assert.ok(canSlash(turn(s, 0, -1)));
  assert.ok(!canSlash(turn(s, -1, 0)));
  assert.ok(same(slash(slash(s)), s));
});

test('Square-1: notace a inverze', () => {
  assert.deepEqual(parseSq1('(1,0)/ (-3, 3) /'), [{ t: 'turn', a: 1, b: 0 }, { t: 'slash' }, { t: 'turn', a: -3, b: 3 }, { t: 'slash' }]);
  assert.equal(sq1AlgToString('(1,0)/(-1,-1)/'), '(1,0)/ (-1,-1)/');
  const alg = '(1,0)/ (-1,-1)/ (0,3)/ (3,3)/';
  const s = applySq1(solvedState(), alg);
  assert.ok(same(applySq1(s, invertSq1(alg)), solvedState()));
  assert.throws(() => applySq1(solvedState(), '(-1,0)/'));
});

test('Square-1: hledání najde platné řešení', () => {
  const target = solvedState();
  const constraints = Object.fromEntries(PIECE_NAMES.map((n) => [n, 'solved']));
  const start = applySq1(target, '(1,0)/ (-1,-1)/ (1,0)/');
  const problem = prepareSq1({ constraints, target, shape: true });
  const res = searchSq1(problem, start, { maxLength: 6, extraDepth: 0, maxResults: 10 });
  assert.equal(res.optimal, 3);
  for (const alg of res.solutions) assert.ok(same(applySq1(start, alg), target), alg);
});

test('Square-1: zadání vybarvením, posun tahy a sestavení stavu', () => {
  const ops = sq1Ops();
  const alg = '(1,0)/ (-1,-1)/ (0,3)/';
  let side = ops.home(['UB', 'UFR', 'DFL', 'DR']);
  side = ops.applyMoves(side, alg);
  const { pieces, errors } = ops.identify(side);
  assert.deepEqual(errors, []);
  assert.equal(pieces.size, 4);
  const real = applySq1(solvedState(), alg);
  const { loc } = ops.build(side, { UB: 'solved', UFR: 'solved', DFL: 'solved', DR: 'solved' });
  for (const name of ['UB', 'UFR', 'DFL', 'DR']) {
    const v = PIECE_NAMES.indexOf(name) * 2;
    assert.equal(Array.from(loc).indexOf(v), Array.from(real).indexOf(v), name);
  }
  // každá vybarvená pozice má polygon
  const polys = sq1Polygons(side.state);
  assert.ok(polys.length >= 40);
});
