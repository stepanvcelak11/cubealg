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
import { buildTable, improve, simplify } from './improve.js';
import { compileGoal } from '../core/constraints.js';
import { stagedSolve } from './staged.js';
import { makeResolver } from './resolve.js';

self.onmessage = ({ data }) => {
  if (data.type !== 'search') return;
  try {
    run(data);
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};

function run({ puzzle: id = '333', start, target, constraints, moves, held, auf, shard, seeds, options, ergonomics, sq1 }) {
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
    // dosavadní řešení (navázání): platná jsou výchozí body zlepšování; do seznamu
    // je pošle jen první worker, ostatní si je jen poznamenají
    if (seeds?.length) {
      const goal = compileGoal(constraints, Uint8Array.from(target), P);
      for (const sd of seeds) {
        const pre = sd.pre ?? null, post = sd.post ?? null;
        try {
          if (!goal.test(P.applyAlg(Uint8Array.from(start), [pre, sd.alg, post].filter(Boolean).join(' ')))) continue;
        } catch { continue; }
        if (!shard || shard.index === 0) handlers.onSolution(sd.alg, pre, post);
        else { seen.add(`${pre ?? ''}|${sd.alg}|${post ?? ''}`); tracker.add({ alg: sd.alg, pre, post }, scoreOf(sd.alg)); }
      }
    }
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
 * Hledání s postupným zlepšováním. Nejdřív jakékoli řešení, pak se v kolech
 * zlepšuje – nic se nezačíná znovu od začátku a délka řešení není omezená.
 * Úlohy (každá dostane v kole krátký díl času a příště naváže, kde skončila):
 *   - první řešení po etapách (staged.js), když krátké hledání nic nenajde,
 *   - menší sady tahů (rychlé první řešení a pohodlné varianty),
 *   - úplná sada tahů (nejkratší řešení a důkaz, že kratší nejsou; do „Max. tahů“),
 *   - pohodlí: větve a meze podle ceny rychlosti,
 *   - přeřešení úseků nejlepších řešení úplným hledáním (resolve.js).
 * Kandidáti každého pohledu se po změně doladí výměnou krátkých úseků (improve.js).
 * AUF: výchozí stavy po natočení U před algoritmem a cíle po natočení po něm.
 * S víc workery (shard) každý prohledá jen svůj díl úplné sady a pohodlí, dostane
 * jen některé menší sady a etapové hledání zkouší tahy v jiném pořadí.
 */
function explore({ P, start, target, constraints, moves, held, auf, shard, options, config, handlers, tracker, scoreOf, onTable, t0 }) {
  const timeLimit = options.timeLimit ?? 15000;
  const deadline = t0 + timeLimit;
  const left = () => deadline - Date.now();
  const extra = options.extraDepth ?? 0;
  // „Max. tahů“ omezuje jen úplné prohledávání; etapy a zlepšování délku neomezují
  const maxLength = Math.min(30, options.maxLength ?? 20);
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
    alg = simplify(P, moves, alg);
    if (!alg) return;
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
  const startOf = (pre) => (pre ? P.applyAlg(start, pre) : start);

  const tasks = [];
  const bases = [...new Set(moves.map((m) => m.base))];
  // krátké úlohy (do 8 tahů) najde úplné hledání rychle samo
  const probe = search(full, roots, { maxLength: Math.min(8, maxLength), extraDepth: 0, maxResults: 1, timeLimit: 300, onSolution: found });
  const proof = handlers.proof;
  proof.cleared = probe.cleared ?? 0;
  const hard = !probe.solutions.length && probe.reason !== 'already-solved' && probe.reason !== 'unsolvable';
  // pořadí: menší sady (rychlé první řešení, když případ jde jimi), první řešení po
  // etapách (u víc workerů jen každý druhý, s jiným pořadím tahů), přeřešení úseků,
  // úplná sada, pohodlí
  if (hard && bases.length >= 3) {
    subsetsOf(bases).forEach((sub, i) => {
      if (!mine(i)) return;
      const set = new Set(sub);
      tasks.push({ label: sub.join(' '), moves: moves.filter((m) => set.has(m.base)), problem: null });
    });
  }
  if (hard && (!shard || shard.index % 2 === 0)) tasks.push({ label: 'po etapách', staged: true });
  tasks.push({ label: 'úseky', refine: true });
  const fullTask = { label: null, moves, problem: full, full: true, shard };
  tasks.push(fullTask);
  const comfort = P.ergonomics === 'cube' && options.comfort !== false ? { label: 'pohodlí', comfort: true, rounds: 0 } : null;
  if (comfort) tasks.push(comfort);
  const costs = comfort ? costModel(held, config) : null;
  const indexOf = new Map(moves.map((m, i) => [name(m), i]));
  const resolver = makeResolver(full, P, target);

  let table = null;
  let last = probe;
  const valueOf = (id) => (alg) => tracker.values(scoreOf(alg))[id];
  const polish = () => {
    if (!tracker.takeChanged() || left() < 1500) return;
    table ??= buildTable(P, moves);
    const jobs = Object.entries(tracker.elites).flatMap(([id, list]) => list.map((b) => [id, b]));
    const per = Math.min(400, Math.max(80, 900 / jobs.length));
    for (const [id, b] of jobs) {
      if (left() < 1000) break;
      improve(table, b.alg, valueOf(id), { deadline: Math.min(deadline - 500, Date.now() + per), onImproved: (alg) => emit(alg, b.pre, b.post) });
    }
    tracker.takeChanged();
  };

  // pohodlí: délky od délky nejlepšího po rychlosti střídavě kratší a delší
  const runComfort = (slice) => {
    const best = tracker.best('speed');
    const seq = best.alg.split(' ').map((t) => indexOf.get(t));
    if (seq.some((i) => i === undefined)) { comfort.done = true; return; }
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
    if (res.reason === 'done' || comfort.retried) { comfort.lengths.shift(); comfort.retried = false; } else comfort.retried = true;
  };

  // přeřešení úseků: pro každý pohled zvlášť, okna od 6 tahů, po marném průchodu delší
  const views = ['efficient', 'balanced', 'speed'];
  const MAX_WINDOW = 16;
  const refine = Object.fromEntries(views.map((id) => [id, { w: 6, i: 0, alg: null, better: false }]));
  let refineView = 0;
  const runRefine = (slice) => {
    const end = Date.now() + slice;
    for (let tries = 0; tries < views.length && Date.now() < end; tries++) {
      const id = views[refineView];
      refineView = (refineView + 1) % views.length;
      const b = tracker.best(id);
      if (!b) continue;
      const st = refine[id];
      if (st.alg !== b.alg) { st.alg = b.alg; st.i = 0; st.exhausted = false; }
      if (st.exhausted) continue;
      let cur = b.alg.split(' ');
      const value = valueOf(id);
      let curValue = value(b.alg);
      const s0 = startOf(b.pre);
      const viewEnd = Math.min(end, Date.now() + slice / views.length);
      while (Date.now() < viewEnd) {
        const w = st.w;
        if (w > Math.min(MAX_WINDOW, cur.length)) { st.exhausted = true; break; }
        // úplné sledování: okna po celé délce; jinak jen konec algoritmu
        const i = resolver.full ? st.i : cur.length - w;
        if (resolver.full && i + w > cur.length) {
          // průchod hotový: bez zlepšení → delší okna
          if (!st.better) st.w++;
          st.i = 0; st.better = false;
          continue;
        }
        handlers.context = { label: `${w}`, task: 'refine', view: id, round: 0, current: cur.length };
        handlers.onProgress({ depth: w, nodes: 0 });
        const per = Math.max(300, Math.min(viewEnd - Date.now(), 800 * 1.7 ** Math.max(0, w - 8)));
        // efektivita jen kratší; ostatní pohledy i stejně dlouhé, rozhodne hodnota
        const opts = { maxLength: id === 'efficient' ? w - 1 : w + 2, maxResults: id === 'efficient' ? 1 : 20, timeLimit: per };
        const candidates = resolver.full
          ? resolver.window(s0, cur, i, w, opts).solutions.map((alg) => ({ alg, post: b.post }))
          : resolver.tail(s0, cur, i, opts).solutions.map((x) => ({ alg: x.alg, post: posts[x.target] }));
        let replaced = null;
        for (const c of candidates) {
          const text = simplify(P, moves, [...cur.slice(0, i), c.alg, ...cur.slice(i + w)].filter(Boolean).join(' '));
          if (!text) continue;
          const next = text.split(' ');
          const v = value(text);
          if (lexLess(v, curValue)) { replaced = { next, post: c.post }; curValue = v; }
          else emit(next.join(' '), b.pre, c.post); // i horší varianty jsou platná řešení (do seznamu)
        }
        if (replaced) {
          cur = replaced.next;
          emit(cur.join(' '), b.pre, replaced.post);
          st.alg = tracker.best(id)?.alg ?? st.alg;
          st.better = true;
          handlers.onProgress({ depth: w, nodes: 0 });
          if (!resolver.full) st.w = 6;
          if (st.alg !== cur.join(' ')) break; // nejlepší je teď jiné (např. s AUF)
        } else if (resolver.full) st.i++;
        else st.w++;
      }
    }
  };

  const SLICE = { staged: 90000, subset: 10000, full: 8000, comfort: 6000, refine: 6000 };
  for (let round = 0; left() > 300 && tasks.some((t) => !t.done); round++) {
    for (const task of tasks) {
      if (task.done || left() < 300) continue;
      const active = tasks.filter((t) => !t.done).length;
      const kind = task.staged ? 'staged' : task.comfort ? 'comfort' : task.refine ? 'refine' : task.full ? 'full' : 'subset';
      const has = tracker.shortest() !== null;
      // dokud není řešení, dostane hlavní díl první řešení; potom se střídají krátké díly
      let cap = SLICE[kind];
      if (kind === 'full' && has && fullTask.depth === undefined && (tracker.shortest() - (fullTask.resume ?? 0)) > 3) cap = 3000;
      // bez řešení: menší sady jen krátce (jinak je řada na etapách)
      if (kind === 'subset' && !has && round === 0) cap = 4000;
      const slice = Math.max(800, Math.min(cap, kind === 'staged' ? left() * 0.6 : left() / Math.max(1, active - 1)));
      if (task.staged) {
        // řešení už mezitím našla jiná úloha: etapy nejsou potřeba
        if (has) { task.done = true; continue; }
        handlers.context = { label: task.label, task: 'staged', round };
        const res = stagedSolve(full, roots[0].loc, {
          deadline: Date.now() + slice, seed: shard ? shard.index : 0,
          onStage: (info) => handlers.onProgress({ depth: info.length, nodes: 0, stage: info }),
        });
        if (res.alg) emit(res.alg, null, null);
        task.done = true;
        polish();
        continue;
      }
      if (task.comfort || task.refine) {
        if (!has) {
          // bez prvního řešení není co zlepšovat; když už nic jiného neběží, konec
          if (tasks.every((t) => t.comfort || t.refine || t.done)) task.done = true;
          continue;
        }
        if (task.comfort) runComfort(slice); else runRefine(slice);
        // přeřešení úseků bez další práce: hotovo, jen když už nic jiného neběží
        if (task.refine && views.every((v) => !tracker.best(v) || (refine[v].exhausted && refine[v].alg === tracker.best(v).alg))
          && tasks.every((t) => t === task || t.done)) task.done = true;
        polish();
        continue;
      }
      // menší sady bez AUF: jeden cíl je pro hlubší hledání rychlejší (AUF řeší úplná sada)
      task.problem ??= make(task.moves, targets.slice(0, 1), Math.floor(nearLimit / 4));
      handlers.context = { label: task.label, task: kind, round };
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
        else if (res.reason === 'time' && left() > 1000) {
          // příště od délky a větve, kde se skončilo (kratší ani hotové větve řešení nemají)
          task.skip = res.depth === task.resume ? Math.max(task.skip ?? 0, res.branch) : res.branch;
          task.resume = res.depth;
        } else task.done = true;
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
    : optimal === null ? (left() <= 300 ? 'time' : 'not-found') : left() <= 300 ? 'time' : 'done';
  return { reason, optimal, nodes: last.nodes ?? 0, solutions: [], cleared: proof.cleared };
}

function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
