import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseWeight, caseShares, algLength, moveUsage } from '../src/core/setstats.js';
import { knownAlgs } from '../src/sim/knownsets.js';
import { applyAlg, solved } from '../src/core/cube.js';
import { FACELETS } from '../src/core/geometry.js';
import { ROTATIONS } from '../src/core/rotations.js';
import { invertAlg, moveToString } from '../src/core/notation.js';

const CENTERS = FACELETS.filter((f) => f.pos.filter((x) => x === 0).length === 2).map((f) => f.index);
const faceOf = (k) => FACELETS[k].face;
const turns = ['U', 'U2', "U'"].map((m) => applyAlg(solved(), m));
const caseLoc = (alg) => {
  const inv = invertAlg(alg.replace(/[()]/g, ' ')).map(moveToString).join(' ');
  return ROTATIONS.map((r) => applyAlg(solved(), r ? `${r} ${inv}` : inv)).find((s) => CENTERS.every((k) => s[k] === k));
};
const sharesOf = (id, tracked) => {
  const list = knownAlgs(id);
  const cases = list.map((a) => caseWeight(caseLoc(a.alg), tracked, faceOf, turns, turns));
  const skip = caseWeight(solved(), tracked, faceOf, turns, turns).weight;
  const r = caseShares(cases, skip);
  return { r, by: Object.fromEntries(list.map((a, i) => [a.name, Math.round(1 / r.share[i])])) };
};

test('šance případů: OLL 1/54, 1/108, 1/216; přeskočení 1/216', () => {
  // sledované: žluté nálepky a vše mimo horní vrstvu
  const tracked = FACELETS.filter((f) => f.face === 'U' || f.pos[1] !== 1).map((f) => f.index);
  const { r, by } = sharesOf('OLL', tracked);
  assert.equal(r.distinct, 57);
  assert.equal(Math.round(1 / r.skip), 216);
  assert.equal(by['OLL 20'], 216);
  for (const n of [1, 21, 55, 56, 57]) assert.equal(by[`OLL ${n}`], 108);
  assert.equal(by['OLL 27'], 54);
});

test('šance případů: PLL Aa 1/18, E 1/36, H 1/72; přeskočení 1/72', () => {
  const { r, by } = sharesOf('PLL', FACELETS.map((f) => f.index));
  assert.equal(r.distinct, 21);
  assert.equal(Math.round(1 / r.skip), 72);
  assert.deepEqual([by['Aa-perm'], by['E-perm'], by['H-perm'], by['Na-perm'], by['T-perm']], [18, 36, 72, 72, 18]);
});

test('délky a tahy sady', () => {
  assert.deepEqual(algLength("(R U R' U') y M2 U"), { stm: 6, htm: 7 });
  const u = moveUsage(["R U R'", 'M2 U2'], [1, 3]);
  assert.equal(u.rows[0].base, 'U');
  assert.equal(u.total, 9);
  assert.ok(Math.abs(u.doubles - 6 / 9) < 1e-9);
});
