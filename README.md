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

Vzhled („Sticker“) je celý ve `styles.css`: barvy jako proměnné na `:root` (světlý i tmavý
režim), písma Bricolage Grotesque (nadpisy, časy), Manrope (text) a JetBrains Mono (algoritmy)
jsou přibalená ve `fonts/`, takže fungují i offline.

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
  **Simulátor metody** (průvodce → „Simulovat“): náhodná zamíchání se složí krok
  po kroku podle dílků hotových po krocích. U každého kroku si nastavíš, jak ho řešíš:
  tahy (předvolby nebo vlastní výběr), **tvoje sada** (algoritmus ze sady kroku, když
  případ vyřeší – i s natočením horní, případně i spodní vrstvy před a po a s pomocným
  algoritmem jako oprava parity M2 U2 M2), „jen sada“ (případ bez algoritmu se počítá
  jako chybějící) nebo jen hledání (jako v Labu podle tvých vah), podle čeho vybírat
  (rychlost / efektivita / všestranné), čas hledání a čas rozpoznání. Krok jde vypnout –
  složí se najednou s dalším (vyplatí se kroky spojit?). **Barevná neutralita**: první
  krok se zkusí v obou protilehlých / všech šesti orientacích a použije se nejlepší.
  Zamíchání skládá víc vláken souběžně (`src/sim/sim-worker.js`); stejné **semínko** =
  stejná zamíchání, takže změny jde férově porovnat. **Délka** podle počtu zamíchání
  nebo času (1 h / 3 h / 8 h přes noc / dokud nezastavíš): běh se průběžně ukládá,
  displej nezhasne, na konci přijde oznámení a příště jde navázat dalšími zamícháními.
  Výsledek: průměr tahů na složení s intervalem spolehlivosti, medián a rozložení,
  **odhad času** (rozpoznání + provedení – u algoritmů s časem z trenažéru jejich čas,
  jinak tahy / TPS), u kroků tahy (průměr, medián, 90 %), náročnost, čas a podíl,
  krok s nejvíc tahy a s nejvíc časem, pokrytí sadou, **případy, na které v sadě nemáš
  algoritmus** (co v nich našlo hledání), ukázková složení se zamícháním a rozdíl proti
  minulé simulaci. **Porovnání metod ve dvou sloupcích**: vlevo vestavěná metoda (CFOP,
  Roux, ZZ – spočtené stejným simulátorem, `src/sim/references.js`) nebo jiná simulace,
  vpravo tvoje; tabulka s tahy, časem a kroky a kroky obou metod vedle sebe. Měření
  v Node: `node bench/method.mjs [zamíchání] [s na krok] [filtr] [json]`.
- **Simulace soutěže** (tlačítko Soutěž v Timeru): kolo podle pravidel WCA –
  Average of 5, Mean of 3 (6×6, 7×7) nebo Best of 3 (naslepo), povinná inspekce,
  volitelný cutoff, časový limit a cíl. Během kola pokusy, po čtvrtém pokusu
  nejlepší a nejhorší možný průměr (BPA/WPA) a čas potřebný na cíl; na konci
  výsledek jako na soutěži. Kola se ukládají a jsou vidět ve Statistikách.
- **Sdílení odkazem:** algoritmus, celou sadu (i s případy) nebo případ z Labu
  pošleš odkazem – data jsou přímo v něm, bez serveru. Příjemce je přidá do sady
  nebo případ otevře v Labu.
