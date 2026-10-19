// Vyhledávání algoritmů: IDA* nad dílky, které cíl sleduje.
//
// Stav při hledání je jen vektor hodnot sledovaných dílků (kde leží jejich
// referenční nálepka – to určuje místo i natočení), takže tahy jsou rychlé
// a stačí tabulky pro 24 (hrany, rohy) nebo 6 (středy) hodnot.
//
// Heuristika = maximum z pattern databází. Každá databáze pokrývá skupinu
// až ~4 dílků a obsahuje přesnou vzdálenost k cíli pro tuto skupinu
// (spočtenou zpětným BFS jen s povolenými tahy), takže je přípustná.
//
// Hledání nevrací jen optimum: projde délky optimum … optimum + extraDepth
// a vrátí všechny nalezené sekvence, které se pak řadí podle ergonomie.

import { SLOTS, SLOT_OF, ORI_AT } from '../core/geometry.js';
import { movePermutation, solved } from '../core/cube.js';
import { MOVE_DEFS, moveToString } from '../core/notation.js';
import { MoveSet } from '../core/moveset.js';

const TYPE_POSITIONS = {};   // typ dílku → seznam pozic (nálepek) daného typu
const LOCAL = new Uint8Array(54); // pozice → index v seznamu svého typu
for (const type of ['center', 'edge', 'corner']) {
  TYPE_POSITIONS[type] = SLOTS.filter((s) => s.type === type).flatMap((s) => s.facelets).sort((a, b) => a - b);
  TYPE_POSITIONS[type].forEach((pos, i) => { LOCAL[pos] = i; });
}

const DEFAULT_TABLE_LIMIT = 24 ** 4;
const UNREACHABLE = 255;

/**
 * Připraví úlohu: sledované dílky, přechodové tabulky a pattern databáze.
 * @param {object} p
 * @param {Record<string,string>} p.constraints omezení dílků (viz core/constraints.js)
 * @param {Uint8Array} [p.target] cílový stav B
 * @param {{base:string, amount:number}[]} p.moves povolené tahy
 * @param {number} [p.tableLimit] max. velikost jedné pattern databáze
 * @param {(info:{table:number, tables:number}) => void} [p.onTable]
 */
export function prepare({ constraints, target = solved(), moves, tableLimit = DEFAULT_TABLE_LIMIT, onTable }) {
  const moveCount = moves.length;
  const perms = moves.map(movePermutation);
  const centersMove = moves.some((m) => MOVE_DEFS[m.base].kind !== 'face');

  // Sledované dílky a pro každý množina hodnot, které cíl splňují.
  const pieces = [];
  for (const slot of SLOTS) {
    let type = constraints[slot.name] ?? 'ignore';
    if (slot.type === 'center') type = type === 'ignore' || type === 'orientation' ? 'ignore' : 'solved';
    if (type === 'ignore') continue;
    const ref = slot.facelets[0];
    const goalPos = target[ref];
    const positions = TYPE_POSITIONS[slot.type];
    const ok = Uint8Array.from(positions, (pos) => {
      if (type === 'solved') return pos === goalPos;
      if (type === 'permutation') return SLOT_OF[pos] === SLOT_OF[goalPos];
      return ORI_AT[pos] === ORI_AT[goalPos];
    });
    pieces.push({ name: slot.name, kind: slot.type, ref, size: positions.length, ok, constraint: type });
  }

  // Přechody: trans[type][m * size + v] = hodnota po tahu m.
  const trans = {};
  const invTrans = {};
  for (const type of ['center', 'edge', 'corner']) {
    const positions = TYPE_POSITIONS[type];
    const size = positions.length;
    const t = new Uint8Array(moveCount * size);
    const inv = new Uint8Array(moveCount * size);
    perms.forEach((to, m) => positions.forEach((pos, v) => {
      const w = LOCAL[to[pos]];
      t[m * size + v] = w;
      inv[m * size + w] = v;
    }));
    trans[type] = t;
    invTrans[type] = inv;
  }

  // Středy, se kterými povolené tahy nehýbou, se do heuristiky nezahrnují.
  const tracked = pieces.filter((p) => p.kind !== 'center' || centersMove);
  const groups = makeGroups(tracked, tableLimit);
  const tables = groups.map((g, i) => {
    onTable?.({ table: i + 1, tables: groups.length });
    return buildTable(g, moveCount, invTrans);
  });

  // Kanonické pořadí tahů a jejich zápis.
  const redundant = new Uint8Array(moveCount * moveCount);
  for (let a = 0; a < moveCount; a++) for (let b = 0; b < moveCount; b++) {
    redundant[a * moveCount + b] = MoveSet.redundant(moves[a], moves[b]) ? 1 : 0;
  }

  return {
    pieces, tables, trans, moves, moveCount, redundant,
    names: moves.map(moveToString),
    pieceIndex: new Map(pieces.map((p, i) => [p.name, i])),
  };
}

