// Kalibrace vah tahů podle naměřených časů z trenažéru.
//
// Model: čas algoritmu ≈ c + Σ (počet tahů daného druhu × β_tahu)
//                          + Σ (počet přehmatů, změn úchopu, míst se stejným prstem,
//                               dvou tahů jednou rukou a střídání rukou × β).
// Nejdřív se odhadne c a měřítko k (sekund na jednotku váhy) z výchozího
// hodnocení, pak ridge regrese táhne β k k·výchozí váha – málo dat tedy váhy
// skoro nezmění, hodně dat je přizpůsobí tvým rukám. Nová váha = β / k.

import { parseSq1 } from '../puzzles/sq1.js';
import { scoreAlg } from './score.js';
import { mirrorMove } from '../core/notation.js';

// Druhy míst v kostkovém hodnocení (kromě tahů) a jejich nastavení.
const EVENTS = {
  regrip: { get: (c) => c.regripPenalty, set: (c, w) => { c.regripPenalty = w; }, min: 0, max: 8 },
  grip: { get: (c) => c.gripChangePenalty, set: (c, w) => { c.gripChangePenalty = w; }, min: 0, max: 4 },
  'flow:reuse': { get: (c) => c.reuse * c.flowScale, set: (c, w) => { c.reuse = w / c.flowScale; }, min: 0, max: 4, flow: true },
  'flow:sameHand': { get: (c) => c.sameHand * c.flowScale, set: (c, w) => { c.sameHand = w / c.flowScale; }, min: 0, max: 4, flow: true },
  // bonus: příspěvek je záporný
  'flow:alternate': { get: (c) => -c.alternate * c.flowScale, set: (c, w) => { c.alternate = -w / c.flowScale; }, min: -1.5, max: 0, flow: true },
};

export const MIN_ALGS = 5;
export const MIN_TIMES = 3;

/** Druhy tahů v algoritmu (klíč → počet) podle typu hodnocení hlavolamu; u kostek i přehmaty a návaznost. */
export function features(puzzle, alg, config = {}) {
  const out = new Map();
  const add = (k) => out.set(k, (out.get(k) ?? 0) + 1);
  if (puzzle.ergonomics === 'sq1') {
    for (const m of parseSq1(alg)) {
      if (m.t === 'slash') add('slash');
      else for (const x of [m.a, m.b]) if (x) add(`turn:${Math.abs(x)}`);
    }
    return out;
  }
  const moves = puzzle.parseAlg(alg);
  for (const m0 of moves) {
    if (puzzle.rotations?.includes(m0.base)) continue;
    const m = config.leftHanded && puzzle.ergonomics === 'cube' ? mirrorMove(m0) : m0;
    add(`${m.base}:${m.amount === 1 ? 0 : m.amount === -1 ? 1 : 2}`);
  }
  if (puzzle.ergonomics === 'cube') {
    const s = scoreAlg(puzzle.id === '333' ? alg : puzzle.algToString(alg), config);
    for (const it of s.perMove) {
      if (it.regrip > 0) add('regrip');
      if (it.gripChange > 0) add('grip');
      if (it.flowKind && config.flowScale > 0) add(`flow:${it.flowKind}`);
    }
  }
  return out;
}

/** Současná váha druhu tahu v nastavení. */
function weightOf(puzzle, config, key) {
  if (EVENTS[key]) return EVENTS[key].get(config);
  if (key === 'slash') return config.slash;
  if (key.startsWith('turn:')) return config.turn[Number(key.slice(5))];
  const [base, i] = key.split(':');
  const table = puzzle.ergonomics === 'cube' ? config.moveWeights : config.weights;
  return table?.[base]?.[Number(i)] ?? 1;
}

