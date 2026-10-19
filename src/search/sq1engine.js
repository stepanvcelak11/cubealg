// Hledání algoritmů pro Square-1: IDA* podle počtu řezů.
//
// Algoritmus má tvar  (a,b) / (a,b) / … / (a,b)  – mezi řezy je vždy jedno
// otočení vrstev (povolená otočení volí uživatel), na konci volitelné
// zarovnání. Délka = počet řezů.
//
// Heuristika: pro každý sledovaný dílek tabulka nad (tvar, pozice dílku),
// pro cílový tvar tabulka nad tvary. Hodnota = nejmenší počet řezů do cíle
// (zpětné BFS); otočení mezi řezy jsou „zdarma“, takže tabulky stačí
// spočítat po krocích „otočení + řez“.

import { solvedState, turn, slash, canSlash, PIECE_NAMES, sq1MoveToString } from '../puzzles/sq1.js';

const UNSET = 255;
const AMOUNTS = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6];
const mod12 = (x) => ((x % 12) + 12) % 12;
const isCornerVal = (v) => (v >> 1) >= 8;

// --- Tvary jako bitové masky ----------------------------------------------------------
// Maska vrstvy: bit i = na pozici i začíná dílek (ve směru rostoucího indexu).
// Roh je na i, když bit i je a bit i+1 není.

const rotMask = (m, k) => { k = mod12(k); return ((m << k) | (m >>> (12 - k))) & 0xfff; };
const bit = (m, i) => (m >> mod12(i)) & 1;

/** Masky (horní, spodní) ze stavu. */
function masksOf(s) {
  let t = 0, b = 0;
  for (let i = 0; i < 12; i++) {
    const v = s[i];
    if (!isCornerVal(v) || (v & 1) === 0) t |= 1 << i;          // nahoře první půlka = začátek
    const w = s[12 + i];
    if (!isCornerVal(w) || (w & 1) === 1) b |= 1 << i;          // dole první půlka je na vyšším indexu
  }
  return [t, b];
}

const slashable = (t, b) => bit(t, 0) && bit(t, 6) && bit(b, 0) && bit(b, 6);

// Délky dílků v pozicích 0–5 (v pořadí indexů), obrácené, znovu jako bity.
function flipHalf(src, dst) {
  const lens = [];
  for (let i = 0; i < 6;) { const len = bit(src, i + 1) ? 1 : 2; lens.push(len); i += len; }
  let m = dst & ~0x3f;
  let i = 0;
  for (const len of lens.reverse()) { m |= 1 << i; i += len; }
  return m;
}
const slashMasks = (t, b) => [flipHalf(b, t), flipHalf(t, b)];

// Platné masky vrstvy: každé nule (druhá půlka rohu) předchází jednička.
let LAYERS = null;
function layers() {
  if (LAYERS) return LAYERS;
  const masks = [];
  const id = new Int16Array(4096).fill(-1);
  for (let m = 1; m < 4096; m++) {
    let ok = true;
    for (let i = 0; i < 12 && ok; i++) if (!bit(m, i) && !bit(m, i - 1)) ok = false;
    if (ok) { id[m] = masks.length; masks.push(m); }
  }
  const M = masks.length;
  const rot = new Int16Array(M * 12);
  const corners = new Uint8Array(M);
  const cut = new Uint8Array(M); // řez nepřekračuje roh (začátky na 0 a 6)
  masks.forEach((m, i) => {
    for (let k = 0; k < 12; k++) rot[i * 12 + k] = id[rotMask(m, k)];
    for (let j = 0; j < 12; j++) if (bit(m, j) && !bit(m, j + 1)) corners[i]++;
    cut[i] = bit(m, 0) && bit(m, 6) ? 1 : 0;
  });
  LAYERS = { masks, id, M, rot, corners, cut };
  return LAYERS;
}

