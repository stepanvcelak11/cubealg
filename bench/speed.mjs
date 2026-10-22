// Rychlost hledání: prohledané stavy za sekundu (úplné hledání a hledání podle
// pohodlí) na pevných případech s velkou sadou tahů.
//   node bench/speed.mjs

import { getPuzzle } from '../src/puzzles/index.js';
import { prepare, search, searchCost, costTables, NEAR_LIMIT } from '../src/search/engine.js';
import { costModel, lowerCosts, targetsOf } from '../src/search/explore.js';
import { buildTriggers } from '../src/ergonomics/triggers.js';
import { initKernel, disableKernel } from '../src/search/kernel.js';

const P = getPuzzle('333');
const movesOf = (bases) => bases.flatMap((base) => [1, -1, 2].map((amount) => ({ base, amount })));
const BIG = movesOf(['R', 'U', 'F', 'L', 'D', 'B', 'r', 'M']);
const SOLVED = Object.fromEntries(P.slots.map((s) => [s.name, 'solved']));
const U = movesOf(['U']);
const config = { triggers: buildTriggers() };

export function measure(alg, { depth = 9, length = 11, bound = 12 } = {}) {
  const start = P.applyAlg(P.solved(), P.invertAlg(P.parseAlg(alg)));
  const roots = [{ loc: start, pre: null }, ...U.map((m) => ({ loc: P.applyAlg(start, [m]), pre: P.moveToString(m) }))];
  let t = Date.now();
  const problem = prepare({ puzzle: P, constraints: SOLVED, moves: BIG, targets: targetsOf(P, P.solved(), { post: U }), nearLimit: NEAR_LIMIT });
  const prep = Date.now() - t;
  t = Date.now();
  const a = search(problem, roots, { minLength: depth, maxLength: depth, extraDepth: 0, maxResults: 1e9, timeLimit: 60000 });
  const fullMs = Date.now() - t;
  const costs = lowerCosts(costModel(BIG, config), config);
  t = Date.now();
  const b = searchCost(problem, roots, { cost: costs, minMove: costs.minMove, bound, length, timeLimit: 60000 });
  const costMs = Date.now() - t;
  t = Date.now();
  const hcost = costTables(problem, costs.floors);
  const hprep = Date.now() - t;
  t = Date.now();
  const c = searchCost(problem, roots, { cost: costs, minMove: costs.minMove, bound, length, hcost, timeLimit: 60000 });
  const hMs = Date.now() - t;
  if (c.bound !== b.bound) throw new Error(`databáze ceny změnila výsledek: ${c.bound} ≠ ${b.bound}`);
  return { hprep, hcost: { nodes: c.nodes, ms: hMs }, prep, full: { nodes: a.nodes, ms: fullMs, rate: Math.round(a.nodes / fullMs) }, cost: { nodes: b.nodes, ms: costMs, rate: Math.round(b.nodes / costMs) } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // node bench/speed.mjs js = bez jádra WebAssembly
  if (process.argv[2] === 'js') disableKernel(); else console.log('jádro WebAssembly:', await initKernel());
  for (const [name, alg] of [['T-perm', "R U R' U' R' F R2 U' R' U' R U R' F'"], ['Jb-perm', "R U R' F' R U R' U' R' F R2 U' R'"]]) {
    const r = measure(alg);
    console.log(`${name.padEnd(8)} příprava ${r.prep} ms · úplné ${r.full.nodes} uzlů / ${r.full.ms} ms = ${r.full.rate}/ms · pohodlí ${r.cost.nodes} uzlů / ${r.cost.ms} ms = ${r.cost.rate}/ms · s databází ceny ${r.hcost.nodes} uzlů / ${r.hcost.ms} ms (příprava ${r.hprep} ms)`);
  }
}
