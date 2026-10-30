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

Vzhled („Dílna“ – inkoust a limetka) je celý ve `styles.css`: teplý papírový podklad, karty
s tenkou linkou, jediná výrazná barva (limetka) pro to, co je aktivní, hlavní tlačítka
inkoustová (v tmavém režimu limetková); na mobilu ukotvená spodní lišta s popisky, na širokém
displeji boční panel. Barvy jsou proměnné na `:root` (světlý i tmavý režim), písma Bricolage Grotesque (nadpisy, časy), Manrope (text) a JetBrains Mono (algoritmy)
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
  **Ručně** (tlačítko v hlavičce Timeru): čas ze stackmatu nebo jiných stopek se
  napíše (`12.34`, `12,34`, `1:02.45`, jen číslice jako v csTimeru `1234` = 12.34,
  `+` / `+2` = trest, `d` = DNF) a uloží se k aktuálnímu zamíchání stejně jako změřený.
- **Statistiky** – single, ao5, ao12, ao50, ao100 (aktuální i nejlepší podle WCA),
  průměr, graf vývoje, **osobní rekordy s historií zlepšení**, **porovnání dvou
  skupin**, rozložení časů, filtr období, seznam složení s úpravou trestů a poznámek
  a **export do CSV** (skupina nebo všechno) – pro každou skupinu zvlášť.
  **Moje rekordy** (přepínač nahoře ve Statistikách, `ui/mytable.js`, logika
  `timer/records.js`): vlastní tabulka rekordů místo Excelu – řádky kostky (i ty, které
  timer nezná), sloupce Single / Mo3 / Ao5… a vlastní, ke každé buňce datum a historie
  zlepšení, poznámka u kostky. **Vložit z Excelu** načte zkopírované buňky (tabulátor,
  středník i čárka, záhlaví se pozná), **Stáhnout CSV** ji vrátí zpátky. U kostek, které
  skládáš i v timeru, je pod buňkou rekord z timeru (⏱) a když je lepší, jedním klepnutím
  se převezme. Profil skladače se umí z tabulky doplnit.
