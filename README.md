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

## Jak se používá

Spodní lišta má čtyři sekce:

- **Timer** – zamíchání pro disciplíny WCA (2×2 až 7×7, OH, BLD, FMC, Clock,
  Megaminx, Pyraminx, Skewb, Square-1), stopky ve stylu speedcubingu
  (podržet mezerník/prst → pustit = start), volitelná inspekce 15 s, +2 a DNF.
  2×2 se míchá z náhodného stavu, ostatní náhodnými tahy. Každá disciplína
  může mít vlastní skupiny složení (např. pro různé kostky).
- **Statistiky** – single, ao5, ao12, ao50, ao100 (aktuální i nejlepší podle WCA),
  průměr, graf vývoje a seznam složení s úpravou trestů – pro každou skupinu zvlášť.
- **Trenažér** – vlastní algoritmy uložené z Labu: náhodný případ (častěji ty
  pomalejší a méně trénované), stopky, odhalení algoritmu a statistiky.
- **Lab** – vlastní případy a hledání ergonomických algoritmů:
  - **Zadání:** v cíli vyber štětec (plná = místo i natočení, čárkovaná = jen
    místo, tečkovaná = jen natočení, guma) a klepej na dílky. Ve výchozí kostce
    klepni na místo a v nabídce vyber, který dílek tam leží a jak je natočený
    (dílky se samy prohodí) – nebo zamíchej tahy.
  - **Tahy a váhy:** povolené tahy a ergonomické váhy.
  - **Řešení:** seznam řešení podle pohodlnosti, přehrávač a ukládání do trenažéru.

Všechna data se ukládají v prohlížeči (localStorage).

## Struktura

```
index.html, styles.css      rozhraní
src/core/
  geometry.js     54 nálepek, 26 slotů dílků (URF, FR, …), orientace
  notation.js     parsování/výpis tahů, inverze, zjednodušení, zrcadlení
  cube.js         stav kostky, aplikace tahů, převod z/do barev (Kociemba)
  task.js         zadání dvěma kostkami: rozpoznání vybarvených dílků
  constraints.js  cíl = omezení pro každý dílek (složeno / permutace / orientace)
  moveset.js      povolené tahy + kanonické pořadí pro hledání
  metrics.js      HTM / QTM / STM / ETM
  rotations.js    24 natočení celé kostky
src/search/
  engine.js       IDA* nad sledovanými dílky + pattern databáze (zpětné BFS)
  worker.js       Web Worker – hledání mimo hlavní vlákno
  client.js       ovládání workeru z UI (spuštění, průběh, zrušení)
src/timer/
  events.js       disciplíny WCA
  scramble.js     zamíchání (N×N, Pyraminx, Skewb, Megaminx, Clock, Square-1)
  random-state.js 2×2 z náhodného stavu (optimální řešení inverzí)
  scramble-worker.js  zamíchání ve Web Workeru
  stats.js        průměry podle WCA, formát časů
src/ergonomics/
  weights.js      váhy tahů, penalizace, úchopy (vše laditelné)
  triggers.js     plynulé triggery (sexy move, sledge, …) + zrcadla pro levou ruku
  score.js        Discomfort Score s rozpisem, řazení algoritmů
src/ui/
  app.js          navigace mezi sekcemi
  timer.js, stats.js, trainer.js, lab.js   jednotlivé sekce
  stopwatch.js    stopky (mezerník / dotyk, inspekce)
  store.js        uložená složení a vlastní algoritmy
  cube3d.js       3D kostka v CSS (otáčení, klepání, animace, styly nálepek)
  icons.js        SVG ikony
test/             testy (node --test)
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
  solved: ['FR', 'DFR'],           // názvy dílků ve složené kostce
  permutation: ['UF'],
  orientation: ['UR'],
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
koncových tahů). Ty se pak seřadí podle Discomfort Score.

## Discomfort Score

```
celkem = Σ váha tahů              (R, U levné; F, L, D dražší; B, S, E drahé)
       + rotace × 10              (za čtvrtotáčku x/y/z)
       + přehmaty zápěstí         (víc než 2 čtvrtotáčky R/L jedním směrem)
       + změny úchopu             (přechody F ↔ D ↔ B ↔ L mimo home grip)
       − bonusy za triggery       (R U R' U', R' F R F', R U R', …)
```

Všechny konstanty jsou v `src/ergonomics/weights.js` a dají se předat přes `config`.

## Nasazení

GitHub Actions (`.github/workflows/pages.yml`) při pushi do `main` spustí testy
a nasadí web na GitHub Pages. V nastavení repozitáře musí být
*Settings → Pages → Source: GitHub Actions*.

## Možná rozšíření

- vlastní triggery a úchopy v UI, ergonomie pro levou ruku
- hledání řízené přímo skóre (místo délky)
- ukládání vlastních případů a sbírek algoritmů
