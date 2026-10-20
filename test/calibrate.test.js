import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrate } from '../src/ergonomics/calibrate.js';
import { defaultErgo } from '../src/ergonomics/puzzles.js';
import { CUBE3 } from '../src/puzzles/cube3.js';
import { PYRAMINX } from '../src/puzzles/pyraminx.js';

test('kalibrace: málo dat nic nemění', () => {
  const res = calibrate(CUBE3, defaultErgo(CUBE3), [{ alg: 'R U', times: [{ t: 1000 }] }]);
  assert.equal(res.ok, false);
});

test('kalibrace: pomalé F se zdraží, rychlé R zlevní', () => {
  // „skutečné“ časy: R a U po 0,15 s, F 0,6 s, rozpoznání 0,5 s
  const sec = { R: 0.15, U: 0.15, F: 0.6 };
  const algs = ["R U R' U'", "R U2 R'", "F R U R' U' F'", "R U R' U R U2 R'", "F U F'", "R' F R F'", "U R U' R'", "F2 U F2"];
  const items = algs.map((alg) => {
    const t = 500 + CUBE3.parseAlg(alg).reduce((s, m) => s + sec[m.base] * 1000 * (m.amount === 2 ? 1.4 : 1), 0);
    return { alg, times: [{ t }, { t: t + 20 }, { t: t - 20 }] };
  });
  const res = calibrate(CUBE3, defaultErgo(CUBE3), items, { lambda: 0.5 });
  assert.ok(res.ok, res.reason);
  const w = res.config.moveWeights;
  assert.ok(w.F[0] > w.R[0], JSON.stringify({ F: w.F, R: w.R }));
  assert.ok(w.F[0] > 1.7 || w.R[0] < 1, JSON.stringify({ F: w.F, R: w.R }));
});

test('kalibrace funguje i pro jednoduché váhy (Pyraminx)', () => {
  const algs = ["R U R'", "U' R' U", "L' U L", "R L' R' L", "U R U' R'", "B U B'"];
  const items = algs.map((alg) => ({ alg, times: [1, 2, 3].map(() => ({ t: 400 + PYRAMINX.parseAlg(alg).length * (alg.includes('B') ? 400 : 200) })) }));
  const res = calibrate(PYRAMINX, defaultErgo(PYRAMINX), items, { lambda: 0.5 });
  assert.ok(res.ok, res.reason);
  assert.ok(res.config.weights.B[0] >= res.config.weights.R[0]);
});

test('kalibrace kostky: pomalé přehmaty zdraží přehmat, levák hodnotí zrcadlově', async () => {
  const { scoreAlg } = await import('../src/ergonomics/score.js');
  const algs = ["R U R' U'", "R2 U R2 U'", "R U R U R U R'", "R U2 R' U' R U' R'", "R' F R F'", "R U R' U R U2 R'", "R2 U2 R2 U2 R2", "F R U R' U' F'", "R U R' F' R U R' U' R' F R2 U' R'"];
  const items = algs.map((alg) => {
    const s = scoreAlg(alg);
    const t = 500 + CUBE3.parseAlg(alg).length * 150 + s.perMove.filter((m) => m.regrip > 0).length * 900;
    return { alg, times: [{ t }, { t: t + 10 }, { t: t - 10 }] };
  });
  const cfg = defaultErgo(CUBE3);
  const res = calibrate(CUBE3, cfg, items, { lambda: 0.5 });
  assert.ok(res.ok, res.reason);
  assert.ok(res.config.regripPenalty > cfg.regripPenalty, `${res.config.regripPenalty}`);
  // levák: R' F R F' hodnotí jako zrcadlo (L F' L' F)
  assert.equal(scoreAlg("R' F R F'", { leftHanded: true }).total, scoreAlg("L F' L' F").total);
});
