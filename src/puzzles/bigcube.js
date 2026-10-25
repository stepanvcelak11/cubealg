// Velké kostky 4×4 a 5×5 v Labu: geometrie N×N z nálepek (fromGeometry), tahy podle WCA:
//   R, L, U, D, F, B  – vnější vrstva
//   Rw … (= r)        – dvě vrstvy (široký tah), na 5×5 i 3Rw (tři vrstvy)
//   2R …              – jen druhá vrstva (vnitřní řez), na 5×5 i 3R (prostřední)
//   x, y, z           – otočení celé kostky
// Středy stejné barvy (a stejného druhu – na 5×5 rohové „x“ a hranové „t“) jsou
// zaměnitelné: cíl „středy hotové“ splní kterékoli středy té barvy (core/constraints.js
// je převede na skupinová pravidla, viz `identical`).

import { makePuzzle, fromGeometry } from './perm.js';
import { CUBE_COLORS } from './colors.js';
import { cubeNetSquare, cubeNetBox, pointsAttr } from './net.js';

const NORMALS = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
const AXIS = { R: [0, 1], L: [0, -1], U: [1, 1], D: [1, -1], F: [2, 1], B: [2, -1] };
// osy na stěně: dva směry kolmé k normále
const TANGENTS = { U: [[1, 0, 0], [0, 0, 1]], D: [[1, 0, 0], [0, 0, 1]], R: [[0, 1, 0], [0, 0, 1]], L: [[0, 1, 0], [0, 0, 1]], F: [[1, 0, 0], [0, 1, 0]], B: [[1, 0, 0], [0, 1, 0]] };

