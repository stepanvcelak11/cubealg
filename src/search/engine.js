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
 * @param {Uint8Array[]} [p.targets] víc cílů (stačí splnit kterýkoli, např. cíl po AUF)
 * @param {{base:string, amount:number}[]} p.moves povolené tahy
 * @param {number} [p.tableLimit] max. velikost jedné pattern databáze
 * @param {number} [p.nearLimit] max. počet stavů v tabulce „blízko cíle“ (0 = bez ní)
 * @param {(info:{table:number, tables:number}) => void} [p.onTable]
 * @param {{get:(key:string) => Uint8Array|undefined, set:(key:string, dist:Uint8Array) => void}} [p.cache]
 *   uložené pattern databáze (podle obsahu: hlavolam, tahy, cíle dílků skupiny)
 */
export function prepare({ puzzle = CUBE3, constraints, target = puzzle.solved(), targets = [target], moves, tableLimit = DEFAULT_TABLE_LIMIT, nearLimit = DEFAULT_NEAR_LIMIT, onTable, cache }) {
  const { positions: TYPE_POSITIONS, local: LOCAL } = typeInfo(puzzle);
  const moveCount = moves.length;
  const perms = moves.map((m) => puzzle.perm(m));
  // Typy dílků, se kterými povolené tahy vůbec nehýbou (např. středy 3×3 při tazích stěn).
  const movingTypes = new Set(Object.keys(TYPE_POSITIONS).filter((type) =>
    perms.some((to) => TYPE_POSITIONS[type].some((pos) => to[pos] !== pos))));

  const pieces = trackedPieces(puzzle, constraints, targets);
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
  // s tabulkou blízko cíle stačí jedno rozdělení (druhé skoro nezlepší odhad, jen zdržuje)
  const groups = makeGroups(tracked, tableLimit, nearLimit > 0);
  const tables = groups.map((g, i) => {
    onTable?.({ table: i + 1, tables: groups.length + 1 });
    const key = cache && tableKey(puzzle, moves, g);
    const hit = key && cache.get(key);
    if (hit && hit.length === g.reduce((a, p) => a * p.size, 1)) return { pieces: g.map((p) => p.name), sizes: g.map((p) => p.size), dist: hit };
    const t = buildTable(g, moveCount, invTrans);
    if (key) cache.set(key, t.dist);
    return t;
  });
  onTable?.({ table: groups.length + 1, tables: groups.length + 1 });
  const near = buildNear(pieces, moveCount, invTrans, nearLimit);

  // Kanonické pořadí tahů a jejich zápis.
  const redundant = new Uint8Array(moveCount * moveCount);
  for (let a = 0; a < moveCount; a++) for (let b = 0; b < moveCount; b++) {
    redundant[a * moveCount + b] = puzzle.redundant(moves[a], moves[b]) ? 1 : 0;
  }

  return {
    puzzle, local: LOCAL, targetCount: targets.length,
    pieces, tables, near, trans, moves, moveCount, redundant,
    names: moves.map((m) => puzzle.moveToString(m)),
    pieceIndex: new Map(pieces.map((p, i) => [p.name, i])),
  };
}

/** Sledované dílky a pro každý (a každý cíl) množina hodnot, které cíl splňují. */
function trackedPieces(puzzle, constraints, targets) {
  const { SLOT_OF, ORI_AT } = puzzle;
  const { positions: TYPE_POSITIONS } = typeInfo(puzzle);
  const pieces = [];
  // „barva na místě“ ({ allow }: povolené polohy ref vůči prvnímu cíli) – pro další
  // cíle (AUF) se polohy přenesou stejně, jako se liší cíle: target[0][k] → t[k]
  const moveTo = targets.map((t) => { const m = new Uint8Array(puzzle.size); for (let k = 0; k < puzzle.size; k++) m[targets[0][k]] = t[k]; return m; });
  for (const slot of puzzle.slots) {
    let type = constraints[slot.name] ?? 'ignore';
    const allow = typeof type === 'object' && type ? type.allow : null;
    if (allow) type = 'allow';
    // dílek s jedinou nálepkou (střed) nemá natočení
    if (slot.facelets.length === 1 && !allow) type = type === 'ignore' || type === 'orientation' ? 'ignore' : 'solved';
    if (type === 'ignore') continue;
    const ref = slot.facelets[0];
    const positions = TYPE_POSITIONS[slot.type];
    // pro každý cíl: které hodnoty dílku ho splňují
    const oks = targets.map((t, ti) => Uint8Array.from(positions, (pos) => {
      const goalPos = t[ref];
      if (allow) return allow.some((a) => moveTo[ti][a] === pos);
      if (type === 'solved') return pos === goalPos;
      if (type === 'permutation') return SLOT_OF[pos] === SLOT_OF[goalPos];
      return ORI_AT[pos] === ORI_AT[goalPos];
    }));
    const faces = new Set(slot.facelets.map((f) => puzzle.stickerFace[f]));
    pieces.push({ name: slot.name, kind: slot.type, ref, size: positions.length, ok: oks[0], oks, constraint: type, faces, stickers: slot.facelets.length });
  }
  return pieces;
}