// Rozdělí dílky do skupin pro pattern databáze. Dvě různá rozdělení
// (roh + sousední hrany / hrany a rohy zvlášť) – heuristika bere maximum.
function makeGroups(pieces, limit) {
  const chunk = (list) => {
    const out = [];
    let cur = [], size = 1;
    for (const p of list) {
      if (cur.length && size * p.size > limit) { out.push(cur); cur = []; size = 1; }
      cur.push(p); size *= p.size;
    }
    if (cur.length) out.push(cur);
    return out;
  };
  const corners = pieces.filter((p) => p.kind === 'corner');
  const edges = pieces.filter((p) => p.kind === 'edge');
  const centers = pieces.filter((p) => p.kind === 'center');

  const paired = [];
  const used = new Set();
  for (const c of corners) {
    paired.push(c);
    for (const e of edges) {
      if (!used.has(e) && [...e.name].every((f) => c.name.includes(f))) { paired.push(e); used.add(e); }
    }
  }
  paired.push(...edges.filter((e) => !used.has(e)), ...centers);
  const separate = [...edges, ...corners, ...centers];

  const a = chunk(paired);
  const b = chunk(separate);
  const key = (gs) => gs.map((g) => g.map((p) => p.name).join(',')).sort().join('|');
  return key(a) === key(b) ? a : [...a, ...b];
}

function buildTable(group, moveCount, invTrans) {
  const k = group.length;
  const sizes = group.map((p) => p.size);
  const total = sizes.reduce((a, b) => a * b, 1);
  const dist = new Uint8Array(total).fill(UNREACHABLE);
  const digits = new Uint8Array(k);
  const decode = (idx) => {
    for (let i = k - 1; i >= 0; i--) { digits[i] = idx % sizes[i]; idx = (idx - digits[i]) / sizes[i]; }
  };

  // Cílové stavy: každý dílek má hodnotu z povolené množiny.
  let frontier = 0;
  for (let idx = 0; idx < total; idx++) {
    decode(idx);
    let ok = true;
    for (let i = 0; i < k && ok; i++) ok = group[i].ok[digits[i]] === 1;
    if (ok) { dist[idx] = 0; frontier++; }
  }

  // Zpětné BFS: předchůdce stavu s tahem m získáme inverzní přechodovou tabulkou.
  const invs = group.map((p) => invTrans[p.kind]);
  for (let d = 0; frontier > 0 && d < UNREACHABLE - 1; d++) {
    frontier = 0;
    for (let idx = 0; idx < total; idx++) {
      if (dist[idx] !== d) continue;
      decode(idx);
      for (let m = 0; m < moveCount; m++) {
        let pred = 0;
        for (let i = 0; i < k; i++) pred = pred * sizes[i] + invs[i][m * sizes[i] + digits[i]];
        if (dist[pred] === UNREACHABLE) { dist[pred] = d + 1; frontier++; }
      }
    }
  }
  return { pieces: group.map((p) => p.name), sizes, dist };
}

/** Převede stav kostky na vektor hodnot sledovaných dílků. */
export function encode(problem, loc) {
  return Uint8Array.from(problem.pieces, (p) => LOCAL[loc[p.ref]]);
}