- **Metody** – výběr metody v horní liště (např. CFOP a tvoje vlastní) přepne celou
  aplikaci: složení v timeru, statistiky i sady algoritmů z Labu a Trenažéru patří
  k aktivní metodě. Ve statistikách jde metody (i skupiny) porovnat vedle sebe.
  **Sekce Metoda** (v liště): celá vlastní metoda na jednom místě. **Sestavit**
  (`src/ui/builder.js`) má dvě obrazovky. *Přehled*: „Co teď udělat“ (kroky bez
  zadání, kroky, kterým chybí algoritmy – vygenerují se všechny jedním testem),
  kroky jako časová osa s náhledem kostky po každém kroku a stavem (intuitivně /
  počet algoritmů / chybí algoritmy), nastavení metody (název, držení, úvod)
  a šablony. *Krok*: horní lišta (zpět, krok i z n, předchozí/další), čipy všech
  kroků, název a pořadí, pak čtyři karty – **1. Jak má kostka vypadat po kroku**:
  vedle sebe kostka před krokem a po kroku; kostka pokračuje z minulého kroku (hotové
  z dřívějška je vybarvené, nové má růžový rámeček) a dobarví se jen nové *po
  nálepkách jako v Labu* – vybereš barvu (víc barev = kterákoli z nich, např. bílá
  nebo žlutá), „správnou barvu“ (jako střed strany) nebo „nezáleží“ (šedá) a klepeš
  na nálepky (nebo celý dílek; klepnutí na střed vybarví celou stranu). Uloží se jako
  buňka `{ colors: { stěna: [barvy] } }` (`core/cells.js`: každá nálepka = podmínka
  „na této pozici některá z barev“, všechny vlastní barvy = hotový dílek). Volnost
  „smí se složit i jinde“. **2. Jak se krok řeší** (intuitivně / algoritmy – vygenerovat:
  test si algoritmy vytvoří sám při každém spuštění a uloží je jako sadu kroku s otiskem
  kroku – když se krok nebo kroky před ním změní, vytvoří se při dalším testu znovu.
  Řešení se slučují **po případech** (`sim/learn.js`): nové řešení je nový algoritmus,
  jen když ho žádný známý algoritmus kroku nevyřeší ani s natočením vrstev (AUF/ADF);
  natočení vrstvy na začátku a konci se odřízne. Nový algoritmus dostanou hned všechna
  vlákna testu, takže další zamíchání krok skládají jím (jako člověk, který se ho
  naučil) a hledá se jen u nepotkaných případů – OLL tak má nejvýš 57 algoritmů.
  Natočení vrstev „automaticky“ (`autoAdjust` v `sim/plan.js`): vrstva se smí natočit
  před algoritmem a po něm, když ji krok točí a před krokem není celá hotová – i s
  hotovými rohy (EPBL: `U … U'` je tentýž případ z jiné strany, takže po paritě vyjde
  5 × 5 − 1 = 24 případů: nic, Ua, Ub, H, Z nahoře i dole); celá hotová vrstva (spodek
  CFOP u OLL a PLL) se netočí /
  moje sada / **jen někdy – pevný algoritmus**: krok, který nic nového neskládá a dělá se
  jen při splnění podmínky, např. parita M2 U2 M2 „když je parita“ = lichá permutace
  dílků vrstvy nahoře nebo dole, hrany XOR rohy, takže ji natočení vrstvy nemění;
  `fixedNeeded` v `sim/simulate.js`). **3. Omezení** (povolené tahy, nejvýš tahů, podle čeho vybírat).
  **4. Vyzkoušet** (náhodné zamíchání kroky 1…i). Dole předchozí/další krok nebo
  „Přidat další krok“. Na širokém displeji je osa vlevo vedle kroku. Nastavení se
  ukládá ke krokům (`st.sim`). Pokročilé zadání (`src/core/cells.js`,
  editor `src/ui/celleditor.js`): rozložená kostka, klepnutím se vybírají místa (i víc
  najednou nebo celé vrstvy) a ke každému místu dvě otázky – *co tu musí být* (nic /
  jeho vlastní dílek / některý z vybraných dílků, např. všechny s bílou nebo žlutou)
  a *jak natočený* (správně / jakkoli / určitá barva na určitou stranu). Kostka hned
  ukazuje, co na kterém políčku musí být. Tak jde zadat jakákoli metoda: kříž
  z kterýchkoli hran, do slotu kterýkoli roh, natočení vrstev, separaci barev, EO…
  Jádro hledání má pro „některý z dílků“ přesné databáze podle poloh nálepek skupiny
  (`#classes` v `core/constraints.js` a `search/engine.js`). Starší zadání (dílky se
  styly, pravidla `core/rules.js`) se při otevření kroku převede. **Šablony** (CFOP,
  Roux, ZZ, Petrus, separační metoda; `src/sim/templates.js`) založí novou metodu se vším
  nastaveným. Nácvik kroku v timeru po krocích s „některým z dílků“ zamíchá tak, že
  náhodnou kostku složí podle předchozích kroků metody.
  **Otestovat** – test metody (simulátor níž) jen čte kroky a pouští se.
  **Průvodce metodou** (na čtení; „Upravit“ vede do Sestavit): úvod a kroky s obrázkem
  kostky „před → po“, odkazem na sadu algoritmů k tréninku, případně **ukázkou algoritmu**,
  která se dá přehrát tah po tahu. **Vysvětlení pro nováčky** se vytvoří samo z toho, co
  je po kroku hotové (sim/explain.js): co v kroku uděláš (kříž, pár, natočení horní
  vrstvy, oddělení barev, permutace…), co se na kostce změní po vrstvách skutečnými
  barvami, co nesmíš rozbít a jak na to (intuitivně s tipy / algoritmy: poznat případ,
  natočit vrstvu, provést / jen někdy a kdy). Nahoře „Než začneš“ (držení, jak číst
  obrázky, zápis použitých tahů), dole **ukázkové složení** – jedno skutečné složení
  z posledního testu, krok po kroku s kostkou po každém kroku.
  Metodu i s průvodcem a algoritmy jde **sdílet** jako soubor (druhý ji
  naimportuje přes „Importovat metodu…“) nebo **vytisknout / uložit jako PDF**.
  **Nácvik kroku** v timeru (3×3) pro CFOP i vlastní metody: u každého kroku průvodce
  se vybere, co je po něm hotové (předvolby kříž, X-cross, F2L, bloky 2×2×2/2×2×3,
  bloky Roux, EO, CO, OLL… nebo klepáním na dílky; dílek hotový, jen na místě nebo
  jen natočený; podle zvoleného držení metody). Zamíchání pak nechá hotové všechno
  z předchozích kroků a časy nácviku se ukládají zvlášť. Krok jde spustit i přímo
  z průvodce tlačítkem „Nacvičit“.
  **Test metody** (Metoda → Otestovat, i z průvodce; běží dál, i když přepneš jinam)
  má nastavení testu (délka, tahy za sekundu, realismus; semínko a otočení kostky pod
  „Další nastavení“), sbalené „Co se testuje“ a výsledek; třetí část **Porovnat** má
  srovnání s jinými metodami a historii testů. Odhad času je pro zvolenou **úroveň
  skladače** (`LEVELS` v `sim/simulate.js`): světová špička = potenciál metody (algoritmy
  13 tahů/s, intuitivní kroky 11, bloky 6,5, rozpoznání poloviční), rychlý skladač,
  vlastní tempo, počítač. Tahy skladače = tahy simulace × (intuitivní 0,9, bloky 1,2,
  algoritmy 1) – kalibrováno na rekonstrukce špičky (CFOP ~57, Roux ~48; obě kolem 6 s).
  Výsledek po krocích v čase (tahy, tempo, rozpoznání, podíl času), „Co znamenají čísla“
  a u každého kroku „Použité algoritmy“ (kolikrát, tahy, ergonomie, odkud a podle čeho
  se vybraly). U kroku v Sestavit „Otevřít v Labu“ přenese kostku před krokem (Start)
  a po něm (Cíl) do Labu (`stepLabTask` v `celleditor.js`; nálepky s víc barvami Lab
  neumí – zůstanou šedé):
  náhodná zamíchání se složí krok po kroku podle dílků hotových po krocích. Krok se řeší
  podle nastavení ze Sestavit:
  tahy (předvolby nebo vlastní výběr), **tvoje sada** (algoritmus ze sady kroku, když
  případ vyřeší – i s natočením horní, případně i spodní vrstvy před a po a s pomocným
  algoritmem jako oprava parity M2 U2 M2), „jen sada“ (případ bez algoritmu se počítá
  jako chybějící) nebo jen hledání (jako v Labu podle tvých vah), podle čeho vybírat
  (rychlost / efektivita / všestranné), čas hledání a čas rozpoznání. Posuvník
  **Realismus odhadu** (počítač ↔ člověk) mění, jak moc odhad počítá s lidskými tahy a tempem. Krok jde vypnout –
  složí se najednou s dalším (vyplatí se kroky spojit?). **Volnost kroku** – kde smí
  být jeho dílky: pevně, kterýkoli bok (pár do kteréhokoli slotu, blok na kterékoli
  straně), dvě protilehlé barvy, kterákoli strana a barva, nebo **vybrané barvy** dole
  (a vpředu) – třeba kříž jen bílý nebo žlutý. U každého zamíchání se zkusí všechna
  povolená místa, vyhraje nejlepší a další kroky pokračují v té orientaci; otočení
  kostky (y, x2…) jde počítat jako tah.
  Zamíchání skládá víc vláken souběžně (`src/sim/sim-worker.js`); stejné **semínko** =
  stejná zamíchání, takže změny jde férově porovnat. **Délka** podle počtu zamíchání
  nebo času (1 h / 3 h / 8 h přes noc / dokud nezastavíš): běh se průběžně ukládá,
  displej nezhasne, na konci přijde oznámení a příště jde navázat dalšími zamícháními.
  Výsledek: průměr tahů na složení s intervalem spolehlivosti, medián a rozložení,
  **odhad času** (rozpoznání + provedení – u algoritmů s časem z trenažéru jejich čas,
  jinak tahy / TPS; u intuitivních kroků počítá s víc tahy a pomalejším tempem
  člověka, `HUMAN` v `src/sim/simulate.js`), u kroků tahy (průměr, medián, 90 %), náročnost, čas a podíl,
  krok s nejvíc tahy a s nejvíc časem, pokrytí sadou, **případy, na které v sadě nemáš
  algoritmus** (co v nich našlo hledání), ukázková složení se zamícháním a rozdíl proti
  minulé simulaci. **Porovnání metod ve dvou sloupcích**: vlevo vestavěná metoda (CFOP,
  Roux, ZZ – spočtené stejným simulátorem, `src/sim/references.js`) nebo jiná simulace,
  vpravo tvoje; tabulka s tahy (simulace i odhad člověka), časem a kroky, kroky obou
  metod vedle sebe a **data skutečných skladačů** (tahy z rekonstrukcí, nejlepší
  oficiální výsledky, se zdroji). Měření
  v Node: `node bench/method.mjs [zamíchání] [s na krok] [filtr] [json]`.
  **Učebnice metody** (Metoda nebo průvodce → „Učebnice“): celá metoda v jednom HTML
  souboru pro nováčka – „Než začneš“ (držení, obrázky, zápis tahů, jak se metodu učit),
  přehled kroků, u každého kroku vysvětlení jako v průvodci s kostkou před a po kroku,
  ukázkové složení z testu a všechny algoritmy sad s obrázkem případu, tvými časy
  a políčkem „umím“.
  Jde vytisknout do PDF a obsahuje data metody, takže ji aplikace umí znovu importovat
  (i s nastavením simulátoru).
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
    dílek to je (např. OLL: jen žluté nálepky nahoře). Ve Startu za něj aplikace
    dosadí některý dílek s těmi barvami (jen kvůli výpočtu – přehrávač ukazuje dál
    jen vybarvené nálepky, zbytek šedě, a nemožné prohození dvou dílků z dosazení
    sama opraví). Když cíl s povolenými tahy splnit nejde, hledání to řekne hned
    a nabídne přidat chybějící tahy; krok metody poslaný do Labu přinese i své tahy.
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
    **Doladit podle mých rukou** (porovnání dvojic, `ui/compare.js`): dva algoritmy pro
    stejný případ ze sbírky (`ergonomics/corpus.js` – 47 případů PLL / OLL / F2L,
    oblíbený algoritmus skladačů a alternativy z hledání, vygenerováno `bench/corpus.mjs`,
    každá ověřená), zatočíš si oba a vybereš pohodlnější (nebo „stejně“). Počet porovnání
    si zvolíš (10–80). Další dvojici vybírá `ergonomics/compare.js`: liší se v druzích
    tahů a míst, které dosavadní odpovědi zkoušely nejmíň, a dnešní hodnocení je u ní
    nejisté – časem se tak vyzkouší všechno. Váhy z odpovědí počítá `learnPreferences`
    (Bradley–Terry: pravděpodobnost volby = logistická funkce rozdílu hodnocení
    nepohodlnost + čas tahů, „stejně“ táhne rozdíl k nule, prior drží váhy u základu, takže
    víc odpovědí = přesnější váhy). Odpovědi se ukládají a sčítají přes sezení (i s volbami
    z generátoru); základ (`prefBase`) jsou váhy před prvním doladěním, ať se stejnými
    odpověďmi váhy neposouvají dál.
    **Výchozí váhy** jsou doladěné stejným výpočtem na sbírce (`bench/fit.mjs`: oblíbený
    algoritmus má vycházet líp než alternativy – předtím 77 % dvojic, teď 93 %, na
    případech mimo ladění 71 → 83 %; navíc tvůj případ: 7 tahů před 15 obalenými F), každá váha nejvýš o třetinu dolů / polovinu nahoru;
    ladí se i násobič bonusů za triggery. Uložené váhy, které sis neměnil, přejdou na nové.
    Oblíbené algoritmy sbírky zkouší hledání jako knihovnu (s nastavením a dokončením),
    pohodlné menší sady tahů (jen R U, R U s M…) prohledává i tehdy, když už má kratší
    řešení s celou sadou, a dvojice tahů jedné osy, které jsou dohromady jeden tah
    (`M' r'` = `R'`), přeskakuje. Ve výsledcích **Podle stylu**: nejlepší řešení z každé
    skupiny tahů (jen R U, R U + F, R U + M…).
    Hodnocení bere v úvahu i **návaznost tahů** (prstoklad v home grip): kterým
    prstem se tah udělá podle polohy zápěstí, stejný prst dvakrát po sobě, dva
    prstové tahy jednou rukou, bonus za střídání rukou. Volba **levák** hodnotí
    zrcadlově. Tahy se špatnou návazností jsou ve výsledcích podbarvené i s důvodem.
  - **Řešení:** N nejpohodlnějších řešení z mnohem většího počtu nalezených,
    přehrávač a ukládání do zvolené sady trenažéru. Tři **pohledy** řadí všechna
    řešení jinak: ⚡ nejrychlejší (odhad času provedení – každý tah stojí základní čas
    a k tomu jeho nepohodlnost: přehmaty, rotace, návaznost, úchopy, triggery; dvakrát
    delší algoritmus z R a U tak nevyhraje nad krátkým jen proto, že je plynulý),
    ◎ nejkratší (co nejméně tahů, pohodlí jen mezi stejně dlouhými) a ★ vyvážené
    (poměr nastavíš posuvníkem „kratší ↔ rychlejší“). Přehrávač má posuvník
    **rychlosti** (0,5–8 tahů za sekundu). Graf **délka × pohodlí**
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

