// Zadání úlohy dvěma kostkami.
//
//   cíl (B)      – složená kostka; u každého dílku styl, co se má vyřešit
//                  (solved = plná, permutation = čárkovaná, orientation = tečkovaná)
//   výchozí (A)  – vybarvené nálepky (54 znaků U R F D L B, 'X' = nevybarveno),
//                  které říkají, kde sledované dílky právě leží
//
// Z vybarvení A se rozpoznají dílky a sestaví se úplný stav pro hledání;
// nesledované dílky se doplní libovolně (na výsledek nemají vliv).

import { FACELETS, SLOTS, ORI_AT, slotByName } from './geometry.js';
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
export function buildStart(colors, constraints) {
  const { pieces, errors } = identifyPieces(colors);
  const tracked = trackedPieces(constraints);
  for (const name of tracked) {
    if (!pieces.has(name)) errors.push(`Dílek ${name} je označený v cíli, ale na výchozí kostce chybí`);
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
