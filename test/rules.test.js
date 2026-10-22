import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg } from '../src/core/cube.js';
import { compileGoal } from '../src/core/constraints.js';
import { compileRule, mergeConstraints, constraintsKey, describeRule, RULE_PRESETS } from '../src/core/rules.js';
import { prepare, search } from '../src/search/engine.js';
import { MoveSet } from '../src/core/moveset.js';
import { practiceState } from '../src/timer/practice.js';
import { seededRandom } from '../src/sim/simulate.js';
import { frameMap, DEFAULT_FRAME } from '../src/ui/parts.js';

const map = frameMap({ down: 'D', front: 'F' }); // pohled metody = kostka
const preset = (id) => RULE_PRESETS.find((p) => p.id === id).rule;

test('pravidlo „kříž z kterýchkoli bílých/žlutých hran“: test cíle i hledání', () => {
  const goal = compileRule(preset('cross-any'), map);
  assert.equal(goal['#classes'][0].pieces.length, 8);
  const t = compileGoal(goal).test;
  assert.ok(t(solved()));
  assert.ok(t(applyAlg(solved(), 'R2 L2'))); // hrany U a D prohozené vpravo a vlevo – pořád bílá/žlutá dole
  assert.ok(!t(applyAlg(solved(), 'F')));
  const problem = prepare({ constraints: goal, moves: MoveSet.preset('faces').list });
  const rand = seededRandom(9);
  for (let i = 0; i < 4; i++) {
    const s = practiceState({}, rand);
    const r = search(problem, s, { maxLength: 10, extraDepth: 0, maxResults: 20, timeLimit: 20000 });
    assert.ok(r.solutions.length > 0);
    for (const a of r.solutions) assert.ok(t(applyAlg(s, a)), a);
    assert.ok(r.optimal <= 5);
  }
});

test('pravidlo „být v místech“ (separace hran) = povolené polohy každého dílku', () => {
  const goal = compileRule(preset('sep-edges-d'), map);
  assert.equal(Object.keys(goal).length, 4);
  const t = compileGoal(goal).test;
  assert.ok(t(solved()));
  assert.ok(t(applyAlg(solved(), 'D')));      // bílé… (barva dole) hrany jen pootočené ve vrstvě
  assert.ok(!t(applyAlg(solved(), 'R2')));    // hrana DR nahoře
  // hledání: separace z orientovaného stavu
  const problem = prepare({ constraints: goal, moves: MoveSet.preset('faces').list });
  const s = applyAlg(solved(), 'R2 U F2');
  const r = search(problem, s, { maxLength: 8, extraDepth: 0, maxResults: 5, timeLimit: 10000 });
  assert.ok(r.solutions.length && r.solutions.every((a) => t(applyAlg(s, a))));
});

test('sjednocení pravidel: stejná skupina = víc míst, stabilní klíč, popis slovy', () => {
  const a = compileRule({ ...preset('corner-any'), places: ['DFR'] }, map);
  const b = compileRule({ ...preset('corner-any'), places: ['DRB'] }, map);
  const m = mergeConstraints(a, b);
  assert.equal(m['#classes'].length, 1);
  assert.equal(m['#classes'][0].places.length, 2);
  assert.equal(constraintsKey(mergeConstraints(a, b)), constraintsKey(mergeConstraints(a, b)));
  assert.match(describeRule(preset('cross-any'), frameMap(DEFAULT_FRAME)), /patří kterékoli hrany s bílou nebo žlutou nálepkou, tou nálepkou dolů/);
});
