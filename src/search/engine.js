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

import { clock } from './clock.js';
import { MoveSet } from '../core/moveset.js';
import { CUBE3 } from '../puzzles/cube3.js';
import { kernelFits, idaRoot, costSearch, buildTableKernel, buildCostTableKernel, buildNearKernel } from './kernel.js';
import { expandIdentical } from '../core/constraints.js';

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
/** Velké databáze (skupiny 5–6 dílků, zapíná klient podle paměti zařízení). */
export const BIG_TABLE_LIMIT = 24 ** 5;
// databáze větší než tohle se ukládají po 4 bitech (vzdálenost nejvýš 14, 15 = nedosažitelné)
const PACK_ABOVE = DEFAULT_TABLE_LIMIT;
const PACKED_UNREACHABLE = 15;

/** Zabalí vzdálenosti po 4 bitech (delší než 14 → 14, což je pořád dolní mez). */
function pack(dist) {
  const out = new Uint8Array((dist.length + 1) >> 1);
  for (let i = 0; i < dist.length; i++) {
    const d = dist[i];
    const v = d === UNREACHABLE ? PACKED_UNREACHABLE : Math.min(d, PACKED_UNREACHABLE - 1);
    out[i >> 1] |= v << ((i & 1) << 2);
  }
  return out;
}
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
  // zaměnitelné dílky (středy velkých kostek) jako skupinová pravidla
  constraints = expandIdentical(puzzle, constraints, targets[0]);
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
  const tracked = pieces.filter((p) => movingTypes.has(p.kind) && p.constraint !== 'free');
  // s tabulkou blízko cíle stačí jedno rozdělení (druhé skoro nezlepší odhad, jen zdržuje)
  const groups = makeGroups(tracked, tableLimit, nearLimit > 0);
  const tables = groups.map((g, i) => {
    onTable?.({ table: i + 1, tables: groups.length + 1 });
    const key = cache && tableKey(puzzle, moves, g);
    const hit = key && cache.get(key);
    const total = g.reduce((a, p) => a * p.size, 1);
    const packed = total > PACK_ABOVE;
    if (hit && hit.length === (packed ? (total + 1) >> 1 : total)) return { pieces: g.map((p) => p.name), sizes: g.map((p) => p.size), dist: hit, packed };
    const t = buildTable(g, moveCount, invTrans);
    if (packed) { t.dist = pack(t.dist); t.packed = true; }
    if (key) cache.set(key, t.dist);
    return t;
  });
  // menší skupiny pro databáze ceny (16 bitů na stav – velké skupiny by zabraly moc paměti)
  const smallGroups = tableLimit > DEFAULT_TABLE_LIMIT ? makeGroups(tracked, DEFAULT_TABLE_LIMIT, true) : groups;
  onTable?.({ table: groups.length + 1, tables: groups.length + 1 });
  const near = buildNear(pieces, moveCount, invTrans, nearLimit);
  // skupinová pravidla: přesné databáze podle toho, kde leží sledované nálepky skupiny
  const classTables = (constraints['#classes'] ?? []).map((c) => classTable(puzzle, c, pieces, moves, invTrans, cache));

  // Kanonické pořadí tahů a jejich zápis.
  // Navíc dvojice, která je dohromady jen jeden povolený tah (nebo nic): M' r' = R', r R' = M'
  // – zbytečně dlouhý zápis, a hodnocení by ho mohlo vzít za pohodlnější.
  const redundant = new Uint8Array(moveCount * moveCount);
  const solvedState = puzzle.solved();
  const key = (st) => st.join(',');
  // (bloky – víc tahů jako jeden krok – stav po sobě nemají, ty se neporovnávají)
  const apply = (st, m) => { try { return puzzle.applyAlg(st, [m]); } catch { return null; } };
  const after = moves.map((m) => apply(solvedState, m));
  const single = new Set([key(solvedState), ...after.filter(Boolean).map(key)]);
  for (let a = 0; a < moveCount; a++) for (let b = 0; b < moveCount; b++) {
    const both = after[a] && after[b] && apply(after[a], moves[b]);
    redundant[a * moveCount + b] = puzzle.redundant(moves[a], moves[b]) || (both && single.has(key(both))) ? 1 : 0;
  }

  return {
    puzzle, local: LOCAL, targetCount: targets.length,
    pieces, tables, smallGroups, near, trans, moves, moveCount, redundant, classTables,
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
  // dílky skupinových pravidel, které jinak nic neomezuje: sledují se (kvůli databázím
  // skupin), ale každá hodnota je pro ně v pořádku
  const have = new Set(pieces.map((p) => p.name));
  for (const c of constraints['#classes'] ?? []) {
    for (const name of c.pieces) {
      if (have.has(name)) continue;
      have.add(name);
      const slot = puzzle.slotByName(name);
      const size = TYPE_POSITIONS[slot.type].length;
      const all = new Uint8Array(size).fill(1);
      pieces.push({ name: slot.name, kind: slot.type, ref: slot.facelets[0], size, ok: all, oks: targets.map(() => all), constraint: 'free',
        faces: new Set(slot.facelets.map((f) => puzzle.stickerFace[f])), stickers: slot.facelets.length });
    }
  }
  return pieces;
}

