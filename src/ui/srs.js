// Plánování opakování v trenažéru. Čas se měří počtem pokusů (ne dny), takže
// to funguje i při jedné krátké tréninkové sezení: špatně zvládnutý případ
// se vrací za pár pokusů, dobře zvládnutý čím dál vzácněji.

const RECENT = 10;       // kolik posledních časů určuje „obvyklý“ čas případu
const TOLERANCE = 1.15;  // pomalejší než obvyklý čas × 1,15 = špatný pokus
const MAX_INTERVAL = 80;

export function median(xs) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const times = (a) => a.times.map((x) => x.t);

/** Obvyklý čas případu (medián posledních pokusů), jinak NaN. */
export function typical(a) {
  const ts = times(a).slice(-RECENT);
  return ts.length >= 3 ? median(ts) : NaN;
}

/** Referenční čas pro hodnocení pokusu: vlastní obvyklý čas, jinak medián sady. */
export function reference(a, pool) {
  const own = typical(a);
  if (Number.isFinite(own)) return own;
  const others = pool.filter((x) => x !== a).map((x) => median(times(x))).filter(Number.isFinite);
  return others.length ? median(others) * 1.5 : NaN;
}

/** Dobrý pokus = ne výrazně pomalejší než reference (bez reference vždy dobrý). */
export function isGood(t, ref) {
  return !Number.isFinite(ref) || t <= ref * TOLERANCE;
}

/** Nový stav plánu po pokusu číslo `n`. */
export function schedule(sr, good, n) {
  const streak = good ? (sr?.streak ?? 0) + 1 : 0;
  const interval = !good ? 2 : streak === 1 ? 3 : Math.min(MAX_INTERVAL, Math.round((sr?.interval ?? 3) * 2));
  return { streak, interval, due: n + interval };
}

/** 'new' | 'weak' | 'learning' | 'good' */
export function mastery(a) {
  if (!a.times.length) return 'new';
  const streak = a.sr?.streak ?? 0;
  return streak === 0 ? 'weak' : streak >= 3 ? 'good' : 'learning';
}

/**
 * Vybere další případ. Na řadě jsou ty, jejichž termín nastal; z nich se losuje
 * s váhou podle zpoždění a pomalosti. Když nic na řadě není, vezme se ten
 * s nejbližším termínem.
 * @param {object[]} pool zapnuté algoritmy
 * @param {number} n počet dosavadních pokusů
 * @param {(n:number)=>number} rand celé číslo 0 … n-1
 * @param {string|null} exceptId právě trénovaný (nevybírá se znovu)
 */
export function pickNext(pool, n, rand, exceptId = null) {
  const cand = pool.length > 1 ? pool.filter((a) => a.id !== exceptId) : pool;
  if (!cand.length) return null;
  const means = cand.map((a) => median(times(a))).filter(Number.isFinite);
  const avg = means.length ? means.reduce((s, m) => s + m, 0) / means.length : 1;
  const dueOf = (a) => a.sr?.due ?? 0;
  const due = cand.filter((a) => dueOf(a) <= n);
  if (!due.length) return cand.reduce((b, a) => (dueOf(a) < dueOf(b) ? a : b)).id;
  const weights = due.map((a) => {
    const m = median(times(a));
    const slow = Number.isFinite(m) ? Math.min(2, Math.max(0.5, m / avg)) : 1.5;
    const late = a.times.length ? Math.min(20, n - dueOf(a)) : 3;
    return slow * (1 + late);
  });
  let r = (rand(1e6) / 1e6) * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < due.length; i++) {
    r -= weights[i];
    if (r <= 0) return due[i].id;
  }
  return due.at(-1).id;
}

/** Pořadí v seznamu: podle názvu (výchozí), nejpomalejší, nejméně trénované, nejslabší. */
export const SORTS = {
  order: { label: 'Pořadí', cmp: () => 0 },
  slowest: { label: 'Nejpomalejší', cmp: (a, b) => (median(times(b)) || -1) - (median(times(a)) || -1) },
  least: { label: 'Nejméně trénované', cmp: (a, b) => a.times.length - b.times.length },
  weakest: {
    label: 'Nejslabší',
    cmp: (a, b) => rank(a) - rank(b) || (median(times(b)) || 0) - (median(times(a)) || 0),
  },
};
const RANK = { weak: 0, new: 1, learning: 2, good: 3 };
const rank = (a) => RANK[mastery(a)];
