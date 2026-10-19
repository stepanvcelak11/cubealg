// Dvoufázový řešič Kociemba pro zamíchání 3×3 z náhodného stavu.
//
// Fáze 1 dovede kostku do podgrupy <U, D, R2, L2, F2, B2> (natočení rohů,
// hran a hrany střední vrstvy na místě), fáze 2 ji v této podgrupě složí.
// Vlastní model kostky (cubie: permutace + orientace), nezávislý na core/.
// Formát nálepek: Kociemba, U1..U9 R1..R9 F1..F9 D1..D9 L1..L9 B1..B9.

const FACES = 'URFDLB';

// Rohy: URF UFL ULB UBR DFR DLF DBL DRB; hrany: UR UF UL UB DR DF DL DB FR FL BL BR.
const CORNER_FACELET = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
const EDGE_FACELET = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
];
const CORNER_COLOR = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
const EDGE_COLOR = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

// Základní tahy (čtvrtotáčky po směru) ve tvaru „na pozici i je dílek cp[i]“.
const BASIC = [
  { cp: [3, 0, 1, 2, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // U
  { cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2],
    ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // R
  { cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0],
    ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] }, // F
  { cp: [0, 1, 2, 3, 5, 6, 7, 4], co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // D
  { cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0],
    ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // L
  { cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1],
    ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] }, // B
];

const identity = () => ({
  cp: [0, 1, 2, 3, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0],
  ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

/** Složení a·b (nejdřív a, pak b). */
function multiply(a, b) {
  const r = identity();
  for (let i = 0; i < 8; i++) {
    r.cp[i] = a.cp[b.cp[i]];
    r.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3;
  }
  for (let i = 0; i < 12; i++) {
    r.ep[i] = a.ep[b.ep[i]];
    r.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) & 1;
  }
  return r;
}

// 18 tahů: index = stěna·3 + (otočení − 1), otočení 1, 2, 3 (= ').
const MOVES = [];
for (const m of BASIC) {
  const m2 = multiply(m, m);
  MOVES.push(m, m2, multiply(m2, m));
}
const MOVE_NAMES = [];
for (const f of FACES) MOVE_NAMES.push(f, f + '2', f + "'");

// Tahy fáze 2: U, U2, U', R2, F2, D, D2, D', L2, B2.
const P2 = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16];
const IS_P2 = new Uint8Array(18);
for (const m of P2) IS_P2[m] = 1;

// --- souřadnice ---

const N_TWIST = 2187, N_FLIP = 2048, N_SLICE = 495, N_PERM8 = 40320, N_PERM4 = 24;

function getTwist(c) {
  let t = 0;
  for (let i = 0; i < 7; i++) t = t * 3 + c.co[i];
  return t;
}
function setTwist(c, t) {
  let s = 0;
  for (let i = 6; i >= 0; i--) { c.co[i] = t % 3; s += c.co[i]; t = (t / 3) | 0; }
  c.co[7] = (3 - (s % 3)) % 3;
}
function getFlip(c) {
  let f = 0;
  for (let i = 0; i < 11; i++) f = f * 2 + c.eo[i];
  return f;
}
function setFlip(c, f) {
  let s = 0;
  for (let i = 10; i >= 0; i--) { c.eo[i] = f & 1; s += c.eo[i]; f >>= 1; }
  c.eo[11] = s & 1;
}

