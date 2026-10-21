import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPuzzle } from '../src/puzzles/index.js';
import { prepare, searchCost } from '../src/search/engine.js';
import { explore, makeTracker, targetsOf, costModel, lowerCosts } from '../src/search/explore.js';
import { searchLibrary, variantsOf, blocksOf, blockPuzzle } from '../src/search/library.js';
import { scoreFor } from '../src/ergonomics/puzzles.js';
import { buildTriggers } from '../src/ergonomics/triggers.js';
import { learnPreferences } from '../src/ergonomics/calibrate.js';
import { compileGoal } from '../src/core/constraints.js';

const P = getPuzzle('333');
const movesOf = (bases) => bases.flatMap((base) => [1, -1, 2].map((amount) => ({ base, amount })));
const SOLVED = Object.fromEntries(P.slots.map((s) => [s.name, 'solved']));
const OLL = Object.fromEntries(P.slots.map((s) => [s.name, s.name.includes('U') && s.facelets.length > 1 ? 'orientation' : 'solved']));
const caseOf = (alg) => P.applyAlg(P.solved(), P.invertAlg(P.parseAlg(alg)));
const U = movesOf(['U']);
const config = { triggers: buildTriggers() };
const rootsOf = (start) => [{ loc: start, pre: null }, ...U.map((m) => ({ loc: P.applyAlg(start, [m]), pre: P.moveToString(m) }))];
const solves = (start, alg, c = SOLVED) => {
  const goal = compileGoal(c, P.solved(), P);
  return [null, ...U].some((post) => goal.test(P.applyAlg(start, post ? [...P.parseAlg(alg), post] : alg)));
};

/** Hledání jako worker (jedno vlákno). */
function run(start, constraints, moves, options) {
  const auf = { pre: U, post: U };
  const tracker = makeTracker(P, 0.5);
  const handlers = {
    onSolution: (alg, pre = null, post = null) => tracker.add({ alg, pre, post }, scoreFor(P, alg, config)),
    context: {}, proof: { cleared: 0 }, onProgress: () => {},
  };
  const full = prepare({ puzzle: P, constraints, moves, targets: targetsOf(P, P.solved(), auf), nearLimit: 200000 });
  explore({
    P, start, target: P.solved(), constraints, moves, held: moves, auf, config, handlers, tracker, full,
    options: { lambda: 0.5, maxLength: 14, extraDepth: 1, maxResults: 2000, timeLimit: 20000, ...options },
    scoreOf: (alg) => scoreFor(P, alg, config), onTable: () => {}, t0: Date.now(),
  });
  return { best: tracker.best('speed'), proof: handlers.proof };
}

test('pohodlí: u Sune s ⟨R U F⟩ dokáže, že pohodlnější algoritmus neexistuje', () => {
  const start = caseOf("R U R' U R U2 R'");
  const t0 = Date.now();
  const { best, proof } = run(start, OLL, movesOf(['R', 'U', 'F']), {});
  assert.equal(proof.speedOptimal, true);
  assert.ok(Date.now() - t0 < 19000, 'skončí dřív než časový limit');
  assert.equal(scoreFor(P, best.alg, config).total, scoreFor(P, "R U R' U R U2 R'", config).total);
});

test('ceny pro důkaz: nižší než skutečné hodnocení i s triggery', () => {
  const moves = movesOf(['R', 'U', 'F']);
  const costs = costModel(moves, config);
  const low = lowerCosts(costs, config);
  const idx = new Map(moves.map((m, i) => [P.moveToString(m), i]));
  for (const alg of ["R U R' U'", "R U R' U' R' F R F'", "F R U R' U' F'", "R U2 R' U' R U' R'"]) {
    const seq = alg.split(' ').map((t) => idx.get(t));
    let ctx = low.start, c = 0;
    for (const m of seq) { c += low.cost(ctx, m); ctx = low.step(ctx, m); }
    assert.ok(c <= scoreFor(P, alg, config).total + 1e-9, `${alg}: ${c} > ${scoreFor(P, alg, config).total}`);
    assert.ok(seq.length * low.minMove <= c + 1e-9);
  }
});

