// Vymýšlení metod (Metoda → Vymyslet): metoda se skládá ze stavebních kamenů, které
// skladači opravdu používají – začátek (kříž, X-kříž, EOLine, EO-kříž, bloky Petrus,
// první blok Roux), střed (páry, poloviny F2L, bloky ZZ, ZBLS, druhý blok…) a konec
// poslední vrstvy (OLL/PLL, 2-look, OCLL/PLL, COLL/EPLL, ZBLL, CMLL/LSE…). Kameny na sebe
// navazují podle toho, co je po nich hotové (kříž, levý blok, natočené hrany, volné tahy M),
// takže vzniknou známé metody (CFOP, ZZ, Petrus, Roux) i nové kombinace (např. první blok
// Roux + EOLine + ZBLL). Přání („baví mě EO jako u ZZ“, „žádné tahy M“, „málo algoritmů“)
// metody vyberou, odhad času a počet algoritmů je seřadí a nejslibnější pak otestuje
// simulace (ui/inventor.js). Kroky jsou zadané v pohledu metody (dole D, vpředu F) jako
// šablony (sim/templates.js) – metoda se uloží jako každá jiná.

import { CROSS, E, UE, UC, PAIRS, own, oriented, custom, TEMPLATES } from './templates.js';
import { stepEstimate, LEVELS } from './simulate.js';
import { originalMethods } from './originals.js';

const EDGES = [...CROSS, ...E, ...UE];
const LEFT = ['DLF', 'DBL', 'DL', 'FL', 'BL'], RIGHT = ['DFR', 'DRB', 'DR', 'FR', 'BR'];
const pair = ([c, e], k, extra = {}) => ({ title: `Pár ${k}`, cells: own([c, e]), sim: { free: 'side', recog: 0.4, ...extra }, est: 7 });
const RULF = custom('R', 'U', 'L', 'F'), RUL = custom('R', 'U', 'L');

/** Přání: štítky kamenů a slova, podle kterých je pozná text. */
export const WISHES = {
  eo: { label: 'EO (natočit hrany) jako u ZZ', words: ['eo', 'zz', 'eoline', 'eocross', 'eo-kříž', 'eo kříž', 'natočení hran', 'natočit hrany', 'natocit hrany', 'zbls'] },
  blocks: { label: 'Bloky (Roux, Petrus)', words: ['blok', 'bloky', 'roux', 'petrus', '2x2', '2×2', '1x2x3', '1×2×3', '2x2x3', '2×2×3'] },
  cross: { label: 'Kříž a páry (CFOP)', words: ['kříž', 'kriz', 'cross', 'cfop', 'páry', 'pary', 'f2l'] },
  m: { label: 'Tahy M (konec Roux)', words: ['tahy m', 'tah m', 'm-slice', 'm slice', 'lse', 'roux', 'm2', "m'"] },
  rul: { label: 'Točit hlavně R U L (bez rotací)', words: ['r u l', 'rul', 'ru ', 'bez rotac', 'ergonom', 'plynul'] },
  ll1: { label: 'Celá poslední vrstva naráz (ZBLL, 1LLL)', words: ['zbll', '1lll', 'naráz', 'naraz', 'jedním algoritmem'] },
};

/** Rozpoznání přání v textu: { want: Set, avoid: Set, budget? } („bez“, „nechci“, „ne“ = vyhnout se). */
export function parseWishes(text) {
  const t = ` ${String(text ?? '').toLowerCase().replace(/[.,;!?()]/g, ' ')} `;
  const want = new Set(), avoid = new Set();
  let budget = null;
  for (const [id, w] of Object.entries(WISHES)) {
    for (const word of w.words) {
      const at = t.indexOf(word);
      if (at < 0) continue;
      const before = t.slice(Math.max(0, at - 14), at);
      (/(bez|nechci|ne |nemám rád|nemam rad|nebaví|nebavi|žádné|zadne)\s*\S*\s*$/.test(before) ? avoid : want).add(id);
      break;
    }
  }
  if (/málo alg|malo alg|bez alg|nechci (se )?(moc )?učit|jednoduch|začátečn|zacatecn/.test(t)) budget = 30;
  else if (/hodně alg|hodne alg|klidně hodně|klidne hodne|nevadí.*alg/.test(t)) budget = Infinity;
  for (const id of avoid) want.delete(id);
  return { want, avoid, budget };
}

