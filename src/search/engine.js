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
// Navíc tabulka „blízko cíle“: všechny stavy sledovaných dílků do vzdálenosti K
// od cíle (zpětné BFS, dokud se vejde do limitu). Stav mimo ni je od cíle dál než
// K, takže heuristika je max(databáze, K + 1) a v posledních K tazích se prohledávají
// jen stavy z tabulky (setkání uprostřed). U dlouhých algoritmů s celou kostkou
// (např. PLL s mnoha druhy tahů) to ušetří většinu práce.
//
// Hledání nevrací jen optimum: projde délky optimum … optimum + extraDepth
// a vrátí všechny nalezené sekvence, které se pak řadí podle ergonomie.

import { MoveSet } from '../core/moveset.js';
import { CUBE3 } from '../puzzles/cube3.js';

// Pro každý hlavolam: typ dílku → seznam pozic (nálepek) daného typu
// a pozice → index v seznamu svého typu.
const TYPE_INFO = new WeakMap();
function typeInfo(puzzle) {
  let info = TYPE_INFO.get(puzzle);
  if (info) return info;
  const positions = {};
  const local = new Uint8Array(puzzle.size);
  for (const type of new Set(puzzle.slots.map((s) => s.type))) {
    positions[type] = puzzle.slots.filter((s) => s.type === type).flatMap((s) => s.facelets).sort((a, b) => a - b);
    positions[type].forEach((pos, i) => { local[pos] = i; });
  }
  info = { positions, local };
  TYPE_INFO.set(puzzle, info);
  return info;
}

const DEFAULT_TABLE_LIMIT = 24 ** 4;
const DEFAULT_NEAR_LIMIT = 0; // zapíná ji Lab (worker hledání)
export const NEAR_LIMIT = 1_500_000;
const UNREACHABLE = 255;

/**
 * Připraví úlohu: sledované dílky, přechodové tabulky a pattern databáze.
 * @param {object} p
 * @param {object} [p.puzzle] hlavolam (viz src/puzzles), výchozí 3×3
 * @param {Record<string,string>} p.constraints omezení dílků (viz core/constraints.js)
 * @param {Uint8Array} [p.target] cílový stav B
 * @param {{base:string, amount:number}[]} p.moves povolené tahy
 * @param {number} [p.tableLimit] max. velikost jedné pattern databáze
 * @param {number} [p.nearLimit] max. počet stavů v tabulce „blízko cíle“ (0 = bez ní)
 * @param {(info:{table:number, tables:number}) => void} [p.onTable]
 */
