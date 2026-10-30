import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewAlg, gradeLabel, normalizeAlg } from '../src/ergonomics/review.js';
import { withoutRotations, kindOf } from '../src/ergonomics/algdb.js';

test('hodnocení: oblíbený T-perm je známý, nejlepší a bez slabých míst', () => {
  const r = reviewAlg("(R U R' U') R' F R2 U' R' U' R U R' F'", { tps: 6 });
  assert.ok(r.ok);
  assert.equal(r.kind, 'PLL');
  assert.equal(r.compare.name, 'T-perm');
  assert.ok(r.compare.isPopular);
  assert.equal(r.grade, 100);
  assert.equal(r.compare.better.length, 0);
  assert.ok(r.time > 1 && r.time < 4, `čas ${r.time}`);
  assert.ok(r.strong.some((s) => /triggery/.test(s)));
});

test('hodnocení: horší algoritmus má nižší známku, rychlejší alternativy a slabá místa', () => {
  const r = reviewAlg("L U L' U L U2 L'", { tps: 6 });
  assert.equal(r.compare.name, 'Sune');
  assert.ok(r.grade < 75);
  assert.ok(r.compare.better.length > 0 && r.compare.better[0].saving > 0);
  assert.ok(r.compare.rank > 1);
  const ab = reviewAlg("x R2 D2 R U R' D2 R U' R x'");
  assert.ok(ab.weak.some((w) => w.reasons.includes('otočení kostky')));
  assert.ok(ab.tips.length);
  assert.equal(gradeLabel(95), 'Výborný');
});

test('hodnocení: rotace uprostřed (F2L), neznámý případ, chyby', () => {
  assert.equal(withoutRotations("R U R' y' U R' U' R"), "R U R' U F' U' F");
  assert.equal(kindOf(withoutRotations("R U R' y' U R' U' R")), 'F2L');
  const f = reviewAlg("R U R' y' U R' U' R");
  assert.ok(f.ok && f.kind === 'F2L' && f.compare === null);
  assert.ok(f.grade >= 0 && f.grade <= 100);
  assert.equal(reviewAlg('x y z').ok, false);
  assert.equal(reviewAlg('').ok, false);
  assert.equal(normalizeAlg("(Rw U R’) U2'"), "r U R' U2");
});

test('hodnocení: naměřené časy z trenažéru', () => {
  const r = reviewAlg("R U R' U R U2 R'", { times: [1200, 1000, 1400] });
  assert.equal(r.measured.best, 1);
  assert.equal(r.measured.count, 3);
});

test('ergonomie: R2 tam a zpátky bez přehmatu, M hned po D se trestá', async () => {
  const { scoreAlg } = await import('../src/ergonomics/score.js');
  assert.equal(scoreAlg("M R2 S2 M R2 S2").breakdown.regrips, 0);
  const gen = scoreAlg("M2 D' M' U2 M U M2");
  assert.ok(gen.perMove[1].flowReason.includes('po M'));
  // vlastní algoritmus skladače (prohození hran U a D) vychází líp než ten z generátoru
  assert.ok(reviewAlg("M R2 S2 M R2 S2").value < reviewAlg("M2 D' M' U2 M U M2").value);
});

test('prstoklad: ruce se střídají, když to jde, a můj prstoklad má přednost', async () => {
  const { scoreAlg } = await import('../src/ergonomics/score.js');
  // F' po U' jde i pravým palcem – žádné „dva tahy jednou rukou“
  const s = scoreAlg("F R U R' U' F'");
  assert.equal(s.perMove[5].hand, 'R');
  assert.equal(s.perMove[5].flowKind === 'sameHand', false);
  // vlastní prstoklad: D' dělám levou rukou
  const mine = scoreAlg("M2 D' M' U2 M U M2", { fingering: { "D'": 'L' } });
  assert.equal(mine.perMove[1].hand, 'L');
  const auto = scoreAlg("M2 D' M' U2 M U M2");
  assert.equal(auto.perMove[1].hand, 'R');
  const { defaultFinger, FINGER_MOVES } = await import('../src/ergonomics/flow.js');
  assert.ok(FINGER_MOVES.includes("U'"));
  assert.match(defaultFinger("U'")[0], /levý ukazováček/);
});

test('hledání: zakázaný tah složený z povolených (R2 r2 = M2) se nepoužije', async () => {
  const { getPuzzle } = await import('../src/puzzles/index.js');
  const { hiddenMove } = await import('../src/search/improve.js');
  const P = getPuzzle('333');
  const mv = (bases, amounts = [1, -1, 2]) => bases.flatMap((base) => amounts.map((amount) => ({ base, amount })));
  const noM = mv(['R', 'U', 'F', 'L', 'D', 'B', 'r']);
  assert.equal(hiddenMove(P, noM, 'R2 r2 U'), 'M2');
  assert.equal(hiddenMove(P, noM, "U R r'"), 'M');
  assert.equal(hiddenMove(P, noM, 'R R U'), null); // jen jinak zapsané R2
  assert.equal(hiddenMove(P, noM, "R U r2 U'"), null);
  assert.equal(hiddenMove(P, mv(['R', 'U', 'r', 'M']), 'R2 r2'), null); // M povolené
  const noM2 = [...mv(['R', 'U', 'r']), { base: 'M', amount: 1 }, { base: 'M', amount: -1 }];
  assert.equal(hiddenMove(P, noM2, 'R2 r2'), 'M2');
  assert.equal(hiddenMove(P, noM2, "R r'"), null);
});
