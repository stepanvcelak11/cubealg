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
  reuse: 0.4,         // stejný prst dvakrát po sobě
  sameHand: 0.4,      // dva prstové tahy po sobě jednou rukou
  alternate: 0,       // bonus za střídání rukou (podle oblíbených algoritmů nic nepřidá, bench/fit.mjs)
  sliceBottom: 0.6,   // M hned po D/E nebo naopak: prsty od M (zezadu nahoře) musí na spodek kostky
};

/**
 * Možnosti provedení prstového tahu: [ruka, prst, cena podle polohy zápěstí (wR, wL)].
 * Vybere se nejlevnější možnost. Ceny jsou odhad (0 = přirozené, 1 = velmi nešikovné).
 */
function options(base, amount, wR, wL, fingering) {
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
      // D levým prsteníčkem tahem k sobě, D' pravým; každý jde i druhou rukou tlakem
      if (amount === 1) { o.push(['L', 'ring', lHome ? 0.15 : 0.7]); o.push(['R', 'ring-push', rHome ? 0.5 : 0.9]); }
      else if (amount === -1) { o.push(['R', 'ring', rHome ? 0.15 : 0.7]); o.push(['L', 'ring-push', lHome ? 0.5 : 0.9]); }
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
      // M' levým prsteníčkem zezadu nahoru, M tahem dolů; pravou rukou (prsteníček zespodu)
      // jde taky, jen méně pohodlně
      o.push(['L', 'ring', lHome ? (amount === 2 ? 0.3 : amount === -1 ? 0.05 : 0.2) : 0.8]);
      o.push(['R', 'ring', rHome ? (amount === 2 ? 0.5 : 0.45) : 0.9]);
      break;
    }
    case 'S': {
      o.push([amount === -1 ? 'L' : 'R', 'index', 0.6]);
      o.push([amount === -1 ? 'R' : 'L', 'index', 0.8]);
      break;
    }
    case 'E': {
      o.push([amount === -1 ? 'R' : 'L', 'ring', 0.7]);
      o.push([amount === -1 ? 'L' : 'R', 'ring', 0.9]);
      break;
    }
    default:
      o.push(['R', 'other', 0.5]);
  }
  // můj prstoklad (Tahy a váhy): tah dělám touhle rukou – jiné možnosti nejsou a ta moje
  // je pro mě přirozená (z home skoro zadarmo)
  const mine = fingering?.[`${base}${amount === 1 ? '' : amount === -1 ? "'" : '2'}`];
  if (mine === 'L' || mine === 'R') {
    const home = mine === 'R' ? wR === 0 : wL === 0;
    const own = o.filter((x) => x[0] === mine).map((x) => [x[0], x[1].replace('-push', ''), Math.min(x[2], home ? 0.1 : 0.6)]);
    if (own.length) return own;
    return [[mine, 'other', home ? 0.1 : 0.6]];
  }
  return o;
}

