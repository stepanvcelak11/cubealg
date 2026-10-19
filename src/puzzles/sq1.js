// Square-1: dvě vrstvy po 12 pozicích (30°), rohy zabírají 2 pozice, hrany 1,
// a prostřední vrstva, která se řezem „/“ otočí o 180°.
//
// Úhly: při pohledu shora, po směru hodinových ručiček od přední strany
// (F = 0°, L = 90°, B = 180°, R = 270°). Řez vede vlevo od přední hrany
// (15°) a vpravo od zadní (195°); pozice k pokrývá úhly 195° + 30k …
// 225° + 30k, takže pozice 0–5 jsou pravá polovina, která se řezem otáčí
// (řez je mezi pozicemi 11|0 a 5|6). Ze složeného stavu tak jde
// (1,0)/ i (0,-1)/, jak je zvykem ve WCA zamícháních.
// Spodní vrstva se ukládá ve stejném rámci (pohled shora skrz kostku).
//
// Dílky: hrany 0–7 (UB UR UF UL DB DR DF DL), rohy 8–15
// (UBR UFR UFL UBL DBR DFR DFL DBL). Hodnota pozice = dílek·2 + půlka
// (0 = první půlka rohu ve směru hodinových ručiček při pohledu na vrstvu
// zvenku – nahoře nižší index, dole vyšší; hrany mají vždy 0).
//
// Notace WCA: (a,b) otočí horní vrstvu o a·30° a spodní o b·30°, kladně po
// směru hodinových ručiček při pohledu na danou vrstvu (spodní tedy zespodu),
// „/“ je řez. Rozsah a, b je −5 … 6.

import { CUBE_COLORS } from './colors.js';

export const EDGES = ['UB', 'UR', 'UF', 'UL', 'DB', 'DR', 'DF', 'DL'];
export const CORNERS = ['UBR', 'UFR', 'UFL', 'UBL', 'DBR', 'DFR', 'DFL', 'DBL'];
export const PIECE_NAMES = [...EDGES, ...CORNERS];
const isCorner = (piece) => piece >= 8;

// Barvy dílků: horní/spodní barva a boční barvy (u rohu první a druhá půlka).
export const PIECE_COLORS = [
  ...EDGES.map((n) => ({ face: n[0], sides: [n[1]] })),
  { face: 'U', sides: ['B', 'R'] }, { face: 'U', sides: ['R', 'F'] }, { face: 'U', sides: ['F', 'L'] }, { face: 'U', sides: ['L', 'B'] },
  { face: 'D', sides: ['R', 'B'] }, { face: 'D', sides: ['F', 'R'] }, { face: 'D', sides: ['L', 'F'] }, { face: 'D', sides: ['B', 'L'] },
];

/** Složený stav: Int8Array(25) = 12 horních pozic, 12 spodních, prostředek (0/1). */
export function solvedState() {
  const v = (piece, half = 0) => piece * 2 + half;
  // nahoře: BR roh, R hrana, FR roh, F hrana, FL roh, L hrana, BL roh, B hrana
  const top = [v(8), v(8, 1), v(1), v(9), v(9, 1), v(2), v(10), v(10, 1), v(3), v(11), v(11, 1), v(0)];
  // dole stejné úhly; první půlka rohu je na vyšším indexu
  const bot = [v(12, 1), v(12), v(5), v(13, 1), v(13), v(6), v(14, 1), v(14), v(7), v(15, 1), v(15), v(4)];
  return Int8Array.from([...top, ...bot, 0]);
}

const MID = 24;
const mod12 = (x) => ((x % 12) + 12) % 12;
const pieceOf = (v) => v >> 1;

/** Zda řez může projít (žádný roh nepřekračuje řez v žádné vrstvě). */
export function canSlash(s) {
  for (const base of [0, 12]) {
    for (const [i, j] of [[11, 0], [5, 6]]) {
      const a = s[base + i], b = s[base + j];
      if (isCorner(pieceOf(a)) && pieceOf(a) === pieceOf(b)) return false;
    }
  }
  return true;
}

/** Otočení vrstev: (a, b) podle notace WCA. */
export function turn(s, a, b, out = new Int8Array(25)) {
  for (let k = 0; k < 12; k++) {
    out[mod12(k + a)] = s[k];             // nahoře: kladně = po směru hodin shora
    out[12 + mod12(k - b)] = s[12 + k];   // dole: kladně = po směru hodin zespodu
  }
  out[MID] = s[MID];
  return out;
}