## Chytrá kostka (Bluetooth)

Nastavení → **Chytrá kostka**: GAN Gen2/3/4 (GAN 356 i Carry, i3, 12 ui, 14 ui, Mini ui…) a
MoYu AI 2023 přes Web Bluetooth (Chrome na Androidu a počítači, na iPhonu prohlížeč Bluefy).
`src/smartcube/`: `aes.js` (AES-128, ověřený testovacími vektory FIPS-197), `gan.js`
(protokoly podle knihovny gan-web-bluetooth, MIT – přepsané bez závislostí a porovnané s ní
na stejných zprávách), `index.js` (připojení, MAC adresa z reklamy nebo zadaná, stav kostky,
události `move` s časem z hodin kostky; `simulate()` + `feed()` napodobí kostku pro testy),
`recon.js` (dvojité tahy z čtvrttahů, plynulé úseky, rozbor po krocích).
- **Timer:** pozná, že je kostka zamíchaná podle zamíchání, první tah spustí čas (s inspekcí
  ji spustí zamíchání), složení ho zastaví – čas podle hodin kostky; tahy se uloží ke složení.
- **Rozbor složení** po krocích aktivní metody (stejně jako test metody): pauza před krokem
  (rozpoznání), točení, tahy, tempo, nejpomalejší krok; u posledního složení v timeru, průměr
  v Statistikách („Kde ztrácím čas“) a u každého složení v seznamu.
