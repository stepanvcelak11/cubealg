// Plošné sítě pro SVG pohled: polygon (body v rovině) pro každou nálepku.

import { dot } from './perm.js';

// Síť krychle: U nad F, řada L F R B, D pod F. Pro každou stěnu směr
// „doprava“ a „dolů“ ve 3D tak, jak se na stěnu díváme v síti.
export const CUBE_NET = {
  U: { at: [1, 0], right: [1, 0, 0], down: [0, 0, 1] },
  L: { at: [0, 1], right: [0, 0, 1], down: [0, -1, 0] },
  F: { at: [1, 1], right: [1, 0, 0], down: [0, -1, 0] },
  R: { at: [2, 1], right: [0, 0, -1], down: [0, -1, 0] },
  B: { at: [3, 1], right: [-1, 0, 0], down: [0, -1, 0] },
  D: { at: [1, 2], right: [1, 0, 0], down: [0, 0, -1] },
};

/**
 * Bod na stěně krychle (souřadnice -1…1 ve 3D) → bod v síti, kde má každá
 * stěna velikost `size` a mezery `gap`.
 */
export function cubeNetPoint(face, p, size = 3, gap = 0.25) {
  const f = CUBE_NET[face];
  const u = (dot(p, f.right) + 1) / 2, v = (dot(p, f.down) + 1) / 2;
  return [f.at[0] * (size + gap) + u * size, f.at[1] * (size + gap) + v * size];
}

export const pointsAttr = (pts) => pts.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');

/** Čtverec nálepky na stěně krychle (střed ve 3D v souřadnicích -1…1, poloviční velikost). */
export function cubeNetSquare(face, center, half, size, gap) {
  const f = CUBE_NET[face];
  const [cx, cy] = cubeNetPoint(face, center, size, gap);
  const h = half * size / 2;
  void f;
  return [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]];
}

/** viewBox sítě krychle. */
export function cubeNetBox(size = 3, gap = 0.25, pad = 0.1) {
  return `${-pad} ${-pad} ${4 * size + 3 * gap + 2 * pad} ${3 * size + 2 * gap + 2 * pad}`;
}
