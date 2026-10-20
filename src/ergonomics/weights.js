import { FLOW_DEFAULTS } from './flow.js';

// Výchozí parametry ergonomické funkce. Vše je laditelné – hodnoty jsou
// výchozí odhad pro pravou ruku v home gripu (palec vpředu, ukazováček nahoře).

// Váha tahu podle otočení: [po směru, proti směru, o 180°].
export const DEFAULT_MOVE_WEIGHTS = {
  R: [1.0, 1.0, 1.4],
  U: [1.0, 1.0, 1.4],
  r: [1.2, 1.2, 1.7],
  M: [1.7, 1.4, 2.0],
  L: [1.5, 1.4, 2.0],
  D: [1.5, 1.4, 2.2],
  F: [1.7, 1.8, 2.4],
  l: [1.8, 1.7, 2.4],
  u: [2.4, 2.4, 3.2],
  f: [2.4, 2.6, 3.2],
  d: [2.8, 2.8, 3.6],
  B: [3.0, 3.0, 3.6],
  S: [3.0, 3.0, 3.6],
  E: [3.2, 3.2, 3.8],
  b: [3.6, 3.6, 4.2],
  // Rotace mají vlastní (velmi vysokou) penalizaci níže.
  x: [0, 0, 0],
  y: [0, 0, 0],
  z: [0, 0, 0],
};

// Oblast, kterou tah „obsluhuje“. Přechod mezi dvěma různými oblastmi mimo
// home (např. F → D, D → B) obvykle vyžaduje změnu úchopu.
export const DEFAULT_GRIP_ZONES = {
  R: 'home', r: 'home', U: 'home', M: 'home',
  F: 'front', f: 'front', S: 'front',
  L: 'left', l: 'left',
  D: 'bottom', d: 'bottom', E: 'bottom',
  B: 'back', b: 'back',
};

export const DEFAULT_CONFIG = {
  moveWeights: DEFAULT_MOVE_WEIGHTS,
  gripZones: DEFAULT_GRIP_ZONES,
  fallbackWeight: 2.5,
  // Za každou čtvrtotáčku rotace x/y/z.
  rotationPenalty: 10,
  // Zápěstí: kolik čtvrtotáček jedním směrem zvládne bez přehmatu.
  maxWristTurn: 2,
  regripPenalty: 2.5,
  gripChangePenalty: 0.6,
  // Násobič bonusů za rozpoznané triggery (0 = vypnuto).
  triggerBonusScale: 1,
  // Levák: hodnotí se zrcadlový algoritmus (R ↔ L', …).
  leftHanded: false,
  // Návaznost tahů – prstoklad (viz flow.js).
  ...FLOW_DEFAULTS,
};

export function moveWeight(m, config = DEFAULT_CONFIG) {
  const w = config.moveWeights[m.base];
  if (!w) return config.fallbackWeight;
  return m.amount === 2 ? w[2] : m.amount === 1 ? w[0] : w[1];
}