- **Trenažér:** pozná nastavený případ (až kostka po nastavení chvíli stojí), první tah spustí
  čas, vyřešení ho zastaví, ověří, jestli šel přesně algoritmus.
- **Ergonomie z měření:** plynulé úseky bez pauzy (trenažér, kroky algoritmů v timeru) jsou
  změřené „algoritmy“ – Tahy a váhy → **Podle mé chytré kostky** z nich spočítá váhy.

## Z Labu do trenažéru

Uložený algoritmus nese zadání případu (Start, Cíl, omezení, držení) a i natočení, ve kterém
skladač kostku v Labu zrovna měl (`look`, když ji otočil tažením a nezamkl držení) – trenažér ji
ukáže stejně natočenou. Trenažér u každého případu ověří, že algoritmus zobrazený případ opravdu
vyřeší; když ne (např. případ uložený ze staršího zadání), ukáže upozornění s tlačítkem
**Otevřít v Labu**. Zadání, které nejde sestavit, se nekreslí obrázkem předchozího případu.

## Známé sady algoritmů v metodě

Sestavit → krok → Jak se krok řeší → **Algoritmy – známá sada** (`sim/knownsets.js`): standardní
**OLL** (57) nebo **PLL** (21) algoritmy, aniž by je skladač musel mít v aplikaci. Test metody
je bere stejně jako tvou sadu (natočení vrstev před a po, rotace uprostřed algoritmu se převedou
na tahy); „Když na případ algoritmus nemá“ rozhodne, jestli se jiný případ dohledá. V učebnici
metody se u kroku algoritmy nevypisují – jen „použij standardní OLL algoritmy“. Algoritmy i to,
že pokryjí všechny případy, hlídá `test/knownsets.test.js`.

Obrázky v učebnici (krok i případy algoritmů) jsou rozložená kostka – všech 6 stran.

## Lab: zadání jako v metodě

Lab → Zadání → **Jako v metodě** (3×3, vedle Barvy a Šipky): krok se zadá stejným editorem jako
v Sestavit (`cellEditor`) – nahoře co je hotové **před krokem**, dole co má být hotové **po kroku**,
v držení aktivní metody. Jde tak zadat i to, co barvami nejde: **víc barev na nálepce** (dole bílá
nebo žlutá), dílek kdekoli, správně natočený (EO)… `cellsLabTask` (`ui/celleditor.js`) z buněk
sestaví úlohu: vlastní dílky jako vybarvené celé dílky, ostatní jako skupinová pravidla
`#classes` (projdou zadáním `buildTask` i hledáním) a omezení Startu `before`.
**Hledat** vyřeší jeden náhodný případ, který splňuje „před krokem“ (`makeSampler`, **Jiný
případ** ho vymění); **Generátor sady** vyjmenuje všechny případy – `enumerateCases` zná
štítky skupinových pravidel a vynechá stavy, které Start nesplňují. Uložený algoritmus nese
konkrétní případ (pro trenažér) i zadání buněk. „Otevřít v Labu“ v Sestavit otevře krok v tomto
režimu (nic se neztratí).

## Trénink vybraných algoritmů se zamícháním

