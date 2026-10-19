import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, typical, reference, isGood, schedule, mastery, pickNext, SORTS } from '../src/ui/srs.js';

const alg = (id, ts, sr) => ({ id, times: ts.map((t) => ({ t })), sr });

test('median', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.ok(Number.isNaN(median([])));
});

test('hodnocení pokusu', () => {
  const a = alg('a', [1000, 1100, 1200, 1050]);
  assert.equal(typical(a), 1075);
  assert.ok(isGood(1200, reference(a, [a])));
  assert.ok(!isGood(2000, reference(a, [a])));
  assert.ok(isGood(5000, NaN));
});

test('bez vlastní historie se porovnává s mediánem sady', () => {
  const fresh = alg('n', []);
  const pool = [fresh, alg('x', [1000]), alg('y', [2000])];
  assert.equal(reference(fresh, pool), 1500 * 1.5);
});

test('plán: špatný pokus vrací brzy, dobré prodlužují odstup', () => {
  let sr = schedule(null, true, 10);
  assert.deepEqual(sr, { streak: 1, interval: 3, due: 13 });
  sr = schedule(sr, true, 13);
  assert.equal(sr.interval, 6);
  sr = schedule(sr, true, 19);
  assert.equal(sr.interval, 12);
  sr = schedule(sr, false, 31);
  assert.deepEqual(sr, { streak: 0, interval: 2, due: 33 });
  let big = { streak: 9, interval: 70 };
  assert.equal(schedule(big, true, 0).interval, 80);
});

test('stav zvládnutí', () => {
  assert.equal(mastery(alg('a', [])), 'new');
  assert.equal(mastery(alg('a', [1], { streak: 0 })), 'weak');
  assert.equal(mastery(alg('a', [1], { streak: 2 })), 'learning');
  assert.equal(mastery(alg('a', [1], { streak: 3 })), 'good');
});

test('výběr: nový a po termínu před zvládnutým, nikdy ten samý dvakrát', () => {
  const rand = (n) => Math.floor(Math.random() * n);
  const pool = [
    alg('mastered', [1000, 1000, 1000], { streak: 4, interval: 40, due: 1000 }),
    alg('weak', [3000], { streak: 0, interval: 2, due: 5 }),
    alg('new', []),
  ];
  for (let i = 0; i < 100; i++) {
    const id = pickNext(pool, 10, rand, 'weak');
    assert.equal(id, 'new');   // jediný po termínu kromě vyloučeného
  }
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickNext(pool, 10, rand, null));
  assert.deepEqual([...seen].sort(), ['new', 'weak']);
});

test('výběr: nic po termínu → nejbližší termín; jediný algoritmus se opakuje', () => {
  const pool = [alg('a', [1], { streak: 3, interval: 9, due: 50 }), alg('b', [1], { streak: 3, interval: 9, due: 30 })];
  assert.equal(pickNext(pool, 10, () => 0, null), 'b');
  assert.equal(pickNext([pool[0]], 10, () => 0, 'a'), 'a');
  assert.equal(pickNext([], 10, () => 0, null), null);
});

test('řazení: nejslabší nejdřív, pak nové', () => {
  const list = [
    alg('good', [1000], { streak: 5 }), alg('new', []), alg('weak', [2000], { streak: 0 }), alg('weak2', [4000], { streak: 0 }),
  ];
  assert.deepEqual(list.sort(SORTS.weakest.cmp).map((a) => a.id), ['weak2', 'weak', 'new', 'good']);
  assert.deepEqual(list.sort(SORTS.least.cmp)[0].id, 'new');
});