function bigCube(n) {
  const stickers = [];
  const offsets = Array.from({ length: n }, (_, i) => -n + 1 + 2 * i); // středy nálepek: −(n−1) … n−1
  for (const [face, nrm] of Object.entries(NORMALS)) {
    const [t1, t2] = TANGENTS[face];
    for (const a of offsets) for (const b of offsets) {
      const c = [0, 1, 2].map((d) => nrm[d] * n + t1[d] * a + t2[d] * b);
      stickers.push({ face, c, n: nrm });
    }
  }
  // kostička nálepky: o 1 dovnitř od stěny
  const cubie = (s) => s.c.map((x, d) => x - s.n[d]);
  const layer = (s, axis, sign) => (n - 1 - sign * cubie(s)[axis]) / 2; // 0 = vnější vrstva
  const moves = {};
  const add = (name, face, from, to) => {
    const [axis, sign] = AXIS[face];
    const v = [0, 0, 0]; v[axis] = sign;
    moves[name] = { axis: v, order: 4, select: (c) => { const s = stickers.find((x) => x.c.every((y, d) => Math.abs(y - c[d]) < 1e-6)); const l = layer(s, axis, sign); return l >= from && l <= to; } };
  };
  for (const f of 'RLUDFB') {
    add(f, f, 0, 0);
    add(`${f}w`, f, 0, 1);
    add(`2${f}`, f, 1, 1);
    if (n >= 5) { add(`3${f}w`, f, 0, 2); add(`3${f}`, f, 2, 2); }
  }
  add('x', 'R', 0, n - 1); add('y', 'U', 0, n - 1); add('z', 'F', 0, n - 1);
  // rychlejší výběr nálepek tahu: podle souřadnic přímo (bez hledání)
  for (const mv of Object.values(moves)) {
    const axis = mv.axis.findIndex((x) => x !== 0), sign = mv.axis[axis];
    const old = mv.select;
    const cache = new Map(stickers.map((s) => [s.c.join(','), old(s.c)]));
    mv.select = (c) => cache.get(c.map((x) => Math.round(x)).join(',')) ?? false;
    void sign;
  }
  const typeOf = (key) => {
    const q = key.split(',').map(Number);
    const outer = q.filter((x) => Math.abs(x) === n - 1).length;
    if (outer === 3) return 'corner';
    if (outer === 2) return n % 2 && q.some((x) => x === 0) ? 'midge' : 'wing';
    // středy: na 5×5 střed (0,0), „t“ (jedna souřadnice 0), „x“ (žádná)
    const inner = q.filter((x) => Math.abs(x) !== n - 1);
    return n % 2 && inner.every((x) => x === 0) ? 'center' : n % 2 && inner.some((x) => x === 0) ? 'tcenter' : 'xcenter';
  };
  const geo = fromGeometry({
    stickers,
    pieceOf: (i) => cubie(stickers[i]).join(','),
    typeOf,
    refPriority: ['U', 'D', 'F', 'B', 'R', 'L'],
    moves,
  });
  // jména dílků: barvy (+ pořadí, když jich je víc stejných)
  const count = new Map();
  for (const s of geo.slots) {
    const base = s.facelets.map((f) => geo.stickerFace[f]).join('') + (s.type === 'tcenter' ? 't' : s.type === 'xcenter' && n % 2 ? 'x' : '');
    const k = (count.get(base) ?? 0) + 1;
    count.set(base, k);
    s.base = base;
  }
  const dup = new Set([...count].filter(([, k]) => k > 1).map(([b]) => b));
  const seen = new Map();
  for (const s of geo.slots) {
    const k = (seen.get(s.base) ?? 0) + 1;
    seen.set(s.base, k);
    s.name = dup.has(s.base) ? `${s.base}${k}` : s.base;
    delete s.base;
    delete s.center;
  }
  // zaměnitelné dílky: středy stejné barvy a druhu
  const groups = new Map();
  for (const s of geo.slots) {
    if (!['xcenter', 'tcenter'].includes(s.type) && !(s.type === 'center' && n % 2 === 0)) continue;
    const key = `${s.type}:${geo.stickerFace[s.facelets[0]]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s.name);
  }
  // plošná síť
  const polys = stickers.map((s) => pointsAttr(cubeNetSquare(s.face, s.c.map((x) => x / n), 0.9 / n * 2 / 2, 3, 0.25)));
  const wide = n >= 5 ? ['3Rw', '3Uw'] : [];
  return makePuzzle({
    id: `${n}${n}${n}`,
    name: `${n}×${n}`,
    ...geo,
    identical: [...groups.values()].filter((g) => g.length > 1),
    colors: CUBE_COLORS,
    rotations: ['x', 'y', 'z'],
    presets: {
      parity: { label: 'Parita (R U, Rw Uw, 2R)', bases: ['R', 'U', 'Rw', 'Uw', '2R'] },
      outer: { label: 'Vnější + široké', bases: ['R', 'L', 'U', 'D', 'F', 'B', 'Rw', 'Lw', 'Uw', 'Dw', 'Fw', 'Bw'] },
      slices: { label: '<R, U, 2R, 2L>', bases: ['R', 'U', '2R', '2L'] },
      centers: { label: 'Středy (R U Rw Uw F)', bases: ['R', 'U', 'F', 'Rw', 'Uw', ...wide] },
    },
    defaultBases: ['R', 'U', 'Rw', 'Uw', '2R'],
    ergonomics: 'simple',
    defaultWeights: { R: 1, U: 1, F: 1.6, L: 1.4, D: 1.4, B: 2.6, Rw: 1.3, Uw: 1.6, Lw: 1.7, Dw: 2, Fw: 2.2, Bw: 3, '2R': 1.4, '2L': 1.6, '2U': 2.2, '2D': 2.4, '2F': 2.6, '2B': 3, '3Rw': 1.6, '3R': 1.6, '3Uw': 2, x: 3, y: 3, z: 3 },
    view: 'net',
    net: { viewBox: cubeNetBox(), polys },
  });
}

export const CUBE4 = bigCube(4);
export const CUBE5 = bigCube(5);
