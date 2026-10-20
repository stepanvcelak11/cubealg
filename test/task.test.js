import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg, toFacelets } from '../src/core/cube.js';
import { compileGoal, makeConstraints } from '../src/core/constraints.js';
import { blankColors, homeColors, moveColors, identifyPieces, buildStart } from '../src/core/task.js';
import { MoveSet } from '../src/core/moveset.js';
import { findAlgs } from '../src/search/engine.js';

const CENTERS = ['U', 'R', 'F', 'D', 'L', 'B'];

test('posun vybarvení odpovídá tahům na kostce', () => {
  const full = [...toFacelets(solved())];
  assert.equal(moveColors(full, "R U F' M").join(''), toFacelets(applyAlg(solved(), "R U F' M")));
});

test('rozpozná dílky a jejich natočení', () => {
  const colors = moveColors(homeColors(['FR', 'DFR', ...CENTERS]), "R U R'");
  const { pieces, errors } = identifyPieces(colors);
  assert.deepEqual(errors, []);
  assert.deepEqual([...pieces.keys()].sort(), ['B', 'D', 'DFR', 'F', 'FR', 'L', 'R', 'U'].sort());
});

test('chyby: neúplný, neexistující, zrcadlový a dvojitý dílek', () => {
  const c = blankColors();
  c[8] = 'U'; // jen jedna nálepka rohu URF
  assert.match(identifyPieces(c).errors[0], /není vybarvený celý/);

  const bad = homeColors(['UF']);
  bad[19] = 'U'; // UF s barvami UU
  assert.match(identifyPieces(bad).errors[0], /neexistuje/);

  const mirror = homeColors(['URF']);
  [mirror[9], mirror[20]] = [mirror[20], mirror[9]];
  assert.match(identifyPieces(mirror).errors[0], /zrcadlově/);

  const twice = homeColors(['UF', 'UB']);
  for (const [a, b] of [[1, 'U'], [46, 'F']]) twice[a] = b; // UB přebarvená na UF
  assert.match(identifyPieces(twice).errors.join(), /víckrát/);
});

test('buildStart: chybějící sledovaný dílek', () => {
  const constraints = makeConstraints({ solved: ['FR', 'DFR'] });
  const { loc, errors } = buildStart(homeColors(['FR']), constraints);
  assert.equal(loc, null);
  assert.match(errors[0], /DFR/);
});

test('celá cesta: vybarvení → hledání → cíl splněn', () => {
  const marked = [...CENTERS, 'DF', 'DR', 'FR', 'DFR'];
  const constraints = makeConstraints({ solved: marked });
  const colors = moveColors(homeColors(marked), "R U' R' U R U R'");
  const { loc, errors } = buildStart(colors, constraints);
  assert.deepEqual(errors, []);
  const res = findAlgs({ start: loc, constraints, moveSet: MoveSet.preset('RU'), maxLength: 8, extraDepth: 0 });
  assert.equal(res.reason, 'done');
  const goal = compileGoal(constraints);
  for (const alg of res.solutions) assert.ok(goal.test(applyAlg(loc, alg)), alg);
});

test('permutace a orientace z čárkovaných a tečkovaných dílků', () => {
  // UF má být jen na místě (natočení libovolné), UR jen správně natočená
  const constraints = makeConstraints({ solved: CENTERS, permutation: ['UF'], orientation: ['UR'] });
  const colors = moveColors(homeColors([...CENTERS, 'UF', 'UR']), 'F');
  const { loc } = buildStart(colors, constraints);
  const res = findAlgs({ start: loc, constraints, moveSet: new MoveSet({ bases: ['F', 'U', 'R'] }), maxLength: 3, extraDepth: 0 });
  assert.ok(res.solutions.includes("F'"));
});

test('úplně vybarvená nemožná kostka je odmítnuta', () => {
  const all = [...toFacelets(solved())];
  // prohodit hrany UF a UR
  [all[7], all[19], all[5], all[10]] = ['U', 'R', 'U', 'F'];
  const constraints = makeConstraints({ solved: ['UF'] });
  assert.match(buildStart(all, constraints).errors[0], /nejde/);
});

