import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg } from '../src/core/cube.js';
import { holdOf } from '../src/core/hold.js';
import { buildPlan } from '../src/sim/plan.js';
import { makeLearner } from '../src/sim/learn.js';
import { DEFAULT_FRAME } from '../src/ui/parts.js';
import { TEMPLATES, templateGuide } from '../src/sim/templates.js';

const SUNE = "R U R' U R U2 R'";
const inverse = (alg) => alg.split(' ').reverse().map((m) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : `${m}'`)).join(' ');

function planOf(id) {
  let n = 0;
  const guide = templateGuide(TEMPLATES.find((t) => t.id === id), DEFAULT_FRAME, (title) => ({ id: `s${++n}`, title }));
  const config = Object.fromEntries(guide.steps.map((st) => [st.id, { ...(st.sim ?? {}) }]));
  return buildPlan({ guide, config });
}
const layersOf = (step) => [...new Set(step.adjust.pre.flatMap((a) => a.display.split(' ').filter(Boolean).map((t) => t[0])))].sort().join('');

test('natočení vrstev automaticky: jen vrstva, ve které před krokem nic není hotové', () => {
  const at = (r, title) => r.plan.variants[0].steps[r.steps.findIndex((x) => x.st.title === title)];
  const cfop = planOf('cfop'), roux = planOf('roux'), sep = planOf('separation');
  assert.equal(layersOf(at(cfop, 'OLL')), 'U');
  assert.equal(layersOf(at(cfop, 'PLL')), 'U');
  assert.equal(layersOf(at(roux, 'CMLL')), 'U');
  assert.equal(layersOf(at(sep, 'OLL')), 'DU');
  assert.equal(layersOf(at(sep, 'Separace hran')), 'DU');
  assert.equal(layersOf(at(sep, 'Permutace rohů')), 'DU');
  assert.equal(layersOf(at(sep, 'EPBL')), '', 'rohy jsou už hotové – natočit vrstvu nejde');
  // algoritmy si vytvoří test (vygenerovat): krok je rovnou používá
  const i = sep.steps.findIndex((x) => x.st.title === 'OLL');
  assert.equal(sep.plan.stepOpts[i].learn, true);
  assert.equal(sep.plan.stepOpts[i].mode, 'auto');
});

test('případy: stejný případ otočený o U je jeden algoritmus, natočení na začátku se odřízne', () => {
  const { plan, steps } = planOf('cfop');
  const i = steps.findIndex((x) => x.st.title === 'OLL');
  const hold = holdOf(plan.variants[0].hold);
  const model = (d) => hold.toModelString(d);
  const goal = plan.variants[0].goals[i];
  const base = applyAlg(solved(), model(inverse(SUNE)));
  const turned = applyAlg(base, model('U'));

  const L = makeLearner(plan);
  const first = L.offer(i, { display: SUNE, model: model(SUNE), state: base, goal });
  assert.equal(first.fresh, true);
  // tentýž případ s jiným natočením horní vrstvy (hledání přidalo U' na začátek)
  const again = L.offer(i, { display: `U' ${SUNE}`, model: model(`U' ${SUNE}`), state: turned, goal });
  assert.equal(again.fresh, false);
  assert.equal(again.entry, first.entry);
  assert.equal(L.count(i), 1);
  assert.equal(first.entry.n, 2);

  // nejdřív otočený: uloží se bez natočení na začátku
  const M = makeLearner(plan);
  const r = M.offer(i, { display: `U' ${SUNE}`, model: model(`U' ${SUNE}`), state: turned, goal });
  assert.equal(r.fresh, true);
  assert.equal(r.entry.display, SUNE);

  // algoritmus, který krok už má ze sady: nalezené řešení stejného případu nic nepřidá
  const S = makeLearner(plan);
  S.seed(i, [{ display: SUNE, score: 1 }]);
  assert.equal(S.offer(i, { display: `U2 ${SUNE}`, model: model(`U2 ${SUNE}`), state: applyAlg(base, model('U2')), goal }).fresh, false);
  assert.equal(S.count(i), 0);
});
