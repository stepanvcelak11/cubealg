import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg } from '../src/core/cube.js';
import { compileGoal } from '../src/core/constraints.js';
import { compileCells, piecesWithColors, remapCells, cellsFromLegacy, describeCell } from '../src/core/cells.js';
import { prepare, search } from '../src/search/engine.js';
import { MoveSet } from '../src/core/moveset.js';
import { practiceState } from '../src/timer/practice.js';
import { seededRandom } from '../src/sim/simulate.js';

const DE = ['DF', 'DR', 'DB', 'DL'];
const colorTo = (names, colors, side) => Object.fromEntries(names.map((n) => [n, { pieces: piecesWithColors(n.length === 3 ? 'corner' : 'edge', colors), ori: { side, colors } }]));

test('buňky: vlastní dílky = hotové / jen na místě', () => {
  const t = compileGoal(compileCells({ DF: { own: 'solved' }, DR: { own: 'any' } })).test;
  assert.ok(t(solved()));
  assert.ok(!t(applyAlg(solved(), 'F2')));
  assert.ok(compileGoal(compileCells({ DR: { own: 'any' } })).test(applyAlg(solved(), 'U')));
});

test('buňky: kříž z kterýchkoli bílých/žlutých hran (barva dolů) – test i hledání', () => {
  const cells = colorTo(DE, ['U', 'D'], 'D');
  const goal = compileCells(cells);
  assert.equal(goal['#classes'].length, 1);
  assert.equal(goal['#classes'][0].places.length, 4);
  const t = compileGoal(goal).test;
  assert.ok(t(solved()));
  assert.ok(t(applyAlg(solved(), 'R2 L2'))); // hrany U nahoře/dole prohozené – pořád bílá/žlutá dole
  assert.ok(!t(applyAlg(solved(), 'F')));
  const problem = prepare({ constraints: goal, moves: MoveSet.preset('faces').list });
  const rand = seededRandom(4);
  for (let i = 0; i < 3; i++) {
    const s = practiceState({}, rand);
    const r = search(problem, s, { maxLength: 10, extraDepth: 0, maxResults: 10, timeLimit: 20000 });
    assert.ok(r.solutions.length && r.solutions.every((a) => t(applyAlg(s, a))));
  }
});

test('buňky: kterýkoli správně natočený dílek (EO na všech hranách) = natočené hrany', () => {
  const all = ['UF', 'UR', 'UB', 'UL', 'FR', 'BR', 'BL', 'FL', ...DE];
  const t = compileGoal(compileCells(Object.fromEntries(all.map((n) => [n, { pieces: piecesWithColors('edge'), ori: 'correct' }])))).test;
  assert.ok(t(solved()));
  assert.ok(t(applyAlg(solved(), "R U L' D2 B2")));   // bez F a B tahů jen kvartů – EO zůstává
  assert.ok(!t(applyAlg(solved(), 'F')));
});

test('buňky: přejmenování podle orientace, převod starého zadání a popis slovy', () => {
  const map = { U: 'D', D: 'U', F: 'F', B: 'B', R: 'L', L: 'R' }; // z2
  const r = remapCells({ DF: { pieces: ['DF', 'DR'], ori: { side: 'D', colors: ['D'] } } }, map);
  assert.deepEqual(r, { UF: { pieces: ['UF', 'UL'], ori: { side: 'U', colors: ['U'] } } });
  const legacy = cellsFromLegacy({ DF: 'solved', DR: 'permutation', UF: 'orientation' }, [], () => ({}));
  assert.deepEqual(legacy.DF, { own: 'solved' });
  assert.deepEqual(legacy.DR, { own: 'any' });
  assert.equal(legacy.UF.ori, 'correct');
  assert.match(describeCell(colorTo(['DF'], ['U', 'D'], 'D').DF, 'edge'), /kterákoli hrana s bílou nebo žlutou barvou, bílou nebo žlutou nálepkou dolů/);
});
