// Ladění výchozích vah podle sbírky (src/ergonomics/corpus.js): oblíbený algoritmus
// skladačů má vycházet pohodlněji než alternativy pro stejný případ. Stejný výpočet jako
// doladění podle tvých porovnání (learnPreferences), jen místo tvých odpovědí „oblíbený
// je lepší“. Polovina případů se nechá stranou na kontrolu (sedí i na nich?).
//   node bench/fit.mjs [prior]

import { getPuzzle } from '../src/puzzles/index.js';
import { CORPUS } from '../src/ergonomics/corpus.js';
import { learnPreferences, featureLabel } from '../src/ergonomics/calibrate.js';
import { scoreAlg } from '../src/ergonomics/score.js';
import { buildTriggers } from '../src/ergonomics/triggers.js';
import { MOVE_TIME } from '../src/ergonomics/style.js';

const P = getPuzzle('333');
const prior = Number(process.argv[2] ?? 0.6);
const config = { triggers: buildTriggers() };
// a pár rozhodnutí skladačů navíc (tvůj případ: dva rohy prohozené mezi vrstvami)
const VERDICTS = [
  { better: 'U F2 U2 R2 U R2 F2', worse: "U' F' U' R U R' U' R U R' U' R U R' F" },
  // prohození všech hran horní a dolní vrstvy: M2 hned po D je špatně, R2 S2 jde plynule
  { better: "M R2 S2 M R2 S2", worse: "M2 D' M' U2 M U M2" },
];
// (rozhodnutí skladače váží jako 20 dvojic ze sbírky – jinak by ho sbírka přehlasovala)
const pairsOf = (cases) => [...cases.flatMap((c) => c.alts.map((a) => ({ better: c.ref, worse: a }))), ...VERDICTS.flatMap((v) => Array(20).fill(v))];
// jako pohled Nejrychlejší: nepohodlnost + základní čas tahu
const value = (alg, cfg) => scoreAlg(alg, cfg).total + MOVE_TIME * alg.split(' ').length;
const agree = (cfg, pairs) => pairs.filter((p) => value(p.better, cfg) < value(p.worse, cfg)).length;
const train = CORPUS.filter((_, i) => i % 2 === 0), test = CORPUS.filter((_, i) => i % 2 === 1);

for (const [label, fitOn, check] of [['polovina → kontrola na druhé', train, test], ['všechny', CORPUS, CORPUS]]) {
  const res = learnPreferences(P, config, pairsOf(fitOn), { prior, trust: [0.67, 1.5] });
  const cfg = { ...res.config, triggers: config.triggers };
  const pc = check.flatMap((c) => c.alts.map((a) => ({ better: c.ref, worse: a })));
  console.log(`  rozhodnutí skladačů: ${VERDICTS.map((v) => (value(v.better, cfg) < value(v.worse, cfg) ? 'ano' : 'NE')).join(', ')}`);
  console.log(`\n${label}: oblíbený vychází lépe ${agree(config, pc)}/${pc.length} → ${agree(cfg, pc)}/${pc.length}`);
  if (fitOn === CORPUS) {
    for (const c of res.changes.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))) console.log(`  ${featureLabel(c.key).padEnd(22)} ${c.from} → ${c.to}`);
    console.log(`\nWEIGHTS ${JSON.stringify(Object.fromEntries(res.changes.map((c) => [c.key, c.to])))}`);
  }
}
