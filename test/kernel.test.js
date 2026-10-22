// Jádro WebAssembly (src/search/kernel.js) musí dávat přesně stejné výsledky jako JS verze:
// stejná řešení ve stejném pořadí, stejný počet uzlů, stejné navázání (branch).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { getPuzzle } from '../src/puzzles/index.js';
import { prepare, search, searchCost, costTables, NEAR_LIMIT } from '../src/search/engine.js';
import { costModel, lowerCosts, targetsOf } from '../src/search/explore.js';
import { buildTriggers } from '../src/ergonomics/triggers.js';
import { initKernel, disableKernel, kernelReady } from '../src/search/kernel.js';

const P = getPuzzle('333');
const movesOf = (bases) => bases.flatMap((base) => [1, -1, 2].map((amount) => ({ base, amount })));
const SOLVED = Object.fromEntries(P.slots.map((s) => [s.name, 'solved']));
const U = movesOf(['U']);
const config = { triggers: buildTriggers() };

before(async () => { assert.ok(await initKernel(), 'kernel.wasm se nenačetl'); });

/** Spustí fn bez jádra a s ním (nová úloha pro každý běh) a vrátí oba výsledky. */
async function both(fn) {
  disableKernel();
  const js = fn();
  await initKernel();
  assert.ok(kernelReady());
  const wasm = fn();
  return { js, wasm };
}

function caseOf(alg, moves, { auf = true, near = NEAR_LIMIT } = {}) {
  const start = P.applyAlg(P.solved(), P.invertAlg(P.parseAlg(alg)));
  const roots = auf ? [{ loc: start, pre: null }, ...U.map((m) => ({ loc: P.applyAlg(start, [m]), pre: P.moveToString(m) }))] : start;
  const problem = prepare({ puzzle: P, constraints: SOLVED, moves, targets: targetsOf(P, P.solved(), auf ? { post: U } : null), nearLimit: near });
  return { problem, roots };
}

const strip = (r) => ({ ...r, elapsed: 0 });

test('jádro: IDA* najde stejná řešení se stejným počtem uzlů (s tabulkou blízko cíle i bez ní)', async () => {
  for (const near of [NEAR_LIMIT, 0]) {
    const { js, wasm } = await both(() => {
      const { problem, roots } = caseOf("R U R' U R U2 R'", movesOf(['R', 'U', 'F']), { near });
      const found = [];
      const res = search(problem, roots, { maxLength: 9, extraDepth: 1, maxResults: 1e6, timeLimit: 1e9, onSolution: (a, l, i) => found.push([a, l, i.pre, i.target]) });
      return { res: strip(res), found };
    });
    assert.deepEqual(wasm, js);
    assert.ok(js.found.length > 0);
  }
});

test('jádro: díly (shard), přeskočení větví a limit výsledků', async () => {
  for (const opts of [{ shard: { index: 1, count: 3 } }, { skip: 17, minLength: 7 }, { maxResults: 3 }]) {
    const { js, wasm } = await both(() => {
      const { problem, roots } = caseOf("R U R' U' R' F R F'", movesOf(['R', 'U', 'F']));
      return strip(search(problem, roots, { maxLength: 9, extraDepth: 1, maxResults: 1e6, timeLimit: 1e9, ...opts }));
    });
    assert.deepEqual(wasm, js, JSON.stringify(opts));
  }
});

test('jádro: větve a meze podle ceny – stejné řešení, mez, uzly a navázání (i s databází ceny)', async () => {
  for (const useH of [false, true]) {
    const { js, wasm } = await both(() => {
      const moves = movesOf(['R', 'U', 'F', 'r']);
      const { problem, roots } = caseOf("R U R' U' R' F R2 U' R' U' R U R' F'", moves);
      const costs = lowerCosts(costModel(moves, config), config);
      const hcost = useH ? costTables(problem, costs.floors) : undefined;
      const found = [];
      const list = roots.map((r, i) => ({ ...r, g0: i ? 0.3 : 0 }));
      const res = searchCost(problem, list, {
        cost: costs, minMove: costs.minMove, bound: 30, length: 13, hcost, finish: (t) => (t ? 0.25 : 0),
        timeLimit: 1e9, onSolution: (a, c, i) => found.push([a, c, i.pre, i.target]),
      });
      return { res: strip(res), found };
    });
    assert.deepEqual(wasm, js);
    assert.ok(js.found.length > 0, 'má najít aspoň jedno řešení');
  }
});

test('jádro: větve a meze – díly a navázání', async () => {
  for (const opts of [{ shard: { index: 0, count: 2 } }, { skip: 40 }]) {
    const { js, wasm } = await both(() => {
      const moves = movesOf(['R', 'U', 'F']);
      const { problem, roots } = caseOf("R U R' U R U2 R'", moves);
      const costs = lowerCosts(costModel(moves, config), config);
      return strip(searchCost(problem, roots, { cost: costs, minMove: costs.minMove, bound: 20, length: 9, timeLimit: 1e9, ...opts }));
    });
    assert.deepEqual(wasm, js, JSON.stringify(opts));
  }
});

test('jádro: databáze vzdáleností, ceny a tabulka blízko cíle jsou stejné jako z JS', async () => {
  const moves = movesOf(['R', 'U', 'F', 'D']);
  const { js, wasm } = await both(() => {
    const { problem } = caseOf("R U R' U' R' F R F'", moves);
    const costs = lowerCosts(costModel(moves, config), config);
    const hcost = costTables(problem, costs.floors);
    const sample = [];
    for (let s = 0; s < 300; s++) {
      const loc = P.applyAlg(P.solved(), Array.from({ length: (s % 7) + 1 }, (_, i) => moves[(s * 7 + i * 13) % moves.length]));
      const v = Uint8Array.from(problem.pieces, (p) => problem.local[loc[p.ref]]);
      sample.push([problem.near.get(v), hcost(v)]);
    }
    return { tables: problem.tables.map((t) => Array.from(t.dist)), radius: problem.near.radius, size: problem.near.size, sample, cost: hcost.data.dists.map((d) => Array.from(d)) };
  });
  assert.deepEqual(wasm, js);
});
