// Cíl kroku „políčko po políčku“: pro každé místo kostky (hrana, roh) co tam po kroku
// musí být. Jeden obecný popis pro jakoukoli metodu:
//
//   cells: { [místo]: buňka }        místa a dílky = skutečné názvy kostky (DF, UFR…),
//                                     barvy = písmena stěn (U = barva středu U…)
//   buňka:
//     { own: 'solved' }               jeho vlastní dílek, správně natočený (hotový)
//     { own: 'any' }                  jeho vlastní dílek, natočený jakkoli
//     { pieces: [dílky], ori }        některý z vybraných dílků; ori:
//        'any'                        natočený jakkoli
//        'correct'                    správně natočený (rohy barvou U/D nahoru či dolů,
//                                     hrany podle EO – jako by byl na svém místě)
//        { side: 'D', colors: [...] } na straně místa `side` musí být některá z barev
//
// Kompilace dá omezení pro hledání (core/constraints.js): vlastní dílky jako omezení
// dílku, „některý z dílků“ jako skupinová pravidla #classes (místa se stejnou skupinou
// a stejnými sledovanými nálepkami se spojí – např. kříž ze 4 kterýchkoli hran).

import { SLOTS, ORI_AT, FACELETS, slotByName } from './geometry.js';
import { mergeConstraints } from './rules.js';

const colorsOf = (slot) => slot.facelets.map((f) => FACELETS[f].face);
export const PIECE_SLOTS = SLOTS.filter((s) => s.type !== 'center');

/** Dílky typu `type` s některou z barev (prázdné barvy = všechny dílky typu). */
export function piecesWithColors(type, colors = [], without = []) {
  return PIECE_SLOTS.filter((s) => s.type === type)
    .filter((s) => { const cs = colorsOf(s); return (!colors.length || cs.some((c) => colors.includes(c))) && !cs.some((c) => without.includes(c)); })
    .map((s) => s.name);
}

/** Pozice místa, kam musí mířit sledovaná nálepka, a které nálepky dílků se sledují. */
function groupOf(slot, cell) {
  const pieces = (cell.pieces ?? []).map((n) => slotByName(n)).filter((p) => p.type === slot.type);
  const ori = cell.ori ?? 'any';
  if (ori === 'correct') {
    return { pieces, stickers: pieces.map(() => [0]), place: slot.facelets.filter((f) => ORI_AT[f] === 0) };
  }
  if (ori && typeof ori === 'object') {
    const want = new Set(ori.colors ?? []);
    const keep = pieces.filter((p) => colorsOf(p).some((c) => want.has(c)));
    return {
      pieces: keep,
      stickers: keep.map((p) => colorsOf(p).map((c, i) => (want.has(c) ? i : -1)).filter((i) => i >= 0)),
      place: slot.facelets.filter((f) => FACELETS[f].face === ori.side),
    };
  }
  return { pieces, stickers: pieces.map((p) => p.facelets.map((_, i) => i)), place: [...slot.facelets] };
}

/**
 * Omezení pro hledání z buněk kroku.
 * @param {Record<string, object>} cells
 * @returns {Record<string, any>}
 */
export function compileCells(cells) {
  let out = {};
  const groups = new Map();
  for (const [name, cell] of Object.entries(cells ?? {})) {
    if (!cell) continue;
    const slot = slotByName(name);
    if (slot.type === 'center') continue;
    if (cell.own === 'solved') { out = mergeConstraints(out, { [slot.name]: 'solved' }); continue; }
    if (cell.own === 'any') { out = mergeConstraints(out, { [slot.name]: 'permutation' }); continue; }
    const g = groupOf(slot, cell);
    if (!g.pieces.length || !g.place.length) { out = mergeConstraints(out, { [slot.name]: 'solved' }); continue; } // nesplnitelné → aspoň něco
    const key = `${g.pieces.map((p) => p.name).join()}|${JSON.stringify(g.stickers)}`;
    const cur = groups.get(key) ?? { pieces: g.pieces.map((p) => p.name), stickers: g.stickers, places: [] };
    cur.places.push(g.place);
    groups.set(key, cur);
  }
  if (groups.size) out = mergeConstraints(out, { '#classes': [...groups.values()] });
  return out;
}

/** Buňky s vlastním dílkem jako dílky ve starém tvaru (název → solved / permutation). */
export function cellsToParts(cells) {
  return Object.fromEntries(Object.entries(cells ?? {}).filter(([, c]) => c?.own).map(([n, c]) => [n, c.own === 'solved' ? 'solved' : 'permutation']));
}

/** Má krok buňky „některý z dílků“ (cíl nejde zadat jen pevnými dílky)? */
export const hasGroupCells = (cells) => Object.values(cells ?? {}).some((c) => c?.pieces);

/**
 * Přejmenuje buňky při změně orientace (map: stěna → stěna), např. jiné držení metody
 * nebo volnost kroku (jiná barva dole).
 */
export function remapCells(cells, map) {
  const name = (n) => slotByName([...n].map((f) => map[f]).join('')).name;
  return Object.fromEntries(Object.entries(cells ?? {}).map(([n, c]) => {
    if (!c?.pieces) return [name(n), c];
    const ori = c.ori && typeof c.ori === 'object' ? { side: map[c.ori.side], colors: (c.ori.colors ?? []).map((x) => map[x]) } : c.ori;
    return [name(n), { pieces: c.pieces.map(name), ori }];
  }));
}