/** Řez: pravá polovina (pozice 0–5) se otočí o 180° (nahoře k ↔ dole 5−k). */
export function slash(s, out = new Int8Array(25)) {
  out.set(s);
  for (let k = 0; k < 6; k++) {
    out[k] = s[12 + 5 - k];
    out[12 + 5 - k] = s[k];
  }
  out[MID] = s[MID] ^ 1;
  return out;
}

// --- Notace --------------------------------------------------------------------------

const norm6 = (x) => { const m = mod12(x); return m > 6 ? m - 12 : m; };

/**
 * Rozparsuje zápis „(1,0) / (-3,3) / …“ na tahy { t: 'turn', a, b } a { t: 'slash' }.
 * Závorky jsou nepovinné, „/“ může stát kdekoli.
 */
export function parseSq1(text) {
  const src = String(text).trim();
  const moves = [];
  const re = /\s*(?:(\/)|\(?\s*(-?\d+)\s*,\s*(-?\d+)\s*\)?)/y;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new Error(`Nerozpoznaný zápis u „${src.slice(pos).trim()}“`);
    if (m[1]) moves.push({ t: 'slash' });
    else {
      const a = norm6(Number(m[2])), b = norm6(Number(m[3]));
      if (a || b) moves.push({ t: 'turn', a, b });
    }
    pos = re.lastIndex;
  }
  return moves;
}

export const sq1MoveToString = (m) => (m.t === 'slash' ? '/' : `(${m.a},${m.b})`);

export function sq1AlgToString(moves) {
  return (typeof moves === 'string' ? parseSq1(moves) : moves).map(sq1MoveToString).join(' ').replace(/\) \//g, ')/');
}

export function invertSq1(moves) {
  return (typeof moves === 'string' ? parseSq1(moves) : moves).slice().reverse()
    .map((m) => (m.t === 'slash' ? m : { t: 'turn', a: norm6(-m.a), b: norm6(-m.b) }));
}

/** Aplikuje algoritmus; vyhodí chybu, když řez nejde provést. */
export function applySq1(state, alg) {
  let s = Int8Array.from(state);
  for (const m of typeof alg === 'string' ? parseSq1(alg) : alg) {
    if (m.t === 'slash') {
      if (!canSlash(s)) throw new Error('Řez „/“ teď nejde – roh je přes řez');
      s = slash(s);
    } else s = turn(s, m.a, m.b);
  }
  return s;
}

// --- Vybarvení (zadání v Labu) ---------------------------------------------------------
//
// Strana zadání = { state, colors }: state určuje tvar (kde jsou hrany a půlky
// rohů – identita dílků je jen pomocná), colors = 48 barev pozic
// (vrstva·24 + pozice·2 + 0 = horní/spodní nálepka, + 1 = boční nálepka).
// U rohu nese horní nálepku první i druhá půlka (stejná barva).

export const EMPTY = 'X';
const ci = (layer, k, side) => layer * 24 + k * 2 + side;

/** Kde leží půlky dílků: pro každý dílek seznam [vrstva, pozice] (u rohu první, druhá půlka). */
function placesOf(state) {
  const out = new Array(16).fill(null).map(() => []);
  for (let i = 0; i < 24; i++) {
    const v = state[i];
    out[pieceOf(v)][v & 1] = [i < 12 ? 0 : 1, i % 12];
  }
  return out;
}

/** Barvy pro složený dílek na jeho místě ve stavu. */
function paintPiece(colors, state, piece) {
  const places = placesOf(state)[piece];
  const { face, sides } = PIECE_COLORS[piece];
  places.forEach(([layer, k], half) => {
    colors[ci(layer, k, 0)] = face;
    colors[ci(layer, k, 1)] = sides[half];
  });
}

