// Notace tahů: parsování, výpis, inverze, zjednodušení a zrcadlení.
//
// Tah je { base, amount }, kde amount ∈ {1, 2, -1} (R, R2, R').
// Podporované základy: R L U D F B, slice M E S, široké r l u d f b
// (zápis Rw = r) a rotace x y z.

export const MOVE_DEFS = {
  // osa, vrstvy (souřadnice na ose), směr vůči kladnému konci osy, druh
  R: { axis: 0, layers: [1], dir: 1, kind: 'face' },
  L: { axis: 0, layers: [-1], dir: -1, kind: 'face' },
  M: { axis: 0, layers: [0], dir: -1, kind: 'slice' },
  r: { axis: 0, layers: [1, 0], dir: 1, kind: 'wide' },
  l: { axis: 0, layers: [-1, 0], dir: -1, kind: 'wide' },
  x: { axis: 0, layers: [-1, 0, 1], dir: 1, kind: 'rotation' },
  U: { axis: 1, layers: [1], dir: 1, kind: 'face' },
  D: { axis: 1, layers: [-1], dir: -1, kind: 'face' },
  E: { axis: 1, layers: [0], dir: -1, kind: 'slice' },
  u: { axis: 1, layers: [1, 0], dir: 1, kind: 'wide' },
  d: { axis: 1, layers: [-1, 0], dir: -1, kind: 'wide' },
  y: { axis: 1, layers: [-1, 0, 1], dir: 1, kind: 'rotation' },
  F: { axis: 2, layers: [1], dir: 1, kind: 'face' },
  B: { axis: 2, layers: [-1], dir: -1, kind: 'face' },
  S: { axis: 2, layers: [0], dir: 1, kind: 'slice' },
  f: { axis: 2, layers: [1, 0], dir: 1, kind: 'wide' },
  b: { axis: 2, layers: [-1, 0], dir: -1, kind: 'wide' },
  z: { axis: 2, layers: [-1, 0, 1], dir: 1, kind: 'rotation' },
};

export const BASES = Object.keys(MOVE_DEFS);

const normAmount = (n) => {
  const a = ((n % 4) + 4) % 4;
  return a === 3 ? -1 : a; // 0 znamená „nic“
};

export function move(base, amount = 1) {
  if (!MOVE_DEFS[base]) throw new Error(`Neznámý tah „${base}“`);
  const a = normAmount(amount);
  if (a === 0) throw new Error('Tah s nulovým otočením');
  return { base, amount: a };
}

export function moveToString(m) {
  return m.base + (m.amount === 2 ? '2' : m.amount === -1 ? "'" : '');
}

const TOKEN = /\s*(?:([URFDLB])w|([URFDLBMESxyzurfdlb]))(\d*)(['’]?)/y;

/**
 * Rozparsuje algoritmus („R U R' U'“, „RUR'U'“, „Rw2 U'“). Závorky se
 * ignorují jako pouhé seskupení; opakování „(…)2“ zatím podporované není.
 * @param {string | {base:string, amount:number}[]} input
 */
export function parseAlg(input) {
  if (Array.isArray(input)) return input.map((m) => move(m.base, m.amount));
  const src = String(input).replace(/[()[\]]/g, (ch, i, s) => {
    if ((ch === ')' || ch === ']') && /^\d/.test(s.slice(i + 1))) {
      throw new Error('Opakování skupin „(…)n“ zatím není podporované');
    }
    return ' ';
  });
  const moves = [];
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const t = TOKEN.exec(src);
    if (!t) throw new Error(`Nerozpoznaný zápis u „${src.slice(pos).trim()}“`);
    const base = t[1] ? t[1].toLowerCase() : t[2];
    const n = t[3] === '' ? 1 : Number(t[3]);
    const amount = normAmount(t[4] ? -n : n);
    if (amount !== 0) moves.push({ base, amount });
    pos = TOKEN.lastIndex;
  }
  return moves;
}

export function algToString(alg) {
  return parseAlg(alg).map(moveToString).join(' ');
}

export function invertAlg(alg) {
  return parseAlg(alg).reverse().map((m) => ({ base: m.base, amount: m.amount === 2 ? 2 : -m.amount }));
}

/** Sloučí sousední tahy se stejným základem (R R → R2, R R' → nic). */
export function simplifyAlg(alg) {
  const out = [];
  for (const m of parseAlg(alg)) {
    const last = out[out.length - 1];
    if (last && last.base === m.base) {
      const a = normAmount(last.amount + m.amount);
      if (a === 0) out.pop();
      else out[out.length - 1] = { base: m.base, amount: a };
    } else out.push({ ...m });
  }
  return out;
}

// Zrcadlení přes rovinu M (pravá ruka ↔ levá ruka): R ↔ L', r ↔ l',
// M a x zůstávají, ostatní tahy mění směr.
const MIRROR_SWAP = { R: 'L', L: 'R', r: 'l', l: 'r' };

export function mirrorMove(m) {
  if (m.base === 'M' || m.base === 'x') return { ...m };
  const base = MIRROR_SWAP[m.base] ?? m.base;
  return { base, amount: m.amount === 2 ? 2 : -m.amount };
}

export function mirrorAlg(alg) {
  return parseAlg(alg).map(mirrorMove);
}
