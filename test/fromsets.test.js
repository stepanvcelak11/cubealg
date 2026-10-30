import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPuzzle } from '../src/puzzles/index.js';
import { CORPUS } from '../src/ergonomics/corpus.js';
import { coreOf, setPairs, learnFromSets, winsOf } from '../src/ergonomics/fromsets.js';
import { scoreAlg } from '../src/ergonomics/score.js';
import { features, featureLabel } from '../src/ergonomics/calibrate.js';
import { costModel } from '../src/search/explore.js';
import { parseAlg } from '../src/core/notation.js';

const P = getPuzzle('333');

test('jádro algoritmu bez AUF v závorce', () => {
  assert.equal(coreOf("(U) R U R' U' (U2)"), "R U R' U'");
  assert.equal(coreOf("U R U R'"), "U R U R'");
});

test('dvojice ze sad: soupeři ze sbírky i z hledání, ne mezi mými', () => {
  const tperm = CORPUS.find((c) => c.name === 'T-perm') ?? CORPUS.find((c) => c.kind === 'PLL' && c.alts.length);
  const mine = [{ id: 'a', alg: tperm.alts[0] ?? tperm.ref }];
  const { pairs, cases } = setPairs(mine, {}, { rivals: new Map([['a', ["(U) M2 U M2 U2 M2 U M2"]]]) });
  assert.equal(cases.length, 1);
  assert.ok(pairs.every((p) => p.better === coreOf(mine[0].alg) && p.worse !== p.better));
  assert.ok(pairs.some((p) => p.worse === 'M2 U M2 U2 M2 U M2'), 'soupeř z hledání bez AUF');
});

test('učení ze sad: tvoje algoritmy pak vycházejí nejlepší častěji, učí se i návaznost', () => {
  // „skladač“ si vždy vybral alternativu s nejvíc M
  const mine = CORPUS.filter((c) => c.alts.length).map((c, i) => ({ id: `a${i}`,
    alg: [c.ref, ...c.alts].sort((a, b) => (b.match(/M/g) ?? []).length - (a.match(/M/g) ?? []).length)[0] }));
  const res = learnFromSets(P, {}, mine);
  assert.ok(res.ok);
  assert.ok(res.winsAfter > res.winsBefore + 5, `${res.winsBefore} → ${res.winsAfter}`);
  assert.ok(res.changes.some((c) => c.key.startsWith('pair:')));
  assert.ok(res.config.moveWeights.M[0] < 2);
  assert.equal(res.config.pairs, undefined);
  assert.equal(winsOf([{ alg: 'R U', rivals: ['R U R U'] }], {}), 1);
});

test('váha dvojice tahů: hodnocení, důvod, rysy a dolní mez hledání', () => {
  const cfg = { pairWeights: { 'M>D': 1 } };
  const a = scoreAlg("M2 D'", {}), b = scoreAlg("M2 D'", cfg);
  assert.ok(Math.abs(b.total - a.total - 1) < 0.02);
  assert.match(b.perMove[1].flowReason, /M → D/);
  assert.equal(features(P, "M2 D' M", { pairs: true }).get('pair:M>D'), 1);
  assert.equal(features(P, "M2 D'", {}).get('pair:M>D'), undefined);
  assert.equal(featureLabel('pair:M>D'), 'návaznost M → D');
  // sleva za dvojici nesmí rozbít dolní mez ceny tahu
  const held = parseAlg("R U R' U'");
  const cm = costModel(held, { pairWeights: { 'R>U': -0.8 } });
  for (let m = 0; m < held.length; m++) assert.ok(cm.floors[m] <= cm.cost(cm.step(0, 0), m) + 1e-9);
});

test('zamíchání do případu: po zamíchání a algoritmu je kostka složená (i s M, rotací, širokými tahy a AUF)', async () => {
  const { caseScramble } = await import('../src/ui/casescramble.js');
  const { solved, applyAlg } = await import('../src/core/cube.js');
  const { ROTATIONS } = await import('../src/core/rotations.js');
  for (const [alg, auf] of [['M R2 S2 M R2 S2', 0], ["R U R' U' R' F R2 U' R' U' R U R' F'", 1], ["(U) R U R' y' U R' U' R", 2], ["r U R' U'", 3]]) {
    const sc = caseScramble(alg, auf);
    assert.ok(sc && !/[MESxyzrludfb]/.test(sc), `jen vnější tahy: ${sc}`);
    const st = applyAlg(applyAlg(solved(), sc), `${["", "U'", 'U2', 'U'][auf]} ${alg.replace(/[()]/g, ' ')}`.trim());
    assert.ok(ROTATIONS.some((r) => (r ? applyAlg(st, r) : st).every((v, i) => v === i)), `${alg} / ${auf}: ${sc}`);
  }
  assert.equal(caseScramble('R R\''), '');
  assert.equal(caseScramble('Q'), null);
});

test('zadání jako v metodě: víc barev na nálepce → skupinová pravidla, výčet případů hlídá Start', async () => {
  const { cellsLabTask } = await import('../src/ui/celleditor.js');
  const { enumerateCases } = await import('../src/core/cases.js');
  const { compileGoal } = await import('../src/core/constraints.js');
  const { taskOps } = await import('../src/core/task.js');
  const WY = ['U', 'D'];
  const before = Object.fromEntries(['DF', 'DB', 'DR', 'DL'].map((n) => [n, { colors: { D: WY } }]));
  const after = { UF: { colors: { U: WY } }, UB: { colors: { U: WY } }, UR: { own: 'solved' } };
  const task = cellsLabTask(before, after, { down: 'D', front: 'F' });
  assert.equal(task.constraints.UR, 'solved');
  assert.ok(task.constraints['#classes'].length);
  const b = taskOps(P).buildTask(task.colorsA, task.colorsB, task.constraints, {});
  // kde je UR, Start neříká (případ vybere Lab / generátor) – jiné chyby nejsou
  assert.deepEqual(b.errors.filter((e) => !e.startsWith('Výchozí:')), []);
  assert.ok(b.constraints['#classes'], 'skupinová pravidla projdou zadáním');
  const r = enumerateCases(P, task, { auf: false });
  assert.ok(!r.error && r.cases.length > 10, `${r.error} ${r.cases.length}`);
  const startOk = compileGoal(task.before, P.solved(), P).test;
  assert.ok(r.cases.every((c) => startOk(c.rep)));
});