// --- stavební kameny ----------------------------------------------------------------------
// start: { gives } · mid: { after: [start], eo?: true, roux?: true } · end: { needs: {eo, roux} }
// algs = počet případů (algoritmů k naučení) podle komunity; est = odhad tahů kroku

export const STARTS = [
  { id: 'cross', label: 'Kříž', tags: ['cross'], eo: false, steps: [{ title: 'Kříž', cells: own(CROSS), sim: { recog: 0 }, est: 7 }],
    why: 'Kříž je nejpřehlednější začátek: čtyři hrany dole, dá se celý naplánovat v inspekci.' },
  { id: 'xcross', label: 'X-kříž', tags: ['cross'], eo: false, steps: [{ title: 'X-kříž', cells: own([...CROSS, 'DFR', 'FR']), sim: { free: 'side', recog: 0 }, est: 10 }],
    why: 'Kříž i s prvním párem naráz (jako špička): o krok a jednu pauzu méně, ale náročnější plánování v inspekci.' },
  { id: 'eoline', label: 'EOLine', tags: ['eo'], eo: true, steps: [{ title: 'EOLine', cells: { ...oriented(EDGES), ...own(['DF', 'DB']) }, sim: { recog: 0 }, est: 7 }],
    why: 'EOLine natočí všechny hrany a postaví „čáru“ dole – celý zbytek pak jde bez F a B, jen R U L, bez rotací.' },
  { id: 'eocross', label: 'EO-kříž', tags: ['eo', 'cross'], eo: true, steps: [{ title: 'EO-kříž', cells: { ...oriented(EDGES), ...own(CROSS) }, sim: { recog: 0 }, est: 10 }],
    why: 'Kříž a k tomu natočené hrany: páry pak jdou čistě R U L (žádná otočená hrana) a konec má méně případů.' },
  { id: 'petrus', label: 'Blok 2×2×2 → 2×2×3', tags: ['blocks'], eo: false, steps: [
    { title: 'Blok 2×2×2', cells: own(['DBL', 'DB', 'DL', 'BL']), sim: { recog: 0, kind: 'blocks' }, est: 7 },
    { title: 'Blok 2×2×3', cells: own(['DLF', 'DF', 'FL']), sim: { recog: 0.3, kind: 'blocks' }, est: 7 }],
    why: 'Bloky jako u Petruse: málo tahů, protože se staví dílky, které spolu drží, a hodně volného místa k tahům.' },
  { id: 'fb', label: 'První blok 1×2×3', tags: ['blocks'], eo: false, steps: [
    { title: 'První blok', cells: own(LEFT), sim: { ...custom('R', 'L', 'U', 'D', 'F', 'B', 'r', 'M'), recog: 0, kind: 'blocks' }, est: 8 }],
    why: 'První blok jako u Roux: 1×2×3 vlevo dole, pravá strana i střed zůstávají volné pro rychlé tahy R, r, U a M.' },
];

