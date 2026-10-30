// Statistika sady algoritmů: délky, šance případů a které tahy se v sadě točí.
//
// Šance případu: případ je stav, jak ho vidíš (barvy jen na sledovaných nálepkách).
// Stejný případ přijde v několika podobách – natočený o U před (a o U po) algoritmu.
// Počet různých podob = váha případu; šance = váha / součet vah všech případů sady
// (+ přeskočení, když je krok už hotový). Pro úplnou sadu je to přesné (OLL: 1/54…,
// PLL: Aa 1/18, H 1/72), pro neúplnou je to podíl mezi případy, které sada má.

import { parseAlg } from './notation.js';

const ROT = new Set(['x', 'y', 'z']);
const SLICE = new Set(['M', 'E', 'S']);

/** Délky algoritmu: STM (slice = 1 tah, rotace se nepočítají) a HTM (slice = 2 tahy). */
export function algLength(alg) {
  const moves = parseAlg(String(alg).replace(/[()[\]]/g, ' ')).filter((m) => !ROT.has(m.base));
  return { stm: moves.length, htm: moves.reduce((n, m) => n + (SLICE.has(m.base) ? 2 : 1), 0) };
}

/**
 * Které tahy sada používá: počet tahů podle stěny/vrstvy (R, U, M, r…), podíl dvojitých,
 * rotace. weights = váha každého algoritmu (šance), jinak 1.
 */
export function moveUsage(list, weights) {
  const by = new Map();
  let total = 0, doubles = 0, rotations = 0, wsum = 0;
  list.forEach((alg, i) => {
    const w = weights?.[i] ?? 1;
    let moves;
    try { moves = parseAlg(String(alg).replace(/[()[\]]/g, ' ')); } catch { return; }
    wsum += w;
    for (const m of moves) {
      if (ROT.has(m.base)) { rotations += w; continue; }
      by.set(m.base, (by.get(m.base) ?? 0) + w);
      total += w;
      if (Math.abs(m.amount) === 2) doubles += w;
    }
  });
  const rows = [...by].map(([base, n]) => ({ base, count: n, share: total ? n / total : 0 })).sort((a, b) => b.count - a.count);
  return { rows, total, doubles: total ? doubles / total : 0, rotations: wsum ? rotations / wsum : 0 };
}

/**
 * Váha případu: kolik různých podob (vzorů na sledovaných nálepkách) dá natočení
 * vrstvy před a po algoritmu. Vrací i kanonický vzor (stejný případ = stejný klíč).
 * @param {Uint8Array} loc stav případu (nálepka → pozice)
 * @param {number[]} tracked sledované nálepky
 * @param {Uint8Array[]} pres natočení před algoritmem (permutace pozic), bez identity
 * @param {Uint8Array[]} posts natočení po algoritmu (pravé násobení), bez identity
 */
export function caseWeight(loc, tracked, faceOf, pres, posts) {
  const n = loc.length;
  const pattern = (x) => {
    const out = new Array(n).fill('-');
    for (const k of tracked) out[x[k]] = faceOf(k);
    return out.join('');
  };
  const seen = new Set();
  for (const pre of [null, ...pres]) for (const post of [null, ...posts]) {
    const x = new Uint8Array(n);
    for (let k = 0; k < n; k++) { const v = post ? loc[post[k]] : loc[k]; x[k] = pre ? pre[v] : v; }
    seen.add(pattern(x));
  }
  return { weight: seen.size, key: [...seen].sort()[0] };
}

/**
 * Šance případů sady.
 * @param {{key: string, weight: number}[]} cases (null = nejde spočítat)
 * @param {number} [skip] váha přeskočení (hotový stav), 0 = nepočítat
 * @returns {{share: (number|null)[], skip: number, distinct: number}}
 */
export function caseShares(cases, skip = 0) {
  const uniq = new Map();
  for (const c of cases) if (c) uniq.set(c.key, c.weight);
  const total = [...uniq.values()].reduce((a, b) => a + b, 0) + skip;
  return {
    share: cases.map((c) => (c && total ? c.weight / total : null)),
    skip: total ? skip / total : 0,
    distinct: uniq.size,
  };
}
