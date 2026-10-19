// Převod stavu kostky a omezení na nálepky pro Cube3D.

import { SLOTS, SLOT_OF, FACELETS } from '../core/geometry.js';

export const STYLE_OF = { solved: 'solid', permutation: 'dashed', orientation: 'dotted' };

/** Nálepky stavu loc; dílky podle stylu z omezení, neoznačené šedě. */
export function stickersOf(loc, constraints, selected = null) {
  const out = new Array(54);
  for (let k = 0; k < 54; k++) {
    const piece = SLOTS[SLOT_OF[k]].name;
    out[loc[k]] = { color: FACELETS[k].face, style: STYLE_OF[constraints[piece]] ?? 'none', selected: piece === selected };
  }
  return out;
}
