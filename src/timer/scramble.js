// Zamíchání pro disciplíny WCA.
//
// 2×2 je náhodný stav (optimálně vyřešený náhodný stav, viz scramble-worker),
// ostatní jsou náhodné tahy v notaci WCA bez zbytečných kombinací tahů
// (stejná vrstva po sobě, opakování na stejné ose).

/** Náhodné celé číslo 0 … n-1 (kryptograficky, je-li k dispozici). */
export function randomInt(n) {
  if (globalThis.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / n) * n;
    do { globalThis.crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}
const pick = (arr) => arr[randomInt(arr.length)];
const SUFFIX = ['', "'", '2'];

// --- N×N -----------------------------------------------------------------------

const AXES = [['R', 'L'], ['U', 'D'], ['F', 'B']];

/**
 * Náhodné tahy pro kostku n×n.
 * @param {number} n velikost (3–7)
 * @param {number} length počet tahů
 */
export function nxnScramble(n, length) {
  const maxWidth = Math.floor(n / 2); // 1 = vnější vrstva, 2 = Rw, 3 = 3Rw
  const moves = [];
  let axis = -1;
  let used = new Set(); // vrstvy použité od poslední změny osy
  while (moves.length < length) {
    const a = randomInt(3);
    const face = randomInt(2);
    const width = 1 + randomInt(maxWidth);
    const key = `${face}:${width}`;
    if (a === axis && used.has(key)) continue;
    if (a !== axis) { axis = a; used = new Set(); }
    used.add(key);
    const name = AXES[a][face];
    const prefix = width === 1 ? name : width === 2 ? `${name}w` : `${width}${name}w`;
    moves.push(prefix + pick(SUFFIX));
  }
  return moves.join(' ');
}

const BLD_ORIENT_3 = [['', 'Rw', 'Rw2', "Rw'", 'Fw', "Fw'"], ['', 'Uw', 'Uw2', "Uw'"]];
const BLD_ORIENT_BIG = [['', 'x', 'x2', "x'", 'z', "z'"], ['', 'y', 'y2', "y'"]];

function bldSuffix(table) {
  return table.map(pick).filter(Boolean).join(' ');
}

// --- Pyraminx, Skewb -------------------------------------------------------------

function faceSequence(faces, length, suffixes) {
  const out = [];
  let last = '';
  while (out.length < length) {
    const f = pick(faces);
    if (f === last) continue;
    last = f;
    out.push(f + pick(suffixes));
  }
  return out;
}

export function pyraminxScramble() {
  const moves = faceSequence(['U', 'L', 'R', 'B'], 11, ['', "'"]);
  for (const tip of ['u', 'l', 'r', 'b']) {
    const t = randomInt(3);
    if (t) moves.push(tip + (t === 1 ? '' : "'"));
  }
  return moves.join(' ');
}

export function skewbScramble() {
  return faceSequence(['R', 'U', 'L', 'B'], 11, ['', "'"]).join(' ');
}

// --- Megaminx (Pochmann) ------------------------------------------------------------

export function megaminxScramble() {
  const lines = [];
  for (let l = 0; l < 7; l++) {
    const line = [];
    for (let i = 0; i < 10; i++) line.push((i % 2 ? 'D' : 'R') + (randomInt(2) ? '++' : '--'));
    line.push(randomInt(2) ? 'U' : "U'");
    lines.push(line.join(' '));
  }
  return lines.join('\n');
}

// --- Clock ----------------------------------------------------------------------------

export function clockScramble() {
  const turn = (pin) => {
    const v = randomInt(12) - 5; // -5 … 6
    return `${pin}${Math.abs(v)}${v < 0 ? '-' : '+'}`;
  };
  const front = ['UR', 'DR', 'DL', 'UL', 'U', 'R', 'D', 'L', 'ALL'].map(turn);
  const back = ['U', 'R', 'D', 'L', 'ALL'].map(turn);
  return [...front, 'y2', ...back].join(' ');
}

// --- Square-1 -----------------------------------------------------------------------

// Vrstva = 12 jednotek po 30°; roh zabírá 2 jednotky (stejné id), hrana 1.
const SQ1_TOP = [0, 0, 1, 2, 2, 3, 4, 4, 5, 6, 6, 7];
const SQ1_BOTTOM = [8, 9, 9, 10, 11, 11, 12, 13, 13, 14, 15, 15];

const rot = (layer, k) => layer.map((_, i) => layer[(((i - k) % 12) + 12) % 12]);
const canSlice = (l) => l[11] !== l[0] && l[5] !== l[6];

/** Provede (x, y) a řez; vrací null, pokud řez nejde. */
export function sq1Apply(state, x, y) {
  const top = rot(state.top, x);
  const bottom = rot(state.bottom, y);
  if (!canSlice(top) || !canSlice(bottom)) return null;
  return {
    top: [...top.slice(0, 6), ...bottom.slice(6)],
    bottom: [...bottom.slice(0, 6), ...top.slice(6)],
  };
}

export function sq1Scramble(slashes = 12) {
  let state = { top: SQ1_TOP, bottom: SQ1_BOTTOM };
  const parts = [];
  for (let i = 0; i < slashes; i++) {
    const options = [];
    for (let x = -5; x <= 6; x++) for (let y = -5; y <= 6; y++) {
      if (x === 0 && y === 0) continue;
      const next = sq1Apply(state, x, y);
      if (next) options.push([x, y, next]);
    }
    const [x, y, next] = pick(options);
    state = next;
    parts.push(`(${x},${y})`);
  }
  return parts.join(' / ') + ' /';
}

// --- Vše --------------------------------------------------------------------------------

/**
 * Zamíchání pro disciplínu (kromě 2×2, které potřebuje řešič – viz scramble-worker).
 * @param {string} eventId
 */
export function scramble(eventId) {
  switch (eventId) {
    case '333': case '333oh': case '333fm': return nxnScramble(3, 25);
    case '333bf': return [nxnScramble(3, 25), bldSuffix(BLD_ORIENT_3)].filter(Boolean).join(' ');
    case '444': return nxnScramble(4, 40);
    case '555': return nxnScramble(5, 60);
    case '666': return nxnScramble(6, 80);
    case '777': return nxnScramble(7, 100);
    case '444bf': return [nxnScramble(4, 40), bldSuffix(BLD_ORIENT_BIG)].filter(Boolean).join(' ');
    case '555bf': return [nxnScramble(5, 60), bldSuffix(BLD_ORIENT_BIG)].filter(Boolean).join(' ');
    case 'pyram': return pyraminxScramble();
    case 'skewb': return skewbScramble();
    case 'minx': return megaminxScramble();
    case 'clock': return clockScramble();
    case 'sq1': return sq1Scramble();
    default: throw new Error(`Neznámá disciplína ${eventId}`);
  }
}