test('větve a meze: navázání (skip) najde totéž co jedno hledání', () => {
  const start = caseOf("R U R' U R U2 R'");
  const moves = movesOf(['R', 'U']);
  const problem = prepare({ puzzle: P, constraints: OLL, moves, targets: targetsOf(P, P.solved(), { post: U }) });
  const costs = costModel(moves, config);
  const all = [];
  const one = searchCost(problem, rootsOf(start), { cost: costs, minMove: costs.minMove, bound: 100, length: 7, onSolution: (a) => all.push(a) });
  assert.equal(one.reason, 'done');
  // po částech: první část skončí po pár větvích, druhá naváže
  const parts = [];
  const first = searchCost(problem, rootsOf(start), { cost: costs, minMove: costs.minMove, bound: 100, length: 7, timeLimit: 0, onSolution: (a) => parts.push(a) });
  const rest = searchCost(problem, rootsOf(start), { cost: costs, minMove: costs.minMove, bound: first.bound, length: 7, skip: first.branch, onSolution: (a) => parts.push(a) });
  assert.equal(rest.reason, 'done');
  // nejlepší (poslední nalezené) je stejně levné
  assert.equal(rest.bound, one.bound);
});

test('knihovna: Ub-perm z inverze Ua-permu, výsledky řeší případ', () => {
  const ub = caseOf("R2 U R U R' U' R' U' R' U R'");
  const moves = movesOf(['R', 'U']);
  const problem = prepare({ puzzle: P, constraints: SOLVED, moves, targets: targetsOf(P, P.solved(), { post: U }), nearLimit: 200000 });
  const found = [];
  searchLibrary(P, problem, rootsOf(ub), ["R U' R U R U R U' R' U' R2"], { deadline: Date.now() + 5000, onSolution: (alg, pre) => found.push([pre, alg].filter(Boolean).join(' ')) });
  assert.ok(found.length > 0);
  for (const alg of found) assert.ok(solves(ub, alg), alg);
  assert.ok(found.some((a) => a.split(' ').length <= 12), found.join(' | '));
  // varianty jen z povolených tahů (zrcadlo s L není v ⟨R U⟩)
  const allowed = new Set(moves.map((m) => `${m.base}${m.amount}`));
  assert.equal(variantsOf(P, "R U R'", allowed).length, 2);
});

test('bloky: hlavolam s bloky dává platné algoritmy, bloky jen z povolených tahů', () => {
  const moves = movesOf(['R', 'U', 'F']);
  const list = blocksOf(buildTriggers(), moves, [["R1", "U1", "R-1", "U-1"], ["R1", "U1", "R-1", "U-1", "F1"]]);
  assert.ok(list.length > 3);
  assert.ok(list.every((b) => b.seq.every((i) => i >= 0 && i < moves.length)));
  const bp = blockPuzzle(P);
  const bmoves = [...moves, ...list.map((b) => ({ base: '#', amount: 1, seq: b.seq.map((i) => moves[i]) }))];
  const start = caseOf("F R U R' U' F'");
  const problem = prepare({ puzzle: bp, constraints: OLL, moves: bmoves, targets: targetsOf(P, P.solved(), { post: U }) });
  const costs = costModel([...moves, ...list.map((b) => b.seq.map((i) => moves[i]))], config, [...moves.map(() => 0), ...list.map((b) => b.bonus)]);
  const found = [];
  searchCost(problem, rootsOf(start), { cost: costs, minMove: costs.minMove, bound: 100, length: 3, onSolution: (a, c, info) => found.push([info.pre, a].filter(Boolean).join(' ')) });
  assert.ok(found.length > 0);
  for (const alg of found) assert.ok(solves(start, alg, OLL), alg);
});

test('volby z generátoru doladí váhy: vybraný vychází lépe', () => {
  const pairs = [
    { better: "R U R' U' R' F R F'", worse: "R U2 R' U' R U' R'" },
    { better: "F R U R' U' F'", worse: "R U2 R2 U' R2 U' R2 U2 R" },
    { better: "R' F R F' R U R' U'", worse: "R U R' U R U2 R'" },
    { better: "F R' F' R U R U' R'", worse: "R U R' U' R U' R'" },
  ];
  const res = learnPreferences(P, {}, pairs);
  assert.equal(res.ok, true);
  assert.ok(res.changes.some((c) => c.key.startsWith('F:') && c.to < c.from), JSON.stringify(res.changes));
  assert.equal(learnPreferences(P, {}, pairs.slice(0, 1)).ok, false);
});