const C_NK = (n, k) => {
  if (k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
};
/** Pozice hran FR FL BL BR (bez ohledu na pořadí), složeno = 0. */
function getSlice(ep) {
  let a = 0, x = 0;
  for (let j = 11; j >= 0; j--) {
    if (ep[j] >= 8) { a += C_NK(11 - j, x + 1); x++; }
  }
  return a;
}

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
/** Lehmerův kód permutace p[off..off+n) s hodnotami base..base+n. */
function getPerm(p, off, n) {
  let idx = 0;
  for (let i = 0; i < n; i++) {
    let k = 0;
    for (let j = i + 1; j < n; j++) if (p[off + j] < p[off + i]) k++;
    idx += k * FACT[n - 1 - i];
  }
  return idx;
}
function setPerm(p, off, n, idx, base) {
  const left = [];
  for (let i = 0; i < n; i++) left.push(base + i);
  for (let i = 0; i < n; i++) {
    const f = FACT[n - 1 - i];
    const k = (idx / f) | 0;
    idx -= k * f;
    p[off + i] = left.splice(k, 1)[0];
  }
}

// --- tabulky ---

let T = null;

function buildPrune(n1, n2, move1, move2, nMoves) {
  const size = n1 * n2;
  const p = new Int8Array(size).fill(-1);
  p[0] = 0;
  let filled = 1, depth = 0;
  while (filled < size) {
    const backward = filled > size / 3;
    for (let idx = 0; idx < size; idx++) {
      if (backward ? p[idx] !== -1 : p[idx] !== depth) continue;
      const a = (idx / n2) | 0, b = idx - a * n2;
      for (let m = 0; m < nMoves; m++) {
        const j = move1[a * nMoves + m] * n2 + move2[b * nMoves + m];
        if (backward) {
          // sada tahů je uzavřená na inverze: soused v hloubce → my o 1 dál
          if (p[j] === depth) { p[idx] = depth + 1; filled++; break; }
        } else if (p[j] === -1) { p[j] = depth + 1; filled++; }
      }
    }
    depth++;
  }
  return p;
}

/** Postaví tabulky tahů a prořezávání (líně, jen jednou). */
export function init() {
  if (T) return;
  const c = identity();

  const twistMove = new Uint16Array(N_TWIST * 18);
  for (let t = 0; t < N_TWIST; t++) {
    setTwist(c, t);
    for (let m = 0; m < 18; m++) twistMove[t * 18 + m] = getTwist(multiply(c, MOVES[m]));
  }
  const flipMove = new Uint16Array(N_FLIP * 18);
  for (let f = 0; f < N_FLIP; f++) {
    setFlip(c, f);
    for (let m = 0; m < 18; m++) flipMove[f * 18 + m] = getFlip(multiply(c, MOVES[m]));
  }
  // slice: projdeme všechny rozmístění 4 hran střední vrstvy
  const sliceMove = new Uint16Array(N_SLICE * 18);
  for (let mask = 0; mask < 4096; mask++) {
    let bits = 0;
    for (let i = 0; i < 12; i++) bits += (mask >> i) & 1;
    if (bits !== 4) continue;
    const e = identity();
    let hi = 8, lo = 0;
    for (let i = 0; i < 12; i++) e.ep[i] = (mask >> i) & 1 ? hi++ : lo++;
    const s = getSlice(e.ep);
    for (let m = 0; m < 18; m++) sliceMove[s * 18 + m] = getSlice(multiply(e, MOVES[m]).ep);
  }

  const cpMove = new Uint16Array(N_PERM8 * 10);
  const epMove = new Uint16Array(N_PERM8 * 10);
  const e = identity();
  for (let i = 0; i < N_PERM8; i++) {
    setPerm(c.cp, 0, 8, i, 0);
    setPerm(e.ep, 0, 8, i, 0);
    for (let k = 0; k < 10; k++) {
      cpMove[i * 10 + k] = getPerm(multiply(c, MOVES[P2[k]]).cp, 0, 8);
      epMove[i * 10 + k] = getPerm(multiply(e, MOVES[P2[k]]).ep, 0, 8);
    }
  }
  const spMove = new Uint8Array(N_PERM4 * 10);
  const s4 = identity();
  for (let i = 0; i < N_PERM4; i++) {
    setPerm(s4.ep, 8, 4, i, 8);
    for (let k = 0; k < 10; k++) spMove[i * 10 + k] = getPerm(multiply(s4, MOVES[P2[k]]).ep, 8, 4);
  }

  T = {
    twistMove, flipMove, sliceMove, cpMove, epMove, spMove,
    pruneTS: buildPrune(N_TWIST, N_SLICE, twistMove, sliceMove, 18),
    pruneFS: buildPrune(N_FLIP, N_SLICE, flipMove, sliceMove, 18),
    pruneCS: buildPrune(N_PERM8, N_PERM4, cpMove, spMove, 10),
    pruneES: buildPrune(N_PERM8, N_PERM4, epMove, spMove, 10),
  };
}

// --- převody nálepky ↔ dílky ---

function toCubie(facelets) {
  const f = String(facelets).replace(/\s+/g, '').toUpperCase();
  if (!/^[URFDLB]{54}$/.test(f)) throw new Error('Očekávám 54 znaků z URFDLB');
  for (let i = 0; i < 6; i++) {
    if (f[i * 9 + 4] !== FACES[i]) throw new Error('Středy musí být v pořadí U R F D L B');
    if (f.split(FACES[i]).length !== 10) throw new Error(`Barva ${FACES[i]} nemá právě 9 nálepek`);
  }
  const c = identity();
  const seenC = new Uint8Array(8), seenE = new Uint8Array(12);
  for (let i = 0; i < 8; i++) {
    const fl = CORNER_FACELET[i];
    let ori = 0;
    while (ori < 3 && f[fl[ori]] !== 'U' && f[fl[ori]] !== 'D') ori++;
    const col1 = f[fl[(ori + 1) % 3]], col2 = f[fl[(ori + 2) % 3]];
    const j = CORNER_COLOR.findIndex((cc) => cc[1] === col1 && cc[2] === col2);
    if (ori === 3 || j < 0) throw new Error(`Neplatný roh na pozici ${CORNER_COLOR[i]}`);
    if (seenC[j]++) throw new Error(`Roh ${CORNER_COLOR[j]} je na kostce víckrát`);
    c.cp[i] = j; c.co[i] = ori;
  }
  for (let i = 0; i < 12; i++) {
    const a = f[EDGE_FACELET[i][0]], b = f[EDGE_FACELET[i][1]];
    let j = EDGE_COLOR.indexOf(a + b), o = 0;
    if (j < 0) { j = EDGE_COLOR.indexOf(b + a); o = 1; }
    if (j < 0) throw new Error(`Neplatná hrana na pozici ${EDGE_COLOR[i]}`);
    if (seenE[j]++) throw new Error(`Hrana ${EDGE_COLOR[j]} je na kostce víckrát`);
    c.ep[i] = j; c.eo[i] = o;
  }
  if (c.co.reduce((s, x) => s + x, 0) % 3) throw new Error('Nemožné natočení rohů (jeden roh je překroucený)');
  if (c.eo.reduce((s, x) => s + x, 0) % 2) throw new Error('Nemožné natočení hran (jedna hrana je překlopená)');
  if (parity(c.cp) !== parity(c.ep)) throw new Error('Nemožná permutace (prohozené dva dílky)');
  return c;
}

function parity(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) s ^= 1;
  return s;
}

