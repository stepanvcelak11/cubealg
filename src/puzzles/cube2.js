// 2×2 = rohy kostky 3×3 (stejné tahy i názvy dílků).

import { FACELETS, SLOTS } from '../core/geometry.js';
import { movePermutation } from '../core/cube.js';
import { parseAlg } from '../core/notation.js';
import { MoveSet } from '../core/moveset.js';
import { makePuzzle } from './perm.js';
import { CUBE_COLORS } from './colors.js';
import { cubeNetSquare, cubeNetBox, pointsAttr } from './net.js';

const CORNER_SLOTS = SLOTS.filter((s) => s.type === 'corner');
const FROM3 = CORNER_SLOTS.flatMap((s) => s.facelets).sort((a, b) => a - b); // index 2×2 → index 3×3
const TO2 = new Map(FROM3.map((f, i) => [f, i]));
const BASES = ['R', 'U', 'F', 'L', 'D', 'B', 'x', 'y', 'z'];

export const CUBE2 = makePuzzle({
  id: '222',
  name: '2×2',
  stickerFace: FROM3.map((f) => FACELETS[f].face),
  slots: CORNER_SLOTS.map((s) => ({ name: s.name, type: 'corner', facelets: s.facelets.map((f) => TO2.get(f)) })),
  moves: Object.fromEntries(BASES.map((b) => {
    const p3 = movePermutation({ base: b, amount: 1 });
    return [b, { perm: Uint8Array.from(FROM3, (f) => TO2.get(p3[f])), order: 4 }];
  })),
  parse: (text) => {
    const moves = parseAlg(text);
    const bad = moves.find((m) => !BASES.includes(m.base));
    if (bad) throw new Error(`Tah ${bad.base} na 2×2 není`);
    return moves;
  },
  redundant: (prev, next) => MoveSet.redundant(prev, next),
  colors: CUBE_COLORS,
  rotations: ['x', 'y', 'z'],
  presets: {
    RU: { label: '<R, U>', bases: ['R', 'U'] },
    RUF: { label: '<R, U, F>', bases: ['R', 'U', 'F'] },
    RUD: { label: '<R, U, D>', bases: ['R', 'U', 'D'] },
    faces: { label: 'Všechny vnější', bases: ['R', 'U', 'F', 'L', 'D', 'B'] },
  },
  defaultBases: ['R', 'U', 'F'],
  ergonomics: 'cube',
  view: 'cube3d',
  view3d: { facelets: FROM3.map((f) => FACELETS[f]), scale: 1.5 },
  net: {
    viewBox: cubeNetBox(),
    polys: FROM3.map((f) => pointsAttr(cubeNetSquare(FACELETS[f].face, FACELETS[f].pos.map((x) => x / 2), 0.46, 3, 0.25))),
  },
});
