// Hodnocení pohodlnosti pro všechny hlavolamy Labu.
//
//   3×3, 2×2      – plné hodnocení (score.js: váhy, rotace, přehmaty, triggery)
//   Pyraminx, Skewb – součet vah tahů (každý základ zvlášť pro směr a proti směru)
//   Square-1      – řezy + otočení vrstev podle velikosti (současné otočení
//                   obou vrstev je levnější než dvě samostatná)

import { scoreAlg } from './score.js';
import { DEFAULT_CONFIG, DEFAULT_MOVE_WEIGHTS } from './weights.js';
import { parseSq1 } from '../puzzles/sq1.js';

const round = (v) => Math.round(v * 100) / 100;

/** Výchozí nastavení hodnocení pro hlavolam. */
export function defaultErgo(puzzle) {
  if (puzzle.ergonomics === 'cube') return { ...DEFAULT_CONFIG, moveWeights: { ...DEFAULT_MOVE_WEIGHTS } };
  if (puzzle.ergonomics === 'sq1') return { ...SQ1_DEFAULTS, turn: [...SQ1_DEFAULTS.turn] };
  const weights = Object.fromEntries(puzzle.bases.map((b) => {
    const w = puzzle.defaultWeights?.[b] ?? 1;
    return [b, [w, round(w * 1.1)]];
  }));
  return { weights };
}

// Square-1: cena řezu a otočení o 1–6 dvanáctin; druhá vrstva ve stejném
// otočení stojí jen zlomek (otáčí se současně).
export const SQ1_DEFAULTS = { slash: 1, turn: [0, 0.4, 0.7, 0.6, 0.9, 1.1, 1.0], simultaneous: 0.5 };

const emptyBreakdown = () => ({ moves: 0, rotations: 0, regrips: 0, gripChanges: 0, flow: 0, triggerBonus: 0 });

/**
 * @param {object} puzzle hlavolam (src/puzzles)
 * @param {string} alg
 * @param {object} config nastavení hodnocení (viz defaultErgo)
 */
export function scoreFor(puzzle, alg, config) {
  if (puzzle.ergonomics === 'cube') return scoreAlg(puzzle.id === '333' ? alg : puzzle.algToString(alg), config);
  if (puzzle.ergonomics === 'sq1') return scoreSq1(alg, config);
  const moves = puzzle.parseAlg(alg);
  const perMove = moves.map((m) => {
    const w = config.weights?.[m.base] ?? [1, 1.1];
    return { move: puzzle.moveToString(m), base: w[m.amount === 1 ? 0 : 1] ?? 1 };
  });
  const total = round(perMove.reduce((s, x) => s + x.base, 0));
  return {
    total, perMove, triggers: [],
    breakdown: { ...emptyBreakdown(), moves: total },
    metrics: { htm: moves.length, qtm: moves.length, stm: moves.length, etm: moves.length },
  };
}

function scoreSq1(alg, cfg) {
  const c = { ...SQ1_DEFAULTS, ...cfg };
  const moves = parseSq1(alg);
  let slashes = 0, turns = 0;
  const perMove = moves.map((m) => {
    if (m.t === 'slash') { slashes++; return { move: '/', base: c.slash }; }
    turns++;
    const [x, y] = [Math.abs(m.a), Math.abs(m.b)].sort((p, q) => c.turn[q] - c.turn[p]);
    return { move: `(${m.a},${m.b})`, base: round(c.turn[x] + (y ? c.turn[y] * c.simultaneous : 0)) };
  });
  const turnCost = perMove.filter((p) => p.move !== '/').reduce((s, p) => s + p.base, 0);
  const total = round(slashes * c.slash + turnCost);
  return {
    total, perMove, triggers: [],
    breakdown: { ...emptyBreakdown(), moves: total },
    metrics: { htm: slashes, qtm: slashes + turns, stm: slashes + turns, etm: slashes + turns },
  };
}

/** Jak těžký je jeden tah (pro obarvení v seznamu): 'easy' | 'mid' | 'hard' | 'rot'. */
export function moveDifficulty(puzzle, token, config) {
  if (puzzle.ergonomics === 'sq1') {
    if (token === '/') return 'mid';
    const s = scoreSq1(token, config).total;
    return s <= 0.6 ? 'easy' : s <= 1.1 ? 'mid' : 'hard';
  }
  const s = scoreFor(puzzle, token, config);
  if (puzzle.rotations?.includes(puzzle.parseAlg(token)[0]?.base)) return 'rot';
  return s.total <= 1.25 ? 'easy' : s.total <= 2 ? 'mid' : 'hard';
}
