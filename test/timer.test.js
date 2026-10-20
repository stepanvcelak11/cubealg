import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg } from '../src/core/cube.js';
import { compileGoal, makeConstraints } from '../src/core/constraints.js';
import { SLOTS } from '../src/core/geometry.js';
import { parseAlg } from '../src/core/notation.js';
import { EVENTS } from '../src/timer/events.js';
import { scramble, nxnScramble, sq1Scramble } from '../src/timer/scramble.js';
import { solvedState, applySq1 } from '../src/puzzles/sq1.js';
import { scramble222 } from '../src/timer/random-state.js';
import { DNF, averageOf, currentAverage, bestAverage, summary, formatTime, formatSolve, trimCount } from '../src/timer/stats.js';

test('každá disciplína má zamíchání', () => {
  for (const e of EVENTS) {
    const s = e.id === '222' ? scramble222() : scramble(e.id);
    assert.ok(s.length > 5, e.id);
  }
});

test('3×3 z náhodného stavu: krátké, platná notace, žádná stejná vrstva dvakrát po sobě', () => {
  for (let i = 0; i < 10; i++) {
    const s = scramble('333');
    const moves = parseAlg(s);
    assert.ok(moves.length >= 2 && moves.length <= 24, s);
    for (let j = 1; j < moves.length; j++) assert.notEqual(moves[j].base, moves[j - 1].base, s);
  }
});

test('FMC začíná i končí R\' U\' F, Multi-Blind má zvolený počet kostek', () => {
  const s = scramble('333fm');
  assert.ok(s.startsWith("R' U' F "), s);
  assert.ok(s.endsWith(" R' U' F"), s);
  assert.equal(scramble('333mbf', { count: 4 }).split('\n').length, 4);
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
  assert.doesNotThrow(() => applySq1(solvedState(), s), s); // applySq1 vyhodí chybu u neplatného řezu
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

test('Multi-Blind: body, DNF a pořadí', async () => {
  const { value, formatSolve, bestSingle } = await import('../src/timer/stats.js');
  const a = { t: 3000000, p: 0, m: { solved: 5, attempted: 6 } }; // 4 body
  const b = { t: 2000000, p: 0, m: { solved: 4, attempted: 5 } }; // 3 body
  const c = { t: 1000000, p: 0, m: { solved: 2, attempted: 4 } }; // 0 bodů = DNF
  assert.ok(value(a) < value(b));
  assert.equal(value(c), DNF);
  assert.equal(formatSolve(a, 'multi'), '5/6 50:00');
  assert.equal(bestSingle([b, a, c]), value(a));
});

import { recordHistory, compareRows } from '../src/timer/stats.js';
import { solvesToCsv } from '../src/timer/csv.js';
import { value } from '../src/timer/stats.js';

const mk = (times, extra = {}) => times.map((t, i) => ({ t, p: 0, s: `S${i}`, d: 1000 + i, ...extra }));

test('rekordy: zlepšení single a průměrů v pořadí', () => {
  const list = mk([12000, 11000, 13000, 10500, 12500, 11500, 9000, 12000]);
  const h = recordHistory(list);
  const single = h.find((m) => m.key === 'single').records;
  assert.deepEqual(single.map((r) => r.value), [12000, 11000, 10500, 9000]);
  assert.equal(single[1].prev, 12000);
  const ao5 = h.find((m) => m.key === 'ao5').records;
  assert.ok(ao5.length >= 1);
  assert.ok(ao5.every((r, i) => i === 0 || r.value < ao5[i - 1].value));
  assert.equal(h.find((m) => m.key === 'ao12').records.length, 0);
});

test('rekordy: DNF se nepočítá, FMC má mo3', () => {
  const list = mk([12000, 11000, 13000]);
  list[1].p = -1;
  assert.deepEqual(recordHistory(list)[0].records.map((r) => r.value), [12000]);
  assert.equal(recordHistory(mk([30, 31, 29, 28]), { mo3: true })[1].key, 'mo3');
});

test('srovnání skupin: nižší je lepší', () => {
  const rows = compareRows(mk([10000, 11000, 12000, 13000, 14000]), mk([9000, 15000, 16000, 17000, 18000, 19000]));
  assert.equal(rows.find((r) => r.label === 'nejlepší single').better, 'b');
  assert.equal(rows.find((r) => r.label === 'průměr').better, 'a');
  assert.equal(rows.find((r) => r.label === 'složení').better, null);
  assert.equal(rows.find((r) => r.label === 'nejlepší ao100').better, null);
});

test('CSV: hlavička, escapování, trest a DNF', () => {
  const list = mk([12345, 20000, 15000]);
  list[1].p = 2000;
  list[2].p = -1;
  list[0].n = 'poznámka, "s čárkou"';
  const csv = solvesToCsv([{ method: 'CFOP', event: '333', group: 'Hlavní', solves: list }], value);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^metoda,disciplína,skupina,pořadí,datum/);
  assert.match(lines[1], /^CFOP,333,Hlavní,1,/);
  assert.match(lines[1], /,12345,,12345,/);
  assert.match(lines[1], /"poznámka, ""s čárkou"""$/);
  assert.match(lines[2], /,20000,\+2,22000,/);
  assert.match(lines[3], /,15000,DNF,DNF,/);
  assert.match(lines[1], new RegExp(new Date(1000).toISOString()));
});
