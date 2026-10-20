// Držení hlavolamu v Labu: jednotné rozhraní nad kostkami 3×3/2×2 (natočení celé
// kostky, core/hold.js) a ostatními permutačními hlavolamy (symetrie, puzzles/holds.js).

import { HOLDS, holdOf } from '../core/hold.js';
import { holdsOf } from '../puzzles/holds.js';

const isCube = (model) => model.id === '333' || model.id === '222';

/** Nabídka držení: [{id, label}], první je výchozí (id ''). Prázdná, když hlavolam držení nemá. */
export function holdList(model) {
  if (model.kind !== 'perm') return [];
  if (isCube(model)) return HOLDS.map((rot) => ({ id: rot, label: holdOf(rot).describe() }));
  return holdsOf(model.P).map((h) => ({ id: h.id, label: h.label }));
}

/** Převody tahů pro držení `id` (toModel, toHeldString, describe). */
export function holdFor(model, id) {
  if (isCube(model)) return holdOf(id);
  const list = holdsOf(model.P);
  return list.find((h) => h.id === id) ?? list[0];
}
