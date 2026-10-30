import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KNOWN_SETS } from '../src/sim/knownsets.js';
import { kindOf, caseKey, withoutRotations } from '../src/ergonomics/algdb.js';
import { solved, applyAlg } from '../src/core/cube.js';
import { invertAlg, moveToString } from '../src/core/notation.js';
import { buildPlan } from '../src/sim/plan.js';
import { solveScrambles } from '../src/sim/stepsolver.js';
import { SLOTS } from '../src/core/geometry.js';

test('známé sady: každý algoritmus řeší svůj druh případu a sada pokryje všechny případy', () => {
  for (const s of Object.values(KNOWN_SETS)) {
    const keys = new Set();
    for (const [name, alg] of s.algs) {
      const core = withoutRotations(alg);
      assert.equal(kindOf(core), s.kind, name);
      keys.add(caseKey(core, s.kind));
    }
    assert.equal(keys.size, s.cases, s.short);
  }
});

test('test metody: kroky OLL a PLL ze známé sady (bez vlastních algoritmů)', async () => {
  const names = (pred) => SLOTS.filter((x) => x.type !== 'center' && pred(x.name)).map((x) => x.name);
  const parts = (list, style) => Object.fromEntries(list.map((n) => [n, style]));
  const top = names((n) => n.includes('U'));
  const guide = { frame: { down: 'D', front: 'F' }, steps: [
    { id: 'f2l', title: 'F2L', parts: parts(names((n) => !n.includes('U')), 'solved') },
    { id: 'oll', title: 'OLL', parts: parts(top, 'orientation') },
    { id: 'pll', title: 'PLL', parts: parts(top, 'solved') },
  ] };
  const config = { f2l: { time: 1 }, oll: { solveBy: 'known', knownSet: 'OLL', mode: 'set' }, pll: { solveBy: 'known', knownSet: 'PLL', mode: 'set' } };
  const { plan } = buildPlan({ guide, config });
  const inv = (a) => invertAlg(a.replace(/[()]/g, ' ')).map(moveToString).join(' ');
  const O = KNOWN_SETS.OLL.algs, Pl = KNOWN_SETS.PLL.algs;
  // i PLL s rotací (Aa: x … x', V: y): případ jako stav bez rotací
  const starts = [[26, 15], [0, 3], [44, 0], [56, 18]].map(([o, p], i) => applyAlg(solved(), `${inv(withoutRotations(Pl[p][1]))} ${['U', "U'", 'U2', ''][i]} ${inv(O[o][1])}`));
  const { solves } = await solveScrambles(plan, starts, { virtual: true });
  for (const sv of solves) {
    assert.ok(sv.ok, 'složeno');
    assert.equal(sv.steps[1].source, 'set', 'OLL ze sady');
    assert.equal(sv.steps[2].source, 'set', 'PLL ze sady');
  }
});

test('test metody: krok hotový až na natočení U = přeskočení, ne chybějící algoritmus', async () => {
  const names = (pred) => SLOTS.filter((x) => x.type !== 'center' && pred(x.name)).map((x) => x.name);
  const parts = (list, style) => Object.fromEntries(list.map((n) => [n, style]));
  const top = names((n) => n.includes('U'));
  const guide = { frame: { down: 'D', front: 'F' }, steps: [
    { id: 'f2l', title: 'F2L', parts: parts(names((n) => !n.includes('U')), 'solved') },
    { id: 'oll', title: 'OLL', parts: parts(top, 'orientation') },
    { id: 'pll', title: 'PLL', parts: parts(top, 'solved') },
  ] };
  const config = { f2l: { time: 1 }, oll: { solveBy: 'known', knownSet: 'OLL', mode: 'set' }, pll: { solveBy: 'known', knownSet: 'PLL', mode: 'set' } };
  const { plan } = buildPlan({ guide, config });
  const inv = (a) => invertAlg(a.replace(/[()]/g, ' ')).map(moveToString).join(' ');
  const O = KNOWN_SETS.OLL.algs;
  // po OLL je poslední vrstva složená, jen natočená o U / U2 / U'
  const starts = ['U', 'U2', "U'"].map((auf) => applyAlg(solved(), `${auf} ${inv(O[26][1])}`));
  const { solves } = await solveScrambles(plan, starts, { virtual: true });
  for (const sv of solves) {
    assert.ok(sv.ok, 'složeno');
    assert.equal(sv.steps[2].source, 'skip', 'PLL přeskočené');
    assert.ok(sv.steps[2].adjust && /^U/.test(sv.steps[2].display), sv.steps[2].display);
  }
});

test('test metody: barevná neutralita (bílá i žlutá dole) – první krok smí skončit na obou barvách', async () => {
  const names = (pred) => SLOTS.filter((x) => x.type !== 'center' && pred(x.name)).map((x) => x.name);
  const parts = (list, style) => Object.fromEntries(list.map((n) => [n, style]));
  const guide = { frame: { down: 'D', front: 'F' }, steps: [
    { id: 'cross', title: 'Kříž', parts: parts(['DF', 'DR', 'DB', 'DL'], 'solved') },
  ] };
  const fixed = buildPlan({ guide, config: { cross: { time: 1 } } }).plan;
  const dual = buildPlan({ guide, config: { cross: { time: 1 } }, neutral: 'dual' }).plan;
  assert.equal(fixed.variants.length, 1);
  assert.equal(dual.variants.length, 2);
  const { seededRandom } = await import('../src/sim/simulate.js');
  const { practiceState } = await import('../src/timer/practice.js');
  const rand = seededRandom(7);
  const starts = Array.from({ length: 8 }, () => practiceState({}, rand));
  const run = async (plan) => (await solveScrambles(plan, starts, { virtual: true })).solves;
  const a = await run(fixed), b = await run(dual);
  assert.ok(a.every((x) => x.ok) && b.every((x) => x.ok));
  const sum = (l) => l.reduce((n, x) => n + x.steps[0].length, 0);
  assert.ok(b.some((x) => x.variant !== 0), 'aspoň někdy žlutý kříž');
  assert.ok(sum(b) < sum(a), `${sum(b)} < ${sum(a)}`);
});