function toFacelets(c) {
  const f = new Array(54);
  for (let i = 0; i < 6; i++) f[i * 9 + 4] = FACES[i];
  for (let i = 0; i < 8; i++) {
    for (let n = 0; n < 3; n++) f[CORNER_FACELET[i][(n + c.co[i]) % 3]] = CORNER_COLOR[c.cp[i]][n];
  }
  for (let i = 0; i < 12; i++) {
    for (let n = 0; n < 2; n++) f[EDGE_FACELET[i][(n + c.eo[i]) % 2]] = EDGE_COLOR[c.ep[i]][n];
  }
  return f.join('');
}

// --- hledání ---

/**
 * Najde řešení (vnější tahy URFDLB). Vrátí první řešení s délkou
 * ≤ maxLength; jinak zlepšuje až do timeLimit (ms) a vrátí nejlepší.
 * @param {string} facelets 54 znaků ve formátu Kociemba
 */
export function solve(facelets, { maxLength = 22, timeLimit = 3000 } = {}) {
  const cube = toCubie(facelets);
  init();
  const { twistMove, flipMove, sliceMove, cpMove, epMove, spMove, pruneTS, pruneFS, pruneCS, pruneES } = T;
  const deadline = Date.now() + timeLimit;
  const path = new Int8Array(64);
  let best = null, bestLen = 31, done = false, nodes = 0;

  const blocked = (m, depth) => {
    if (depth === 0) return false;
    const face = (m / 3) | 0, last = (path[depth - 1] / 3) | 0;
    return face === last || face === last - 3; // stejná stěna / protější v opačném pořadí
  };

  function phase2(cp, ep, sp, depth, togo) {
    if (togo === 0) return cp === 0 && ep === 0 && sp === 0;
    for (let k = 0; k < 10; k++) {
      const m = P2[k];
      if (blocked(m, depth)) continue;
      const ncp = cpMove[cp * 10 + k], nep = epMove[ep * 10 + k], nsp = spMove[sp * 10 + k];
      if (Math.max(pruneCS[ncp * 24 + nsp], pruneES[nep * 24 + nsp]) >= togo) continue;
      path[depth] = m;
      if (phase2(ncp, nep, nsp, depth + 1, togo - 1)) return true;
    }
    return false;
  }

  function startPhase2(depth1) {
    let c = cube;
    for (let i = 0; i < depth1; i++) c = multiply(c, MOVES[path[i]]);
    const cp = getPerm(c.cp, 0, 8), ep = getPerm(c.ep, 0, 8), sp = getPerm(c.ep, 8, 4);
    const limit = Math.min(bestLen - 1 - depth1, 18);
    for (let d2 = Math.max(pruneCS[cp * 24 + sp], pruneES[ep * 24 + sp]); d2 <= limit; d2++) {
      if (phase2(cp, ep, sp, depth1, d2)) {
        bestLen = depth1 + d2;
        best = Array.from(path.subarray(0, bestLen));
        if (bestLen <= maxLength) done = true;
        break;
      }
    }
  }

  function phase1(twist, flip, slice, depth, togo) {
    if (togo === 0) {
      if (twist === 0 && flip === 0 && slice === 0 && (depth === 0 || !IS_P2[path[depth - 1]])) startPhase2(depth);
      return;
    }
    for (let m = 0; m < 18; m++) {
      if (blocked(m, depth)) continue;
      const t = twistMove[twist * 18 + m], f = flipMove[flip * 18 + m], s = sliceMove[slice * 18 + m];
      if (Math.max(pruneTS[t * 495 + s], pruneFS[f * 495 + s]) >= togo) continue;
      path[depth] = m;
      phase1(t, f, s, depth + 1, togo - 1);
      if (done) return;
      if ((++nodes & 1023) === 0 && best && Date.now() > deadline) { done = true; return; }
    }
  }

  const t0 = getTwist(cube), f0 = getFlip(cube), s0 = getSlice(cube.ep);
  for (let d1 = Math.max(pruneTS[t0 * 495 + s0], pruneFS[f0 * 495 + s0]); d1 < bestLen && !done; d1++) {
    phase1(t0, f0, s0, 0, d1);
  }
  return best.map((m) => MOVE_NAMES[m]).join(' ');
}