// Rozdělí dílky do skupin pro pattern databáze. Dvě různá rozdělení
// (velký dílek + sousední menší / každý typ zvlášť) – heuristika bere maximum.
function makeGroups(pieces, limit, single = false) {
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
  if (single) return a;
  const b = chunk(separate);
  const key = (gs) => gs.map((g) => g.map((p) => p.name).join(',')).sort().join('|');
  return key(a) === key(b) ? a : [...a, ...b];
}

/** Klíč pattern databáze podle obsahu (hlavolam, tahy, typy a cíle dílků skupiny). */
function tableKey(puzzle, moves, group) {
  const text = [puzzle.id, moves.map((m) => puzzle.moveToString(m)).join(' '),
    ...group.map((p) => `${p.kind}:${p.oks.map((o) => o.join('')).join('/')}`)].join('|');
  let h1 = 2166136261, h2 = 5381;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (Math.imul(h2, 33) + c) | 0; }
  return `${(h1 >>> 0).toString(36)}.${(h2 >>> 0).toString(36)}.${text.length}`;
}

/** Klíče pattern databází, které prepare() se stejnými parametry použije (pro načtení z úložiště). */
export function tableKeys({ puzzle = CUBE3, constraints, target = puzzle.solved(), targets = [target], moves, tableLimit = DEFAULT_TABLE_LIMIT, nearLimit = DEFAULT_NEAR_LIMIT }) {
  const { positions } = typeInfo(puzzle);
  const perms = moves.map((m) => puzzle.perm(m));
  const moving = new Set(Object.keys(positions).filter((type) => perms.some((to) => positions[type].some((pos) => to[pos] !== pos))));
  const tracked = trackedPieces(puzzle, constraints, targets).filter((p) => moving.has(p.kind));
  return makeGroups(tracked, tableLimit, nearLimit > 0).map((g) => tableKey(puzzle, moves, g));
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

  // Cílové stavy: každý dílek má hodnotu z povolené množiny (aspoň pro jeden cíl).
  let frontier = 0;
  const targets = group[0].oks.length;
  for (let idx = 0; idx < total; idx++) {
    decode(idx);
    let any = false;
    for (let t = 0; t < targets && !any; t++) {
      let ok = true;
      for (let i = 0; i < k && ok; i++) ok = group[i].oks[t][digits[i]] === 1;
      any = ok;
    }
    if (any) { dist[idx] = 0; frontier++; }
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
  // cílové stavy = pro každý cíl kartézský součin povolených hodnot dílků
  const products = pieces[0].oks.map((_, t) => pieces.map((p) => [...p.oks[t].keys()].filter((v) => p.oks[t][v] === 1)));
  let goals = 0;
  for (const okValues of products) {
    let g = 1;
    for (const vs of okValues) { g *= vs.length; if (g > limit / 4) return null; }
    goals += g;
    if (goals > limit / 4) return null;
  }

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
    let at = 0;
    for (const okValues of products) {
      const g0 = okValues.reduce((a, vs) => a * vs.length, 1);
      for (let g = 0; g < g0; g++) {
        let r = g;
        for (let i = n - 1; i >= 0; i--) { const len = okValues[i].length; digits[i] = okValues[i][r % len]; r = Math.floor(r / len); }
        frontier.set(digits, at * n);
        const i = slot(frontier, at * n);
        if (dist[i] === UNREACHABLE) { keys.set(digits, i * n); dist[i] = 0; count++; at++; }
      }
    }
    frontier = frontier.subarray(0, at * n);
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

/**
 * Pattern databáze pro vybranou skupinu sledovaných dílků (indexy do problem.pieces)
 * vůči prvnímu cíli; pro etapové hledání (staged.js). Vrací vzdálenosti jako buildTable.
 */
export function groupTable(problem, indexes) {
  problem.invTrans ??= Object.fromEntries(Object.entries(problem.trans).map(([type, t]) => {
    const size = t.length / problem.moveCount;
    const inv = new Uint8Array(t.length);
    for (let m = 0; m < problem.moveCount; m++) for (let v = 0; v < size; v++) inv[m * size + t[m * size + v]] = v;
    return [type, inv];
  }));
  const group = indexes.map((i) => ({ ...problem.pieces[i], oks: [problem.pieces[i].oks[0]] }));
  return buildTable(group, problem.moveCount, problem.invTrans);
}

/** Převede stav kostky na vektor hodnot sledovaných dílků. */
export function encode(problem, loc) {
  return Uint8Array.from(problem.pieces, (p) => problem.local[loc[p.ref]]);
}

/** Výchozí stavy hledání: jeden stav, nebo víc (např. po AUF) jako [{loc, pre}]. */
function rootsOf(problem, start) {
  const list = start instanceof Uint8Array || Array.isArray(start) && typeof start[0] === 'number' ? [{ loc: start, pre: null }] : start;
  return list.map((r, i) => ({ ...r, index: i, v: encode(problem, Uint8Array.from(r.loc)) }));
}

/** Společné části hledání: cíl, heuristika a odhad vzdálenosti. */
export function evaluator(problem) {
  const { pieces, tables, near, pieceIndex, targetCount } = problem;
  const n = pieces.length;
  const tableIdx = tables.map((t) => t.pieces.map((name) => pieceIndex.get(name)));
  const nearRadius = near ? near.radius : 0;
  const oks = Array.from({ length: targetCount }, (_, t) => pieces.map((p) => p.oks[t]));
  /** Index splněného cíle, nebo −1. */
  const goalOf = (v) => {
    for (let t = 0; t < targetCount; t++) {
      const ok = oks[t];
      let i = 0;
      while (i < n && ok[i][v[i]] === 1) i++;
      if (i === n) return t;
    }
    return -1;
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
  return { goalOf, heuristic, estimate, near, nearRadius };
}

/**
 * Najde algoritmy z výchozího stavu do cíle.
 * @param {ReturnType<typeof prepare>} problem
 * @param {Uint8Array | {loc: Uint8Array, pre: any}[]} start výchozí stav A (loc), nebo víc výchozích stavů
 * @param {object} [opts]
 * @param {number} [opts.maxLength] maximální počet tahů
 * @param {number} [opts.minLength] hledat až od této délky (kratší už jsou známé)
 * @param {number} [opts.extraDepth] kolik tahů nad optimum ještě hledat
 * @param {number} [opts.maxResults] po kolika výsledcích skončit
 * @param {number} [opts.timeLimit] časový limit v ms
 * @param {{index:number, count:number}} [opts.shard] prohledá jen svůj díl (výchozí stav × první tah)
 *   – víc workerů tak hledá souběžně každý jinou část
 * @param {number} [opts.skip] na první délce přeskočit tolik větví (pokračování přerušeného hledání)
 * @param {(alg:string, length:number, info:{pre:any, target:number}) => void} [opts.onSolution]
 * @param {(info:{depth:number, nodes:number, found:number}) => void} [opts.onProgress]
 * @returns výsledek; `cleared` = všechny délky pod touto hodnotou jsou (v tomto dílu) prohledané bez řešení
 */
export function search(problem, start, {
  maxLength = 12, minLength = 1, extraDepth = 2, maxResults = 500, timeLimit = 15000, shard, skip = 0, onSolution, onProgress,
} = {}) {
  const { pieces, trans, moveCount, redundant, names } = problem;
  const { goalOf, heuristic, estimate, near, nearRadius } = evaluator(problem);
  const n = pieces.length;
  const t0 = Date.now();
  const solutions = [];
  const piecesTrans = pieces.map((p) => trans[p.kind]);
  const sizes = pieces.map((p) => p.size);

  const roots = rootsOf(problem, start);
  const result = (reason, extra = {}) => ({
    reason, solutions, nodes, elapsed: Date.now() - t0, ...extra,
  });
  let nodes = 0;
  if (roots.some((r) => goalOf(r.v) >= 0)) return result('already-solved', { optimal: 0, cleared: 0 });
  if (roots.every((r) => heuristic(r.v) >= UNREACHABLE)) return result('unsolvable', { cleared: Infinity });
  for (const r of roots) r.h = estimate(r.v);
  const h0 = Math.min(...roots.map((r) => r.h));

  const stack = Array.from({ length: maxLength + 1 }, () => new Uint8Array(n));
  const path = new Int16Array(maxLength);
  let bound = 0;
  let stopped = null;
  let root = null;
  let branch = 0; // pořadí větve (výchozí stav × první tah) pro rozdělení mezi workery
  let skipNow = 0; // kolik větví přeskočit na této délce
  let doneBranches = 0; // dokončené větve na této délce (pro pokračování)

  const dfs = (depth, prev) => {
    const cur = stack[depth];
    const next = stack[depth + 1];
    for (let m = 0; m < moveCount; m++) {
      if (prev >= 0 && redundant[prev * moveCount + m]) continue;
      if (depth === 0) {
        const idx = branch++;
        if (idx < skipNow || (shard && idx % shard.count !== shard.index)) { doneBranches = Math.max(doneBranches, idx + 1); continue; }
      }
      for (let i = 0; i < n; i++) next[i] = piecesTrans[i][m * sizes[i] + cur[i]];
      if (++nodes % 8192 === 0) {
        if (Date.now() - t0 > timeLimit) { stopped = 'time'; return; }
        onProgress?.({ depth: bound, nodes, found: solutions.length });
      }
      const remaining = bound - depth - 1;
      const goal = goalOf(next);
      path[depth] = m;
      if (remaining === 0) {
        if (goal >= 0) {
          const alg = Array.from(path.subarray(0, bound), (i) => names[i]).join(' ');
          solutions.push(alg);
          onSolution?.(alg, bound, { pre: root.pre, target: goal });
          if (solutions.length >= maxResults) { stopped = 'results'; return; }
        }
        continue;
      }
      // Pokud cíl splní už kratší prefix, prodlužování nemá smysl.
      if (goal >= 0) continue;
      if (heuristic(next) > remaining) continue;
      // posledních nearRadius tahů: jen stavy z tabulky blízko cíle
      if (remaining <= nearRadius) {
        const d = near.get(next);
        if (d < 0 || d > remaining) continue;
      }
      dfs(depth + 1, m);
      if (stopped) return;
      if (depth === 0) doneBranches = branch;
    }
  };

  let optimal = null;
  const first = Math.max(1, h0, minLength);
  let cleared = first;
  for (bound = first; bound <= maxLength; bound++) {
    const before = solutions.length;
    branch = 0;
    doneBranches = 0;
    skipNow = bound === first ? skip : 0;
    for (const r of roots) {
      if (r.h > bound) { branch += moveCount; doneBranches = branch; continue; }
      root = r;
      stack[0].set(r.v);
      dfs(0, -1);
      if (stopped) break;
    }
    if (optimal === null && solutions.length) optimal = bound;
    onProgress?.({ depth: bound, nodes, found: solutions.length });
    if (stopped) break;
    if (solutions.length === before && optimal === null) cleared = bound + 1;
    if (optimal !== null && bound >= optimal + extraDepth) break;
  }
  return result(stopped ?? (solutions.length ? 'done' : 'not-found'), { optimal, depth: Math.min(bound, maxLength), cleared, branch: doneBranches });
}

/**
 * Hledání podle pohodlí (větve a meze) pro jednu přesnou délku: prochází do
 * hloubky, levnější tahy první, a zahodí větev, jakmile cena + dolní odhad zbytku
 * (zbývající tahy × nejlevnější tah) dosáhne ceny nejlepšího známého řešení. Každé
 * lepší nalezené řešení mez zpřísní. Při pevné délce je odhad zbytku přesný v počtu
 * tahů, takže drahé tahy (F, S, přehmaty) se rychle odříznou.
 * @param {ReturnType<typeof prepare>} problem
 * @param {Uint8Array | {loc: Uint8Array, pre: any}[]} start
 * @param {object} opts
 * @param {{start:number, step:(ctx:number, m:number) => number, cost:(ctx:number, m:number) => number}} opts.cost
 *   model ceny: stav ruky je číslo, step = nový stav po tahu m, cost = cena tahu m
 * @param {number} opts.minMove dolní mez ceny jednoho tahu
 * @param {number} opts.bound cena nejlepšího známého řešení (hledá se levnější)
 * @param {number} opts.length délka hledaných řešení
 * @param {number} [opts.timeLimit]
 * @param {{index:number, count:number}} [opts.shard]
 * @param {number} [opts.skip] přeskočit tolik větví (navázání; `branch` z minulého výsledku)
 * @param {(alg:string, cost:number, info:{pre:any, target:number}) => void} [opts.onSolution]
 * @param {(info:{nodes:number}) => void} [opts.onProgress]
 */
export function searchCost(problem, start, { cost, minMove, bound, length, timeLimit = 5000, shard, skip = 0, onSolution, onProgress }) {
  const { pieces, trans, moveCount, redundant, names } = problem;
  const { goalOf, heuristic, near, nearRadius } = evaluator(problem);
  const n = pieces.length;
  const t0 = Date.now();
  const piecesTrans = pieces.map((p) => trans[p.kind]);
  const sizes = pieces.map((p) => p.size);
  const roots = rootsOf(problem, start);
  const stack = Array.from({ length: length + 1 }, () => new Uint8Array(n));
  const path = new Int16Array(length);
  const order = Array.from({ length }, () => new Int16Array(moveCount));
  const costs = Array.from({ length }, () => new Float64Array(moveCount));
  let nodes = 0, found = 0, stopped = null, root = null, done = skip;

  const dfs = (depth, prev, ctx, g) => {
    const cur = stack[depth];
    const next = stack[depth + 1];
    const remaining = length - depth - 1;
    const rest = remaining * minMove;
    // tahy seřazené od nejlevnějšího (dřív najde dobré řešení → silnější mez)
    const ord = order[depth], cs = costs[depth];
    let k = 0;
    for (let m = 0; m < moveCount; m++) {
      if (prev >= 0 && redundant[prev * moveCount + m]) continue;
      if (depth === 0 && shard && m % shard.count !== shard.index) continue;
      cs[m] = cost.cost(ctx, m);
      let j = k++;
      while (j > 0 && cs[ord[j - 1]] > cs[m]) { ord[j] = ord[j - 1]; j--; }
      ord[j] = m;
    }
    for (let q = 0; q < k; q++) {
      const m = ord[q];
      // větve (výchozí stav × první tah) v pevném pořadí – pro navázání
      const idx = depth === 0 ? root.index * moveCount + q : 0;
      if (depth === 0 && idx < skip) continue;
      const g2 = g + cs[m];
      if (g2 + rest >= bound) break; // další tahy jsou ještě dražší
      for (let i = 0; i < n; i++) next[i] = piecesTrans[i][m * sizes[i] + cur[i]];
      if (++nodes % 8192 === 0) {
        if (Date.now() - t0 > timeLimit) { stopped = 'time'; return; }
        onProgress?.({ nodes });
      }
      path[depth] = m;
      const goal = goalOf(next);
      if (remaining === 0) {
        if (goal >= 0) {
          bound = g2;
          found++;
          onSolution?.(Array.from(path, (i) => names[i]).join(' '), g2, { pre: root.pre, target: goal });
        }
      } else if (goal < 0 && heuristic(next) <= remaining) { // kratší řešení už je (goal ≥ 0)
        let ok = true;
        if (remaining <= nearRadius) { const d = near.get(next); ok = d >= 0 && d <= remaining; }
        if (ok) { dfs(depth + 1, m, cost.step(ctx, m), g2); if (stopped) return; }
      }
      if (depth === 0) done = idx + 1;
    }
    if (depth === 0) done = Math.max(done, (root.index + 1) * moveCount);
  };
  for (const r of roots) {
    if (goalOf(r.v) >= 0 || (r.index + 1) * moveCount <= skip) continue;
    root = r;
    stack[0].set(r.v);
    dfs(0, -1, cost.start, 0);
    if (stopped) break;
  }
  return { reason: stopped ?? 'done', nodes, found, bound, branch: done, elapsed: Date.now() - t0 };
}

/** Pohodlná varianta: vše v jednom volání. */
export function findAlgs({ puzzle, start, constraints, target, moveSet, ...opts }) {
  const problem = prepare({ puzzle, constraints, target, moves: (moveSet ?? new MoveSet()).moves() });
  return search(problem, start, opts);
}