export function sq1Ops() {
  const blank = (state = solvedState()) => ({ state: Int8Array.from(state), colors: new Array(48).fill(EMPTY) });

  function home(names, side = blank()) {
    const state = solvedState();
    const out = { state, colors: new Array(48).fill(EMPTY) };
    for (const n of names) paintPiece(out.colors, state, PIECE_NAMES.indexOf(n));
    void side;
    return out;
  }

  /** Tahy posunou tvar i barvy (barvy cestují s pozicemi). */
  function applyMoves(side, alg) {
    // pozice → index; barvy jdou s hodnotami pozic stavu
    const tagged = Int8Array.from(side.state);
    const labels = Int8Array.from({ length: 24 }, (_, i) => i);
    const s = applySq1(tagged, alg);
    // dohledání, kam se která pozice přesunula: proveď tahy na „štítcích“
    const track = Int8Array.from([...labels.map((i) => i * 2), 0]); // jen pro sledování, tvar podle originálu
    let shape = Int8Array.from(side.state);
    let lab = Int8Array.from(track);
    for (const m of typeof alg === 'string' ? parseSq1(alg) : alg) {
      if (m.t === 'slash') {
        if (!canSlash(shape)) throw new Error('Řez „/“ teď nejde – roh je přes řez');
        shape = slash(shape); lab = slash(lab);
      } else { shape = turn(shape, m.a, m.b); lab = turn(lab, m.a, m.b); }
    }
    const colors = new Array(48).fill(EMPTY);
    for (let i = 0; i < 24; i++) {
      const from = lab[i] >> 1; // původní pozice (0–23)
      const fl = from < 12 ? 0 : 1, fk = from % 12;
      const tl = i < 12 ? 0 : 1, tk = i % 12;
      colors[ci(tl, tk, 0)] = side.colors[ci(fl, fk, 0)];
      colors[ci(tl, tk, 1)] = side.colors[ci(fl, fk, 1)];
    }
    void s;
    return { state: shape, colors };
  }

  /** Rozpozná dílky z barev. */
  function identify(side) {
    const pieces = new Map();
    const errors = [];
    const { state, colors } = side;
    for (let i = 0; i < 24; i++) {
      const v = state[i];
      if (v & 1) continue; // druhá půlka rohu se čte s první
      const layer = i < 12 ? 0 : 1, k = i % 12;
      const corner = isCorner(pieceOf(v));
      const places = [[layer, k]];
      if (corner) {
        // druhá půlka: nahoře další pozice, dole předchozí
        places.push([layer, mod12(layer === 0 ? k + 1 : k - 1)]);
      }
      const face = colors[ci(layer, k, 0)];
      const sides = places.map(([l, kk]) => colors[ci(l, kk, 1)]);
      const all = [face, ...sides];
      const where = `${layer ? 'D' : 'U'}${k}`;
      const painted = all.filter((c) => c !== EMPTY).length;
      if (!painted) continue;
      if (painted < all.length) { errors.push(`Dílek na pozici ${where} není vybarvený celý`); continue; }
      const piece = PIECE_COLORS.findIndex((p) => p.face === face && p.sides.length === sides.length && p.sides.every((c, j) => c === sides[j]));
      if (piece < 0) {
        const mirrored = PIECE_COLORS.some((p) => p.face === face && p.sides.length === 2 && corner && p.sides[0] === sides[1] && p.sides[1] === sides[0]);
        errors.push(mirrored ? `Roh na pozici ${where} má boční barvy obráceně` : `Na pozici ${where} je dílek ${all.join('')}, takový neexistuje`);
        continue;
      }
      const name = PIECE_NAMES[piece];
      if (pieces.has(name)) { errors.push(`Dílek ${name} je vybarvený víckrát`); continue; }
      pieces.set(name, { index: i, places });
    }
    return { pieces, errors };
  }

  /**
   * Úplný stav pro hledání: rozpoznané dílky na svých místech, ostatní libovolně.
   * @returns {{loc: Int8Array|null, errors: string[]}}
   */
  function build(side, constraints, where = 'výchozí kostce') {
    const { pieces, errors } = identify(side);
    for (const [name, t] of Object.entries(constraints)) {
      if (t && t !== 'ignore' && !pieces.has(name)) errors.push(`Dílek ${name} na ${where} chybí`);
    }
    if (errors.length) return { loc: null, errors };
    const s = Int8Array.from(side.state);
    const free = { edge: PIECE_NAMES.map((_, p) => p).filter((p) => !isCorner(p) && !pieces.has(PIECE_NAMES[p])),
      corner: PIECE_NAMES.map((_, p) => p).filter((p) => isCorner(p) && !pieces.has(PIECE_NAMES[p])) };
    for (let i = 0; i < 24; i++) {
      const v = side.state[i];
      if (v & 1) continue;
      const layer = i < 12 ? 0 : 1, k = i % 12;
      const corner = isCorner(pieceOf(v));
      const known = [...pieces.entries()].find(([, p]) => p.index === i);
      const piece = known ? PIECE_NAMES.indexOf(known[0]) : free[corner ? 'corner' : 'edge'].shift();
      s[i] = piece * 2;
      if (corner) s[layer * 12 + mod12(layer === 0 ? k + 1 : k - 1)] = piece * 2 + 1;
    }
    return { loc: s, errors };
  }

  const findPiece = (side, name) => identify(side).pieces.get(name) ?? null;

  function removePiece(side, name) {
    const p = findPiece(side, name);
    const colors = [...side.colors];
    if (p) for (const [l, k] of p.places) { colors[ci(l, k, 0)] = EMPTY; colors[ci(l, k, 1)] = EMPTY; }
    return { state: side.state, colors };
  }

  /** Pozice (vrstva, k) prvních půlek míst, kam dílek doma patří. */
  function homePlaces(name) {
    return placesOf(solvedState())[PIECE_NAMES.indexOf(name)];
  }

  // „Domov“ dílku má smysl jen v tvaru, kde je na tom místě dílek stejného typu.
  function homeEmpty(side, name) {
    const piece = PIECE_NAMES.indexOf(name);
    return homePlaces(name).every(([l, k], half) => {
      const v = side.state[l * 12 + k];
      return isCorner(pieceOf(v)) === isCorner(piece) && (v & 1) === half
        && side.colors[ci(l, k, 0)] === EMPTY && side.colors[ci(l, k, 1)] === EMPTY;
    });
  }

  function placeHome(side, name) {
    const colors = [...side.colors];
    const piece = PIECE_NAMES.indexOf(name);
    const { face, sides } = PIECE_COLORS[piece];
    homePlaces(name).forEach(([l, k], half) => { colors[ci(l, k, 0)] = face; colors[ci(l, k, 1)] = sides[half]; });
    return { state: side.state, colors };
  }

  /** Dílek na pozici nálepky (index 0–47), nebo null. */
  function pieceAtSticker(side, pos) {
    const layer = pos >= 24 ? 1 : 0, k = (pos % 24) >> 1;
    for (const [name, p] of identify(side).pieces) if (p.places.some(([l, kk]) => l === layer && kk === k)) return name;
    return null;
  }

  /** Nálepky dílku na pozici (u rohu obě půlky). */
  function groupOf(side, layer, k) {
    const v = side.state[layer * 12 + k];
    if (!isCorner(pieceOf(v))) return [[layer, k]];
    const other = mod12((layer === 0) === ((v & 1) === 0) ? k + 1 : k - 1);
    return (v & 1) === 0 ? [[layer, k], [layer, other]] : [[layer, other], [layer, k]];
  }

  /**
   * Vybarví nálepku: horní/spodní nálepka rohu obarví obě půlky. Stejná barva
   * podruhé nálepku smaže. Vznikne-li nemožný dílek, ostatní nálepky dílku se
   * smažou (kromě té vybarvené těsně předtím); roh se dvěma známými barvami
   * se doplní (třetí je jednoznačná).
   */
  function paint(side, pos, color, lastPos = -1) {
    const layer = pos >= 24 ? 1 : 0, k = (pos % 24) >> 1, kind = pos & 1;
    const colors = [...side.colors];
    const group = groupOf(side, layer, k);
    const faceIdx = group.map(([l, kk]) => ci(l, kk, 0));
    const sideIdx = group.map(([l, kk]) => ci(l, kk, 1));
    const targets = kind === 0 ? faceIdx : [pos];
    const erase = colors[pos] === color;
    for (const t of targets) colors[t] = erase ? EMPTY : color;
    const out = { state: side.state, colors };
    if (erase) return out;
    const all = [...faceIdx, ...sideIdx];
    if (all.every((t) => colors[t] !== EMPTY) && !pieceAtSticker(out, pos)) {
      const keep = new Set(targets);
      if (all.includes(lastPos)) for (const t of faceIdx.includes(lastPos) ? faceIdx : [lastPos]) keep.add(t);
      for (const t of all) if (!keep.has(t)) colors[t] = EMPTY;
    }
    // doplnění rohu: známá horní barva + jedna boční, nebo obě boční
    if (group.length === 2) {
      const face = colors[faceIdx[0]], sides = sideIdx.map((t) => colors[t]);
      const known = [face, ...sides].filter((c) => c !== EMPTY).length;
      if (known === 2) {
        const fits = PIECE_COLORS.filter((p) => p.sides.length === 2 && (face === EMPTY || p.face === face)
          && p.sides.every((c, j) => sides[j] === EMPTY || sides[j] === c));
        if (fits.length === 1) {
          for (const t of faceIdx) colors[t] = fits[0].face;
          sideIdx.forEach((t, j) => { colors[t] = fits[0].sides[j]; });
        }
      }
    }
    return out;
  }

  return { blank, home, applyMoves, identify, build, findPiece, removePiece, homeEmpty, placeHome, pieceAtSticker, paint, groupOf };
}

