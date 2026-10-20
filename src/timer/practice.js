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
 * Náhodný stav (pole poloh nálepek) s dílky `fixed` hotovými.
 * @param {Iterable<string>|Object<string,string>} fixed názvy dílků (URF, UF, …) – ty jsou
 *   na místě a natočené; nebo mapa název → 'solved' | 'permutation' (jen na místě) |
 *   'orientation' (jen natočený, místo libovolné). Středy jsou na místě vždy.
 */
export function practiceState(fixed, rand = randomInt) {
  const style = fixed && !(Symbol.iterator in Object(fixed))
    ? new Map(Object.entries(fixed).filter(([, s]) => s && s !== 'ignore'))
    : new Map([...(fixed ?? [])].map((name) => [name, 'solved']));
  const plan = ['corner', 'edge'].map((type) => {
    const pieces = SLOTS.filter((s) => s.type === type);
    // dílky bez pevného místa se náhodně rozmístí po volných místech
    const moving = pieces.filter((s) => !['solved', 'permutation'].includes(style.get(s.name)));
    // dílky bez pevného natočení dostanou náhodné natočení
    const twisting = pieces.filter((s) => !['solved', 'orientation'].includes(style.get(s.name)));
    return { pieces, moving, twisting, targets: shuffled(moving, rand), n: type === 'corner' ? 3 : 2 };
  });
  const build = () => {
    const loc = solved();
    for (const { pieces, moving, twisting, targets, n } of plan) {
      let sum = 0;
      const twist = new Map(twisting.map((piece, i) => {
        // natočení: náhodné, poslední dopočtené (součet ≡ 0)
        const t = i === twisting.length - 1 ? (n - (sum % n)) % n : rand(n);
        sum += t;
        return [piece, t];
      }));
      for (const piece of pieces) {
        const i = moving.indexOf(piece);
        const target = i < 0 ? piece : targets[i];
        const t = twist.get(piece) ?? 0;
        piece.facelets.forEach((k, j) => { loc[k] = target.facelets[(j + t) % n]; });
      }
    }
    return loc;
  };
  let loc = build();
  if (permutationParity(loc)) {
    // parita rohů a hran musí souhlasit: prohodit dva volné dílky
    const p = plan.find((x) => x.moving.length >= 2);
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
