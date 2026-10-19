// Zamíchání 2×2 z náhodného stavu: vylosuje se rovnoměrně náhodný stav
// rohů a najde se jeho optimální řešení s tahy R, U, F (roh DBL zůstává
// na místě). Zamíchání = inverze řešení (WCA: aspoň 4 tahy).

import { SLOTS } from '../core/geometry.js';
import { solved } from '../core/cube.js';
import { makeConstraints } from '../core/constraints.js';
import { invertAlg, algToString } from '../core/notation.js';
import { MoveSet } from '../core/moveset.js';
import { prepare, search } from '../search/engine.js';
import { randomInt } from './scramble.js';

const CORNERS = SLOTS.filter((s) => s.type === 'corner');
const FIXED = 'DBL';
let problem = null;

function randomCornerState() {
  const loc = solved();
  const movable = CORNERS.filter((s) => s.name !== FIXED);
  const slots = [...movable];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  let twistSum = 0;
  movable.forEach((piece, i) => {
    const twist = i === movable.length - 1 ? (3 - (twistSum % 3)) % 3 : randomInt(3);
    twistSum += twist;
    piece.facelets.forEach((k, j) => { loc[k] = slots[i].facelets[(j + twist) % 3]; });
  });
  return loc;
}

export function scramble222() {
  problem ??= prepare({
    constraints: makeConstraints({ solved: CORNERS.map((s) => s.name) }),
    moves: new MoveSet({ bases: ['R', 'U', 'F'] }).moves(),
  });
  for (;;) {
    const res = search(problem, randomCornerState(), { maxLength: 11, extraDepth: 0, maxResults: 1, timeLimit: 10000 });
    const sol = res.solutions[0];
    if (sol && sol.split(' ').length >= 4) return algToString(invertAlg(sol));
  }
}