// Uzly tabulek = tvary těsně po řezu (obě vrstvy připravené na řez, 8 rohů).
let NODES = null;
function nodes() {
  if (NODES) return NODES;
  const L = layers();
  const { M } = L;
  const index = new Int32Array(M * M * 2).fill(-1);
  const list = [];
  for (let t = 0; t < M; t++) {
    if (!L.cut[t]) continue;
    for (let b = 0; b < M; b++) {
      if (!L.cut[b] || L.corners[t] + L.corners[b] !== 8) continue;
      for (let mid = 0; mid < 2; mid++) { index[(t * M + b) * 2 + mid] = list.length / 3; list.push(t, b, mid); }
    }
  }
  // řez: (horní, spodní) → nové masky (jen pro dvojice připravené na řez)
  const slashT = new Int16Array(M * M).fill(-1), slashB = new Int16Array(M * M).fill(-1);
  for (let t = 0; t < M; t++) for (let b = 0; b < M; b++) {
    if (!L.cut[t] || !L.cut[b]) continue;
    const [t2, b2] = slashMasks(L.masks[t], L.masks[b]);
    slashT[t * M + b] = L.id[t2];
    slashB[t * M + b] = L.id[b2];
  }
  NODES = { index, list: Int16Array.from(list), count: list.length / 3, slashT, slashB };
  return NODES;
}

const nodeOf = (t, b, mid) => nodes().index[(t * layers().M + b) * 2 + mid];

// Pozice (0–23) po otočení a po řezu.
const turnPos = (p, a, b) => (p < 12 ? mod12(p + a) : 12 + mod12(p - 12 - b));
const slashPos = (p) => (p < 6 ? 12 + 5 - p : p >= 12 && p < 18 ? 5 - (p - 12) : p);

// Předchůdci uzlů (sdílené všemi tabulkami pro danou sadu otočení):
// x je předchůdce y, když řez(otočení(x, a, c)) = y.
const PREDS = new Map();
function predecessors(top, bottom) {
  const key = `${top}|${bottom}`;
  if (PREDS.has(key)) return PREDS.get(key);
  const L = layers(), N = nodes();
  const { M, rot, cut } = L;
  const start = new Int32Array(N.count + 1);
  const xs = [], as = [], cs = [];
  const A = [0, ...top], C = [0, ...bottom];
  for (let y = 0; y < N.count; y++) {
    start[y] = xs.length;
    const t = N.list[y * 3], b = N.list[y * 3 + 1], mid = N.list[y * 3 + 2] ^ 1;
    const zt = N.slashT[t * M + b], zb = N.slashB[t * M + b];
    for (const a of A) {
      const tx = rot[zt * 12 + mod12(-a)];
      if (!cut[tx]) continue;
      for (const c of C) {
        const bx = rot[zb * 12 + mod12(c)];
        if (!cut[bx]) continue;
        const x = N.index[(tx * M + bx) * 2 + mid];
        if (x >= 0) { xs.push(x); as.push(a); cs.push(c); }
      }
    }
  }
  start[N.count] = xs.length;
  const out = { start, xs: Int32Array.from(xs), as: Int8Array.from(as), cs: Int8Array.from(cs) };
  PREDS.set(key, out);
  return out;
}

/**
 * Tabulka vzdáleností (v řezech) nad uzly (tvar po řezu, pozice) nebo jen tvary.
 * isSeed(t, b, mid, p) – zda je uzel cílový po některém koncovém otočení.
 */
function buildTable(top, bottom, withPos, isSeed) {
  const N = nodes();
  const P = withPos ? 24 : 1;
  const dist = new Uint8Array(N.count * P).fill(UNSET);
  let frontier = new Int32Array(N.count * P);
  let size = 0;
  for (let y = 0; y < N.count; y++) {
    const t = N.list[y * 3], b = N.list[y * 3 + 1], mid = N.list[y * 3 + 2];
    for (let p = 0; p < P; p++) {
      if (isSeed(t, b, mid, p)) { dist[y * P + p] = 0; frontier[size++] = y * P + p; }
    }
  }
  const { start, xs, as, cs } = predecessors(top, bottom);
  let next = new Int32Array(N.count * P);
  for (let d = 0; size && d < UNSET - 1; d++) {
    let nsize = 0;
    for (let f = 0; f < size; f++) {
      const id = frontier[f];
      const y = withPos ? (id / 24) | 0 : id;
      const p2 = withPos ? slashPos(id % 24) : 0;
      for (let k = start[y], end = start[y + 1]; k < end; k++) {
        let x = xs[k] * P;
        if (withPos) {
          // otočení zpět: nahoře −a, dole +c (pozice dole se otáčí opačně)
          x += p2 < 12 ? (((p2 - as[k]) % 12) + 12) % 12 : 12 + (((p2 - 12 + cs[k]) % 12) + 12) % 12;
        }
        if (dist[x] === UNSET) { dist[x] = d + 1; next[nsize++] = x; }
      }
    }
    [frontier, next] = [next, frontier];
    size = nsize;
  }
  return dist;
}