export const MIDS = [
  { id: 'pairs4', label: 'páry ⟨R U L F⟩', tags: ['cross'], after: ['cross'], steps: PAIRS.map((p, k) => pair(p, k + 1, RULF)),
    why: 'Čtyři páry do kteréhokoli slotu, jak to dělá CFOP – intuitivní, každý pár zvlášť.' },
  { id: 'halves', label: 'poloviny F2L', tags: ['cross', 'blocks'], after: ['cross'], steps: [
    { title: 'Levá polovina F2L', cells: own(['DLF', 'FL', 'DBL', 'BL']), sim: { free: 'side', recog: 0.5, kind: 'blocks' }, est: 13 },
    { title: 'Pravá polovina F2L', cells: own(['DFR', 'FR', 'DRB', 'BR']), sim: { recog: 0.5, kind: 'blocks', ...RULF }, est: 13 }],
    why: 'Dva páry naráz jako blok 1×2×3: jen dvě pauzy místo čtyř, plánuje se víc dopředu.' },
  { id: 'pairs3zbls', label: 'páry + ZBLS', tags: ['cross', 'eo'], after: ['cross'], eo: true, steps: [
    ...PAIRS.slice(0, 3).map((p, k) => pair(p, k + 1, RULF)),
    { title: 'Poslední pár + EO (ZBLS)', cells: { ...own(PAIRS[3]), ...oriented(UE) }, sim: { free: 'side', recog: 0.5, kind: 'alg' }, est: 10, algs: 302 }],
    why: 'Při posledním páru se rovnou natočí hrany nahoře (ZBLS): konec pak má natočené hrany a jde ZBLL nebo COLL.' },
  { id: 'pairs3', label: 'páry ⟨R U L F⟩', tags: ['cross'], after: ['xcross'], steps: PAIRS.slice(1).map((p, k) => pair(p, k + 2, RULF)),
    why: 'Zbylé tři páry po X-kříži.' },
  { id: 'pairs2zbls', label: 'páry + ZBLS', tags: ['cross', 'eo'], after: ['xcross'], eo: true, steps: [
    ...PAIRS.slice(1, 3).map((p, k) => pair(p, k + 2, RULF)),
    { title: 'Poslední pár + EO (ZBLS)', cells: { ...own(PAIRS[3]), ...oriented(UE) }, sim: { free: 'side', recog: 0.5, kind: 'alg' }, est: 10, algs: 302 }],
    why: 'Po X-kříži dva páry a poslední pár rovnou s natočením hran (ZBLS).' },
  { id: 'zzblocks', label: 'bloky ⟨R U L⟩', tags: ['blocks', 'eo', 'rul'], after: ['eoline'], steps: [
    { title: 'Levý blok', cells: own(LEFT), sim: { ...RUL, recog: 0.3, kind: 'blocks' }, est: 12 },
    { title: 'Pravý blok', cells: own(RIGHT), sim: { ...RUL, recog: 0.3, kind: 'blocks' }, est: 12 }],
    why: 'Bloky jako ZZ: s natočenými hranami jen tahy R U L, bez rotací – plynulé točení.' },
  { id: 'zzpairs', label: 'kříž + páry ⟨R U L⟩', tags: ['cross', 'rul'], after: ['eoline'], steps: [
    { title: 'Dokončit kříž', cells: own(['DL', 'DR']), sim: { ...RUL, recog: 0.2 }, est: 5 },
    ...PAIRS.map((p, k) => pair(p, k + 1, RUL))],
    why: 'Po EOLine dokončit kříž a pak páry jen R U L – CFOP bez otočených hran a bez rotací.' },
  { id: 'pairs4rul', label: 'páry ⟨R U L⟩', tags: ['cross', 'rul'], after: ['eocross'], steps: PAIRS.map((p, k) => pair(p, k + 1, RUL)),
    why: 'Hrany jsou natočené, takže každý pár jde jen R U L – žádné F, žádné otočené hrany.' },
  { id: 'halvesrul', label: 'poloviny F2L ⟨R U L⟩', tags: ['blocks', 'rul'], after: ['eocross'], steps: [
    { title: 'Levá polovina F2L', cells: own(['DLF', 'FL', 'DBL', 'BL']), sim: { ...RUL, free: 'side', recog: 0.5, kind: 'blocks' }, est: 13 },
    { title: 'Pravá polovina F2L', cells: own(['DFR', 'FR', 'DRB', 'BR']), sim: { ...RUL, recog: 0.5, kind: 'blocks' }, est: 13 }],
    why: 'Po EO-kříži dva bloky po dvou párech, jen R U L.' },
  { id: 'petruseo', label: 'EO + F2L ⟨R U⟩', tags: ['blocks', 'eo', 'rul'], after: ['petrus'], eo: true, steps: [
    { title: 'EO', cells: oriented(['DR', 'FR', 'BR', ...UE]), sim: { recog: 0.4 }, est: 5 },
    { title: 'F2L', cells: own(RIGHT), sim: { moves: 'RU', recog: 0.3, kind: 'blocks' }, est: 14 }],
    why: 'Jako Petrus: natočit hrany a pak dostavět F2L jen tahy R a U – nejpohodlnější tahy, žádné rotace.' },
  { id: 'petrusf2l', label: 'F2L', tags: ['blocks'], after: ['petrus'], steps: [
    { title: 'F2L', cells: own(RIGHT), sim: { ...RULF, recog: 0.3, kind: 'blocks' }, est: 15 }],
    why: 'Po bloku 2×2×3 rovnou dostavět F2L bez natáčení hran (otočené hrany vyřeší konec).' },
  { id: 'rouxsb', label: 'druhý blok', tags: ['blocks', 'm'], after: ['fb'], roux: true, steps: [
    { title: 'Druhý blok', cells: own(RIGHT), sim: { ...custom('R', 'r', 'U', 'M'), recog: 0.3, kind: 'blocks' }, est: 12 }],
    why: 'Druhý blok jako Roux: tahy R, r, U a M, střed zůstává volný – konec pak dělá tahy M.' },
  { id: 'fbeoline', label: 'EO + čára, druhý blok ⟨R U L⟩', tags: ['blocks', 'eo', 'rul'], after: ['fb'], eo: true, steps: [
    { title: 'EO + čára', cells: { ...oriented(EDGES), ...own(['DF', 'DB']) }, sim: { moves: 'facesM', recog: 0.4 }, est: 8 },
    { title: 'Druhý blok', cells: own(RIGHT), sim: { ...RUL, recog: 0.3, kind: 'blocks' }, est: 11 }],
    why: 'Hybrid Roux a ZZ: po prvním bloku natočit hrany a postavit čáru (DF, DB), druhý blok pak jen R U L a konec s natočenými hranami.' },
  { id: 'fbline', label: 'čára + druhý blok', tags: ['blocks'], after: ['fb'], steps: [
    { title: 'Čára (DF, DB)', cells: own(['DF', 'DB']), sim: { moves: 'facesM', recog: 0.2 }, est: 5 },
    { title: 'Druhý blok', cells: own(RIGHT), sim: { ...RULF, recog: 0.3, kind: 'blocks' }, est: 12 }],
    why: 'Po prvním bloku doplnit hrany dole a druhý blok – pak klasický konec poslední vrstvy.' },
  { id: 'rouxsbeo', label: 'druhý blok + EO a čára ⟨M U⟩', tags: ['blocks', 'm', 'eo'], after: ['fb'], eo: true, steps: [
    { title: 'Druhý blok', cells: own(RIGHT), sim: { ...custom('R', 'r', 'U', 'M'), recog: 0.3, kind: 'blocks' }, est: 12 },
    { title: 'EO + čára ⟨M U⟩', cells: { ...oriented(EDGES), ...own(['DF', 'DB']) }, sim: { ...custom('M', 'U'), recog: 0.4 }, est: 8 }],
    why: 'Bloky jako Roux, pak tahy M a U natočit hrany a postavit čáru – konec jako u ZZ (natočené hrany, třeba ZBLL).' },
];

