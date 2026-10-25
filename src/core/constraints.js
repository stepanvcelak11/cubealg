// Cíl hledání: pro každý dílek zvlášť, co se v cílovém stavu (stav B) musí
// shodovat.
//
//   solved       – dílek na svém místě a správně natočený (permutace + orientace)
//   permutation  – dílek na svém místě, natočení libovolné
//   orientation  – dílek správně natočený, na libovolném místě
//                  (rohy vůči U/D, hrany klasická EO vůči F/B)
//   ignore       – na dílku nezáleží
//   { allow }    – referenční nálepka dílku musí ležet na některé z pozic
//                  („barva na místě“ z částečně vybarveného cíle, core/task.js)
//
// Skupinová pravidla (klíč „#classes“, viz core/rules.js): dílky skupiny jsou
// zaměnitelné – na každém místě musí ležet některá sledovaná nálepka některého
// dílku skupiny (např. kříž z kterýchkoli bílých/žlutých hran, bílou/žlutou dolů):
//   { pieces: [názvy dílků], stickers: [[pořadí nálepek dílku]], places: [[pozice]] }
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
 * @param {object} [puzzle] hlavolam (src/puzzles), výchozí 3×3
 */
/**
 * Zaměnitelné dílky (středy velkých kostek, `puzzle.identical`): „hotový“ střed splní
 * kterýkoli střed té barvy – omezení dílků skupiny se převedou na skupinové pravidlo
 * (na každém cílovém místě některý dílek skupiny), samy pak nezáleží.
 */
export function expandIdentical(P, constraints, target = P.solved()) {
  if (!P?.identical?.length || constraints['#identical']) return constraints;
  const out = { ...constraints, '#identical': true };
  const classes = [...(constraints['#classes'] ?? [])];
  for (const group of P.identical) {
    const want = group.filter((name) => out[name] === 'solved' || out[name] === 'permutation');
    if (!want.length) continue;
    classes.push({ pieces: group, stickers: group.map(() => [0]), places: want.map((name) => [target[P.slotByName(name).facelets[0]]]) });
    for (const name of group) out[name] = 'ignore';
  }
  if (classes.length) out['#classes'] = classes;
  return out;
}

export function compileGoal(constraints, target, puzzle) {
  const P = puzzle ?? { slotByName, SLOT_OF, ORI_AT, solved };
  target ??= P.solved();
  constraints = expandIdentical(P, constraints, target);
  const { SLOT_OF: slotOf, ORI_AT: oriAt } = P;
  const stickerEq = []; // dvojice [nálepka, pozice]
  const slotEq = [];    // dvojice [referenční nálepka, slot]
  const oriEq = [];     // dvojice [referenční nálepka, orientace]
  const allowed = [];   // [referenční nálepka, Set povolených poloh] („barva na místě“)
  // skupinová pravidla: sledované nálepky (indexy) a místa (Set pozic)
  const classes = (constraints['#classes'] ?? []).map((c) => ({
    stickers: c.pieces.flatMap((name, i) => c.stickers[i].map((o) => P.slotByName(name).facelets[o])),
    places: c.places.map((pl) => new Set(pl)),
  }));
  const classOk = (loc, c) => c.places.every((pl) => c.stickers.some((k) => pl.has(loc[k])));
  for (const [name, type] of Object.entries(constraints)) {
    if (type === 'ignore' || name === '#classes' || name === '#identical') continue;
    if (type && typeof type === 'object' && type.allow) {
      allowed.push([P.slotByName(name).facelets[0], new Set(type.allow)]);
      continue;
    }
    if (!CONSTRAINT_TYPES.includes(type)) throw new Error(`Neznámé omezení „${type}“`);
    const piece = P.slotByName(name);
    const ref = piece.facelets[0];
    const effective = piece.facelets.length === 1 && type !== 'ignore'
      ? (type === 'orientation' ? 'ignore' : 'permutation') : type;
    if (effective === 'solved') for (const k of piece.facelets) stickerEq.push(k, target[k]);
    else if (effective === 'permutation') slotEq.push(ref, slotOf[target[ref]]);
    else if (effective === 'orientation') oriEq.push(ref, oriAt[target[ref]]);
  }
  const se = Uint8Array.from(stickerEq), pe = Uint8Array.from(slotEq), oe = Uint8Array.from(oriEq);

  /** @param {Uint8Array} loc */
  function test(loc) {
    for (let i = 0; i < se.length; i += 2) if (loc[se[i]] !== se[i + 1]) return false;
    for (let i = 0; i < pe.length; i += 2) if (slotOf[loc[pe[i]]] !== pe[i + 1]) return false;
    for (let i = 0; i < oe.length; i += 2) if (oriAt[loc[oe[i]]] !== oe[i + 1]) return false;
    for (const [ref, set] of allowed) if (!set.has(loc[ref])) return false;
    for (const c of classes) if (!classOk(loc, c)) return false;
    return true;
  }

  /** Kolik omezení stav porušuje (pro diagnostiku a budoucí heuristiky). */
  function violations(loc) {
    let n = 0;
    for (let i = 0; i < se.length; i += 2) if (loc[se[i]] !== se[i + 1]) n++;
    for (let i = 0; i < pe.length; i += 2) if (slotOf[loc[pe[i]]] !== pe[i + 1]) n++;
    for (let i = 0; i < oe.length; i += 2) if (oriAt[loc[oe[i]]] !== oe[i + 1]) n++;
    for (const [ref, set] of allowed) if (!set.has(loc[ref])) n++;
    for (const c of classes) if (!classOk(loc, c)) n++;
    return n;
  }

  return { test, violations, constraints: { ...constraints } };
}
