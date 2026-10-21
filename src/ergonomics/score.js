// Discomfort Score – čím nižší, tím pohodlnější algoritmus.
//
//   celkem = Σ váha tahů
//          + penalizace rotací
//          + přehmaty zápěstí (moc otočení R/L jedním směrem)
//          + změny úchopu (přechody mezi oblastmi mimo home)
//          + návaznost tahů (prstoklad: kdo tah dělá a z jaké polohy, viz flow.js)
//          − bonusy za plynulé triggery

import { parseAlg, moveToString, mirrorMove, MOVE_DEFS } from '../core/notation.js';
import { metrics } from '../core/metrics.js';
import { DEFAULT_CONFIG, moveWeight } from './weights.js';
import { buildTriggers, findTriggers } from './triggers.js';
import { flowStep, FLOW_START, FLOW_DEFAULTS } from './flow.js';

// Které tahy točí zápěstím (a kterým směrem vůči „nahoru“).
const WRIST = { R: ['right', 1], r: ['right', 1], L: ['left', -1], l: ['left', -1] };

const round = (v) => Math.round(v * 100) / 100;

const isRotation = (b) => MOVE_DEFS[b].kind === 'rotation';

/** Výchozí stav ruky před algoritmem (zápěstí, oblast úchopu, prstoklad). */
export const ERGO_START = Object.freeze({ wristR: 0, wristL: 0, zone: null, flow: FLOW_START });

/**
 * Jeden tah hodnocení bez triggerů: položka perMove a nový stav ruky (s se nemění).
 * Hledání podle pohodlí (search/worker.js) tak počítá cenu tah po tahu stejně
 * jako celé hodnocení. Tah m je už v rámci ruky (u leváka zrcadlený).
 * @param {typeof ERGO_START} s
 * @param {{base:string, amount:number}} m
 * @param {typeof DEFAULT_CONFIG} cfg úplné nastavení
 */
export function ergoStep(s, m, cfg) {
  const item = { move: moveToString(m), base: 0, rotation: 0, regrip: 0, gripChange: 0, flow: 0, flowReason: null, flowKind: null, hand: null };
  if (isRotation(m.base)) {
    item.rotation = cfg.rotationPenalty * Math.abs(m.amount);
    return [item, ERGO_START]; // po rotaci se kostka stejně přehmatává
  }
  item.base = moveWeight(m, cfg);
  let { wristR, wristL } = s;
  const w = WRIST[m.base];
  if (w) {
    const [hand, sign] = w;
    const cur = hand === 'right' ? wristR : wristL;
    let next = cur + sign * m.amount;
    if (Math.abs(next) > cfg.maxWristTurn) {
      item.regrip = cfg.regripPenalty;
      next = sign * m.amount;
    }
    if (hand === 'right') wristR = next; else wristL = next;
  }
  const zone = cfg.gripZones[m.base] ?? 'other';
  if (s.zone && zone !== s.zone && zone !== 'home' && s.zone !== 'home') item.gripChange = cfg.gripChangePenalty;
  const [f, flow] = flowStep(s.flow, m, isRotation, cfg);
  item.flow = f.cost; item.flowReason = f.reason; item.flowKind = f.kind; item.hand = f.hand;
  return [item, { wristR, wristL, zone, flow }];
}

/** Úplné nastavení hodnocení (výchozí hodnoty doplněné). */
export const fullConfig = (config = {}) => ({ ...DEFAULT_CONFIG, ...FLOW_DEFAULTS, ...config });

/**
 * @param {string | {base:string, amount:number}[]} alg
 * @param {Partial<typeof DEFAULT_CONFIG> & {triggers?: ReturnType<typeof buildTriggers>}} [config]
 *   leftHanded: hodnotí se zrcadlový algoritmus (levák dělá zrcadlově to, co pravák)
 */
export function scoreAlg(alg, config = {}) {
  const cfg = fullConfig(config);
  const triggers = cfg.triggers ?? buildTriggers();
  const written = parseAlg(alg);
  const moves = cfg.leftHanded ? written.map(mirrorMove) : written;
  let s = ERGO_START;
  const perMove = moves.map((m, i) => {
    const [item, next] = ergoStep(s, m, cfg);
    s = next;
    item.move = moveToString(written[i]);
    return item;
  });

  const found = findTriggers(moves, triggers).map((t) => ({ ...t, bonus: t.bonus * cfg.triggerBonusScale }));
  const sum = (key) => perMove.reduce((acc, it) => acc + it[key], 0);
  const breakdown = {
    moves: round(sum('base')),
    rotations: round(sum('rotation')),
    regrips: round(sum('regrip')),
    gripChanges: round(sum('gripChange')),
    flow: round(sum('flow')),
    triggerBonus: round(-found.reduce((acc, t) => acc + t.bonus, 0)),
  };
  const total = Math.max(0, Object.values(breakdown).reduce((a, b) => a + b, 0));
  return { total: round(total), breakdown, perMove, triggers: found, metrics: metrics(moves) };
}

/**
 * Cena natočení horní vrstvy před algoritmem a po něm (AUF): váha tahu × aufScale.
 * Do délky se AUF nepočítá, do pohodlí ano (U2 na začátku stojí víc než nic).
 * @param {string|null} pre @param {string|null} post zápis AUF (např. "U'"), nebo null
 */
export function aufCost(pre, post, config = {}) {
  const cfg = fullConfig(config);
  let c = 0;
  for (const a of [pre, post]) {
    if (!a) continue;
    for (const m of parseAlg(a)) c += moveWeight(cfg.leftHanded ? mirrorMove(m) : m, cfg) * cfg.aufScale;
  }
  return round(c);
}

/** Seřadí algoritmy podle ergonomie (pak podle HTM). */
export function rankAlgs(algs, config = {}) {
  return algs
    .map((alg) => ({ alg, score: scoreAlg(alg, config) }))
    .sort((a, b) => a.score.total - b.score.total || a.score.metrics.htm - b.score.metrics.htm);
}
