// Průběh hledání (mimo Square-1): nejdřív jakékoli řešení, pak kola zlepšování.
// Odděleno od workeru, aby šlo spustit i v Node (testy a měření kvality).

import { prepare, search, searchCost, NEAR_LIMIT } from './engine.js';
import { ergoStep, ERGO_START, fullConfig } from '../ergonomics/score.js';
import { moveWeight } from '../ergonomics/weights.js';
import { mirrorMove, MOVE_DEFS } from '../core/notation.js';
import { styleMetrics, speedKey, balancedValue } from '../ergonomics/style.js';
import { buildTable, improve, simplify } from './improve.js';
import { stagedSolve } from './staged.js';
import { makeResolver } from './resolve.js';
import { searchLibrary, blocksOf, blockPuzzle } from './library.js';

/** Cíle hledání: cíl a cíle po koncovém AUF. */
export const targetsOf = (P, target, auf) => [target, ...(auf?.post ?? []).map((m) => P.applyAlg(target, P.invertAlg([m])))];

/**
 * Nejlepší zatím nalezená řešení pro každý pohled (rychlost, efektivita,
 * všestrannost) – hodnoty jako pohledy v Labu (lexikograficky, nižší = lepší).
 * Pro každý pohled drží pár nejlepších různých kandidátů (ty se dolaďují).
 */
