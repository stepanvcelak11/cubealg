// Přeřešení úseků dlouhého algoritmu úplným hledáním (silná heuristika a tabulka
// blízko cíle): úsek se nahradí kratší (nebo lepší) sekvencí se stejným účinkem.
//
//   úsek uprostřed – jen když jsou všechny dílky pohyblivých typů sledované jako
//                    „plná“ (účinek úseku je pak dán jednoznačně): stav se přeznačí
//                    tak, aby cíl úlohy odpovídal stavu po úseku, a hledá se stejnou
//                    připravenou úlohou (bez nových tabulek)
//   konec          – vždy: od stavu po začátku algoritmu se hledá kratší dokončení
//                    skutečného cíle

import { search } from './engine.js';

/**
 * @param {ReturnType<import('./engine.js').prepare>} problem úplná úloha
 * @param {object} P hlavolam
 * @param {Uint8Array} target cíl (první)
 */
export function makeResolver(problem, P, target) {
  // úsek uprostřed: všechny dílky pohyblivých typů musí být sledované jako plné
  const kinds = new Set(problem.pieces.map((p) => p.kind));
  const trackedRefs = problem.pieces.map((p) => p.ref);
  const full = problem.pieces.every((p) => p.constraint === 'solved')
    && P.slots.filter((s) => kinds.has(s.type) && s.facelets.length > 1).length
      === problem.pieces.filter((p) => p.stickers > 1).length;
  const stateOf = (start, moves) => (moves.length ? P.applyAlg(start, moves.join(' ')) : Uint8Array.from(start));

  /**
   * Náhrady úseku moves[i … i+len) algoritmu z výchozího stavu start: sekvence
   * délky ≤ maxLength se stejným účinkem na sledované dílky.
   * @returns {{solutions: string[], reason: string}}
   */
  function window(start, moves, i, len, { maxLength, maxResults = 1, timeLimit = 1000 }) {
    if (!full) return { solutions: [], reason: 'not-applicable' };
    const s1 = stateOf(start, moves.slice(0, i));
    const s2 = P.applyAlg(s1, moves.slice(i, i + len).join(' '));
    // přeznačení: na místě cíle T[ref] má po úseku ležet nálepka k (s2[k] = T[ref]);
    // náhrada M musí poslat s1[k] tam, kam ji poslal úsek
    const at = new Int16Array(P.size).fill(-1);
    for (let k = 0; k < P.size; k++) at[s2[k]] = k;
    const z = new Uint8Array(P.size);
    for (const ref of trackedRefs) z[ref] = s1[at[target[ref]]];
    const res = search(problem, z, { maxLength, extraDepth: maxLength, maxResults: maxResults * 4, timeLimit });
    // jen náhrady se stejným účinkem (ne jiný cíl z AUF)
    const solutions = res.solutions.filter((alg) => sameRefs(P.applyAlg(s1, alg), s2, problem.pieces)).slice(0, maxResults);
    return { solutions, reason: res.reason };
  }

  /**
   * Dokončení cíle od stavu po moves[0 … i) (délky ≤ maxLength).
   * @returns {{solutions: {alg: string, target: number}[], reason: string}}
   */
  function tail(start, moves, i, { maxLength, maxResults = 1, timeLimit = 1000 }) {
    const solutions = [];
    const res = search(problem, stateOf(start, moves.slice(0, i)), {
      maxLength, extraDepth: maxLength, maxResults, timeLimit,
      onSolution: (alg, len, info) => solutions.push({ alg, target: info.target }),
    });
    return { solutions, reason: res.reason };
  }

  return { full, window, tail };
}

/** Mají oba stavy všechny sledované dílky na stejných místech? */
function sameRefs(a, b, pieces) {
  // poloha referenční nálepky určuje místo i natočení dílku
  for (const p of pieces) if (a[p.ref] !== b[p.ref]) return false;
  return true;
}
