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
  for (const p of ['bloky', 'rohy napřed', 'orientace napřed', 'hrany napřed']) assert.ok(principles.has(p), p);
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

test('vymýšlení metod: odhad tahů a času bez simulace, intuitivní kroky jen tolik dílků, kolik člověk udrží', async () => {
  const { stepMoves, partsOfCells, mergeParts: merge, originalMethods } = await import('../src/sim/originals.js');
  const { priorTime } = await import('../src/sim/inventor.js');
  // víc nových dílků = víc tahů; plnější kostka = dražší dílek
  assert.ok(stepMoves({}, { DF: 'solved', DB: 'solved', DL: 'solved', DR: 'solved' }, false) > stepMoves({}, { DF: 'solved' }, false));
  assert.ok(stepMoves({ DF: 'solved', DB: 'solved', DL: 'solved', DR: 'solved' }, { FR: 'solved', DFR: 'solved' }, false) > stepMoves({}, { FR: 'solved', DFR: 'solved' }, false));
  const cfop = allMethods().find((m) => m.known === 'CFOP');
  const t = priorTime(cfop);
  assert.ok(t > 5 && t < 7.5, String(t));
  for (const m of originalMethods(4, 60)) {
    let before = {};
    m.steps.forEach((x, i) => {
      const parts = partsOfCells(x.cells);
      const fresh = Object.keys(parts).filter((n) => parts[n] === 'solved' && before[n] !== 'solved').length;
      if (i > 0 && x.sim.kind !== 'alg' && !x.sim.custom?.includes('M')) assert.ok(fresh <= 5, `${m.name}: ${x.title} ${fresh}`);
      before = merge(before, parts);
    });
  }
});

test('vylepšování: spojené páry se staví jako blok, poslední vrstva se intuitivně nenavrhuje', async () => {
  const { proposals } = await import('../src/sim/discover.js');
  const m = allMethods().find((x) => x.known === 'CFOP');
  let n = 0;
  const guide = templateGuide(toTemplate(m), DEFAULT_FRAME, (title) => ({ id: `s${++n}`, title }));
  const ps = proposals(guide, (st) => ({ ...stepDefaults(false), ...(st.sim ?? {}) }), () => true, { level: 3 });
  const pairs = ps.find((p) => p.label === 'Spojit „Pár 1“ s „Pár 2“');
  assert.equal(pairs.patch.s3.kind, 'blocks');
  assert.ok(!ps.some((p) => p.id === 'intu:s6' || p.id === 'intu:s7'), 'OLL/PLL intuitivně');
});

test('křížení metod: začátek jedné a konec druhé, jen když je po nich hotové totéž', async () => {
  const { crossover } = await import('../src/sim/discover.js');
  const g = (m, k) => { let n = 0; return templateGuide(toTemplate(m), DEFAULT_FRAME, (title) => ({ id: `${k}${++n}`, title })).steps; };
  const cfg = (st) => ({ ...stepDefaults(false), ...(st.sim ?? {}) });
  const all = allMethods();
  const cfop = g(all.find((m) => m.known === 'CFOP'), 'a'), zz = g(all.find((m) => m.known === 'ZZ'), 'b');
  const twolook = g(all.find((m) => m.key === 'cross|pairs4|twolook'), 'c');
  // CFOP s koncem 2-look: po párech je hotové totéž
  const kids = crossover(cfop, twolook, cfg);
  assert.ok(kids.some((k) => k.a === 5 && k.steps.length === 9), JSON.stringify(kids.map((k) => [k.a, k.b])));
  // ZZ (natočené hrany po F2L) s koncem CFOP po F2L ne – jen po OCLL/OLL (pak PLL)
  for (const k of crossover(zz, cfop, cfg)) assert.ok(k.steps.at(-1).title === 'PLL' && k.steps.at(-2).title === 'OCLL');
  // každé křížení složí celou kostku
  for (const k of [...kids, ...crossover(zz, cfop, cfg)]) {
    const done = k.steps.reduce((acc, st) => mergeParts(acc, stepParts(st)), {});
    assert.ok(PIECES.every((p) => done[p] === 'solved'));
  }
});
