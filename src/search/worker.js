// Web Worker: hledání běží mimo hlavní vlákno, takže UI nezamrzá. Klient
// (client.js) jich spustí víc a každý prohledá svůj díl (shard).
//
// Vstup:  { type: 'search', puzzle, start, target, constraints, moves, held, auf, shard,
//           options, ergonomics, sq1 }
//         puzzle = id hlavolamu ('333', '222', 'pyram', 'skewb', 'sq1');
//         held = tahy `moves` v rámci držení (pro hodnocení), jinak stejné jako moves;
//         auf = { pre: [tah], post: [tah] } – natočení U (v rámci modelu) před a po,
//               které se do délky nepočítá; shard = { index, count };
//         sq1 = { shape, top, bottom } jen pro Square-1
// Výstup: { type: 'progress' | 'solutions' | 'done' | 'error', ... }
//         řešení = { alg, pre, post, score } (pre/post = AUF v zápisu modelu, nebo null)
//
// Postup (hlavolamy kromě Square-1), viz explore():
//   1. první řešení – s mnoha druhy tahů rychlé úlohy s menšími sadami
//      (⟨R U⟩, ⟨R U r⟩, ⟨R U D⟩, … a trojice R U x), jinak úplné hledání,
//   2. kola zlepšování – každá úloha se prohloubí o tah; úplná sada hledá kratší
//      řešení (a dokazuje, že kratší nejsou), hledání podle pohodlí hledá
//      pohodlnější, než je nejlepší známé,
//   3. po každé změně nejlepších se kandidáti doladí výměnou úseků (improve.js).

import { prepare, search, searchCost, NEAR_LIMIT } from './engine.js';
import { prepareSq1, searchSq1 } from './sq1engine.js';
import { getPuzzle } from '../puzzles/index.js';
import { scoreFor } from '../ergonomics/puzzles.js';
import { buildTriggers } from '../ergonomics/triggers.js';
import { ergoStep, ERGO_START, fullConfig } from '../ergonomics/score.js';
import { moveWeight } from '../ergonomics/weights.js';
import { mirrorMove, MOVE_DEFS } from '../core/notation.js';
import { styleMetrics, speedKey, balancedValue } from '../ergonomics/style.js';
import { buildTable, improve } from './improve.js';