// --- Skupinová pravidla -----------------------------------------------------------------------
// Stav skupiny = množina pozic jejích sledovaných nálepek (dílky jsou zaměnitelné), jako
// maska nad pozicemi jednoho typu (24 u hran i rohů). Databáze má C(24, k) stavů a dává
// přesnou vzdálenost, za kolik tahů lze místa obsadit (zpětné BFS od všech cílových množin).
const BINOM = Array.from({ length: 33 }, (_, n) => { const r = [1]; for (let k = 1; k <= n; k++) r.push((r[k - 1] * (n - k + 1)) / k); return r; });
const binom = (n, k) => (k < 0 || k > n ? 0 : BINOM[n][k]);
const CLASS_CACHE = new Map(); // klíč → dist (i bez cache workeru; stejná pravidla se opakují)

/** Tabulky pro pořadí masky po bajtech: rankTab[b][c][x] = příspěvek bajtu b, když před ním je c bitů. */
function rankTables(size, k) {
  const bytes = Math.ceil(size / 8);
  return Array.from({ length: bytes }, (_, b) => Array.from({ length: k + 1 }, (_, c) => {
    const t = new Uint32Array(256);
    for (let x = 0; x < 256; x++) {
      let r = 0, i = c;
      for (let j = 0; j < 8; j++) if (x & (1 << j)) { r += binom(8 * b + j, i + 1); i++; }
      t[x] = r;
    }
    return t;
  }));
}
const POP = Uint8Array.from({ length: 256 }, (_, x) => { let n = 0; for (let j = 0; j < 8; j++) n += (x >> j) & 1; return n; });

