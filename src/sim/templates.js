// Šablony metod pro sestavení (Metoda → Sestavit → Začít ze šablony): kroky v pohledu
// metody (dole = D, vpředu = F) s dílky, pravidly pro skupiny dílků (core/rules.js)
// a nastavením kroku (volnost, tahy, pomocné algoritmy…). Při vytvoření se dílky
// převedou na dílky kostky podle držení.

import { RULE_PRESETS, PLACE_LAYERS } from '../core/rules.js';
import { slotByName } from '../core/geometry.js';
import { frameMap, DEFAULT_FRAME } from '../ui/parts.js';

const rel = (names, style = 'solved') => Object.fromEntries(names.map((n) => [n, style]));
const R = (id, patch = {}) => ({ ...structuredClone(RULE_PRESETS.find((x) => x.id === id).rule), ...patch });
const CROSS = PLACE_LAYERS.edge.D, UE = PLACE_LAYERS.edge.U, E = PLACE_LAYERS.edge.E;
const DC = PLACE_LAYERS.corner.D, UC = PLACE_LAYERS.corner.U;
const custom = (...bases) => ({ moves: 'custom', custom: bases });

export const TEMPLATES = [
  {
    id: 'cfop', name: 'CFOP',
    intro: 'Kříž, čtyři páry (F2L) do kteréhokoli slotu, OLL a PLL.',
    steps: [
      { title: 'Kříž', parts: rel(CROSS), sim: { recog: 0 }, text: 'Hrany barvy dole na svá místa.' },
      ...[1, 2, 3, 4].map((k) => ({ title: `Pár ${k}`, parts: rel(['DFR', 'FR']), sim: { free: 'side', recog: 0.4 }, text: 'Roh a hrana do kteréhokoli volného slotu.' })),
      { title: 'OLL', parts: rel([...UE, ...UC], 'orientation'), sim: { recog: 0.5 } },
      { title: 'PLL', parts: rel([...UE, ...UC]), sim: { recog: 0.6 } },
    ],
  },
  {
    id: 'roux', name: 'Roux',
    intro: 'Dva bloky 1×2×3, rohy nahoře (CMLL) a zbylé hrany tahy M a U (LSE).',
    steps: [
      { title: 'První blok', parts: rel(['DLF', 'DBL', 'DL', 'FL', 'BL']), sim: { ...custom('R', 'L', 'U', 'D', 'F', 'B', 'r', 'M'), recog: 0 } },
      { title: 'Druhý blok', parts: rel(['DFR', 'DRB', 'DR', 'FR', 'BR']), sim: { ...custom('R', 'r', 'U', 'M'), recog: 0.3 } },
      { title: 'CMLL', parts: rel(UC), sim: { recog: 0.6 } },
      { title: 'LSE', parts: rel([...UE, 'DF', 'DB']), sim: { ...custom('M', 'U'), recog: 0.4 } },
    ],
  },
  {
    id: 'zz', name: 'ZZ',
    intro: 'Natočit všechny hrany a hrany vpředu a vzadu dole (EOLine), bloky tahy R U L, OCLL a PLL.',
    steps: [
      { title: 'EOLine', parts: { ...rel([...CROSS, ...E, ...UE], 'orientation'), ...rel(['DF', 'DB']) }, sim: { recog: 0 } },
      { title: 'Levý blok', parts: rel(['DLF', 'DBL', 'DL', 'FL', 'BL']), sim: { moves: 'RUL', recog: 0.3 } },
      { title: 'Pravý blok', parts: rel(['DFR', 'DRB', 'DR', 'FR', 'BR']), sim: { moves: 'RUL', recog: 0.3 } },
      { title: 'OCLL', parts: rel(UC, 'orientation'), sim: { recog: 0.5 } },
      { title: 'PLL', parts: rel([...UE, ...UC]), sim: { recog: 0.6 } },
    ],
  },
  {
    id: 'separation', name: 'Separační metoda',
    intro: 'Kříž z kterýchkoli hran barvy dole a nahoře (barvou dolů), páry s kterýmkoli takovým rohem, natočení horní vrstvy (OLL), oddělení hran a rohů podle barvy, permutace rohů a nakonec parita (M2 U2 M2) a EPBL.',
    steps: [
      { title: 'Kříž', rules: [R('cross-any')], sim: { recog: 0 }, text: 'Kterékoli 4 hrany s barvou dole nebo nahoře, tou barvou dolů.' },
      ...[1, 2, 3, 4].map((k) => ({ title: `Pár ${k}`, parts: rel(['FR']), rules: [R('corner-any')], sim: { free: 'side', recog: 0.4 },
        text: 'Kterýkoli roh s barvou dole nebo nahoře (tou barvou dolů) a k němu hrana střední vrstvy na své místo.' })),
      { title: 'OLL', rules: [R('orient-edges'), R('orient-corners')], sim: { recog: 0.5 }, text: 'Barva dole i nahoře na horní a spodní stranu (může být promíchaná).' },
      { title: 'Separace hran', rules: [R('sep-edges-d'), R('sep-edges-u')], sim: { recog: 0.4 }, text: 'Hrany barvy dole dolů, barvy nahoře nahoru – pořád natočené.' },
      { title: 'Separace rohů', rules: [R('sep-corners-d'), R('sep-corners-u')], sim: { recog: 0.4 } },
      { title: 'Permutace rohů', parts: rel([...UC, ...DC]), sim: { recog: 0.5 }, text: 'Rohy na svá místa ve své vrstvě.' },
      { title: 'Parita + EPBL', parts: rel([...UE, ...CROSS, ...E]), sim: { moves: 'MUD', helpers: 'M2 U2 M2', recog: 0.6 },
        text: 'Lichý případ nejdřív M2 U2 M2, pak algoritmus na hrany nahoře i dole.' },
    ],
  },
];

/** Průvodce metody ze šablony (dílky převedené podle držení; id kroků přidá store). */
export function templateGuide(t, frame = DEFAULT_FRAME, newStep) {
  const map = frameMap(frame);
  const toCube = (n) => slotByName([...n].map((f) => map[f]).join('')).name;
  return {
    intro: t.intro, frame,
    steps: t.steps.map((x) => ({
      ...newStep(x.title), text: x.text ?? '',
      ...(x.parts ? { parts: Object.fromEntries(Object.entries(x.parts).map(([n, s]) => [toCube(n), s])) } : {}),
      ...(x.rules ? { rules: structuredClone(x.rules) } : {}),
      ...(x.sim ? { sim: structuredClone(x.sim) } : {}),
    })),
  };
}
