// Nácvik kroku metody: zamíchání 3×3, po kterém jsou zvolené dílky (hotové
// předchozí kroky) na svých místech a správně natočené; ostatní dílky jsou
// v rovnoměrně náhodném stavu. Zamíchání = inverze řešení dvoufázového řešiče.

import { SLOTS } from '../core/geometry.js';
import { solved, toFacelets, permutationParity } from '../core/cube.js';
import { solve } from './twophase.js';
import { randomInt } from './scramble.js';

const invertMove = (m) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : `${m}'`);

function shuffled(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Náhodný stav (pole poloh nálepek) s dílky `fixed` na místě.
 * @param {Iterable<string>} fixed názvy dílků (URF, UF, …), středy jsou na místě vždy
 */
export function practiceState(fixed, rand = randomInt) {
  const keep = new Set(fixed);
  const plan = ['corner', 'edge'].map((type) => {
    const free = SLOTS.filter((s) => s.type === type && !keep.has(s.name));
    return { free, targets: shuffled(free, rand), n: type === 'corner' ? 3 : 2 };
  });
  const build = () => {
    const loc = solved();
    for (const { free, targets, n } of plan) {
      let sum = 0;
      free.forEach((piece, i) => {
        // natočení: náhodné, poslední dopočtené (součet ≡ 0)
        const twist = i === free.length - 1 ? (n - (sum % n)) % n : rand(n);
        sum += twist;
        piece.facelets.forEach((k, j) => { loc[k] = targets[i].facelets[(j + twist) % n]; });
      });
    }
    return loc;
  };
  let loc = build();
  if (permutationParity(loc)) {
    // parita rohů a hran musí souhlasit: prohodit dva volné dílky
    const p = plan.find((x) => x.free.length >= 2);
    if (!p) return null;
    [p.targets[0], p.targets[1]] = [p.targets[1], p.targets[0]];
    loc = build();
  }
  return loc;
}

/** Zamíchání pro nácvik kroku (WCA notace, vnější tahy). */
export function practiceScramble(fixed, rand = randomInt) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const loc = practiceState(fixed, rand);
    if (!loc) return '';
    const sol = solve(toFacelets(loc));
    const moves = sol ? sol.split(' ').filter(Boolean) : [];
    if (moves.length >= 2) return moves.reverse().map(invertMove).join(' ');
  }
  return '';
}