// --- Vykreslení (SVG) -----------------------------------------------------------------

const R = 2;                               // polovina strany čtverce vrstvy
const RE = R / Math.cos(Math.PI / 12);     // vzdálenost hraničního bodu dílku od středu
const RC = R * Math.SQRT2;                 // vzdálenost vnějšího rohu
const SIDE = 0.5;                          // tloušťka boční nálepky
const CENTERS = [[0, -3.75], [0, 3.75]]; // U nahoře, D pod ní

function pt(layer, angle, r) {
  const a = (angle * Math.PI) / 180;
  const [cx, cy] = CENTERS[layer];
  return [cx - r * Math.sin(a), cy + r * Math.cos(a)];
}
const out = (p, q, layer, t = SIDE) => {
  // posun úsečky p–q směrem od středu vrstvy
  const [cx, cy] = CENTERS[layer];
  let nx = q[1] - p[1], ny = -(q[0] - p[0]);
  const l = Math.hypot(nx, ny);
  nx /= l; ny /= l;
  const mx = (p[0] + q[0]) / 2 - cx, my = (p[1] + q[1]) / 2 - cy;
  if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
  return [[p[0] + nx * t, p[1] + ny * t], [q[0] + nx * t, q[1] + ny * t]];
};
const fmt = (pts) => pts.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');

