// Spojí výstupy `node bench/method.mjs <n> <s> <metoda> json [část/počet]` (řádky SOLVES,
// víc procesů souběžně) a zapíše src/sim/references.js: vestavěné metody k porovnání
// v simulátoru a k nim data skutečných skladačů (z internetu, se zdroji).
//   node bench/references.mjs soubor1.txt soubor2.txt …
import { readFileSync, writeFileSync } from 'node:fs';
import { summarize } from '../src/sim/simulate.js';
import { TEMPLATES } from '../src/sim/templates.js';
import { REFERENCES as OLD } from '../src/sim/references.js';

const DESCRIPTIONS = {
  cfop: 'kříž, 4 páry F2L do kteréhokoli slotu tahy ⟨R, U, L, F⟩ (s otočením kostky ke slotu), OLL a PLL.',
  roux: 'první a druhý blok 1×2×3, CMLL a LSE ⟨M, U⟩.',
  zz: 'EOLine, bloky ⟨R, U, L⟩, OCLL a PLL.',
};
const WIKI = { title: 'Cuberpal – CFOP vs Roux (čísla ze Speedsolving wiki)', url: 'https://www.cuberpal.com/guides/cfop-vs-roux' };
const GUIDE = { title: 'speedcubing.org – výběr metody', url: 'https://speedcubing.org/pages/guide-to-choosing-a-speedsolving-method' };
const WR = { title: 'Wikipedie – Speedcubing (rekordy)', url: 'https://en.wikipedia.org/wiki/Speedcubing' };
const ROUX = { title: 'scheopner.com – Roux (rekordy skladačů Roux)', url: 'https://www.scheopner.com/cube/' };
const REAL = {
  cfop: { moves: '55–60 (obvykle kolem 57)', best: 'průměr 3,51 s – světový rekord (Yiheng Wang, 2026)', note: 'metoda většiny světové špičky', sources: [WIKI, GUIDE, WR] },
  roux: { moves: '45–50 (obvykle kolem 48)', best: 'oficiální průměr pod 6 s mají 4 skladači (např. Sean Patrick Villanueva); neoficiálně 4,77 s', note: 'méně tahů, ale pomalejší točení (bloky, tahy M)', sources: [WIKI, GUIDE, ROUX] },
  zz: { moves: '50–55 (se ZBLL méně)', best: 'spolehlivý přehled rekordů ZZ jsem nenašel', note: 'oblíbená hlavně na jednu ruku (OH)', sources: [GUIDE] },
};

// SOLVES řádky podle metody (víc souborů = víc dílů stejného běhu)
const byId = new Map();
for (const f of process.argv.slice(2)) {
  for (const line of readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('SOLVES '))) {
    const r = JSON.parse(line.slice(7));
    const cur = byId.get(r.id) ?? { ...r, solves: [] };
    cur.solves.push(...r.solves);
    byId.set(r.id, cur);
  }
}
const order = ['cfop', 'roux', 'zz'];
const refs = [...byId.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((r) => {
  const solves = r.solves.sort((a, b) => a.k - b.k);
  // druh a rozpoznání kroků podle aktuálních šablon (mění se jen model času, ne tahy)
  const tpl = TEMPLATES.find((t) => t.id === r.id);
  r.steps = r.steps.map((s, i) => ({ ...s, kind: tpl?.steps[i]?.sim?.kind ?? 'intuitive', recog: tpl?.steps[i]?.sim?.recog ?? s.recog }));
  const sum = summarize(solves, r.steps.length, { tps: 4, recog: r.steps.map((s) => s.recog ?? 0), kinds: r.steps.map((s) => s.kind ?? 'intuitive') });
  const round = (x, d = 2) => +x.toFixed(d);
  return {
    id: r.id, name: r.name, n: sum.count, seconds: r.seconds, moves: round(sum.moves), ci: round(sum.ci), median: sum.median, min: sum.min, max: sum.max, score: round(sum.score),
    steps: r.steps.map((s, i) => ({ title: s.title, moves: round(sum.steps[i].moves), median: sum.steps[i].median, p90: sum.steps[i].p90, score: round(sum.steps[i].score),
      skipped: round(sum.steps[i].skipped, 3), recog: s.recog ?? 0, kind: s.kind ?? 'intuitive' })),
    description: DESCRIPTIONS[r.id] ?? '', real: REAL[r.id],
  };
});
// metody, které ve vstupu nejsou, zůstanou z minula (stačí přepočítat jednu)
for (const r of OLD) if (!refs.some((x) => x.id === r.id)) refs.push(r);
refs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
const n = refs[0]?.n ?? '?', s = refs[0]?.seconds ?? '?';
writeFileSync(new URL('../src/sim/references.js', import.meta.url), `// Vestavěné metody k porovnání v simulátoru: spočtené stejným simulátorem ze šablon
// (bench/method.mjs, semínko 1, ${n} zamíchání, ${s} s hledání na krok, bez sad – každý krok
// hledáním), aby srovnání s tvou metodou bylo férové, a k nim data skutečných skladačů.
// Vygenerováno: node bench/references.mjs.

export const REFERENCE_NOTE = 'Vestavěné metody spočítal stejný simulátor (každý krok hledáním, ${n} zamíchání), takže ukazují metodu, ne konkrétního skladače.';

export const REFERENCES = ${JSON.stringify(refs, null, 2).replace(/"([a-zA-Z0-9_]+)":/g, '$1:').replace(/'/g, "\\'").replace(/"/g, "'")};
`);
console.log(refs.map((r) => `${r.name}: ${r.moves} tahů (${r.n} zamíchání)`).join(' · '));
