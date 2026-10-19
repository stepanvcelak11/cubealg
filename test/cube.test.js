import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS } from '../src/core/geometry.js';
import { BASES, parseAlg, algToString, invertAlg, simplifyAlg, mirrorAlg } from '../src/core/notation.js';
import { solved, applyAlg, toFacelets, fromFacelets, equals, caseOf } from '../src/core/cube.js';
import { metrics } from '../src/core/metrics.js';
import { ROTATIONS } from '../src/core/rotations.js';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const after = (alg) => toFacelets(applyAlg(solved(), alg));
const same = (a, b) => equals(applyAlg(solved(), a), applyAlg(solved(), b));

test('sloty mají standardní názvy', () => {
  const names = SLOTS.map((s) => s.name);
  assert.equal(SLOTS.length, 26);
  for (const n of ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB',
    'UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR', 'U', 'D']) {
    assert.ok(names.includes(n), n);
  }
});

test('vnější tahy odpovídají formátu Kociemba', () => {
  assert.equal(after(''), SOLVED);
  assert.equal(after('R'), 'UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB');
  assert.equal(after('U'), 'UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB');
  assert.equal(after('F'), 'UUUUUULLLURRURRURRFFFFFFFFFRRRDDDDDDLLDLLDLLDBBBBBBBBB');
});

test('každý tah má řád 4 a půlotočka řád 2', () => {
  for (const b of BASES) {
    assert.ok(same(`${b} ${b} ${b} ${b}`, ''), b);
    assert.ok(same(`${b}2 ${b}2`, ''), `${b}2`);
    assert.ok(same(`${b} ${b}'`, ''), `${b}'`);
  }
});

test('známé řády a identity', () => {
  assert.ok(same("R U R' U' ".repeat(6), ''));
  assert.ok(!same("R U R' U' ".repeat(3), ''));
  const ru = applyAlg(solved(), 'R U'.repeat(105));
  assert.ok(equals(ru, solved()));
  assert.ok(!equals(applyAlg(solved(), 'R U '.repeat(35)), solved()));
});

test('slice, široké tahy a rotace odpovídají složení vrstev', () => {
  assert.ok(same('M', "r' R"));
  assert.ok(same('E', "u' U"));
  assert.ok(same('S', "f F'"));
  assert.ok(same('x', "R M' L'"));
  assert.ok(same('y', "U E' D'"));
  assert.ok(same('z', "F S B'"));
  assert.ok(same('l', 'L M'));
  assert.ok(same('d', "D E"));
  assert.ok(same('b', "B S'"));
  assert.ok(same('Rw', 'r'));
});

test('parsování a výpis notace', () => {
  assert.equal(algToString("RUR'U'"), "R U R' U'");
  assert.equal(algToString("(R U2' R') Rw3 x2"), "R U2 R' r' x2");
  assert.throws(() => parseAlg('R Q'));
  assert.throws(() => parseAlg('(R U)2'));
  assert.equal(algToString(invertAlg("R U R' F2")), "F2 R U' R'");
  assert.equal(algToString(simplifyAlg("R R U U' R")), "R'");
  assert.equal(algToString(mirrorAlg("R U R' M x F")), "L' U' L M x F'");
});

test('zrcadlený algoritmus dělá zrcadlovou práci', () => {
  // sexy move ×6 je identita, totéž musí platit pro jeho zrcadlo
  assert.ok(same(algToString(mirrorAlg("R U R' U' ".repeat(6))), ''));
});

test('fromFacelets je inverzní k toFacelets', () => {
  const scramble = "R U2 F' L D B2 M' u r2 S E' x y'";
  const state = applyAlg(solved(), scramble);
  assert.ok(equals(fromFacelets(toFacelets(state)), state));
  // prohozené dvě nálepky jednoho rohu = zrcadlový roh, fyzicky nemožné
  assert.throws(() => fromFacelets(SOLVED.replace('UR', 'RU')), /natočen/);
  // jediný překroucený roh URF (nálepky 8, 9, 20) / jediná překlopená hrana UR (5, 10)
  const put = (str, changes) => [...str].map((c, i) => changes[i] ?? c).join('');
  assert.throws(() => fromFacelets(put(SOLVED, { 8: 'R', 9: 'F', 20: 'U' })), /rohů/);
  assert.throws(() => fromFacelets(put(SOLVED, { 5: 'R', 10: 'U' })), /hran/);
  // prohozené dvě hrany UF (7, 19) a UR (5, 10)
  assert.throws(() => fromFacelets(put(SOLVED, { 7: 'U', 19: 'R', 5: 'U', 10: 'F' })), /permutace/);
  // se slice tahy je parita v pořádku
  for (const alg of ['M', 'E S', "M2 U M' x"]) assert.ok(fromFacelets(toFacelets(applyAlg(solved(), alg))));
});

test('caseOf vrací stav, který algoritmus vyřeší', () => {
  const alg = "R U R' U R U2 R'";
  assert.ok(equals(applyAlg(caseOf(alg), alg), solved()));
});

test('metriky HTM/QTM/STM/ETM', () => {
  assert.deepEqual(metrics("R U2 M' x r"), { htm: 5, qtm: 6, stm: 4, etm: 5 });
});

test('24 různých natočení kostky', () => {
  assert.equal(ROTATIONS.length, 24);
  assert.equal(ROTATIONS[0], '');
  assert.equal(new Set(ROTATIONS.map((r) => applyAlg(solved(), r).join())).size, 24);
});
