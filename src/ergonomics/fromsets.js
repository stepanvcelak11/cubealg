// Ladění vah podle tvých sad (Lab → Tahy a váhy → Podle mých sad): algoritmy, které sis
// do sad vybral, jsou ty, které se ti točí nejlíp. Každý se porovná se soupeři pro stejný
// případ – oblíbenými algoritmy sbírky (corpus.js) a tím, co pro jeho zadání najde Lab –
// a z dvojic „můj je lepší než soupeř“ se naučí váhy (learnPreferences, i s návazností
// dvojic tahů po sobě). Hledání pak dává přednost algoritmům, jaké si vybíráš ty.

import { normalizeAlg, knownCaseOf } from './review.js';
import { speedOf } from './algdb.js';
import { learnPreferences } from './calibrate.js';

const AUF = /^U[2']?$/;

/** Algoritmus bez AUF v závorce na začátku a na konci („(U) R U R' (U2)“ → „R U R'“). */
export function coreOf(text) {
  const t = String(text).replace(/[’´`]/g, "'").trim()
    .replace(/^\(\s*(U[2']?)\s*\)\s*/, '').replace(/\s*\(\s*(U[2']?)\s*\)$/, '');
  return normalizeAlg(t);
}

/** Řešení z hledání (pre, alg, post v zápisu držení) → jádro bez AUF. */
export const rivalCore = (alg) => normalizeAlg(alg).split(' ').filter((t, i, a) => !(AUF.test(t) && (i === 0 || i === a.length - 1))).join(' ');

/**
 * Dvojice pro učení: můj algoritmus (lepší) × soupeř (horší).
 * @param {{id:string, alg:string}[]} mine vybrané algoritmy
 * @param {object} config dnešní hodnocení
 * @param {{rivals?: Map<string, string[]>, perAlg?: number}} [opts] soupeři z hledání podle id algoritmu
 * @returns {{pairs:{better:string, worse:string}[], cases:{id:string, alg:string, rivals:string[]}[]}}
 */
export function setPairs(mine, config, { rivals = new Map(), perAlg = 6 } = {}) {
  const chosen = new Set(mine.map((a) => coreOf(a.alg)));
  const pairs = [], cases = [];
  for (const a of mine) {
    const alg = coreOf(a.alg);
    if (!alg) continue;
    const pool = new Set([...(knownCaseOf(alg)?.algs ?? []).map(normalizeAlg), ...(rivals.get(a.id) ?? []).map(rivalCore)]);
    // soupeři: jiné než tvoje vybrané (dva tvoje pro stejný případ spolu nesoupeří)
    const list = [...pool].filter((r) => r && !chosen.has(r));
    const scored = [];
    for (const r of list) { try { scored.push([r, speedOf(r, config)]); } catch { /* nejde přečíst */ } }
    // nejsilnější soupeři podle dnešního hodnocení – na nich se pozná nejvíc
    const top = scored.sort((x, y) => x[1] - y[1]).slice(0, perAlg).map((x) => x[0]);
    if (!top.length) continue;
    cases.push({ id: a.id, alg, rivals: top });
    for (const r of top) pairs.push({ better: alg, worse: r });
  }
  return { pairs, cases };
}

/** U kolika případů vychází tvůj algoritmus podle hodnocení nejlepší (před soupeři). */
export function winsOf(cases, config) {
  let wins = 0;
  for (const c of cases) {
    try {
      const v = speedOf(c.alg, config);
      if (c.rivals.every((r) => speedOf(r, config) > v)) wins++;
    } catch { /* nejde přečíst */ }
  }
  return wins;
}

/**
 * Naučí váhy z tvých sad.
 * @param {object} puzzle 3×3
 * @param {object} config dnešní hodnocení
 * @param {{id:string, alg:string}[]} mine
 * @param {{rivals?: Map<string, string[]>, extra?: object[]}} [opts] extra = další porovnání (z Porovnat algoritmy)
 */
export function learnFromSets(puzzle, config, mine, { rivals, extra = [] } = {}) {
  const { pairs, cases } = setPairs(mine, config, { rivals });
  if (!cases.length) return { ok: false, reason: 'U vybraných algoritmů jsem nenašel žádné jiné algoritmy pro stejný případ – zapni hledání soupeřů v Labu nebo vyber jiné sady.' };
  const res = learnPreferences(puzzle, config, [...pairs, ...extra], { transitions: true });
  if (!res.ok) return res;
  return { ...res, cases: cases.length, pairs: pairs.length, winsBefore: winsOf(cases, config), winsAfter: winsOf(cases, res.config) };
}
