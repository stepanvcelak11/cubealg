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
    i natočení, čárkovaná = jen místo, tečkovaná = jen natočení; styl jde dát i jen
    jedné nálepce (tečkovaná nálepka = tahle barva na této stěně). 3×3 a 2×2 jsou
    ve 3D (nebo plošné síti), ostatní hlavolamy v plošné síti.
  - **Držení kostky:** u 3×3 a 2×2 kostku v 3D natočíš, jak ji držíš v ruce, a zámkem
    pohled „zafixuješ“; u Pyraminxu a Skewbu (a v plošné síti) držení vybereš
    z nabídky. Povolené tahy, ergonomika, nalezené i uložené algoritmy se pak píšou
    podle toho, jak hlavolam držíš (U = stěna nebo špička nahoře).
  - **Zadání šipkami:** místo barev klepneš na dílek a na místo, kam se má přesunout
    (u každé šipky zvlášť, zda zachovat orientaci); u ostatních dílků zvolíš, zda
    zůstanou složené, smí se hýbat jen ve své vrstvě, jen zachovat orientaci, nebo na
    nich nezáleží (samotné prohození dvou dílků kostka neumí – aplikace upozorní na
    paritu). **Částečně vybarvený dílek** (jen některé barvy) znamená
    „tahle barva má být tady“ – zachová se orientace barvy bez ohledu na to, který
    dílek to je (např. OLL: jen žluté nálepky nahoře).
  - **Tahy a váhy:** povolené tahy, ergonomické váhy a jejich kalibrace podle
    časů z trenažéru (váhy tahů i cena přehmatu, změny úchopu a návaznosti).
    Hodnocení bere v úvahu i **návaznost tahů** (prstoklad v home grip): kterým
    prstem se tah udělá podle polohy zápěstí, stejný prst dvakrát po sobě, dva
    prstové tahy jednou rukou, bonus za střídání rukou. Volba **levák** hodnotí
    zrcadlově. Tahy se špatnou návazností jsou ve výsledcích podbarvené i s důvodem.
  - **Řešení:** N nejpohodlnějších řešení z mnohem většího počtu nalezených,
    přehrávač a ukládání do zvolené sady trenažéru. Tři **pohledy** řadí všechna
    řešení jinak: ⚡ rychlost (nejdřív co nejméně přehmatů a rotací, pak co
    nejpříjemnější tahy a návaznost, délka skoro nehraje roli), ◎ efektivita (co
    nejméně tahů, pohodlí jen mezi stejně dlouhými) a ★ všestranné (poměr délky a
    pohodlí nastavíš posuvníkem „kratší ↔ pohodlnější“). Graf **délka × pohodlí**
    ukazuje všechna řešení a zvýrazní ta, která nejde zlepšit v jednom bez
    zhoršení druhého. U řádků je pořadí v ostatních pohledech, v detailu ve všech.
  - **AUF:** řešení smí začít a skončit natočením horní vrstvy, které se do délky
    ani hodnocení nepočítá – zápis „(U) R U R' … (U2)“ (vypnout jde v nastavení
    hledání).
  - **Nejdřív jakékoli řešení:** když krátké hledání nic nenajde, složí se cíl po
    etapách (dílek po dílku, už složené se drží) – řešení může mít libovolně tahů –
    a pak se zlepšuje: úseky až 16 tahů se přeřeší úplným hledáním (u neúplně
    sledovaného zadání konec algoritmu). „Max. tahů“ omezuje jen úplné prohledávání.
    Limit hledání je až 60 minut; nejlepší řešení se průběžně ukládají, po návratu
    do Labu se ukážou a další hledání na ně naváže.
  - **Postupné zlepšování:** hledání běží v několika vláknech najednou (podle
    počtu jader, každé prohledá svůj díl). Nejdřív rychle najde nějaké řešení (u
    mnoha druhů tahů přes menší sady ⟨R U⟩, ⟨R U r⟩, ⟨R U D⟩, ⟨R U M⟩, R U x…) a
    pak ho v kolech zlepšuje: každá sada tahů se prohloubí o tah, úplná sada hledá
    kratší řešení a **hledání podle pohodlí** (větve a meze podle ceny rychlosti)
    hledá pohodlnější, než je nejlepší známé. Kandidáti každého pohledu se
    dolaďují výměnou úseků za rovnocenné sekvence; při uváznutí v lokálním optimu
    se algoritmus náhodně „postrčí“ a ladí dál. Když úplná sada projde všechny
    kratší délky, u efektivity se ukáže **✓ nejkratší možné**. Nad výsledky jsou
    tři „nejlepší zatím“, které se během hledání mění; klepnutím se otevřou.
    Odhad vzdálenosti zesiluje tabulka všech stavů do ~5 tahů od cíle.

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
