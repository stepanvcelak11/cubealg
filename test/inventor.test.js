import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMethods, inventMethods, parseWishes, toTemplate, story } from '../src/sim/inventor.js';
import { templateGuide } from '../src/sim/templates.js';
import { buildPlan, stepDefaults } from '../src/sim/plan.js';
import { stepParts, DEFAULT_FRAME } from '../src/ui/parts.js';
import { mergeParts } from '../src/ui/parts.js';
import { SLOTS } from '../src/core/geometry.js';

const PIECES = SLOTS.filter((s) => s.type !== 'center').map((s) => s.name);

test('vymýšlení metod: každá metoda z kamenů složí celou kostku a jde otestovat', () => {
  const all = allMethods();
  assert.ok(all.length >= 40, String(all.length));
  for (const m of all) {
    let n = 0;
    const guide = templateGuide(toTemplate(m), DEFAULT_FRAME, (title) => ({ id: `s${++n}`, title }));
    const done = guide.steps.reduce((a, st) => mergeParts(a, stepParts(st)), {});
    assert.ok(PIECES.every((p) => done[p] === 'solved'), `${m.name}: ${PIECES.filter((p) => done[p] !== 'solved')}`);
    const config = Object.fromEntries(guide.steps.map((st) => [st.id, { ...stepDefaults(false), ...(st.sim ?? {}) }]));
    const { steps } = buildPlan({ guide, config });
    assert.equal(steps.length, m.steps.length, m.name);
  }
  // známé metody mezi nimi
  const names = all.map((m) => m.known).filter(Boolean);
  for (const k of ['CFOP', 'ZZ', 'Petrus', 'Roux']) assert.ok(names.includes(k), k);
});

test('vymýšlení metod: přání z textu a výběr podle nich', () => {
  const w = parseWishes('Baví mě EO jako u ZZ, ale nechci tahy M a chci málo algoritmů');
  assert.ok(w.want.has('eo'));
  assert.ok(w.avoid.has('m'));
  assert.equal(w.budget, 30);
  const { list, relaxed } = inventMethods({ ...w });
  assert.equal(relaxed, false);
  assert.ok(list.length > 0);
  for (const m of list) { assert.ok(m.tags.has('eo')); assert.ok(!m.tags.has('m')); assert.ok(m.algs <= 30, `${m.name} ${m.algs}`); }
  assert.match(story(list[0]), /algoritm/);
  // seřazené podle odhadu (čas + cena učení)
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].score <= list[i].score);
  // nesplnitelná přání → nejbližší
  const r = inventMethods({ want: ['m', 'rul', 'cross'], budget: 10 });
  assert.equal(r.relaxed, true);
  assert.ok(r.list.length > 0);
});

test('originální metody: nové kroky podle principů, každá složí celou kostku, pokaždé jiné', async () => {
  const { originalMethods } = await import('../src/sim/originals.js');
  const a = originalMethods(1, 30), b = originalMethods(2, 30);
  assert.ok(a.length >= 20);
  assert.notDeepEqual(a.map((m) => m.key), b.map((m) => m.key));
  assert.deepEqual(originalMethods(1, 30).map((m) => m.key), a.map((m) => m.key));
  const principles = new Set([...a, ...b].map((m) => m.principle));
  for (const p of ['bloky', 'rohy napřed', 'orientace napřed', 'pás napřed']) assert.ok(principles.has(p), p);
  for (const m of [...a, ...b]) {
    let n = 0;
    const guide = templateGuide(toTemplate(m), DEFAULT_FRAME, (title) => ({ id: `s${++n}`, title }));
    const done = guide.steps.reduce((acc, st) => mergeParts(acc, stepParts(st)), {});
    assert.ok(PIECES.every((p) => done[p] === 'solved'), m.name);
    const config = Object.fromEntries(guide.steps.map((st) => [st.id, { ...stepDefaults(false), ...(st.sim ?? {}) }]));
    assert.equal(buildPlan({ guide, config }).steps.length, m.steps.length, m.name);
    assert.match(story(m), /Originální/);
  }
  // jen originální podle přání
  const { list } = inventMethods({ source: 'original', want: ['eo'], seed: 3 });
  assert.ok(list.length && list.every((m) => m.original && m.tags.has('eo')));
});
