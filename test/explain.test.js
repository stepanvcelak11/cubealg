import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, templateGuide } from '../src/sim/templates.js';
import { explainStep, joinTitles } from '../src/sim/explain.js';

const guideOf = (id, frame = { down: 'U', front: 'F' }) => {
  let n = 0;
  return templateGuide(TEMPLATES.find((t) => t.id === id), frame, (title) => ({ id: `k${n++}`, title, text: '' }));
};
const explain = (g, i, extra = {}) => explainStep({ steps: g.steps, i, frame: g.frame, cfg: g.steps[i].sim ?? {}, solveBy: g.steps[i].sim?.solveBy ?? 'intuitive', ...extra });

test('vysvětlení: CFOP – kříž, pár, natočení horní vrstvy a dokončení', () => {
  const g = guideOf('cfop');
  const cross = explain(g, 0);
  assert.equal(cross.pattern, 'cross');
  assert.match(cross.text, /kříž.*bílou barvou dolů/);
  assert.match(cross.changes[0], /4 hrany spodní vrstvy: každá na své místo/);
  assert.equal(explain(g, 1).pattern, 'pair');
  assert.match(explain(g, 4).keep, /Kříž, Pár 1–3/);
  const oll = explain(g, 5, { solveBy: 'generate', algCount: 57 });
  assert.equal(oll.pattern, 'orient');
  assert.match(oll.text, /horní strana bude celá žlutá/);
  assert.match(oll.how.join(' '), /57 algoritmů[\s\S]*poznej případ/);
  assert.equal(explain(g, 6).pattern, 'finish');
});

test('vysvětlení: separační metoda – barvy, oddělení, permutace a parita', () => {
  const g = guideOf('separation');
  const cross = explain(g, 0);
  assert.match(cross.text, /bílou nebo žlutou barvu.*smí míchat/);
  assert.match(explain(g, 1).text, /kterýkoli roh s bílou nebo žlutou barvou/);
  assert.match(explain(g, 5).text, /na horní stranu mířila jen bílá nebo žlutá/);
  const sep = explain(g, 6);
  assert.equal(sep.pattern, 'separate');
  assert.match(sep.text, /Hrany s bílou barvou dáš dolů a hrany se žlutou barvou nahoru/);
  assert.match(sep.changes.join(' '), /už jen bílou barvou dolů \(dosud stačila bílá nebo žlutá\)/);
  assert.equal(explain(g, 8).pattern, 'permute');
  const parity = explain(g, 9, { solveBy: 'fixed', cfg: g.steps[9].sim });
  assert.match(parity.text, /jen když.*parita[\s\S]*M2 U2 M2/);
  assert.equal(explain(g, 10).pattern, 'finish');
});

test('vysvětlení: barvy podle držení metody (žlutá dole) a bloky Roux a ZZ', () => {
  const g = guideOf('cfop', { down: 'D', front: 'F' });
  assert.match(explain(g, 0).text, /žlutou barvou dolů/);
  assert.match(explain(g, 5).text, /celá bílá/);
  for (const [id, i] of [['roux', 0], ['zz', 1], ['petrus', 3]]) assert.equal(explain(guideOf(id), i).pattern, 'block', `${id} ${i}`);
  assert.equal(explain(guideOf('zz'), 0).pattern, 'eo');
});

test('zkrácení titulků kroků', () => {
  assert.equal(joinTitles(['Kříž', 'Pár 1', 'Pár 2', 'Pár 3', 'OLL']), 'Kříž, Pár 1–3, OLL');
  assert.equal(joinTitles(['Blok 2×2×2', 'Blok 2×2×3']), 'Blok 2×2×2, Blok 2×2×3');
});
