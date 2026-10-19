import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg, toFacelets, fromFacelets } from '../src/core/cube.js';
import { init, solve, randomCube, randomStateScramble } from '../src/timer/twophase.js';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const FACE_MOVE = /^[URFDLB][2']?$/;

// deterministický generátor (mulberry32)
function seeded(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return (n) => Math.floor(next() * n);
}

function randomAlg(rand, n) {
  const moves = [];
  for (let i = 0; i < n; i++) moves.push('URFDLB'[rand(6)] + ['', '2', "'"][rand(3)]);
  return moves.join(' ');
}

function assertFaceTurns(sol, maxLength) {
  const moves = sol === '' ? [] : sol.split(' ');
  for (const m of moves) assert.match(m, FACE_MOVE);
  assert.ok(moves.length <= maxLength, `${moves.length} tahů`);
}

test('init je idempotentní', () => {
  init();
  init();
});

test('vyřeší kostky zamíchané náhodným algoritmem', () => {
  const rand = seeded(1);
  for (let i = 0; i < 25; i++) {
    const scramble = randomAlg(rand, 25);
    const state = applyAlg(solved(), scramble);
    const sol = solve(toFacelets(state));
    assertFaceTurns(sol, 22);
    assert.equal(toFacelets(applyAlg(state, sol)), SOLVED, scramble);
  }
});

test('krátká zamíchání a složená kostka', () => {
  assert.equal(solve(SOLVED), '');
  for (const scramble of ['R', "U'", 'F2', "R U R' U'", 'L D B']) {
    const state = applyAlg(solved(), scramble);
    const sol = solve(toFacelets(state));
    assertFaceTurns(sol, 22);
    assert.equal(toFacelets(applyAlg(state, sol)), SOLVED, scramble);
  }
});

test('randomCube dává platné a řešitelné stavy', () => {
  const rand = seeded(2);
  for (let i = 0; i < 20; i++) {
    const f = i < 10 ? randomCube(rand) : randomCube();
    assert.match(f, /^[URFDLB]{54}$/);
    const state = fromFacelets(f); // nezávislá kontrola fyzické možnosti
    assert.equal(toFacelets(state), f);
    const sol = solve(f);
    assertFaceTurns(sol, 22);
    assert.equal(toFacelets(applyAlg(state, sol)), SOLVED);
  }
});

test('randomStateScramble vede přesně na vylosovaný stav', () => {
  for (const seed of [3, 4, 5, 6, 7]) {
    const cube = randomCube(seeded(seed));
    const scramble = randomStateScramble(seeded(seed));
    assertFaceTurns(scramble, 22);
    assert.ok(scramble.split(' ').length >= 2);
    assert.equal(toFacelets(applyAlg(solved(), scramble)), cube);
  }
  assert.ok(randomStateScramble().split(' ').length >= 2);
});

test('nemožné kostky vyhodí chybu', () => {
  const swap = (s, i, j) => {
    const a = [...s];
    [a[i], a[j]] = [a[j], a[i]];
    return a.join('');
  };
  const base = toFacelets(applyAlg(solved(), "R U F' D2 L B'"));
  assert.throws(() => solve('UUU'), /54/);
  assert.throws(() => solve(SOLVED.replace('UUUUU', 'UUUUR')), Error);
  // překroucený roh URF (U9 R1 F3)
  const twisted = [...SOLVED];
  [twisted[8], twisted[9], twisted[20]] = [SOLVED[20], SOLVED[8], SOLVED[9]];
  assert.throws(() => solve(twisted.join('')), /rohů/);
  // překlopená hrana UF (U8 F2)
  assert.throws(() => solve(swap(SOLVED, 7, 19)), /hran/);
  assert.throws(() => solve(swap(base, 7, 19)), /hran/);
  // prohozené dvě hrany UR a UF (i s nálepkami)
  assert.throws(() => solve(swap(swap(SOLVED, 5, 7), 10, 19)), /permutace/);
  // posunutý střed
  assert.throws(() => solve(swap(SOLVED, 4, 13)), Error);
});
