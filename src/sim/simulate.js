// Simulátor metody: náhodná zamíchání (náhodný stav 3×3) se složí krok po kroku
// podle metody – po kroku i musí být hotové dílky kroků 0…i (goals). Každý krok
// řeší buď algoritmus z tvé sady (když nějaký případ vyřeší, i s natočením vrstev
// a pomocným algoritmem jako oprava parity), nebo hledání. Ze všech složení pak
// vyjde průměrný počet tahů, náročnost a odhad času celé metody i jednotlivých
// kroků – a který krok nejvíc zdržuje.
//
// Logika je oddělená od UI (ui/simulator.js), aby šla spustit i v Node (testy,
// bench/method.mjs).

import { compileGoal } from '../core/constraints.js';
import { applyAlg } from '../core/cube.js';
import { practiceState } from '../timer/practice.js';

/** Počet tahů zápisu (každý token je tah, natočení vrstev i rotace se počítají). */
export const lengthOf = (alg) => (alg ? alg.trim().split(/\s+/).filter(Boolean).length : 0);

/** Opakovatelná náhoda ze semínka (stejná zamíchání pro férové porovnání metod). */
export function seededRandom(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return (n) => {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s % n;
  };
}

const NONE = [{ model: '', display: '' }];

/**
 * Algoritmus ze sady, který krok vyřeší – případně s natočením vrstev před a po
 * (AUF/ADF) a s pomocným algoritmem před ním (např. oprava parity M2 U2 M2).
 * @param {Uint8Array} state stav kostky
 * @param {(loc: Uint8Array) => boolean} test cíl kroku
 * @param {{model: string, display: string, score: number, time?: number, name?: string}[]} candidates
 *   algoritmy ze sady (model = zápis v tazích modelu, display = jak ho děláš, time = ms z trenažéru)
 * @param {{pre?: object[], post?: object[], helpers?: object[]}} [adjust] natočení před/po
 *   a pomocné algoritmy ({model, display}; prázdný zápis = bez natočení)
 * @returns nejlepší (podle času z trenažéru, jinak náročnosti a počtu tahů navíc) nebo null
 */
export function pickFromSet(state, test, candidates, adjust = {}) {
  const pre = adjust.pre?.length ? adjust.pre : NONE;
  const post = adjust.post?.length ? adjust.post : NONE;
  const helpers = [...NONE, ...(adjust.helpers ?? [])];
  // výchozí body: pomocný algoritmus × natočení před (spočtené jednou)
  const starts = [];
  for (const h of helpers) for (const p of pre) {
    const model = [h.model, p.model].filter(Boolean).join(' ');
    try { starts.push({ model, display: [h.display, p.display].filter(Boolean).join(' '), helper: h.display || null, state: model ? applyAlg(state, model) : state }); } catch { /* jiný zápis */ }
  }
  let best = null;
  const key = (c) => [c.time ?? Infinity, c.score + c.extra * 0.75];
  const better = (a, b) => { const x = key(a), y = key(b); return x[0] !== y[0] ? x[0] < y[0] : x[1] < y[1]; };
  for (const c of candidates) {
    let found = null;
    for (const s of starts) {
      let after;
      try { after = applyAlg(s.state, c.model); } catch { break; }
      for (const q of post) {
        const end = q.model ? applyAlg(after, q.model) : after;
        if (!test(end)) continue;
        const extra = lengthOf(s.display) + lengthOf(q.display);
        if (!found || extra < found.extra) {
          found = {
            model: [s.model, c.model, q.model].filter(Boolean).join(' '),
            display: [s.display, c.display, q.display].filter(Boolean).join(' '),
            score: c.score, time: c.time, name: c.name, helper: s.helper, extra, source: 'set',
          };
        }
        break;
      }
      if (found && found.extra === 0) break;
    }
    if (found && (!best || better(found, best))) best = found;
  }
  return best;
}

/**
 * Spustí simulaci.
 * @param {object} p
 * @param {number} [p.count] počet zamíchání (náhodných)
 * @param {Uint8Array[]} [p.starts] nebo daná zamíchání (stavy)
 * @param {{goals: Record<string,string>[], label?: string}[]} p.variants orientace metody (barevná
 *   neutralita): pro každou cíle po krocích; první krok se zkusí v každé a vybere se nejlepší
 * @param {(i: number, state: Uint8Array, test: Function, variant: number) => Promise<object|null>} p.solveStep
 *   řešení kroku: { model, display, score, source: 'set'|'search'|'missing', name?, time? } nebo null
 * @param {(a: object, b: object) => boolean} [p.better] porovnání řešení prvního kroku (výchozí: méně tahů)
 * @param {(n: number) => number} [p.rand] náhoda (randomInt / seededRandom)
 * @param {(info: {solve: number, step: number, solves: object[]}) => void} [p.onProgress]
 * @param {() => boolean} [p.stopped]
 */
