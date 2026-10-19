// Hlavolamy, které umí Lab.

import { CUBE3 } from './cube3.js';
import { CUBE2 } from './cube2.js';
import { PYRAMINX } from './pyraminx.js';
import { SKEWB } from './skewb.js';
import { SQ1 } from './sq1.js';

export const PUZZLES = [CUBE3, CUBE2, PYRAMINX, SKEWB, SQ1];
export const PUZZLE_BY_ID = Object.fromEntries(PUZZLES.map((p) => [p.id, p]));

export function getPuzzle(id = '333') {
  const p = PUZZLE_BY_ID[id];
  if (!p) throw new Error(`Neznámý hlavolam „${id}“`);
  return p;
}

export { CUBE3, CUBE2, PYRAMINX, SKEWB, SQ1 };
