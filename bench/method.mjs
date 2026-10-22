// Simulace metod v Node (jedno vlákno, stejný řešič kroků jako simulátor v aplikaci):
// ověří, že simulátor zvládne celé metody, a ukáže tahy a časy kroků. Metody jsou
// šablony ze sestavení metody (src/sim/templates.js) – stejné jako v aplikaci.
//   node bench/method.mjs [zamíchání] [sekund na krok] [filtr metody] [json] [část/počet]
// „json“ vypíše i jednotlivá složení (řádek SOLVES …) pro bench/references.mjs;
// „2/4“ složí jen každé 4. zamíchání od 2. (víc procesů souběžně, stejná zamíchání).

import { buildPlan } from '../src/sim/plan.js';
import { solveScrambles } from '../src/sim/stepsolver.js';
import { summarize, seededRandom } from '../src/sim/simulate.js';
import { practiceState } from '../src/timer/practice.js';
import { DEFAULT_FRAME } from '../src/ui/parts.js';
import { initKernel } from '../src/search/kernel.js';
import { TEMPLATES, templateGuide } from '../src/sim/templates.js';

const count = Number(process.argv[2] ?? 4);
const seconds = Number(process.argv[3] ?? 3);
const filter = process.argv[4] ?? '';
const asJson = process.argv.includes('json');
const part = process.argv.find((a) => /^\d+\/\d+$/.test(a))?.split('/').map(Number) ?? [0, 1];

let seq = 0;
const newStep = (title) => ({ id: `k${++seq}`, title });
export const METHODS = TEMPLATES.map((t) => ({ id: t.id, name: t.name, guide: templateGuide(t, DEFAULT_FRAME, newStep) }));

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('jádro WebAssembly:', await initKernel());
  for (const m of METHODS.filter((x) => x.name.includes(filter) || x.id === filter)) {
    const { guide } = m;
    const config = Object.fromEntries(guide.steps.map((st) => [st.id, { time: seconds, ...(st.sim ?? {}) }]));
    const { plan, steps } = buildPlan({ guide, config });
    const rand = seededRandom(1);
    const all = Array.from({ length: count }, () => practiceState({}, rand));
    const mine = all.map((s, k) => ({ s, k })).filter(({ k }) => k % part[1] === part[0]);
    const t0 = Date.now();
    const { solves } = await solveScrambles(plan, mine.map((x) => x.s));
    const sum = summarize(solves, steps.length, { tps: 4, recog: plan.stepOpts.map((o) => o.recog) });
    console.log(`\n${m.name}: ${sum.count}/${solves.length} složeno · ${sum.moves.toFixed(1)} ± ${sum.ci.toFixed(1)} tahů (${sum.min}–${sum.max}) · ${((Date.now() - t0) / 1000).toFixed(0)} s výpočtu`);
    steps.forEach((x, i) => {
      const st = sum.steps[i];
      console.log(`  ${(x.st.title).padEnd(18)} ${st.moves.toFixed(1).padStart(5)} tahů (medián ${st.median}, 90 % ≤ ${st.p90})  náročnost ${st.score.toFixed(1).padStart(5)}  přeskočeno ${Math.round(st.skipped * 100)} %${st.failed ? `  NEDOŘEŠENO ${st.failed}×` : ''}`);
    });
    if (asJson) {
      console.log(`SOLVES ${JSON.stringify({ id: m.id, name: m.name, seconds, steps: steps.map((x) => ({ title: x.st.title, recog: x.cfg.recog, kind: x.cfg.kind })),
        solves: solves.map((sv, j) => ({ k: mine[j].k, ok: sv.ok, steps: sv.steps.map((x) => ({ length: x.length, score: +x.score.toFixed(3), source: x.source })) })) })}`);
    }
    const ex = solves.find((sv) => sv.ok);
    if (ex) ex.steps.forEach((x, i) => console.log(`    ${steps[i].st.title}: ${x.display || '–'}`));
  }
}
