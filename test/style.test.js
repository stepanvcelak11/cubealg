import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAlg } from '../src/ergonomics/score.js';
import { styleMetrics, styleContext, classify } from '../src/ergonomics/style.js';

test('styl: krátký náročný = efektivní, delší R/U = rychlostní, krátký pohodlný = všestranný', () => {
  const algs = {
    short: "F R U R' U' F'",                 // 6 tahů, F (náročnější)
    long: "R U R' U R U2 R' U R U' R' U' R", // 13 tahů, jen R/U
    best: "R U R' U R U2 R'",                // 7 tahů, jen R/U
  };
  const m = Object.fromEntries(Object.entries(algs).map(([k, a]) => [k, styleMetrics(scoreAlg(a))]));
  assert.equal(m.long.ru, 1);
  assert.ok(m.short.ru < 0.75);
  const ctx = styleContext(Object.values(m));
  assert.equal(ctx.minLength, 6);
  assert.equal(classify(m.short, ctx), 'efficient');
  assert.equal(classify(m.long, ctx), 'speed');
  assert.equal(classify(m.best, ctx), 'balanced');
  assert.equal(classify(m.best, null), null);
});
