// Zadání úlohy dvěma kostkami.
//
//   cíl (B)      – složená kostka; u každého dílku styl, co se má vyřešit
//                  (solved = plná, permutation = čárkovaná, orientation = tečkovaná)
//   výchozí (A)  – vybarvené nálepky (54 znaků U R F D L B, 'X' = nevybarveno),
//                  které říkají, kde sledované dílky právě leží
//
// Z vybarvení A se rozpoznají dílky a sestaví se úplný stav pro hledání;
// nesledované dílky se doplní libovolně (na výsledek nemají vliv).

import { FACELETS, SLOTS, SLOT_OF, ORI_AT, slotByName } from './geometry.js';
import { movePermutation, permutationParity } from './cube.js';
import { parseAlg } from './notation.js';

export const EMPTY = 'X';

const SIGNATURE = new Map(SLOTS.map((s) => [s.facelets.map((f) => FACELETS[f].face).sort().join(''), s]));

/** Prázdné vybarvení (jen 'X'). */
export function blankColors() {
  return new Array(54).fill(EMPTY);
}

/** Vybarvení, kde dané dílky leží složené na svých místech. */
export function homeColors(pieceNames, colors = blankColors()) {
  const out = [...colors];
  for (const name of pieceNames) for (const f of slotByName(name).facelets) out[f] = FACELETS[f].face;
  return out;
}

/** Posune vybarvení tahy (jako by se tahy provedly na skutečné kostce). */
export function moveColors(colors, alg) {
  let cur = [...colors];
  for (const m of parseAlg(alg)) {
    const to = movePermutation(m);
    const next = new Array(54);
    for (let p = 0; p < 54; p++) next[to[p]] = cur[p];
    cur = next;
  }
  return cur;
}

/**
 * Rozpozná dílky ve vybarvení.
 * @returns {{pieces: Map<string, {slot: number, loc: number[]}>, errors: string[]}}
 *   pieces: název dílku → slot, kde leží, a pozice jeho nálepek (v pořadí slotu domova)
 */
export function identifyPieces(colors) {
  const pieces = new Map();
  const errors = [];
  for (const slot of SLOTS) {
    const cs = slot.facelets.map((f) => colors[f]);
    const painted = cs.filter((c) => c !== EMPTY).length;
    if (painted === 0) continue;
    const where = slot.name;
    if (painted < cs.length) { errors.push(`Dílek na pozici ${where} není vybarvený celý`); continue; }
    const piece = SIGNATURE.get([...cs].sort().join(''));
    if (!piece) { errors.push(`Na pozici ${where} je dílek s barvami ${cs.join('')}, takový neexistuje`); continue; }
    const n = piece.facelets.length;
    const shift = cs.indexOf(FACELETS[piece.facelets[0]].face);
    const loc = piece.facelets.map((k) => slot.facelets[cs.indexOf(FACELETS[k].face)]);
    if (loc.some((at, i) => ORI_AT[at] !== (shift + i) % n)) {
      errors.push(`Dílek ${piece.name} na pozici ${where} je natočený nemožně (zrcadlově)`);
      continue;
    }
    if (pieces.has(piece.name)) { errors.push(`Dílek ${piece.name} je vybarvený víckrát`); continue; }
    pieces.set(piece.name, { slot: slot.id, loc });
  }
  return { pieces, errors };
}

/** Sledované dílky (s jiným stylem než „nezáleží“). */
export function trackedPieces(constraints) {
  return Object.entries(constraints).filter(([, t]) => t && t !== 'ignore').map(([name]) => name);
}

/**
 * Sestaví výchozí stav pro hledání.
 * @returns {{loc: Uint8Array | null, errors: string[], untracked: string[]}}
 */
export function buildStart(colors, constraints, where = 'výchozí kostce') {
  const { pieces, errors } = identifyPieces(colors);
  const tracked = trackedPieces(constraints);
  for (const name of tracked) {
    if (!pieces.has(name)) errors.push(`Dílek ${name} na ${where} chybí`);
  }
  const untracked = [...pieces.keys()].filter((n) => !tracked.includes(n));
  if (errors.length) return { loc: null, errors, untracked };

  const loc = new Uint8Array(54);
  const usedSlots = new Set();
  for (const [name, p] of pieces) {
    slotByName(name).facelets.forEach((k, i) => { loc[k] = p.loc[i]; });
    usedSlots.add(p.slot);
  }
  // Zbylé dílky do zbylých slotů stejného typu (na výsledek nemají vliv).
  for (const type of ['center', 'edge', 'corner']) {
    const freeSlots = SLOTS.filter((s) => s.type === type && !usedSlots.has(s.id));
    const freePieces = SLOTS.filter((s) => s.type === type && !pieces.has(s.name));
    freePieces.forEach((piece, i) => piece.facelets.forEach((k, j) => { loc[k] = freeSlots[i].facelets[j]; }));
  }
  // Je-li známá celá kostka, musí být fyzicky možná.
  if (pieces.size === SLOTS.length && permutationParity(loc)) {
    return { loc: null, errors: ['Takový stav na skutečné kostce nejde (prohozené dva dílky)'], untracked };
  }
  return { loc, errors, untracked };
}

