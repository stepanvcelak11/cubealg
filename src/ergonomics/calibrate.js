// Kalibrace vah tahů podle naměřených časů z trenažéru.
//
// Model: čas algoritmu ≈ c + Σ (počet tahů daného druhu × β_tahu).
// Nejdřív se odhadne c a měřítko k (sekund na jednotku váhy) z výchozího
// hodnocení, pak ridge regrese táhne β k k·výchozí váha – málo dat tedy váhy
// skoro nezmění, hodně dat je přizpůsobí tvým rukám. Nová váha = β / k.

import { parseSq1 } from '../puzzles/sq1.js';

export const MIN_ALGS = 5;
export const MIN_TIMES = 3;

/** Druhy tahů v algoritmu (klíč → počet) podle typu hodnocení hlavolamu. */
export function features(puzzle, alg) {
  const out = new Map();
  const add = (k) => out.set(k, (out.get(k) ?? 0) + 1);
  if (puzzle.ergonomics === 'sq1') {
    for (const m of parseSq1(alg)) {
      if (m.t === 'slash') add('slash');
      else for (const x of [m.a, m.b]) if (x) add(`turn:${Math.abs(x)}`);
    }
    return out;
  }
  for (const m of puzzle.parseAlg(alg)) {
    if (puzzle.rotations?.includes(m.base)) continue;
    add(`${m.base}:${m.amount === 1 ? 0 : m.amount === -1 ? 1 : 2}`);
  }
  return out;
}

/** Současná váha druhu tahu v nastavení. */
function weightOf(puzzle, config, key) {
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
    if (key === 'slash') next.slash = w;
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
    x: features(puzzle, a.alg),
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
  const weights = new Map(keys.map((key, j) => [key, round(Math.min(6, Math.max(0.2, beta[j] / k)))]));
  const changes = keys.map((key, j) => ({ key, from: w0[j], to: weights.get(key) })).filter((x) => Math.abs(x.to - x.from) >= 0.05);
  return { ok: true, config: withWeights(puzzle, config, weights), changes, used: n, secondsPerUnit: k };
}

/** Čitelný název druhu tahu („R'“, „U2“, „řez“, „otočení o 3“). */
export function featureLabel(key) {
  if (key === 'slash') return 'řez /';
  if (key.startsWith('turn:')) return `otočení o ${key.slice(5)}`;
  const [base, i] = key.split(':');
  return base + ['', "'", '2'][Number(i)];
}
