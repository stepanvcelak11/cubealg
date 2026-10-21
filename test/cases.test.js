import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enumerateCases, layerParity, checkParityFix } from '../src/core/cases.js';
import { taskOps, EMPTY } from '../src/core/task.js';
import { getPuzzle } from '../src/puzzles/index.js';

const P3 = getPuzzle('333');
const P2 = getPuzzle('222');

/** Zadání: start = hotové dílky celé + částečné (jen některé nálepky), cíl = styly dílků. */
function taskOf(P, { startFull = [], startPartial = {}, goal = {} }) {
  const ops = taskOps(P);
  let A = ops.homeColors(startFull);
  // částečné: jen nálepky na daných stěnách (např. U = bílá nahoře)
  for (const [name, faces] of Object.entries(startPartial)) {
    for (const f of P.slotByName(name).facelets) if (faces.includes(P.stickerFace[f])) A[f] = P.stickerFace[f];
  }
  const names = Object.keys(goal);
  const B = ops.homeColors(names);
  const constraints = Object.fromEntries(P.slots.map((s) => [s.name, goal[s.name] ?? 'ignore']));
  return { colorsA: A, colorsB: B, constraints };
}

const names = (P, f) => P.slots.filter(f).map((s) => s.name);
const top = (P) => names(P, (s) => s.name.includes('U') && s.facelets.length > 1);
const rest = (P) => names(P, (s) => !(s.name.includes('U') && s.facelets.length > 1));
const real = (r) => { assert.ok(!r.tooMany, 'výčet nesmí narazit na limit'); return r.cases.filter((c) => !c.solved).length; };

test('OLL: 57 případů', () => {
  const r = enumerateCases(P3, taskOf(P3, {
    startFull: rest(P3),
    goal: { ...Object.fromEntries(rest(P3).map((n) => [n, 'solved'])), ...Object.fromEntries(top(P3).map((n) => [n, 'orientation'])) },
  }));
  assert.equal(r.error, undefined);
  assert.equal(real(r), 57);
  assert.equal(r.cases.length, 58);
});

test('PLL: 21 případů', () => {
  const r = enumerateCases(P3, taskOf(P3, {
    startFull: rest(P3),
    startPartial: Object.fromEntries(top(P3).map((n) => [n, ['U']])),
    goal: Object.fromEntries(P3.slots.map((s) => [s.name, 'solved'])),
  }));
  assert.equal(real(r), 21);
});

test('CMLL (Roux): 42 případů', () => {
  const blocks = ['DL', 'FL', 'BL', 'DLF', 'DBL', 'DR', 'FR', 'BR', 'DFR', 'DRB', 'L', 'R'].map((n) => P3.slotByName(n).name);
  const corners = names(P3, (s) => s.facelets.length === 3 && s.name.includes('U'));
  const r = enumerateCases(P3, taskOf(P3, {
    startFull: blocks,
    goal: Object.fromEntries([...blocks, ...corners].map((n) => [n, 'solved'])),
  }));
  assert.equal(real(r), 42);
});

test('2×2 OLL (Ortega): 7 případů', () => {
  const D = names(P2, (s) => s.name.includes('D'));
  const U = names(P2, (s) => s.name.includes('U'));
  const r = enumerateCases(P2, taskOf(P2, {
    startFull: D,
    goal: { ...Object.fromEntries(D.map((n) => [n, 'solved'])), ...Object.fromEntries(U.map((n) => [n, 'orientation'])) },
  }));
  assert.equal(real(r), 7);
});

test('ZBLL + PLL (hrany naorientované, zbytek horní vrstvy libovolně): 493 případů', () => {
  const r = enumerateCases(P3, taskOf(P3, {
    startFull: rest(P3),
    startPartial: Object.fromEntries(top(P3).filter((n) => n.length === 2).map((n) => [n, ['U']])),
    goal: Object.fromEntries(P3.slots.map((s) => [s.name, 'solved'])),
  }));
  assert.equal(real(r), 493);
});