export const ENDS = [
  { id: 'ollpll', label: 'OLL + PLL', needs: { eo: false }, steps: [
    { title: 'OLL', cells: oriented([...UE, ...UC]), sim: { recog: 0.5, kind: 'alg' }, est: 10, algs: 57 },
    { title: 'PLL', cells: own([...UE, ...UC]), sim: { recog: 0.6, kind: 'alg' }, est: 12, algs: 21 }],
    why: 'Klasický konec: natočit vrstvu (57 případů), pak ji složit (21).' },
  { id: 'twolook', label: '2-look OLL + PLL', needs: { eo: false }, steps: [
    { title: 'Hrany nahoře natočit', cells: oriented(UE), sim: { recog: 0.3, kind: 'alg' }, est: 7, algs: 3 },
    { title: 'Rohy nahoře natočit', cells: oriented(UC), sim: { recog: 0.4, kind: 'alg' }, est: 9, algs: 7 },
    { title: 'Rohy na místa', cells: own(UC), sim: { recog: 0.4, kind: 'alg' }, est: 11, algs: 2 },
    { title: 'Hrany na místa', cells: own(UE), sim: { recog: 0.4, kind: 'alg' }, est: 9, algs: 4 }],
    why: 'Konec na čtyři kroky s 16 algoritmy – rychle naučitelný, pomalejší (víc pauz a tahů).' },
  { id: 'ollcp', label: 'OLLCP + EPLL', needs: { eo: false }, steps: [
    { title: 'OLLCP', cells: { ...oriented(UE), ...own(UC) }, sim: { recog: 0.7, kind: 'alg' }, est: 12, algs: 331 },
    { title: 'EPLL', cells: own(UE), sim: { recog: 0.4, kind: 'alg' }, est: 9, algs: 4 }],
    why: 'Natočení i rohy naráz (OLLCP), pak jen hrany (4 případy) – hodně algoritmů, ale konec je skoro vždy rychlý.' },
  { id: '1lll', label: 'celá vrstva naráz (1LLL)', needs: {}, steps: [
    { title: 'Poslední vrstva (1LLL)', cells: own([...UE, ...UC]), sim: { recog: 0.9, kind: 'alg' }, est: 14, algs: 3915 }],
    why: 'Celá poslední vrstva jedním algoritmem – teoretický strop: jedna pauza, ale tisíce algoritmů.' },
  { id: 'ocllpll', label: 'OCLL + PLL', needs: { eo: true }, steps: [
    { title: 'OCLL', cells: oriented(UC), sim: { recog: 0.4, kind: 'alg' }, est: 9, algs: 7 },
    { title: 'PLL', cells: own([...UE, ...UC]), sim: { recog: 0.6, kind: 'alg' }, est: 12, algs: 21 }],
    why: 'Hrany už jsou natočené, takže stačí natočit rohy (7 případů) a PLL (21).' },
  { id: 'collepll', label: 'COLL + EPLL', needs: { eo: true }, steps: [
    { title: 'COLL', cells: own(UC), sim: { recog: 0.6, kind: 'alg' }, est: 11, algs: 42 },
    { title: 'EPLL', cells: own(UE), sim: { recog: 0.4, kind: 'alg' }, est: 9, algs: 4 }],
    why: 'Rohy nahoře natočit i umístit naráz (COLL, 42), pak jen hrany (4 případy, rychlé U-permy).' },
  { id: 'zbll', label: 'ZBLL', needs: { eo: true }, steps: [
    { title: 'ZBLL', cells: own([...UE, ...UC]), sim: { recog: 0.8, kind: 'alg' }, est: 13, algs: 493 }],
    why: 'S natočenými hranami celá vrstva jedním algoritmem (ZBLL, 493) – jedna pauza, ale dlouhé učení.' },
  { id: 'eo2look', label: 'OCLL + rohy + hrany', needs: { eo: true }, steps: [
    { title: 'OCLL', cells: oriented(UC), sim: { recog: 0.4, kind: 'alg' }, est: 9, algs: 7 },
    { title: 'Rohy na místa', cells: own(UC), sim: { recog: 0.4, kind: 'alg' }, est: 11, algs: 2 },
    { title: 'Hrany na místa', cells: own(UE), sim: { recog: 0.4, kind: 'alg' }, est: 9, algs: 4 }],
    why: 'Konec se 13 algoritmy pro natočené hrany – jednoduchý na učení.' },
  { id: 'rouxend', label: 'CMLL + LSE', tags: ['m'], needs: { roux: true }, steps: [
    { title: 'CMLL', cells: own(UC), sim: { recog: 0.6, kind: 'alg' }, est: 10, algs: 42 },
    { title: 'LSE', cells: own([...UE, 'DF', 'DB']), sim: { ...custom('M', 'U'), recog: 0.4 }, est: 13 }],
    why: 'Konec Roux: rohy nahoře (CMLL, 42) a zbylých 6 hran tahy M a U – málo tahů.' },
  { id: 'rouxend3', label: 'CMLL + LSE po částech', tags: ['m'], needs: { roux: true }, steps: [
    { title: 'CMLL', cells: own(UC), sim: { recog: 0.6, kind: 'alg' }, est: 10, algs: 42 },
    { title: 'LSE – natočit hrany', cells: oriented([...UE, 'DF', 'DB']), sim: { ...custom('M', 'U'), recog: 0.3 }, est: 5 },
    { title: 'LSE – UL a UR', cells: own(['UL', 'UR']), sim: { ...custom('M', 'U'), recog: 0.3 }, est: 5 },
    { title: 'LSE – zbytek', cells: own([...UE, 'DF', 'DB']), sim: { ...custom('M', 'U'), recog: 0.2 }, est: 4 }],
    why: 'Konec Roux, jak se ho učí většina: LSE po třech přehledných částech.' },
];

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const START = byId(STARTS), MID = byId(MIDS), END = byId(ENDS);
// známé metody (kameny) – ostatní kombinace jsou nové
const KNOWN = {
  'cross|pairs4|ollpll': 'CFOP', 'cross|pairs4|twolook': 'CFOP pro začátečníky (2-look)', 'eoline|zzblocks|ocllpll': 'ZZ',
  'eoline|zzblocks|zbll': 'ZZ-a (ZBLL)', 'eoline|zzblocks|collepll': 'ZZ s COLL', 'petrus|petruseo|ocllpll': 'Petrus',
  'fb|rouxsb|rouxend': 'Roux', 'fb|rouxsb|rouxend3': 'Roux (LSE po částech)', 'cross|pairs3zbls|zbll': 'CFOP se ZBLS a ZBLL',
  'eocross|pairs4rul|ocllpll': 'EOCross (ZZ-CT styl)', 'xcross|pairs3|ollpll': 'CFOP s X-křížem',
};

