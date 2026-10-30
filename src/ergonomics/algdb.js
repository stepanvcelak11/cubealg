// Knihovna algoritmů (Trenažér → Knihovna): algoritmy z vestavěné sbírky nebo vložené jako
// text (zkopírované z SpeedCubeDB, AlgDb, cubing.net…) se roztřídí podle případu, který
// řeší, a v každém případu seřadí podle tvých vah (pohled Nejrychlejší: nepohodlnost + čas
// tahů). Nejlepší pro tebe je nahoře.
//
// Druh případu se pozná ze stavu, který algoritmus řeší (inverze algoritmu na složené kostce):
//   PLL – první dvě vrstvy hotové a horní strana natočená
//   OLL – první dvě vrstvy hotové, horní strana ne
//   F2L – kříž hotový (dolní hrany), zbytek první dvou vrstev ne
//   jiné – cokoli dalšího (celý stav)
// Stejný případ = stejný stav až na natočení horní vrstvy před a po (AUF); u OLL záleží jen
// na natočení dílků nahoře, u F2L jen na dílcích prvních dvou vrstev.

import { getPuzzle } from '../puzzles/index.js';
import { scoreAlg } from './score.js';
import { MOVE_TIME } from './style.js';
import { holdOf } from '../core/hold.js';

const P = getPuzzle('333');
const AUF = ['', 'U', "U'", 'U2'];
const isU = (s) => s.name.includes('U') && s.facelets.length > 1;
const F2L = P.slots.filter((s) => !isU(s) && s.facelets.length > 1);
const CROSS = ['DF', 'DR', 'DB', 'DL'].map((n) => P.slotByName(n));
const UPIECES = P.slots.filter(isU);
const solved = P.solved();

const at = (loc, slot) => slot.facelets.every((f) => loc[f] === f); // dílek doma a správně natočený
/** Natočení dílků horní vrstvy: kde je nálepka horní barvy (pozice U-nálepek). */
function topPattern(loc) {
  const out = [];
  for (const s of UPIECES) for (const f of s.facelets) out[loc[f]] = P.stickerFace[f] === 'U' ? 1 : 0;
  return out.join('');
}

/** Druh případu, který algoritmus (zápis modelu) řeší. */
export function kindOf(alg) {
  const st = P.applyAlg(solved, P.invertAlg(P.parseAlg(alg)));
  if (F2L.every((s) => at(st, s))) {
    const oriented = UPIECES.every((s) => st[s.facelets.find((f) => P.stickerFace[f] === 'U')] < 9);
    return oriented ? (UPIECES.every((s) => at(st, s)) ? 'nic' : 'PLL') : 'OLL';
  }
  if (CROSS.every((s) => at(st, s))) return 'F2L';
  return 'jiné';
}

/** Klíč případu (stejný pro algoritmy, které ho řeší, i s jiným AUF). */
export function caseKey(alg, kind = kindOf(alg)) {
  const inv = P.invertAlg(P.parseAlg(alg)).map((m) => P.moveToString(m)).join(' ');
  let best = null;
  for (const a of AUF) for (const b of AUF) {
    const st = P.applyAlg(solved, [a, inv, b].filter(Boolean).join(' '));
    const key = kind === 'OLL' ? topPattern(st)
      : kind === 'F2L' ? F2L.map((s) => s.facelets.map((f) => st[f]).join(',')).join('|')
        : Array.from(st).join(',');
    if (best === null || key < best) best = key;
  }
  return `${kind}:${best}`;
}

/** Vložený text → [{ name?, alg }] (řádky „název: algoritmus“, „1. R U R'“, tabulky…). */
export function parseAlgText(text) {
  const out = [];
  const token = /^(?:[RLUDFBMESrludfbxyz]|[RLUDFB]w)(?:2|'|2')?$/;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/[’´`]/g, "'").trim();
    if (!line) continue;
    // název před dvojtečkou / tabulátorem / pomlčkou, jinak bez názvu
    const m = line.match(/^(.*?)(?:\s*[:\t]\s*|\s+[-–]\s+)(.+)$/);
    const parts = m ? [m[1], m[2]] : [null, line];
    // konec řádku může být poznámka – vezmi nejdelší začátek ze samých tahů (závorky jsou jen pomůcka)
    const ok = [];
    for (const t of parts[1].replace(/[()[\]]/g, ' ').split(/\s+/).filter(Boolean)) {
      if (token.test(t)) ok.push(t.replace(/^([RLUDFB])w/, (_, b) => b.toLowerCase()).replace(/2'$/, '2'));
      else if (ok.length) break;
    }
    if (ok.length < 2) continue;
    const name = parts[0]?.replace(/^\d+[.)]\s*/, '').trim() || null;
    out.push({ name, alg: ok.join(' ') });
  }
  return out;
}

/**
 * Algoritmus bez otočení kostky: „y' R U R'“ = stejné tahy viděné z jiné strany (převedou se),
 * stejně tak otočení uprostřed („R U R' y' U R' U' R“), otočení na konci se zahodí (případ je tentýž).
 */
export function withoutRotations(alg) {
  const out = [];
  const rot = [];
  for (const t of alg.split(' ').filter(Boolean)) {
    if (/^[xyz]/.test(t)) rot.push(t);
    else out.push(rot.length ? holdOf(rot.join(' ')).toModelString(t) : t);
  }
  return out.join(' ');
}

/** Hodnota pro pořadí (pohled Nejrychlejší): nepohodlnost + čas tahů. */
export const speedOf = (alg, config) => scoreAlg(alg, config).total + MOVE_TIME * alg.split(' ').length;

/**
 * Roztřídí algoritmy podle případu a v každém seřadí podle vah.
 * @param {{name?: string, alg: string}[]} items
 * @returns {{ key, kind, name, algs: {name, alg, value, moves}[] }[]} případy (PLL, OLL, F2L, jiné)
 */
export function groupByCase(items, config) {
  const groups = new Map();
  const seen = new Set();
  for (const it of items) {
    let kind, key;
    try {
      const core = withoutRotations(it.alg);
      kind = kindOf(core);
      if (kind === 'nic') continue;
      key = caseKey(core, kind);
    } catch { continue; }
    if (seen.has(`${key}|${it.alg}`)) continue;
    seen.add(`${key}|${it.alg}`);
    if (!groups.has(key)) groups.set(key, { key, kind, name: it.name ?? null, algs: [] });
    const g = groups.get(key);
    g.name ??= it.name;
    g.algs.push({ name: it.name, alg: it.alg, value: speedOf(it.alg, config), moves: it.alg.split(' ').length });
  }
  const order = { PLL: 0, OLL: 1, F2L: 2, jiné: 3 };
  return [...groups.values()].map((g) => ({ ...g, algs: g.algs.sort((a, b) => a.value - b.value) }))
    .sort((a, b) => order[a.kind] - order[b.kind] || String(a.name ?? '').localeCompare(String(b.name ?? ''), 'cs', { numeric: true }));
}

/** Omezení zadání pro uložení do trenažéru podle druhu případu. */
export function constraintsFor(kind) {
  return Object.fromEntries(P.slots.map((s) => [s.name,
    kind === 'OLL' ? (isU(s) ? 'orientation' : 'solved')
      : kind === 'F2L' ? (isU(s) ? 'ignore' : 'solved') : 'solved']));
}
