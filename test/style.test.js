import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAlg } from '../src/ergonomics/score.js';
import { styleMetrics, rankResults, ranksOf, paretoFront } from '../src/ergonomics/style.js';

const ALGS = [
  "F R U R' U' F'",               // 6 tahů, F
  "F U F' R U R'",                // 6, horší návaznost
  "R U R' U R U2 R'",             // 7, plynulý
  "R U R' U' R U R' U' R U R'",   // 11, plynulý
  "R2 U R2 U' R2 U2 R2",          // 7, přehmaty
  "R U R U R U R'",               // 7, přehmat
];
const list = ALGS.map((alg) => ({ alg, m: styleMetrics(scoreAlg(alg)) }));

test('pohledy: efektivita = nejmíň tahů, rychlost = odhad času provedení', () => {
  const eff = rankResults(list, 'efficient');
  assert.equal(eff[0].m.length, 6);
  assert.equal(eff[1].m.length, 6);
  const speed = rankResults(list, 'speed');
  // přehmaty jsou v rychlosti až na konci; plynulé tahy před nešikovnou návazností
  // (F U F'), ale o pět tahů delší algoritmus nevyhraje jen proto, že je celý R/U
  assert.equal(speed[0].alg, "R U R' U R U2 R'");
  const at = (alg) => speed.findIndex((x) => x.alg === alg);
  assert.ok(at("F R U R' U' F'") < at("R U R' U' R U R' U' R U R'"));
  assert.ok(at("R U R' U' R U R' U' R U R'") < at("F U F' R U R'"));
  assert.ok(speed.slice(-2).every((x) => x.m.regrips > 0));
});

test('pohledy: všestranné kombinuje délku a příjemnost', () => {
  const bal = rankResults(list, 'balanced');
  // krátké a příjemné vyhrají, nejhorší je krátký s přehmaty
  assert.deepEqual(bal.slice(0, 2).map((x) => x.alg).sort(), ["F R U R' U' F'", "R U R' U R U2 R'"]);
  // posuvník: λ = 0 → jen délka, λ = 1 → jen pohodlí
  assert.equal(rankResults(list, 'balanced', { lambda: 0 })[0].m.length, 6);
  assert.equal(rankResults(list, 'balanced', { lambda: 1 })[0].alg, "R U R' U R U2 R'");
  const at = (alg) => bal.findIndex((x) => x.alg === alg);
  assert.ok(at("R U R' U R U2 R'") < at("R U R U R U R'"));
  assert.ok(bal.at(-1).m.regrips > 0);
  const ranks = ranksOf(list);
  for (const x of list) for (const v of ['balanced', 'speed', 'efficient']) assert.ok(ranks.get(x)[v] >= 1 && ranks.get(x)[v] <= list.length);
});

test('Paretova hranice: nejkratší a nejpohodlnější, nic dominovaného', () => {
  const front = paretoFront(list).map((x) => x.alg);
  assert.equal(front[0], "F R U R' U' F'");
  assert.ok(front.includes("R U R' U R U2 R'"));
  assert.ok(!front.includes("R2 U R2 U' R2 U2 R2"));
  assert.ok(!front.includes("F U F' R U R'"));
});
