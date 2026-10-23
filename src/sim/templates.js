// Šablony metod pro sestavení (Metoda → Sestavit → Začít ze šablony): kroky v pohledu
// metody (dole = D, vpředu = F) zadané políčko po políčku (core/cells.js) a nastavení
// kroku (volnost, tahy, pomocné algoritmy…). Při vytvoření se místa, dílky i barvy
// převedou na kostku podle držení.

import { piecesWithColors, remapCells } from '../core/cells.js';
import { frameMap, DEFAULT_FRAME } from '../ui/parts.js';

const CROSS = ['DF', 'DR', 'DB', 'DL'], E = ['FR', 'BR', 'BL', 'FL'], UE = ['UF', 'UR', 'UB', 'UL'];
const DC = ['DFR', 'DRB', 'DBL', 'DLF'], UC = ['UFR', 'URB', 'UBL', 'ULF'];
// páry v šabloně každý v jiném slotu (kostka po 4 párech má hotové F2L); volnost
// „na kterémkoli boku“ je stejně pustí do kteréhokoli volného slotu
const PAIRS = [['DFR', 'FR'], ['DLF', 'FL'], ['DRB', 'BR'], ['DBL', 'BL']];
const typeOf = (n) => (n.length === 3 ? 'corner' : 'edge');
/** Vlastní dílky (hotové / natočené jakkoli). */
const own = (names, how = 'solved') => Object.fromEntries(names.map((n) => [n, { own: how }]));
/** Po nálepkách: na straně místa dole (D) / nahoře (U) některá z barev `colors`, jinde cokoli. */
const colorTo = (names, colors) => Object.fromEntries(names.map((n) => [n, { colors: { [n.includes('D') ? 'D' : 'U']: colors } }]));
/** Na místech kterýkoli správně natočený dílek. */
const oriented = (names) => Object.fromEntries(names.map((n) => [n, { pieces: piecesWithColors(typeOf(n)), ori: 'correct' }]));
const custom = (...bases) => ({ moves: 'custom', custom: bases });