/** Prstové tahy, u kterých jde v Tahy a váhy zvolit ruku (můj prstoklad). */
export const FINGER_MOVES = ['U', "U'", 'U2', 'F', "F'", 'F2', 'D', "D'", 'D2', 'M', "M'", 'M2', 'S', "S'", 'S2', 'B', "B'", 'E', "E'"];
/** Kdo tah podle modelu dělá (bez vlastního prstokladu, z home): text pro nastavení. */
export function defaultFinger(token) {
  const m = token.match(/^([A-Za-z])('|2)?$/);
  const o = options(m[1], m[2] === "'" ? -1 : m[2] === '2' ? 2 : 1, 0, 0).sort((a, b) => a[2] - b[2]);
  return o.map((x) => `${x[0] === 'R' ? 'pravý' : 'levý'} ${FINGER_NAMES[x[1]] ?? x[1]}`);
}
export const FINGER_NAMES = { index: 'ukazováček', 'index-push': 'ukazováček tlakem', ring: 'prsteníček', 'ring-push': 'prsteníček tlakem', thumb: 'palec', wrist: 'zápěstí', other: 'jinak' };

/** Výchozí stav prstokladu (home grip, žádný předchozí tah). */
export const FLOW_START = Object.freeze({ wR: 0, wL: 0, prev: null });

/**
 * Jeden krok prstokladu: cena tahu m ze stavu s a nový stav (s se nemění).
 * @returns {[{cost:number, hand:string|null, finger:string|null, reason:string|null}, typeof FLOW_START]}
 */
export function flowStep(s, m, isRotation, c) {
  if (isRotation(m.base)) return [{ cost: 0, hand: null, finger: null, reason: null, kind: null }, FLOW_START];
  let { wR, wL } = s;
  const { prev } = s;
  const reasons = [];
  let cost = 0, hand, finger, kind = null;
  if (WRIST_MOVES[m.base]) {
    hand = WRIST_MOVES[m.base];
    finger = 'wrist';
    const w = hand === 'R' ? wR : wL;
    // R2 se dělá z otočeného zápěstí na druhou stranu (−1 → +1); z home je po něm
    // zápěstí zase v použitelné poloze (přehmat počítá hlavní skóre)
    const next = m.amount === 2 ? (w === 0 ? 0 : -w) : Math.max(-2, Math.min(2, w + WRIST_SIGN[m.base] * m.amount));
    if (hand === 'R') wR = next; else wL = next;
  } else {
    // prst se vybírá i podle předchozího tahu: když jde tah druhou rukou skoro stejně dobře,
    // skladač ruce prostřídá (místo dvou tahů po sobě jednou rukou nebo stejným prstem)
    const after = (o) => {
      if (!prev || prev.finger === 'wrist') return 0;
      if (prev.hand === o[0] && prev.finger === o[1] && prev.base !== m.base) return c.reuse;
      if (prev.hand === o[0]) return c.sameHand;
      return -c.alternate;
    };
    const best = options(m.base, m.amount, wR, wL, c.fingering).map((o) => [o, o[2] + after(o)]).sort((a, b) => a[1] - b[1])[0][0];
    [hand, finger, cost] = best;
    if (cost >= 0.4) reasons.push(finger.includes('push') ? 'náhradní prst' : /^[SEBb]$/.test(m.base) ? 'nepohodlný tah prstem' : 'zápěstí není v pozici');
  }
  if (prev && c.sliceBottom && ((prev.base === 'M' && /^[DdE]$/.test(m.base)) || (m.base === 'M' && /^[DdE]$/.test(prev.base)))) {
    cost += c.sliceBottom;
    kind = 'sliceBottom';
    reasons.push(prev.base === 'M' ? 'po M musí prsty na spodní stranu (přehmat)' : 'po spodní vrstvě musí prsty zpátky na M');
  }
  if (prev && kind !== 'sliceBottom') {
    if (finger !== 'wrist' && prev.hand === hand && prev.finger === finger && prev.base !== m.base) {
      cost += c.reuse;
      kind = 'reuse';
      reasons.push('stejný prst dvakrát po sobě');
    } else if (finger !== 'wrist' && prev.finger !== 'wrist' && prev.hand === hand) {
      cost += c.sameHand;
      kind = 'sameHand';
      reasons.push('dva prstové tahy jednou rukou');
    } else if (prev.hand !== hand) {
      cost -= c.alternate;
      kind = 'alternate';
    }
  }
  return [
    // kind = která penalizace/bonus návaznosti se použila (pro kalibraci)
    { cost: cost * c.flowScale, hand, finger, reason: reasons.length ? reasons.join(', ') : null, kind },
    { wR, wL, prev: { hand, finger, base: m.base } },
  ];
}

/**
 * Cena návaznosti pro každý tah algoritmu.
 * @param {{base:string, amount:number}[]} moves
 * @param {(base:string) => boolean} isRotation
 * @returns {{cost:number, hand:string|null, finger:string|null, reason:string|null}[]}
 */
export function flowOf(moves, isRotation, cfg = FLOW_DEFAULTS) {
  const c = { ...FLOW_DEFAULTS, ...cfg };
  let s = FLOW_START;
  return moves.map((m) => {
    const [r, next] = flowStep(s, m, isRotation, c);
    s = next;
    return r;
  });
}
