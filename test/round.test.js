import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatOf, roundResult, bpaWpa, neededFor, roundOver, applyLimit } from '../src/timer/round.js';

const s = (...ts) => ts.map((t) => (t === 'DNF' ? { t: 0, p: -1 } : { t, p: 0 }));

test('formát kola podle disciplíny (WCA)', () => {
  assert.equal(formatOf('333').kind, 'ao5');
  assert.equal(formatOf('666').kind, 'mo3');
  assert.equal(formatOf('333bf').kind, 'bo3');
  assert.equal(formatOf('333fm'), null);
});

test('průměr kola: Ao5 bez nejlepšího a nejhoršího, DNF', () => {
  const ao5 = formatOf('333');
  assert.equal(roundResult(s(10000, 12000, 11000, 9000, 13000), ao5).average, 11000);
  assert.equal(roundResult(s(10000, 'DNF', 11000, 9000, 12000), ao5).average, 11000);
  assert.equal(roundResult(s(10000, 'DNF', 11000, 'DNF', 12000), ao5).average, Infinity);
  assert.equal(roundResult(s(10000, 20000, 30000), formatOf('666')).average, 20000);
  assert.ok(Number.isNaN(roundResult(s(10000, 20000), ao5).average));
});

test('BPA/WPA a čas potřebný na cíl', () => {
  const four = s(10000, 12000, 11000, 14000);
  assert.deepEqual(bpaWpa(four), { bpa: 11000, wpa: 12333.333333333334 });
  assert.equal(neededFor(11500, four), 11500);       // 3·11.5 − 11 − 12 = 11.5
  assert.equal(neededFor(13000, four), 0);           // jistý
  assert.equal(neededFor(10500, four), null);        // nejde
  assert.equal(neededFor(10000, s(10000, 'DNF', 11000, 'DNF')), null);
});

test('cutoff a časový limit', () => {
  const ao5 = formatOf('333');
  const cutoff = { attempts: 2, time: 20000 };
  assert.equal(roundOver(s(25000, 22000), ao5, cutoff), true);
  assert.equal(roundOver(s(25000, 19000), ao5, cutoff), false);
  assert.equal(roundOver(s(1, 1, 1, 1, 1), ao5, null), true);
  assert.equal(applyLimit(61000, 0, 60000), -1);
  assert.equal(applyLimit(59000, 2000, 60000), -1);
  assert.equal(applyLimit(50000, 2000, 60000), 2000);
});
