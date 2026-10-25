// Data z chytré kostky pro ergonomii: plynulé úseky točení (bez pauzy) s naměřeným časem.
// Jsou to „algoritmy“ jako z trenažéru, jen změřené kostkou – kalibrace (Tahy a váhy →
// Podle mé chytré kostky) z nich spočítá váhy tahů, přehmatů a návaznosti.
// Úseky se ukládají v zápisu tvého držení: z trenažéru v držení algoritmu, z timeru
// v držení metody (jen kroky algoritmů – při intuitivních krocích se kostka otáčí).

import { storage } from './dom.js';
import { fluentSegments } from '../smartcube/recon.js';
import { holdOf } from '../core/hold.js';

const KEY = 'ergocube.smart.segments';
const MAX = 3000;

/** Uloží plynulé úseky z tahů [{move, t, end}] (hold = držení, ve kterém se točilo). */
export function recordSegments(moves, source, hold = '') {
  const seg = fluentSegments(moves);
  if (!seg.length) return 0;
  const h = holdOf(hold);
  const list = storage.get(KEY) ?? [];
  for (const s of seg) {
    let alg = s.alg;
    try { alg = h.toHeldString(alg); } catch { /* jak je */ }
    list.push({ alg, ms: s.ms, src: source, d: Date.now() });
  }
  storage.set(KEY, list.slice(-MAX));
  return seg.length;
}

/** Uložené úseky jako „algoritmy s časy“ pro kalibraci (stejný úsek víckrát = víc časů). */
export function segmentItems() {
  const by = new Map();
  for (const s of storage.get(KEY) ?? []) {
    if (!by.has(s.alg)) by.set(s.alg, { alg: s.alg, times: [] });
    by.get(s.alg).times.push({ t: s.ms });
  }
  return [...by.values()];
}

export const segmentCount = () => (storage.get(KEY) ?? []).length;
export const clearSegments = () => storage.set(KEY, []);