function classTable(puzzle, rule, pieces, moves, invTrans, cache) {
  const { positions: TYPE_POSITIONS, local: LOCAL } = typeInfo(puzzle);
  const slot0 = puzzle.slotByName(rule.pieces[0]);
  const kind = slot0.type;
  const positions = TYPE_POSITIONS[kind];
  const size = positions.length;
  if (size > 32) throw new Error('Skupinové pravidlo: moc pozic');
  // pro každý sledovaný dílek a nálepku: hodnota dílku (poloha ref) → pozice nálepky (lokálně)
  const index = new Map(pieces.map((p, i) => [p.name, i]));
  const maps = [];
  rule.pieces.forEach((name, i) => {
    const slot = puzzle.slotByName(name);
    for (const o of rule.stickers[i]) {
      maps.push({ piece: index.get(slot.name), map: Uint8Array.from(positions, (q) => {
        const T = puzzle.slots[puzzle.SLOT_OF[q]];
        const j = T.facelets.indexOf(q);
        return LOCAL[T.facelets[(j + o) % T.facelets.length]];
      }) });
    }
  });
  const k = maps.length;
  const placeMasks = Uint32Array.from(rule.places, (pl) => pl.reduce((m, pos) => (m | (1 << LOCAL[pos])) >>> 0, 0));
  const rt = rankTables(size, k);
  const bytes = rt.length;
  const rank = (mask) => {
    let r = 0, c = 0;
    for (let b = 0; b < bytes; b++) { const x = (mask >>> (8 * b)) & 255; r += rt[b][c][x]; c += POP[x]; }
    return r;
  };
  const isGoal = (mask) => { for (let i = 0; i < placeMasks.length; i++) if (!(mask & placeMasks[i])) return false; return true; };
  const total = binom(size, k);
  const key = `cls|${puzzle.id}|${kind}|${k}|${moves.map((m) => puzzle.moveToString(m)).join(' ')}|${[...placeMasks].join(',')}`;
  let dist = CLASS_CACHE.get(key) ?? cache?.get(key);
  if (!dist || dist.length !== total) {
    // tah na masku po bajtech: permTab[m][b][x] = obraz bitů bajtu b při zpětném tahu m
    const inv = invTrans[kind];
    const moveCount = moves.length;
    const permTab = Array.from({ length: moveCount }, (_, m) => Array.from({ length: bytes }, (_, b) => {
      const t = new Uint32Array(256);
      for (let x = 0; x < 256; x++) {
        let r = 0;
        for (let j = 0; j < 8; j++) if (x & (1 << j) && 8 * b + j < size) r |= 1 << inv[m * size + 8 * b + j];
        t[x] = r >>> 0;
      }
      return t;
    }));
    dist = new Uint8Array(total).fill(255);
    const queue = new Uint32Array(total);
    let head = 0, tail = 0;
    // všechny masky s k bity (Gosperův trik), cílové do fronty
    if (k === 0) { dist[0] = 0; queue[tail++] = 0; } else {
      let mask = (2 ** k - 1) >>> 0;
      const limit = 2 ** size;
      while (mask < limit) {
        if (isGoal(mask)) { dist[rank(mask)] = 0; queue[tail++] = mask; }
        const c = mask & -mask, r = mask + c;
        mask = (((r ^ mask) >>> 2) / c | r) >>> 0;
        if (r >= limit) break;
      }
    }
    while (head < tail) {
      const mask = queue[head++];
      const d = dist[rank(mask)] + 1;
      for (let m = 0; m < moveCount; m++) {
        const pt = permTab[m];
        let nm = 0;
        for (let b = 0; b < bytes; b++) nm |= pt[b][(mask >>> (8 * b)) & 255];
        nm >>>= 0;
        const r = rank(nm);
        if (dist[r] === 255) { dist[r] = d; queue[tail++] = nm; }
      }
    }
    CLASS_CACHE.set(key, dist);
    if (CLASS_CACHE.size > 24) CLASS_CACHE.delete(CLASS_CACHE.keys().next().value);
    cache?.set(key, dist);
  }
  return { kind, maps, placeMasks, rank, dist, k };
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
  const tracked = trackedPieces(puzzle, constraints, targets).filter((p) => moving.has(p.kind) && p.constraint !== 'free');
  return makeGroups(tracked, tableLimit, nearLimit > 0).map((g) => tableKey(puzzle, moves, g));
}

