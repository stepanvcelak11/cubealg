import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proposals, applyPatch, combine } from '../src/sim/discover.js';
import { buildPlan, stepDefaults } from '../src/sim/plan.js';
import { solveScrambles } from '../src/sim/stepsolver.js';
import { summarize, seededRandom } from '../src/sim/simulate.js';
import { practiceState } from '../src/timer/practice.js';
import { DEFAULT_FRAME } from '../src/ui/parts.js';
import { TEMPLATES, templateGuide } from '../src/sim/templates.js';

let n = 0;
const guide = templateGuide(TEMPLATES.find((t) => t.id === 'cfop'), DEFAULT_FRAME, (title) => ({ id: `s${++n}`, title }));
const cfgOf = (st) => ({ ...stepDefaults(false), ...(st.sim ?? {}) });

test('objevitel: návrhy spojení, volnosti a algoritmů; použití a kombinace', () => {
  const props = proposals(guide, cfgOf);
  const kinds = new Set(props.map((p) => p.kind));
  for (const k of ['spojit', 'volnost', 'algoritmy']) assert.ok(kinds.has(k), k);
  // kříž: barevná neutralita jen u prvního kroku
  assert.ok(props.some((p) => p.id === `free:${guide.steps[0].id}:dual`));
  assert.ok(!props.some((p) => p.id === `free:${guide.steps[2].id}:dual`));
  // poslední krok (PLL) se s ničím nespojuje
  assert.ok(!props.some((p) => p.id === `merge:${guide.steps.at(-1).id}`));
  const base = Object.fromEntries(guide.steps.map((st) => [st.id, cfgOf(st)]));
  const merged = applyPatch(base, props.find((p) => p.kind === 'spojit').patch);
  assert.equal(Object.values(merged).filter((c) => c.on === false).length, 1);
  const a = props.find((p) => p.id.startsWith('merge:')), b = props.find((p) => p.id.startsWith('free:'));
  assert.ok(combine(a, b)?.patch);
  assert.equal(combine(a, a), null);
});

test('objevitel: návrh jde otestovat simulací (spojení kroků = méně kroků)', async () => {
  const small = { steps: [
    { id: 'a', title: 'Hrana vpředu', parts: { DF: 'solved' } },
    { id: 'b', title: 'Hrana vpravo', parts: { DR: 'solved' } },
    { id: 'c', title: 'Hrana vzadu', parts: { DB: 'solved' } },
  ] };
  const base = Object.fromEntries(small.steps.map((st) => [st.id, { ...cfgOf(st), time: 0.5 }]));
  const merge = proposals(small, cfgOf).find((p) => p.kind === 'spojit');
  assert.match(merge.label, /Spojit „Hrana vpředu“ s „Hrana vpravo“/);
  const rand = seededRandom(3);
  const starts = Array.from({ length: 3 }, () => practiceState({}, rand));
  for (const config of [base, applyPatch(base, merge.patch)]) {
    const { plan, steps } = buildPlan({ guide: small, config });
    const { solves } = await solveScrambles(plan, starts, { virtual: true });
    assert.equal(summarize(solves, steps.length).count, 3);
    assert.equal(steps.length, config === base ? 3 : 2);
  }
});
