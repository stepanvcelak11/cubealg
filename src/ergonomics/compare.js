// Porovnání dvojic (Tahy a váhy → Porovnat algoritmy): dvojice algoritmů pro stejný
// případ ze sbírky (corpus.js – oblíbené algoritmy skladačů a alternativy z hledání).
// Každou další dvojici vybírá tak, aby se o vahách dozvěděla co nejvíc:
//   - pokrytí: dvojice se liší v druzích tahů a míst (L, F2, D, M, přehmat, stejný prst…),
//     které dosavadní odpovědi zatím skoro nezkoušely – časem se otestuje všechno,
//   - nejistota: dnešní hodnocení je u ní skoro nerozhodné (odpověď nejvíc napoví),
//   - krátké algoritmy (rychle se zatočí) a každý algoritmus nejvýš dvakrát.
// Odpovědi se ukládají jako volby (store.js recordPreference) a váhy z nich spočítá
// learnPreferences (calibrate.js).

import { features } from './calibrate.js';
import { scoreAlg } from './score.js';

/** Všechny dvojice ze sbírky (stejný případ): { a, b, case, kind, x: rozdíl druhů tahů, base: rozdíl hodnocení }. */
export function pairsOf(puzzle, config, corpus) {
  const fcache = new Map(), scache = new Map();
  const f = (alg) => { if (!fcache.has(alg)) fcache.set(alg, features(puzzle, alg, config)); return fcache.get(alg); };
  const s = (alg) => { if (!scache.has(alg)) scache.set(alg, scoreAlg(alg, config).total); return scache.get(alg); };
  const out = [];
  for (const c of corpus) {
    const algs = [c.ref, ...c.alts];
    for (let i = 0; i < algs.length; i++) for (let j = i + 1; j < algs.length; j++) {
      const a = algs[i], b = algs[j];
      const x = new Map();
      for (const [k, v] of f(a)) x.set(k, v);
      for (const [k, v] of f(b)) x.set(k, (x.get(k) ?? 0) - v);
      for (const [k, v] of x) if (!v) x.delete(k);
      if (!x.size) continue;
      out.push({ a, b, case: c.name, kind: c.kind, x, base: s(a) - s(b), len: a.split(' ').length + b.split(' ').length });
    }
  }
  return out;
}

/**
 * Další dvojice k porovnání.
 * @param {object[]} pairs z pairsOf
 * @param {{better:string, worse:string}[]} answered dosavadní odpovědi (i z minulých porovnání)
 * @param {Set<string>} [asked] klíče dvojic, které už padly v tomto porovnání
 * @param {() => number} [rand] náhoda (pro testy)
 */
export function nextPair(puzzle, config, pairs, answered, asked = new Set(), rand = Math.random) {
  // kolikrát už odpovědi zkoušely který druh tahu (a kolikrát padl který algoritmus)
  const seen = new Map(), uses = new Map();
  for (const p of answered) {
    const fb = features(puzzle, p.better, config), fw = features(puzzle, p.worse, config);
    for (const k of new Set([...fb.keys(), ...fw.keys()])) {
      const d = Math.abs((fb.get(k) ?? 0) - (fw.get(k) ?? 0));
      if (d) seen.set(k, (seen.get(k) ?? 0) + d);
    }
    for (const a of [p.better, p.worse]) uses.set(a, (uses.get(a) ?? 0) + 1);
  }
  let best = null, bestValue = -Infinity;
  for (const p of pairs) {
    const key = keyOf(p.a, p.b);
    if (asked.has(key) || (uses.get(p.a) ?? 0) >= 2 || (uses.get(p.b) ?? 0) >= 2) continue;
    let cover = 0;
    for (const [k, v] of p.x) cover += Math.min(2, Math.abs(v)) / Math.sqrt(1 + (seen.get(k) ?? 0));
    const unsure = Math.exp(-Math.abs(p.base) / 2);
    const short = 1 / (1 + p.len / 24);
    const value = cover * (0.4 + unsure) * short * (0.85 + 0.3 * rand());
    if (value > bestValue) { bestValue = value; best = p; }
  }
  if (!best) return null;
  // strany náhodně (A vlevo ≠ vždy oblíbený algoritmus)
  return rand() < 0.5 ? { ...best } : { ...best, a: best.b, b: best.a, base: -best.base };
}

export const keyOf = (a, b) => [a, b].sort().join('|');
