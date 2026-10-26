// Kolik případů (= algoritmů k naučení) má krok metody: náhodné stavy kostky, ve kterých
// je hotové všechno před krokem, se sloučí stejně jako při učení algoritmů v testu
// (sim/learn.js): dva stavy jsou jeden případ, když je vyřeší tentýž algoritmus
// s natočením vrstev kroku před ním a po něm (AUF/ADF) a s pomocnými algoritmy.
// Algoritmus nového případu = řešení celé kostky dvoufázovým řešičem (rychlé); stejný
// případ pak pozná jedna permutace (algoritmus s natočením složený do jedné tabulky).
//
// Vzorkuje, dokud se nové případy objevují; když jsou vzácné, dopočítá odhad (Chao1:
// kolik případů ještě nebylo vidět podle toho, kolik jich padlo jen jednou nebo dvakrát).

import { getPuzzle } from '../puzzles/index.js';
import { compileGoal } from '../core/constraints.js';
import { mergeConstraints } from '../core/rules.js';
import { toFacelets, solved as solvedLoc, permutationParity } from '../core/cube.js';
import { SLOTS } from '../core/geometry.js';
import { solve as twoPhase } from '../timer/twophase.js';
import { simplifyGoal } from './stepsolver.js';
import { seededRandom, fixedNeeded } from './simulate.js';

const P = getPuzzle('333');

/** Dosud hotové (před krokem i) a cíl kroku v orientaci v. */
export function stepGoals(plan, i, v = 0) {
  const steps = plan.variants[v].steps;
  let done = {};
  for (let k = 0; k < i; k++) if (!steps[k].fixed) done = mergeConstraints(done, steps[k].parts);
  return { done, goal: mergeConstraints(done, steps[i].parts) };
}

/**
 * Náhodný stav, který splňuje cíl `before` (už zjednodušený: po dílcích + skupinová
 * pravidla „na místě některý ze skupiny, natočený“). null = cíl jde mimo tyto tvary.
 * Rozmístí dílky na místa podle povolených dílků (náhodně, s návratem), natočení náhodná
 * kromě vyžadovaných; součet natočení a parita se dorovnají opakováním.
 */
export function makeSampler(before) {
  const types = ['corner', 'edge'].map((type) => {
    const slots = SLOTS.filter((x) => x.type === type);
    return { type, slots, n: type === 'corner' ? 3 : 2, home: new Map(), oriPiece: new Set(), allow: new Map(), oriSlot: new Set() };
  });
  const byName = new Map(types.flatMap((t) => t.slots.map((x) => [x.name, t])));
  for (const [n, c] of Object.entries(before)) {
    if (n === '#classes') continue;
    const t = byName.get(n);
    if (!t) { if (/^[URFDLB]$/.test(n)) continue; return null; }
    if (typeof c !== 'string') return null;
    if (c === 'solved' || c === 'permutation') t.home.set(n, c);
    if (c === 'solved' || c === 'orientation') t.oriPiece.add(n);
  }
  for (const c of before['#classes'] ?? []) {
    if (!c.stickers.every((st) => st.length === 1 && st[0] === 0) || !c.places.every((pl) => pl.length === 1)) return null;
    for (const [pl] of c.places) {
      const slot = SLOTS.find((x) => x.facelets[0] === pl);
      const t = slot && byName.get(slot.name);
      if (!t) return null;
      const prev = t.allow.get(slot.name);
      t.allow.set(slot.name, prev ? prev.filter((x) => c.pieces.includes(x)) : [...c.pieces]);
      t.oriSlot.add(slot.name);
    }
  }
  return (rand) => {
    for (let attempt = 0; attempt < 300; attempt++) {
      const loc = solvedLoc();
      let ok = true;
      for (const t of types) {
        const where = new Map(); // dílek → místo
        const free = new Set(t.slots.map((x) => x.name));
        for (const [n] of t.home) { where.set(n, n); free.delete(n); }
        let pieces = t.slots.map((x) => x.name).filter((n) => !t.home.has(n));
        // místa s nejméně možnostmi první
        const order = [...free].sort((a, b) => (t.allow.get(a)?.length ?? 99) - (t.allow.get(b)?.length ?? 99) || rand(3) - 1);
        for (const slot of order) {
          const opts = pieces.filter((x) => !t.allow.has(slot) || t.allow.get(slot).includes(x));
          if (!opts.length) { ok = false; break; }
          const pick = opts[rand(opts.length)];
          where.set(pick, slot);
          pieces = pieces.filter((x) => x !== pick);
        }
        if (!ok) break;
        // natočení
        const twist = new Map();
        const loose = [];
        let sum = 0;
        for (const x of t.slots) {
          const at = where.get(x.name);
          const fixedOri = t.oriPiece.has(x.name) || t.oriSlot.has(at);
          const tw = fixedOri ? 0 : rand(t.n);
          if (!fixedOri) loose.push(x.name);
          twist.set(x.name, tw);
          sum += tw;
        }
        if (sum % t.n) {
          if (!loose.length) { ok = false; break; }
          const last = loose[loose.length - 1];
          twist.set(last, (twist.get(last) + t.n - (sum % t.n)) % t.n);
        }
        for (const x of t.slots) {
          const target = SLOTS.find((y) => y.name === where.get(x.name));
          const tw = twist.get(x.name);
          x.facelets.forEach((k, j) => { loc[k] = target.facelets[(j + tw) % t.n]; });
        }
      }
      if (ok && !permutationParity(loc)) return loc;
    }
    return null;
  };
}

