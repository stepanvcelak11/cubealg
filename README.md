# ErgoCube Lab

Webová aplikace (GitHub Pages, PC i mobil), která hledá a hodnotí **ergonomické algoritmy
pro dílčí stavy Rubikovy kostky** – F2L páry, vlastní sloty, orientaci/permutaci vybraných
dílků. Algoritmy se řadí podle „Discomfort Score“, ne jen podle počtu tahů.

## Spuštění

Bez build kroku – čisté ES moduly.

```sh
npm start   # http://localhost:8080
npm test    # node --test
npm run e2e # testy v prohlížeči (potřebují playwright a Chromium)
```

## Jak se používá

Spodní lišta má čtyři sekce, ozubené kolo nahoře otevře nastavení a zálohu dat.

- **Timer** – zamíchání pro disciplíny WCA (2×2 až 7×7, OH, BLD, FMC, Multi-Blind,
  Clock, Megaminx, Pyraminx, Skewb, Square-1), stopky ve stylu speedcubingu
  (podržet mezerník/prst → pustit = start), volitelná inspekce 15 s (i s hlasovým
  hlášením 8 a 12 s), +2, DNF a poznámky. 2×2 a 3×3 (vč. OH, BLD, FMC a Multi-Blind)
  se míchají z náhodného stavu, ostatní náhodnými tahy. Každá disciplína může mít
  vlastní skupiny složení (např. pro různé kostky).
- **Statistiky** – single, ao5, ao12, ao50, ao100 (aktuální i nejlepší podle WCA),
  průměr, graf vývoje, rozložení časů, filtr období a seznam složení s úpravou
  trestů a poznámek – pro každou skupinu zvlášť.
- **Trenažér** – vlastní algoritmy uložené z Labu (všechny hlavolamy): náhodný
  případ (častěji ty pomalejší a méně trénované), nastavovací tahy, stopky,
  odhalení algoritmu a statistiky.
- **Lab** – vlastní případy a hledání ergonomických algoritmů pro **3×3, 2×2,
  Pyraminx, Skewb a Square-1**:
  - **Zadání:** výchozí stav i cíl se vybarvují po nálepkách paletou barev (dílek
    s jedinou chybějící nálepkou se doplní, je-li to jednoznačné) nebo nastaví
    tahy. Řeší se dílky vybarvené v cíli, každý se stylem: plná = místo
    i natočení, čárkovaná = jen místo, tečkovaná = jen natočení. 3×3 a 2×2 jsou
    ve 3D (nebo plošné síti), ostatní hlavolamy v plošné síti.
  - **Tahy a váhy:** povolené tahy, ergonomické váhy a jejich kalibrace podle
    časů z trenažéru.
  - **Řešení:** N nejpohodlnějších řešení z mnohem většího počtu nalezených,
    přehrávač a ukládání do trenažéru.

Aplikace funguje i offline a jde nainstalovat na plochu (PWA). Data se ukládají
v prohlížeči (localStorage); zálohu jde stáhnout a obnovit v nastavení.

## Hlavolamy v Labu

Permutační hlavolamy (3×3, 2×2, Pyraminx, Skewb) mají společný model
(`src/puzzles/perm.js`): z geometrie nálepek (střed a normála) se spočtou dílky
a permutace tahů otočením kolem os. Hledání je pro ně společné.

| hlavolam  | tahy                                  | poznámka                          |
|-----------|---------------------------------------|-----------------------------------|
| 3×3       | vnější, slice, široké, rotace         | plné ergonomické hodnocení        |
| 2×2       | R U F L D B, rotace x y z             | hodnocení jako u 3×3              |
| Pyraminx  | U L R B (vrstva), u l r b (špička)    | váhy tahů                         |
| Skewb     | R U L B (notace WCA: rohy DRB ULB DLF DLB) | váhy tahů                    |
| Square-1  | (a,b) a řez /                         | vlastní model a hledání po řezech |

Square-1 (`src/puzzles/sq1.js`, `src/search/sq1engine.js`) mění tvar, takže má
vlastní model: 2 × 12 pozic po 30°, prostřední vrstva, notace WCA. Hledání je IDA*
po řezech s tabulkami (tvar po řezu × pozice dílku) a tabulkou tvarů.

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
(i v prohlížeči) a nasadí web na GitHub Pages včetně seznamu souborů pro offline režim. V nastavení repozitáře musí být
*Settings → Pages → Source: GitHub Actions*.

## Možná rozšíření

- vlastní triggery a úchopy v UI, ergonomie pro levou ruku
- hledání řízené přímo skóre (místo délky)
- silnější heuristika pro dlouhé případy Square-1 (dvojice dílků)
- zamíchání 4×4 a větších z náhodného stavu, Bluetooth kostky
