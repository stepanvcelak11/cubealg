// Hodnocení vlastních algoritmů (Trenažér → Ohodnotit): u algoritmu, který si skladač
// vymyslel sám, zjistí, jaký případ řeší (PLL, OLL, F2L… a podle sbírky i jméno – T-perm),
// a porovná ho s oblíbenými algoritmy skladačů a jejich alternativami pro stejný případ
// (corpus.js) podle tvých vah: pohled Nejrychlejší = nepohodlnost + čas tahů (style.js).
//
//   známka 0–100 – u známého případu podle toho, o kolik je pomalejší než nejlepší známý
//                  algoritmus (stejně dobrý nebo lepší = 100); u neznámého podle toho,
//                  jak plynulý je na tah ve srovnání se všemi algoritmy sbírky
//   odhad času   – čas provedení při tvém tempu (tahů/s z profilu) – typický algoritmus
//                  sbírky trvá počet tahů / tempo, nepohodlnější déle
//   slabá místa  – tahy s přehmatem, změnou úchopu, rotací nebo špatnou návazností
//   silné stránky – triggery, tahy R/U, žádné rotace a přehmaty

import { CORPUS } from './corpus.js';
import { kindOf, caseKey, withoutRotations, speedOf } from './algdb.js';
import { scoreAlg } from './score.js';
import { styleMetrics } from './style.js';