export function prepare({ puzzle = CUBE3, constraints, target = puzzle.solved(), moves, tableLimit = DEFAULT_TABLE_LIMIT, nearLimit = DEFAULT_NEAR_LIMIT, onTable }) {
  const { SLOT_OF, ORI_AT } = puzzle;
  const { positions: TYPE_POSITIONS, local: LOCAL } = typeInfo(puzzle);
  const moveCount = moves.length;
  const perms = moves.map((m) => puzzle.perm(m));
  // Typy dílků, se kterými povolené tahy vůbec nehýbou (např. středy 3×3 při tazích stěn).
  const movingTypes = new Set(Object.keys(TYPE_POSITIONS).filter((type) =>
    perms.some((to) => TYPE_POSITIONS[type].some((pos) => to[pos] !== pos))));

  // Sledované dílky a pro každý množina hodnot, které cíl splňují.
  const pieces = [];
  for (const slot of puzzle.slots) {
    let type = constraints[slot.name] ?? 'ignore';
    // dílek s jedinou nálepkou (střed) nemá natočení
    if (slot.facelets.length === 1) type = type === 'ignore' || type === 'orientation' ? 'ignore' : 'solved';
    if (type === 'ignore') continue;
    const ref = slot.facelets[0];
    const goalPos = target[ref];
    const positions = TYPE_POSITIONS[slot.type];
    const ok = Uint8Array.from(positions, (pos) => {
      if (type === 'solved') return pos === goalPos;
      if (type === 'permutation') return SLOT_OF[pos] === SLOT_OF[goalPos];
      return ORI_AT[pos] === ORI_AT[goalPos];
    });
    const faces = new Set(slot.facelets.map((f) => puzzle.stickerFace[f]));
    pieces.push({ name: slot.name, kind: slot.type, ref, size: positions.length, ok, constraint: type, faces, stickers: slot.facelets.length });
  }

  // Přechody: trans[type][m * size + v] = hodnota po tahu m.
  const trans = {};
  const invTrans = {};
  for (const type of Object.keys(TYPE_POSITIONS)) {
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

  // Dílky, se kterými povolené tahy nehýbou, se do heuristiky nezahrnují.
  const tracked = pieces.filter((p) => movingTypes.has(p.kind));
  const groups = makeGroups(tracked, tableLimit);
  const tables = groups.map((g, i) => {
    onTable?.({ table: i + 1, tables: groups.length + 1 });
    return buildTable(g, moveCount, invTrans);
  });
  onTable?.({ table: groups.length + 1, tables: groups.length + 1 });
  const near = buildNear(pieces, moveCount, invTrans, nearLimit);

  // Kanonické pořadí tahů a jejich zápis.
  const redundant = new Uint8Array(moveCount * moveCount);
  for (let a = 0; a < moveCount; a++) for (let b = 0; b < moveCount; b++) {
    redundant[a * moveCount + b] = puzzle.redundant(moves[a], moves[b]) ? 1 : 0;
  }

  return {
    puzzle, local: LOCAL,
    pieces, tables, near, trans, moves, moveCount, redundant,
    names: moves.map((m) => puzzle.moveToString(m)),
    pieceIndex: new Map(pieces.map((p, i) => [p.name, i])),
  };
}

// Rozdělí dílky do skupin pro pattern databáze. Dvě různá rozdělení
// (velký dílek + sousední menší / každý typ zvlášť) – heuristika bere maximum.
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
  // Sousedé: menší dílek, jehož barvy jsou podmnožinou barev většího (hrana u rohu).
  const bySize = [...pieces].sort((a, b) => b.stickers - a.stickers);
  const paired = [];
  const used = new Set();
  for (const big of bySize) {
    if (used.has(big)) continue;
    used.add(big);
    paired.push(big);
    for (const small of bySize) {
      if (!used.has(small) && small.stickers < big.stickers && [...small.faces].every((f) => big.faces.has(f))) {
        paired.push(small);
        used.add(small);
      }
    }
  }
  const kinds = [...new Set(bySize.map((p) => p.kind))];
  const separate = kinds.flatMap((k) => pieces.filter((p) => p.kind === k));

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

/**
 * Tabulka „blízko cíle“: vzdálenosti všech stavů (vektorů hodnot sledovaných dílků)
 * do vzdálenosti radius od cíle. Hašovací tabulka s otevřeným adresováním, klíče
 * jsou vektory po n bajtech. Vrací null, když se nevejde ani první vrstva.
 */
function buildNear(pieces, moveCount, invTrans, limit) {
  const n = pieces.length;
  if (!n || limit <= 0) return null;
  // cílové stavy = kartézský součin povolených hodnot dílků
  const okValues = pieces.map((p) => [...p.ok.keys()].filter((v) => p.ok[v] === 1));
  let goals = 1;
  for (const vs of okValues) { goals *= vs.length; if (goals > limit / 4) return null; }

  // velikost: mocnina dvou, zaplnění nejvýš ~70 %, klíče nejvýš ~48 MB
  let cap = 1;
  while (cap < limit / 0.7 && cap * 2 * n <= 48 * 2 ** 20) cap *= 2;
  limit = Math.min(limit, Math.floor(cap * 0.7));
  const mask = cap - 1;
  const keys = new Uint8Array(cap * n);
  const dist = new Uint8Array(cap).fill(UNREACHABLE);
  let count = 0;
  const hash = (v, off) => {
    let h = 2166136261;
    for (let i = 0; i < n; i++) h = Math.imul(h ^ v[off + i], 16777619);
    return (h ^ (h >>> 15)) & mask;
  };
  // najde slot klíče (nebo prázdný slot, kam patří)
  const slot = (v, off) => {
    let i = hash(v, off);
    for (;;) {
      if (dist[i] === UNREACHABLE) return i;
      let same = true;
      const k = i * n;
      for (let j = 0; j < n; j++) if (keys[k + j] !== v[off + j]) { same = false; break; }
      if (same) return i;
      i = (i + 1) & mask;
    }
  };

  // vrstva 0: cílové stavy
  let frontier = new Uint8Array(goals * n);
  {
    const digits = new Array(n).fill(0);
    for (let g = 0; g < goals; g++) {
      let r = g;
      for (let i = n - 1; i >= 0; i--) { const len = okValues[i].length; digits[i] = okValues[i][r % len]; r = Math.floor(r / len); }
      frontier.set(digits, g * n);
      const i = slot(frontier, g * n);
      if (dist[i] === UNREACHABLE) { keys.set(digits, i * n); dist[i] = 0; count++; }
    }
  }
  let radius = 0;
  const invs = pieces.map((p) => invTrans[p.kind]);
  const sizes = pieces.map((p) => p.size);
  const pred = new Uint8Array(n);
  for (;;) {
    const states = frontier.length / n;
    // další vrstva se musí vejít celá, jinak by tabulka neplatila pro vzdálenost radius + 1
    let next = new Uint8Array(Math.min(states * moveCount, limit) * n);
    let added = 0, full = false;
    for (let s = 0; s < states && !full; s++) {
      const off = s * n;
      for (let m = 0; m < moveCount; m++) {
        for (let i = 0; i < n; i++) pred[i] = invs[i][m * sizes[i] + frontier[off + i]];
        const at = slot(pred, 0);
        if (dist[at] !== UNREACHABLE) continue;
        if (count >= limit) { full = true; break; }
        keys.set(pred, at * n);
        dist[at] = radius + 1;
        count++;
        if (added * n >= next.length) { const bigger = new Uint8Array(next.length * 2); bigger.set(next); next = bigger; }
        next.set(pred, added * n);
        added++;
      }
    }
    if (full) {
      // nedokončenou vrstvu zahodit
      for (let i = 0; i < cap; i++) if (dist[i] === radius + 1) dist[i] = UNREACHABLE - 1;
      break;
    }
    if (!added) break;
    radius += 1;
    frontier = next.subarray(0, added * n);
  }
  // Pozn.: sloty z nedokončené vrstvy (UNREACHABLE - 1) zůstávají obsazené, aby
  // nepřerušily řetězce sond; při hledání se berou jako „mimo tabulku“.
  return {
    radius,
    /** Vzdálenost stavu od cíle, nebo -1 (dál než radius). */
    get(v) {
      const d = dist[slot(v, 0)];
      return d <= radius ? d : -1;
    },
    size: count,
  };
}

/** Převede stav kostky na vektor hodnot sledovaných dílků. */
export function encode(problem, loc) {
  return Uint8Array.from(problem.pieces, (p) => problem.local[loc[p.ref]]);
}

/**
 * Najde algoritmy z výchozího stavu do cíle.
 * @param {ReturnType<typeof prepare>} problem
 * @param {Uint8Array} start výchozí stav A (loc)
 * @param {object} [opts]
 * @param {number} [opts.maxLength] maximální počet tahů
 * @param {number} [opts.minLength] hledat až od této délky (kratší už jsou známé)
 * @param {number} [opts.extraDepth] kolik tahů nad optimum ještě hledat
 * @param {number} [opts.maxResults] po kolika výsledcích skončit
 * @param {number} [opts.timeLimit] časový limit v ms
 * @param {(alg:string, length:number) => void} [opts.onSolution]
 * @param {(info:{depth:number, nodes:number, found:number}) => void} [opts.onProgress]
 */
export function search(problem, start, {
  maxLength = 12, minLength = 1, extraDepth = 2, maxResults = 500, timeLimit = 15000, onSolution, onProgress,
} = {}) {
  const { pieces, tables, near, trans, moveCount, redundant, names, pieceIndex } = problem;
  const nearRadius = near ? near.radius : 0;
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

  // přesnější dolní odhad: tabulka blízko cíle (mimo ni je vzdálenost > radius)
  const estimate = (v) => {
    const h = heuristic(v);
    if (!near) return h;
    const d = near.get(v);
    return d >= 0 ? d : Math.max(h, nearRadius + 1);
  };

  const root = encode(problem, start);
  const result = (reason, extra = {}) => ({
    reason, solutions, nodes, elapsed: Date.now() - t0, ...extra,
  });
  let nodes = 0;
  if (isGoal(root)) return result('already-solved', { optimal: 0 });
  const h0 = estimate(root);
  if (heuristic(root) >= UNREACHABLE) return result('unsolvable');

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
      // posledních nearRadius tahů: jen stavy z tabulky blízko cíle
      if (remaining <= nearRadius) {
        const d = near.get(next);
        if (d < 0 || d > remaining) continue;
      }
      dfs(depth + 1, m);
      if (stopped) return;
    }
  };

  let optimal = null;
  for (bound = Math.max(1, h0, minLength); bound <= maxLength; bound++) {
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
export function findAlgs({ puzzle, start, constraints, target, moveSet, ...opts }) {
  const problem = prepare({ puzzle, constraints, target, moves: (moveSet ?? new MoveSet()).moves() });
  return search(problem, start, opts);
}
