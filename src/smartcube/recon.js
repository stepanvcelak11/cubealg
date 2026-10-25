// Tahy z chytré kostky: sloučení čtvrttahů na dvojité, rozbor složení po krocích metody
// a plynulé úseky točení pro ergonomii.
//
// Kostka posílá jen čtvrttahy (U2 = dva tahy U). Dva stejné čtvrttahy rychle po sobě jsou
// dvojitý tah; stejný a opačný rychle po sobě (U U') je cuknutí, které se zruší.

import { applyAlg } from '../core/cube.js';
import { compileGoal } from '../core/constraints.js';
import { mergeConstraints, constraintsKey } from '../core/rules.js';

export const DOUBLE_GAP = 220; // ms – druhý čtvrttah do této doby = jeden dvojitý tah
export const PAUSE = 450;      // ms – delší mezera mezi tahy = pauza (rozpoznání, rozhodování)

/**
 * Sloučí čtvrttahy: [{ move, t }] → [{ move, t, end }] (t = začátek, end = poslední čtvrttah).
 */
export function mergeQuarters(list, gap = DOUBLE_GAP) {
  const out = [];
  for (const x of list) {
    const last = out.at(-1);
    if (last && last.move[0] === x.move[0] && x.t - last.end <= gap) {
      const a = last.move.endsWith("'") ? -1 : last.move.endsWith('2') ? 2 : 1;
      const b = x.move.endsWith("'") ? -1 : 1;
      const sum = (((a + b) % 4) + 4) % 4;
      if (sum === 0) { out.pop(); continue; }
      last.move = last.move[0] + (sum === 2 ? '2' : sum === 3 ? "'" : '');
      last.end = x.t;
      continue;
    }
    out.push({ move: x.move, t: x.t, end: x.t });
  }
  return out;
}

/**
 * Plynulé úseky: tahy bez pauzy delší než `pause` (aspoň `min` tahů) – zápis a čas
 * (od začátku prvního do konce posledního tahu, ms). Pro kalibraci ergonomie.
 */
export function fluentSegments(moves, { pause = PAUSE, min = 4, max = 16 } = {}) {
  const out = [];
  let cur = [];
  const flush = () => {
    for (let i = 0; i + min <= cur.length; i += max) {
      const part = cur.slice(i, i + max);
      if (part.length >= min) out.push({ alg: part.map((x) => x.move).join(' '), ms: Math.max(1, part.at(-1).end - part[0].t) });
    }
    cur = [];
  };
  for (const x of moves) {
    if (cur.length && x.t - cur.at(-1).end > pause) flush();
    cur.push(x);
  }
  flush();
  return out;
}

/**
 * Rozbor složení po krocích metody (stejně jako test metody: cíl kroku = dosud hotové + nové
 * dílky kroku v některé povolené orientaci). Krok je hotový u prvního tahu, po kterém cíl platí.
 * @param {Uint8Array} start zamíchaný stav
 * @param {{move:string, t:number, end:number}[]} moves tahy (sloučené)
 * @param {object} plan plán simulace (sim/plan.js)
 * @param {string[]} titles názvy kroků plánu
 * @returns {{steps: {title, moves, alg, recog, exec, start, end, skipped, fixed}[], total: number, done: boolean}}
 *   recog = pauza před prvním tahem kroku (ms), exec = od prvního do posledního tahu kroku
 */
export function reconstruct(start, moves, plan, titles) {
  const states = [start];
  for (const x of moves) states.push(applyAlg(states.at(-1), x.move));
  const tests = new Map();
  const testOf = (goal) => { const k = constraintsKey(goal); if (!tests.has(k)) tests.set(k, compileGoal(goal).test); return tests.get(k); };
  const variants = plan.variants;
  const steps = [];
  let v = 0, done = {}, at = 0; // at = počet tahů hotových před krokem
  const t0 = moves[0]?.t ?? 0;
  let prevEnd = t0;
  for (let i = 0; i < variants[0].steps.length; i++) {
    const st = variants[v].steps[i];
    if (st.fixed) {
      // krok „jen někdy“ (parita) – spojí se s dalším krokem
      steps.push({ title: titles[i], fixed: true, moves: 0, alg: '', recog: 0, exec: 0, skipped: true });
      continue;
    }
    const options = (variants[v].next?.[i] ?? [v]).map((j) => ({ j, goal: mergeConstraints(done, variants[j].steps[i].parts) }));
    let found = null;
    for (let k = at; k < states.length && !found; k++) {
      const o = options.find((x) => testOf(x.goal)(states[k]));
      if (o) found = { k, o };
    }
    if (!found) {
      steps.push({ title: titles[i], moves: moves.length - at, alg: moves.slice(at).map((x) => x.move).join(' '), recog: 0, exec: 0, unfinished: true });
      return { steps, total: (moves.at(-1)?.end ?? t0) - t0, done: false };
    }
    const own = moves.slice(at, found.k);
    const first = own[0], last = own.at(-1);
    steps.push({
      title: titles[i], moves: own.length, alg: own.map((x) => x.move).join(' '), from: at, to: found.k,
      recog: first ? Math.max(0, first.t - prevEnd) : 0,
      exec: first ? last.end - first.t : 0,
      skipped: !own.length,
    });
    if (last) prevEnd = last.end;
    at = found.k;
    v = found.o.j;
    done = found.o.goal;
  }
  return { steps, total: (moves.at(-1)?.end ?? t0) - t0, done: true };
}

/** Průměr rozborů (stejné kroky): pro každý krok průměrné rozpoznání, provedení a tahy. */
export function averageRecons(recons) {
  const list = recons.filter((r) => r?.done);
  if (!list.length) return null;
  const n = list[0].steps.length;
  const mean = (f) => list.reduce((a, r) => a + f(r), 0) / list.length;
  return {
    count: list.length,
    total: mean((r) => r.total),
    steps: Array.from({ length: n }, (_, i) => ({
      title: list[0].steps[i].title,
      recog: mean((r) => r.steps[i]?.recog ?? 0),
      exec: mean((r) => r.steps[i]?.exec ?? 0),
      moves: mean((r) => r.steps[i]?.moves ?? 0),
      skipped: mean((r) => (r.steps[i]?.skipped ? 1 : 0)),
    })),
  };
}

/** Uložení tahů složení (kompaktně): { m: "R U R' …", t: [ms od začátku…] }. */
export const packMoves = (moves) => ({ m: moves.map((x) => x.move).join(' '), t: moves.map((x) => Math.round(x.t - moves[0].t)), e: moves.map((x) => Math.round(x.end - x.t)) });
export const unpackMoves = (r) => (r?.m ? r.m.split(' ').map((move, i) => ({ move, t: r.t[i], end: r.t[i] + (r.e?.[i] ?? 0) })) : []);