test('ELL (rohy složené, hrany horní vrstvy libovolně): 29 případů', () => {
  const corners = top(P3).filter((n) => n.length === 3);
  const t = taskOf(P3, { startFull: [...rest(P3), ...corners], goal: Object.fromEntries(P3.slots.map((s) => [s.name, 'solved'])) });
  assert.equal(real(enumerateCases(P3, t, { auf: false, rotations: ['y'] })), 29);
  // AUF před a po algoritmu (U … U') je u těchto případů totéž jako otočení y
  assert.equal(real(enumerateCases(P3, t)), 29);
  // bez slučování: každý stav zvlášť (12 sudých permutací × 8 natočení − složený)
  assert.equal(real(enumerateCases(P3, t, { auf: false })), 95);
});

test('EPBL (rohy a pás složené, nahoře bílé a dole žluté hrany): 288 stavů → 119 / 49 / 29 případů', () => {
  const ud = P3.slots.filter((s) => s.facelets.length === 2 && /[UD]/.test(s.name)).map((s) => s.name);
  const t = taskOf(P3, {
    startFull: P3.slots.filter((s) => !ud.includes(s.name)).map((s) => s.name),
    startPartial: Object.fromEntries(ud.map((n) => [n, ['U', 'D']])),
    goal: Object.fromEntries(P3.slots.map((s) => [s.name, 'solved'])),
  });
  const r = enumerateCases(P3, t);
  assert.equal(r.signatures, 288);
  assert.equal(real(r), 119);
  assert.equal(real(enumerateCases(P3, t, { rotations: ['y'] })), 49);
  assert.equal(real(enumerateCases(P3, t, { rotations: ['y', 'z2'] })), 29);
  // natočení spodní vrstvy (D před a po algoritmu): stejný případ dole jen jinak natočený je jeden
  assert.equal(real(enumerateCases(P3, t, { adf: true })), 49);
  assert.equal(real(enumerateCases(P3, t, { adf: true, rotations: ['y', 'z2'] })), 29);
  // paritní případy (lichá permutace hran ve vrstvě) opraví M2 U2 M2 – zbydou kombinace U/H/Z permů
  const all = enumerateCases(P3, t, { adf: true, rotations: ['y', 'z2'] }).cases.filter((c) => !c.solved);
  const odd = all.filter((c) => layerParity(P3, c.rep).odd);
  assert.ok(odd.every((c) => c.members.every((m) => layerParity(P3, m).odd)), 'parita je v rámci případu stejná');
  assert.equal(all.length - odd.length, 14);
  assert.equal(checkParityFix(P3, odd.flatMap((c) => c.members), 'M2 U2 M2', { adf: true }), 0);
});

test('ADF nemění případy, kde je spodní vrstva složená (PLL zůstává 21)', () => {
  const r = enumerateCases(P3, taskOf(P3, { startFull: rest(P3), startPartial: Object.fromEntries(top(P3).map((n) => [n, ['U']])), goal: Object.fromEntries(P3.slots.map((s) => [s.name, 'solved'])) }), { adf: true });
  assert.equal(real(r), 21);
});

test('ověření: algoritmus řeší všechny stavy případu (i viděné z jiné strany)', async () => {
  const { verifyCase } = await import('../src/core/cases.js');
  const t = taskOf(P3, {
    startFull: rest(P3),
    startPartial: Object.fromEntries(top(P3).map((n) => [n, ['U']])),
    goal: Object.fromEntries(P3.slots.map((s) => [s.name, 'solved'])),
  });
  const r = enumerateCases(P3, t);
  // případ T-perm: najít ho podle stavu
  const tperm = "R U R' U' R' F R2 U' R' U' R U R' F'";
  const state = P3.applyAlg(P3.solved(), P3.invertAlg(P3.parseAlg(tperm)));
  const c = r.cases.find((x) => verifyCase(P3, r.goal, [state], tperm).ok && verifyCase(P3, r.goal, x.members, tperm).ok);
  assert.ok(c, 'T-perm řeší celý svůj případ');
  assert.ok(c.members.length >= 2);
  // jiný algoritmus (J-perm) ho neřeší
  assert.equal(verifyCase(P3, r.goal, c.members, "R U R' F' R U R' U' R' F R2 U' R'").ok, false);
});
