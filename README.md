# ErgoCube Lab

Webová aplikace (GitHub Pages, PC i mobil), která hledá a hodnotí **ergonomické algoritmy
pro dílčí stavy Rubikovy kostky** – F2L páry, vlastní sloty, orientaci/permutaci vybraných
dílků. Algoritmy se řadí podle „Discomfort Score“, ne jen podle počtu tahů.

## Spuštění

Bez build kroku – čisté ES moduly.

```sh
npm start   # http://localhost:8080
npm test    # node --test
```

## Struktura

```
index.html, styles.css      dashboard
src/core/
  geometry.js     54 nálepek, 26 slotů dílků (URF, FR, …), orientace
  notation.js     parsování/výpis tahů, inverze, zjednodušení, zrcadlení
  cube.js         stav kostky, aplikace tahů, převod z/do barev (Kociemba)
  constraints.js  cíl = omezení pro každý dílek + presety (kříž, F2L, OLL, EO, …)
  moveset.js      povolené tahy + kanonické pořadí pro hledání
  metrics.js      HTM / QTM / STM / ETM
src/ergonomics/
  weights.js      váhy tahů, penalizace, úchopy (vše laditelné)
  triggers.js     plynulé triggery (sexy move, sledge, …) + zrcadla pro levou ruku
  score.js        Discomfort Score s rozpisem, řazení algoritmů
src/vision/
  state-source.js rozhraní zdroje stavu A (připraveno pro skenování kamerou)
src/ui/app.js     dashboard
test/             testy jádra, omezení a ergonomie
```

## Model stavu

Stav je `Uint8Array(54)`: pro každou nálepku pozice, kde právě leží. U každého dílku
tak víme, **kde je i jak je natočený** – barvy se z toho jen odvozují. Tahy (včetně
slice `M E S`, širokých `r u f l d b` / `Rw` a rotací `x y z`) se generují
geometricky otočením vrstvy kolem osy.

## Cíl: omezení dílků

Pro každý dílek lze zvlášť nastavit, co musí platit v cílovém stavu B:

| omezení       | význam                                            |
|---------------|---------------------------------------------------|
| `solved`      | dílek na svém místě a správně natočený            |
| `permutation` | dílek na svém místě, natočení libovolné           |
| `orientation` | dílek správně natočený, na libovolném místě       |
| `ignore`      | na dílku nezáleží                                 |

Orientace: rohy vůči U/D, hrany klasická EO vůči F/B. Středy znají jen `solved` /
`ignore`. Stav B nemusí být složená kostka.

```js
import { makeConstraints, compileGoal } from './src/core/constraints.js';
const goal = compileGoal(makeConstraints({
  solved: ['centers', 'f2l'],      // skupiny i jednotlivé dílky ('UF', 'DFR', …)
  orientation: ['u-layer'],        // OLL
}));
goal.test(state); // true / false
```

## Discomfort Score

```
celkem = Σ váha tahů              (R, U levné; F, L, D dražší; B, S, E drahé)
       + rotace × 10              (za čtvrtotáčku x/y/z)
       + přehmaty zápěstí         (víc než 2 čtvrtotáčky R/L jedním směrem)
       + změny úchopu             (přechody F ↔ D ↔ B ↔ L mimo home grip)
       − bonusy za triggery       (R U R' U', R' F R F', R U R', …)
```

Všechny konstanty jsou v `src/ergonomics/weights.js` a dají se předat přes `config`.

## Plán

1. ✅ Jádro kostky, omezení dílků, sada tahů, ergonomická funkce, základní dashboard
2. Hledání (IDA* s pruning tabulkami) ve Web Workeru, průběžné výsledky
3. 3D animace (cubing.js), editor stavu A klikáním na nálepky
4. Databáze komunitních algoritmů pro srovnání
5. Skenování kamerou