const ELITE = 3;
export function makeTracker(P, lambda) {
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
export function subsetsOf(bases) {
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
 * odpovídá hodnotě rychlosti (speedValue) bez triggerů: váha + rotace + přehmat +
 * úchop + návaznost.
 */
export function costModel(held, config, discount = []) {
  const cfg = fullConfig(config);
  // položka může být i blok (seznam tahů) – cena a stav ruky po celém bloku, minus sleva (bonus triggeru)
  const mir = (m) => (cfg.leftHanded ? mirrorMove(m) : m);
  const moves = held.map((m) => (Array.isArray(m) ? m.map(mir) : mir(m)));
  const M = moves.length;
  const states = [ERGO_START];
  const ids = new Map([[JSON.stringify(ERGO_START), 0]]);
  let next = new Int32Array(M * 256).fill(-1);
  let price = new Float64Array(M * 256);
  const fill = (ctx, m) => {
    let s2 = states[ctx], c = -(discount[m] ?? 0);
    for (const x of Array.isArray(moves[m]) ? moves[m] : [moves[m]]) {
      const [item, after] = ergoStep(s2, x, cfg);
      c += item.base + item.rotation + item.regrip + item.gripChange + item.flow;
      s2 = after;
    }
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
    price[i] = c;
  };
  const isRot = (m) => MOVE_DEFS[m.base]?.kind === 'rotation';
  const floor = (m) => (isRot(m) ? cfg.rotationPenalty * Math.abs(m.amount) : moveWeight(m, cfg) - cfg.alternate * cfg.flowScale);
  // dolní mez ceny každé položky (bez ohledu na stav ruky)
  const floors = moves.map((m, i) => (Array.isArray(m) ? m.reduce((a, x) => a + floor(x), 0) - (discount[i] ?? 0) : floor(m)));
  const minMove = Math.max(0, Math.min(...floors));
  return {
    minMove,
    floors,
    moves,
    start: 0,
    step: (ctx, m) => { const i = ctx * M + m; if (next[i] < 0) fill(ctx, m); return next[i]; },
    cost: (ctx, m) => { const i = ctx * M + m; if (next[i] < 0) fill(ctx, m); return price[i]; },
    /** Cena celého algoritmu (indexy tahů). */
    of(seq) { let ctx = 0, c = 0; for (const m of seq) { c += this.cost(ctx, m); ctx = this.step(ctx, m); } return c; },
  };
}

/**
 * Ceny tahů pro důkaz pohodlí: každý tah je levnější o nejvyšší podíl bonusu
 * (bonus / délka) triggeru, ve kterém se může objevit – jen triggery z povolených
 * tahů. Triggery se nepřekrývají, takže bonus celého algoritmu je nejvýš součet
 * těchto slev a snížená cena je dolní mez skutečného hodnocení.
 */
export function lowerCosts(costs, config) {
  const scale = config.triggerBonusScale ?? 1;
  const keys = costs.moves.map((m) => `${m.base}${m.amount}`);
  const allowed = new Set(keys);
  const usable = (config.triggers ?? []).filter((t) => t.moves.every((k) => allowed.has(k)));
  const disc = keys.map((k) => Math.max(0, ...usable.filter((t) => t.moves.includes(k)).map((t) => (t.bonus * scale) / t.moves.length)));
  return {
    start: costs.start,
    step: costs.step,
    cost: (ctx, m) => costs.cost(ctx, m) - disc[m],
    minMove: Math.max(0.05, Math.min(...costs.floors.map((f, m) => f - disc[m]))),
    disc,
  };
}

const MAX_COMFORT = 40; // nejdelší délka pro hledání podle pohodlí

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
export function explore({ P, start, target, constraints, moves, held, auf, shard, options, config, handlers, tracker, scoreOf, onTable, t0, full: prepared, cache }) {
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
  const targets = targetsOf(P, target, auf);
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
  const make = (ms, goals = targets, near = nearLimit) => prepare({ puzzle: P, constraints, moves: ms, targets: goals, nearLimit: near, onTable, cache });
  const full = prepared ?? make(moves);
  const mine = (i) => !shard || i % shard.count === shard.index;
  const startOf = (pre) => (pre ? P.applyAlg(start, pre) : start);

  const tasks = [];
  const bases = [...new Set(moves.map((m) => m.base))];
  // krátké úlohy (do 8 tahů) najde úplné hledání rychle samo
  const probe = search(full, roots, { maxLength: Math.min(8, maxLength), extraDepth: 0, maxResults: 1, timeLimit: 300, onSolution: found });
  const proof = handlers.proof;
  proof.cleared = probe.cleared ?? 0;
  const library = (options.library ?? []).filter(Boolean);
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
  // knihovna: tvoje algoritmy s nastavením a dokončením (jednou, po prvních úlohách)
  if (library.length && probe.reason !== 'already-solved' && probe.reason !== 'unsolvable' && (!shard || shard.index === 0)) tasks.push({ label: 'knihovna', library: true });
  tasks.push({ label: 'úseky', refine: true });
  const fullTask = { label: null, moves, problem: full, full: true, shard };
  tasks.push(fullTask);
  const comfort = P.ergonomics === 'cube' && options.comfort !== false ? { label: 'pohodlí', comfort: true, rounds: 0, doneLengths: new Set(), cur: null } : null;
  if (comfort) tasks.push(comfort);
  const costs = comfort ? costModel(held, config) : null;
  const lowCosts = costs && lowerCosts(costs, config);
  const indexOf = new Map(moves.map((m, i) => [name(m), i]));
  // bloky: triggery a časté úseky knihovny jako jeden krok (jen kostky)
  const blocks = comfort && options.blocks !== false ? (() => {
    const heldOf = new Map(moves.map((m, i) => [`${m.base}${m.amount}`, held[i]]));
    const libHeld = library.map((a) => { try { return P.parseAlg(a).map((m) => heldOf.get(`${m.base}${m.amount}`)); } catch { return []; } })
      .filter((a) => a.length && a.every(Boolean)).map((a) => a.map((m) => `${m.base}${m.amount}`));
    const list = blocksOf(config.triggers ?? [], held, libHeld);
    return list.length ? { label: 'bloky', blocks: true, list, rounds: 0, doneLengths: new Set(), cur: null } : null;
  })() : null;
  if (blocks) tasks.push(blocks);
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

  // pohodlí: větve a meze pro jednotlivé délky (levnější tahy první, mez = hodnocení
  // nejlepšího podle rychlosti). Délky od délky nejlepšího střídavě kratší a delší.
  // Ceny tahů jsou snížené o nejvyšší možný bonus za trigger na tah, takže i
  // algoritmy s triggery se najdou; když jsou prohledané všechny délky, do kterých
  // se levnější algoritmus vůbec vejde, je nejlepší dokázaně nejpohodlnější.
  const runComfort = (slice) => {
    const best = tracker.best('speed');
    const len = best.alg.split(' ').length;
    const bound = scoreOf(best.alg).total + 1e-6;
    // kratší než `cleared` žádné řešení nemají (prohledáno úplnou sadou)
    const low = Math.max(1, proof.cleared);
    // delší než tohle by bylo dražší i z nejlevnějších tahů
    // dlouhé délky mez odřízne hned (zbytek × nejlevnější tah ≈ mez), proto bez stropu „Max. tahů“
    const reach = Math.floor(bound / lowCosts.minMove);
    const high = Math.min(MAX_COMFORT, reach);
    const todo = [];
    for (let d = 0; d <= Math.max(len - low, high - len); d++) for (const L of d ? [len - d, len + d] : [len]) if (L >= low && L <= high && !comfort.doneLengths.has(L)) todo.push(L);
    if (!todo.length) {
      // dokázané, jen když se prošly všechny délky, do kterých se levnější vůbec vejde
      proof.speedOptimal = reach <= high;
      comfort.done = true;
      return;
    }
    const L = comfort.cur && todo.includes(comfort.cur.length) ? comfort.cur.length : todo[0];
    handlers.context = { label: 'pohodlí', task: 'comfort', round: comfort.rounds, length: L };
    const res = searchCost(full, roots, {
      cost: lowCosts, minMove: lowCosts.minMove, bound, length: L, timeLimit: slice, shard,
      skip: comfort.cur?.length === L ? comfort.cur.branch : 0,
      onSolution: found, onProgress: (p) => handlers.onProgress({ depth: L, nodes: p.nodes }),
    });
    comfort.rounds++;
    if (res.reason === 'done') { comfort.doneLengths.add(L); comfort.cur = null; } else comfort.cur = { length: L, branch: res.branch };
  };

  // bloky: hledání po krocích (tah nebo blok), délky v krocích od nejkratších, mez =
  // hodnocení nejlepšího podle rychlosti; blok má cenu sníženou o bonus svého triggeru
  const runBlocks = (slice) => {
    if (!blocks.problem) {
      const bp = blockPuzzle(P);
      const bmoves = [...moves, ...blocks.list.map((b) => ({ base: '#', amount: 1, seq: b.seq.map((i) => moves[i]) }))];
      blocks.problem = prepare({ puzzle: bp, constraints, moves: bmoves, targets, nearLimit: Math.floor(nearLimit / 4), onTable });
      blocks.costs = costModel([...held, ...blocks.list.map((b) => b.seq.map((i) => held[i]))], config,
        [...held.map(() => 0), ...blocks.list.map((b) => b.bonus * (config.triggerBonusScale ?? 1))]);
    }
    const best = tracker.best('speed');
    const bound = scoreOf(best.alg).total + 1e-6;
    const L = blocks.cur?.length ?? (blocks.next ?? 2);
    if (L > 12 || L * blocks.costs.minMove >= bound) { blocks.done = true; return; }
    handlers.context = { label: 'bloky', task: 'blocks', round: blocks.rounds, length: L };
    const res = searchCost(blocks.problem, roots, {
      cost: blocks.costs, minMove: blocks.costs.minMove, bound, length: L, timeLimit: slice, shard,
      skip: blocks.cur?.branch ?? 0,
      onSolution: found, onProgress: (p) => handlers.onProgress({ depth: L, nodes: p.nodes }),
    });
    blocks.rounds++;
    if (res.reason === 'done') { blocks.cur = null; blocks.next = L + 1; } else blocks.cur = { length: L, branch: res.branch };
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

  const SLICE = { library: 4000, staged: 90000, subset: 10000, full: 8000, comfort: 6000, refine: 6000, blocks: 6000 };
  for (let round = 0; left() > 300 && tasks.some((t) => !t.done); round++) {
    for (const task of tasks) {
      if (task.done || left() < 300) continue;
      const active = tasks.filter((t) => !t.done).length;
      const kind = task.library ? 'library' : task.staged ? 'staged' : task.comfort ? 'comfort' : task.blocks ? 'blocks' : task.refine ? 'refine' : task.full ? 'full' : 'subset';
      const has = tracker.shortest() !== null;
      // dokud není řešení, dostane hlavní díl první řešení; potom se střídají krátké díly
      let cap = SLICE[kind];
      if (kind === 'full' && has && fullTask.depth === undefined && (tracker.shortest() - (fullTask.resume ?? 0)) > 3) cap = 3000;
      // bez řešení: menší sady jen krátce (jinak je řada na etapách)
      if (kind === 'subset' && !has && round === 0) cap = 4000;
      const slice = Math.max(800, Math.min(cap, kind === 'staged' ? left() * 0.6 : left() / Math.max(1, active - 1)));
      if (task.library) {
        handlers.context = { label: 'knihovna', task: 'library', round };
        handlers.onProgress({ depth: 0, nodes: 0 });
        searchLibrary(P, full, roots, library, {
          deadline: Date.now() + Math.min(4000, Math.max(500, left() * 0.08)),
          onSolution: (alg, pre) => emit(alg, pre, null),
        });
        task.done = true;
        polish();
        continue;
      }
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
      if (task.comfort || task.refine || task.blocks) {
        if (!has) {
          // bez prvního řešení není co zlepšovat; když už nic jiného neběží, konec
          if (tasks.every((t) => t.comfort || t.refine || t.blocks || t.done)) task.done = true;
          continue;
        }
        if (task.comfort) runComfort(slice); else if (task.blocks) runBlocks(slice); else runRefine(slice);
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
