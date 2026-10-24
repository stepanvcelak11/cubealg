import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPuzzle } from '../src/puzzles/index.js';
import { CORPUS } from '../src/ergonomics/corpus.js';
import { pairsOf, nextPair, keyOf } from '../src/ergonomics/compare.js';
import { learnPreferences } from '../src/ergonomics/calibrate.js';
import { compileGoal } from '../src/core/constraints.js';
import { scoreAlg } from '../src/ergonomics/score.js';
import { MOVE_TIME } from '../src/ergonomics/style.js';

const P = getPuzzle('333');
const all = (fn) => Object.fromEntries(P.slots.map((s) => [s.name, fn(s)]));
const GOAL = {
  PLL: all(() => 'solved'),
  OLL: all((s) => (s.name.includes('U') && s.facelets.length > 1 ? 'orientation' : 'solved')),
  F2L: all((s) => (s.name.includes('U') && s.facelets.length > 1 ? 'ignore' : 'solved')),
};
const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test('sbírka: každá alternativa řeší stejný případ jako oblíbený algoritmus (i s AUF)', () => {
  assert.ok(CORPUS.length >= 40);
  for (const c of CORPUS) {
    const start = P.applyAlg(P.solved(), P.invertAlg(P.parseAlg(c.ref)));
    const ok = compileGoal(GOAL[c.kind]).test;
    for (const alg of c.alts) {
      const fine = ['', 'U', "U'", 'U2'].some((pre) => ['', 'U', "U'", 'U2'].some((post) => ok(P.applyAlg(start, [pre, alg, post].filter(Boolean).join(' ')))));
      assert.ok(fine, `${c.name}: ${alg}`);
    }
  }
});

test('porovnání: dvojice pokryjí různé druhy tahů a neopakují se', () => {
  const pairs = pairsOf(P, {}, CORPUS);
  const asked = new Set(), answered = [], tested = new Set();
  const rand = seeded();
  for (let i = 0; i < 30; i++) {
    const p = nextPair(P, {}, pairs, answered, asked, rand);
    assert.ok(p);
    const key = keyOf(p.a, p.b);
    assert.ok(!asked.has(key));
    asked.add(key);
    for (const k of p.x.keys()) tested.add(k.split(':')[0]);
    // „uživatel“, kterému vadí L: vybere ten s méně L
    const ls = (a) => (a.match(/L/g) ?? []).length;
    answered.push(ls(p.a) <= ls(p.b) ? { better: p.a, worse: p.b } : { better: p.b, worse: p.a });
  }
  // 30 porovnání vyzkouší aspoň L, F, M, D a přehmat
  for (const k of ['L', 'F', 'M', 'D', 'regrip']) assert.ok(tested.has(k), `${k}: ${[...tested]}`);
  // a z odpovědí vyjde L dražší
  const res = learnPreferences(P, {}, answered);
  assert.equal(res.ok, true);
  const l = res.changes.filter((c) => c.key.startsWith('L:'));
  assert.ok(l.length && l.every((c) => c.to > c.from), JSON.stringify(res.changes));
  assert.ok(res.agree >= res.before);
});

test('výchozí váhy: oblíbený algoritmus vychází líp než alternativy aspoň u 85 % dvojic', () => {
  let good = 0, n = 0;
  const value = (a) => scoreAlg(a).total + MOVE_TIME * a.split(' ').length;
  for (const c of CORPUS) for (const a of c.alts) { n++; if (value(c.ref) < value(a)) good++; }
  assert.ok(good / n >= 0.85, `${good}/${n}`);
});