export async function simulate({ count, starts, variants, goals, solveStep, better, rand, onProgress, stopped = () => false }) {
  variants ??= [{ goals }];
  const tests = variants.map((v) => v.goals.map((g) => compileGoal(g).test));
  const steps = variants[0].goals.length;
  better ??= (a, b) => a.length < b.length || (a.length === b.length && a.score < b.score);
  const solves = [];
  count = starts?.length ?? count;
  for (let k = 0; k < count && !stopped(); k++) {
    let state = starts ? starts[k] : practiceState({}, rand);
    const start = state;
    const out = [];
    let ok = true;
    let v = 0;
    for (let i = 0; i < steps && !stopped(); i++) {
      onProgress?.({ solve: k, step: i, solves });
      let r = null;
      if (i === 0 && variants.length > 1) {
        // orientace: první krok ve všech, vyhraje nejlepší (už složená = 0 tahů)
        const already = tests.findIndex((t) => t[0](state));
        if (already >= 0) { v = already; r = { model: '', display: '', length: 0, score: 0, source: 'skip' }; }
        else {
          for (let j = 0; j < variants.length && !stopped(); j++) {
            const x = await solveStep(0, state, tests[j][0], j);
            if (!x || x.source === 'missing' || !tests[j][0](applyAlg(state, x.model))) continue;
            const y = { ...x, length: lengthOf(x.display) };
            if (!r || better(y, r)) { r = y; v = j; }
          }
        }
      } else if (tests[v][i](state)) r = { model: '', display: '', length: 0, score: 0, source: 'skip' };
      else {
        const x = await solveStep(i, state, tests[v][i], v);
        if (x) r = { ...x, length: lengthOf(x.display) };
      }
      if (stopped()) break;
      if (!r) { ok = false; out.push({ model: '', display: '', length: 0, score: 0, source: 'none' }); break; }
      if (r.source === 'missing') { ok = false; out.push(r); break; }
      const after = r.model ? applyAlg(state, r.model) : state;
      if (!tests[v][i](after)) { ok = false; out.push({ ...r, source: 'none' }); break; }
      state = after;
      out.push(r);
    }
    if (stopped() && out.length < steps && ok) break;
    solves.push({ start, steps: out, ok, variant: v });
  }
  onProgress?.({ solve: solves.length, step: steps, solves });
  return { solves };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)) : 0; };
const quantile = (xs, q) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/**
 * Odhad času kroku: rozpoznání + provedení (čas z trenažéru, jinak tahy / TPS).
 * Přeskočený krok nestojí nic.
 */
export function stepTime(item, { tps = 4, recog = 0 } = {}) {
  if (!item || item.source === 'skip') return 0;
  const exec = Number.isFinite(item.time) ? item.time / 1000 + (item.extra ?? 0) / tps : item.length / tps;
  return recog + exec;
}

/**
 * Souhrn: pro každý krok tahy (průměr, medián, 90 % případů, max), náročnost, odhad
 * času a podíl na celku, jak často se krok přeskočil, kolikrát pomohla tvoje sada
 * a kolik případů v ní chybělo; celkový průměr s rozptylem a intervalem spolehlivosti,
 * odhad času složení, rozložení a které orientace se volily.
 * @param {{tps?: number, recog?: number[]}} [timing]
 */
export function summarize(solves, stepCount, timing = {}) {
  const done = solves.filter((s) => s.ok);
  const tps = timing.tps ?? 4;
  const times = done.map((s) => s.steps.map((x, i) => stepTime(x, { tps, recog: timing.recog?.[i] ?? 0 })));
  const steps = Array.from({ length: stepCount }, (_, i) => {
    const items = done.map((s) => s.steps[i]).filter(Boolean);
    const lens = items.map((x) => x.length);
    const by = (src) => items.filter((x) => x.source === src).length;
    const needed = items.filter((x) => x.source !== 'skip').length;
    return {
      moves: mean(lens), median: quantile(lens, 0.5), p90: quantile(lens, 0.9), max: Math.max(0, ...lens),
      score: mean(items.map((x) => x.score)),
      time: mean(times.map((t) => t[i] ?? 0)),
      skipped: items.length ? by('skip') / items.length : 0,
      fromSet: by('set'), searched: by('search'), helper: items.filter((x) => x.helper).length,
      needed,
      // případy, na které sada neměla algoritmus (běh „jen sada“ na nich skončil)
      missing: solves.filter((s) => s.steps[i]?.source === 'missing').length,
      failed: solves.filter((s) => s.steps.length === i + 1 && !s.ok && s.steps[i]?.source === 'none').length,
    };
  });
  const totals = done.map((s) => s.steps.reduce((a, x) => a + x.length, 0));
  const scores = done.map((s) => s.steps.reduce((a, x) => a + x.score, 0));
  const secs = times.map((t) => t.reduce((a, b) => a + b, 0));
  const total = mean(totals);
  const totalTime = mean(secs);
  for (const st of steps) { st.share = total ? st.moves / total : 0; st.timeShare = totalTime ? st.time / totalTime : 0; }
  const argmax = (f) => steps.reduce((w, st, i) => (f(st) > f(steps[w]) ? i : w), 0);
  const lo = Math.min(...totals), hi = Math.max(...totals);
  const width = Math.max(1, Math.ceil((hi - lo + 1) / 12));
  const hist = [];
  if (totals.length) for (let a = lo; a <= hi; a += width) hist.push({ from: a, to: a + width - 1, n: totals.filter((t) => t >= a && t < a + width).length });
  const variants = {};
  for (const s of done) variants[s.variant ?? 0] = (variants[s.variant ?? 0] ?? 0) + 1;
  const movesSd = sd(totals);
  return {
    count: done.length, failed: solves.length - done.length,
    moves: total, movesSd, ci: done.length > 1 ? (1.96 * movesSd) / Math.sqrt(done.length) : 0,
    median: quantile(totals, 0.5),
    score: mean(scores), time: totalTime, timeSd: sd(secs),
    min: totals.length ? lo : 0, max: totals.length ? hi : 0,
    steps, worst: argmax((st) => st.moves), slowest: argmax((st) => st.time), hist, variants,
  };
}