self.onmessage = ({ data }) => {
  if (data.type !== 'search') return;
  try {
    run(data);
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};

function run({ puzzle: id = '333', start, target, constraints, moves, held, auf, shard, options, ergonomics, sq1 }) {
  const P = getPuzzle(id);
  const t0 = Date.now();
  const onTable = (info) => self.postMessage({ type: 'progress', phase: 'tables', ...info });
  self.postMessage({ type: 'progress', phase: 'tables', table: 0, tables: 0 });
  const config = P.ergonomics === 'cube' ? { ...ergonomics, triggers: buildTriggers() } : ergonomics;
  // hodnotí se v rámci držení (tahy, jak je děláš rukama)
  const heldName = new Map(held && moves ? moves.map((m, i) => [P.moveToString(m), P.moveToString(held[i])]) : []);
  const toHeld = (alg) => (held ? alg.split(' ').map((t) => heldName.get(t) ?? t).join(' ') : alg);
  const scoreOf = (alg) => scoreFor(P, P.kind === 'sq1' ? alg : toHeld(alg), config);

  let batch = [];
  let lastFlush = Date.now();
  const flush = () => {
    if (batch.length) self.postMessage({ type: 'solutions', items: batch });
    batch = [];
    lastFlush = Date.now();
  };
  const seen = new Set();
  const tracker = makeTracker(P, options.lambda);
  const handlers = {
    onSolution: (alg, pre = null, post = null) => {
      const key = `${pre ?? ''}|${alg}|${post ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      const score = scoreOf(alg);
      tracker.add({ alg, pre, post }, score);
      batch.push({ alg, pre, post, score });
      if (batch.length >= 50 || Date.now() - lastFlush > 200) flush();
    },
    context: {},
    proof: { cleared: 0 },
    onProgress: (info) => {
      flush();
      self.postMessage({ type: 'progress', phase: 'search', ...info, ...handlers.context, cleared: handlers.proof.cleared, found: seen.size, best: tracker.shortest(), elapsed: Date.now() - t0 });
    },
  };

  let res;
  if (P.kind === 'sq1') {
    const problem = prepareSq1({ constraints, target: Int8Array.from(target), ...sq1, onTable });
    res = searchSq1(problem, Int8Array.from(start), {
      ...options, ...handlers, onSolution: (alg) => handlers.onSolution(alg),
      turnCost: (a, c) => scoreFor(P, `(${a},${c})`, config).total,
    });
  } else {
    res = explore({ P, start: Uint8Array.from(start), target: Uint8Array.from(target), constraints, moves, held: held ?? moves, auf, shard, options, config, handlers, tracker, scoreOf, onTable, t0 });
  }
  flush();
  self.postMessage({
    type: 'done', reason: res.reason, optimal: res.optimal, nodes: res.nodes, cleared: res.cleared ?? 0,
    found: seen.size || res.solutions.length, elapsed: Date.now() - t0,
  });
}

/**
 * Nejlepší zatím nalezená řešení pro každý pohled (rychlost, efektivita,
 * všestrannost) – hodnoty jako pohledy v Labu (lexikograficky, nižší = lepší).
 * Pro každý pohled drží pár nejlepších různých kandidátů (ty se dolaďují).
 */
const ELITE = 3;
function makeTracker(P, lambda) {
  const cube = P.ergonomics === 'cube';
  const lex = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  const values = (score) => {
    const m = styleMetrics(score, cube);
    return { speed: speedKey(m), efficient: [m.length, m.total], balanced: [balancedValue(m, lambda)] };
  };
  const elites = { speed: [], efficient: [], balanced: [] };
  let changed = false;
  return {
    values,
    add(sol, score) {
      const v = values(score);
      for (const id of Object.keys(v)) {
        const list = elites[id];
        if (list.length >= ELITE && lex(v[id], list.at(-1).value) >= 0) continue;
        list.push({ ...sol, value: v[id] });
        list.sort((a, b) => lex(a.value, b.value));
        if (list.length > ELITE) list.pop();
        changed = true;
      }
    },
    /** Zda se od posledního dotazu některý kandidát změnil. */
    takeChanged() { const c = changed; changed = false; return c; },
    shortest: () => elites.efficient[0]?.value[0] ?? null,
    best: (id) => elites[id][0] ?? null,
    elites,
  };
}

/** Sady tahů, ze kterých se skládají rychlé algoritmy (od nejpohodlnějších). */
const FRIENDLY = [['R', 'U'], ['R', 'U', 'r'], ['R', 'U', 'D'], ['R', 'U', 'M'], ['R', 'U', 'F'], ['r', 'U', 'R', 'F'], ['R', 'U', 'r', 'M'], ['R', 'U', 'L']];

/** Menší sady tahů pro rychlé první řešení a pohodlné varianty. */
function subsetsOf(bases) {
  const has = (sub) => sub.every((b) => bases.includes(b)) && sub.length < bases.length;
  const out = FRIENDLY.filter(has);
  const rank = (b) => (b === 'R' ? 0 : b === 'U' ? 1 : 2);
  const triples = [];
  for (let i = 0; i < bases.length; i++) for (let j = i + 1; j < bases.length; j++) for (let k = j + 1; k < bases.length; k++) triples.push([bases[i], bases[j], bases[k]]);
  triples.sort((a, b) => a.reduce((acc, x) => acc + rank(x), 0) - b.reduce((acc, x) => acc + rank(x), 0));
  const withRU = triples.filter((x) => x.includes('R') && x.includes('U'));
  for (const t of withRU.length ? withRU : triples) {
    if (out.length >= 8) break;
    if (has(t) && !out.some((o) => o.length === t.length && o.every((b) => t.includes(b)))) out.push(t);
  }
  return out;
}

/**
 * Model ceny pro hledání podle pohodlí: stav ruky (zápěstí, úchop, prstoklad)
 * je číslo, přechody a ceny se počítají líně (ergoStep) a pamatují. Cena tahu
 * odpovídá hodnotě rychlosti (speedValue) bez triggerů: váha + přehmat + úchop +
 * návaznost, navíc 2 za přehmat či rotaci a 0,5 za nešikovné místo.
 */
function costModel(held, config) {
  const cfg = fullConfig(config);
  const moves = held.map((m) => (cfg.leftHanded ? mirrorMove(m) : m));
  const M = moves.length;
  const states = [ERGO_START];
  const ids = new Map([[JSON.stringify(ERGO_START), 0]]);
  let next = new Int32Array(M * 256).fill(-1);
  let price = new Float64Array(M * 256);
  const fill = (ctx, m) => {
    const [item, s2] = ergoStep(states[ctx], moves[m], cfg);
    const key = JSON.stringify(s2);
    let id = ids.get(key);
    if (id === undefined) {
      id = states.length;
      states.push(s2);
      ids.set(key, id);
      if (states.length * M > next.length) {
        const n2 = new Int32Array(next.length * 2).fill(-1); n2.set(next); next = n2;
        const p2 = new Float64Array(price.length * 2); p2.set(price); price = p2;
      }
    }
    const i = ctx * M + m;
    next[i] = id;
    price[i] = item.base + item.rotation + item.regrip + item.gripChange + item.flow
      + (item.regrip > 0 || item.rotation > 0 ? 2 : 0) + (item.flowReason || item.gripChange > 0 ? 0.5 : 0);
  };
  const isRot = (m) => MOVE_DEFS[m.base]?.kind === 'rotation';
  const minMove = Math.max(0, Math.min(...moves.map((m) => (isRot(m) ? cfg.rotationPenalty * Math.abs(m.amount) : moveWeight(m, cfg) - cfg.alternate * cfg.flowScale))));
  return {
    minMove,
    start: 0,
    step: (ctx, m) => { const i = ctx * M + m; if (next[i] < 0) fill(ctx, m); return next[i]; },
    cost: (ctx, m) => { const i = ctx * M + m; if (next[i] < 0) fill(ctx, m); return price[i]; },
    /** Cena celého algoritmu (indexy tahů). */
    of(seq) { let ctx = 0, c = 0; for (const m of seq) { c += this.cost(ctx, m); ctx = this.step(ctx, m); } return c; },
  };
}

/**
 * Hledání s postupným zlepšováním. Úlohy:
 *   - menší sady tahů (jen když je druhů tahů aspoň 3 a úloha je dlouhá),
 *   - úplná sada tahů (nejkratší řešení a důkaz, že kratší nejsou),
 *   - pohodlí: větve a meze podle ceny rychlosti (od prvního kola).
 * V kolech se úlohy s délkou prohloubí o jeden tah; každé kolo přinese nová,
 * delší a různorodější řešení. Kandidáti každého pohledu se po změně doladí.
 * AUF: výchozí stavy po natočení U před algoritmem a cíle po natočení po něm.
 * S víc workery (shard) každý prohledá jen svůj díl úplné sady a pohodlí a dostane
 * jen některé menší sady.
 */
function explore({ P, start, target, constraints, moves, held, auf, shard, options, config, handlers, tracker, scoreOf, onTable, t0 }) {
  const timeLimit = options.timeLimit ?? 15000;
  const deadline = t0 + timeLimit;
  const left = () => deadline - Date.now();
  const extra = options.extraDepth ?? 0;
  const maxLength = options.maxLength ?? 20;
  const nearLimit = options.nearLimit ?? NEAR_LIMIT;
  const name = (m) => P.moveToString(m);
  const roots = [{ loc: start, pre: null }, ...(auf?.pre ?? []).map((m) => ({ loc: P.applyAlg(start, [m]), pre: name(m) }))];
  const posts = [null, ...(auf?.post ?? []).map(name)];
  const targets = [target, ...(auf?.post ?? []).map((m) => P.applyAlg(target, P.invertAlg([m])))];
  // úvodní a koncový tah natočení U se stane součástí AUF (do délky se nepočítá)
  const aufBase = auf?.post?.[0]?.base;
  const amountOf = (t) => (t ? P.parseAlg(t)[0].amount : 0);
  const aufName = (a) => { const r = ((a % 4) + 4) % 4; return r ? name({ base: aufBase, amount: r === 3 ? -1 : r }) : null; };
  const emit = (alg, pre, post) => {
    if (aufBase) {
      const t = alg.split(' ');
      while (t.length > 1 && P.parseAlg(t[0])[0].base === aufBase) pre = aufName(amountOf(pre) + amountOf(t.shift()));
      while (t.length > 1 && P.parseAlg(t.at(-1))[0].base === aufBase) post = aufName(amountOf(post) + amountOf(t.pop()));
      alg = t.join(' ');
    }
    handlers.onSolution(alg, pre, post);
  };
  const found = (alg, len, info) => emit(alg, info.pre, posts[info.target]);
  // menší sady mají menší tabulku blízko cíle (méně tahů → dosáhne i tak daleko; šetří paměť)
  const make = (ms, goals = targets, near = nearLimit) => prepare({ puzzle: P, constraints, moves: ms, targets: goals, nearLimit: near, onTable });
  const full = make(moves);
  const mine = (i) => !shard || i % shard.count === shard.index;

  const tasks = [];
  const bases = [...new Set(moves.map((m) => m.base))];
  // krátké úlohy (do 8 tahů) najde úplné hledání rychle samo
  const probe = bases.length >= 3 ? search(full, roots, { maxLength: 8, extraDepth: 0, maxResults: 1, timeLimit: 300 }) : null;
  const proof = handlers.proof;
  if (probe) proof.cleared = probe.cleared ?? 0;
  if (probe && !probe.solutions.length && probe.reason !== 'already-solved' && probe.reason !== 'unsolvable') {
    subsetsOf(bases).forEach((sub, i) => {
      if (!mine(i)) return;
      const set = new Set(sub);
      tasks.push({ label: sub.join(' '), moves: moves.filter((m) => set.has(m.base)), problem: null });
    });
  }
  const fullTask = { label: null, moves, problem: full, full: true, shard };
  tasks.push(fullTask);
  const comfort = P.ergonomics === 'cube' && options.comfort !== false ? { label: 'pohodlí', comfort: true, rounds: 0 } : null;
  if (comfort) tasks.push(comfort);
  const costs = comfort ? costModel(held, config) : null;
  const indexOf = new Map(moves.map((m, i) => [name(m), i]));

  let table = null;
  let last = { reason: 'done', optimal: null, nodes: 0 };
  const polish = () => {
    if (!tracker.takeChanged() || left() < 1500) return;
    table ??= buildTable(P, moves);
    const jobs = Object.entries(tracker.elites).flatMap(([id, list]) => list.map((b) => [id, b]));
    const per = Math.min(400, Math.max(80, 900 / jobs.length));
    for (const [id, b] of jobs) {
      if (left() < 1000) break;
      const value = (alg) => (alg.split(' ').length > maxLength ? [Infinity] : tracker.values(scoreOf(alg))[id]);
      improve(table, b.alg, value, { deadline: Math.min(deadline - 500, Date.now() + per), onImproved: (alg) => emit(alg, b.pre, b.post) });
    }
    tracker.takeChanged();
  };

  // pohodlí: délky od nejkratší známé nahoru, v každém kole o jednu delší
  const runComfort = (slice) => {
    const best = tracker.best('speed');
    const seq = best.alg.split(' ').map((t) => indexOf.get(t));
    if (seq.some((i) => i === undefined)) { comfort.done = true; return; }
    // délky od délky nejlepšího po rychlosti střídavě kratší a delší (b, b−1, b+1, …)
    const low = tracker.shortest() ?? seq.length;
    const high = Math.min(maxLength, Math.max(seq.length, low + Math.max(4, extra + 1)));
    if (!comfort.lengths) {
      comfort.lengths = [];
      for (let d = 0; d <= high - low; d++) for (const L of d ? [seq.length - d, seq.length + d] : [seq.length]) if (L >= low && L <= high) comfort.lengths.push(L);
    }
    comfort.length = comfort.lengths[0];
    if (comfort.length === undefined) { comfort.done = true; return; }
    handlers.context = { label: 'pohodlí', task: 'comfort', round: comfort.rounds };
    const res = searchCost(full, roots, {
      cost: costs, minMove: costs.minMove, bound: costs.of(seq) + 1e-6, length: comfort.length, timeLimit: slice, shard,
      onSolution: found, onProgress: (p) => handlers.onProgress({ depth: comfort.length, nodes: p.nodes }),
    });
    comfort.rounds++;
    // nestihlo se: příště stejná délka s přísnější mezí (pokud se mezitím něco zlepšilo)
    if (res.reason === 'done' || comfort.retried) { comfort.lengths.shift(); comfort.retried = false; } else comfort.retried = true;
  };

  for (let round = 0; left() > 300 && tasks.some((t) => !t.done); round++) {
    for (const task of tasks) {
      if (task.done || left() < 300) continue;
      const active = tasks.filter((t) => !t.done).length;
      // úplná sada tahů dostane větší díl času (hledá kratší řešení), ostatní menší
      const slice = Math.max(1000, task.full ? left() * (active > 1 ? 0.4 : 1) : Math.min(10000, left() / (2 * active)));
      if (task.comfort) {
        if (!tracker.best('speed')) {
          // bez prvního řešení není co zlepšovat; když už nic jiného neběží, konec
          if (tasks.every((t) => t === task || t.done)) task.done = true;
          continue;
        }
        runComfort(slice);
        polish();
        continue;
      }
      // menší sady bez AUF: jeden cíl je pro hlubší hledání rychlejší (AUF řeší úplná sada)
      task.problem ??= make(task.moves, targets.slice(0, 1), Math.floor(nearLimit / 4));
      handlers.context = { label: task.label, task: task.full ? 'full' : 'subset', round };
      const first = task.depth === undefined;
      const common = { extraDepth: 0, maxResults: options.maxResults, timeLimit: slice, shard: task.shard, onSolution: found, onProgress: handlers.onProgress };
      const res = search(task.problem, task.full ? roots : roots.slice(0, 1), first
        ? { ...common, minLength: task.resume ?? 1, skip: task.skip ?? 0, maxLength }
        : { ...common, minLength: task.depth, maxLength: task.depth });
      if (task.full) {
        last = res;
        // důkaz: délky pod `cleared` jsou s úplnou sadou prohledané bez řešení
        if (first && res.cleared !== undefined) proof.cleared = Math.max(proof.cleared, res.cleared);
      }
      if (res.reason === 'already-solved' || res.reason === 'unsolvable') {
        if (task.full) { last = res; for (const t of tasks) t.done = true; }
        task.done = true;
        continue;
      }
      if (first) {
        if (res.optimal !== null) { task.opt = res.optimal; task.depth = res.optimal + 1; }
        // úplná sada příště pokračuje od délky, kterou nestihla (kratší nejsou)
        else if (res.reason === 'time' && task.full && left() > 2000) {
          // příště od délky a větve, kde se skončilo (kratší ani hotové větve řešení nemají)
          task.skip = res.depth === task.resume ? Math.max(task.skip ?? 0, res.branch) : res.branch;
          task.resume = res.depth;
        }
        else task.done = true;
      } else if (res.reason === 'time') task.done = true; // další délka by se už nestihla
      else task.depth += 1;
      if (task.depth > Math.min(maxLength, (task.opt ?? 0) + extra)) task.done = true;
      if (task.done && !task.full) task.problem = null; // uvolnit tabulky
      polish();
      handlers.onProgress({ depth: task.depth ?? res.depth ?? 0, nodes: res.nodes ?? 0 });
    }
  }
  const optimal = tracker.shortest();
  const reason = last.reason === 'already-solved' || last.reason === 'unsolvable' ? last.reason
    : optimal === null ? (last.reason === 'done' ? 'not-found' : last.reason) : left() <= 300 ? 'time' : 'done';
  return { reason, optimal, nodes: last.nodes, solutions: [], cleared: proof.cleared };
}
