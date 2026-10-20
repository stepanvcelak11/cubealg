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
  hlášením 8 a 12 s), +2, DNF a poznámky. 2×2, 3×3 (vč. OH, BLD, FMC a Multi-Blind)
  a 4×4 (i naslepo) se míchají z náhodného stavu (4×4 ~50 tahů, první zamíchání
  chvíli trvá kvůli tabulkám), ostatní náhodnými tahy. Každá disciplína může mít
  vlastní skupiny složení (např. pro různé kostky).
- **Statistiky** – single, ao5, ao12, ao50, ao100 (aktuální i nejlepší podle WCA),
  průměr, graf vývoje, **osobní rekordy s historií zlepšení**, **porovnání dvou
  skupin**, rozložení časů, filtr období, seznam složení s úpravou trestů a poznámek
  a **export do CSV** (skupina nebo všechno) – pro každou skupinu zvlášť.
- **Metody** – výběr metody v horní liště (např. CFOP a tvoje vlastní) přepne celou
  aplikaci: složení v timeru, statistiky i sady algoritmů z Labu a Trenažéru patří
  k aktivní metodě. Ve statistikách jde metody (i skupiny) porovnat vedle sebe.
  **Průvodce metodou** (ve výběru metody): úvod a kroky se slovním popisem,
  obrázkem kostky „před → po“ převzatým z Labu a odkazem na sadu algoritmů
  k tréninku, případně **ukázkou algoritmu**, která se dá přehrát tah po tahu.
  Metodu i s průvodcem a algoritmy jde **sdílet** jako soubor (druhý ji
  naimportuje přes „Importovat metodu…“) nebo **vytisknout / uložit jako PDF**.
  **Nácvik kroku** v timeru (3×3) pro CFOP i vlastní metody: u každého kroku průvodce
  se vybere, co je po něm hotové (předvolby kříž, X-cross, F2L, bloky 2×2×2/2×2×3,
  bloky Roux, EO, CO, OLL… nebo klepáním na dílky; dílek hotový, jen na místě nebo
  jen natočený; podle zvoleného držení metody). Zamíchání pak nechá hotové všechno
  z předchozích kroků a časy nácviku se ukládají zvlášť. Krok jde spustit i přímo
  z průvodce tlačítkem „Nacvičit“.
- **Trenažér** – vlastní algoritmy uložené z Labu (všechny hlavolamy) v **sadách**
  (např. podle situace nebo metody): trénuje se vybraná sada, náhodný případ
  podle zvládnutí (špatné se vracejí brzy, dobré čím dál vzácněji), nastavovací
  tahy, stopky, odhalení algoritmu, řazení nejslabších a statistiky.
- **Lab** – vlastní případy a hledání ergonomických algoritmů pro **3×3, 2×2,
  Pyraminx, Skewb a Square-1**:
  - **Zadání:** výchozí stav i cíl se vybarvují po nálepkách paletou barev (dílek
    obarví se jen klepnutá nálepka; chytré vybarvování v Nastavení navíc doplní
    jednoznačnou nálepku a přenese dílek na druhou stranu); 3×3, 2×2, Pyraminx a Skewb jde
    i nafotit stěnu po stěně. Tvar Square-1 se nastavuje tlačítky. Řeší se dílky vybarvené v cíli, každý se stylem: plná = místo
    i natočení, čárkovaná = jen místo, tečkovaná = jen natočení. 3×3 a 2×2 jsou
    ve 3D (nebo plošné síti), ostatní hlavolamy v plošné síti.
  - **Držení kostky:** u 3×3 a 2×2 kostku v 3D natočíš, jak ji držíš v ruce, a zámkem
    pohled „zafixuješ“; u Pyraminxu a Skewbu (a v plošné síti) držení vybereš
    z nabídky. Povolené tahy, ergonomika, nalezené i uložené algoritmy se pak píšou
    podle toho, jak hlavolam držíš (U = stěna nebo špička nahoře).
  - **Tahy a váhy:** povolené tahy, ergonomické váhy a jejich kalibrace podle
    časů z trenažéru. Hodnocení bere v úvahu i **návaznost tahů** (prstoklad,
    pravák v home grip): kterým prstem se tah udělá podle polohy zápěstí, stejný
    prst dvakrát po sobě, dva prstové tahy jednou rukou, bonus za střídání rukou.
    Tahy se špatnou návazností jsou ve výsledcích podbarvené i s důvodem.
  - **Řešení:** N nejpohodlnějších řešení z mnohem většího počtu nalezených,
    přehrávač a ukládání do zvolené sady trenažéru. Každé řešení má **styl**:
    ◎ efektivní (nejmíň tahů ze všech nalezených – pro přesné, pomalejší otáčení),
    ★ všestranné (nejkratší nebo o tah delší a zároveň plynulé),
    ⚡ rychlostní (víc tahů, ale plynulé: bez přehmatů a rotací, s dobrou návazností
    a celkově pohodlné – pro agresivní otáčení); výsledky jde podle stylu filtrovat a řadit.
  - **Dlouhé algoritmy** (např. PLL s mnoha druhy tahů): hledání nejdřív rychle
    zkusí trojice R U x a za pár sekund ukáže první řešení, pak ve zbytku času
    hledá kratší a lepší verze. Odhad vzdálenosti zesiluje tabulka všech stavů
    do ~5 tahů od cíle.

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
- zamíchání 5×5 a větších (WCA je míchá náhodnými tahy, takže to není nutné), Bluetooth kostky