// --- náhodný stav ---

function cryptoRand(n) {
  const buf = new Uint32Array(1);
  const lim = 0x100000000 - (0x100000000 % n); // bez zkreslení
  do globalThis.crypto.getRandomValues(buf); while (buf[0] >= lim);
  return buf[0] % n;
}

function shuffle(n, rand) {
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = rand(i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

/** Rovnoměrně náhodný řešitelný stav jako řetězec nálepek. */
export function randomCube(rand = cryptoRand) {
  const c = identity();
  c.cp = shuffle(8, rand);
  c.ep = shuffle(12, rand);
  // srovnání parity prohozením dvou hran – bijekce, rovnoměrnost zůstává
  if (parity(c.cp) !== parity(c.ep)) [c.ep[0], c.ep[1]] = [c.ep[1], c.ep[0]];
  setTwist(c, rand(N_TWIST));
  setFlip(c, rand(N_FLIP));
  return toFacelets(c);
}

const invertMove = (m) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : m + "'");

/** Zamíchání = inverze řešení náhodného stavu (aspoň 2 tahy). */
export function randomStateScramble(rand = cryptoRand) {
  for (;;) {
    const sol = solve(randomCube(rand));
    const moves = sol ? sol.split(' ') : [];
    if (moves.length >= 2) return moves.reverse().map(invertMove).join(' ');
  }
}
