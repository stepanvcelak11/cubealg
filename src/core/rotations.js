// Všech 24 natočení celé kostky (nejkratší zápis pomocí x, y, z).

import { solved, applyAlg } from './cube.js';

export const ROTATIONS = (() => {
  const seen = new Map([[solved().join(), '']]);
  const queue = [''];
  while (queue.length) {
    const alg = queue.shift();
    for (const r of ['y', "y'", 'y2', 'x', "x'", 'x2', 'z', "z'"]) {
      const next = alg ? `${alg} ${r}` : r;
      const key = applyAlg(solved(), next).join();
      if (!seen.has(key)) { seen.set(key, next); queue.push(next); }
    }
  }
  return [...seen.values()];
})();
