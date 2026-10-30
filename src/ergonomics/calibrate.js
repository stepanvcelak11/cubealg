// Kalibrace vah tahů podle naměřených časů z trenažéru.
//
// Model: čas algoritmu ≈ c + Σ (počet tahů daného druhu × β_tahu)
//                          + Σ (počet přehmatů, změn úchopu, míst se stejným prstem,
//                               dvou tahů jednou rukou a střídání rukou × β).
// Nejdřív se odhadne c a měřítko k (sekund na jednotku váhy) z výchozího
// hodnocení, pak ridge regrese táhne β k k·výchozí váha – málo dat tedy váhy
// skoro nezmění, hodně dat je přizpůsobí tvým rukám. Nová váha = β / k.

import { parseSq1 } from '../puzzles/sq1.js';
import { scoreAlg, fullConfig } from './score.js';
import { mirrorMove } from '../core/notation.js';
import { MOVE_TIME } from './style.js';

// Druhy míst v kostkovém hodnocení (kromě tahů) a jejich nastavení.
const EVENTS = {
  regrip: { get: (c) => c.regripPenalty, set: (c, w) => { c.regripPenalty = w; }, min: 0, max: 8 },
  grip: { get: (c) => c.gripChangePenalty, set: (c, w) => { c.gripChangePenalty = w; }, min: 0, max: 4 },
  'flow:reuse': { get: (c) => c.reuse * c.flowScale, set: (c, w) => { c.reuse = w / c.flowScale; }, min: 0, max: 4, flow: true },
  'flow:sameHand': { get: (c) => c.sameHand * c.flowScale, set: (c, w) => { c.sameHand = w / c.flowScale; }, min: 0, max: 4, flow: true },
  'flow:sliceBottom': { get: (c) => c.sliceBottom * c.flowScale, set: (c, w) => { c.sliceBottom = w / c.flowScale; }, min: 0, max: 4, flow: true },
  // triggery (R U R' U', sledge…): příspěvek = −(součet jejich bonusů) × násobič
  trigger: { get: (c) => c.triggerBonusScale, set: (c, w) => { c.triggerBonusScale = w; }, min: 0, max: 3 },
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
    // triggery: záporný součet bonusů (bez násobiče) – váha je násobič bonusů
    const scale = fullConfig(config).triggerBonusScale;
    const bonus = scale > 0 ? s.triggers.reduce((a, t) => a + t.bonus, 0) / scale : 0;
    if (bonus) out.set('trigger', -Math.round(bonus * 100) / 100);
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
export function calibrate(puzzle, config, items, { lambda = 3, minTimes = MIN_TIMES, minAlgs = MIN_ALGS } = {}) {
  const data = items.filter((a) => a.times.length >= minTimes).map((a) => ({
    y: median(a.times.slice(-12).map((x) => x.t)) / 1000,
    x: features(puzzle, a.alg, config),
  })).filter((d) => d.x.size);
  if (data.length < minAlgs) {
    return { ok: false, reason: `Potřebuju aspoň ${minAlgs} algoritmů tohoto hlavolamu, každý změřený aspoň ${minTimes}×. Teď jich je ${data.length}.` };
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
  regrip: 'přehmat', grip: 'změna úchopu', trigger: 'bonus za triggery (násobek)', 'flow:reuse': 'stejný prst dvakrát',
  'flow:sameHand': 'dva tahy jednou rukou', 'flow:alternate': 'střídání rukou',
  'flow:sliceBottom': 'M ↔ spodní vrstva',
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
 * Doladění vah podle tvých voleb: dvojice algoritmů pro stejný případ – který se ti točí
 * líp (better / worse), nebo „stejně“ (tie). Z porovnání sad tahů (Tahy a váhy →
 * Porovnat algoritmy) i z voleb v generátoru sad.
 *
 * Model (Bradley–Terry): pravděpodobnost, že vybereš A před B, je logistická funkce
 * rozdílu hodnocení, P(A) = 1 / (1 + e^((s_A − s_B) / T)). Hodnocení = dnešní hodnocení
 * + Σ počet druhu tahu × změna jeho váhy (druhy tahů a míst jako u kalibrace podle časů).
 * Hledají se změny vah s největší pravděpodobností tvých odpovědí; „stejně“ táhne rozdíl
 * k nule. Váhy drží u dnešních hodnot (prior), takže málo odpovědí je změní jen trochu
 * a s každou další je odhad přesnější.
 * @param {{better:string, worse:string, tie?:boolean}[]} pairs
 * @returns {{ok:false, reason:string} | {ok:true, config:object, changes:{key:string, from:number, to:number}[], used:number, agree:number, decided:number, before:number}}
 */
export function learnPreferences(puzzle, config, pairs, { iterations = 400, rate = 0.08, prior = 0.6, T = 1, tieWeight = 0.5, perMove = MOVE_TIME, trust = null } = {}) {
  if (puzzle.ergonomics === 'cube') config = { ...fullConfig(config), triggers: config.triggers };
  // hodnota jako v pohledu Nejrychlejší: nepohodlnost + základní čas každého tahu (jinak by
  // ladění zlevnilo běžné tahy a dlouhé algoritmy by vycházely rychlejší, než jsou)
  const scoreOf = (alg) => (puzzle.ergonomics === 'cube' ? scoreAlg(puzzle.id === '333' ? alg : puzzle.algToString(alg), config).total + perMove * alg.split(' ').filter(Boolean).length : 0);
  const data = pairs.map((p) => ({ tie: !!p.tie, b: features(puzzle, p.better, config), w: features(puzzle, p.worse, config), sb: scoreOf(p.better), sw: scoreOf(p.worse) }))
    .filter((d) => d.b.size && d.w.size);
  if (data.length < MIN_PREFS) {
    return { ok: false, reason: `Potřebuju aspoň ${MIN_PREFS} porovnání (Porovnat algoritmy, nebo volby v generátoru sad). Teď jich je ${data.length}.` };
  }
  const keys = [...new Set(data.flatMap((d) => [...d.b.keys(), ...d.w.keys()]))];
  const w0 = keys.map((k) => weightOf(puzzle, config, k));
  // rozdíl better − worse: dnešní hodnocení + počty druhů tahů (změna vah δ)
  const rows = data.map((d) => ({ tie: d.tie, base: d.sb - d.sw, x: keys.map((k) => (d.b.get(k) ?? 0) - (d.w.get(k) ?? 0)) }));
  const delta = keys.map(() => 0);
  // trust = [nejvýš krát dolů, krát nahoru] proti dnešní váze (ladění výchozích vah: jen opatrně)
  const lo = keys.map((k, j) => Math.max(EVENTS[k] ? EVENTS[k].min : 0.2, trust && w0[j] > 0 ? w0[j] * trust[0] : -Infinity));
  const hi = keys.map((k, j) => Math.min(EVENTS[k] ? EVENTS[k].max : 6, trust && w0[j] > 0 ? w0[j] * trust[1] : Infinity));
  const diffOf = (r, dl) => r.base + r.x.reduce((a, v, j) => a + v * dl[j], 0);
  for (let it = 0; it < iterations; it++) {
    const grad = delta.map((v) => 2 * prior * v);
    for (const r of rows) {
      const z = diffOf(r, delta) / T;
      // better má mít nižší hodnocení: ztráta log(1 + e^z); stejně: z²
      const g = r.tie ? tieWeight * 2 * z / T : 1 / (1 + Math.exp(-z)) / T;
      r.x.forEach((v, j) => { if (v) grad[j] += g * v; });
    }
    const step = rate / Math.sqrt(1 + it / 50);
    delta.forEach((v, j) => { delta[j] = Math.min(hi[j] - w0[j], Math.max(lo[j] - w0[j], v - step * grad[j] / Math.max(1, rows.length / 20))); });
  }
  const round = (v) => Math.round(v * 10) / 10;
  const weights = new Map(keys.map((k, j) => [k, round(w0[j] + delta[j])]));
  const changes = keys.map((key, j) => ({ key, from: w0[j], to: weights.get(key) })).filter((x) => Math.abs(x.to - x.from) >= 0.05);
  const next = withWeights(puzzle, config, weights);
  // kolik rozhodnutých voleb hodnocení potvrzuje (před a po)
  const decided = rows.filter((r) => !r.tie);
  const rounded = keys.map((k, j) => weights.get(k) - w0[j]);
  const agree = decided.filter((r) => diffOf(r, rounded) < 0).length;
  const before = decided.filter((r) => r.base < 0).length;
  return { ok: true, config: next, changes, used: data.length, agree, decided: decided.length, before };
}
