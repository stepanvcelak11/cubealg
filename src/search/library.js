// Známé algoritmy a bloky jako pomoc hledání.
//
//   knihovna – uložené algoritmy (a jejich zrcadla a inverze) s krátkým
//              nastavením před nimi a dokončením po nich: S · A · D, kde S má
//              nejvýš 2 tahy a D nejvýš 3 (najde ho úplné hledání). Pokrývá i
//              konjugaci S · A · S⁻¹. Dobrá řešení tak přijdou hned na začátku
//              a vycházejí z toho, co už umíš.
//   bloky    – triggery (R U R' U', sledge, M' U M…) a časté úseky z knihovny jako
//              jeden krok hledání: hledá se v krocích, takže dosáhne do větších
//              délek a výsledky jsou složené z plynulých celků.

import { clock } from './clock.js';
import { encode, evaluator, search } from './engine.js';
import { mirrorAlg } from '../core/notation.js';

const key = (m) => `${m.base}${m.amount}`;

/** Varianty algoritmu (tahy modelu): samotný, inverze, zrcadlo, zrcadlo inverze – jen z povolených tahů. */
export function variantsOf(P, alg, allowed, { mirror = true } = {}) {
  let moves;
  try { moves = P.parseAlg(alg); } catch { return []; }
  if (!moves.length) return [];
  const out = [moves, P.invertAlg(moves)];
  if (mirror) {
    try {
      const mm = mirrorAlg(moves);
      out.push(mm, P.invertAlg(mm));
    } catch { /* hlavolam bez zrcadlení */ }
  }
  const seen = new Set();
  return out.filter((v) => {
    const k = v.map(key).join(' ');
    if (seen.has(k) || !v.every((m) => allowed.has(key(m)))) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Projde knihovnu: pro každý výchozí stav, nastavení S (0–2 tahy) a variantu A
 * zkusí, zda jde stav po S · A dokončit nejvýš `fix` tahy.
 * @param {ReturnType<import('./engine.js').prepare>} problem úplná úloha
 * @param {{loc: Uint8Array, pre: any}[]} roots výchozí stavy (AUF)
 * @param {string[]} library algoritmy v zápisu modelu
 * @returns {number} kolik kandidátů prošlo
 */
export function searchLibrary(P, problem, roots, library, { deadline, fix = 3, setup = 2, mirror = true, onSolution }) {
  const { moves, moveCount, redundant, names, pieces, trans } = problem;
  const allowed = new Map(moves.map((m, i) => [key(m), i]));
  const { estimate, goalOf } = evaluator(problem);
  const variants = [];
  const seen = new Set();
  for (const alg of library) {
    for (const v of variantsOf(P, alg, allowed, { mirror })) {
      const k = v.map(key).join(' ');
      if (seen.has(k)) continue;
      seen.add(k);
      variants.push(v.map((m) => allowed.get(key(m))));
    }
  }
  if (!variants.length) return 0;
  const n = pieces.length;
  const tr = pieces.map((p) => trans[p.kind]);
  const sizes = pieces.map((p) => p.size);
  const apply = (v, seq) => {
    const out = Uint8Array.from(v);
    for (const m of seq) for (let i = 0; i < n; i++) out[i] = tr[i][m * sizes[i] + out[i]];
    return out;
  };
  // nastavení: kanonické sekvence do délky `setup`
  const setups = [[]];
  for (let d = 0, from = 0; d < setup; d++) {
    const to = setups.length;
    for (let i = from; i < to; i++) {
      const s = setups[i];
      for (let m = 0; m < moveCount; m++) if (!s.length || !redundant[s.at(-1) * moveCount + m]) setups.push([...s, m]);
    }
    from = to;
  }
  let hits = 0;
  for (const root of roots) {
    const v0 = encode(problem, Uint8Array.from(root.loc));
    for (const s of setups) {
      if (clock.now() > deadline) return hits;
      const vs = apply(v0, s);
      for (const a of variants) {
        clock.tick(0.002);
        const v = apply(vs, a);
        if (estimate(v) > fix) continue;
        const prefix = [...s, ...a].map((i) => names[i]);
        if (goalOf(v) >= 0) { hits++; onSolution(prefix.join(' '), root.pre, null, 0); continue; }
        const loc = Uint8Array.from(root.loc);
        const after = problem.puzzle.applyAlg(loc, prefix.join(' '));
        const res = search(problem, after, { maxLength: fix, extraDepth: 0, maxResults: 4, timeLimit: 200 });
        for (const tail of res.solutions) { hits++; onSolution(`${prefix.join(' ')} ${tail}`, root.pre, null, -1); }
      }
    }
  }
  return hits;
}

/**
 * Bloky pro hledání po krocích: triggery a úseky (3–5 tahů), které se v knihovně
 * opakují, jen z povolených tahů (v zápisu držení → indexy tahů modelu).
 * @param {{moves:string[], bonus?:number}[]} triggers z buildTriggers (klíče `${base}${amount}`)
 * @param {{base:string, amount:number}[]} held povolené tahy v zápisu držení
 * @param {string[][]} libraryHeld algoritmy knihovny jako seznamy klíčů v zápisu držení
 */
export function blocksOf(triggers, held, libraryHeld = [], { max = 40 } = {}) {
  const index = new Map(held.map((m, i) => [key(m), i]));
  const out = new Map();
  const add = (keys, bonus) => {
    const seq = keys.map((k) => index.get(k));
    if (seq.length < 2 || seq.some((i) => i === undefined)) return;
    const k = keys.join(' ');
    if (!out.has(k)) out.set(k, { seq, bonus });
  };
  for (const t of triggers) add(t.moves, t.bonus);
  // časté úseky z knihovny
  const counts = new Map();
  for (const alg of libraryHeld) {
    for (let len = 3; len <= 5; len++) for (let i = 0; i + len <= alg.length; i++) {
      const k = alg.slice(i, i + len).join(' ');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  [...counts].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .forEach(([k]) => { if (out.size < max) add(k.split(' '), 0); });
  return [...out.values()];
}

/**
 * Hlavolam, jehož „tahy“ jsou i bloky (sekvence tahů): pro prepare() nad
 * tahy [...jednotlivé, ...bloky]. Blok = { base: '#', seq: [tahy] }.
 */
export function blockPuzzle(P) {
  const wrap = Object.create(P);
  const cache = new Map();
  wrap.perm = (m) => {
    if (!m.seq) return P.perm(m);
    const k = m.seq.map(key).join(' ');
    let to = cache.get(k);
    if (!to) {
      to = Uint8Array.from({ length: P.size }, (_, i) => i);
      for (const x of m.seq) { const p = P.perm(x); to = Uint8Array.from(to, (v) => p[v]); }
      cache.set(k, to);
    }
    return to;
  };
  wrap.moveToString = (m) => (m.seq ? m.seq.map((x) => P.moveToString(x)).join(' ') : P.moveToString(m));
  wrap.redundant = (a, b) => P.redundant(a.seq ? a.seq.at(-1) : a, b.seq ? b.seq[0] : b);
  return wrap;
}
