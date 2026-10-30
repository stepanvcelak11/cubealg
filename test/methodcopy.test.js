import { test } from 'node:test';
import assert from 'node:assert/strict';

// úložiště v paměti (store.js čte localStorage při načtení)
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { methods, algSets, algs, guides, defaultSetId, copySets, duplicateMethod, myTemplates } = await import('../src/ui/store.js');

const task = (n) => ({ puzzle: '333', colorsA: [n], colorsB: [n], constraints: {} });

test('kopírování sad mezi metodami, duplikace metody a předlohy', () => {
  const a = methods.add('Moje');
  methods.setActive(a);
  const oll = algSets.add('OLL');
  algs.add({ alg: "R U R'", task: task(1), set: oll });
  algs.add({ alg: "F R U R' U' F'", task: task(2), set: oll });
  algs.add({ alg: 'M2 U2 M2', task: task(3), set: defaultSetId(a) });
  guides.set(a, { intro: 'x', steps: [{ id: 'k1', title: 'OLL', text: '', set: oll }] });

  // kopie do jiné metody: nové sady, originály zůstanou
  const b = methods.add('Jiná');
  const r = copySets([oll, defaultSetId(a)], b);
  assert.deepEqual(r, { sets: 2, algs: 3 });
  assert.equal(algs.inMethod(a).length, 3);
  assert.equal(algs.inMethod(b).length, 3);
  assert.deepEqual(algSets.list(b).map((s) => s.name), ['Moje algoritmy', 'OLL']);
  assert.equal(algs.inSet(defaultSetId(b)).length, 1);
  // znovu: sada OLL vznikne jako „OLL (2)“, výchozí sada se nezdvojí
  const r2 = copySets([oll, defaultSetId(a)], b);
  assert.equal(r2.algs, 2);
  assert.deepEqual(algSets.list(b).map((s) => s.name), ['Moje algoritmy', 'OLL', 'OLL (2)']);
  // úprava kopie nemění originál
  algs.update(algs.inSet(algSets.list(b)[1].id)[0].id, { name: 'změněno' });
  assert.ok(algs.inSet(oll).every((x) => x.name !== 'změněno'));

  // duplikace: postup i sady, krok ukazuje na zkopírovanou sadu
  const c = duplicateMethod(a);
  assert.equal(methods.get(c).name, 'Moje (kopie)');
  assert.equal(methods.active(), c);
  const g = guides.get(c);
  assert.equal(g.steps.length, 1);
  assert.notEqual(g.steps[0].set, oll);
  assert.equal(algs.inSet(g.steps[0].set).length, 2);
  assert.equal(algs.inMethod(c).length, 3);

  // předloha: uložená podoba, změny metody ji neovlivní
  const t = myTemplates.save(a, 'Moje – funguje');
  guides.set(a, { intro: 'rozbito', steps: [] });
  const d = myTemplates.create(t);
  assert.equal(methods.get(d).name, 'Moje – funguje');
  assert.equal(guides.get(d).steps.length, 1);
  assert.equal(guides.get(d).intro, 'x');
  assert.equal(algs.inMethod(d).length, 3);
  assert.equal(myTemplates.list()[0].steps, 1);
  assert.ok(JSON.parse(mem.get('ergocube.templates')).length === 1);
  myTemplates.remove(t);
  assert.equal(myTemplates.list().length, 0);
});
