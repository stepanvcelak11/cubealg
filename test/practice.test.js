import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS } from '../src/core/geometry.js';
import { solved, applyAlg, permutationParity } from '../src/core/cube.js';
import { practiceState, practiceScramble } from '../src/timer/practice.js';

function seeded(seed) {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

const CROSS = ['DF', 'DR', 'DB', 'DL'];
const F2L = [...CROSS, 'DFR', 'FR', 'DRB', 'BR', 'DBL', 'BL', 'DLF', 'FL'];
const facelets = (names) => SLOTS.filter((s) => names.includes(s.name)).flatMap((s) => s.facelets);

test('nácvik: stav má zvolené dílky na místě a je řešitelný', () => {
  const rand = seeded(3);
  for (const fixed of [[], CROSS, F2L, [...F2L, 'UF', 'UR']]) {
    for (let i = 0; i < 30; i++) {
      const loc = practiceState(fixed, rand);
      for (const k of facelets(fixed)) assert.equal(loc[k], k);
      assert.ok(!permutationParity(loc));
    }
  }
});

test('nácvik: zamíchání vede do stavu s hotovým křížem / F2L', () => {
  const rand = seeded(7);
  for (const fixed of [CROSS, F2L]) {
    for (let i = 0; i < 5; i++) {
      const scr = practiceScramble(fixed, rand);
      assert.ok(scr.split(' ').length >= 2);
      const loc = applyAlg(solved(), scr);
      for (const k of facelets(fixed)) assert.equal(loc[k], k, `${scr}`);
      // něco jiného zamíchané je
      assert.ok(loc.some((v, k) => v !== k));
    }
  }
});

test('nácvik: dílky jen na místě / jen natočené (EO, CO, permutace)', async () => {
  const { SLOT_OF, ORI_AT } = await import('../src/core/geometry.js');
  const rand = seeded(11);
  const edges = SLOTS.filter((s) => s.type === 'edge').map((s) => s.name);
  const corners = SLOTS.filter((s) => s.type === 'corner').map((s) => s.name);
  const cases = [
    Object.fromEntries(edges.map((n) => [n, 'orientation'])),
    { ...Object.fromEntries(CROSS.map((n) => [n, 'solved'])), ...Object.fromEntries(corners.map((n) => [n, 'orientation'])) },
    Object.fromEntries([...edges, ...corners].map((n) => [n, 'permutation'])),
    { ...Object.fromEntries(F2L.map((n) => [n, 'solved'])), UF: 'permutation', UR: 'orientation', UFL: 'ignore' },
  ];
  for (const fixed of cases) {
    for (let i = 0; i < 40; i++) {
      const loc = practiceState(fixed, rand);
      assert.ok(loc, JSON.stringify(fixed));
      assert.ok(!permutationParity(loc));
      for (const s of SLOTS) {
        const st = fixed[s.name];
        if (st === 'solved' || st === 'permutation') assert.equal(SLOT_OF[loc[s.facelets[0]]], s.id);
        if (st === 'solved' || st === 'orientation') assert.equal(ORI_AT[loc[s.facelets[0]]], 0);
      }
    }
    // stav jde složit (řešič ho přijme) a zamíchání do něj vede
    const scr = practiceScramble(fixed, rand);
    assert.ok(scr.split(' ').length >= 2);
    const loc = applyAlg(solved(), scr);
    for (const s of SLOTS) {
      const st = fixed[s.name];
      if (st === 'solved' || st === 'permutation') assert.equal(SLOT_OF[loc[s.facelets[0]]], s.id, scr);
      if (st === 'solved' || st === 'orientation') assert.equal(ORI_AT[loc[s.facelets[0]]], 0, scr);
    }
  }
});