// --- Úpravy po dílcích ------------------------------------------------------------

/** Kde ve vybarvení leží dílek (slot), nebo null. */
export function findPiece(colors, name) {
  const p = identifyPieces(colors).pieces.get(slotByName(name).name);
  return p ? SLOTS[p.slot] : null;
}

/** Odebere dílek z vybarvení. */
export function removePiece(colors, name) {
  const slot = findPiece(colors, name);
  const out = [...colors];
  if (slot) for (const f of slot.facelets) out[f] = EMPTY;
  return out;
}

/**
 * Položí dílek do slotu (stejného typu) s natočením twist; dílek, který tam
 * byl, se odebere, a dílek se odebere ze svého předchozího místa.
 */
export function placePiece(colors, name, slotName, twist = 0) {
  const piece = slotByName(name);
  const slot = slotByName(slotName);
  if (piece.type !== slot.type) throw new Error(`Dílek ${piece.name} do pozice ${slot.name} nepatří`);
  const out = removePiece(colors, name);
  const n = slot.facelets.length;
  piece.facelets.forEach((k, i) => { out[slot.facelets[(i + twist) % n]] = FACELETS[k].face; });
  return out;
}

/** Natočí dílek ve slotu o jeden krok (roh o 120°, hrana překlopí). */
export function twistAt(colors, slotName) {
  const slot = slotByName(slotName);
  const out = [...colors];
  const n = slot.facelets.length;
  slot.facelets.forEach((f, i) => { out[slot.facelets[(i + 1) % n]] = colors[f]; });
  return out;
}

/** Název dílku, který leží ve slotu (podle vybarvení), nebo null. */
export function pieceAt(colors, slotName) {
  const slot = slotByName(slotName);
  for (const [name, p] of identifyPieces(colors).pieces) if (p.slot === slot.id) return name;
  return null;
}

/** Barvy, které by měl dílek ve slotu při natočení twist (v pořadí nálepek slotu). */
export function pieceColorsIn(name, slotName, twist = 0) {
  const piece = slotByName(name);
  const slot = slotByName(slotName);
  const n = slot.facelets.length;
  const out = new Array(n);
  piece.facelets.forEach((k, i) => { out[(i + twist) % n] = FACELETS[k].face; });
  return out;
}

/**
 * Do slotu dá dílek name s natočením twist (nebo slot vyprázdní, je-li name null).
 * Leží-li dílek jinde a slot je obsazený, dílky se prohodí (původní obyvatel
 * slotu se přesune na uvolněné místo se stejným natočením).
 */
export function setSlot(colors, slotName, name, twist = 0) {
  const slot = slotByName(slotName);
  const out = [...colors];
  if (!name) {
    for (const f of slot.facelets) out[f] = EMPTY;
    return out;
  }
  const occupant = pieceAt(colors, slot.name);
  const from = findPiece(colors, name);
  let result = placePiece(out.map((c, i) => (slot.facelets.includes(i) ? EMPTY : c)), name, slot.name, twist);
  if (occupant && occupant !== slotByName(name).name && from) {
    const moved = slot.facelets.map((f) => colors[f]);
    from.facelets.forEach((f, j) => { result[f] = moved[j]; });
  }
  return result;
}

/**
 * Doplní roh, na kterém jsou vybarvené dvě nálepky: třetí barva je
 * jednoznačná (roh má pevné pořadí barev po směru hodinových ručiček).
 */
export function completeCorner(colors, slotName) {
  const slot = slotByName(slotName);
  if (slot.type !== 'corner') return colors;
  const cs = slot.facelets.map((f) => colors[f]);
  if (cs.filter((c) => c === EMPTY).length !== 1) return colors;
  for (const piece of SLOTS.filter((s) => s.type === 'corner')) {
    for (let t = 0; t < 3; t++) {
      const want = pieceColorsIn(piece.name, slot.name, t);
      if (want.every((c, i) => cs[i] === EMPTY || cs[i] === c)) {
        const out = [...colors];
        slot.facelets.forEach((f, i) => { out[f] = want[i]; });
        return out;
      }
    }
  }
  return colors;
}

/**
 * Vybarví jednu nálepku (stejná barva podruhé = smazat). Vznikne-li přebarvením
 * nemožný dílek, zbylé nálepky slotu se smažou (kromě nálepky lastPos, vybarvené
 * těsně předtím), aby šel dílek rovnou přebarvit; roh se dvěma nálepkami se doplní.
 */
export function paintSticker(colors, pos, color, lastPos = -1) {
  const slot = SLOTS[SLOT_OF[pos]];
  let out = [...colors];
  out[pos] = out[pos] === color ? EMPTY : color;
  if (out[pos] === EMPTY) return out;
  const complete = slot.facelets.every((f) => out[f] !== EMPTY);
  if (complete && slot.type !== 'center' && !pieceAt(out, slot.name)) {
    for (const f of slot.facelets) if (f !== pos && f !== lastPos) out[f] = EMPTY;
  }
  out = completeCorner(out, slot.name);
  return out;
}
