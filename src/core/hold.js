// Držení kostky: kostku v ruce neotáčíš podle „barevného“ rámce (bílá nahoře,
// zelená vpředu), ale držíš ji, jak ti vyhovuje. Zápis algoritmů (U, R, F, …)
// se pak vztahuje k tomu, jak ji držíš: U je stěna, která je právě nahoře.
//
// Držení je celokostkové natočení z ROTATIONS: kostka z výchozí polohy
// (bílá nahoře, zelená vpředu) otočená o tuto rotaci je tak, jak ji držíš.
// Tahy ve „tvém“ rámci (held) se převádějí na tahy modelu a zpět.

import { FACELETS, FACES, NORMALS } from './geometry.js';
import { movePermutation, solved, applyAlg } from './cube.js';
import { ROTATIONS } from './rotations.js';
import { BASES, parseAlg, moveToString } from './notation.js';

export const HOLDS = ROTATIONS; // 24 natočení, '' (výchozí) první

const CENTER = Object.fromEntries(FACES.map((f) => [f,
  FACELETS.findIndex((x) => x.face === f && x.pos.filter((c) => c !== 0).length === 1)]));
const FACE_NAME = { U: 'bílá', D: 'žlutá', F: 'zelená', B: 'modrá', R: 'červená', L: 'oranžová' };
const AMOUNTS = [1, -1, 2];

const cache = new Map();

/** Převody pro držení `rot` (řetězec z HOLDS). */
export function holdOf(rot = '') {
  if (cache.has(rot)) return cache.get(rot);
  const rho = applyAlg(solved(), rot);                    // rho[p] = kam model. pozice p přijde v držení
  const rhoInv = new Uint8Array(54);
  rho.forEach((q, p) => { rhoInv[q] = p; });
  // tah h v držení = tah modelu m: m(p) = rho⁻¹(h(rho(p)))
  const toModel = new Map(), toHeld = new Map();
  const table = new Map();
  for (const base of BASES) for (const amount of AMOUNTS) table.set(movePermutation({ base, amount }).join(), { base, amount });
  for (const base of BASES) for (const amount of AMOUNTS) {
    const h = movePermutation({ base, amount });
    const m = table.get(Uint8Array.from(rho, (q) => rhoInv[h[q]]).join());
    toModel.set(`${base}${amount}`, m);
    toHeld.set(`${m.base}${m.amount}`, { base, amount });
  }
  const faces = Object.fromEntries(FACES.map((f) => [f, FACELETS[rho[CENTER[f]]].face])); // model → držení
  const convert = (map) => (alg) => parseAlg(alg).map((m) => map.get(`${m.base}${m.amount}`));
  const asString = (moves) => moves.map(moveToString).join(' ');
  const hold = {
    rot, faces,
    /** Tahy v držení → tahy modelu (pole tahů). */
    toModel: convert(toModel),
    /** Tahy modelu → tahy v držení. */
    toHeld: convert(toHeld),
    toModelString: (alg) => asString(hold.toModel(alg)),
    toHeldString: (alg) => asString(hold.toHeld(alg)),
    /** Popis držení: která stěna je nahoře a která vpředu. */
    describe() {
      const model = (heldFace) => FACES.find((f) => faces[f] === heldFace);
      return rot === '' ? 'bílá nahoře, zelená vpředu' : `${FACE_NAME[model('U')]} nahoře, ${FACE_NAME[model('F')]} vpředu`;
    },
    /** Natočení modelu do držení jako matice 3×3 v souřadnicích CSS (x doprava, y dolů, z k divákovi). */
    linear() {
      const css = (face) => { const n = NORMALS[face]; return [n[0], n[1] ? -n[1] : 0, n[2]]; };
      // sloupce: obraz css os x, y, z = normály stěn R, D, F
      return ['R', 'D', 'F'].map((f) => css(faces[f]));
    },
  };
  cache.set(rot, hold);
  return hold;
}

/** Držení, v němž je nahoře stěna `up` modelu a vpředu stěna `front` modelu. */
export function holdFromFaces(up, front) {
  return HOLDS.find((rot) => {
    const f = holdOf(rot).faces;
    return f[up] === 'U' && f[front] === 'F';
  }) ?? '';
}