/** Všechny metody z kamenů: { key, start, mid, end, name, known, steps, algs, tags }. */
export function allMethods() {
  const out = [];
  for (const s of STARTS) for (const m of MIDS.filter((x) => x.after.includes(s.id))) {
    const eo = !!(s.eo || m.eo), roux = !!m.roux;
    for (const e of ENDS) {
      if (e.needs.roux !== undefined ? e.needs.roux !== roux : roux) continue;
      if (e.needs.eo !== undefined && e.needs.eo !== eo) continue;
      const key = `${s.id}|${m.id}|${e.id}`;
      const steps = [...s.steps, ...m.steps, ...e.steps];
      const algs = steps.reduce((a, x) => a + (x.algs ?? 0), 0);
      const tags = new Set([...(s.tags ?? []), ...(m.tags ?? []), ...(e.tags ?? []), ...(e.id === 'zbll' || e.id === '1lll' ? ['ll1'] : [])]);
      // M tahy i v kroku s předvolbou facesM / vlastním M
      if (steps.some((x) => x.sim?.moves === 'facesM' || x.sim?.custom?.includes('M'))) tags.add('m');
      if (eo) tags.add('eo');
      out.push({
        key, start: s, mid: m, end: e, eo, steps, algs, tags,
        known: KNOWN[key] ?? null,
        name: KNOWN[key] ?? `${s.label} → ${m.label} → ${e.label}`,
      });
    }
  }
  return out;
}

