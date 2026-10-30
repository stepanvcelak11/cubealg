// Zamíchání do případu (Trenažér): tahy, které ze složené kostky udělají případ, který
// uložený algoritmus řeší – jako zamíchání z náhodného stavu (two-phase), ne inverze
// algoritmu, takže zamícháním se algoritmus neprozradí. Zamíchání je v zápisu držení:
// skladač drží kostku stejně jako při algoritmu, zamíchá a pak algoritmus zatočí.
// Algoritmus se slice tahy nebo rotacemi posune středy – stav se pro two-phase natočí
// celou kostkou zpátky (po zamíchání a algoritmu je kostka složená, jen jinak natočená).

import { parseAlg, invertAlg, moveToString } from '../core/notation.js';
import { solved, applyAlg, toFacelets } from '../core/cube.js';
import { ROTATIONS } from '../core/rotations.js';
import { FACELETS } from '../core/geometry.js';
import { solve } from '../timer/twophase.js';

const CENTERS = FACELETS.filter((f) => f.pos.filter((x) => x === 0).length === 2).map((f) => f.index);
const invertMove = (m) => (m.endsWith("'") ? m.slice(0, -1) : m.endsWith('2') ? m : `${m}'`);

/**
 * @param {string} alg algoritmus 3×3 (i se závorkami, M, rotacemi, širokými tahy)
 * @param {number} [auf] natočení horní vrstvy navíc (0–3 čtvrtotáčky po směru)
 * @returns {string|null} zamíchání ('' = algoritmus nic nemění), null = nejde přečíst
 */
export function caseScramble(alg, auf = 0, { timeLimit = 1500 } = {}) {
  let inv;
  try {
    const text = String(alg).replace(/[()[\]]/g, ' ').trim();
    parseAlg(text);
    inv = [invertAlg(text).map(moveToString).join(' '), ['', 'U', 'U2', "U'"][auf % 4]].filter(Boolean).join(' ');
  } catch { return null; }
  // zamíchání Z musí splnit Z · alg = složená (jakkoli natočená) kostka, tj. Z = rotace · inverze:
  // rotace na začátku (na složené kostce se nic nezmění), aby středy zůstaly doma
  const home = (s) => CENTERS.every((k) => s[k] === k);
  const fixed = ROTATIONS.map((r) => applyAlg(solved(), r ? `${r} ${inv}` : inv)).find(home);
  if (!fixed) return null;
  if (fixed.every((v, i) => v === i)) return '';
  const sol = solve(toFacelets(fixed), { timeLimit });
  if (sol === null || sol === undefined) return null;
  return sol.split(' ').filter(Boolean).reverse().map(invertMove).join(' ');
}
