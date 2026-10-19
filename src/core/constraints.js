// Cíl hledání: pro každý dílek zvlášť, co se v cílovém stavu (stav B) musí
// shodovat.
//
//   solved       – dílek na svém místě a správně natočený (permutace + orientace)
//   permutation  – dílek na svém místě, natočení libovolné
//   orientation  – dílek správně natočený, na libovolném místě
//                  (rohy vůči U/D, hrany klasická EO vůči F/B)
//   ignore       – na dílku nezáleží
//
// Dílek je určen svým názvem ve složené kostce („UF“, „DFR“, „U“ = střed).
// U středů se orientace neřeší (orientation = ignore, solved = permutation).

import { SLOTS, SLOT_OF, ORI_AT, slotByName } from './geometry.js';
import { solved } from './cube.js';

export const CONSTRAINT_TYPES = ['ignore', 'solved', 'permutation', 'orientation'];

/**
 * Sestaví mapu omezení ze seznamů dílků, např. { solved: ['FR', 'DFR'] }.
 * Pozdější typy (v pořadí CONSTRAINT_TYPES) přepisují dřívější.
 * @param {Partial<Record<string, string[]>>} spec
 * @returns {Record<string, string>} název dílku → typ omezení
 */
export function makeConstraints(spec) {
  const out = Object.fromEntries(SLOTS.map((s) => [s.name, 'ignore']));
  for (const type of CONSTRAINT_TYPES) {
    for (const name of spec[type] ?? []) out[slotByName(name).name] = type;
  }
  return out;
}

/**
 * Zkompiluje cíl do rychlé testovací funkce pro hledání.
 * @param {Record<string, string>} constraints název dílku → typ omezení
 * @param {Uint8Array} [target] cílový stav B (výchozí: složená kostka)
 */
export function compileGoal(constraints, target = solved()) {
  const stickerEq = []; // dvojice [nálepka, pozice]
  const slotEq = [];    // dvojice [referenční nálepka, slot]
  const oriEq = [];     // dvojice [referenční nálepka, orientace]
  for (const [name, type] of Object.entries(constraints)) {
    if (type === 'ignore') continue;
    if (!CONSTRAINT_TYPES.includes(type)) throw new Error(`Neznámé omezení „${type}“`);
    const piece = slotByName(name);
    const ref = piece.facelets[0];
    const effective = piece.type === 'center' && type !== 'ignore'
      ? (type === 'orientation' ? 'ignore' : 'permutation') : type;
    if (effective === 'solved') for (const k of piece.facelets) stickerEq.push(k, target[k]);
    else if (effective === 'permutation') slotEq.push(ref, SLOT_OF[target[ref]]);
    else if (effective === 'orientation') oriEq.push(ref, ORI_AT[target[ref]]);
  }
  const se = Uint8Array.from(stickerEq), pe = Uint8Array.from(slotEq), oe = Uint8Array.from(oriEq);

  /** @param {Uint8Array} loc */
  function test(loc) {
    for (let i = 0; i < se.length; i += 2) if (loc[se[i]] !== se[i + 1]) return false;
    for (let i = 0; i < pe.length; i += 2) if (SLOT_OF[loc[pe[i]]] !== pe[i + 1]) return false;
    for (let i = 0; i < oe.length; i += 2) if (ORI_AT[loc[oe[i]]] !== oe[i + 1]) return false;
    return true;
  }

  /** Kolik omezení stav porušuje (pro diagnostiku a budoucí heuristiky). */
  function violations(loc) {
    let n = 0;
    for (let i = 0; i < se.length; i += 2) if (loc[se[i]] !== se[i + 1]) n++;
    for (let i = 0; i < pe.length; i += 2) if (SLOT_OF[loc[pe[i]]] !== pe[i + 1]) n++;
    for (let i = 0; i < oe.length; i += 2) if (ORI_AT[loc[oe[i]]] !== oe[i + 1]) n++;
    return n;
  }

  return { test, violations, constraints: { ...constraints } };
}
