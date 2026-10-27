import { test } from 'node:test';
import assert from 'node:assert/strict';
import { methodReport, refEstimate, REPORT_LEVELS } from '../src/sim/report.js';
import { REFERENCES } from '../src/sim/references.js';

// zkušební „test metody“: CFOP-like kroky s různým počtem tahů na zamíchání
const cfop = REFERENCES.find((r) => r.id === 'cfop');
const solves = Array.from({ length: 20 }, (_, k) => ({
  id: k, ok: true,
  steps: cfop.steps.map((st, i) => ({ length: Math.max(1, Math.round(st.moves + ((k * 7 + i * 3) % 5) - 2)), source: 'search', score: st.score })),
}));
const timing = { tps: 4, level: 'pro', recog: cfop.steps.map((s) => s.recog), kinds: cfop.steps.map((s) => s.kind) };
const titles = cfop.steps.map((s) => s.title);

test('hodnocení metody: srovnání s vestavěnými, úrovně, rozptyl a rezervy', () => {
  const r = methodReport({ solves, stepCount: titles.length, timing, titles, algCount: 78 });
  // metoda se stejnými kroky jako CFOP vyjde zhruba jako CFOP (index kolem 100)
  assert.ok(r.index > 85 && r.index < 115, String(r.index));
  // srovnávací tabulka: pořadí 1…4 u každé veličiny se známou hodnotou
  for (const m of r.metrics) if (m.rank != null) assert.ok(m.rank >= 1 && m.rank <= m.of, m.key);
  assert.equal(r.metrics.find((m) => m.key === 'algs').mine, 78);
  // úrovně: pomalejší skladač = delší čas, u všech tří
  assert.deepEqual(r.levels.map((l) => l.level), REPORT_LEVELS);
  assert.ok(r.levels[0].time < r.levels[1].time && r.levels[1].time < r.levels[2].time);
  // rozptyl: nejlepší ≤ medián ≤ 9 z 10 ≤ nejhorší, histogram pokryje všechna složení
  const d = r.dist;
  assert.ok(d.best <= d.median && d.median <= d.p90 && d.p90 <= d.worst);
  assert.equal(d.hist.reduce((a, h) => a + h.n, 0), 20);
  assert.ok(d.needFor >= 1 && d.ci > 0);
  // rezervy seřazené od nejpomalejšího kroku, úspory kladné
  for (let i = 1; i < r.steps.length; i++) assert.ok(r.steps[i - 1].time >= r.steps[i].time);
  assert.ok(r.steps.every((s) => s.saveMoves >= 0 && s.saveRecog >= 0));
  assert.ok(r.verdict.length >= 3);
});

test('hodnocení metody: vestavěná metoda stejným modelem na každé úrovni', () => {
  for (const ref of REFERENCES) {
    const a = refEstimate(ref, 'pro'), b = refEstimate(ref, 'club');
    assert.ok(a.time > 3 && a.time < 10, `${ref.name} ${a.time}`);
    assert.ok(b.time > a.time);
  }
  assert.equal(methodReport({ solves: [], stepCount: 1, timing, titles }), null);
});

test('hodnocení metody: metoda, která nesloží celou kostku, se se vestavěnými nesrovnává', () => {
  const r = methodReport({ solves, stepCount: titles.length, timing, titles, algCount: 0, partial: true });
  assert.equal(r.index, null);
  assert.ok(r.metrics.every((m) => m.rank === null));
  assert.match(r.verdict[0], /neskládá celou kostku/);
});
