// Skewb: krychle řezaná rovinami kolmými na tělesové úhlopříčky.
// Každá stěna: středový čtverec + 4 rohové trojúhelníky (30 nálepek).
//
// Tahy podle WCA: R = roh DRB, U = ULB, L = DLF, B = DLB (vždy po směru
// hodinových ručiček při pohledu na roh). Roh URF se nikdy netočí.

import { makePuzzle, fromGeometry, dot } from './perm.js';
import { CUBE_COLORS } from './colors.js';
import { CUBE_NET, cubeNetPoint, cubeNetBox, pointsAttr } from './net.js';

const NORMALS = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);

const stickers = [];
const polys = [];
for (const [face, n] of Object.entries(NORMALS)) {
  const { right, down } = CUBE_NET[face];
  const at = (u, v) => add(add(n, right, u), down, v); // bod stěny v souřadnicích u, v ∈ ⟨−1, 1⟩
  const net = (pts) => pointsAttr(pts.map(([u, v]) => cubeNetPoint(face, at(u, v))));
  stickers.push({ face, c: n, n });
  polys.push(net([[0, -1], [1, 0], [0, 1], [-1, 0]]));
  for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    stickers.push({ face, c: at((2 / 3) * su, (2 / 3) * sv), n });
    polys.push(net([[su, sv], [0, sv], [su, 0]]));
  }
}

const sign = (x) => (x > 0 ? 1 : -1);
const CORNERS = { R: [1, -1, -1], U: [-1, 1, -1], L: [-1, -1, 1], B: [-1, -1, -1] };

const geo = fromGeometry({
  stickers,
  pieceOf: (i) => {
    const { c, face } = stickers[i];
    return Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2]) === 1 ? `center:${face}` : `corner:${c.map(sign)}`;
  },
  typeOf: (key) => key.split(':')[0],
  refPriority: ['U', 'D', 'F', 'B', 'R', 'L'],
  moves: Object.fromEntries(Object.entries(CORNERS).map(([b, k]) => [b, { axis: k, order: 3, select: (c) => dot(c, k) > 0 }])),
});

export const SKEWB = makePuzzle({
  id: 'skewb',
  name: 'Skewb',
  ...geo,
  colors: CUBE_COLORS,
  rotations: [],
  presets: {
    RULB: { label: '<R, U, L, B>', bases: ['R', 'U', 'L', 'B'] },
    RU: { label: '<R, U>', bases: ['R', 'U'] },
    RL: { label: '<R, L>', bases: ['R', 'L'] },
    RUL: { label: '<R, U, L>', bases: ['R', 'U', 'L'] },
  },
  defaultBases: ['R', 'U', 'L', 'B'],
  ergonomics: 'simple',
  defaultWeights: { R: 1, U: 1.1, L: 1.2, B: 1.4 },
  // držení: otočení celého Skewbu, které zachová sadu tahů R U L B
  holdAxes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((axis) => ({ axis, order: 4 })),
  view: 'net',
  net: { viewBox: cubeNetBox(), polys },
});
