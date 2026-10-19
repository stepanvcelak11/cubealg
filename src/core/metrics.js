// Metriky délky algoritmu: HTM, QTM, STM, ETM.

import { MOVE_DEFS, parseAlg } from './notation.js';

export function metrics(alg) {
  const out = { htm: 0, qtm: 0, stm: 0, etm: 0 };
  for (const m of parseAlg(alg)) {
    const kind = MOVE_DEFS[m.base].kind;
    const quarters = m.amount === 2 ? 2 : 1;
    out.etm += 1;
    if (kind === 'rotation') continue;
    out.stm += 1;
    out.htm += kind === 'slice' ? 2 : 1;
    out.qtm += quarters * (kind === 'slice' ? 2 : 1);
  }
  return out;
}
