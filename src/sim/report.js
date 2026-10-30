// Podrobné hodnocení metody z testu (Otestovat → „Jak dobrá je metoda“): ne jen jedno číslo,
// ale srovnání s CFOP, Roux a ZZ ve stejném modelu skladače, čas na různých úrovních,
// rozptyl jednotlivých složení, kde metoda ztrácí čas a kolik by co ušetřilo, a jak přesný
// je odhad (kolik zamíchání by bylo potřeba na přesnější).

import { summarize, stepEstimate, LEVELS, levelHuman } from './simulate.js';
import { REFERENCES } from './references.js';

/** Kolik algoritmů se u vestavěných metod učí (celé OLL + PLL, CMLL, OCLL + PLL). */
export const REF_ALGS = { cfop: 78, roux: 42, zz: 28 };
/** Úrovně, na kterých se metoda ukáže vedle sebe. */
export const REPORT_LEVELS = ['pro', 'fast', 'club'];

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] : NaN);

/** Odhad vestavěné metody stejným modelem skladače: čas, tahy skladače, rozpoznání. */
export function refEstimate(ref, level = 'pro', tps = 4) {
  const pause = levelHuman(level, tps).pause;
  const steps = ref.steps.map((st, i) => stepEstimate(st.moves > 0 ? { length: st.moves, source: 'search' } : null, { tps, recog: st.recog ?? 0, kind: st.kind ?? 'intuitive', level, pause: i ? pause * (1 - (st.skipped ?? 0)) : 0 }));
  return {
    time: steps.reduce((a, x) => a + x.time, 0),
    human: steps.reduce((a, x) => a + x.moves, 0),
    recog: steps.reduce((a, x) => a + x.recog, 0),
    steps: ref.steps.filter((st) => (st.skipped ?? 0) < 0.9).length,
  };
}

/**
 * Hodnocení metody z výsledku testu.
 * @param {{solves: object[], stepCount: number, timing: object, titles: string[], algCount?: number|null, refs?: object[]}} input
 *   timing jako pro summarize (tps, recog, kinds, styles, level); algCount = algoritmů k naučení (když je známý)
 */
export function methodReport({ solves, stepCount, timing, titles, algCount = null, knownAlgs = null, refs = REFERENCES, partial = false }) {
  const level = timing.level ?? 'pro';
  const tps = timing.tps ?? 4;
  const sum = summarize(solves, stepCount, timing);
  if (!sum.count) return null;
  const ref = Object.fromEntries(refs.map((r) => [r.id, { name: r.name, ...refEstimate(r, level, tps), score: r.score, algs: REF_ALGS[r.id] ?? null }]));
  const cfop = ref.cfop;

  // srovnání: každá veličina, tvoje hodnota, vestavěné metody a pořadí (1 = nejlepší)
  const mine = {
    time: sum.time, human: sum.human, recog: sum.steps.reduce((a, x) => a + x.recogTime, 0), score: sum.score,
    steps: sum.steps.filter((x) => x.skipped < 0.9).length, algs: algCount,
  };
  const METRICS = [
    ['time', 'Odhad času složení', 's', 2],
    ['human', 'Tahů skladače', '', 1],
    ['recog', 'Pauzy na rozpoznání', 's', 2],
    ['score', 'Ergonomie (méně = pohodlnější)', '', 0],
    ['steps', 'Kroků (zastavení)', '', 0],
    ['algs', 'Algoritmů k naučení', '', 0],
  ];
  const metrics = METRICS.map(([key, label, unit, digits]) => {
    const others = Object.entries(ref).map(([id, r]) => ({ id, name: r.name, value: r[key] }));
    const values = [mine[key], ...others.map((o) => o.value)].filter(Number.isFinite);
    const rank = Number.isFinite(mine[key]) ? 1 + values.filter((v) => v < mine[key] - 1e-9).length : null;
    return { key, label, unit, digits, mine: mine[key], refs: others, rank, of: values.length };
  });

  // úrovně skladače: tvoje metoda a vestavěné stejným modelem
  const levels = [...REPORT_LEVELS, ...(LEVELS.me?.fromProfile ? ['me'] : [])].map((lv) => {
    const s = lv === level ? sum : summarize(solves, stepCount, { ...timing, level: lv });
    const r = Object.fromEntries(refs.map((x) => [x.id, refEstimate(x, lv, tps).time]));
    return { level: lv, label: LEVELS[lv].label, time: s.time, refs: r, index: Math.round((r.cfop / s.time) * 100) };
  });

  // rozptyl jednotlivých složení
  const times = Object.values(sum.solveTimes).sort((a, b) => a - b);
  const sd = times.length > 1 ? Math.sqrt(times.reduce((a, t) => a + (t - sum.time) ** 2, 0) / (times.length - 1)) : 0;
  const ci = times.length > 1 ? (1.96 * sd) / Math.sqrt(times.length) : Infinity;
  const dist = {
    n: times.length, best: times[0], p10: quantile(times, 0.1), median: quantile(times, 0.5), p90: quantile(times, 0.9), worst: times.at(-1),
    sd, ci,
    // kolik zamíchání by dalo odhad na ±0,05 s
    needFor: sd > 0 ? Math.ceil(((1.96 * sd) / 0.05) ** 2) : times.length,
    beatsCfop: cfop ? times.filter((t) => t < cfop.time).length / times.length : null,
    hist: histogram(times),
  };

  // kde je rezerva: kroky podle času a kolik by co ušetřilo
  const steps = sum.steps.map((s, i) => ({
    i, title: titles[i] ?? `Krok ${i + 1}`, time: s.time, share: s.timeShare, recog: s.recogTime, exec: s.execTime, moves: s.human, tps: s.tps, skipped: s.skipped,
    // −10 % tahů ušetří desetinu provedení; poloviční rozpoznání polovinu pauzy
    saveMoves: s.execTime * 0.1, saveRecog: s.recogTime * 0.5,
  })).filter((s) => s.time > 0.005).sort((a, b) => b.time - a.time);

  // metoda, která nesloží celou kostku, se s CFOP, Roux a ZZ srovnávat nedá
  if (partial) {
    for (const m of metrics) m.rank = null;
    return { sum, level, mine, ref, metrics, levels, dist, steps, partial, index: null,
      verdict: ['Metoda zatím neskládá celou kostku – srovnání s CFOP, Roux a ZZ by nic neříkalo. Níže je rozptyl a kde krok ztrácí čas; po doplnění všech kroků se objeví i index a pořadí.'] };
  }
  const lines = verdict(sum, ref, mine, dist);
  if (Number.isFinite(knownAlgs) && Number.isFinite(algCount) && algCount > 0) lines.splice(2, 0, `Z nich už umíš ${knownAlgs} – nových k naučení ${algCount - knownAlgs}.`);
  // pro tebe: úroveň „Já“ z profilu proti tvému průměru tvojí metodou
  const me = levels.find((l) => l.level === 'me');
  if (me && LEVELS.me.anchor) {
    const d = me.time - LEVELS.me.anchor.avg;
    const name = refs.find((r) => r.id === LEVELS.me.anchor.method)?.name ?? 'tvoje metoda';
    lines.unshift(`Pro tebe (podle profilu): asi ${me.time.toFixed(2).replace('.', ',')} s – proti tvému průměru ${name} ${LEVELS.me.anchor.avg.toFixed(2).replace('.', ',')} s o ${Math.abs(d).toFixed(2).replace('.', ',')} s ${d <= 0 ? 'rychleji' : 'pomaleji'} (± ${LEVELS.me.accuracy?.pct ?? 15} %).`);
  }
  return { sum, level, mine, ref, metrics, levels, dist, steps, partial, index: cfop ? Math.round((cfop.time / sum.time) * 100) : null, verdict: lines };
}

