// Simulace soutěžního kola podle pravidel WCA: formát podle disciplíny (Ao5, Mo3,
// Bo3), povinná inspekce, volitelný cutoff (např. aspoň jeden ze 2 pokusů pod 20 s,
// jinak kolo končí) a časový limit (pokus nad limit = DNF). Po čtyřech pokusech Ao5
// se ukáže nejlepší a nejhorší možný průměr (BPA/WPA) a čas potřebný na cíl.

import { averageOf, value, DNF } from './stats.js';

const MO3 = new Set(['666', '777']);
const BO3 = new Set(['333bf', '444bf', '555bf']);

/** Formát kola pro disciplínu (null = soutěž se nesimuluje: FMC, multi). */
export function formatOf(event) {
  if (event === '333fm' || event === '333mbf') return null;
  if (MO3.has(event)) return { n: 3, kind: 'mo3', label: 'Mean of 3' };
  if (BO3.has(event)) return { n: 3, kind: 'bo3', label: 'Best of 3' };
  return { n: 5, kind: 'ao5', label: 'Average of 5' };
}

/**
 * Výsledek kola z pokusů (složení {t, p}).
 * @returns {{best: number, average: number, values: number[]}} average NaN, když nejde (bo3, neúplné)
 */
export function roundResult(attempts, fmt) {
  const values = attempts.map(value);
  const best = values.length ? Math.min(...values) : NaN;
  let average = NaN;
  if (fmt.kind !== 'bo3' && values.length === fmt.n) average = averageOf(values, { mean: fmt.kind === 'mo3' });
  return { best, average, values };
}

/** Nejlepší a nejhorší možný průměr Ao5 po čtyřech pokusech. */
export function bpaWpa(attempts) {
  const v = attempts.map(value);
  if (v.length !== 4) return null;
  return { bpa: averageOf([...v, 0]), wpa: averageOf([...v, DNF]) };
}

/**
 * Jaký čas je potřeba v pátém pokusu Ao5 na průměr ≤ target: číslo (ms), 0 = cíl už
 * je jistý, null = cíl už nejde.
 */
export function neededFor(target, attempts) {
  const v = attempts.map(value).sort((a, b) => a - b);
  if (v.length !== 4) return null;
  const { bpa, wpa } = bpaWpa(attempts);
  if (wpa <= target) return 0;
  if (bpa > target) return null;
  // pátý pokus x: průměr = (součet prostředních tří ze všech pěti) / 3
  // když je x mezi v[0] a v[3], zůstane z původních v[1], v[2] a x: x = 3·target − v[1] − v[2]
  const x = 3 * target - v[1] - v[2];
  return Math.max(0, Math.min(x, v[3]));
}

/** Skončilo kolo? (všechny pokusy, nebo nesplněný cutoff) */
export function roundOver(attempts, fmt, cutoff) {
  if (attempts.length >= fmt.n) return true;
  if (cutoff && attempts.length >= cutoff.attempts) {
    return !attempts.slice(0, cutoff.attempts).some((a) => value(a) < cutoff.time);
  }
  return false;
}

/** Pokus nad časový limit je DNF (penalizace −1). */
export const applyLimit = (ms, penalty, limit) => (limit && ms + Math.max(0, penalty) >= limit ? -1 : penalty);
