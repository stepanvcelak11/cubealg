// Pyraminx: čtyřstěn, každá stěna 9 trojúhelníků (36 nálepek).
//
// Vrcholy (WCA): U nahoře, L vlevo vpředu, R vpravo vpředu, B vzadu.
// Stěny: F (U, L, R), L (U, L, B), R (U, R, B), D (L, R, B).
// Tahy U L R B otočí vrstvu u vrcholu (se špičkou), u l r b jen špičku.
// Dílky: špičky u l r b, středy (osy) U L R B, hrany UL UR UB LR LB RB.

import { makePuzzle, fromGeometry, norm, dot, cross } from './perm.js';
import { PYRAMINX_COLORS } from './colors.js';
import { pointsAttr } from './net.js';

const r = Math.sqrt(8) / 3;
const V = {
  U: [0, 1, 0],
  L: [-r * Math.sin(Math.PI / 3), -1 / 3, r * Math.cos(Math.PI / 3)],
  R: [r * Math.sin(Math.PI / 3), -1 / 3, r * Math.cos(Math.PI / 3)],
  B: [0, -1 / 3, -r],
};
const FACES = { F: ['U', 'L', 'R'], L: ['U', 'L', 'B'], R: ['U', 'R', 'B'], D: ['L', 'R', 'B'] };

// Síť: F uprostřed (špičkou nahoru), L a R po stranách, D pod F.
const h = (3 * Math.sqrt(3)) / 2; // strana 3, malý trojúhelník 1
const NET = {
  F: { U: [1.5, 0], L: [0, h], R: [3, h] },
  L: { U: [1.5, 0], L: [0, h], B: [-1.5, 0] },
  R: { U: [1.5, 0], R: [3, h], B: [4.5, 0] },
  D: { L: [0, h], R: [3, h], B: [1.5, 2 * h] },
};

// Focení: nahoře má být vrchol SCAN_TOP[stěna]; síť se otočí tak, aby tam byl.
export const SCAN = { top: { F: 'U', L: 'U', R: 'U', D: 'B' }, vertices: NET };

const TIP = 5 / 9, LAYER = 1 / 9; // řezy (průmět na osu vrcholu, vrchol = 1, protější stěna = −1/3)

const mix = (pts, w) => [0, 1, 2].map((d) => pts.reduce((s, p, i) => s + p[d] * w[i], 0));
const mix2 = (pts, w) => [0, 1].map((d) => pts.reduce((s, p, i) => s + p[d] * w[i], 0));

const stickers = [];
const polys = [];
for (const [face, vs] of Object.entries(FACES)) {
  const P = vs.map((v) => V[v]);
  const Q = vs.map((v) => NET[face][v]);
  let n = norm(cross(P[1].map((x, i) => x - P[0][i]), P[2].map((x, i) => x - P[0][i])));
  if (dot(n, mix(P, [1 / 3, 1 / 3, 1 / 3])) < 0) n = n.map((x) => -x);
  // trojúhelníky mřížky v barycentrických souřadnicích (krok 1/3)
  const tri = [];
  for (let i = 0; i < 3; i++) for (let j = 0; i + j < 3; j++) {
    tri.push([[i, j], [i + 1, j], [i, j + 1]]);
    if (i + j < 2) tri.push([[i + 1, j], [i, j + 1], [i + 1, j + 1]]);
  }
  // v síti je stěna mírně zmenšená k těžišti, aby byly stěny od sebe oddělené
  const Qc = mix2(Q, [1 / 3, 1 / 3, 1 / 3]);
  const Qs = Q.map((q) => q.map((v, d) => Qc[d] + (v - Qc[d]) * 0.94));
  for (const t of tri) {
    const w = t.map(([i, j]) => [1 - (i + j) / 3, i / 3, j / 3]);
    const c = mix(w.map((x) => mix(P, x)), [1 / 3, 1 / 3, 1 / 3]);
    stickers.push({ face, c, n });
    polys.push(pointsAttr(w.map((x) => mix2(Qs, x))));
  }
}

const proj = (c, v) => dot(c, V[v]);
const geo = fromGeometry({
  stickers,
  pieceOf: (i) => {
    const c = stickers[i].c;
    const tip = Object.keys(V).find((v) => proj(c, v) > TIP);
    if (tip) return `tip:${tip}`;
    const near = Object.keys(V).filter((v) => proj(c, v) > LAYER);
    return near.length === 1 ? `ax:${near[0]}` : `edge:${near.join('')}`;
  },
  typeOf: (key) => key.split(':')[0] === 'ax' ? 'center' : key.split(':')[0] === 'tip' ? 'tip' : 'edge',
  nameOf: (faces, type, key) => {
    const v = key.split(':')[1];
    return type === 'tip' ? v.toLowerCase() : v;
  },
  refPriority: ['F', 'D', 'L', 'R'],
  moves: Object.fromEntries(Object.keys(V).flatMap((v) => [
    [v, { axis: V[v], order: 3, select: (c) => proj(c, v) > LAYER }],
    [v.toLowerCase(), { axis: V[v], order: 3, select: (c) => proj(c, v) > TIP }],
  ])),
});

export const PYRAMINX = makePuzzle({
  id: 'pyram',
  name: 'Pyraminx',
  ...geo,
  colors: PYRAMINX_COLORS,
  rotations: [],
  presets: {
    URLB: { label: '<U, R, L, B>', bases: ['U', 'R', 'L', 'B'] },
    RUL: { label: '<R, U, L>', bases: ['R', 'U', 'L'] },
    RU: { label: '<R, U>', bases: ['R', 'U'] },
    RL: { label: '<R, L>', bases: ['R', 'L'] },
  },
  defaultBases: ['R', 'U', 'L', 'B'],
  ergonomics: 'simple',
  defaultWeights: { U: 1, R: 1, L: 1.1, B: 1.5, u: 0.6, r: 0.6, l: 0.6, b: 0.8 },
  view: 'net',
  net: { viewBox: `-1.7 -0.15 6.4 ${(2 * h + 0.3).toFixed(3)}`, polys },
});