/** Odhad času složení (s) podle odhadu tahů kroků a úrovně skladače (bez simulace). */
export function priorTime(method, level = 'pro') {
  return method.steps.reduce((a, x) => a + stepEstimate({ length: x.est ?? 8, source: 'search' }, { kind: x.sim?.kind ?? 'intuitive', recog: x.sim?.recog ?? 0, level }).time, 0);
}

export const ALG_COST = 0.002; // s za algoritmus (pořadí: čas + cena učení)

/**
 * Metody podle přání, seřazené podle odhadu (čas + cena učení).
 * @param {{want?: Iterable<string>, avoid?: Iterable<string>, budget?: number, level?: string}} wishes
 * @returns {{list: object[], relaxed: boolean}} relaxed = přání nešla splnit všechna (vybrané nejbližší)
 */
export function inventMethods({ want = [], avoid = [], budget, level = 'pro', source = 'mix', seed = Date.now(), originals = 30 } = {}) {
  const W = [...want], A = [...avoid];
  budget = budget ?? Infinity;
  // z osvědčených kamenů, originální (nové kroky), nebo obojí
  const base = [...(source !== 'original' ? allMethods() : []), ...(source !== 'known' ? originalMethods(seed, originals) : [])];
  const all = base.map((m) => ({ ...m, prior: priorTime(m, level), score: priorTime(m, level) + ALG_COST * m.algs }));
  const fits = (m) => W.every((t) => m.tags.has(t)) && !A.some((t) => m.tags.has(t)) && m.algs <= budget;
  let list = all.filter(fits);
  let relaxed = false;
  if (!list.length) {
    // nejbližší: co nejvíc splněných přání, „nechci“ a rozpočet platí vždy, když jde
    relaxed = true;
    const hits = (m) => W.filter((t) => m.tags.has(t)).length;
    const pool = all.filter((m) => !A.some((t) => m.tags.has(t)) && m.algs <= budget);
    const src = pool.length ? pool : all;
    const best = Math.max(...src.map(hits));
    list = src.filter((m) => hits(m) === best);
  }
  list.sort((a, b) => a.score - b.score);
  return { list, relaxed };
}