- **Trenažér** – vlastní algoritmy uložené z Labu (všechny hlavolamy) v **sadách**
  (např. podle situace nebo metody): trénuje se vybraná sada, náhodný případ
  podle zvládnutí (špatné se vracejí brzy, dobré čím dál vzácněji), nastavovací
  tahy, stopky, odhalení algoritmu, řazení nejslabších a statistiky. Uložený
  algoritmus jde **upravit** (tužka v seznamu): zápis se ověří proti případu a když
  se liší jen natočením horní vrstvy na začátku nebo konci (např. smazané úvodní U),
  případ se posune – algoritmus pak začíná z jinak natočené kostky. Ikona kopírování
  dá zápis do schránky; **Upravit** v seznamu zapne výběr: vybrané algoritmy jde
  zkopírovat nebo přesunout do jiné sady, zkopírovat jako text nebo smazat.
  **Rozpoznání:** režim, kde aplikace ukáže případ (s náhodným natočením horní
  vrstvy) a ty vybereš správný algoritmus ze čtyř možností (klepnutím nebo
  klávesami 1–4); měří se správnost a čas a častěji se vrací, co poznáváš špatně.
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
  - **Generátor sady pro krok metody** (tlačítko se seznamem v Zadání): krok popíšeš
    jako zadání – Start = co je hotové před krokem (nevybarvené = cokoli, dílek jen
    s částí barev = „tahle barva tady“), Cíl = co má být po kroku, tahy z „Tahy a
    váhy“. Aplikace projde všechny dosažitelné stavy, které Startu odpovídají,
    sloučí ty, které řeší stejný algoritmus (podle toho, na čem cíli záleží;
    natočení U před a po algoritmu; volitelně otočení celé kostky y a z2),
    ukáže případy s obrázky, pro vybrané najde algoritmy, ověří každý na všech
    stavech případu. Nic se neukládá samo: u každého případu zaškrtneš varianty
    k uložení (i víc než jednu; nabídnutá je zaškrtnutá), celý případ jde vynechat,
    a „Uložit vybrané“ je uloží do nové nebo existující sady v trenažéru. Ověřeno na známých
    sadách: OLL 57, PLL 21, CMLL 42, OLL 2×2 7, ZBLL+PLL 493, ELL 29 (testy).
    Volitelně „bílá a žlutá zaměnitelné“ na Startu (barevně neutrální metody).
    U každého případu je nabídka až 6 algoritmů (nejlepší podle rychlosti, délky
    a celkově) s počtem tahů, přehmaty a náročností; klepnutím vybereš jiný,
    „Hledat déle“ naváže na nalezená řešení. Zadaný čas na případ je průměr:
    případ s dokázaně nejpohodlnějším algoritmem skončí dřív a ušetřený čas
    dostanou těžší (nejvýš 3× průměr, max. minuta). Tvoje volby se pamatují
    a „Tahy a váhy → Podle mých voleb“ podle nich doladí hodnocení.
    **Noční běh** (Délka běhu „Do dokázání…“, nejvýš 1 h / 3 h / 8 h / bez omezení):
    po prvním kole se nedokázané případy hledají znovu a pokaždé déle (navazuje se na
    nalezená řešení), dokud nemá každý dokázaně nejpohodlnější algoritmus nebo nevyprší
    čas. Displej nezhasne (Wake Lock), průběh je v názvu karty a na konci přijde
    oznámení. Zastavený nebo zavřený běh jde příště navázat („Pokračovat“ v generátoru
    se stejným zadáním) – dokázané případy se už nehledají.
  - **Tahy a váhy:** povolené tahy, ergonomické váhy a jejich kalibrace podle
    časů z trenažéru (váhy tahů i cena přehmatu, změny úchopu a návaznosti).
    Hodnocení bere v úvahu i **návaznost tahů** (prstoklad v home grip): kterým
    prstem se tah udělá podle polohy zápěstí, stejný prst dvakrát po sobě, dva
    prstové tahy jednou rukou, bonus za střídání rukou. Volba **levák** hodnotí
    zrcadlově. Tahy se špatnou návazností jsou ve výsledcích podbarvené i s důvodem.
  - **Řešení:** N nejpohodlnějších řešení z mnohem většího počtu nalezených,
    přehrávač a ukládání do zvolené sady trenažéru. Tři **pohledy** řadí všechna
    řešení jinak: ⚡ rychlost (odhad času provedení – tahy, přehmaty, rotace,
    návaznost a úchopy dohromady; přehmat stojí zhruba jako tah a půl, takže
    o hodně delší algoritmus jen kvůli jednomu přehmatu nevyhraje – ověřeno na
    známých rychlých PLL a OLL), ◎ efektivita (co
    nejméně tahů, pohodlí jen mezi stejně dlouhými) a ★ všestranné (poměr délky a
    pohodlí nastavíš posuvníkem „kratší ↔ pohodlnější“). Graf **délka × pohodlí**
    ukazuje všechna řešení a zvýrazní ta, která nejde zlepšit v jednom bez
    zhoršení druhého. U řádků je pořadí v ostatních pohledech, v detailu ve všech.
  - **Úprava algoritmu:** v přehrávači „✎ Upravit“ – klepnutím vybereš tah a otočíš
    ho (′), zdvojíš (2), posuneš (← →), smažeš nebo za něj vložíš jiný; kostka ukazuje
    stav po vybraném tahu a hned je vidět, zda algoritmus pořád řeší zadání a jak je
    pohodlný. Řešící úpravu jde „+ Přidat do výsledků“, „↺ Původní“ vrátí nalezený
    algoritmus. Zápis jde měnit i přímo v textovém poli.
  - **AUF:** řešení smí začít a skončit natočením horní vrstvy, které se do délky
    ani hodnocení nepočítá – zápis „(U) R U R' … (U2)“ (vypnout jde v nastavení
    hledání).
  - **Nejdřív jakékoli řešení:** když krátké hledání nic nenajde, složí se cíl po
    etapách (dílek po dílku, už složené se drží) – řešení může mít libovolně tahů –
    a pak se zlepšuje: úseky až 16 tahů se přeřeší úplným hledáním (u neúplně
    sledovaného zadání konec algoritmu). „Max. tahů“ omezuje jen úplné prohledávání.
    Limit hledání je až 60 minut; nejlepší řešení se průběžně ukládají, po návratu
    do Labu se ukážou a další hledání na ně naváže.
  - **Uložené tabulky:** pattern databáze (odhady vzdálenosti pro hledání) se ukládají
    v prohlížeči (IndexedDB) podle obsahu – u celé kostky s cílem „složeno“ jsou
    stejné pro všechny případy, takže další hledání začne hned (příprava ~1,5 s → ~0,1 s).
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