/** Nastavení s novými vahami (kopie). */
function withWeights(puzzle, config, weights) {
  const next = structuredClone(config);
  for (const [key, w] of weights) {
    if (EVENTS[key]) EVENTS[key].set(next, w);
    else if (key === 'slash') next.slash = w;
    else if (key.startsWith('turn:')) next.turn[Number(key.slice(5))] = w;
    else {
      const [base, i] = key.split(':');
      const table = puzzle.ergonomics === 'cube' ? (next.moveWeights = { ...next.moveWeights }) : (next.weights = { ...next.weights });
      table[base] = [...(table[base] ?? [1, 1, 1])];
      table[base][Number(i)] = w;
    }
  }
  return next;
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Řešení soustavy A x = b (Gaussova eliminace s výběrem pivota). */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * @param {object} puzzle
 * @param {object} config současné nastavení hodnocení
 * @param {{alg:string, times:{t:number}[]}[]} items uložené algoritmy tohoto hlavolamu
 * @returns {{ok:false, reason:string} | {ok:true, config:object, changes:{key:string, from:number, to:number}[], used:number, secondsPerUnit:number}}
 */
export function calibrate(puzzle, config, items, { lambda = 3 } = {}) {
  const data = items.filter((a) => a.times.length >= MIN_TIMES).map((a) => ({
    y: median(a.times.slice(-12).map((x) => x.t)) / 1000,
    x: features(puzzle, a.alg, config),
  })).filter((d) => d.x.size);
  if (data.length < MIN_ALGS) {
    return { ok: false, reason: `Potřebuju aspoň ${MIN_ALGS} algoritmů tohoto hlavolamu, každý změřený aspoň ${MIN_TIMES}×. Teď jich je ${data.length}.` };
  }
  const keys = [...new Set(data.flatMap((d) => [...d.x.keys()]))];
  const w0 = keys.map((k) => weightOf(puzzle, config, k));
  // 1) c a k z výchozího součtu vah (přímka čas ~ c + k · skóre)
  const s = data.map((d) => keys.reduce((acc, k, j) => acc + (d.x.get(k) ?? 0) * w0[j], 0));
  const n = data.length;
  const ms = s.reduce((a, b) => a + b, 0) / n, my = data.reduce((a, d) => a + d.y, 0) / n;
  const cov = s.reduce((a, v, i) => a + (v - ms) * (data[i].y - my), 0);
  const varS = s.reduce((a, v) => a + (v - ms) ** 2, 0);
  const k = varS > 1e-9 ? cov / varS : 0;
  if (!(k > 0)) return { ok: false, reason: 'Z časů zatím nejde poznat, které tahy jsou pomalejší (delší algoritmy nejsou pomalejší). Potrénuj víc.' };
  const c = Math.max(0, my - k * ms);
  // 2) ridge: (XᵀX + λI) β = Xᵀ(y − c) + λ k w0
  const m = keys.length;
  const A = Array.from({ length: m }, () => new Array(m).fill(0));
  const rhs = w0.map((w) => lambda * k * w);
  for (const d of data) {
    const row = keys.map((key) => d.x.get(key) ?? 0);
    for (let i = 0; i < m; i++) {
      if (!row[i]) continue;
      rhs[i] += row[i] * (d.y - c);
      for (let j = 0; j < m; j++) A[i][j] += row[i] * row[j];
    }
  }
  for (let i = 0; i < m; i++) A[i][i] += lambda;
  const beta = solve(A, rhs);
  if (!beta) return { ok: false, reason: 'Výpočet se nepovedl (málo různorodá data).' };
  const round = (v) => Math.round(v * 10) / 10;
  const clamp = (key, v) => (EVENTS[key] ? Math.min(EVENTS[key].max, Math.max(EVENTS[key].min, v)) : Math.min(6, Math.max(0.2, v)));
  const weights = new Map(keys.map((key, j) => [key, round(clamp(key, beta[j] / k))]));
  const changes = keys.map((key, j) => ({ key, from: w0[j], to: weights.get(key) })).filter((x) => Math.abs(x.to - x.from) >= 0.05);
  return { ok: true, config: withWeights(puzzle, config, weights), changes, used: n, secondsPerUnit: k };
}

/** Čitelný název druhu tahu („R'“, „U2“, „řez“, „otočení o 3“). */
const EVENT_LABELS = {
  regrip: 'přehmat', grip: 'změna úchopu', 'flow:reuse': 'stejný prst dvakrát',
  'flow:sameHand': 'dva tahy jednou rukou', 'flow:alternate': 'střídání rukou',
};
export function featureLabel(key) {
  if (EVENT_LABELS[key]) return EVENT_LABELS[key];
  if (key === 'slash') return 'řez /';
  if (key.startsWith('turn:')) return `otočení o ${key.slice(5)}`;
  const [base, i] = key.split(':');
  return base + ['', "'", '2'][Number(i)];
}

export const MIN_PREFS = 3;

/**
 * Doladění vah podle tvých voleb v generátoru: dvojice (vybraný, nabídnutý) –
 * vybraný má mít nižší hodnocení. Hodnocení se bere jako lineární součet druhů
 * tahů a míst (stejně jako u kalibrace podle časů); váhy se posouvají, dokud
 * vybraný nevychází aspoň o `margin` lépe, a zároveň je drží u výchozích hodnot
 * (málo voleb tedy váhy změní jen trochu).
 * @param {{better:string, worse:string}[]} pairs
 * @returns {{ok:false, reason:string} | {ok:true, config:object, changes:{key:string, from:number, to:number}[], used:number, agree:number}}
 */
export function learnPreferences(puzzle, config, pairs, { epochs = 60, rate = 0.05, pull = 0.02, margin = 0.3 } = {}) {
  const data = pairs.map((p) => ({ b: features(puzzle, p.better, config), w: features(puzzle, p.worse, config) }))
    .filter((d) => d.b.size && d.w.size);
  if (data.length < MIN_PREFS) {
    return { ok: false, reason: `Potřebuju aspoň ${MIN_PREFS} volby z generátoru sad (klepnutí na jiný než nabídnutý algoritmus). Teď jich je ${data.length}.` };
  }
  const keys = [...new Set(data.flatMap((d) => [...d.b.keys(), ...d.w.keys()]))];
  const w0 = new Map(keys.map((k) => [k, weightOf(puzzle, config, k)]));
  const w = new Map(w0);
  const diffs = data.map((d) => keys.map((k) => (d.b.get(k) ?? 0) - (d.w.get(k) ?? 0)));
  const value = (diff) => keys.reduce((a, k, j) => a + diff[j] * w.get(k), 0);
  const clamp = (key, v) => (EVENTS[key] ? Math.min(EVENTS[key].max, Math.max(EVENTS[key].min, v)) : Math.min(6, Math.max(0.2, v)));
  for (let e = 0; e < epochs; e++) {
    for (const diff of diffs) {
      if (value(diff) <= -margin) continue;
      keys.forEach((k, j) => { if (diff[j]) w.set(k, clamp(k, w.get(k) - rate * diff[j])); });
    }
    for (const k of keys) w.set(k, w.get(k) + pull * (w0.get(k) - w.get(k)));
  }
  const round = (v) => Math.round(v * 10) / 10;
  const weights = new Map(keys.map((k) => [k, round(clamp(k, w.get(k)))]));
  const changes = keys.map((key) => ({ key, from: w0.get(key), to: weights.get(key) })).filter((x) => Math.abs(x.to - x.from) >= 0.05);
  const next = withWeights(puzzle, config, weights);
  // kolik voleb nové hodnocení potvrzuje
  const agree = data.filter((d, i) => keys.reduce((a, k, j) => a + diffs[i][j] * weights.get(k), 0) < 0).length;
  return { ok: true, config: next, changes, used: data.length, agree };
}
