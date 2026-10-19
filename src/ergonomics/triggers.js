// Plynulé finger-tricky („triggery“), které ergonomická funkce odměňuje.
// Zrcadlové verze pro levou ruku se doplňují automaticky.

import { parseAlg, mirrorAlg, algToString } from '../core/notation.js';

export const DEFAULT_TRIGGERS = [
  { name: 'Sexy move', alg: "R U R' U'", bonus: 1.2 },
  { name: 'Anti-sexy', alg: "U R U' R'", bonus: 0.9 },
  { name: 'Sledgehammer', alg: "R' F R F'", bonus: 0.8 },
  { name: 'Hedgeslammer', alg: "F R' F' R", bonus: 0.6 },
  { name: 'Wide sexy', alg: "r U R' U'", bonus: 1.0 },
  { name: 'F sexy F\'', alg: "F R U R' U' F'", bonus: 1.6 },
  { name: 'Vložení', alg: "R U R'", bonus: 0.8 },
  { name: 'Vložení', alg: "R U' R'", bonus: 0.8 },
  { name: 'Vložení', alg: "R' U' R", bonus: 0.6 },
  { name: 'Vložení', alg: "R' U R", bonus: 0.6 },
  { name: 'Vložení U2', alg: "R U2 R'", bonus: 0.6 },
  { name: 'M-flick', alg: "M' U M", bonus: 0.6 },
  { name: 'M-flick', alg: "M' U2 M", bonus: 0.6 },
];

/** Připraví seznam triggerů včetně zrcadel, seřazený od nejdelších. */
export function buildTriggers(list = DEFAULT_TRIGGERS, { mirror = true } = {}) {
  const out = new Map();
  for (const t of list) {
    const moves = parseAlg(t.alg).map((m) => `${m.base}${m.amount}`);
    out.set(moves.join(' '), { name: t.name, alg: algToString(t.alg), bonus: t.bonus, moves });
    if (mirror) {
      const mm = mirrorAlg(t.alg);
      const key = mm.map((m) => `${m.base}${m.amount}`);
      if (!out.has(key.join(' '))) {
        out.set(key.join(' '), { name: `${t.name} (L)`, alg: algToString(mm), bonus: t.bonus, moves: key });
      }
    }
  }
  return [...out.values()].sort((a, b) => b.moves.length - a.moves.length);
}

/**
 * Najde nepřekrývající se triggery (hladově zleva, delší mají přednost).
 * @returns {{name:string, alg:string, bonus:number, start:number, length:number}[]}
 */
export function findTriggers(alg, triggers = buildTriggers()) {
  const seq = parseAlg(alg).map((m) => `${m.base}${m.amount}`);
  const found = [];
  for (let i = 0; i < seq.length;) {
    const t = triggers.find((t) => t.moves.every((m, j) => seq[i + j] === m));
    if (t) {
      found.push({ name: t.name, alg: t.alg, bonus: t.bonus, start: i, length: t.moves.length });
      i += t.moves.length;
    } else i++;
  }
  return found;
}
