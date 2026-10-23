// Algoritmy kroku z testu po případech: řešení, která test u kroku najde hledáním,
// se slučují podle toho, co řeší – ne podle zápisu. Nové řešení je nový případ,
// jen když ho žádný už známý algoritmus kroku nevyřeší (i s natočením vrstev před
// a po, AUF/ADF). Tak z OLL vyjde nejvýš 57 algoritmů, ne stovky variant téhož
// případu otočeného o U nebo D. Natočení vrstvy na začátku a na konci nalezeného
// řešení se odřízne (to dělá natočení vrstev kroku), algoritmus je pak „čistý“.
//
// Používá ho simulátor (ui/simulator.js) na hlavním vlákně: nový případ pošle všem
// workerům, takže další zamíchání už krok skládají tímto algoritmem (jako člověk,
// který se ho naučil) a hledá se jen u případů, které ještě nikdo nepotkal.

import { getPuzzle } from '../puzzles/index.js';
import { holdOf } from '../core/hold.js';
import { compileGoal } from '../core/constraints.js';
import { constraintsKey } from '../core/rules.js';
import { colorsOfState } from '../core/cases.js';
import { pickFromSet } from './simulate.js';

const P = getPuzzle('333');
const ALL = Object.fromEntries(P.slots.map((s) => [s.name, 'solved']));
const colors = (loc) => colorsOfState(P, loc, ALL).join('');

/** Kandidát sady kroku pro orientaci v (zápis vůči ní, stejně jako buildPlan). */
export const candidateIn = (plan, v, c) => ({ ...c, model: holdOf(plan.variants[v].hold ?? '').toModelString(c.display) });

/** Vrstvy, které krok natáčí (z natočení před algoritmem, zápis v držení). */
function adjustFaces(adjust) {
  return new Set((adjust?.pre ?? []).flatMap((a) => a.display.split(' ').filter(Boolean).map((t) => t[0])));
}

/**
 * Sběr případů kroků.
 * @param {object} plan plán simulace (plan.js)
 * @returns {{ seed, offer, list }}
 */
export function makeLearner(plan) {
  const known = new Map(); // krok → [{ display, score, n, a?, b?, hold?, fresh? }]
  const tests = new Map();
  const testOf = (goal) => {
    const key = constraintsKey(goal);
    if (!tests.has(key)) tests.set(key, compileGoal(goal).test);
    return tests.get(key);
  };
  const of = (i) => { if (!known.has(i)) known.set(i, []); return known.get(i); };

  /** Algoritmus, který krok už má (ze sady) – nalezená řešení stejného případu se nepřidají. */
  function seed(i, list) {
    const have = of(i);
    for (const c of list) if (!have.some((x) => x.display === c.display)) have.push({ display: c.display, score: c.score ?? 0, n: 0 });
  }

  /**
   * Nalezené řešení kroku i: { display, model, state (Uint8Array), goal, variant, score }.
   * @returns {{ entry: object, fresh: boolean }} fresh = nový případ (entry = nový algoritmus),
   *   jinak entry = algoritmus, který ho už řeší
   */
  function offer(i, { display, model, state, goal, variant = 0, score = 0 }) {
    const step = plan.variants[variant].steps[i];
    const test = testOf(goal);
    const have = of(i);
    const cands = have.map((x, k) => ({ ...candidateIn(plan, variant, x), name: k }));
    const hit = cands.length ? pickFromSet(state, test, cands, step.adjust) : null;
    if (hit) {
      const entry = have[hit.name];
      entry.n++;
      return { entry, fresh: false };
    }
    // natočení vrstvy na začátku a na konci odříznout (udělá ho natočení vrstev kroku)
    const shown = display.split(' ').filter(Boolean), moves = model.split(' ').filter(Boolean);
    const faces = adjustFaces(step.adjust);
    let from = 0, to = shown.length;
    if (shown.length === moves.length) {
      while (from < to - 1 && faces.has(shown[from][0])) from++;
      while (to - 1 > from && faces.has(shown[to - 1][0])) to--;
    }
    let core = { display: shown.slice(from, to).join(' '), model: moves.slice(from, to).join(' ') };
    let at = from ? P.applyAlg(state, moves.slice(0, from).join(' ')) : state;
    // zkrácený algoritmus musí případ pořád vyřešit (s natočením vrstev kroku)
    if (from || to < shown.length) {
      const ok = pickFromSet(state, test, [{ ...core, score }], step.adjust);
      if (!ok) { core = { display, model }; at = state; }
    }
    const entry = {
      display: core.display, score, n: 1, fresh: true,
      a: colors(at), b: colors(P.applyAlg(at, core.model)), hold: plan.variants[variant].hold ?? '',
    };
    have.push(entry);
    return { entry, fresh: true };
  }

  /** Nové algoritmy kroku i (nalezené v tomto testu), nejčastější první. */
  const list = (i) => of(i).filter((x) => x.fresh).sort((a, b) => b.n - a.n);
  return { seed, offer, list, count: (i) => of(i).filter((x) => x.fresh).length };
}