Trenažér → Sada → **Vybrat algoritmy k tréninku…** (`ui/trainpick.js`): ze všech svých sad
(i z víc metod) zaškrtneš celé sady nebo je rozbalíš a vybereš jednotlivé algoritmy (hledání
podle názvu nebo tahů). Výběr se uloží jako **Můj výběr (N)** a trenažér dává případy jen
z něj (opakování podle zvládnutí jako u sad). Zaškrtávátko v seznamu algoritmů pak přidává
a ubírá z výběru.

U každého případu je **zamíchání** (`ui/casescramble.js`): tahy, které ze složené kostky
udělají právě tento případ – u 3×3 řešení two-phase z výsledného stavu (jen vnější tahy,
algoritmus neprozradí), u ostatních hlavolamů inverze algoritmu. Zamíchání je v zápisu
držení algoritmu (kostku držíš jako při algoritmu), algoritmy se slice tahy, rotacemi
a širokými tahy fungují (kostka je po zamíchání a algoritmu složená, jen jinak natočená).
**Náhodné AUF** natočí případ horní vrstvou náhodně (obrázek i zamíchání), odhalený
algoritmus pak začíná natočením v závorce. Když nevíš, **Ukázat algoritmus** ukáže tvůj
uložený algoritmus. Tlačítko Zamíchání zamíchání skryje / ukáže (pamatuje se).

## Doladit podle mých sad

Lab → Tahy a váhy → **Doladit podle mých sad** (`ui/learnsets.js`, logika `ergonomics/fromsets.js`):
vybereš sady, ve kterých máš algoritmy, které sis sám vybral a vyhovují ti (ne všechny – jen
zaškrtnuté; volba se pamatuje). Každý algoritmus se porovná se „soupeři“ pro stejný případ:
oblíbenými algoritmy sbírky (známý případ PLL/OLL/F2L…) a volitelně s tím, co pro jeho
uložené zadání najde krátké hledání v Labu (2 nebo 5 s na algoritmus, tahy Labu + tahy
algoritmu, jeho držení). Z dvojic „můj je lepší než soupeř“ (nejvýš 6 nejsilnějších soupeřů
na algoritmus) se modelem Bradley–Terry (`learnPreferences`, `transitions: true`) naučí váhy
tahů, přehmatů, návaznosti a nově i **dvojic tahů po sobě** (`pairWeights`, klíč „M>D“ podle
vrstev): příplatek nebo sleva za to, že tah X následuje po Y. Dvojice drží u nuly silněji
(`pairPrior`), protože je jich hodně. Výsledek ukáže, u kolika případů vychází tvůj algoritmus
nejlepší před laděním a po něm. Naučené návaznosti jsou v Tahy a váhy → **Moje návaznosti**
(klepnutím se smažou), hodnocení je ukáže jako důvod u tahu a hledání podle pohodlí je
používá (sleva za dvojici snižuje dolní mez ceny tahu, aby hledání zůstalo přesné).

## Hodnocení vlastních algoritmů

Trenažér → ikona budíku (`ui/review.js`, logika `ergonomics/review.js`): algoritmy napsané
nebo vložené (každý na řádek, „název: tahy“, i se závorkami, Rw, M a rotacemi), nebo celá
vlastní sada z trenažéru. U každého:

- **případ** – PLL / OLL / F2L a podle sbírky i jméno (T-perm, Sune…), rotace uprostřed
  algoritmu se převedou (`withoutRotations`),
- **známka 0–100** – u známého případu (1 / poměr k nejlepšímu známému algoritmu)² podle tvých
  vah (pohled Nejrychlejší), 100 = stejně dobrý nebo lepší; u neznámého případu plynulost
  na tah proti všem algoritmům sbírky (dlouhé algoritmy trochu dolů),
- **odhad času** při zvoleném tempu (tvůj profil skladače nebo úroveň) a tvoje naměřené časy
  z trenažéru, pokud ho trénuješ,
- **pořadí mezi známými algoritmy** pro stejný případ s grafem a o kolik jsou rychlejší
  (jedním klepnutím do trenažéru),
- **slabá místa** (zvýrazněná v zápisu): přehmat zápěstí, změna úchopu, otočení kostky,
  špatná návaznost tahů; **silné stránky** (triggery, podíl R/U) a **co zkusit**,
- **Hledat lepší v Labu** otevře případ v Labu, kde hledání najde pohodlnější řešení,
- **Porovnat s jiným algoritmem** (třeba s tím z generátoru): oba vedle sebe se slabými
  místy a verdiktem hodnocení; tvoje volba („Můj je lepší“ / „Ten druhý“ / „Stejně“) se uloží
  jako porovnání a Lab → Tahy a váhy → **Podle mých porovnání** z nich doladí váhy.

## Knihovna algoritmů

Trenažér → **Knihovna** (`ui/algdb.js`, logika `ergonomics/algdb.js`): vestavěná sbírka
(oblíbené algoritmy a alternativy, `corpus.js`) nebo **vložený text** zkopírovaný z
veřejných databází (SpeedCubeDB, AlgDb, cubing.net – řádky „název: algoritmus“, tabulky,
poznámky na konci řádku, `Rw` = `r`, otočení kostky na začátku se převede). Algoritmy se
roztřídí podle případu, který řeší (PLL / OLL / F2L / jiné – stejný případ i s jiným AUF
nebo viděný z jiné strany), a v každém seřadí podle tvých vah (pohled Nejrychlejší).
Nejlepší pro tebe je předvybraný; vybrané se uloží do sady v trenažéru i s případem.

## Sdílení metody odkazem

