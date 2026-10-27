// Profil skladače: co člověk umí a jak rychle skládá → vlastní úroveň „Já“ pro test metody.
// Kotva je průměr 3×3 metodou, kterou skládá: model skladače (tempo, rozpoznání, tahy navíc)
// se plynule dopočítá mezi úrovněmi špička / ~10 s / ~20 s (sim/simulate.js LEVELS) a doladí
// tak, aby jeho metoda vyšla přesně na jeho průměr. Tempo algoritmů (z trenažéru nebo
// zadané) a look-ahead pak rozdělí čas mezi provedení a pauzy. Co umí za sady algoritmů, se
// odečte od algoritmů, které by se musel naučit. Čím víc údajů, tím přesnější odhad.

import { LEVELS, stepEstimate } from './simulate.js';
import { REFERENCES } from './references.js';

/** Sady algoritmů, které skladač může umět (kolik případů, jak se pozná krok metody). */
export const KNOWN_SETS = [
  { id: 'oll', label: 'Celé OLL', n: 57, step: /^OLL$/i },
  { id: 'oll2', label: '2-look OLL', n: 10, step: /natočit|2-look|EO nahoře/i },
  { id: 'pll', label: 'Celé PLL', n: 21, step: /^PLL$/i },
  { id: 'pll2', label: '2-look PLL', n: 6, step: /na místa/i },
  { id: 'ocll', label: 'OCLL', n: 7, step: /^OCLL$/i },
  { id: 'epll', label: 'EPLL', n: 4, step: /^EPLL$/i },
  { id: 'coll', label: 'COLL', n: 42, step: /^COLL$/i },
  { id: 'cmll', label: 'CMLL', n: 42, step: /^CMLL|CLL/i },
  { id: 'ollcp', label: 'OLLCP', n: 331, step: /OLLCP/i },
  { id: 'zbll', label: 'ZBLL', n: 493, step: /^ZBLL$/i, partial: true },
  { id: 'zbls', label: 'ZBLS', n: 302, step: /ZBLS/i, partial: true },
  { id: 'vls', label: 'VLS / WV', n: 27, step: /VLS|WV/i, partial: true },
  { id: 'epbl', label: 'EPBL (separační)', n: 24, step: /EPBL/i },
];

/** Metody, kterými může skládat (kotva odhadu je vestavěná metoda stejného jména). */
export const PROFILE_METHODS = { cfop: 'CFOP', roux: 'Roux', zz: 'ZZ', other: 'Jiná / vlastní' };

const LOOK = { 1: 1.3, 2: 1.15, 3: 1, 4: 0.88, 5: 0.75 }; // rozpoznání (pauzy) podle look-aheadu
const LOOK_MOVES = { 1: 0.08, 2: 0.04, 3: 0, 4: -0.03, 5: -0.05 }; // tahy navíc u intuitivních kroků

/** Čas vestavěné metody v modelu skladače L (objekt úrovně, ne její jméno). */
export function refTime(ref, L) {
  const id = '__probe__';
  LEVELS[id] = { human: true, ...L };
  try {
    return ref.steps.reduce((a, st) => a + stepEstimate(st.moves > 0 ? { length: st.moves, source: 'search' } : null, { recog: st.recog ?? 0, kind: st.kind ?? 'intuitive', level: id }).time, 0);
  } finally { delete LEVELS[id]; }
}

const lerp = (a, b, t) => a + (b - a) * t;
const mixLevel = (A, B, t) => ({
  tps: Object.fromEntries(Object.keys(A.tps).map((k) => [k, Math.exp(lerp(Math.log(A.tps[k]), Math.log(B.tps[k]), t))])),
  recog: lerp(A.recog, B.recog, t),
  moves: Object.fromEntries(['alg', 'intuitive', 'blocks'].map((k) => [k, lerp((A.moves ?? PRO_MOVES)[k], (B.moves ?? PRO_MOVES)[k], t)])),
});
// tahy navíc u špičky (výchozí model člověka, simulate.js HUMAN.moves)
const PRO_MOVES = { alg: 1, intuitive: 0.9, blocks: 1.2 };

/**
 * Úroveň „Já“ z profilu. Bez průměru vrátí null (nic se neodhaduje naslepo).
 * @returns {{label, tps, recog, moves, human: true, fromProfile: true, anchor: {method, avg}, accuracy: number}|null}
 */
