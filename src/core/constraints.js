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

export const PIECE_GROUPS = {
  centers: ['U', 'R', 'F', 'D', 'L', 'B'],
  cross: ['DF', 'DR', 'DB', 'DL'],
  'pair-FR': ['DFR', 'FR'],
  'pair-FL': ['DLF', 'FL'],
  'pair-BL': ['DBL', 'BL'],
  'pair-BR': ['DRB', 'BR'],
  'u-edges': ['UF', 'UR', 'UB', 'UL'],
  'u-corners': ['URF', 'UFL', 'ULB', 'UBR'],
  'd-corners': ['DFR', 'DLF', 'DBL', 'DRB'],
  'e-edges': ['FR', 'FL', 'BL', 'BR'],
  edges: SLOTS.filter((s) => s.type === 'edge').map((s) => s.name),
  corners: SLOTS.filter((s) => s.type === 'corner').map((s) => s.name),
};
PIECE_GROUPS.f2l = [...PIECE_GROUPS.cross, ...PIECE_GROUPS['d-corners'], ...PIECE_GROUPS['e-edges']];
PIECE_GROUPS['u-layer'] = [...PIECE_GROUPS['u-edges'], ...PIECE_GROUPS['u-corners']];

const expand = (names) => names.flatMap((n) => PIECE_GROUPS[n] ?? [n]);

/**
 * Sestaví mapu omezení. Pozdější klíče přepisují dřívější, takže lze psát
 * např. { orientation: ['edges'], solved: ['centers', 'cross'] }.
 * @param {Partial<Record<string, string[]>>} spec
 * @returns {Record<string, string>} název dílku → typ omezení
 */
export function makeConstraints(spec) {
  const out = Object.fromEntries(SLOTS.map((s) => [s.name, 'ignore']));
  for (const type of CONSTRAINT_TYPES) {
    for (const name of expand(spec[type] ?? [])) out[slotByName(name).name] = type;
  }
  return out;
}

export const SUBSTATE_PRESETS = {
  full: { label: 'Celá kostka', spec: { solved: ['centers', 'edges', 'corners'] } },
  cross: { label: 'Kříž', spec: { solved: ['centers', 'cross'] } },
  'f2l-fr': { label: 'F2L – slot FR', spec: { solved: ['centers', 'cross', 'pair-FR'] } },
  'f2l-fl': { label: 'F2L – slot FL', spec: { solved: ['centers', 'cross', 'pair-FL'] } },
  'f2l-br': { label: 'F2L – slot BR', spec: { solved: ['centers', 'cross', 'pair-BR'] } },
  'f2l-bl': { label: 'F2L – slot BL', spec: { solved: ['centers', 'cross', 'pair-BL'] } },
  f2l: { label: 'Celé F2L', spec: { solved: ['centers', 'f2l'] } },
  oll: { label: 'OLL (F2L + orientace U)', spec: { solved: ['centers', 'f2l'], orientation: ['u-layer'] } },
  pll: { label: 'PLL (vše složené)', spec: { solved: ['centers', 'edges', 'corners'] } },
  eo: { label: 'EO (orientace hran)', spec: { solved: ['centers'], orientation: ['edges'] } },
  cp: { label: 'CP (permutace rohů)', spec: { solved: ['centers'], permutation: ['corners'] } },
};

export function presetConstraints(id) {
  const p = SUBSTATE_PRESETS[id];
  if (!p) throw new Error(`Neznámý preset „${id}“`);
  return makeConstraints(p.spec);
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

/** Jak dílek k zobrazit: barva všech nálepek, jen referenční, nebo šedě. */
export function stickerVisibility(constraints) {
  const vis = new Array(54).fill('gray');
  for (const s of SLOTS) {
    const type = constraints[s.name] ?? 'ignore';
    s.facelets.forEach((k, i) => {
      if (type === 'solved' || type === 'permutation') vis[k] = 'color';
      else if (type === 'orientation' && (i === 0 || s.type === 'center')) vis[k] = 'color';
    });
  }
  return vis;
}