/** Histogram časů po 0,25 s (nejvýš 14 sloupců). */
function histogram(times) {
  if (times.length < 2) return [];
  const lo = Math.floor(times[0] * 4) / 4, hi = times.at(-1);
  const width = Math.max(0.25, Math.ceil(((hi - lo) / 14) * 4) / 4);
  const out = [];
  for (let a = lo; a <= hi + 1e-9; a += width) out.push({ from: a, to: a + width, n: times.filter((t) => t >= a && t < a + width + (a + width > hi ? 1e-9 : 0)).length });
  return out;
}

/** Lidské shrnutí: kde metoda stojí proti vestavěným a v čem je silná a slabá. */
function verdict(sum, ref, mine, dist) {
  const lines = [];
  const list = Object.values(ref).map((r) => ({ name: r.name, time: r.time })).concat([{ name: 'tvoje metoda', time: sum.time, me: true }]).sort((a, b) => a.time - b.time);
  const pos = list.findIndex((x) => x.me) + 1;
  const best = list.find((x) => !x.me);
  const fmt = (v, d = 2) => v.toFixed(d).replace('.', ',');
  if (pos === 1) lines.push(`Nejrychlejší ze všech: o ${fmt(best.time - sum.time)} s před ${best.name}.`);
  else lines.push(`${pos}. ze ${list.length} podle času – o ${fmt(sum.time - list[0].time)} s za nejrychlejší (${list[0].name}).`);
  const cheaper = Object.values(ref).filter((r) => Number.isFinite(mine.algs) && r.algs != null && mine.algs < r.algs).map((r) => r.name);
  const same = Object.values(ref).filter((r) => r.algs != null && mine.algs === r.algs).map((r) => r.name);
  if (Number.isFinite(mine.algs)) {
    lines.push(mine.algs === 0 ? 'Bez algoritmů – všechno intuitivně.'
      : cheaper.length ? `Méně algoritmů k naučení než ${cheaper.join(', ')} (${mine.algs}).`
        : same.length ? `Algoritmů k naučení ${mine.algs} – stejně jako ${same.join(', ')}, víc než ostatní.`
          : `Algoritmů k naučení ${mine.algs} – víc než u vestavěných metod.`);
  }
  const ergo = Object.values(ref).filter((r) => Number.isFinite(r.score) && mine.score < r.score).map((r) => r.name);
  if (Number.isFinite(mine.score)) lines.push(ergo.length ? `Pohodlnější tahy než ${ergo.join(', ')}.` : 'Tahy jsou méně pohodlné než u vestavěných metod (víc přehmatů, B a D tahů nebo otáčení).');
  if (dist.n > 1) lines.push(`Stálost: 9 z 10 složení do ${fmt(dist.p90)} s, rozptyl ± ${fmt(dist.sd)} s.`);
  return lines;
}