/**
 * Odhad počtu případů kroku i.
 * @returns {{cases: number, seen: number, exact: boolean} | null} null = nejde (stav před
 *   krokem nejde popsat po dílcích, např. skupinová pravidla)
 */
export function countCases(plan, i, { samples = 6000, budget = 2500, seed = 11 } = {}) {
  const step = plan.variants[0].steps[i];
  if (!step || step.fixed) return null;
  const { done, goal } = stepGoals(plan, i);
  const sample = makeSampler(simplifyGoal(done));
  if (!sample) return null;
  const doneTest = compileGoal(done).test;
  // krok „jen někdy“ (parita) před krokem: po něm už parita není
  const fixes = plan.variants[0].steps.slice(0, i).map((x) => x.fixed).filter((f) => f && f.when !== 'always');
  const test = compileGoal(goal).test;
  const pre = step.adjust?.pre?.length ? step.adjust.pre : [{ model: '' }];
  const post = step.adjust?.post?.length ? step.adjust.post : [{ model: '' }];
  const helpers = [{ model: '' }, ...(step.adjust?.helpers ?? [])];
  const id = P.solved();
  const perm = (alg) => (alg ? P.applyAlg(id, alg) : id);
  const starts = helpers.flatMap((h) => pre.map((a) => perm([h.model, a.model].filter(Boolean).join(' '))));
  const ends = post.map((b) => perm(b.model));
  const compose = (...ts) => { const out = new Uint8Array(id.length); for (let f = 0; f < id.length; f++) { let x = f; for (const t of ts) x = t[x]; out[f] = x; } return out; };
  const known = []; // { perms: Uint8Array[], n }
  const rand = seededRandom(seed);
  const t0 = Date.now();
  let n = 0, sinceNew = 0;
  for (; n < samples && Date.now() - t0 < budget; n++) {
    const s = sample(rand);
    if (!s) return null;
    if (!doneTest(s) || fixes.some((f) => fixedNeeded(f, s))) continue; // pravidla, která vzorkovač nezná; parita už opravená
    // hotové, nebo stačí natočit vrstvu – žádný algoritmus
    const trivial = test(s) || ends.some((B) => starts.some((A) => { const x = new Uint8Array(s.length); for (let f = 0; f < s.length; f++) x[f] = B[A[s[f]]]; return test(x); }));
    if (!trivial) {
      const hit = known.find((k) => k.perms.some((T) => { const x = new Uint8Array(s.length); for (let f = 0; f < s.length; f++) x[f] = T[s[f]]; return test(x); }));
      if (hit) { hit.n++; sinceNew++; } else {
        let sol = null;
        try { sol = twoPhase(toFacelets(s), { timeLimit: 500 }); } catch { sol = null; }
        if (sol == null) continue;
        const X = perm(sol.trim());
        // případ = tento algoritmus s každým natočením před a po (a pomocným algoritmem)
        known.push({ n: 1, perms: starts.flatMap((A) => ends.map((B) => compose(A, X, B))) });
        sinceNew = 0;
      }
    } else sinceNew++;
    // dost vidět: dlouho nic nového
    if (n > 400 && sinceNew > Math.max(600, n * 0.5)) break;
  }
  const f1 = known.filter((k) => k.n === 1).length, f2 = known.filter((k) => k.n === 2).length;
  const extra = f1 ? (f2 ? (f1 * f1) / (2 * f2) : (f1 * (f1 - 1)) / 2) : 0;
  return { cases: Math.round(known.length + extra), seen: known.length, exact: f1 === 0, samples: n };
}
