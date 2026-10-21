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

import { prepare, tableKeys, NEAR_LIMIT } from './engine.js';
import { openTableCache } from './tablecache.js';
import { prepareSq1, searchSq1 } from './sq1engine.js';
import { getPuzzle } from '../puzzles/index.js';
import { scoreFor } from '../ergonomics/puzzles.js';
import { buildTriggers } from '../ergonomics/triggers.js';
import { compileGoal } from '../core/constraints.js';
import { explore, makeTracker, subsetsOf, targetsOf } from './explore.js';

self.onmessage = ({ data }) => {
  if (data.type !== 'search') return;
  run(data).catch((e) => self.postMessage({ type: 'error', message: e.message }));
};

async function run({ puzzle: id = '333', start, target, constraints, moves, held, auf, shard, seeds, options, ergonomics, sq1 }) {
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
      self.postMessage({ type: 'progress', phase: 'search', ...info, ...handlers.context, cleared: handlers.proof.cleared, speedOptimal: !!handlers.proof.speedOptimal, found: seen.size, best: tracker.shortest(), elapsed: Date.now() - t0 });
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
    // pattern databáze: uložené se načtou (jen ty, které budou potřeba), nové se uloží
    const cache = await openTableCache();
    const goal = Uint8Array.from(target);
    const targets = targetsOf(P, goal, auf);
    const nearLimit = options.nearLimit ?? NEAR_LIMIT;
    const bases = [...new Set(moves.map((m) => m.base))];
    const plan = [{ moves, targets, near: nearLimit },
      ...(bases.length >= 3 ? subsetsOf(bases).filter((_, i) => !shard || i % shard.count === shard.index)
        .map((sub) => ({ moves: moves.filter((m) => sub.includes(m.base)), targets: targets.slice(0, 1), near: Math.floor(nearLimit / 4) })) : [])];
    await cache.load(plan.flatMap((x) => tableKeys({ puzzle: P, constraints, targets: x.targets, moves: x.moves, nearLimit: x.near })));
    const full = prepare({ puzzle: P, constraints, moves, targets, nearLimit, onTable, cache });
    await cache.flush();
    res = explore({ P, start: Uint8Array.from(start), target: goal, constraints, moves, held: held ?? moves, auf, shard, options, config, handlers, tracker, scoreOf, onTable, t0, full, cache });
    await cache.flush();
  }
  flush();
  self.postMessage({
    type: 'done', reason: res.reason, optimal: res.optimal, nodes: res.nodes, cleared: res.cleared ?? 0,
    speedOptimal: !!handlers.proof.speedOptimal,
    found: seen.size || res.solutions.length, elapsed: Date.now() - t0,
  });
}

