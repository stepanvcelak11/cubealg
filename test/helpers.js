// Pomocné skupiny dílků pro testy (aplikace sama žádné presety nemá).

import { SLOTS } from '../src/core/geometry.js';
import { makeConstraints } from '../src/core/constraints.js';

export const GROUPS = {
  centers: ['U', 'R', 'F', 'D', 'L', 'B'],
  cross: ['DF', 'DR', 'DB', 'DL'],
  'pair-FR': ['DFR', 'FR'],
  'pair-FL': ['DLF', 'FL'],
  'pair-BL': ['DBL', 'BL'],
  'pair-BR': ['DRB', 'BR'],
  'u-layer': ['UF', 'UR', 'UB', 'UL', 'URF', 'UFL', 'ULB', 'UBR'],
  edges: SLOTS.filter((s) => s.type === 'edge').map((s) => s.name),
  corners: SLOTS.filter((s) => s.type === 'corner').map((s) => s.name),
};
GROUPS.f2l = [...GROUPS.cross, 'DFR', 'DLF', 'DBL', 'DRB', 'FR', 'FL', 'BL', 'BR'];

const expand = (names) => names.flatMap((n) => GROUPS[n] ?? [n]);

/** makeConstraints se skupinami: spec({ solved: ['centers', 'cross'] }). */
export function spec(s) {
  return makeConstraints(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, expand(v)])));
}

export const CASES = {
  cross: { solved: ['centers', 'cross'] },
  'f2l-fr': { solved: ['centers', 'cross', 'pair-FR'] },
  f2l: { solved: ['centers', 'f2l'] },
  oll: { solved: ['centers', 'f2l'], orientation: ['u-layer'] },
  pll: { solved: ['centers', 'edges', 'corners'] },
  full: { solved: ['centers', 'edges', 'corners'] },
  eo: { solved: ['centers'], orientation: ['edges'] },
  cp: { solved: ['centers'], permutation: ['corners'] },
};
export const preset = (id) => spec(CASES[id]);