Zlepšování (`src/search/explore.js`) střídá úlohy: menší sady tahů, úplné
hledání (důkaz nejkratšího), přeřešení úseků a dále

- **pohodlí** – větve a meze pro jednotlivé délky podle ceny tahů se stavem ruky;
  ceny jsou snížené o nejvyšší možný bonus za trigger, takže když se projdou
  všechny délky, do kterých se levnější algoritmus vejde, je nejlepší dokázaně
  nejpohodlnější („✓ nejpohodlnější možné“) a hledání skončí dřív,
- **bloky** – triggery a časté úseky tvých algoritmů jako jeden krok hledání
  (`src/search/library.js`),
- **knihovna** – tvoje uložené algoritmy (i zrcadla a inverze) s nastavením
  do 2 tahů a dokončením do 3 tahů.

Rychlost a síla odhadu:

- další stav se počítá po skupinách databází a odřízne se hned, jak první (nejsilnější)
  databáze ukáže, že je moc daleko,
- **databáze ceny** (Dijkstra s dolními mezemi cen tahů) dávají hledání podle pohodlí
  dolní mez ceny do cíle – zhruba poloviční počet prohledaných stavů,
- **velké databáze** (skupiny 5–6 dílků, po 4 bitech) na zařízeních s ≥ 8 GB paměti:
  použijí se, když už jsou uložené, nebo při hledání aspoň 30 s; úplné hledání je
  s nimi zhruba 2× rychlejší,
- workery si rozdělí pohledy pro přeřešení úseků (nedělají totéž),
- **jádro ve WebAssembly** (`wasm/src/lib.rs` → `src/search/kernel.wasm`, build
  `npm run wasm`, potřebuje Rust s cílem `wasm32-unknown-unknown`): stejné prohledávání
  (IDA* i větve a meze podle ceny) a stavba databází, s výsledky totožnými s JS verzí
  (test `test/kernel.test.js` porovnává řešení i počty uzlů). Hledání je zhruba 1,8–2×
  rychlejší (tabulka blízko cíle s otisky klíčů – většina dotazů jedním čtením paměti),
  příprava databází 1,7–2,9×. Bez jádra (starý prohlížeč) hledá JS verze.
  `node bench/speed.mjs js` / `node bench/quality.mjs … js` měří bez jádra.

Hodnocení počítá i **AUF** před a po algoritmu (cena U × „AUF před a po“ v Tahy
a váhy); do délky se nepočítá.

Paměť: Lab si u zadání pamatuje i to, co už je prohledané (délky bez řešení, délky
prohledané podle pohodlí), a další hledání na to naváže. Generátor sad si to pamatuje
u každého případu; případ s dokázaně nejpohodlnějším algoritmem se příště už nehledá.

Měření: `node bench/quality.mjs [sekund] [filtr] [lib] [real]` porovná nalezené
algoritmy se známými rychlými (PLL, OLL, EPBL); `node bench/speed.mjs` měří rychlost.
Měření běží na **virtuálních hodinách** (`src/search/clock.js`: čas podle odvedené
práce, pevné semínko náhody), takže dává při každém spuštění stejný výsledek.

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