/** Vysvětlení metody lidsky: proč tyhle kroky a co přinesou. */
export function story(m) {
  if (m.original) {
    const algs = m.algs ? `Celkem asi ${m.algs} algoritmů k naučení (odhad).` : 'Bez algoritmů – všechno intuitivně.';
    return `${m.why} ${algs} Originální nápad – takovou metodu nikdo nepoužívá, test ukáže, jestli má smysl.`;
  }
  const parts = [m.start.why, m.mid.why, m.end.why];
  const algs = m.algs ? `Celkem asi ${m.algs} algoritmů k naučení.` : 'Bez algoritmů – všechno intuitivně.';
  const kind = m.known ? `Je to známá metoda (${m.known}).` : 'Tuhle kombinaci jako hotovou metodu běžně nenajdeš – stojí za vyzkoušení.';
  return `${parts.join(' ')} ${algs} ${kind}`;
}

/** Šablona metody pro uložení (sim/templates.js templateGuide). */
export function toTemplate(m) {
  return {
    id: `inv-${m.key}`, name: m.name,
    intro: story(m),
    steps: m.steps.map(({ est: _, algs: __, why: ___, ...x }) => ({ ...x, sim: { ...(x.sim ?? {}) } })),
  };
}

export { LEVELS, TEMPLATES };
