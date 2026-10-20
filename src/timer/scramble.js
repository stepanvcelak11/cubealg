// Zamíchání pro disciplíny WCA.
//
// 2×2, 3×3 a 4×4 jsou z náhodného stavu (2×2 a 4×4 viz scramble-worker,
// 3×3 two-phase), ostatní jsou náhodné tahy v notaci WCA bez zbytečných kombinací tahů
// (stejná vrstva po sobě, opakování na stejné ose).

import { randomStateScramble } from './twophase.js';
import { solvedState, turn, slash, canSlash } from '../puzzles/sq1.js';
import { simplifyAlg, algToString } from '../core/notation.js';

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

/** Orientace kostky před BLD zamícháním velkých kostek (x/z a y). */
export const bigOrientation = () => bldSuffix(BLD_ORIENT_BIG);

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

/** Náhodné tahy: každé (x, y) je zvolené tak, aby po něm šel řez (model viz puzzles/sq1.js). */
export function sq1Scramble(slashes = 12) {
  let state = solvedState();
  const parts = [];
  for (let i = 0; i < slashes; i++) {
    const options = [];
    for (let x = -5; x <= 6; x++) for (let y = -5; y <= 6; y++) {
      if (x === 0 && y === 0) continue;
      const turned = turn(state, x, y);
      if (canSlash(turned)) options.push([x, y, turned]);
    }
    const [x, y, turned] = pick(options);
    state = slash(turned);
    parts.push(`(${x},${y})`);
  }
  return parts.join(' / ') + ' /';
}

// --- Vše --------------------------------------------------------------------------------

/**
 * Zamíchání pro disciplínu (kromě 2×2, které potřebuje řešič – viz scramble-worker).
 * @param {string} eventId
 */
/** 3×3 z náhodného stavu (inverze řešení two-phase). */
export function scramble333() {
  return algToString(simplifyAlg(randomStateScramble((n) => randomInt(n))));
}

// FMC: zamíchání začíná i končí R' U' F (WCA), aby nešlo „ukrást“ začátek řešení.
const FMC_PAD = "R' U' F";

/**
 * @param {string} eventId
 * @param {{count?: number}} [opts] count = počet kostek u Multi-Blind
 */
export function scramble(eventId, { count = 3 } = {}) {
  switch (eventId) {
    case '333': case '333oh': return scramble333();
    case '333fm': {
      // jádro nesmí s výplní nic zkrátit (první tah mimo osu F/B, poslední mimo R/L)
      let core;
      do { core = scramble333(); } while (/^[FB]/.test(core) || /[RL]['2]?$/.test(core));
      return `${FMC_PAD} ${core} ${FMC_PAD}`;
    }
    case '333bf': return [scramble333(), bldSuffix(BLD_ORIENT_3)].filter(Boolean).join(' ');
    case '333mbf': return Array.from({ length: Math.max(2, Math.min(60, count)) },
      (_, i) => `${i + 1}. ${scramble333()}`).join('\n');
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
