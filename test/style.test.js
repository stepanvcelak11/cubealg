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

test('pohledy: nejkratší = nejmíň tahů, nejrychlejší = odhad času provedení', () => {
  const eff = rankResults(list, 'efficient');
  assert.equal(eff[0].m.length, 6);
  assert.equal(eff[1].m.length, 6);
  const speed = rankResults(list, 'speed');
  // každý tah stojí čas: o pět tahů delší algoritmus nevyhraje jen proto, že je celý
  // R/U (ani proti nešikovné návaznosti F U F'); tři přehmaty jsou úplně nejpomalejší
  assert.equal(speed[0].alg, "R U R' U R U2 R'");
  const at = (alg) => speed.findIndex((x) => x.alg === alg);
  assert.ok(at("F R U R' U' F'") < at("F U F' R U R'"));
  assert.ok(at("F U F' R U R'") < at("R U R' U' R U R' U' R U R'"));
  assert.equal(speed.at(-1).alg, 'R2 U R2 U\' R2 U2 R2');
});

test('pohledy: vyvážené kombinuje délku a čas provedení', () => {
  const bal = rankResults(list, 'balanced');
  // krátké a příjemné vyhrají, nejhorší je krátký s přehmaty
  assert.deepEqual(bal.slice(0, 2).map((x) => x.alg).sort(), ["F R U R' U' F'", "R U R' U R U2 R'"]);
  // posuvník: λ = 0 → jen délka, λ = 1 → jen pohodlí
  assert.equal(rankResults(list, 'balanced', { lambda: 0 })[0].m.length, 6);
  assert.equal(rankResults(list, 'balanced', { lambda: 1 })[0].alg, "R U R' U R U2 R'");
  const at = (alg) => bal.findIndex((x) => x.alg === alg);
  assert.ok(at("R U R' U R U2 R'") < at("R U R U R U R'"));
  assert.deepEqual(bal.slice(-2).map((x) => x.alg).sort(), ["R U R' U' R U R' U' R U R'", 'R2 U R2 U\' R2 U2 R2']);
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

test('nejrychlejší: dvakrát delší algoritmus z R a U obalený tahy F nevyhraje nad krátkým', () => {
  // případ z praxe (dva rohy prohozené mezi vrstvami): 15 tahů s triggery vs 7 tahů
  const two = ["U' F' U' R U R' U' R U R' U' R U R' F", 'U F2 U2 R2 U R2 F2'].map((alg) => ({ alg, m: styleMetrics(scoreAlg(alg)) }));
  assert.equal(rankResults(two, 'speed')[0].alg, 'U F2 U2 R2 U R2 F2');
});