const norm = (alg) => String(alg).replace(/[’´`]/g, "'").replace(/[()[\]]/g, ' ').trim().split(/\s+/).filter(Boolean)
  .map((t) => t.replace(/^([RLUDFB])w/, (_, b) => b.toLowerCase()).replace(/2'$/, '2')).join(' ');

let known = null;
/** Případy sbírky podle klíče (počítá se jednou). */
function knownCases() {
  if (known) return known;
  known = new Map();
  for (const c of CORPUS) {
    for (const alg of [c.ref, ...c.alts]) {
      try {
        const core = withoutRotations(alg);
        const key = caseKey(core, kindOf(core));
        if (!known.has(key)) known.set(key, { name: c.name, kind: c.kind, ref: c.ref, algs: [] });
        const k = known.get(key);
        if (!k.algs.includes(alg)) k.algs.push(alg);
      } catch { /* nejde přečíst */ }
    }
  }
  return known;
}

/** Známý případ algoritmu ze sbírky: { name, kind, ref, algs } nebo null. */
export function knownCaseOf(alg) {
  try {
    const core = withoutRotations(norm(alg));
    return knownCases().get(caseKey(core, kindOf(core))) ?? null;
  } catch { return null; }
}

/** Hodnota na tah (pohled Nejrychlejší) oblíbených algoritmů sbírky – měřítko pro čas a známku. */
let typical = null;
function typicalPerMove(config) {
  const key = JSON.stringify(config?.moveWeights ?? null) + (config?.leftHanded ? 'L' : '');
  if (typical?.key === key) return typical;
  const per = (alg) => speedOf(alg, config) / alg.split(' ').length;
  const refs = CORPUS.map((c) => per(c.ref));
  const all = CORPUS.flatMap((c) => [c.ref, ...c.alts]).map(per).sort((a, b) => a - b);
  typical = { key, ref: refs.reduce((a, b) => a + b, 0) / refs.length, all };
  return typical;
}

/** Známka slovy. */
export function gradeLabel(g) {
  return g >= 90 ? 'Výborný' : g >= 75 ? 'Dobrý' : g >= 55 ? 'Průměrný' : g >= 35 ? 'Slabší' : 'Nevhodný';
}

const WHY = { regrip: 'přehmat zápěstí', gripChange: 'změna úchopu', rotation: 'otočení kostky' };

/**
 * Ohodnotí jeden algoritmus 3×3.
 * @param {string} text zápis algoritmu (i se závorkami a Rw)
 * @param {{config?: object, tps?: number, times?: number[]}} [opts] váhy, tempo (tahů/s), naměřené časy (ms)
 */
export function reviewAlg(text, { config = {}, tps = 6, times = [] } = {}) {
  const alg = norm(text);
  if (!alg) return { ok: false, alg, reason: 'Prázdný algoritmus.' };
  let score, core, kind, key;
  try {
    score = scoreAlg(alg, config);
    core = withoutRotations(alg);
    kind = kindOf(core);
    key = caseKey(core, kind);
  } catch { return { ok: false, alg, reason: 'Algoritmus nejde přečíst – použij zápis R U R\' U\' (i Rw, M, x y z).' }; }
  if (kind === 'nic') return { ok: false, alg, reason: 'Algoritmus nic nemění – kostka je po něm stejná jako před ním.' };

  const n = alg.split(' ').length;
  const value = speedOf(alg, config);
  const typ = typicalPerMove(config);
  const sm = styleMetrics(score);
  const seconds = (v) => v / typ.ref / tps;

  // srovnání se sbírkou
  const kc = knownCases().get(key) ?? null;
  let compare = null;
  let grade;
  if (kc) {
    const others = kc.algs.filter((a) => norm(a) !== alg).map((a) => ({ alg: a, value: speedOf(a, config), moves: a.split(' ').length, popular: a === kc.ref }));
    const all = [...others, { alg, value, moves: n, mine: true }].sort((a, b) => a.value - b.value);
    const best = others.reduce((b, o) => (!b || o.value < b.value ? o : b), null);
    const ratio = best ? value / best.value : 1;
    grade = Math.round(100 * Math.min(1, 1 / ratio) ** 2);
    compare = {
      name: kc.name, kind: kc.kind, isKnown: kc.algs.some((a) => norm(a) === alg), isPopular: norm(kc.ref) === alg,
      rank: all.findIndex((a) => a.mine) + 1, of: all.length,
      best, ratio,
      // známé algoritmy, které ti podle vah půjdou rychleji (nejvýš 3)
      better: others.filter((o) => o.value < value).sort((a, b) => a.value - b.value).slice(0, 3)
        .map((o) => ({ ...o, saving: seconds(value - o.value) })),
      popular: others.find((o) => o.popular) ?? null,
    };
  } else {
    // bez známého případu: plynulost na tah proti všem algoritmům sbírky
    const per = value / n;
    const below = typ.all.filter((x) => x < per).length;
    grade = Math.round(100 * (1 - below / typ.all.length));
    // dlouhé algoritmy trochu dolů (víc tahů = víc času i na zapamatování)
    if (n > 16) grade = Math.max(0, grade - (n - 16) * 3);
  }

  // slabá místa: nejdražší tahy kvůli přehmatu, úchopu, rotaci nebo návaznosti
  const weak = score.perMove.map((m, i) => {
    const reasons = [];
    for (const k of Object.keys(WHY)) if (m[k] > 0) reasons.push(WHY[k]);
    if (m.flowReason) reasons.push(m.flowReason);
    return { i, move: m.move, cost: m.regrip + m.gripChange + m.rotation + m.flow, reasons, before: i ? score.perMove[i - 1].move : null };
  }).filter((w) => w.reasons.length && w.cost > 0.05).sort((a, b) => b.cost - a.cost).slice(0, 4).sort((a, b) => a.i - b.i);

  const strong = [];
  if (score.triggers.length) strong.push(`triggery: ${[...new Set(score.triggers.map((t) => t.name))].join(', ')}`);
  if (sm.ru != null && sm.ru >= 0.75) strong.push(`${Math.round(sm.ru * 100)} % tahů R/U (rychlé prsty)`);
  if (!sm.rotations) strong.push('bez otočení kostky');
  if (!sm.regrips) strong.push('bez přehmatu zápěstí');

  const measured = times.filter((t) => Number.isFinite(t) && t > 0);
  const tips = [];
  if (sm.rotations) tips.push('Otočení kostky stojí čas – zkus, jestli jde případ vyřešit z jiné strany (y na začátku) nebo s tahy jako d, f.');
  if (sm.regrips) tips.push('Přehmat zápěstí: zkus začít z jinak natočeného zápěstí (R na začátku dopředu i dozadu) nebo nahradit R2 jiným pořadím.');
  if (compare?.better.length) tips.push(`Známý algoritmus ${compare.better[0].alg} ti podle tvých vah půjde asi o ${fmtS(compare.better[0].saving)} rychleji.`);
  if (!compare && n > 14) tips.push('Případ ve sbírce není – v Labu najdeš kratší nebo pohodlnější řešení (Hledání podle pohodlí).');

  return {
    ok: true, alg, kind, key, moves: n, htm: score.metrics?.htm ?? n, stm: score.metrics?.stm ?? null, qtm: score.metrics?.qtm ?? null,
    score, metrics: sm, value, grade, label: gradeLabel(grade),
    time: seconds(value), tps, typicalTime: n / tps,
    measured: measured.length ? { best: Math.min(...measured) / 1000, mean: measured.reduce((a, b) => a + b, 0) / measured.length / 1000, count: measured.length } : null,
    compare, weak, strong, tips,
  };
}

const fmtS = (s) => `${s.toFixed(2).replace('.', ',')} s`;
export { fmtS as formatSeconds, norm as normalizeAlg };
