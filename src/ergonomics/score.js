// Discomfort Score – čím nižší, tím pohodlnější algoritmus.
//
//   celkem = Σ váha tahů
//          + penalizace rotací
//          + přehmaty zápěstí (moc otočení R/L jedním směrem)
//          + změny úchopu (přechody mezi oblastmi mimo home)
//          − bonusy za plynulé triggery

import { parseAlg, moveToString, MOVE_DEFS } from '../core/notation.js';
import { metrics } from '../core/metrics.js';
import { DEFAULT_CONFIG, moveWeight } from './weights.js';
import { buildTriggers, findTriggers } from './triggers.js';

// Které tahy točí zápěstím (a kterým směrem vůči „nahoru“).
const WRIST = { R: ['right', 1], r: ['right', 1], L: ['left', -1], l: ['left', -1] };

const round = (v) => Math.round(v * 100) / 100;

/**
 * @param {string | {base:string, amount:number}[]} alg
 * @param {Partial<typeof DEFAULT_CONFIG> & {triggers?: ReturnType<typeof buildTriggers>}} [config]
 */
export function scoreAlg(alg, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const triggers = cfg.triggers ?? buildTriggers();
  const moves = parseAlg(alg);
  const wrist = { right: 0, left: 0 };
  let prevZone = null;

  const perMove = moves.map((m) => {
    const item = { move: moveToString(m), base: 0, rotation: 0, regrip: 0, gripChange: 0 };
    if (MOVE_DEFS[m.base].kind === 'rotation') {
      item.rotation = cfg.rotationPenalty * Math.abs(m.amount);
      wrist.right = wrist.left = 0; // po rotaci se kostka stejně přehmatává
      prevZone = null;
      return item;
    }
    item.base = moveWeight(m, cfg);

    const w = WRIST[m.base];
    if (w) {
      const [hand, sign] = w;
      const next = wrist[hand] + sign * m.amount;
      if (Math.abs(next) > cfg.maxWristTurn) {
        item.regrip = cfg.regripPenalty;
        wrist[hand] = sign * m.amount;
      } else wrist[hand] = next;
    }

    const zone = cfg.gripZones[m.base] ?? 'other';
    if (prevZone && zone !== prevZone && zone !== 'home' && prevZone !== 'home') {
      item.gripChange = cfg.gripChangePenalty;
    }
    prevZone = zone;
    return item;
  });

  const found = findTriggers(moves, triggers).map((t) => ({ ...t, bonus: t.bonus * cfg.triggerBonusScale }));
  const sum = (key) => perMove.reduce((s, it) => s + it[key], 0);
  const breakdown = {
    moves: round(sum('base')),
    rotations: round(sum('rotation')),
    regrips: round(sum('regrip')),
    gripChanges: round(sum('gripChange')),
    triggerBonus: round(-found.reduce((s, t) => s + t.bonus, 0)),
  };
  const total = Math.max(0, Object.values(breakdown).reduce((a, b) => a + b, 0));
  return { total: round(total), breakdown, perMove, triggers: found, metrics: metrics(moves) };
}

/** Seřadí algoritmy podle ergonomie (pak podle HTM). */
export function rankAlgs(algs, config = {}) {
  return algs
    .map((alg) => ({ alg, score: scoreAlg(alg, config) }))
    .sort((a, b) => a.score.total - b.score.total || a.score.metrics.htm - b.score.metrics.htm);
}