export const TEMPLATES = [
  {
    id: 'cfop', name: 'CFOP',
    intro: 'Kříž, čtyři páry (F2L) do kteréhokoli slotu, OLL a PLL.',
    steps: [
      { title: 'Kříž', cells: own(CROSS), sim: { recog: 0 }, text: 'Hrany barvy dole na svá místa.' },
      ...PAIRS.map(([c, e], k) => ({ title: `Pár ${k + 1}`, cells: own([c, e]), sim: { free: 'side', recog: 0.4 }, text: 'Roh a hrana do kteréhokoli volného slotu.' })),
      { title: 'OLL', cells: oriented([...UE, ...UC]), sim: { recog: 0.5, kind: 'alg' } },
      { title: 'PLL', cells: own([...UE, ...UC]), sim: { recog: 0.6, kind: 'alg' } },
    ],
  },
  {
    id: 'roux', name: 'Roux',
    intro: 'Dva bloky 1×2×3, rohy nahoře (CMLL) a zbylé hrany tahy M a U (LSE).',
    steps: [
      { title: 'První blok', cells: own(['DLF', 'DBL', 'DL', 'FL', 'BL']), sim: { ...custom('R', 'L', 'U', 'D', 'F', 'B', 'r', 'M'), recog: 0, kind: 'blocks' } },
      { title: 'Druhý blok', cells: own(['DFR', 'DRB', 'DR', 'FR', 'BR']), sim: { ...custom('R', 'r', 'U', 'M'), recog: 0.3, kind: 'blocks' } },
      { title: 'CMLL', cells: own(UC), sim: { recog: 0.6, kind: 'alg' } },
      { title: 'LSE', cells: own([...UE, 'DF', 'DB']), sim: { ...custom('M', 'U'), recog: 0.4, kind: 'alg' } },
    ],
  },
  {
    id: 'zz', name: 'ZZ',
    intro: 'Natočit všechny hrany a hrany vpředu a vzadu dole (EOLine), bloky tahy R U L, OCLL a PLL.',
    steps: [
      { title: 'EOLine', cells: { ...oriented([...CROSS, ...E, ...UE]), ...own(['DF', 'DB']) }, sim: { recog: 0 } },
      { title: 'Levý blok', cells: own(['DLF', 'DBL', 'DL', 'FL', 'BL']), sim: { moves: 'RUL', recog: 0.3, kind: 'blocks' } },
      { title: 'Pravý blok', cells: own(['DFR', 'DRB', 'DR', 'FR', 'BR']), sim: { moves: 'RUL', recog: 0.3, kind: 'blocks' } },
      { title: 'OCLL', cells: oriented(UC), sim: { recog: 0.5, kind: 'alg' } },
      { title: 'PLL', cells: own([...UE, ...UC]), sim: { recog: 0.6, kind: 'alg' } },
    ],
  },
  {
    id: 'petrus', name: 'Petrus',
    intro: 'Blok 2×2×2, rozšíření na 2×2×3 vlevo, natočení hran (EO), dokončení prvních dvou vrstev tahy R U, OLL a PLL.',
    steps: [
      { title: 'Blok 2×2×2', cells: own(['DBL', 'DB', 'DL', 'BL']), sim: { recog: 0, kind: 'blocks' } },
      { title: 'Blok 2×2×3', cells: own(['DLF', 'DF', 'FL']), sim: { recog: 0.3, kind: 'blocks' } },
      { title: 'EO', cells: oriented(['DR', 'FR', 'BR', ...UE]), sim: { recog: 0.4 } },
      { title: 'F2L', cells: own(['DFR', 'DRB', 'DR', 'FR', 'BR']), sim: { moves: 'RU', recog: 0.3, kind: 'blocks' } },
      { title: 'OLL', cells: oriented([...UE, ...UC]), sim: { recog: 0.5, kind: 'alg' } },
      { title: 'PLL', cells: own([...UE, ...UC]), sim: { recog: 0.6, kind: 'alg' } },
    ],
  },
  {
    id: 'separation', name: 'Separační metoda',
    intro: 'Kříž z kterýchkoli hran barvy dole a nahoře (tou barvou dolů), páry s kterýmkoli takovým rohem, natočení horní vrstvy (OLL), oddělení hran a rohů podle barvy, permutace rohů, jen někdy parita (M2 U2 M2) a nakonec EPBL.',
    steps: [
      { title: 'Kříž', cells: colorTo(CROSS, ['D', 'U']), sim: { recog: 0 }, text: 'Kterékoli 4 hrany s barvou dole nebo nahoře, tou barvou dolů.' },
      ...PAIRS.map(([c, e], k) => ({ title: `Pár ${k + 1}`, cells: { ...colorTo([c], ['D', 'U']), ...own([e]) }, sim: { free: 'side', recog: 0.4 },
        text: 'Kterýkoli roh s barvou dole nebo nahoře (tou barvou dolů) a k němu hrana střední vrstvy na své místo.' })),
      { title: 'OLL', cells: colorTo([...UE, ...UC, ...CROSS, ...DC], ['D', 'U']), sim: { recog: 0.5, kind: 'alg' }, text: 'Barva dole i nahoře na horní a spodní stranu (může být promíchaná).' },
      { title: 'Separace hran', cells: { ...colorTo(CROSS, ['D']), ...colorTo(UE, ['U']) }, sim: { recog: 0.4, kind: 'alg' }, text: 'Hrany barvy dole dolů, barvy nahoře nahoru – pořád natočené.' },
      { title: 'Separace rohů', cells: { ...colorTo(DC, ['D']), ...colorTo(UC, ['U']) }, sim: { recog: 0.4, kind: 'alg' } },
      { title: 'Permutace rohů', cells: own([...UC, ...DC]), sim: { recog: 0.5, kind: 'alg' }, text: 'Rohy na svá místa ve své vrstvě.' },
      { title: 'Parita', cells: {}, sim: { solveBy: 'fixed', fixedAlg: 'M2 U2 M2', when: 'parity', recog: 0.2, kind: 'alg' },
        text: 'Jen když je parita (hrany nahoře i dole prohozené lichým počtem výměn): M2 U2 M2.' },
      { title: 'EPBL', cells: own([...UE, ...CROSS, ...E]), sim: { moves: 'MUD', recog: 0.6, kind: 'alg' },
        text: 'Algoritmus na hrany nahoře i dole najednou.' },
    ],
  },
];

/** Průvodce metody ze šablony (místa, dílky a barvy převedené podle držení). */
export function templateGuide(t, frame = DEFAULT_FRAME, newStep) {
  const map = frameMap(frame);
  return {
    intro: t.intro, frame,
    steps: t.steps.map((x) => ({
      ...newStep(x.title), text: x.text ?? '',
      cells: remapCells(x.cells ?? {}, map),
      ...(x.sim ? { sim: structuredClone(x.sim) } : {}),
    })),
  };
}
