// Povolené tahy pro hledání (Move Constraint Filter).

import { MOVE_DEFS, BASES, moveToString, parseAlg } from './notation.js';

export const AMOUNTS = [1, -1, 2];

// Pořadí tahů na stejné ose – tahy na jedné ose komutují, takže hledání
// zkouší jen jedno kanonické pořadí (R L, nikoli L R).
const AXIS_ORDER = Object.fromEntries(BASES.map((b, i) => [b, i]));

export const MOVESET_PRESETS = {
  RU: { label: '<R, U>', bases: ['R', 'U'] },
  RUF: { label: '<R, U, F>', bases: ['R', 'U', 'F'] },
  RUL: { label: '<R, U, L>', bases: ['R', 'U', 'L'] },
  RUD: { label: '<R, U, D>', bases: ['R', 'U', 'D'] },
  RrUM: { label: '<R, r, U, M>', bases: ['R', 'r', 'U', 'M'] },
  F2L: { label: 'F2L (R U L F D + r)', bases: ['R', 'U', 'L', 'F', 'D', 'r'] },
  faces: { label: 'Všechny vnější', bases: ['R', 'L', 'U', 'D', 'F', 'B'] },
  all: { label: 'Vše bez rotací', bases: BASES.filter((b) => MOVE_DEFS[b].kind !== 'rotation') },
};

export class MoveSet {
  /**
   * @param {{bases?: string[], amounts?: number[]}} [opts]
   *   bases – povolené základy tahů, amounts – povolené otočení (1, -1, 2)
   */
  constructor({ bases = ['R', 'U'], amounts = AMOUNTS } = {}) {
    for (const b of bases) if (!MOVE_DEFS[b]) throw new Error(`Neznámý tah „${b}“`);
    this.bases = BASES.filter((b) => bases.includes(b));
    this.amounts = AMOUNTS.filter((a) => amounts.includes(a));
    this.list = this.bases.flatMap((base) => this.amounts.map((amount) => ({ base, amount })));
    this.names = new Set(this.list.map(moveToString));
  }

  static preset(id) {
    const p = MOVESET_PRESETS[id];
    if (!p) throw new Error(`Neznámá sada tahů „${id}“`);
    return new MoveSet({ bases: p.bases });
  }

  /** Všechny konkrétní tahy, které smí hledání použít. */
  moves() {
    return this.list;
  }

  allows(m) {
    return this.names.has(moveToString(m));
  }

  /** Zda algoritmus používá jen povolené tahy; vrací seznam porušení. */
  check(alg) {
    return parseAlg(alg).filter((m) => !this.allows(m)).map(moveToString);
  }

  /**
   * Zda tah `next` po `prev` jen opakuje něco, co lze napsat kratší nebo
   * kanonickou cestou (stejný základ, nebo nekanonické pořadí na ose).
   */
  static redundant(prev, next) {
    if (!prev) return false;
    if (MOVE_DEFS[prev.base].axis !== MOVE_DEFS[next.base].axis) return false;
    return AXIS_ORDER[prev.base] >= AXIS_ORDER[next.base];
  }
}
