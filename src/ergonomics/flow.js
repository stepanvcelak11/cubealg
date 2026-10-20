// Návaznost tahů (prstoklad): kdo který tah dělá a jak na sebe tahy navazují.
//
// Model pravoruké home grip: R/r/L/l točí zápěstí, ostatní tahy dělají prsty.
// Který prst tah udělá (a jak pohodlně), záleží na tom, kde je zrovna zápěstí –
// např. U pravým ukazováčkem jde z home i po R (R U), ale po R' (zápěstí
// otočené k sobě) ne, takže ho musí udělat levý ukazováček tlakem nebo přehmat.
// Penalizuje se:
//   - tah z nevhodné polohy zápěstí (náhradní prst nebo přehmat),
//   - stejný prst dvakrát po sobě na různé tahy (musí se vrátit),
//   - dva prstové tahy po sobě jednou rukou (druhá ruka zahálí),
// a odměňuje střídání rukou (tahy se dají překrýt).

const WRIST_MOVES = { R: 'R', r: 'R', L: 'L', l: 'L' };
// Směr zápěstí: R po směru = +1 (prsty se vzdalují nahoru dozadu), L po směru = −1.
const WRIST_SIGN = { R: 1, r: 1, L: -1, l: -1 };

export const FLOW_DEFAULTS = {
  flowScale: 1.5,     // násobič celé složky (0 = vypnuto)
  reuse: 0.6,         // stejný prst dvakrát po sobě
  sameHand: 0.3,      // dva prstové tahy po sobě jednou rukou
  alternate: 0.12,    // bonus za střídání rukou
};

/**
 * Možnosti provedení prstového tahu: [ruka, prst, cena podle polohy zápěstí (wR, wL)].
 * Vybere se nejlevnější možnost. Ceny jsou odhad (0 = přirozené, 1 = velmi nešikovné).
 */
function options(base, amount, wR, wL) {
  const rHome = wR === 0, lHome = wL === 0;
  const rUp = wR === 1, rDown = wR === -1;
  const far = (w) => Math.abs(w) >= 2;
  const o = [];
  switch (base) {
    case 'U': case 'u': {
      if (amount === 1) {
        o.push(['R', 'index', rHome || rUp ? 0 : far(wR) ? 1 : 0.7]);
        o.push(['L', 'index-push', lHome ? 0.45 : 0.9]);
      } else if (amount === -1) {
        o.push(['L', 'index', lHome ? 0 : 0.7]);
        o.push(['R', 'index-push', rHome || rDown ? 0.45 : 0.9]);
      } else {
        o.push(['R', 'index', rHome || rUp ? 0.15 : 0.8]);
        o.push(['L', 'index', lHome ? 0.2 : 0.8]);
      }
      break;
    }
    case 'F': case 'f': {
      if (amount === 1) {
        // F pravým ukazováčkem jde nejlíp po R' (sledgehammer), z home s malým posunem
        o.push(['R', 'index', rDown ? 0 : rHome ? 0.35 : 0.9]);
        o.push(['L', 'thumb', lHome ? 0.6 : 1]);
      } else if (amount === -1) {
        o.push(['L', 'thumb', lHome ? 0.15 : 0.7]);
        o.push(['R', 'thumb', rHome || rUp ? 0.5 : 0.9]);
      } else {
        o.push(['R', 'index', rDown ? 0.4 : rHome ? 0.6 : 1]);
        o.push(['L', 'thumb', lHome ? 0.6 : 1]);
      }
      break;
    }
    case 'D': case 'd': {
      if (amount === 1) o.push(['L', 'ring', lHome ? 0.15 : 0.7]);
      else if (amount === -1) o.push(['R', 'ring', rHome ? 0.15 : 0.7]);
      else { o.push(['L', 'ring', lHome ? 0.45 : 0.9]); o.push(['R', 'ring', rHome ? 0.45 : 0.9]); }
      break;
    }
    case 'B': case 'b': {
      if (amount === -1) o.push(['R', 'ring', rUp ? 0.4 : rHome ? 0.7 : 1]);
      else o.push(['L', 'ring', lHome ? 0.6 : 1]);
      if (amount === 2) o.push(['R', 'ring', rUp ? 0.7 : 1]);
      break;
    }
    case 'M': {
      o.push(['L', 'ring', lHome ? (amount === 2 ? 0.3 : amount === -1 ? 0.05 : 0.2) : 0.8]);
      break;
    }
    case 'S': {
      o.push([amount === -1 ? 'L' : 'R', 'index', 0.6]);
      break;
    }
    case 'E': {
      o.push([amount === -1 ? 'R' : 'L', 'ring', 0.7]);
      break;
    }
    default:
      o.push(['R', 'other', 0.5]);
  }
  return o;
}

/**
 * Cena návaznosti pro každý tah algoritmu.
 * @param {{base:string, amount:number}[]} moves
 * @param {(base:string) => boolean} isRotation
 * @returns {{cost:number, hand:string|null, finger:string|null, reason:string|null}[]}
 */
export function flowOf(moves, isRotation, cfg = FLOW_DEFAULTS) {
  const c = { ...FLOW_DEFAULTS, ...cfg };
  let wR = 0, wL = 0;
  let prev = null; // {hand, finger, base}
  return moves.map((m) => {
    if (isRotation(m.base)) {
      wR = wL = 0;
      prev = null;
      return { cost: 0, hand: null, finger: null, reason: null };
    }
    const reasons = [];
    let cost = 0, hand, finger;
    if (WRIST_MOVES[m.base]) {
      hand = WRIST_MOVES[m.base];
      finger = 'wrist';
      const w = hand === 'R' ? wR : wL;
      // R2 se dělá z otočeného zápěstí na druhou stranu (−1 → +1); z home je po něm
      // zápěstí zase v použitelné poloze (přehmat počítá hlavní skóre)
      const next = m.amount === 2 ? (w === 0 ? 0 : -w) : Math.max(-2, Math.min(2, w + WRIST_SIGN[m.base] * m.amount));
      if (hand === 'R') wR = next; else wL = next;
    } else {
      const best = options(m.base, m.amount, wR, wL).sort((a, b) => a[2] - b[2])[0];
      [hand, finger, cost] = best;
      if (cost >= 0.4) reasons.push(`${finger.includes('push') ? 'náhradní prst' : 'zápěstí není v pozici'}`);
    }
    if (prev) {
      if (finger !== 'wrist' && prev.hand === hand && prev.finger === finger && prev.base !== m.base) {
        cost += c.reuse;
        reasons.push('stejný prst dvakrát po sobě');
      } else if (finger !== 'wrist' && prev.finger !== 'wrist' && prev.hand === hand) {
        cost += c.sameHand;
        reasons.push('dva prstové tahy jednou rukou');
      } else if (prev.hand !== hand) {
        cost -= c.alternate;
      }
    }
    prev = { hand, finger, base: m.base };
    return { cost: cost * c.flowScale, hand, finger, reason: reasons.length ? reasons.join(', ') : null };
  });
}
