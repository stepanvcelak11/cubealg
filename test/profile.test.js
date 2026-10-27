import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileLevel, refTime, profileAccuracy, knownForStep, knownTotal } from '../src/sim/profile.js';
import { REFERENCES } from '../src/sim/references.js';

const ref = (id) => REFERENCES.find((r) => r.id === id);

test('profil skladače: úroveň „Já“ vyjde na průměr jeho metodou', () => {
  assert.equal(profileLevel({}), null);
  for (const [method, avg] of [['cfop', 6.1], ['cfop', 11], ['cfop', 18], ['roux', 9], ['zz', 40]]) {
    const L = profileLevel({ method, avg });
    assert.ok(Math.abs(refTime(ref(method), L) - avg) < 0.01, `${method} ${avg}`);
  }
  // pomalejší skladač = pomalejší tempo
  assert.ok(profileLevel({ avg: 20 }).tps.alg < profileLevel({ avg: 10 }).tps.alg);
  // zadané tempo algoritmů se drží, průměr sedí dál; horší look-ahead = delší pauzy
  const a = profileLevel({ method: 'cfop', avg: 15, algTps: 9, lookahead: 1 });
  assert.equal(a.tps.alg, 9);
  assert.ok(Math.abs(refTime(ref('cfop'), a) - 15) < 0.01);
  assert.ok(a.recog > profileLevel({ method: 'cfop', avg: 15, lookahead: 5 }).recog);
});

test('profil skladače: přesnost roste s vyplněním, umím algoritmy', () => {
  const few = profileAccuracy({ avg: 12 }), many = profileAccuracy({ avg: 12, method: 'cfop', single: 9, algTps: 8, lookahead: 3, inspection: 'cross', known: { oll: true }, neutral: 'fixed', events: { '222': { avg: 4 } }, years: 3, solves: 5000 });
  assert.ok(many.fill > few.fill && many.pct < few.pct);
  const p = { known: { oll: true, pll: true, zbll: 120 } };
  assert.equal(knownForStep('OLL', 57, p), 57);
  assert.equal(knownForStep('PLL', 21, p), 21);
  assert.equal(knownForStep('EPLL', 4, p), 4); // obsažené v celém PLL
  assert.equal(knownForStep('ZBLL', 493, p), 120);
  assert.equal(knownForStep('Pár 1', 0, p), 0);
  assert.equal(knownTotal(p), 57 + 21 + 120);
});