/** Převod ze staršího zadání (dílky se styly + pravidla pro skupiny, core/rules.js). */
export function cellsFromLegacy(parts, rules, frameMapFn) {
  const cells = {};
  const all = (type) => PIECE_SLOTS.filter((s) => s.type === type).map((s) => s.name);
  for (const [n, style] of Object.entries(parts ?? {})) {
    const slot = slotByName(n);
    if (slot.type === 'center') continue;
    if (style === 'solved') cells[slot.name] = { own: 'solved' };
    else if (style === 'permutation') cells[slot.name] = { own: 'any' };
    else if (style === 'orientation') cells[slot.name] = { pieces: all(slot.type), ori: 'correct' };
  }
  for (const rule of rules ?? []) {
    const map = frameMapFn();
    const want = (rule.colors ?? []).map((c) => map[c]);
    const not = (rule.without ?? []).map((c) => map[c]);
    const pieces = piecesWithColors(rule.type, want, not);
    for (const p of rule.places ?? []) {
      const slot = slotByName([...p].map((f) => map[f]).join(''));
      let ori = rule.ori === 'solved' ? 'correct' : 'any';
      if (rule.ori === 'color') {
        const faces = (rule.oriFaces ?? []).map((f) => map[f]);
        const side = colorsOf(slot).find((f) => faces.includes(f));
        if (side) ori = { side, colors: (rule.oriColors?.length ? rule.oriColors : rule.colors ?? []).map((c) => map[c]) };
      }
      cells[slot.name] = { pieces, ori };
    }
  }
  return cells;
}

// --- popis slovy ------------------------------------------------------------------------------------
const NAME = { U: 'bílá', D: 'žlutá', F: 'zelená', B: 'modrá', R: 'červená', L: 'oranžová' };
const INSTR = { U: 'bílou', D: 'žlutou', F: 'zelenou', B: 'modrou', R: 'červenou', L: 'oranžovou' };

/**
 * Popis skupiny dílků slovy („kterákoli hrana s bílou nebo žlutou“, „3 vybrané rohy“).
 * @param {string[]} pieces
 * @param {string} type
 */
/** Barvy, podle kterých je skupina vybraná (všechny dílky s některou z nich), nebo null. */
function pieceCombo(pieces, type) {
  for (const combo of colorCombos()) {
    const set = piecesWithColors(type, combo);
    if (set.length === pieces.length && set.every((n) => pieces.includes(n)) && set.length < piecesWithColors(type).length) return combo;
  }
  return null;
}

export function describePieces(pieces, type) {
  const edge = type === 'edge';
  const all = piecesWithColors(type);
  if (pieces.length === all.length) return edge ? 'kterákoli hrana' : 'kterýkoli roh';
  for (const combo of colorCombos()) {
    const set = piecesWithColors(type, combo);
    if (set.length === pieces.length && set.every((n) => pieces.includes(n))) {
      return `${edge ? 'kterákoli hrana' : 'kterýkoli roh'} s ${combo.map((c) => INSTR[c]).join(' nebo ')} barvou`;
    }
  }
  if (pieces.length === 1) return `${edge ? 'hrana' : 'roh'} ${[...pieces[0]].map((c) => NAME[c]).join('-')}`;
  return `${pieces.length} vybran${edge ? 'ých hran' : 'ých rohů'}`;
}
function colorCombos() {
  const F = ['U', 'D', 'F', 'B', 'R', 'L'];
  const out = F.map((a) => [a]);
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) out.push([F[i], F[j]]);
  return out;
}

/**
 * Buňka slovy.
 * @param {object} cell
 * @param {string} type 'edge' | 'corner'
 * @param {Record<string,string>} [back] stěna kostky → strana v pohledu metody (dole = D);
 *   bez ní se strany berou podle kostky
 */
export function describeCell(cell, type, back = { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L' }) {
  if (!cell) return 'na tomto místě nezáleží';
  if (cell.own === 'solved') return 'jeho vlastní dílek, správně natočený';
  if (cell.own === 'any') return 'jeho vlastní dílek, natočený jakkoli';
  const who = describePieces(cell.pieces ?? [], type);
  // natočení stejnou barvou, jakou mají vybrané dílky → „tou barvou dolů“ (bez opakování barev)
  const combo = pieceCombo(cell.pieces ?? [], type);
  if (combo && cell.ori && typeof cell.ori === 'object' && combo.length === cell.ori.colors?.length && combo.every((c) => cell.ori.colors.includes(c))) {
    const sideWord = { U: 'nahoru', D: 'dolů', F: 'dopředu', B: 'dozadu', R: 'doprava', L: 'doleva' }[back[cell.ori.side]] ?? '';
    return `${who}, tou barvou ${sideWord}`;
  }
  const ori = cell.ori;
  const side = { U: 'nahoru', D: 'dolů', F: 'dopředu', B: 'dozadu', R: 'doprava', L: 'doleva' };
  const how = ori === 'correct' ? ', správně natočený'
    : ori && typeof ori === 'object' ? `, ${(ori.colors ?? []).map((c) => INSTR[c]).join(' nebo ')} nálepkou ${side[back[ori.side]] ?? ''}` : ', natočený jakkoli';
  return `${who}${how}`;
}
