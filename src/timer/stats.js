// Statistiky skládání podle pravidel WCA.
//
// Složení: { t: čas v ms (nebo počet tahů u FMC), p: 0 | 2000 (+2) | -1 (DNF), s, d,
//            m?: { solved, attempted } u Multi-Blind, n?: poznámka }

export const DNF = Infinity;

// Multi-Blind: body = vyřešeno − nevyřešeno; víc bodů je lepší, při shodě kratší čas.
// Hodnota (nižší = lepší) se skládá jako (1000 − body) · 1e8 + čas v ms.
const MULTI = 1e8;
export const multiPoints = ({ solved, attempted }) => solved - (attempted - solved);

/** Výsledná hodnota složení (DNF = Infinity). */
export function value(solve) {
  if (solve.p === -1) return DNF;
  if (solve.m) {
    const points = multiPoints(solve.m);
    return points <= 0 ? DNF : (1000 - points) * MULTI + solve.t;
  }
  return solve.t + (solve.p > 0 ? solve.p : 0);
}

/** Kolik nejlepších a nejhorších se škrtá v průměru z n. */
export function trimCount(n) {
  if (n < 5) return 0;
  return n <= 12 ? 1 : Math.ceil(n * 0.05);
}

/**
 * Průměr z hodnot (WCA): mo3 bez škrtání, ao5/ao12 škrtá 1+1, větší 5 %.
 * @param {number[]} values
 * @returns {number} průměr, DNF (Infinity) nebo NaN, když jich je málo
 */
export function averageOf(values, { mean = false } = {}) {
  const n = values.length;
  if (!n) return NaN;
  const trim = mean ? 0 : trimCount(n);
  const sorted = [...values].sort((a, b) => a - b);
  const kept = sorted.slice(trim, n - trim);
  if (kept.some((v) => v === DNF)) return DNF;
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

/** Aktuální průměr z posledních n složení. */
export function currentAverage(solves, n, opts) {
  if (solves.length < n) return NaN;
  return averageOf(solves.slice(-n).map(value), opts);
}

/** Nejlepší průměr z n po sobě jdoucích složení. */
export function bestAverage(solves, n, opts) {
  let best = NaN;
  for (let i = 0; i + n <= solves.length; i++) {
    const a = averageOf(solves.slice(i, i + n).map(value), opts);
    if (!(a >= best)) best = a; // první hodnota i DNF
  }
  return best;
}

export function bestSingle(solves) {
  let best = NaN;
  for (const s of solves) {
    const v = value(s);
    if (!(v >= best)) best = v;
  }
  return best;
}

/** Průměr všech složení bez DNF. */
export function sessionMean(solves) {
  const ok = solves.map(value).filter((v) => v !== DNF);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : NaN;
}

/** Souhrn pro obrazovku statistik. */
export function summary(solves) {
  const avg = (n, opts) => ({ current: currentAverage(solves, n, opts), best: bestAverage(solves, n, opts) });
  return {
    count: solves.length,
    dnf: solves.filter((s) => s.p === -1).length,
    single: { current: solves.length ? value(solves[solves.length - 1]) : NaN, best: bestSingle(solves) },
    mo3: avg(3, { mean: true }),
    ao5: avg(5),
    ao12: avg(12),
    ao50: avg(50),
    ao100: avg(100),
    mean: sessionMean(solves),
  };
}

/** 12.34 / 1:02.35 / DNF / – (čas v ms, zaokrouhleno dolů na setiny). */
export function formatTime(ms) {
  if (ms === DNF) return 'DNF';
  if (!Number.isFinite(ms)) return '–';
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = String(cs % 100).padStart(2, '0');
  return m ? `${m}:${String(s).padStart(2, '0')}.${c}` : `${s}.${c}`;
}

/** Hodnota pro zobrazení podle typu výsledku (čas / tahy). */
export function formatValue(v, result = 'time') {
  if (result === 'multi') {
    if (v === DNF) return 'DNF';
    if (!Number.isFinite(v)) return '–';
    const points = 1000 - Math.floor(v / MULTI);
    return `${points} b. ${formatClock(v % MULTI)}`;
  }
  if (result === 'moves') {
    if (v === DNF) return 'DNF';
    return Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : '–';
  }
  return formatTime(v);
}

/** Čas jako m:ss (Multi-Blind se měří na celé sekundy). */
export function formatClock(ms) {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function formatSolve(solve, result = 'time') {
  if (solve.m) {
    const text = `${solve.m.solved}/${solve.m.attempted} ${formatClock(solve.t)}`;
    return value(solve) === DNF ? `DNF (${text})` : text;
  }
  if (solve.p === -1) return 'DNF';
  const base = formatValue(solve.t + (solve.p > 0 ? solve.p : 0), result);
  return solve.p > 0 ? `${base}+` : base;
}
