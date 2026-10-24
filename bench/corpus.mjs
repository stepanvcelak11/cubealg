// Sbírka algoritmů pro porovnávání dvojic (Tahy a váhy → Porovnat algoritmy) a pro
// ladění výchozích vah: pro známé případy (PLL, OLL, F2L) oblíbený algoritmus skladačů
// a různé alternativy, které najde hledání (jiné tahy, jiná délka). Každý se ověří.
//   node bench/corpus.mjs [sekund na případ] > src/ergonomics/corpus.js

import { getPuzzle } from '../src/puzzles/index.js';
import { prepare, NEAR_LIMIT } from '../src/search/engine.js';
import { explore, makeTracker, targetsOf } from '../src/search/explore.js';
import { scoreFor } from '../src/ergonomics/puzzles.js';
import { buildTriggers } from '../src/ergonomics/triggers.js';
import { features } from '../src/ergonomics/calibrate.js';
import { clock } from '../src/search/clock.js';
import { initKernel } from '../src/search/kernel.js';
import { compileGoal } from '../src/core/constraints.js';

const P = getPuzzle('333');
const seconds = Number(process.argv[2] ?? 8);
const config = { triggers: buildTriggers() };
const score = (alg) => scoreFor(P, alg, config).total;
const movesOf = (bases) => bases.flatMap((base) => [1, -1, 2].map((amount) => ({ base, amount })));
const BIG = movesOf(['R', 'U', 'F', 'L', 'D', 'B', 'r', 'M']);
const all = (fn) => Object.fromEntries(P.slots.map((s) => [s.name, fn(s)]));
const SOLVED = all(() => 'solved');
const OLL = all((s) => (s.name.includes('U') && s.facelets.length > 1 ? 'orientation' : 'solved'));
const F2L = all((s) => (s.name.includes('U') && s.facelets.length > 1 ? 'ignore' : 'solved'));

// oblíbené algoritmy (bez otočení kostky)
const PLL = {
  'T-perm': "R U R' U' R' F R2 U' R' U' R U R' F'", 'Ja-perm': "R' U L' U2 R U' R' U2 R L", 'Jb-perm': "R U R' F' R U R' U' R' F R2 U' R'",
  'Ua-perm': "R U' R U R U R U' R' U' R2", 'Ub-perm': "R2 U R U R' U' R' U' R' U R'", 'H-perm': 'M2 U M2 U2 M2 U M2', 'Z-perm': "M' U M2 U M2 U M' U2 M2",
  'Y-perm': "F R U' R' U' R U R' F' R U R' U' R' F R F'", 'Aa-perm': "R' F R' B2 R F' R' B2 R2", 'Ab-perm': "R2 B2 R F R' B2 R F' R",
  'Ra-perm': "R U' R' U' R U R D R' U' R D' R' U2 R'", 'Rb-perm': "R' U2 R U2 R' F R U R' U' R' F' R2", 'F-perm': "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
  'Ga-perm': "R2 U R' U R' U' R U' R2 D U' R' U R D'", 'Gb-perm': "R' U' R U D' R2 U R' U R U' R U' R2 D", 'Gc-perm': "R2 U' R U' R U R' U R2 D' U R U' R' D",
  'Gd-perm': "R U R' U' D R2 U' R U' R' U R' U R2 D'", 'Na-perm': "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'",
};
const OLLS = {
  Sune: "R U R' U R U2 R'", Antisune: "R U2 R' U' R U' R'", 'OLL 45': "F R U R' U' F'", 'OLL 44': "F U R U' R' F'", 'OLL 21': "R U2 R' U' R U R' U' R U' R'",
  'OLL 22': "R U2 R2 U' R2 U' R2 U2 R", 'OLL 23': "R2 D' R U2 R' D R U2 R", 'OLL 33': "R U R' U' R' F R F'", 'OLL 24': "r U R' U' r' F R F'",
  'OLL 25': "F' r U R' U' r' F R", 'OLL 37': "F R' F' R U R U' R'", 'OLL 28': "r U R' U' M U R U' R'", 'OLL 57': "R U R' U' M' U R U' r'",
  'OLL 43': "R' U' F' U F R", 'OLL 51': "F U R U' R' U R U' R' F'", 'OLL 35': "R U2 R2 F R F' R U2 R'", 'OLL 38': "R U R' U R U' R' U' R' F R F'",
  'OLL 46': "R' U' R' F R F' U R", 'OLL 52': "R U R' U R U' B U' B' R'",
};
const F2LS = {
  'F2L 1': "U R U' R'", 'F2L 2': "F R' F' R", 'F2L 3': "U' R U R' U2 R U' R'", 'F2L 4': "R U' R' U R U' R'", 'F2L 5': "U' R U2 R' U R U R'",
  'F2L 6': "R U R' U' R U R' U' R U R'", 'F2L 7': "U R U2 R' U R U' R'", 'F2L 8': "R U2 R' U' R U R'", 'F2L 9': "U' F' U F", 'F2L 10': "R U' R' U2 F' U' F",
};
const CASES = [
  ...Object.entries(PLL).map(([name, ref]) => ({ name, ref, c: SOLVED, kind: 'PLL' })),
  ...Object.entries(OLLS).map(([name, ref]) => ({ name, ref, c: OLL, kind: 'OLL' })),
  ...Object.entries(F2LS).map(([name, ref]) => ({ name, ref, c: F2L, kind: 'F2L' })),
];

