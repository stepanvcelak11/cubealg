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
