import { FLOW_DEFAULTS } from './flow.js';

// Výchozí parametry ergonomické funkce. Vše je laditelné – hodnoty jsou
// výchozí odhad pro pravou ruku v home gripu (palec vpředu, ukazováček nahoře).

// Váha tahu podle otočení: [po směru, proti směru, o 180°]. Tahy R U r M L D F B, přehmaty,
// triggery a návaznost doladěné podle sbírky oblíbených algoritmů skladačů (bench/fit.mjs,
// corpus.js): oblíbený algoritmus má v pohledu Nejrychlejší vycházet líp než alternativy pro
// stejný případ – předtím u 77 % dvojic, teď u 93 % (na případech, které ladění nevidělo,
// 71 → 83 %); každá váha se smí posunout nejvýš o třetinu dolů a o polovinu nahoru.
export const DEFAULT_MOVE_WEIGHTS = {
  R: [0.7, 0.8, 0.9],
  U: [0.8, 0.7, 1.8],
  r: [1.8, 1.8, 1.9],
  M: [2.6, 1.8, 2.4],
  L: [2.3, 2.1, 2.0],
  D: [1.6, 1.5, 2.2],
  F: [1.7, 1.9, 2.2],
  l: [1.8, 1.7, 2.4],
  u: [2.4, 2.4, 3.2],
  f: [2.4, 2.6, 3.2],
  d: [2.8, 2.8, 3.6],
  B: [2.7, 2.7, 2.7],
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
  // Za každou čtvrtotáčku rotace x/y/z (zhruba jako 3–4 tahy, podobně jako MCC).
  rotationPenalty: 4,
  // Zápěstí: kolik čtvrtotáček jedním směrem zvládne bez přehmatu.
  maxWristTurn: 2,
  // Přehmat stojí zhruba jako tah a půl běžného tahu (doladěno, bench/fit.mjs).
  regripPenalty: 1.0,
  gripChangePenalty: 0.7,
  // Natočení horní vrstvy před algoritmem a po něm (AUF): cena tahu U × tento
  // násobič (AUF se z části překrývá s rozpoznáním a dotočením; 0 = nepočítat).
  aufScale: 0.5,
  // Násobič bonusů za rozpoznané triggery (0 = vypnuto).
  triggerBonusScale: 1.2,
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