Metoda → **Sdílet** → Odkaz (`shareMethodLink` v `ui/guide.js`): celá metoda – kroky,
nastavení kroků, sady s algoritmy (i s případy) a výsledek posledního testu – zabalená
v odkazu (`#s=`, deflate + base64url, bez serveru). Kdo odkaz otevře, uvidí náhled (kroky,
počet algoritmů, test autora) a přidá si ji jako novou metodu; výsledek autora se přidá
do Metoda → Porovnat („… (test autora)“), takže ji hned porovná se svými. Pro hodně
velké metody je pořád i soubor.

## Objevitel metod

Metoda → **Vylepšit** (`ui/discover.js`, návrhy `sim/discover.js`): z tvé metody navrhne úpravy
podle zvolené odvahy a každou otestuje na stejných zamícháních (stejné workery a model skladače
jako test metody, kratší hledání na krok):

- **drobné** – volnost (pár do kteréhokoli slotu, barevná neutralita prvního kroku), krok
  naučenými algoritmy místo intuice a naopak,
- **větší** – spojit krok s dalším, rozdělit krok na natočení a permutaci (2-look), nejdřív
  hrany a pak rohy, prohodit pořadí dvou nezávislých kroků,
- **brutální** – spojit tři kroky, natočit všechny hrany hned v prvním kroku (jako EOLine
  u ZZ) nebo před koncem (jako ZBLS), přestavět celý konec metody (natočit vše + složit vše,
  hrany + rohy, všechno jedním algoritmem).

Návrhy, které tvoje metoda už dělá (stejné kroky, stejná volnost, nový krok, který se skoro
vždycky přeskočí), vynechá. Výsledek: o kolik se změní odhad času (párově jen na zamícháních,
která složily obě varianty; ± z rozdílů na každém zamíchání), tahy a počet algoritmů = počet
případů kroků (`sim/casecount.js`: náhodné stavy před krokem sloučené jako při učení – i s AUF
a paritou; OLL 57, PLL 21, CMLL 42, EPBL 24; když je případů moc, odhad Chao1). Pořadí počítá
i s cenou učení (100 algoritmů navíc ≈ 0,2 s). Workery zůstávají mezi návrhy a pamatují si
řešení kroků na stejných zamícháních (nezměněné kroky se nehledají znovu). Počet případů kroku
ukáže i Sestavit a test metody. Tři nejlepší úpravy nastavení zkusí i po dvou
dohromady. „Použít“ zapíše změnu do nastavení kroků, přestavbu jde „Uložit jako novou metodu“
(tvoje zůstane beze změny).

U každého kroku jde v Sestavit nastavit **povolené tahy** (např. ⟨R, U, L, F⟩ pro F2L, jak ho
skládá člověk s otočením kostky ke slotu – tak ho skládá i vestavěná CFOP) a **styl skládání**
(jako test / s plánem dopředu / plynule bez plánování / začátečnicky) – kolik tahů navíc proti
testu uděláš. Bez stylu se řídí úrovní skladače v Otestovat (špička, kolem 10 s, kolem 20 s).
U intuitivního kroku jsou **rychlé volby „Jak to skládá člověk“** (páry ⟨R U L F⟩ s otočením ke
slotu, bez rotací ⟨R U L⟩, bloky s plánem, kříž z inspekce, začátečník, jako počítač) – nastaví
tahy, volnost a styl jedním klepnutím. Intuitivní krok test skládá **jen hledáním**: nepoužije
sadu algoritmů, nic se z něj neučí a jeho řešení se nenabízí uložit jako algoritmy (výsledek je
ukazuje jako „Ukázky řešení“); algoritmy hledá a používá jen u kroků „Algoritmy – vygenerovat /
moje sada“.

**Můj profil skladače** (Nastavení → Můj profil, v Otestovat úroveň „Já“; `ui/profile.js`,
`sim/profile.js`): průměr a single 3×3 a metoda, kterou skládáš, kolik složení, tempo algoritmů,
look-ahead, plánování v inspekci, barevná neutralita, ruka, roky a trénink, sady algoritmů, které
umíš (OLL, PLL, COLL, CMLL, ZBLL…, u velkých sad i kolik z nich), a průměry na dalších kostkách.
„Doplnit z mých dat“ vezme průměry a rekordy z timeru a tempo algoritmů z časů v trenažéru. Úroveň
„Já“ se dopočítá plynule mezi špičkou, ~10 s a ~20 s podle průměru a doladí tak, aby tvoje metoda
vyšla přesně na tvůj průměr; zadané tempo algoritmů a look-ahead rozdělí čas mezi provedení a
pauzy. Hodnocení metody pak ukáže čas „pro tebe“ proti tvému průměru (± podle vyplněnosti profilu:
jen průměr ± 15 %, všechno ± 5 %) a kolik algoritmů metody už umíš.

**Jak dobrá je metoda** (výsledek testu, `sim/report.js`): index rychlosti (CFOP = 100), krátké
shrnutí, tabulka proti CFOP, Roux a ZZ spočteným stejným modelem skladače (čas, tahy skladače,
pauzy na rozpoznání, ergonomie, počet zastavení, algoritmy k naučení – s pořadím), čas na třech
úrovních skladače (špička, ~10 s, ~20 s), jednotlivá složení (nejlepší, 1 z 10, medián, 9 z 10,
nejhorší, histogram, jak často porazí průměrné CFOP), přesnost průměru (kolik zamíchání na
± 0,05 s) a „Kde je rezerva“ – nejpomalejší kroky rozložené na rozpoznání a provedení s tím, kolik
ušetří o 10 % méně tahů nebo poloviční rozpoznání. Metodu, která ještě nesloží celou kostku,
se vestavěnými nesrovnává.

