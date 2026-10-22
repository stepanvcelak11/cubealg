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
import { mergeConstraints, constraintsKey } from './../core/rules.js';

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

const merge = mergeConstraints;
const keyOf = constraintsKey;

/**
 * Spustí simulaci.
 * @param {object} p
 * @param {number} [p.count] počet zamíchání (náhodných)
 * @param {Uint8Array[]} [p.starts] nebo daná zamíchání (stavy)
 * @param {object[]} p.variants orientace metody (viz plan.js): { steps: [{ parts }], next: [[indexy]],
 *   rotation: [zápis otočení] } – krok i se zkusí ve všech orientacích next[i] (volnost kroku), vyhraje
 *   nejlepší a další kroky pokračují v ní; cíl = dosud hotové dílky + nové dílky kroku v té orientaci.
 *   Postaru { goals: [cíl po krocích] }: první krok ve všech orientacích, pak pevně.
 * @param {(i: number, state: Uint8Array, test: Function, variant: number, goal: object) => Promise<object|null>} p.solveStep
 *   řešení kroku: { model, display, score, source: 'set'|'search'|'missing', name?, time? } nebo null
 * @param {(a: object, b: object, step: number) => boolean} [p.better] porovnání řešení kroku (výchozí: méně tahů)
 * @param {boolean} [p.countRotation] otočení kostky do jiné orientace se počítá jako tah
 * @param {(n: number) => number} [p.rand] náhoda (randomInt / seededRandom)
 * @param {(info: {solve: number, step: number, solves: object[]}) => void} [p.onProgress]
 * @param {() => boolean} [p.stopped]
 */
