import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init444, solve444, scramble444, randomState444 } from '../src/timer/fourbyfour.js';

// ---------------------------------------------------------------------------------
// Nezávislý geometrický simulátor 4×4×4: 96 nálepek, každá má polohu (zdvojené
// souřadnice -3, -1, 1, 3) a normálu; tah je otočení nálepek okolo osy (Rodriguesův
// vzorec). Nesdílí s řešičem žádný kód ani tabulky.
// ---------------------------------------------------------------------------------

const ORDER = 'URFDLB';
// stěna: normála, „nahoru“ a „doprava“ při pohledu na ni zvenku (rozložení nálepek)
const FACE = {
  U: { n: [0, 1, 0], up: [0, 0, -1], right: [1, 0, 0] },
  R: { n: [1, 0, 0], up: [0, 1, 0], right: [0, 0, -1] },
  F: { n: [0, 0, 1], up: [0, 1, 0], right: [1, 0, 0] },
  D: { n: [0, -1, 0], up: [0, 0, 1], right: [1, 0, 0] },
  L: { n: [-1, 0, 0], up: [0, 1, 0], right: [0, 0, 1] },
  B: { n: [0, 0, -1], up: [0, 1, 0], right: [-1, 0, 0] },
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lin = (...terms) => [0, 1, 2].map((i) => terms.reduce((s, [k, v]) => s + k * v[i], 0));

/** Složená kostka; pořadí nálepek = pořadí v řetězci nálepek (stěna·16 + řádek·4 + sloupec). */
function solvedSim() {
  const st = [];
  for (const f of ORDER) {
    const { n, up, right } = FACE[f];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        st.push({ p: lin([3, n], [3 - 2 * row, up], [2 * col - 3, right]), n: [...n], color: f });
      }
    }
  }
  return st;
}
/** Kostka z řetězce nálepek (barvy dosazené na polohy složené kostky). */
const simFromFacelets = (str) => solvedSim().map((s, i) => ({ ...s, color: str[i] }));

// otočení o −90° okolo osy a (po směru hodin při pohledu z hrotu osy): v' = a(a·v) − a×v
const turnCW = (a, v) => lin([dot(a, v), a], [-1, cross(a, v)]);
const AXIS = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };

function simMove(st, token) {
  const m = /^([URFDLB])(w?)(2|')?$/.exec(token);
  assert.ok(m, `neplatný tah ${token}`);
  const axis = AXIS[m[1]];
  const turns = m[3] === '2' ? 2 : m[3] === "'" ? 3 : 1;
  const minDot = m[2] ? 1 : 3; // vnější vrstva: dot = 3, dvě vrstvy: dot ≥ 1
  return st.map((s) => {
    if (dot(s.p, axis) < minDot) return s;
    let { p, n } = s;
    for (let i = 0; i < turns; i++) { p = turnCW(axis, p); n = turnCW(axis, n); }
    return { ...s, p, n };
  });
}
const tokens = (alg) => String(alg).split(/\s+/).filter(Boolean);
const simAlg = (st, alg) => tokens(alg).reduce(simMove, st);
function simFacelets(st) {
  const out = new Array(96).fill('?');
  for (const s of st) {
    for (const f of ORDER) {
      const { n, up, right } = FACE[f];
      if (dot(n, s.n) !== 1) continue;
      out[ORDER.indexOf(f) * 16 + ((3 - dot(s.p, up)) / 2) * 4 + (dot(s.p, right) + 3) / 2] = s.color;
    }
  }
  return out.join('');
}
const SOLVED = simFacelets(solvedSim());
const invertToken = (t) => (t.endsWith("'") ? t.slice(0, -1) : t.endsWith('2') ? t : t + "'");
const invertAlg = (alg) => tokens(alg).reverse().map(invertToken).join(' ');
const isSolvedUpToRotation = (f) => ORDER.split('').every((_, i) => new Set(f.slice(i * 16, i * 16 + 16)).size === 1)
  && new Set(ORDER.split('').map((_, i) => f[i * 16])).size === 6;

// pomocné: parita permutace dílků sledovaných přes jejich nálepky
function pieceParities(st) {
  // dílek = skupina nálepek se stejnou původní polohou; typ podle počtu nálepek (3 roh, 2 křídlo, 1 střed)
  const home = solvedSim();
  const key = (p) => p.join(',');
  const groups = new Map();
  home.forEach((s, i) => { const k = key(s.p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  const parity = (perm) => {
    const seen = new Set();
    let odd = 0;
    for (const a of perm.keys()) {
      if (seen.has(a)) continue;
      let len = 0;
      for (let j = a; !seen.has(j); j = perm[j]) { seen.add(j); len++; }
      odd ^= (len - 1) & 1;
    }
    return odd;
  };
  const result = {};
  for (const [name, count] of [['corner', 3], ['wing', 2]]) {
    const cubies = [...groups.entries()].filter(([, idx]) => idx.length === count);
    const where = new Map(cubies.map(([k], i) => [k, i]));
    // nová poloha dílku = poloha jeho první nálepky po tazích
    const perm = cubies.map(([, idx]) => where.get(key(st[idx[0]].p)));
    result[name] = parity(perm);
  }
  return result;
}

// deterministický generátor (mulberry32), jako v test/twophase.test.js
function seeded(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return (n) => Math.floor(next() * n);
}

const MOVE_RE = /^(?:[UDLRFB]|Uw|Rw|Fw)(?:2|')?$/;
function assertWca(alg, maxLength) {
  const t = tokens(alg);
  for (const m of t) assert.match(m, MOVE_RE, `tah ${m}`);
  assert.ok(t.length <= maxLength, `${t.length} tahů`);
  return t;
}

// ---------------------------------------------------------------------------------

test('simulátor: tahy mají správný řád a směr', () => {
  assert.equal(SOLVED, 'U'.repeat(16) + 'R'.repeat(16) + 'F'.repeat(16) + 'D'.repeat(16) + 'L'.repeat(16) + 'B'.repeat(16));
  for (const m of ['U', 'D', 'L', 'R', 'F', 'B', 'Uw', 'Rw', 'Fw']) {
    assert.equal(simFacelets(simAlg(solvedSim(), `${m} ${m} ${m} ${m}`)), SOLVED, m);
    assert.equal(simFacelets(simAlg(solvedSim(), `${m}2 ${m}2`)), SOLVED, `${m}2`);
    assert.equal(simFacelets(simAlg(solvedSim(), `${m} ${m}'`)), SOLVED, `${m}'`);
  }
  // R po směru hodin: přední sloupec jde nahoru (F → U → B → D → F)
  const r = simFacelets(simAlg(solvedSim(), 'R'));
  const col = (face, c) => [0, 1, 2, 3].map((row) => r[ORDER.indexOf(face) * 16 + row * 4 + c]).join('');
  assert.equal(col('U', 3), 'FFFF');
  assert.equal(col('F', 3), 'DDDD');
  assert.equal(col('D', 3), 'BBBB');
  // Uw = U + vnitřní vrstva (pod ní), vnitřní vrstva U-osy se Uw U' liší od U jen střední řadou
  const uw = simFacelets(simAlg(solvedSim(), "Uw U'"));
  assert.equal(uw.slice(16, 20), 'RRRR'); // horní řada R zůstala
  assert.equal(uw.slice(20, 24), 'BBBB'); // druhá řada R dostala barvu B (vnitřní vrstva)
  assert.equal(uw.slice(24, 32), 'R'.repeat(8));
});

test('init444 je idempotentní', () => {
  init444();
  const t = Date.now();
  init444();
  assert.ok(Date.now() - t < 50);
});

/** Fyzická přípustnost řetězce nálepek: každý roh a křídlo má platné barvy a správnou chiralitu. */
function assertPhysical(f) {
  const st = simFromFacelets(f);
  const groups = new Map();
  st.forEach((s, i) => { const k = s.p.join(','); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  let corners = 0;
  for (const idx of groups.values()) {
    if (idx.length === 1) continue;
    const cols = idx.map((i) => FACE[st[i].color].n); // normály barev nálepek
    const nrm = idx.map((i) => st[i].n);
    // barvy na jednom dílku leží na třech (dvou) různých osách
    const axes = new Set(cols.map((c) => c.findIndex((v) => v !== 0)));
    assert.equal(axes.size, idx.length, 'dvě nálepky téže osy na jednom dílku');
    if (idx.length === 3) {
      corners++;
      const trip = (v) => dot(v[0], cross(v[1], v[2]));
      assert.equal(Math.sign(trip(cols)), Math.sign(trip(nrm)), 'zrcadlený roh');
    }
  }
  assert.equal(corners, 8);
  for (const c of ORDER) assert.equal(f.split(c).length - 1, 16, `barva ${c}`);
}

test('randomState444 dává platné nálepky s pevným rohem DLB', () => {
  const rand = seeded(11);
  const solved = solvedSim();
  const dlb = solved.map((s, i) => [s, i]).filter(([s]) => s.p.every((v) => v === -3));
  assert.equal(dlb.length, 3);
  for (let i = 0; i < 60; i++) {
    const f = randomState444(i < 50 ? rand : undefined);
    assert.match(f, /^[URFDLB]{96}$/);
    assertPhysical(f);
    for (const [s, k] of dlb) assert.equal(f[k], s.color, 'roh DLB je na místě');
  }
});

test('randomState444 je rozumně rovnoměrný (rohy, středy, parita rohů)', () => {
  const rand = seeded(12);
  const N = 6000;
  const solved = solvedSim();
  const at = (p, axis) => solved.findIndex((s) => s.p.join() === p && s.n[axis] !== 0);
  const cornerU = at('3,3,3', 1), centerU = at('1,3,1', 1);
  const corner = {}, center = {};
  let oddCorners = 0;
  for (let i = 0; i < N; i++) {
    const f = randomState444(rand);
    corner[f[cornerU]] = (corner[f[cornerU]] || 0) + 1;
    center[f[centerU]] = (center[f[centerU]] || 0) + 1;
    // parita permutace rohů z barev: roh = množina barev, pozice = množina barev ve složeném stavu
    const keyOf = new Map();
    const cornersPos = [...new Set(solved.filter((s) => Math.abs(s.p[0]) === 3 && Math.abs(s.p[1]) === 3 && Math.abs(s.p[2]) === 3).map((s) => s.p.join()))];
    const setAt = (st, p) => st.filter((s) => s.p.join() === p).map((s) => s.color).sort().join('');
    const cur = simFromFacelets(f);
    cornersPos.forEach((p, j) => keyOf.set(setAt(solved, p), j));
    const perm = cornersPos.map((p) => keyOf.get(setAt(cur, p)));
    let odd = 0;
    const seen = new Set();
    for (const a of perm.keys()) {
      if (seen.has(a)) continue;
      let len = 0;
      for (let j = a; !seen.has(j); j = perm[j]) { seen.add(j); len++; }
      odd ^= (len - 1) & 1;
    }
    oddCorners += odd;
  }
  // střed: 6 barev po 1/6; nálepka U rohu URF: 7 volných rohů (DLB je pevný) po 3 natočeních
  for (const c of ORDER) assert.ok(Math.abs(center[c] / N - 1 / 6) < 0.025, `střed ${c}: ${center[c]}`);
  const expect = { U: 4, D: 3, R: 4, L: 3, F: 4, B: 3 };
  for (const c of ORDER) assert.ok(Math.abs(corner[c] / N - expect[c] / 21) < 0.03, `roh ${c}: ${corner[c]}`);
  assert.ok(Math.abs(oddCorners / N - 0.5) < 0.04, `parita rohů ${oddCorners}/${N}`);
});

test('solve444 řeší vylosované stavy (nezávislý simulátor)', () => {
  init444();
  for (const seed of [21, 22, 23, 24]) {
    const f = randomState444(seeded(seed));
    const sol = solve444(f);
    assertWca(sol, 80);
    const end = simFacelets(simAlg(simFromFacelets(f), sol));
    assert.ok(isSolvedUpToRotation(end), `seed ${seed}`);
    assert.equal(end, SOLVED, `seed ${seed}: rám zůstal`);
  }
});

test('solve444 řeší stavy vzniklé tahy simulátoru (bez pohybu rohu DLB)', () => {
  const rand = seeded(31);
  const free = ['U', 'R', 'F', 'Uw', 'Rw', 'Fw']; // tyto tahy rohem DLB nehnou
  for (let i = 0; i < 3; i++) {
    const alg = Array.from({ length: 30 }, () => free[rand(6)] + ['', '2', "'"][rand(3)]).join(' ');
    const f = simFacelets(simAlg(solvedSim(), alg));
    const sol = solve444(f);
    assertWca(sol, 80);
    assert.equal(simFacelets(simAlg(simFromFacelets(f), sol)), SOLVED, alg);
  }
});

test('solve444: vstup mimo řešitelný stav vyhodí chybu', () => {
  assert.throws(() => solve444('UUU'), /96/);
  const f = randomState444(seeded(41));
  const swapped = [...f];
  [swapped[0], swapped[5]] = [swapped[5], swapped[0]]; // dvě nálepky U/jiné barvy
  if (swapped.join('') !== f) assert.throws(() => solve444(swapped.join('')), Error);
  // rám: bez složení rohu DLB na místě (D L B tah) řešič odmítne
  const moved = simFacelets(simAlg(solvedSim(), 'D'));
  assert.throws(() => solve444(moved), /DLB/);
});

test('scramble444 vede přesně do vylosovaného stavu a inverze ho vrací', () => {
  init444();
  for (const seed of [51, 52, 53, 54, 55]) {
    const want = randomState444(seeded(seed));
    const scramble = scramble444(seeded(seed));
    assertWca(scramble, 80);
    const got = simFacelets(simAlg(solvedSim(), scramble));
    assert.equal(got, want, `seed ${seed}`);
    // inverze zamíchání (= řešení) složí kostku
    assert.equal(simFacelets(simAlg(simFromFacelets(got), invertAlg(scramble))), SOLVED);
  }
  assertWca(scramble444(), 80); // kryptografický generátor
});

test('délka zamíchání: průměr do 58 tahů, žádné rotace', () => {
  const lengths = [];
  for (let seed = 61; seed < 71; seed++) {
    const s = scramble444(seeded(seed));
    assert.ok(!/[xyz]/.test(s));
    lengths.push(assertWca(s, 80).length);
  }
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  assert.ok(avg < 58, `průměr ${avg}`);
  assert.ok(Math.min(...lengths) >= 30);
});

test('statistika zamíchání: první tah a parity nejsou vychýlené', () => {
  const N = process.env.FOURBYFOUR_SLOW ? 400 : 24;
  const rand = seeded(777);
  const first = {};
  const par = { corner: 0, wing: 0 };
  for (let i = 0; i < N; i++) {
    const s = scramble444(rand);
    const t = tokens(s);
    const base = t[0].replace(/['2]/, '');
    first[base] = (first[base] || 0) + 1;
    const p = pieceParities(simAlg(solvedSim(), s));
    par.corner += p.corner;
    par.wing += p.wing;
  }
  // rovnoměrný stav: parita permutace rohů i křídel je 50/50
  const slack = process.env.FOURBYFOUR_SLOW ? 0.1 : 0.3;
  assert.ok(Math.abs(par.corner / N - 0.5) < slack, `parita rohů ${par.corner}/${N}`);
  assert.ok(Math.abs(par.wing / N - 0.5) < slack, `parita křídel ${par.wing}/${N}`);
  // první tah: žádný základ nemá víc než 40 % (9 základů, zhruba rovnoměrně)
  for (const [m, c] of Object.entries(first)) assert.ok(c / N < (process.env.FOURBYFOUR_SLOW ? 0.25 : 0.5), `první tah ${m}: ${c}/${N}`);
});