/**
 * Polygony nálepek pro daný tvar: [{ pos, points }], pos = index barvy (0–47).
 * Horní nálepka rohu má jeden polygon (pod indexem první půlky).
 */
export function sq1Polygons(state) {
  const polys = [];
  for (let layer = 0; layer < 2; layer++) {
    for (let k = 0; k < 12; k++) {
      const v = state[layer * 12 + k];
      const corner = isCorner(pieceOf(v));
      const start = 195 + 30 * k;
      if (!corner) {
        const p = pt(layer, start, RE), q = pt(layer, start + 30, RE);
        polys.push({ pos: ci(layer, k, 0), points: fmt([CENTERS[layer], p, q]) });
        const [p2, q2] = out(p, q, layer);
        polys.push({ pos: ci(layer, k, 1), points: fmt([p, q, q2, p2]) });
        continue;
      }
      // roh vykreslí jeho „levější“ pozice ve směru úhlů (nahoře první půlka, dole druhá)
      const leading = layer === 0 ? (v & 1) === 0 : (v & 1) === 1;
      if (!leading) continue;
      const k2 = mod12(k + 1);
      const p = pt(layer, start, RE), c = pt(layer, start + 30, RC), q = pt(layer, start + 60, RE);
      const firstK = layer === 0 ? k : k2; // pozice s první půlkou
      polys.push({ pos: ci(layer, firstK, 0), points: fmt([CENTERS[layer], p, c, q]) });
      const [p2, c2] = out(p, c, layer);
      const [c3, q3] = out(c, q, layer);
      polys.push({ pos: ci(layer, k, 1), points: fmt([p, c, c2, p2]) });
      polys.push({ pos: ci(layer, k2, 1), points: fmt([c, q, q3, c3]) });
    }
  }
  return polys;
}

export const SQ1_VIEWBOX = '-3.6 -7.7 7.2 15.4';

export const SQ1 = {
  kind: 'sq1',
  id: 'sq1',
  name: 'Square-1',
  colors: CUBE_COLORS,
  view: 'net',
  ergonomics: 'sq1',
  pieceNames: PIECE_NAMES,
  solved: solvedState,
  parseAlg: parseSq1,
  algToString: sq1AlgToString,
  invertAlg: invertSq1,
  applyAlg: applySq1,
  moveToString: sq1MoveToString,
};