/**
 * @param {object} p
 * @param {Record<string,string>} p.constraints název dílku → solved | permutation | orientation | ignore
 * @param {Int8Array} p.target cílový stav
 * @param {boolean} [p.shape] zda musí sedět i tvar (včetně prostřední vrstvy)
 * @param {number[]} [p.top] povolená otočení horní vrstvy (bez 0)
 * @param {number[]} [p.bottom] povolená otočení spodní vrstvy (bez 0)
 */
export function prepareSq1({ constraints, target, shape = true, top = AMOUNTS, bottom = AMOUNTS, onTable }) {
  const L = layers();
  const finals = [];
  for (const a of [0, ...top]) for (const c of [0, ...bottom]) finals.push([a, c]);
  const pieces = [];
  const where = new Map(); // dílek → pozice první půlky v cíli
  for (let i = 0; i < 24; i++) if ((target[i] & 1) === 0) where.set(target[i] >> 1, i);
  for (const [name, type] of Object.entries(constraints)) {
    if (!type || type === 'ignore') continue;
    const piece = PIECE_NAMES.indexOf(name);
    if (piece < 0) throw new Error(`Neznámý dílek „${name}“`);
    const goalPos = where.get(piece);
    const ok = type === 'orientation' ? (p) => (p < 12) === (goalPos < 12) : (p) => p === goalPos;
    // pozice, ze kterých se do cíle dostane koncovým otočením
    const okAfterFinal = Uint8Array.from({ length: 24 }, (_, p) => (finals.some(([a, c]) => ok(turnPos(p, a, c))) ? 1 : 0));
    pieces.push({ name, piece, type, goalPos, ok, okAfterFinal });
  }
  const [tm, bm] = masksOf(target);
  const targetShape = [L.id[tm], L.id[bm], target[24]];
  const shapeOk = (t, b, mid) => mid === targetShape[2]
    && finals.some(([a, c]) => L.rot[t * 12 + mod12(a)] === targetShape[0] && L.rot[b * 12 + mod12(-c)] === targetShape[1]);
  const total = pieces.length + (shape ? 1 : 0);
  const tables = pieces.map((pc, i) => {
    onTable?.({ table: i + 1, tables: total });
    return buildTable(top, bottom, true, (t, b, mid, p) => pc.okAfterFinal[p] === 1);
  });
  let shapeTable = null;
  if (shape) {
    onTable?.({ table: total, tables: total });
    shapeTable = buildTable(top, bottom, false, (t, b, mid) => shapeOk(t, b, mid));
  }
  // pohodlnější (menší) otočení napřed, ať první nalezená řešení nejsou zbytečně krkolomná
  const turns = finals.slice().sort((x, y) => Math.abs(x[0]) + Math.abs(x[1]) - Math.abs(y[0]) - Math.abs(y[1]));
  return { pieces, tables, shapeTable, targetShape, turns, finals, shape, target, shapeOk };
}

/**
 * IDA* po řezech. Výsledky jsou zápisy „(a,b)/ … (a,b)“.
 * @param {ReturnType<typeof prepareSq1>} problem
 * @param {Int8Array} start
 */