export function profileLevel(profile = {}, refs = REFERENCES) {
  const avg = Number(profile.avg);
  if (!(avg > 0)) return null;
  const ref = refs.find((r) => r.id === profile.method) ?? refs.find((r) => r.id === 'cfop');
  // úroveň mezi předvolbami podle průměru (logaritmicky), mimo rozsah krajní předvolba
  const presets = ['pro', 'fast', 'club'].map((id) => ({ id, L: { ...LEVELS[id], moves: LEVELS[id].moves ?? PRO_MOVES } }));
  const times = presets.map((p) => refTime(ref, p.L));
  let base;
  if (avg <= times[0]) base = presets[0].L;
  else if (avg >= times[2]) base = presets[2].L;
  else {
    const k = avg <= times[1] ? 0 : 1;
    const t = (Math.log(avg) - Math.log(times[k])) / (Math.log(times[k + 1]) - Math.log(times[k]));
    base = mixLevel(presets[k].L, presets[k + 1].L, t);
  }
  const look = LOOK[profile.lookahead] ?? 1;
  const L = {
    tps: { ...base.tps }, recog: base.recog * look,
    moves: { ...base.moves, intuitive: base.moves.intuitive + (LOOK_MOVES[profile.lookahead] ?? 0), blocks: base.moves.blocks + (LOOK_MOVES[profile.lookahead] ?? 0) },
  };
  const algTps = Number(profile.algTps);
  if (algTps > 0) L.tps.alg = algTps;
  // doladit tempo (u zadaného tempa algoritmů jen intuitivních kroků a bloků), aby metoda
  // skladače vyšla přesně na jeho průměr
  const keys = algTps > 0 ? ['intuitive', 'blocks'] : ['alg', 'intuitive', 'blocks'];
  const scaled = (s) => ({ ...L, tps: { ...L.tps, ...Object.fromEntries(keys.map((k) => [k, L.tps[k] * s])) } });
  let lo = 0.05, hi = 20;
  for (let i = 0; i < 60; i++) { const mid = Math.sqrt(lo * hi); if (refTime(ref, { ...scaled(mid), human: true }) > avg) lo = mid; else hi = mid; }
  const fit = scaled(Math.sqrt(lo * hi));
  return {
    label: `Já – můj profil (${ref.name} ${avg.toFixed(2).replace('.', ',')} s)`,
    ...fit, human: true, fromProfile: true, anchor: { method: ref.id, avg }, accuracy: profileAccuracy(profile),
  };
}

/** Jak přesný je odhad z profilu: 0–1 (vyplněnost) a ± v procentech času. */
export function profileAccuracy(profile = {}) {
  const has = (v) => v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v));
  const parts = [
    [has(profile.avg), 4], [has(profile.method) && profile.method !== 'other', 2], [has(profile.single), 1],
    [has(profile.algTps), 3], [has(profile.lookahead), 2], [has(profile.inspection), 1],
    [Object.values(profile.known ?? {}).some(Boolean), 2], [has(profile.neutral), 1],
    [Object.keys(profile.events ?? {}).length > 0, 1], [has(profile.years) || has(profile.hours), 1],
    [has(profile.solves) && profile.solves >= 100, 2],
  ];
  const total = parts.reduce((a, [, w]) => a + w, 0);
  const got = parts.reduce((a, [ok, w]) => a + (ok ? w : 0), 0);
  const fill = got / total;
  // jen průměr: ± 15 %, všechno vyplněné (a hodně složení): ± 5 %
  return { fill, pct: Math.round(15 - 10 * fill) };
}

/** Kolik algoritmů kroku skladač už umí (podle sad v profilu a názvu kroku). */
export function knownForStep(title, cases, profile = {}) {
  const known = profile.known ?? {};
  let best = 0;
  for (const s of KNOWN_SETS) {
    if (!known[s.id] || !s.step.test(String(title ?? '').trim())) continue;
    const n = s.partial && Number(known[s.id]) > 1 ? Number(known[s.id]) : s.n;
    best = Math.max(best, n);
  }
  // celé OLL a PLL obsahují i menší sady konce s natočenými hranami
  if (/^OCLL$/i.test(title) && known.oll) best = Math.max(best, 7);
  if (/^EPLL$/i.test(title) && known.pll) best = Math.max(best, 4);
  return Math.min(best, Number.isFinite(cases) ? cases : best);
}

/** Souhrn sad, které skladač umí: počet algoritmů celkem. */
export function knownTotal(profile = {}) {
  const known = profile.known ?? {};
  return KNOWN_SETS.reduce((a, s) => a + (known[s.id] ? (s.partial && Number(known[s.id]) > 1 ? Number(known[s.id]) : s.n) : 0), 0) + (Number(profile.otherAlgs) || 0);
}
