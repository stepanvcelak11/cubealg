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
  rotations.js    24 natočení celé kostky
src/search/
  engine.js       IDA* nad sledovanými dílky + pattern databáze (zpětné BFS)
  worker.js       Web Worker – hledání mimo hlavní vlákno
  client.js       ovládání workeru z UI (spuštění, průběh, zrušení)
  community.js    srovnání s komunitními algoritmy (AUF, rotace)
src/data/
  community.js    komunitní algoritmy F2L / OLL / PLL
src/ergonomics/
  weights.js      váhy tahů, penalizace, úchopy (vše laditelné)
  triggers.js     plynulé triggery (sexy move, sledge, …) + zrcadla pro levou ruku
  score.js        Discomfort Score s rozpisem, řazení algoritmů
src/vision/
  detect.js       rozpoznání barev (CIELAB, každá barva přesně 9×)
  camera.js       skenování 6 stěn kamerou
  state-source.js rozhraní zdroje stavu A
src/ui/
  app.js          dashboard
  net.js          2D síť (náhled i editor)
  twisty.js       3D náhled přes cubing.js (načítá se na vyžádání z CDN)
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

## Hledání

Engine sleduje jen dílky, na kterých cíli záleží, a každý popisuje jedním číslem
(kde leží jeho referenční nálepka = místo i natočení). Heuristika je maximum
z pattern databází pro skupiny až 4 dílků, spočtených zpětným BFS jen
s povolenými tahy – je tedy přípustná a respektuje omezení tahů.

Hledání neskončí u optima: projde délky *optimum … optimum + N* a vrátí všechny
nalezené sekvence (bez redundantních pořadí tahů na stejné ose a bez zbytečných
koncových tahů). Ty se pak seřadí podle Discomfort Score a porovnají
s komunitními algoritmy pro stejný případ.

## Discomfort Score

```
celkem = Σ váha tahů              (R, U levné; F, L, D dražší; B, S, E drahé)
       + rotace × 10              (za čtvrtotáčku x/y/z)
       + přehmaty zápěstí         (víc než 2 čtvrtotáčky R/L jedním směrem)
       + změny úchopu             (přechody F ↔ D ↔ B ↔ L mimo home grip)
       − bonusy za triggery       (R U R' U', R' F R F', R U R', …)
```

Všechny konstanty jsou v `src/ergonomics/weights.js` a dají se předat přes `config`.

## Stav A

- **Případ algoritmu** – stav, který zadaný algoritmus řeší,
- **Zamíchání** – zamíchání složené kostky,
- **Barvy / kamera** – editor sítě klikáním, text ve formátu Kociemba nebo skenování
  kamerou. Stav se ověřuje (natočení rohů a hran, parita permutací).

## Nasazení

GitHub Actions (`.github/workflows/pages.yml`) při pushi do `main` spustí testy
a nasadí web na GitHub Pages. V nastavení repozitáře musí být
*Settings → Pages → Source: GitHub Actions*.

## Možná rozšíření

- vlastní triggery a úchopy v UI, ergonomie pro levou ruku
- hledání řízené přímo skóre (místo délky) a rozšířená databáze komunitních algoritmů
- symetrie případů (zrcadla, ostatní sloty F2L)