export async function simulate({ count, starts, variants, goals, solveStep, better, countRotation = false, rand, onProgress, stopped = () => false }) {
  variants ??= [{ goals }];
  const dynamic = !!variants[0].steps?.[0]?.parts;
  const steps = dynamic ? variants[0].steps.length : variants[0].goals.length;
  const compiled = new Map();
  const testOf = (goal, key = keyOf(goal)) => { if (!compiled.has(key)) compiled.set(key, compileGoal(goal).test); return compiled.get(key); };
  /** Možnosti kroku i z orientace v při hotových dílcích done: [{ j, goal, key }] (různé cíle). */
  const options = (i, v, done) => {
    if (!dynamic) return (i === 0 ? variants.map((_, j) => j) : [v]).map((j) => ({ j, goal: variants[j].goals[i] }));
    const out = [], seen = new Set([keyOf(done)]);
    for (const j of variants[v].next?.[i] ?? [v]) {
      const goal = merge(done, variants[j].steps[i].parts);
      const key = keyOf(goal);
      // stejné místo jako jiná možnost, nebo nic nového (dílky na už hotových místech)
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ j, goal, key });
    }
    if (!out.length) { const goal = merge(done, variants[v].steps[i].parts); out.push({ j: v, goal, key: keyOf(goal) }); }
    return out;
  };
  better ??= (a, b) => a.length < b.length || (a.length === b.length && a.score < b.score);
  const solves = [];
  count = starts?.length ?? count;
  for (let k = 0; k < count && !stopped(); k++) {
    let state = starts ? starts[k] : practiceState({}, rand);
    const start = state;
    const out = [];
    let ok = true;
    let v = 0, first = 0;
    let done = {};
    for (let i = 0; i < steps && !stopped(); i++) {
      onProgress?.({ solve: k, step: i, solves });
      const opts = options(i, v, done);
      let r = null, pick = opts[0];
      // už složené (v kterékoli povolené orientaci) = přeskočeno
      const already = opts.find((o) => testOf(o.goal, o.key)(state));
      if (already) { pick = already; r = { model: '', display: '', length: 0, score: 0, source: 'skip' }; }
      else {
        for (const o of opts) {
          if (stopped()) break;
          const test = testOf(o.goal, o.key);
          const x = await solveStep(i, state, test, o.j, o.goal);
          if (!x) continue;
          if (x.source === 'missing') { if (!r) { r = x; pick = o; } continue; }
          if (!test(applyAlg(state, x.model))) continue;
          const turn = o.j !== v ? (variants[v].rotation?.[o.j] ?? '') : '';
          const y = { ...x, length: lengthOf(x.display) + (countRotation ? lengthOf(turn) : 0), rotation: turn || undefined };
          if (!r || r.source === 'missing' || better(y, r, i)) { r = y; pick = o; }
        }
      }
      if (stopped()) break;
      if (!r) { ok = false; out.push({ model: '', display: '', length: 0, score: 0, source: 'none' }); break; }
      if (r.source === 'missing') { ok = false; out.push(r); break; }
      const after = r.model ? applyAlg(state, r.model) : state;
      if (!testOf(pick.goal)(after)) { ok = false; out.push({ ...r, source: 'none' }); break; }
      state = after;
      v = pick.j;
      done = pick.goal;
      if (i === 0) first = v;
      out.push({ ...r, variant: v });
    }
    if (stopped() && out.length < steps && ok) break;
    solves.push({ start, steps: out, ok, variant: first });
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
 * Model člověka pro odhad času (simulace najde u každého kroku skoro nejlepší řešení,
 * člověk ne). Intuitivní kroky (kříž, páry, bloky – tahy se vymýšlejí za běhu) stojí
 * člověka víc tahů než hledání a jdou pomaleji (dívá se dopředu); naučené algoritmy
 * mají tahy jako v simulaci a jdou plnou rychlostí. Koeficienty jsou nastavené tak,
 * aby vestavěné CFOP, Roux a ZZ vyšly v tazích jako u skutečných skladačů
 * (bench/references.mjs, src/sim/references.js).
 */
export const HUMAN = { intuitiveMoves: 1.15, intuitiveTps: 0.8 };

/** Kolik tahů na krok udělá člověk (intuitivní krok × koeficient). */
export const humanMoves = (moves, kind) => (kind === 'intuitive' ? moves * HUMAN.intuitiveMoves : moves);

/**
 * Odhad času kroku: rozpoznání + provedení (čas z trenažéru, jinak tahy člověka / TPS,
 * u intuitivních kroků pomaleji). Přeskočený krok nestojí nic.
 */
export function stepTime(item, { tps = 4, recog = 0, kind = 'alg' } = {}) {
  if (!item || item.source === 'skip') return 0;
  if (Number.isFinite(item.time)) return recog + item.time / 1000 + (item.extra ?? 0) / tps;
  return recog + humanMoves(item.length, kind) / (kind === 'intuitive' ? tps * HUMAN.intuitiveTps : tps);
}

/**
 * Souhrn: pro každý krok tahy (průměr, medián, 90 % případů, max), náročnost, odhad
 * času a podíl na celku, jak často se krok přeskočil, kolikrát pomohla tvoje sada
 * a kolik případů v ní chybělo; celkový průměr s rozptylem a intervalem spolehlivosti,
 * odhad času složení, rozložení a které orientace se volily.
 * @param {{tps?: number, recog?: number[], kinds?: string[]}} [timing]
 */
export function summarize(solves, stepCount, timing = {}) {
  const done = solves.filter((s) => s.ok);
  const tps = timing.tps ?? 4;
  const times = done.map((s) => s.steps.map((x, i) => stepTime(x, { tps, recog: timing.recog?.[i] ?? 0, kind: timing.kinds?.[i] })));
  const steps = Array.from({ length: stepCount }, (_, i) => {
    const items = done.map((s) => s.steps[i]).filter(Boolean);
    const lens = items.map((x) => x.length);
    const by = (src) => items.filter((x) => x.source === src).length;
    const needed = items.filter((x) => x.source !== 'skip').length;
    return {
      moves: mean(lens), human: humanMoves(mean(lens), timing.kinds?.[i]), median: quantile(lens, 0.5), p90: quantile(lens, 0.9), max: Math.max(0, ...lens),
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
    moves: total, human: steps.reduce((a, st) => a + st.human, 0), movesSd, ci: done.length > 1 ? (1.96 * movesSd) / Math.sqrt(done.length) : 0,
    median: quantile(totals, 0.5),
    score: mean(scores), time: totalTime, timeSd: sd(secs),
    min: totals.length ? lo : 0, max: totals.length ? hi : 0,
    steps, worst: argmax((st) => st.moves), slowest: argmax((st) => st.time), hist, variants,
  };
}