## Vymyslet metodu

Metoda → **Vymyslet** (`ui/inventor.js`, nápady `sim/inventor.js` a `sim/originals.js`): aplikace
vymýšlí celé metody dvěma způsoby:

- **z osvědčených kroků** – začátek (kříž, X-kříž, EOLine, EO-kříž, bloky Petrus, první blok
  Roux), střed (páry ⟨R U L F⟩, poloviny F2L, bloky ZZ, ZBLS, druhý blok, hybrid Roux + ZZ…)
  a konec (OLL/PLL, 2-look, OLLCP, OCLL/PLL, COLL/EPLL, ZBLL, CMLL/LSE…); kameny na sebe
  navazují podle toho, co je po nich hotové (natočené hrany, volný střed pro tahy M). Vzniknou
  známé metody (CFOP, ZZ, Petrus, Roux…) i nové kombinace,
- **úplně originální** – nové kroky podle principů, jak skladači přemýšlejí: blok rostoucí
  z různých zárodků po souvislých kusech (2–4 dílky), dva bloky po stranách s volným středem
  a koncem tahy M v různých podobách, rohy napřed (pak hrany tahy se středy), nejdřív natočit
  všechno a pak jen permutovat, hrany napřed (kříž a pás v různém pořadí, rohy se vkládají),
  natočení hran vložené kamkoli (i s posledním kusem jako ZBLS), neobvyklé konce (CLL + ELL,
  nejdřív hrany…). Intuitivní krok (kromě prvního, plánovaného v inspekci) skládá nejvýš ~5
  nových dílků – víc člověk naráz neudrží v hlavě. Každé „Vymyslet“ dá jiné nápady (150 na
  hledání).

Přání: klepnutím (chci → nechci → jedno) nebo vlastními slovy („baví mě EO jako u ZZ, nechci
tahy M, málo algoritmů“), rozpočet algoritmů. Nápady se seřadí podle odhadu bez simulace:
tahy kroku podle počtu nových dílků a toho, jak je kostka už plná (kalibrace na testech ~70
metod: ±0,9 tahu u intuitivních kroků, čas metody ±0,35 s, korelace 0,91). Pak hledá ve třech
kolech:

1. **prosívání** – dvojnásobek nápadů (různorodě, polovina originálních) na 3 zamícháních,
2. **test** – nejlepší na všech zamícháních (první tři má worker spočítané z prosívání),
3. **vylepšování a křížení** – střídavě nejlepší metoda a nejlepší originální (i originální
   nápad dostane šanci se vyladit):
   - objevitel (`sim/discover.js`) navrhne úpravy (spojit, rozdělit, prohodit, natočit hrany
     jinde, jiný konec, volnost…); v každém druhu ta nejslibnější podle odhadu bez simulace,
     8 se proseje a dvě nejslibnější se otestují pořádně,
   - křížení (`crossover`): začátek otestované metody a konec kterékoli vymyšlené, když je po
     obou začátcích na kostce hotové přesně totéž (třeba první dvě vrstvy s natočenými
     hranami); 4 nejslibnější podle odhadu (`guidePrior`: tahy + odhad případů) se prosejí,
   - nová metoda zůstane, jen když párově (na stejných zamícháních) porazí rodiče v čase +
     učení, a v dalším kole se vylepšuje dál.

Každá metoda má vysvětlení (u vylepšených i co se změnilo a proč) a jde uložit jako nová
metoda. Nejlepší nálezy (8) si aplikace pamatuje i mezi hledáními.

## Vizuální metronom

Timer → **Metronom** (`ui/metronome.js`, logika `timer/metronome.js`): telefon pod kostkou,
celá obrazovka bliká v tempu – na každé bliknutí jeden tah, bez zastavení. Tempo (tahů/s),
zrychlování (stálé / každých N s o krok / „když stíhám“ – s chytrou kostkou: aspoň 80 % tahů
na bliknutí = rychleji, pod 60 % = pomaleji), strop, barva bliknutí, volitelně cvaknutí.
Tah počítá jako „na bliknutí“, když padne do čtvrtiny periody od úderu (U2 = jeden tah).
Dosažené tempo se zapamatuje jako výchozí, když ho chytrá kostka potvrdí, jinak jedním klepnutím. Displej nezhasne (Wake Lock), klepnutí = pauza.

Aplikace funguje i offline a jde nainstalovat na plochu (PWA) – celá, včetně hledání
algoritmů, generátoru sad a testu metody (všechno počítá prohlížeč: WebAssembly ve
workerech, žádný server), se stejnými výsledky jako online. `sw.js`: instalace uloží
všechny soubory verze ze seznamu `precache.json` (každý zvlášť, s opakováním) a starou
verzi smaže, až když je nová celá (značka `__complete__`) – nepovedená aktualizace na
slabém signálu tak offline režim nerozbije. Soubory se pak berou z uložené verze (žádné
čekání na síť), nová verze se projeví při dalším otevření. Nastavení → Bez internetu
ukáže, jestli je aplikace uložená celá. Data se ukládají v prohlížeči (localStorage,
s žádostí o trvalé úložiště); zálohu jde stáhnout a obnovit v nastavení. Testy:
`e2e/offline.test.mjs` (Lab, generátor, test metody, timer bez sítě) a
`e2e/offline-update.test.mjs` (aktualizace přerušená výpadkem).

## Velké kostky v Labu (4×4, 5×5)

