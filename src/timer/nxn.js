// Kostka n×n×n (n ≥ 2) jako pole barev nálepek – pro náhled zamíchání.
// Tahy: U R F D L B s příponou ' nebo 2, široké „Rw“ (dvě vrstvy) a „3Rw“ (tři vrstvy).
// Formát výstupu jako Kociemba: stěny U R F D L B, každá n×n po řádcích.

const FACES = 'URFDLB';
const NORMAL = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
// osa a směr „po směru hodinových ručiček při pohledu na stěnu“
const SIDE = { R: [0, 1], L: [0, -1], U: [1, 1], D: [1, -1], F: [2, 1], B: [2, -1] };

function layout(n) {
  const v = (i) => 2 * i - (n - 1);
  const stickers = [];
  for (const f of FACES) for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const pos = {
      U: [v(c), n, v(r)], R: [n, -v(r), -v(c)], F: [v(c), -v(r), n],
      D: [v(c), -n, -v(r)], L: [-n, -v(r), v(c)], B: [-v(c), -v(r), -n],
    }[f];
    stickers.push({ face: f, pos, normal: NORMAL[f] });
  }
  return stickers;
}

// čtvrtotáčka po směru hodinových ručiček při pohledu z kladného konce osy
const QUARTER = [
  ([x, y, z]) => [x, z, -y],
  ([x, y, z]) => [-z, y, x],
  ([x, y, z]) => [y, -x, z],
];
const turnQuarter = (v, axis, times) => {
  let out = v;
  for (let t = 0; t < ((times % 4) + 4) % 4; t++) out = QUARTER[axis](out);
  return out;
};

const TOKEN = /\s*(\d*)([URFDLB])(w?)(\d*)(['’]?)/y;

export function parseNxN(alg, n) {
  const moves = [];
  const src = String(alg);
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const t = TOKEN.exec(src);
    if (!t) throw new Error(`Nerozpoznaný zápis u „${src.slice(pos).trim()}“`);
    const width = t[3] ? (t[1] ? Number(t[1]) : 2) : 1;
    if (width < 1 || width > n - 1 + (n === 2 ? 1 : 0)) throw new Error(`Tah „${t[0].trim()}“ na ${n}×${n} není`);
    const k = t[4] === '' ? 1 : Number(t[4]);
    moves.push({ face: t[2], width, turns: t[5] ? -k : k });
    pos = TOKEN.lastIndex;
  }
  return moves;
}

/** Barvy nálepek (písmena U R F D L B) po zamíchání. */
export function scrambledColors(n, alg) {
  const stickers = layout(n);
  const key = (p, q) => `${p}|${q}`;
  const index = new Map(stickers.map((s, i) => [key(s.pos, s.normal), i]));
  let colors = stickers.map((s) => s.face);
  for (const { face, width, turns } of parseNxN(alg, n)) {
    const [axis, sign] = SIDE[face];
    const times = sign * turns;
    const next = colors.slice();
    stickers.forEach((s, i) => {
      // souřadnice kostičky podél osy (nálepka na vnější rovině leží o 1 dál než kostička)
      const cubie = s.pos[axis] - s.normal[axis];
      const inLayer = sign > 0 ? cubie > n - 1 - 2 * width : cubie < -(n - 1) + 2 * width;
      if (!inLayer) return;
      const j = index.get(key(turnQuarter(s.pos, axis, times), turnQuarter(s.normal, axis, times)));
      next[j] = colors[i];
    });
    colors = next;
  }
  return colors.join('');
}
