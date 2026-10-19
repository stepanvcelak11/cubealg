// 3×3 jako obecný hlavolam (nad core/geometry, core/cube a core/notation).

import { FACELETS, SLOTS } from '../core/geometry.js';
import { movePermutation } from '../core/cube.js';
import { BASES, MOVE_DEFS, parseAlg } from '../core/notation.js';
import { MoveSet, MOVESET_PRESETS } from '../core/moveset.js';
import { permutationParity } from '../core/cube.js';
import { makePuzzle } from './perm.js';
import { CUBE_COLORS } from './colors.js';
import { cubeNetSquare, cubeNetBox, pointsAttr } from './net.js';

export const CUBE3 = makePuzzle({
  id: '333',
  name: '3×3',
  stickerFace: FACELETS.map((f) => f.face),
  slots: SLOTS.map(({ name, type, facelets }) => ({ name, type, facelets })),
  moves: Object.fromEntries(BASES.map((b) => [b, { perm: movePermutation({ base: b, amount: 1 }), order: 4 }])),
  parse: (text) => parseAlg(text),
  redundant: (prev, next) => MoveSet.redundant(prev, next),
  colors: CUBE_COLORS,
  rotations: BASES.filter((b) => MOVE_DEFS[b].kind === 'rotation'),
  presets: MOVESET_PRESETS,
  defaultBases: MOVESET_PRESETS.RUF.bases,
  ergonomics: 'cube',
  view: 'cube3d',
  view3d: { facelets: FACELETS, scale: 1 },
  net: {
    viewBox: cubeNetBox(),
    polys: FACELETS.map((f) => pointsAttr(cubeNetSquare(f.face, f.pos.map((x) => x / 1.5), 0.3, 3, 0.25))),
  },
  /** Úplně popsaná kostka musí být fyzicky možná (parita permutací). */
  validate: (loc) => (permutationParity(loc) ? 'Takový stav na skutečné kostce nejde (prohozené dva dílky)' : null),
});