`src/puzzles/bigcube.js`: geometrie N×N z nálepek (jako Skewb a Pyraminx), tahy podle WCA –
R (vnější), Rw = r (dvě vrstvy), 2R (vnitřní řez), na 5×5 i 3Rw a 3R, otočení x y z; plošná
síť. Středy stejné barvy (a druhu – na 5×5 „x“ a „t“) jsou zaměnitelné: `puzzle.identical`
a `expandIdentical` (core/constraints.js) je v cíli převede na skupinová pravidla, takže
„středy hotové“ splní kterékoli středy té barvy (v cíli i v databázích hledání). Dvě křídla
hrany mají stejné barvy – rozpoznání dílků (core/task.js) je rozliší podle toho, kam se
jejich nálepka tahy vůbec může dostat. Předvolby tahů: parita (R U Rw Uw 2R), vnější +
široké, řezy, středy. PLL parita 4×4 se najde za vteřinu (`2R2 U2 2R2 Uw2 2R2 Uw2` a další);
OLL parita (15+ tahů) je na obecné hledání hodně dlouhá.

## Moje kostka (Lab)

Lab → Start → **Moje kostka**: Start = kostka v ruce – nafocená kamerou (stěna po stěně, jako
dřív; teď i 4×4 a 5×5), nebo stav připojené chytré kostky; Cíl = složená kostka. Pak
**Nejkratší řešení** (two-phase, kolem 20 tahů) nebo **Složit mou metodou**: aktivní metoda
krok po kroku stejným řešičem jako test metody (ve workeru) – řešení jde do výsledků
(přehrávač tah po tahu), stav ukáže, co se dělá v každém kroku.

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

## Test metody: neutralita a chybějící algoritmy

- **Barevná neutralita** (Otestovat → Další nastavení): „dvě barvy dole“ = první krok
  smí skončit s tvou barvou dole i s tou naproti (bílá i žlutá), test u každého zamíchání
  vybere lepší (jako při prohlídce); „kterákoli barva“ = plná neutralita. Volnost
  jednotlivých kroků se dál nastavuje v Sestavit.
- **Semínko zamíchání**: číslo, ze kterého vznikají náhodná zamíchání – stejné semínko =
  stejná zamíchání (férové porovnání).
- Krok hotový až na natočení vrstvy (AUF/ADF) je **přeskočení** (stojí jen čas natočení).
- **Případy bez algoritmu**: obrázek případu před krokem, kolikrát v testu přišel, co v něm
  našlo hledání a tlačítko „Otevřít v Labu“ (případ jako zadání – najdeš algoritmus
  a uložíš ho do sady).

## Statistika sady

Výběr sady (Trenažér, Lab) → **Statistika sady…**:
- průměrná délka (STM, HTM), nejkratší–nejdelší, a kolik tahů v průměru točíš při
  složení (délky vážené šancí případů),
- **šance případu** (1/N a %): kolik podob případ má po natočení U před a po algoritmu,
  vůči ostatním případům sady (+ přeskočení). Pro úplnou sadu přesná (OLL 1/54, 1/108,
  1/216; PLL Aa 1/18, E 1/36, H 1/72 – ověřeno testem), pro sady z generátoru se ukládá
  přesná šance z výčtu stavů,
- **které tahy sada točí** (R, U, M, S, r…) v procentech, vážené šancí, podíl dvojitých
  tahů a rotace – na první pohled je vidět, jestli sada stojí na tazích, které nechceš.

## Kopie metod, předlohy a kopírování sad

- **Kopírovat sady algoritmů** (Sestavit → Nastavení metody, nabídka Metoda, nebo výběr
  sady v Labu/Trenažéru): vybereš cílovou metodu (i novou) a zaškrtáš sady z ostatních
  metod. Algoritmy se zkopírují, originály zůstanou. „Moje algoritmy“ jdou do „Moje
  algoritmy“ cíle, ostatní sady vzniknou nové; co už v cílové sadě je, se nezdvojí.
- **Duplikovat metodu**: kopie postupu (kroky i jejich nastavení), sad a algoritmů –
  upravuješ kopii, originál zůstane.
- **Uložit jako předlohu**: uloží současnou podobu metody (zmrazenou) mezi *Moje
  předlohy* v Sestavit → šablony, vedle CFOP, Roux, ZZ… Z předlohy jde kdykoli vytvořit
  novou metodu. Předlohy jsou i v záloze dat.

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

Zakázaný tah se nepropašuje složením z povolených: když v sadě chybí třeba M2, řešení s
R2 r2 (= M2), R r' (= M) nebo L' l se zahodí (`hiddenMove` v `src/search/improve.js`) – stejně
pro E, S, rotace i široké tahy. R R (= R2) zůstává, to je jen jinak zapsaný stejný tah.

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
       + přehmaty zápěstí         (víc než 2 čtvrtotáčky R/L jedním směrem; R2 jde točit
                                   oběma směry, takže R2 … R2 je tam a zpátky bez přehmatu)
       + změny úchopu             (přechody F ↔ D ↔ B ↔ L mimo home grip)
       + návaznost (prstoklad)    (stejný prst, dva tahy jednou rukou, M hned po D/E a naopak)
       − bonusy za triggery       (R U R' U', R' F R F', R U R', …)
```

**Prstoklad** (`flow.js`): každý prstový tah má možnosti provedení (ruka, prst, cena podle polohy
zápěstí) a vybere se ta, která je nejlevnější i s návazností na předchozí tah – když jde tah
druhou rukou skoro stejně dobře, ruce se prostřídají. Lab → Tahy a váhy → **Můj prstoklad**:
u každého prstového tahu (U, U', F, D', M, S…) jde nastavit, kterou rukou ho děláš, a hodnocení
i hledání pak počítá s tvým rozdělením. V hodnocení algoritmů je pod každým tahem ruka (P / L).

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
