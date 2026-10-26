// Hlavolamy, které umí Lab.

import { CUBE3 } from './cube3.js';
import { CUBE2 } from './cube2.js';
import { PYRAMINX } from './pyraminx.js';
import { SKEWB } from './skewb.js';
import { SQ1 } from './sq1.js';
import { bigCubeOf } from './bigcube.js';

// 4×4 a 5×5 se sestaví až při prvním getPuzzle (seznam zná jen id a název)
const LAZY = { 444: () => bigCubeOf(4), 555: () => bigCubeOf(5) };
export const PUZZLES = [CUBE3, CUBE2, { id: '444', name: '4×4' }, { id: '555', name: '5×5' }, PYRAMINX, SKEWB, SQ1];
const BY_ID = Object.fromEntries(PUZZLES.map((p) => [p.id, p]));

export function getPuzzle(id = '333') {
  if (LAZY[id]) return LAZY[id]();
  const p = BY_ID[id];
  if (!p) throw new Error(`Neznámý hlavolam „${id}“`);
  return p;
}

export { CUBE3, CUBE2, PYRAMINX, SKEWB, SQ1 };
