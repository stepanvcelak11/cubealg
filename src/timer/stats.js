// Statistiky skládání podle pravidel WCA.
//
// Složení: { t: čas v ms (nebo počet tahů u FMC), p: 0 | 2000 (+2) | -1 (DNF), s, d }

export const DNF = Infinity;

/** Výsledná hodnota složení (DNF = Infinity). */
export function value(solve) {
  if (solve.p === -1) return DNF;
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
  if (result === 'moves') {
    if (v === DNF) return 'DNF';
    return Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : '–';
  }
  return formatTime(v);
}

export function formatSolve(solve, result = 'time') {
  if (solve.p === -1) return 'DNF';
  const base = formatValue(solve.t + (solve.p > 0 ? solve.p : 0), result);
  return solve.p > 0 ? `${base}+` : base;
}
