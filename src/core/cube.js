// Stav kostky a aplikace tahů.
//
// Stav je Uint8Array(54) „loc“: loc[k] = pozice, na které právě leží
// nálepka k (k = index nálepky ve složené kostce). Díky tomu víme u každého
// dílku, kde je a jak je natočený – barvy se z toho jen odvozují.

import { FACELETS, SLOTS, ORI_AT, rotate, faceletAt } from './geometry.js';
import { MOVE_DEFS, parseAlg, invertAlg, moveToString } from './notation.js';

const PERM_CACHE = new Map();

/**
 * Permutace pozic pro tah: to[i] = kam se přesune nálepka z pozice i.
 * @param {{base:string, amount:number}} m
 */
export function movePermutation(m) {
  const key = moveToString(m);
  let to = PERM_CACHE.get(key);
  if (to) return to;
  const def = MOVE_DEFS[m.base];
  const q = def.dir * m.amount;
  to = new Uint8Array(54);
  for (const f of FACELETS) {
    to[f.index] = def.layers.includes(f.pos[def.axis])
      ? faceletAt(rotate(f.pos, def.axis, q), rotate(f.normal, def.axis, q))
      : f.index;
  }
  PERM_CACHE.set(key, to);
  return to;
}

export function solved() {
  return Uint8Array.from({ length: 54 }, (_, i) => i);
}

/** Aplikuje jeden tah do `out` (může být totéž pole jako `loc`). */
export function applyMoveInto(out, loc, m) {
  const to = movePermutation(m);
  for (let k = 0; k < 54; k++) out[k] = to[loc[k]];
  return out;
}

export function applyAlg(loc, alg) {
  const out = Uint8Array.from(loc);
  for (const m of parseAlg(alg)) applyMoveInto(out, out, m);
  return out;
}

/** Stav, který daný algoritmus vyřeší (aplikuje inverzi na složenou kostku). */
export function caseOf(alg) {
  return applyAlg(solved(), invertAlg(alg));
}

export function equals(a, b) {
  for (let k = 0; k < 54; k++) if (a[k] !== b[k]) return false;
  return true;
}

/** Barevný řetězec ve formátu Kociemba (54 znaků z URFDLB). */
export function toFacelets(loc) {
  const out = new Array(54);
  for (let k = 0; k < 54; k++) out[loc[k]] = FACELETS[k].face;
  return out.join('');
}

/**
 * Rozpozná dílky z barevného řetězce (např. z kamery) a vrátí stav.
 * Barva = písmeno stěny, jejíž střed tu barvu ve složené kostce má.
 * Vyžaduje úplný popis; kontroluje, že každý dílek je tam právě jednou
 * a že součet natočení rohů (mod 3) a hran (mod 2) je fyzicky možný.
 * Paritu permutace zatím nekontroluje.
 */
export function fromFacelets(str) {
  const s = String(str).replace(/\s+/g, '').toUpperCase();
  if (!/^[URFDLB]{54}$/.test(s)) throw new Error('Očekávám 54 znaků z URFDLB');
  const bySignature = new Map();
  for (const slot of SLOTS) {
    const sig = slot.facelets.map((f) => FACELETS[f].face).sort().join('');
    bySignature.set(sig, slot);
  }
  const loc = new Uint8Array(54).fill(255);
  const twist = { edge: 0, corner: 0 };
  for (const slot of SLOTS) {
    const colors = slot.facelets.map((f) => s[f]);
    const piece = bySignature.get([...colors].sort().join(''));
    if (!piece) throw new Error(`Dílek s barvami ${colors.join('')} neexistuje`);
    const n = piece.facelets.length;
    const shift = colors.indexOf(FACELETS[piece.facelets[0]].face);
    piece.facelets.forEach((k, i) => {
      const at = slot.facelets[colors.indexOf(FACELETS[k].face)];
      if (ORI_AT[at] !== (shift + i) % n) throw new Error(`Dílek ${piece.name} je natočený nemožným způsobem`);
      if (loc[k] !== 255) throw new Error(`Dílek ${piece.name} je na kostce víckrát`);
      loc[k] = at;
    });
    if (n > 1) twist[piece.type] += shift;
  }
  if (twist.corner % 3) throw new Error('Nemožné natočení rohů (jeden roh je překroucený)');
  if (twist.edge % 2) throw new Error('Nemožné natočení hran (jedna hrana je překlopená)');
  return loc;
}
