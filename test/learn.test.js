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

test('natočení vrstev automaticky: vrstva, která před krokem ještě není celá hotová', () => {
  const at = (r, title) => r.plan.variants[0].steps[r.steps.findIndex((x) => x.st.title === title)];
  const cfop = planOf('cfop'), roux = planOf('roux'), sep = planOf('separation');
  assert.equal(layersOf(at(cfop, 'OLL')), 'U');
  assert.equal(layersOf(at(cfop, 'PLL')), 'U');
  assert.equal(layersOf(at(roux, 'CMLL')), 'DU');
  assert.equal(layersOf(at(sep, 'OLL')), 'DU');
  assert.equal(layersOf(at(sep, 'Separace hran')), 'DU');
  assert.equal(layersOf(at(sep, 'Permutace rohů')), 'DU');
  // rohy hotové, ale U … U' je tentýž případ z jiné strany (U-perm, H, Z nahoře i dole)
  assert.equal(layersOf(at(sep, 'EPBL')), 'DU');
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

test('případy EPBL: U-perm nahoře z jiné strany (U … U\') je tentýž případ', () => {
  const { plan, steps } = planOf('separation');
  const i = steps.findIndex((x) => x.st.title === 'EPBL');
  const hold = holdOf(plan.variants[0].hold);
  const model = (d) => hold.toModelString(d);
  const goal = plan.variants[0].goals[i];
  const UA = "M2 U M U2 M' U M2";
  const base = applyAlg(solved(), model(inverse(UA)));
  const side = applyAlg(solved(), model(`U ${inverse(UA)} U'`));
  const L = makeLearner(plan);
  assert.equal(L.offer(i, { display: UA, model: model(UA), state: base, goal }).fresh, true);
  assert.equal(L.offer(i, { display: `U ${UA} U'`, model: model(`U ${UA} U'`), state: side, goal }).fresh, false);
  // totéž dole (D … D')
  const low = applyAlg(solved(), model(`D ${inverse(UA)} D'`));
  assert.equal(L.offer(i, { display: `D ${UA} D'`, model: model(`D ${UA} D'`), state: low, goal }).fresh, false);
  assert.equal(L.count(i), 1);
});

test('sada kroku: víc algoritmů na tentýž případ = jeden případ; algoritmus psaný se žlutou nahoře v metodě s bílou dole', () => {
  let n = 0;
  const guide = templateGuide(TEMPLATES.find((t) => t.id === 'cfop'), DEFAULT_FRAME, (title) => ({ id: `s${++n}`, title }));
  const config = Object.fromEntries(guide.steps.map((st) => [st.id, { ...(st.sim ?? {}), solveBy: 'own' }]));
  guide.steps[6].set = 'pll';
  const T = "R U R' U' R' F R2 U' R' U' R U R' F'";
  const set = [T, `U ${T} U'`, `U2 ${T}`, "x R' U R' D2 R U' R' D2 R2 x'", "R2 U R U R' U' R' U' R' U R'"];
  const { plan } = buildPlan({ guide, config, setAlgs: (id) => (id === 'pll' ? set.map((alg) => ({ alg, name: alg })) : []) });
  const step = plan.variants[0].steps[6];
  // bez držení (Knihovna): obvyklý zápis = žlutá nahoře, tedy v držení metody
  assert.equal(step.candidates[0].model, holdOf(plan.variants[0].hold).toModelString(T));
  const learner = makeLearner(plan);
  learner.seed(6, step.candidates);
  assert.equal(learner.cases(6), 3);
});