function buildTable(group, moveCount, invTrans) {
  const k = group.length;
  const sizes = group.map((p) => p.size);
  const total = sizes.reduce((a, b) => a * b, 1);
  const fast = buildTableKernel(group, moveCount, invTrans);
  if (fast) return { pieces: group.map((p) => p.name), sizes, dist: fast };
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
 * Databáze ceny: pro skupinu dílků nejnižší cena (součet dolních mezí cen tahů,
 * v celých jednotkách `q`, zaokrouhleno dolů) do cíle – Dijkstra s kbelíky po
 * zpětných tazích. Cena tahu je dolní mez bez ohledu na stav ruky, takže odhad je
 * přípustný i pro hledání podle pohodlí.
 * @param {number[]} weights cena každého tahu v jednotkách q (celá čísla ≥ 1)
 */
function buildCostTable(group, moveCount, invTrans, weights) {
  const k = group.length;
  const sizes = group.map((p) => p.size);
  const total = sizes.reduce((a, b) => a * b, 1);
  const fast = buildCostTableKernel(group, moveCount, invTrans, weights);
  if (fast) return { pieces: group.map((p) => p.name), sizes, dist: fast };
  const INF = 0xffff;
  const dist = new Uint16Array(total).fill(INF);
  const digits = new Uint8Array(k);
  const decode = (idx) => {
    for (let i = k - 1; i >= 0; i--) { digits[i] = idx % sizes[i]; idx = (idx - digits[i]) / sizes[i]; }
  };
  const buckets = [[]];
  const targets = group[0].oks.length;
  for (let idx = 0; idx < total; idx++) {
    decode(idx);
    for (let t = 0; t < targets; t++) {
      let ok = true;
      for (let i = 0; i < k && ok; i++) ok = group[i].oks[t][digits[i]] === 1;
      if (ok) { dist[idx] = 0; buckets[0].push(idx); break; }
    }
  }
  const invs = group.map((p) => invTrans[p.kind]);
  for (let d = 0; d < buckets.length; d++) {
    const list = buckets[d];
    if (!list) continue;
    for (let j = 0; j < list.length; j++) {
      const idx = list[j];
      if (dist[idx] !== d) continue;
      decode(idx);
      for (let m = 0; m < moveCount; m++) {
        const nd = d + weights[m];
        if (nd >= INF) continue;
        let pred = 0;
        for (let i = 0; i < k; i++) pred = pred * sizes[i] + invs[i][m * sizes[i] + digits[i]];
        if (nd < dist[pred]) { dist[pred] = nd; (buckets[nd] ??= []).push(pred); }
      }
    }
    buckets[d] = null;
  }
  return { pieces: group.map((p) => p.name), sizes, dist };
}

/**
 * Databáze ceny pro skupiny dílků úlohy (stejné skupiny jako databáze vzdáleností).
 * Vrací funkci: dolní mez ceny ze stavu do cíle.
 * @param {number[]} floors dolní mez ceny každého tahu
 * @param {object} [opts] q = jednotka (zaokrouhlení dolů), cache = uložené databáze
 */
const costGroups = (problem) => problem.smallGroups ?? problem.tables.map((t) => t.pieces.map((name) => problem.pieces[problem.pieceIndex.get(name)]));
const costWeights = (floors, q) => floors.map((f) => Math.max(1, Math.floor(f / q + 1e-9)));
const costKey = (problem, g, weights) => `cost:${tableKey(problem.puzzle, problem.moves, g)}:${weights.join(',')}`;

/** Klíče databází ceny (pro načtení z úložiště před costTables). */
export function costTableKeys(problem, floors, { q = 0.05 } = {}) {
  const weights = costWeights(floors, q);
  return costGroups(problem).map((g) => costKey(problem, g, weights));
}

export function costTables(problem, floors, { q = 0.05, cache } = {}) {
  problem.invTrans ??= invertTrans(problem);
  const weights = costWeights(floors, q);
  const groups = costGroups(problem);
  const tables = groups.map((g) => {
    const key = cache && costKey(problem, g, weights);
    const hit = key && cache.get(key);
    const total = g.reduce((a, p) => a * p.size, 1);
    if (hit && hit.length === total * 2) return { sizes: g.map((p) => p.size), dist: new Uint16Array(hit.buffer, hit.byteOffset, total) };
    const t = buildCostTable(g, problem.moveCount, problem.invTrans, weights);
    if (key) cache.set(key, new Uint8Array(t.dist.buffer));
    return t;
  });
  const ids = groups.map((g) => Int32Array.from(g, (p) => problem.pieceIndex.get(p.name)));
  const sizes = tables.map((t) => Int32Array.from(t.sizes));
  const dists = tables.map((t) => t.dist);
  const hcost = (v) => {
    let h = 0;
    for (let t = 0; t < dists.length; t++) {
      const id = ids[t], sz = sizes[t];
      let idx = 0;
      for (let i = 0; i < id.length; i++) idx = idx * sz[i] + v[id[i]];
      const d = dists[t][idx];
      if (d > h) h = d;
    }
    return h === 0xffff ? Infinity : h * q;
  };
  hcost.data = { ids, sizes, dists, q }; // pro jádro (kernel.js)
  return hcost;
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
  const fast = buildNearKernel(pieces, moveCount, invTrans, limit, cap);
  let keys = new Uint8Array(fast ? 0 : cap * n);
  let dist = fast ? null : new Uint8Array(cap).fill(UNREACHABLE);
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

  let radius = 0;
  if (fast) ({ keys, dist, radius, count } = fast);
  else radius = layers();
  // Pozn.: sloty z nedokončené vrstvy (UNREACHABLE - 1) zůstávají obsazené, aby
  // nepřerušily řetězce sond; při hledání se berou jako „mimo tabulku“.
  return {
    radius, keys, dist, mask, // surová tabulka pro jádro (kernel.js)
    /** Vzdálenost stavu od cíle, nebo -1 (dál než radius). */
    get(v) {
      const d = dist[slot(v, 0)];
      return d <= radius ? d : -1;
    },
    size: count,
  };

  // zpětné BFS po vrstvách (bez jádra WebAssembly); vrací dosažený poloměr
  function layers() {
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
    return radius;
  }
}

/** Inverzní přechody (předchůdce hodnoty po tahu) pro každý typ dílku. */
function invertTrans(problem) {
  return Object.fromEntries(Object.entries(problem.trans).map(([type, t]) => {
    const size = t.length / problem.moveCount;
    const inv = new Uint8Array(t.length);
    for (let m = 0; m < problem.moveCount; m++) for (let v = 0; v < size; v++) inv[m * size + t[m * size + v]] = v;
    return [type, inv];
  }));
}

/**
 * Pattern databáze pro vybranou skupinu sledovaných dílků (indexy do problem.pieces)
 * vůči prvnímu cíli; pro etapové hledání (staged.js). Vrací vzdálenosti jako buildTable.
 */
export function groupTable(problem, indexes) {
  problem.invTrans ??= invertTrans(problem);
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

/** Průměrná vzdálenost v databázi (nedosažitelné se nepočítají; vzorek u velkých). */
function meanOf(dist, packed = false) {
  const n = packed ? dist.length * 2 : dist.length;
  const step = Math.max(1, Math.floor(n / 200000));
  let sum = 0, count = 0;
  for (let i = 0; i < n; i += step) {
    const d = packed ? (dist[i >> 1] >> ((i & 1) << 2)) & 15 : dist[i];
    if (d < (packed ? PACKED_UNREACHABLE : UNREACHABLE)) { sum += d; count++; }
  }
  return count ? sum / count : 0;
}

/** Společné části hledání: cíl, heuristika a odhad vzdálenosti. */
export function evaluator(problem) {
  const { pieces, tables, near, pieceIndex, targetCount } = problem;
  const n = pieces.length;
  const tableIdx = tables.map((t) => t.pieces.map((name) => pieceIndex.get(name)));
  const nearRadius = near ? near.radius : 0;
  const oks = Array.from({ length: targetCount }, (_, t) => pieces.map((p) => p.oks[t]));
  // skupinová pravidla: maska pozic sledovaných nálepek → vzdálenost / splnění
  const classes = problem.classTables ?? [];
  const classMask = (c, v) => {
    let mask = 0;
    for (let i = 0; i < c.maps.length; i++) mask |= 1 << c.maps[i].map[v[c.maps[i].piece]];
    return mask >>> 0;
  };
  const classDist = (c, v) => c.dist[c.rank(classMask(c, v))];
  /** Index splněného cíle, nebo −1. */
  const goalOf = (v) => {
    for (let ci = 0; ci < classes.length; ci++) if (classes[ci].dist[classes[ci].rank(classMask(classes[ci], v))] !== 0) return -1;
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
      const { sizes: s, dist, packed } = tables[t];
      const ids = tableIdx[t];
      let idx = 0;
      for (let i = 0; i < ids.length; i++) idx = idx * s[i] + v[ids[i]];
      let d = packed ? (dist[idx >> 1] >> ((idx & 1) << 2)) & 15 : dist[idx];
      if (packed && d === PACKED_UNREACHABLE) d = UNREACHABLE;
      if (d > h) h = d;
    }
    for (let ci = 0; ci < classes.length; ci++) { const d = classDist(classes[ci], v); if (d > h) h = d; }
    return h;
  };
  // přesnější dolní odhad: tabulka blízko cíle (mimo ni je vzdálenost > radius)
  const estimate = (v) => {
    const h = heuristic(v);
    if (!near) return h;
    const d = near.get(v);
    return d >= 0 ? d : Math.max(h, nearRadius + 1);
  };
  // Tah s průběžným odřezáváním: další stav se počítá po skupinách dílků databází
  // a jakmile některá databáze ukáže vzdálenost nad `limit`, zbytek se nepočítá
  // (většina potomků se odřízne hned po první skupině). Vrací false = odříznuto
  // (`next` je pak jen zčásti spočtený), true = `next` je celý a heuristika ≤ limit.
  const { trans } = problem;
  const T = tables.length;
  // nejsilnější databáze (nejvyšší průměrná vzdálenost) první – odřízne nejčastěji
  const strength = tables.map((t) => { t.mean ??= meanOf(t.dist, t.packed); return t.mean; });
  const order = [...tables.keys()].sort((a, b) => strength[b] - strength[a]);
  const tIds = order.map((t) => Int32Array.from(tableIdx[t]));
  const tSizes = order.map((t) => Int32Array.from(tables[t].sizes));
  const tDist = order.map((t) => tables[t].dist);
  const tPacked = Uint8Array.from(order, (t) => (tables[t].packed ? 1 : 0));
  const pTrans = pieces.map((p) => trans[p.kind]);
  const pSize = Int32Array.from(pieces, (p) => p.size);
  const inTable = new Uint8Array(n);
  for (const ids of tableIdx) for (const i of ids) inTable[i] = 1;
  const rest = Int32Array.from([...Array(n).keys()].filter((i) => !inTable[i]));
  const advance = (cur, m, next, limit) => {
    for (let t = 0; t < T; t++) {
      const ids = tIds[t], sz = tSizes[t];
      let idx = 0;
      for (let k = 0; k < ids.length; k++) {
        const i = ids[k];
        const v = pTrans[i][m * pSize[i] + cur[i]];
        next[i] = v;
        idx = idx * sz[k] + v;
      }
      if (tPacked[t]) {
        const d = (tDist[t][idx >> 1] >> ((idx & 1) << 2)) & 15;
        if (d > limit || d === PACKED_UNREACHABLE) return false;
      } else if (tDist[t][idx] > limit) return false;
    }
    for (let k = 0; k < rest.length; k++) { const i = rest[k]; next[i] = pTrans[i][m * pSize[i] + cur[i]]; }
    for (let ci = 0; ci < classes.length; ci++) if (classDist(classes[ci], next) > limit) return false;
    return true;
  };
  return { goalOf, heuristic, estimate, advance, near, nearRadius, order, tableIdx, rest };
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
  const { pieces, moveCount, redundant, names } = problem;
  const { goalOf, heuristic, estimate, advance, near, nearRadius } = evaluator(problem);
  const n = pieces.length;
  const t0 = clock.now();
  const solutions = [];

  const roots = rootsOf(problem, start);
  clock.tick(0.02);
  const result = (reason, extra = {}) => {
    clock.nodes(nodes % 8192); // zbytek práce do virtuálního času
    return { reason, solutions, nodes, elapsed: clock.now() - t0, ...extra };
  };
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
      if (++nodes % 8192 === 0) {
        clock.nodes(8192);
        if (clock.now() - t0 > timeLimit) { stopped = 'time'; return; }
        onProgress?.({ depth: bound, nodes, found: solutions.length });
      }
      const remaining = bound - depth - 1;
      // cíl má heuristiku 0, takže odříznutí podle databází ho nikdy nezahodí
      if (!advance(cur, m, next, remaining)) continue;
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

  // stejné hledání v jádru WebAssembly (kernel.js), když je načtené
  const wasm = kernelFits(problem) && maxLength < 60;
  const ev = wasm ? evaluator(problem) : null;
  const kernelRoot = (r) => {
    const st = { nodes, branch, done: doneBranches };
    const onBudget = () => {
      clock.nodes(8192);
      if (clock.now() - t0 > timeLimit) { stopped = 'time'; return true; }
      onProgress?.({ depth: bound, nodes: st.nodes, found: solutions.length });
      return false;
    };
    const onFound = (p, goal) => {
      const alg = Array.from(p, (i) => names[i]).join(' ');
      solutions.push(alg);
      onSolution?.(alg, bound, { pre: r.pre, target: goal });
      if (solutions.length >= maxResults) { stopped = 'results'; return true; }
      return false;
    };
    idaRoot(problem, ev, r.v, bound, skipNow, shard, st, onBudget, onFound);
    nodes = st.nodes; branch = st.branch; doneBranches = st.done;
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
      if (wasm) kernelRoot(r);
      else {
        stack[0].set(r.v);
        dfs(0, -1);
      }
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
 * @param {(target:number) => number} [opts.finish] cena navíc podle splněného cíle (AUF po algoritmu);
 *   výchozí stavy mohou mít `g0` (AUF před algoritmem)
 * @param {(v:Uint8Array) => number} [opts.hcost] dolní mez ceny do cíle (databáze ceny, costTables)
 * @param {number} [opts.skip] přeskočit tolik větví (navázání; `branch` z minulého výsledku)
 * @param {(alg:string, cost:number, info:{pre:any, target:number}) => void} [opts.onSolution]
 * @param {(info:{nodes:number}) => void} [opts.onProgress]
 */
export function searchCost(problem, start, { cost, minMove, bound, length, hcost, finish, timeLimit = 5000, shard, skip = 0, onSolution, onProgress }) {
  clock.tick(0.02);
  const { pieces, moveCount, redundant, names } = problem;
  const { goalOf, advance, near, nearRadius } = evaluator(problem);
  const n = pieces.length;
  const t0 = clock.now();
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
      if (++nodes % 8192 === 0) {
        clock.nodes(8192);
        if (clock.now() - t0 > timeLimit) { stopped = 'time'; return; }
        onProgress?.({ nodes });
      }
      path[depth] = m;
      if (!advance(cur, m, next, remaining)) { if (depth === 0) done = idx + 1; continue; }
      const goal = goalOf(next);
      if (remaining === 0) {
        const total = goal >= 0 && finish ? g2 + finish(goal) : g2;
        if (goal >= 0 && total < bound) {
          bound = total;
          found++;
          onSolution?.(Array.from(path, (i) => names[i]).join(' '), total, { pre: root.pre, target: goal });
        }
      } else if (goal < 0 && !(hcost && g2 + hcost(next) >= bound)) { // kratší řešení už je (goal ≥ 0)
        let ok = true;
        if (remaining <= nearRadius) { const d = near.get(next); ok = d >= 0 && d <= remaining; }
        if (ok) { dfs(depth + 1, m, cost.step(ctx, m), g2); if (stopped) return; }
      }
      if (depth === 0) done = idx + 1;
    }
    if (depth === 0) done = Math.max(done, (root.index + 1) * moveCount);
  };
  if (kernelFits(problem) && length < 60) {
    // stejné hledání v jádru WebAssembly (kernel.js)
    const st = { nodes: 0, found: 0, bound, done, skip };
    const list = roots.map((r) => ({ ...r, skipRoot: goalOf(r.v) >= 0 || (r.index + 1) * moveCount <= skip }));
    const onBudget = () => {
      clock.nodes(8192);
      if (clock.now() - t0 > timeLimit) { stopped = 'time'; return true; }
      onProgress?.({ nodes: st.nodes });
      return false;
    };
    costSearch(problem, evaluator(problem), { cost, minMove, length, hcost, finish, shard }, list, st, onBudget,
      (p, total, goal, r) => onSolution?.(p.map((i) => names[i]).join(' '), total, { pre: r.pre, target: goal }));
    ({ nodes, found, bound, done } = st);
  } else {
    for (const r of roots) {
      if (goalOf(r.v) >= 0 || (r.index + 1) * moveCount <= skip) continue;
      root = r;
      stack[0].set(r.v);
      dfs(0, -1, cost.start, r.g0 ?? 0);
      if (stopped) break;
    }
  }
  clock.nodes(nodes % 8192);
  return { reason: stopped ?? 'done', nodes, found, bound, branch: done, elapsed: clock.now() - t0 };
}

/** Pohodlná varianta: vše v jednom volání. */
export function findAlgs({ puzzle, start, constraints, target, moveSet, ...opts }) {
  const problem = prepare({ puzzle, constraints, target, moves: (moveSet ?? new MoveSet()).moves() });
  return search(problem, start, opts);
}
