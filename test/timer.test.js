import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg } from '../src/core/cube.js';
import { compileGoal, makeConstraints } from '../src/core/constraints.js';
import { SLOTS } from '../src/core/geometry.js';
import { parseAlg } from '../src/core/notation.js';
import { EVENTS } from '../src/timer/events.js';
import { scramble, nxnScramble, sq1Scramble, sq1Apply } from '../src/timer/scramble.js';
import { scramble222 } from '../src/timer/random-state.js';
import { DNF, averageOf, currentAverage, bestAverage, summary, formatTime, formatSolve, trimCount } from '../src/timer/stats.js';

test('každá disciplína má zamíchání', () => {
  for (const e of EVENTS) {
    const s = e.id === '222' ? scramble222() : scramble(e.id);
    assert.ok(s.length > 5, e.id);
  }
});

test('3×3: 25 tahů, platná notace, žádná stejná vrstva dvakrát po sobě', () => {
  for (let i = 0; i < 50; i++) {
    const s = scramble('333');
    const moves = parseAlg(s);
    assert.equal(moves.length, 25);
    for (let j = 1; j < moves.length; j++) assert.notEqual(moves[j].base, moves[j - 1].base, s);
  }
});

test('N×N: délky a šířky vrstev', () => {
  const s7 = nxnScramble(7, 100).split(' ');
  assert.equal(s7.length, 100);
  assert.ok(s7.every((m) => /^(3?[RLUDFB]w?)['2]?$/.test(m)), s7.join(' '));
  assert.ok(nxnScramble(4, 40).split(' ').every((m) => /^[RLUDFB]w?['2]?$/.test(m)));
});

test('2×2 z náhodného stavu: 4–11 tahů R U F a nechá rohy zamíchané', () => {
  const corners = compileGoal(makeConstraints({ solved: SLOTS.filter((s) => s.type === 'corner').map((s) => s.name) }));
  for (let i = 0; i < 5; i++) {
    const s = scramble222();
    const moves = parseAlg(s);
    assert.ok(moves.length >= 4 && moves.length <= 11, s);
    assert.ok(moves.every((m) => ['R', 'U', 'F'].includes(m.base)), s);
    assert.ok(!corners.test(applyAlg(solved(), s)), s);
  }
});

test('Square-1: každý řez je platný', () => {
  const s = sq1Scramble();
  assert.equal(s.split('/').length - 1, 12);
  let state = { top: [0, 0, 1, 2, 2, 3, 4, 4, 5, 6, 6, 7], bottom: [8, 9, 9, 10, 11, 11, 12, 13, 13, 14, 15, 15] };
  for (const [, x, y] of s.matchAll(/\((-?\d+),(-?\d+)\)/g)) {
    state = sq1Apply(state, Number(x), Number(y));
    assert.ok(state, s);
  }
});

test('průměry podle WCA', () => {
  assert.equal(trimCount(5), 1);
  assert.equal(trimCount(12), 1);
  assert.equal(trimCount(100), 5);
  assert.equal(averageOf([10, 20, 30, 40, 50]), 30);
  assert.equal(averageOf([10, 20, 30, 40, DNF]), 30); // jedno DNF se škrtne
  assert.equal(averageOf([10, 20, 30, DNF, DNF]), DNF);
  assert.equal(averageOf([10, 20, 30], { mean: true }), 20);
  assert.equal(averageOf([10, DNF, 30], { mean: true }), DNF);
});

test('aktuální a nejlepší průměr, +2 a DNF', () => {
  const solves = [12000, 10000, 11000, 9000, 13000, 8000].map((t) => ({ t, p: 0 }));
  assert.equal(currentAverage(solves, 5), 10000); // 10, 11, 9, 13, 8 → bez 8 a 13
  assert.equal(bestAverage(solves, 5), 10000);
  assert.ok(Number.isNaN(currentAverage(solves, 12)));
  solves.push({ t: 9000, p: 2000 }, { t: 5000, p: -1 });
  const s = summary(solves);
  assert.equal(s.count, 8);
  assert.equal(s.dnf, 1);
  assert.equal(s.single.best, 8000);
  assert.equal(s.single.current, DNF);
});

test('formát času', () => {
  assert.equal(formatTime(9876), '9.87');
  assert.equal(formatTime(62345), '1:02.34');
  assert.equal(formatTime(DNF), 'DNF');
  assert.equal(formatSolve({ t: 10000, p: 2000 }), '12.00+');
  assert.equal(formatSolve({ t: 28, p: 0 }, 'moves'), '28');
});
