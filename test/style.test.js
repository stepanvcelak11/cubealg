import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAlg } from '../src/ergonomics/score.js';
import { styleMetrics, styleContext, classify } from '../src/ergonomics/style.js';

const ALGS = {
  shortF: "F R U R' U' F'",               // 6, nejkratší, tahy F
  shortF2: "F U F' R U R'",               // 6, nejkratší, horší návaznost
  ru7: "R U R' U R U2 R'",                // 7, plynulý
  sexy3: "R U R' U' R U R' U' R U R'",    // 11, plynulý, pohodlný
  long11: "R U R' U R U R' U' R U2 R'",   // 11, horší než medián
  regrip: "R2 U R2 U' R2 U2 R2",          // přehmaty
  regrip2: "R U R U R U R'",              // přehmat
};

test('styl: efektivní = nejkratší, všestranný = krátký a plynulý, rychlostní = delší plynulý bez přehmatů', () => {
  const m = Object.fromEntries(Object.entries(ALGS).map(([k, a]) => [k, styleMetrics(scoreAlg(a))]));
  const ctx = styleContext(Object.values(m));
  assert.equal(ctx.minLength, 6);
  const style = Object.fromEntries(Object.entries(m).map(([k, x]) => [k, classify(x, ctx)]));
  assert.equal(style.shortF, 'efficient');
  assert.equal(style.shortF2, 'efficient');
  assert.equal(style.ru7, 'balanced');
  assert.equal(style.sexy3, 'speed');
  assert.equal(style.long11, null);
  // přehmaty nikdy nejsou rychlostní ani všestranné
  assert.equal(style.regrip, null);
  assert.equal(style.regrip2, null);
  assert.equal(classify(m.ru7, null), null);
});

test('styl: efektivní nikdy nemá víc tahů než nejkratší nalezené', () => {
  const m = Object.values(ALGS).map((a) => styleMetrics(scoreAlg(a)));
  const ctx = styleContext(m);
  for (const x of m) if (classify(x, ctx) === 'efficient') assert.equal(x.length, ctx.minLength);
});