export function searchSq1(problem, start, {
  maxLength = 10, extraDepth = 1, maxResults = 500, timeLimit = 15000, onSolution, onProgress, turnCost = defaultTurnCost,
} = {}) {
  const { pieces, tables, shapeTable, turns, finals, shape } = problem;
  const L = layers();
  const t0 = Date.now();
  const solutions = [];
  let nodes = 0;
  let stopped = null;

  const posOf = (s, piece) => { for (let i = 0; i < 24; i++) if (s[i] === piece * 2) return i; return -1; };
  // heuristika jen pro stavy po řezu (uzly tabulek)
  const heuristic = (s) => {
    const [tm, bm] = masksOf(s);
    const y = nodeOf(L.id[tm], L.id[bm], s[24]);
    if (y < 0) return UNSET;
    let h = shape ? shapeTable[y] : 0;
    for (let i = 0; i < pieces.length; i++) {
      const d = tables[i][y * 24 + posOf(s, pieces[i].piece)];
      if (d > h) h = d;
    }
    return h;
  };
  const isGoal = (s) => {
    for (const pc of pieces) if (!pc.ok(posOf(s, pc.piece))) return false;
    if (shape) {
      const [tm, bm] = masksOf(s);
      const [tt, tb, tmid] = problem.targetShape;
      if (L.id[tm] !== tt || L.id[bm] !== tb || s[24] !== tmid) return false;
    }
    return true;
  };
  // nejlevnější koncové otočení, po kterém je cíl splněný
  const finalTurn = (s) => {
    let best = null;
    for (const [a, c] of finals) {
      if (best && turnCost(a, c) >= best.cost) continue;
      if (isGoal(turn(s, a, c))) best = { a, c, cost: turnCost(a, c) };
    }
    return best;
  };

  const path = [];
  const result = (reason, extra = {}) => ({ reason, solutions, nodes, elapsed: Date.now() - t0, ...extra });
  const s0 = Int8Array.from(start);
  if (finalTurn(s0)) {
    const f = finalTurn(s0);
    if (!f.a && !f.c) return result('already-solved', { optimal: 0 });
  }
  // výchozí stav nemusí být „po řezu“: odhad přes první otočení + řez
  let h0 = UNSET;
  for (const [a, c] of turns) {
    const t = turn(s0, a, c);
    if (canSlash(t)) h0 = Math.min(h0, 1 + heuristic(slash(t)));
  }
  if (h0 >= UNSET) return result('unsolvable');

  const emit = (f) => {
    const parts = path.map(([a, c]) => `${a || c ? `(${a},${c})` : ''}/`);
    if (f.a || f.c) parts.push(`(${f.a},${f.c})`);
    const alg = parts.join(' ').trim();
    solutions.push(alg);
    onSolution?.(alg, path.length);
    if (solutions.length >= maxResults) stopped = 'results';
  };

  const dfs = (s, left) => {
    if (left === 0) {
      const f = finalTurn(s);
      if (f) emit(f);
      return;
    }
    for (const [a, c] of turns) {
      if (!a && !c && path.length) continue; // „/ /“ se ruší
      const t = turn(s, a, c);
      if (!canSlash(t)) continue;
      const next = slash(t);
      if (++nodes % 4096 === 0) {
        if (Date.now() - t0 > timeLimit) { stopped = 'time'; return; }
        onProgress?.({ depth: bound, nodes, found: solutions.length });
      }
      if (heuristic(next) > left - 1) continue;
      path.push([a, c]);
      // kratší prefix už cíl splňuje → delší varianta nemá smysl
      if (left - 1 > 0 && finalTurn(next)) { path.pop(); continue; }
      dfs(next, left - 1);
      path.pop();
      if (stopped) return;
    }
  };

  let bound;
  let optimal = null;
  for (bound = Math.max(1, h0); bound <= maxLength; bound++) {
    dfs(s0, bound);
    if (optimal === null && solutions.length) optimal = bound;
    onProgress?.({ depth: bound, nodes, found: solutions.length });
    if (stopped) break;
    if (optimal !== null && bound >= optimal + extraDepth) break;
  }
  return result(stopped ?? (solutions.length ? 'done' : 'not-found'), { optimal, depth: Math.min(bound, maxLength) });
}

/** Výchozí cena otočení (jen pro výběr koncového zarovnání). */
export function defaultTurnCost(a, c) {
  return Math.abs(a) + Math.abs(c);
}

export { sq1MoveToString };
