// Simulace metod v Node (jedno vlákno, stejný řešič kroků jako simulátor v aplikaci):
// ověří, že simulátor zvládne celé metody, a ukáže tahy a časy kroků.
//   node bench/method.mjs [zamíchání] [sekund na krok] [filtr metody]

import { buildPlan } from '../src/sim/plan.js';
import { solveScrambles } from '../src/sim/stepsolver.js';
import { summarize, seededRandom } from '../src/sim/simulate.js';
import { practiceState } from '../src/timer/practice.js';
import { frameMap, DEFAULT_FRAME } from '../src/ui/parts.js';
import { slotByName } from '../src/core/geometry.js';
import { initKernel } from '../src/search/kernel.js';

const count = Number(process.argv[2] ?? 4);
const seconds = Number(process.argv[3] ?? 3);
const filter = process.argv[4] ?? '';
const asJson = process.argv.includes('json');

// dílky v pohledu metody (D = dole, F = vpředu) → názvy dílků kostky
const map = frameMap(DEFAULT_FRAME);
const view = (names, style = 'solved') => Object.fromEntries(names.map((n) => [slotByName([...n].map((f) => map[f]).join('')).name, style]));
const CROSS = ['DF', 'DR', 'DB', 'DL'];
const E = ['FR', 'BR', 'BL', 'FL'];
const UE = ['UF', 'UR', 'UB', 'UL'], DE = ['DF', 'DR', 'DB', 'DL'];
const UC = ['UFR', 'URB', 'UBL', 'ULF'], DC = ['DFR', 'DRB', 'DBL', 'DLF'];
const step = (id, title, parts, cfg = {}) => ({ st: { id, title, parts }, cfg });

const BL = ['DLF', 'DBL', 'DL', 'FL', 'BL'], BR = ['DFR', 'DRB', 'DR', 'FR', 'BR'];
const ALL_E = [...UE, ...DE, ...E];
const custom = (...bases) => ({ moves: 'custom', custom: bases });

export const METHODS = [
  {
    id: 'cfop',
    name: 'CFOP',
    steps: [
      step('c', 'Kříž', view(CROSS), { recog: 0 }),
      step('p1', 'Pár 1', view(['DFR', 'FR']), { recog: 0.4 }),
      step('p2', 'Pár 2', view(['DLF', 'FL']), { recog: 0.4 }),
      step('p3', 'Pár 3', view(['DRB', 'BR']), { recog: 0.4 }),
      step('p4', 'Pár 4', view(['DBL', 'BL']), { recog: 0.4 }),
      step('o', 'OLL', view([...UE, ...UC], 'orientation'), { recog: 0.5 }),
      step('pl', 'PLL', view([...UE, ...UC]), { recog: 0.6 }),
    ],
  },
  {
    id: 'roux',
    name: 'Roux',
    steps: [
      step('fb', 'První blok', view(BL), { ...custom('R', 'L', 'U', 'D', 'F', 'B', 'r', 'M'), recog: 0 }),
      step('sb', 'Druhý blok', view(BR), { ...custom('R', 'r', 'U', 'M'), recog: 0.3 }),
      step('cmll', 'CMLL', view(UC), { recog: 0.6 }),
      step('lse', 'LSE', view([...UE, 'DF', 'DB']), { ...custom('M', 'U'), recog: 0.4 }),
    ],
  },
  {
    id: 'zz',
    name: 'ZZ',
    steps: [
      step('eol', 'EOLine', { ...view(ALL_E, 'orientation'), ...view(['DF', 'DB']) }, { recog: 0 }),
      step('lb', 'Levý blok', view(BL), { moves: 'RUL', recog: 0.3 }),
      step('rb', 'Pravý blok', view(BR), { moves: 'RUL', recog: 0.3 }),
      step('ocll', 'OCLL', view(UC, 'orientation'), { recog: 0.5 }),
      step('pll', 'PLL', view([...UE, ...UC]), { recog: 0.6 }),
    ],
  },
  {
    name: 'Pás → orientace → rohy → EPBL (M U D)',
    steps: [
      step('b', 'Pás', view(E)),
      step('or', 'Orientace U/D', view([...UE, ...DE, ...UC, ...DC], 'orientation')),
      step('cp', 'Rohy obou vrstev', view([...UC, ...DC])),
      step('ep', 'EPBL', view([...UE, ...DE]), { moves: 'MUD', view: 'efficient' }),
    ],
  },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('jádro WebAssembly:', await initKernel());
  for (const m of METHODS.filter((x) => x.name.includes(filter))) {
    const guide = { frame: DEFAULT_FRAME, steps: m.steps.map((s) => s.st) };
    const config = Object.fromEntries(m.steps.map((s) => [s.st.id, { time: seconds, ...s.cfg }]));
    const { plan, steps } = buildPlan({ guide, config });
    const rand = seededRandom(1);
    const starts = Array.from({ length: count }, () => practiceState({}, rand));
    const t0 = Date.now();
    const { solves } = await solveScrambles(plan, starts);
    const sum = summarize(solves, steps.length, { tps: 4, recog: plan.stepOpts.map((o) => o.recog) });
    console.log(`\n${m.name}: ${sum.count}/${solves.length} složeno · ${sum.moves.toFixed(1)} ± ${sum.ci.toFixed(1)} tahů (${sum.min}–${sum.max}) · odhad ${sum.time.toFixed(1)} s · ${((Date.now() - t0) / 1000).toFixed(0)} s výpočtu`);
    steps.forEach((x, i) => {
      const s = sum.steps[i];
      console.log(`  ${(x.st.title).padEnd(18)} ${s.moves.toFixed(1).padStart(5)} tahů (medián ${s.median}, 90 % ≤ ${s.p90})  náročnost ${s.score.toFixed(1).padStart(5)}  přeskočeno ${Math.round(s.skipped * 100)} %${s.failed ? `  NEDOŘEŠENO ${s.failed}×` : ''}`);
    });
    if (asJson) {
      console.log(`JSON ${JSON.stringify({ id: m.id, name: m.name, n: sum.count, moves: +sum.moves.toFixed(2), ci: +sum.ci.toFixed(2), median: sum.median, min: sum.min, max: sum.max, score: +sum.score.toFixed(2),
        steps: steps.map((x, i) => ({ title: x.st.title, moves: +sum.steps[i].moves.toFixed(2), median: sum.steps[i].median, p90: sum.steps[i].p90, score: +sum.steps[i].score.toFixed(2), skipped: +sum.steps[i].skipped.toFixed(3), recog: plan.stepOpts[i].recog })) })}`);
    }
    const ex = solves.find((s) => s.ok);
    if (ex) ex.steps.forEach((x, i) => console.log(`    ${steps[i].st.title}: ${x.display || '–'}`));
  }
}
