// Převede výstup `node bench/method.mjs <n> <s> <metoda> json` na src/sim/references.js.
//   node bench/references.mjs soubor1.txt soubor2.txt …
import { readFileSync, writeFileSync } from 'node:fs';

const DESCRIPTIONS = {
  cfop: 'kříž, 4 páry F2L zvlášť, OLL a PLL (vnější tahy).',
  roux: 'první a druhý blok 1×2×3, CMLL a LSE ⟨M, U⟩.',
  zz: 'EOLine, bloky ⟨R, U, L⟩, OCLL a PLL.',
};
const refs = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8').split('\n').find((l) => l.startsWith('JSON ')).slice(5)));
const order = ['cfop', 'roux', 'zz'];
refs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
const data = refs.map((r) => ({ ...r, description: DESCRIPTIONS[r.id] ?? '' }));
writeFileSync(new URL('../src/sim/references.js', import.meta.url), `// Vestavěné metody k porovnání v simulátoru: spočtené stejným simulátorem (bench/method.mjs,
// semínko 1, ${refs[0]?.n ?? '?'} zamíchání, 3 s hledání na krok, bez sad – každý krok hledáním), aby
// srovnání s tvou metodou bylo férové. Vygenerováno: node bench/references.mjs.

export const REFERENCE_NOTE = 'Vestavěné metody spočítal stejný simulátor (každý krok hledáním, ${refs[0]?.n ?? '?'} zamíchání), takže ukazují metodu, ne konkrétního skladače – člověk při skládání obvykle nenajde tak krátká řešení kroků.';

export const REFERENCES = ${JSON.stringify(data, null, 2).replace(/"([a-zA-Z0-9_]+)":/g, '$1:').replace(/"/g, "'")};
`);
console.log(data.map((r) => `${r.name}: ${r.moves}`).join(' · '));
