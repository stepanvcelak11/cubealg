import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMetronome } from '../src/timer/metronome.js';

test('metronom: údery v tempu, postupné zrychlování', () => {
  const m = makeMetronome({ tps: 2, ramp: 'time', step: 0.5, every: 10, max: 4 }, 0);
  let beats = 0;
  for (let t = 0; t <= 25000; t += 10) if (m.tick(t)) beats++;
  // 10 s po 2/s, 10 s po 2,5/s, 5 s po 3/s
  assert.ok(Math.abs(beats - (20 + 25 + 15)) <= 2, String(beats));
  assert.equal(m.tps, 3);
});

test('metronom: „když stíhám“ zrychlí jen při tazích na bliknutí, jinak zpomalí', () => {
  const m = makeMetronome({ tps: 2, ramp: 'keep', step: 0.5, every: 5, max: 6 }, 0);
  let next = 0;
  for (let t = 0; t <= 5200; t += 10) { if (m.tick(t)) m.move(t + 20); }
  assert.equal(m.tps, 2.5);
  assert.ok(m.stats().onBeat > 0.95);
  const s = makeMetronome({ tps: 4, ramp: 'keep', step: 0.5, every: 5, max: 6 }, 0);
  for (let t = 0; t <= 5200; t += 10) { if (s.tick(t)) s.move(t + 110); next++; }
  assert.equal(s.tps, 3.5);
});
