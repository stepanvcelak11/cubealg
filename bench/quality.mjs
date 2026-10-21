// Měření kvality hledání: pro známé případy (PLL, OLL, EPBL) spustí hledání
// (jedno vlákno, stejný průběh jako worker) a porovná nejlepší nalezený algoritmus
// podle rychlosti se známým rychlým algoritmem. Nižší náročnost = lepší.
//
//   node bench/quality.mjs [sekund na případ] [filtr názvu] [lib]
//   lib = knihovna ze známých algoritmů ostatních případů (ne toho hledaného)

import { getPuzzle } from '../src/puzzles/index.js';
import { prepare, NEAR_LIMIT } from '../src/search/engine.js';
import { explore, makeTracker, targetsOf } from '../src/search/explore.js';
import { scoreFor } from '../src/ergonomics/puzzles.js';
import { buildTriggers } from '../src/ergonomics/triggers.js';

const P = getPuzzle('333');
const seconds = Number(process.argv[2] ?? 10);
const filter = process.argv[3] ?? '';
const useLib = process.argv[4] === 'lib';
const config = { triggers: buildTriggers() };
const score = (alg) => scoreFor(P, alg, config).total;

const movesOf = (bases) => bases.flatMap((base) => [1, -1, 2].map((amount) => ({ base, amount })));
const BIG = movesOf(['R', 'U', 'F', 'L', 'D', 'B', 'r', 'M']);
const MUD = movesOf(['M', 'U', 'D']);
const all = (fn) => Object.fromEntries(P.slots.map((s) => [s.name, fn(s)]));
const SOLVED = all(() => 'solved');
const OLL = all((s) => (s.name.includes('U') && s.facelets.length > 1 ? 'orientation' : 'solved'));

export const CASES = [
  { name: 'T-perm', ref: "R U R' U' R' F R2 U' R' U' R U R' F'", moves: BIG, c: SOLVED },
  { name: 'Jb-perm', ref: "R U R' F' R U R' U' R' F R2 U' R'", moves: BIG, c: SOLVED },
  { name: 'Ua-perm', ref: "R U' R U R U R U' R' U' R2", moves: BIG, c: SOLVED },
  { name: 'Ub-perm', ref: "R2 U R U R' U' R' U' R' U R'", moves: BIG, c: SOLVED },
  { name: 'H-perm', ref: "M2 U M2 U2 M2 U M2", moves: BIG, c: SOLVED },
  { name: 'Z-perm', ref: "M' U M2 U M2 U M' U2 M2", moves: BIG, c: SOLVED },
  { name: 'Y-perm', ref: "F R U' R' U' R U R' F' R U R' U' R' F R F'", moves: BIG, c: SOLVED },
  { name: 'Ra-perm', ref: "R U' R' U' R U R D R' U' R D' R' U2 R'", moves: BIG, c: SOLVED },
  { name: 'F-perm', ref: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R", moves: BIG, c: SOLVED },
  { name: 'V-perm', ref: "R' U R' U' y R' F' R2 U' R' U R' F R F", moves: BIG, c: SOLVED, skip: true },
  { name: 'Na-perm', ref: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'", moves: BIG, c: SOLVED },
  { name: 'Ga-perm', ref: "R2 U R' U R' U' R U' R2 D U' R' U R D'", moves: BIG, c: SOLVED },
  { name: 'Gc-perm', ref: "R2 U' R U' R U R' U R2 D' U R U' R' D", moves: BIG, c: SOLVED },
  { name: 'E-perm', ref: "R2 U R' U' D R2 U' R U' R2 U R2 D' R2 U R' U' R2", moves: BIG, c: SOLVED, skip: true },
  { name: 'Sune', ref: "R U R' U R U2 R'", moves: BIG, c: OLL },
  { name: 'OLL 45', ref: "F R U R' U' F'", moves: BIG, c: OLL },
  { name: 'OLL 21', ref: "R U2 R' U' R U R' U' R U' R'", moves: BIG, c: OLL },
  { name: 'Pi', ref: "R U2 R2 U' R2 U' R2 U2 R", moves: BIG, c: OLL },
  { name: 'OLL 33', ref: "R U R' U' R' F R F'", moves: BIG, c: OLL },
  { name: 'OLL 37', ref: "F R' F' R U R U' R'", moves: BIG, c: OLL },
  { name: 'EPBL Ua+Ua', ref: "M2 U M U2 M' U M2 D M2 D M' D2 M D M2", moves: MUD, c: SOLVED },
];

/** Jedno hledání jako worker (bez shardů). */
export function solve(cs, { seconds: sec = seconds, options = {} } = {}) {
  const start = P.applyAlg(P.solved(), P.invertAlg(P.parseAlg(cs.ref)));
  const target = P.solved();
  const auf = { pre: movesOf(['U']), post: movesOf(['U']) };
  const seen = new Map();
  const tracker = makeTracker(P, 0.5);
  const t0 = Date.now();
  let firstBest = null;
  const handlers = {
    onSolution: (alg, pre = null, post = null) => {
      const key = `${pre ?? ''}|${alg}|${post ?? ''}`;
      if (seen.has(key)) return;
      const s = scoreFor(P, alg, config);
      seen.set(key, s.total);
      tracker.add({ alg, pre, post }, s);
    },
    context: {}, proof: { cleared: 0 }, onProgress: () => {},
  };
  const targets = targetsOf(P, target, auf);
  const full = prepare({ puzzle: P, constraints: cs.c, moves: cs.moves, targets, nearLimit: NEAR_LIMIT });
  const res = explore({
    P, start, target, constraints: cs.c, moves: cs.moves, held: cs.moves, auf, options: { lambda: 0.5, maxLength: 20, extraDepth: 2, maxResults: 3000, timeLimit: sec * 1000, ...options },
    config, handlers, tracker, scoreOf: (alg) => scoreFor(P, alg, config), onTable: () => {}, t0, full,
  });
  const best = tracker.best('speed');
  return { best, total: best ? score(best.alg) : Infinity, found: seen.size, ms: Date.now() - t0, res, proof: handlers.proof.speedOptimal ?? false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let sumRatio = 0, n = 0, wins = 0;
  for (const cs of CASES.filter((c) => !c.skip && c.name.includes(filter))) {
    const r = solve(cs, { options: useLib ? { library: CASES.filter((o) => o !== cs).map((o) => o.ref) } : {} });
    r.res.proofOpt = r.proof;
    const ref = score(cs.ref);
    const ratio = r.total / ref;
    sumRatio += ratio; n++; if (r.total <= ref + 1e-9) wins++;
    console.log(`${cs.name.padEnd(12)} ref ${ref.toFixed(2).padStart(6)}  best ${r.total.toFixed(2).padStart(6)}  ${(ratio * 100).toFixed(0).padStart(4)} %  ${String(r.found).padStart(5)} řeš.  ${(r.ms / 1000).toFixed(1)} s  ${r.res.proofOpt ? "✓opt" : "    "}  ${r.best ? `${r.best.pre ? `(${r.best.pre}) ` : ''}${r.best.alg}${r.best.post ? ` (${r.best.post})` : ''}` : '-'}`);
  }
  console.log(`průměr ${(sumRatio / n * 100).toFixed(1)} % známého · aspoň tak dobré: ${wins}/${n}`);
}