test('úpravy po dílcích: položit, natočit, přesunout, odebrat', async () => {
  const { placePiece, twistAt, pieceAt, findPiece, removePiece } = await import('../src/core/task.js');
  let c = placePiece(blankColors(), 'FR', 'UF');
  assert.equal(pieceAt(c, 'UF'), 'FR');
  // dvojí překlopení hrany = původní stav
  assert.deepEqual(twistAt(twistAt(c, 'UF'), 'UF'), c);
  assert.notDeepEqual(twistAt(c, 'UF'), c);
  // roh: tři natočení, všechna platná
  let r = placePiece(blankColors(), 'DFR', 'ULB');
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(identifyPieces(r).errors, []);
    assert.equal(pieceAt(r, 'ULB'), 'DFR');
    r = twistAt(r, 'ULB');
  }
  assert.deepEqual(r, placePiece(blankColors(), 'DFR', 'ULB'));
  // přesun: z UF do BR, UF se uvolní
  c = placePiece(c, 'FR', 'BR', 1);
  assert.equal(pieceAt(c, 'UF'), null);
  assert.equal(findPiece(c, 'FR').name, 'BR');
  // vytlačení: položím UF na místo, kde je FR
  c = placePiece(c, 'UF', 'BR');
  assert.equal(findPiece(c, 'FR'), null);
  assert.deepEqual(removePiece(c, 'UF'), blankColors());
  assert.throws(() => placePiece(c, 'UF', 'URF'), /nepatří/);
});

test('natočení dílku odpovídá skutečnému tahu', async () => {
  const { placePiece, twistAt } = await import('../src/core/task.js');
  // po F je hrana UF v pozici FR – překlopená vůči domovu? porovnáme s identifikací
  const moved = moveColors(homeColors(['UF']), 'F');
  const placed0 = placePiece(blankColors(), 'UF', 'FR');
  const placed1 = twistAt(placed0, 'FR');
  assert.ok([placed0, placed1].some((p) => p.join() === moved.join()));
});

test('setSlot: prohození dílků zachová platný stav', async () => {
  const { setSlot, homeColors, identifyPieces, pieceColorsIn, pieceAt } = await import('../src/core/task.js');
  let c = homeColors(['URF', 'UFL', 'UF', 'UB']);
  c = setSlot(c, 'UFL', 'URF', 1);
  assert.equal(pieceAt(c, 'UFL'), 'URF');
  assert.equal(pieceAt(c, 'URF'), 'UFL');
  c = setSlot(c, 'UB', 'UF', 1);
  assert.equal(pieceAt(c, 'UB'), 'UF');
  assert.equal(pieceAt(c, 'UF'), 'UB');
  assert.deepEqual(identifyPieces(c).errors, []);
  assert.deepEqual(pieceColorsIn('URF', 'URF', 0), ['U', 'R', 'F']);
  c = setSlot(c, 'UB', null);
  assert.equal(pieceAt(c, 'UB'), null);
});

test('completeCorner doplní třetí barvu rohu', async () => {
  const { completeCorner, homeColors, blankColors } = await import('../src/core/task.js');
  const { slotByName } = await import('../src/core/geometry.js');
  const full = homeColors(['URF']);
  for (let i = 0; i < 3; i++) {
    const c = [...full];
    c[slotByName('URF').facelets[i]] = 'X';
    assert.deepEqual(completeCorner(c, 'URF'), full);
  }
  assert.deepEqual(completeCorner(blankColors(), 'URF'), blankColors());
});

test('částečně vybarvené dílky: barva na místě (orientace bez ohledu na to, který dílek)', async () => {
  const { taskOps, EMPTY } = await import('../src/core/task.js');
  const { CUBE3 } = await import('../src/puzzles/cube3.js');
  const { prepare, search } = await import('../src/search/engine.js');
  const { compileGoal } = await import('../src/core/constraints.js');
  const { MoveSet } = await import('../src/core/moveset.js');
  const ops = taskOps(CUBE3);
  const edges = ['UF', 'UR', 'UB', 'UL'];
  const onlyWhite = (colors) => colors.map((c) => (c === 'U' ? c : EMPTY));
  // cíl: jen bílé nálepky hran nahoře; výchozí: totéž po „F R“ (bílé jinde)
  const B = onlyWhite(ops.homeColors(edges));
  const A = onlyWhite(ops.moveColors(ops.homeColors(edges), 'F R'));
  const t = ops.buildTask(A, B, Object.fromEntries(CUBE3.slots.map((s) => [s.name, 'ignore'])));
  assert.deepEqual(t.errors, []);
  for (const e of edges) assert.ok(t.constraints[e].allow, e);
  const problem = prepare({ puzzle: CUBE3, constraints: t.constraints, target: t.target, moves: new MoveSet({ bases: ['R', 'U', 'F'] }).moves() });
  const res = search(problem, t.loc, { maxLength: 4, extraDepth: 0 });
  assert.equal(res.optimal, 2);
  const goal = compileGoal(t.constraints, t.target, CUBE3);
  for (const alg of res.solutions) assert.ok(goal.test(CUBE3.applyAlg(t.loc, alg)), alg);
  // nesedí počet: jen tři bílé nálepky na hranách → srozumitelná chyba
  const three = [...B]; three[CUBE3.slotByName('UL').facelets[0]] = EMPTY;
  assert.match(ops.buildTask(A, three, {}).errors.join(), /barva U/);
});