/**
 * Najde algoritmy z výchozího stavu do cíle.
 * @param {ReturnType<typeof prepare>} problem
 * @param {Uint8Array} start výchozí stav A (loc)
 * @param {object} [opts]
 * @param {number} [opts.maxLength] maximální počet tahů
 * @param {number} [opts.extraDepth] kolik tahů nad optimum ještě hledat
 * @param {number} [opts.maxResults] po kolika výsledcích skončit
 * @param {number} [opts.timeLimit] časový limit v ms
 * @param {(alg:string, length:number) => void} [opts.onSolution]
 * @param {(info:{depth:number, nodes:number, found:number}) => void} [opts.onProgress]
 */
export function search(problem, start, {
  maxLength = 12, extraDepth = 2, maxResults = 500, timeLimit = 15000, onSolution, onProgress,
} = {}) {
  const { pieces, tables, trans, moveCount, redundant, names, pieceIndex } = problem;
  const n = pieces.length;
  const t0 = Date.now();
  const solutions = [];
  const piecesTrans = pieces.map((p) => trans[p.kind]);
  const sizes = pieces.map((p) => p.size);
  const tableIdx = tables.map((t) => t.pieces.map((name) => pieceIndex.get(name)));

  const isGoal = (v) => {
    for (let i = 0; i < n; i++) if (pieces[i].ok[v[i]] !== 1) return false;
    return true;
  };
  const heuristic = (v) => {
    let h = 0;
    for (let t = 0; t < tables.length; t++) {
      const { sizes: s, dist } = tables[t];
      const ids = tableIdx[t];
      let idx = 0;
      for (let i = 0; i < ids.length; i++) idx = idx * s[i] + v[ids[i]];
      const d = dist[idx];
      if (d > h) h = d;
    }
    return h;
  };

  const root = encode(problem, start);
  const result = (reason, extra = {}) => ({
    reason, solutions, nodes, elapsed: Date.now() - t0, ...extra,
  });
  let nodes = 0;
  if (isGoal(root)) return result('already-solved', { optimal: 0 });
  const h0 = heuristic(root);
  if (h0 >= UNREACHABLE) return result('unsolvable');

  const stack = Array.from({ length: maxLength + 1 }, () => new Uint8Array(n));
  const path = new Int16Array(maxLength);
  let bound = 0;
  let stopped = null;

  const dfs = (depth, prev) => {
    const cur = stack[depth];
    const next = stack[depth + 1];
    for (let m = 0; m < moveCount; m++) {
      if (prev >= 0 && redundant[prev * moveCount + m]) continue;
      for (let i = 0; i < n; i++) next[i] = piecesTrans[i][m * sizes[i] + cur[i]];
      if (++nodes % 8192 === 0) {
        if (Date.now() - t0 > timeLimit) { stopped = 'time'; return; }
        onProgress?.({ depth: bound, nodes, found: solutions.length });
      }
      const remaining = bound - depth - 1;
      const goal = isGoal(next);
      path[depth] = m;
      if (remaining === 0) {
        if (goal) {
          const alg = Array.from(path.subarray(0, bound), (i) => names[i]).join(' ');
          solutions.push(alg);
          onSolution?.(alg, bound);
          if (solutions.length >= maxResults) { stopped = 'results'; return; }
        }
        continue;
      }
      // Pokud cíl splní už kratší prefix, prodlužování nemá smysl.
      if (goal) continue;
      if (heuristic(next) > remaining) continue;
      dfs(depth + 1, m);
      if (stopped) return;
    }
  };

  let optimal = null;
  for (bound = Math.max(1, h0); bound <= maxLength; bound++) {
    stack[0].set(root);
    dfs(0, -1);
    if (optimal === null && solutions.length) optimal = bound;
    onProgress?.({ depth: bound, nodes, found: solutions.length });
    if (stopped) break;
    if (optimal !== null && bound >= optimal + extraDepth) break;
  }
  return result(stopped ?? (solutions.length ? 'done' : 'not-found'), { optimal, depth: Math.min(bound, maxLength) });
}

/** Pohodlná varianta: vše v jednom volání. */
export function findAlgs({ start, constraints, target, moveSet, ...opts }) {
  const problem = prepare({ constraints, target, moves: (moveSet ?? new MoveSet()).moves() });
  return search(problem, start, opts);
}
