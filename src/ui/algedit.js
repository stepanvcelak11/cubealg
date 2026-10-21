// Úprava uloženého algoritmu: nový zápis se ověří proti uloženému případu. Když
// algoritmus případ neřeší jen kvůli natočení horní vrstvy na začátku nebo na konci
// (např. smazané úvodní U), případ se posune: výchozí strana o to U, cíl o koncové –
// algoritmus pak začíná z jinak natočené kostky a je kratší.

import { labModel } from './models.js';
import { holdFor } from './holds.js';

const AUF = [null, { base: 'U', amount: 1 }, { base: 'U', amount: -1 }, { base: 'U', amount: 2 }];

/**
 * @param {{alg: string, task: object}} entry uložený algoritmus
 * @param {string} alg nový zápis
 * @returns {{ok: true, task: object, pre: string|null, post: string|null} | {ok: false, reason: string}}
 */
export function retarget(entry, alg) {
  const task = entry.task;
  const model = labModel(task.puzzle ?? '333');
  if (model.kind !== 'perm') return { ok: false, reason: 'Úpravu jde ověřit jen u permutačních hlavolamů.' };
  let steps;
  try { steps = model.steps(alg); } catch { return { ok: false, reason: 'Algoritmus nejde přečíst.' }; }
  const held = task.hold ? holdFor(model, task.hold) : null;
  const toModel = (ms) => (held ? ms.map((m) => held.toModel([m])[0]) : ms);
  const A = model.deserialize(task.colorsA);
  const B = model.deserialize(task.colorsB);
  if (!A || !B) return { ok: false, reason: 'Uložený případ nejde načíst.' };
  const built = model.buildTask(A, B, task.constraints, task.marks);
  if (!built.loc) return { ok: false, reason: 'Uložený případ nejde sestavit.' };
  const goal = model.goal(built.constraints, built.target);
  const hasU = model.P.bases.includes('U');
  const pres = hasU ? AUF : [null];
  for (const pre of pres) {
    for (const post of pres) {
      const seq = [pre, ...steps, post].filter(Boolean);
      let end;
      try { end = model.applySteps(built.loc, toModel(seq)); } catch { return { ok: false, reason: 'Algoritmus nejde provést.' }; }
      if (!goal.test(end)) continue;
      if (!pre && !post) return { ok: true, task, pre: null, post: null };
      // posun případu: výchozí strana o úvodní U, cíl o koncové (opačně)
      const str = (m) => model.stepToString(m);
      const next = { ...task };
      if (pre) next.colorsA = model.serialize(model.applyMoves(A, str(toModel([pre])[0])));
      if (post) {
        const inv = toModel([{ base: 'U', amount: post.amount === 2 ? 2 : -post.amount }])[0];
        next.colorsB = model.serialize(model.applyMoves(B, str(inv)));
        if (task.marks && Object.keys(task.marks).length) {
          // styly nálepek cíle se posunou s nálepkami
          const at = model.applyMoves(Array.from({ length: B.length }, (_, i) => i), str(inv));
          next.marks = Object.fromEntries(at.map((old, pos) => [pos, task.marks[old]]).filter(([, v]) => v));
        }
      }
      // pojistka: posunutý případ musí nový algoritmus opravdu řešit
      const b2 = model.buildTask(model.deserialize(next.colorsA), model.deserialize(next.colorsB), next.constraints, next.marks);
      if (!b2.loc || !model.goal(b2.constraints, b2.target).test(model.applySteps(b2.loc, toModel(steps)))) continue;
      return { ok: true, task: next, pre: pre && str(pre), post: post && str(post) };
    }
  }
  return { ok: false, reason: 'Upravený algoritmus uložený případ neřeší (ani s jiným natočením horní vrstvy).' };
}

/** Algoritmus bez úvodního (first) nebo koncového tahu horní vrstvy, nebo null. */
export function stripU(alg, first) {
  const tokens = alg.trim().split(/\s+/).filter(Boolean);
  const i = first ? 0 : tokens.length - 1;
  if (!/^\(?U[2']?\)?$/.test(tokens[i] ?? '')) return null;
  tokens.splice(i, 1);
  return tokens.join(' ');
}