function search(cs, start) {
  clock.setVirtual(true, 1);
  const target = P.solved();
  const auf = { pre: movesOf(['U']), post: movesOf(['U']) };
  const seen = new Map();
  const tracker = makeTracker(P, 0.5);
  const handlers = {
    onSolution: (alg, pre = null, post = null) => { if (!seen.has(alg)) { const s = scoreFor(P, alg, config); seen.set(alg, s.total); tracker.add({ alg, pre, post }, s); } },
    context: {}, proof: { cleared: 0 }, onProgress: () => {},
  };
  const full = prepare({ puzzle: P, constraints: cs.c, moves: BIG, targets: targetsOf(P, target, auf), nearLimit: NEAR_LIMIT });
  explore({ P, start, target, constraints: cs.c, moves: BIG, held: BIG, auf, options: { lambda: 0.5, maxLength: 18, extraDepth: 2, maxResults: 3000, timeLimit: seconds * 1000 },
    config, handlers, tracker, scoreOf: (alg) => scoreFor(P, alg, config), onTable: () => {}, t0: clock.now(), full });
  clock.setVirtual(false);
  return seen;
}

/** Algoritmus řeší případ (i s natočením horní vrstvy před a po). */
function solves(cs, start, alg) {
  const test = compileGoal(cs.c).test;
  for (const pre of ['', 'U', "U'", 'U2']) for (const post of ['', 'U', "U'", 'U2']) {
    if (test(P.applyAlg(start, [pre, alg, post].filter(Boolean).join(' ')))) return true;
  }
  return false;
}

await initKernel();
const out = [];
for (const cs of CASES) {
  const start = P.applyAlg(P.solved(), P.invertAlg(P.parseAlg(cs.ref)));
  // případ musí být opravdu PLL / OLL / F2L (oblíbený algoritmus jen ten krok)
  const before = { PLL: OLL, OLL: F2L, F2L: all(() => 'ignore') }[cs.kind];
  if (cs.kind !== 'F2L' && !compileGoal(before).test(start)) { console.error(`${cs.name}: není ${cs.kind}`); continue; }
  const found = search(cs, start);
  const ref = score(cs.ref), len = cs.ref.split(' ').length;
  // alternativy: ne o moc horší ani delší, různé složení tahů (na každé „složení“ jedna)
  const cands = [...found].filter(([alg, s]) => alg !== cs.ref && s <= Math.max(ref, Math.min(...found.values())) * 1.6 && alg.split(' ').length <= Math.max(len + 4, 8) && solves(cs, start, alg))
    .sort((a, b) => a[1] - b[1]);
  const picked = [], styles = new Set();
  for (const [alg] of cands) {
    const f = features(P, alg, config);
    const style = [...new Set([...f.keys()].filter((k) => k.includes(':') && !k.startsWith('flow')).map((k) => k[0]))].sort().join('') + Math.round(alg.split(' ').length / 3);
    if (styles.has(style) && picked.length >= 4) continue;
    styles.add(style);
    picked.push(alg);
    if (picked.length >= 8) break;
  }
  console.error(`${cs.name.padEnd(10)} ${found.size} nalezeno → ${picked.length} alternativ`);
  out.push({ name: cs.name, kind: cs.kind, ref: cs.ref, alts: picked });
}
console.log(`// Vygenerováno: node bench/corpus.mjs ${seconds} > src/ergonomics/corpus.js
// Oblíbené algoritmy skladačů (ref) a alternativy pro stejný případ, které našlo hledání.
// Dvojice ze stejného případu se porovnávají (Tahy a váhy → Porovnat algoritmy) a podle
// nich se ladí výchozí váhy (bench/fit.mjs).
export const CORPUS = ${JSON.stringify(out, null, 1)};`);
