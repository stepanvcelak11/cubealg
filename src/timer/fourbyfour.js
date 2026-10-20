// Zamíchání 4×4×4 z rovnoměrně náhodného stavu (jako TNoodle / cstimer).
//
// Vylosuje se rovnoměrně náhodný stav, vícefázový řešič ho složí a zamíchání je
// inverze řešení. Výstup používá jen tahy U D L R F B (vnější vrstvy) a Uw Rw Fw
// (dvě vrstvy, směr jako U/R/F), každý s příponou ' nebo 2; žádné rotace.
//
// ROVNOMĚRNOST. Rám kostky drží roh DLB (na místě, natočení 0), takže každý stav
// 4×4×4 až na otočení kostky má právě jednoho zástupce. Losuje se po složkách:
//   – 7 ostatních rohů: rovnoměrná permutace, natočení 6 rohů náhodně, sedmé
//     dopočtené (součet ≡ 0 mod 3);
//   – 24 křídel: rovnoměrná permutace (křídla jsou kvůli chiralitě navzájem
//     rozlišitelná, každá permutace je platný stav, žádná parita je neváže);
//   – 24 středů: rovnoměrné rozmístění multimnožiny 6 barev po 4.
// Počet stavů je 8!·3^7/24 · 24! · 24!/(4!)^6 = 7,4·10^45, přesně počet stavů
// 4×4×4. Řešič je funkce stavu (jen vybírá mezi řešeními téhož stavu), zamíchání
// aplikované na složenou kostku proto vede PŘESNĚ do vylosovaného stavu (ověřuje
// test nezávislým simulátorem) a rozdělení zamíchání je rovnoměrné. Kdyby řešení
// přesáhlo 80 tahů, losuje se znovu (v praxi se to nestává).
//
// ŘEŠIČ – redukce na 3×3. Každá fáze je IDA* s pruningovými tabulkami (BFS od
// cíle, stavy kódované maskami pozic) a hledá optimální řešení fáze; z každé fáze
// se bere víc řešení a vybírá se podle součtu délky a odhadu další fáze. Grupy:
//   T0 = všech 27 tahů
//   1. středy barev U/D na stěny U/D (735 471 stavů)                      v T0
//   T1 = <U D L R F B, Uw, Rw2, Fw2>   (středy U/D zůstanou na U/D)
//   2. středy R/L na R/L (zbytek na F/B), barva F v jednom z 12 rozmístění,
//      všech 24 křídel „orientovaných“ (třída pozice jako u hran 3×3: tahy
//      F, B, Uw, Rw, Fw o čtvrtotáčku ji mění) a sudá parita permutace křídel  v T1
//   T2 = <U D L R, F2 B2, Uw2 Rw2 Fw2>
//   3. křídla E-vrstvy do E-vrstvy, natočení rohů 0, středy v orbitě další
//      grupy a párování křídel v orbitě další grupy                        v T2
//   T3 = <U D, L2 R2 F2 B2, Uw2 Rw2 Fw2>
//   4. spárování všech křídel + vyřešení středů; parita počtu slice tahů    v T3
//   5. redukovaná kostka je ve skupině G1 dvoufázového řešiče 3×3 (rohy
//      orientované, hrany orientované, E-vrstva na místě), proto zbývá jen
//      jeho fáze 2 – dokončí ji twophase.js.
// Parity 4×4 se řeší uvnitř hledání: „OLL“ (lichá permutace křídel = jedna
// překlopená hrana) hlídá fáze 2, „PLL“ (rozdílná parita permutace hran a rohů)
// fáze 4 jako paritu počtu slice tahů (každý Uw2/Rw2/Fw2 přehodí dvě křídla).
// Úplnost: BFS při stavbě tabulek ověří, že každá souřadnice je dosažitelná.
//
// Model je samostatný (pozice dílků ze souřadnic, žádný kód z core/).
// Formát nálepek: 96 znaků, stěny v pořadí U R F D L B, každá 4×4 po řádcích;
// U má nahoře zadní řadu, R/F/L/B horní řadu, D přední řadu (jako Kociemba).

import { solve as solve333, init as init333 } from './twophase.js';

const FACES = 'URFDLB';

// --- geometrie ---------------------------------------------------------------------
// Souřadnice jsou zdvojené: -3, -1, 1, 3 (osy x = R, y = U, z = F).

const VALS = [-3, -1, 1, 3];
const posKey = (x, y, z) => ((x + 3) << 6) | ((y + 3) << 3) | (z + 3);
const nExt = (p) => (Math.abs(p[0]) === 3) + (Math.abs(p[1]) === 3) + (Math.abs(p[2]) === 3);

const CORNER_POS = [], WING_POS = [], CENTER_POS = [];
for (const x of VALS) for (const y of VALS) for (const z of VALS) {
  const n = nExt([x, y, z]);
  if (n === 3) CORNER_POS.push([x, y, z]);
  else if (n === 2) WING_POS.push([x, y, z]);
}
// středy po osách (y, x, z): pozice 0–7 leží na stěnách U/D, 8–15 na R/L, 16–23 na F/B
for (const axis of [1, 0, 2]) {
  for (const x of VALS) for (const y of VALS) for (const z of VALS) {
    const p = [x, y, z];
    if (nExt(p) === 1 && Math.abs(p[axis]) === 3) CENTER_POS.push(p);
  }
}
const cornerAt = new Int8Array(512).fill(-1);
const wingAt = new Int8Array(512).fill(-1);
const centerAt = new Int8Array(512).fill(-1);
CORNER_POS.forEach((p, i) => { cornerAt[posKey(...p)] = i; });
WING_POS.forEach((p, i) => { wingAt[posKey(...p)] = i; });
CENTER_POS.forEach((p, i) => { centerAt[posKey(...p)] = i; });
const DLB = cornerAt[posKey(-3, -3, -3)];

/** Čtvrtotáčka po směru hodin při pohledu z kladného konce osy. */
function quarter(axis, p) {
  const [x, y, z] = p;
  return axis === 0 ? [x, z, -y] : axis === 1 ? [-z, y, x] : [y, -x, z];
}
function turnVec(axis, p, k) {
  let q = p;
  for (let i = 0; i < k; i++) q = quarter(axis, q);
  return q;
}

// Základní tahy: jméno, osa, vrstvy (souřadnice), směr vůči kladné ose.
const BASES = [
  ['U', 1, [3], 1], ['D', 1, [-3], -1], ['L', 0, [-3], -1], ['R', 0, [3], 1],
  ['F', 2, [3], 1], ['B', 2, [-3], -1], ['Uw', 1, [3, 1], 1], ['Rw', 0, [3, 1], 1], ['Fw', 2, [3, 1], 1],
];
const N_MOVES = 27; // index = základ·3 + (otočení − 1): X, X2, X'
const MOVE_NAMES = [];
for (const [name] of BASES) MOVE_NAMES.push(name, name + '2', name + "'");
const NAME_TO_MOVE = new Map(MOVE_NAMES.map((n, i) => [n, i]));
const BASE_AXIS = BASES.map((b) => b[1]);
const baseOf = (m) => (m / 3) | 0;
const invMove = (m) => baseOf(m) * 3 + 2 - (m % 3);

// rohy: tři nálepky (normály) v kladném cyklickém pořadí, první na ose y (barva U/D)
const CORNER_NORMALS = CORNER_POS.map((p) => {
  const ny = [0, Math.sign(p[1]), 0], nx = [Math.sign(p[0]), 0, 0], nz = [0, 0, Math.sign(p[2])];
  const triple = -Math.sign(p[0]) * Math.sign(p[1]) * Math.sign(p[2]); // znaménko ny · (nx × nz)
  return triple > 0 ? [ny, nx, nz] : [ny, nz, nx];
});
const sameVec = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

// Tabulky tahů: kam jde dílek z dané pozice a (u rohů) o kolik se změní natočení.
const CMAP = new Int8Array(N_MOVES * 8), CTW = new Int8Array(N_MOVES * 8);
const WMAP = new Int8Array(N_MOVES * 24), TMAP = new Int8Array(N_MOVES * 24);
for (let m = 0; m < N_MOVES; m++) {
  const [, axis, layers, dir] = BASES[baseOf(m)];
  const pow = (m % 3) + 1;
  const k = dir > 0 ? pow : 4 - pow;
  const inLayer = (p) => layers.includes(p[axis]);
  for (let i = 0; i < 8; i++) {
    const p = CORNER_POS[i];
    if (!inLayer(p)) { CMAP[m * 8 + i] = i; continue; }
    const j = cornerAt[posKey(...turnVec(axis, p, k))];
    CMAP[m * 8 + i] = j;
    // nálepka 0 (osa y) přejde na normálu R(n0) na pozici j; změna = její index
    const nn = turnVec(axis, CORNER_NORMALS[i][0], k);
    CTW[m * 8 + i] = CORNER_NORMALS[j].findIndex((v) => sameVec(v, nn));
  }
  for (let i = 0; i < 24; i++) {
    const w = WING_POS[i], c = CENTER_POS[i];
    WMAP[m * 24 + i] = inLayer(w) ? wingAt[posKey(...turnVec(axis, w, k))] : i;
    TMAP[m * 24 + i] = inLayer(c) ? centerAt[posKey(...turnVec(axis, c, k))] : i;
  }
}

// Třída pozice křídla (orientace jako u hran 3×3): „hlavní“ nálepka křídla leží na
// hlavní ose pozice (priorita y, z, x) ⇔ třída 0. Křídlo je v dané pozici vždy
// natočené jediným způsobem, stačí tedy sledovat jedno křídlo všemi tahy.
const WING_CLASS = new Uint8Array(24).fill(255);
const mainAxis = (p) => [1, 2, 0].find((a) => Math.abs(p[a]) === 3);
{
  const n0 = [0, 0, 0];
  n0[mainAxis(WING_POS[0])] = Math.sign(WING_POS[0][mainAxis(WING_POS[0])]);
  const seen = new Set();
  const stack = [[0, n0]];
  while (stack.length) {
    const [pos, n] = stack.pop();
    const id = pos * 64 + posKey(...n);
    if (seen.has(id)) continue;
    seen.add(id);
    const cls = n[mainAxis(WING_POS[pos])] !== 0 ? 0 : 1;
    if (WING_CLASS[pos] !== 255 && WING_CLASS[pos] !== cls) throw new Error('4×4: křídla nemají jednoznačnou orientaci');
    WING_CLASS[pos] = cls;
    for (let m = 0; m < N_MOVES; m++) {
      const [, axis, layers, dir] = BASES[baseOf(m)];
      const k = dir > 0 ? (m % 3) + 1 : 4 - ((m % 3) + 1);
      const p = WING_POS[pos];
      if (layers.includes(p[axis])) stack.push([wingAt[posKey(...turnVec(axis, p, k))], turnVec(axis, n, k)]);
      else stack.push([pos, n]);
    }
  }
}
// slot = hrana 3×3 (dvě křídla); dvojice [pozice třídy 0, pozice třídy 1]
const WING_SLOT = new Int8Array(24);
const SLOT_WINGS = [];
{
  const keys = [];
  WING_POS.forEach((p, i) => {
    const key = p.map((v) => (Math.abs(v) === 3 ? v : 'x')).join(',');
    let s = keys.indexOf(key);
    if (s < 0) { s = keys.length; keys.push(key); SLOT_WINGS.push([-1, -1]); }
    WING_SLOT[i] = s;
    SLOT_WINGS[s][WING_CLASS[i]] = i;
  });
}
/** Osa, podél které hrana (slot) probíhá; 1 = svislé hrany (E-vrstva). */
const SLOT_AXIS = SLOT_WINGS.map(([i]) => [0, 1, 2].find((a) => Math.abs(WING_POS[i][a]) !== 3));
/** Druhé křídlo téhož druhu (stejný domovský slot). */
const PARTNER = Int8Array.from({ length: 24 }, (_, w) => WING_SLOT.findIndex((s, v) => v !== w && s === WING_SLOT[w]));
const isYWing = (w) => SLOT_AXIS[WING_SLOT[w]] === 1;

// --- stav a jeho převody na nálepky ------------------------------------------------------
// Stav: cp[pozice] = rohový dílek, ct = jeho natočení, wp[pozice] = křídlo,
// cc[pozice] = barva středu (0 U, 1 D, 2 R, 3 L, 4 F, 5 B).

const FACE_OF_NORMAL = (n) => (n[1] ? (n[1] > 0 ? 0 : 3) : n[0] ? (n[0] > 0 ? 1 : 4) : n[2] > 0 ? 2 : 5);
const COLOR_TO_FACE = [0, 3, 1, 4, 2, 5];
const unitNormal = (p, axes) => {
  const a = axes.find((ax) => Math.abs(p[ax]) === 3);
  const n = [0, 0, 0];
  n[a] = Math.sign(p[a]);
  return n;
};
const CENTER_NORMAL = CENTER_POS.map((p) => unitNormal(p, [0, 1, 2]));
const CENTER_HOME = CENTER_NORMAL.map((n) => COLOR_TO_FACE.indexOf(FACE_OF_NORMAL(n)));
const solvedState = () => ({
  cp: Int8Array.from({ length: 8 }, (_, i) => i), ct: new Int8Array(8),
  wp: Int8Array.from({ length: 24 }, (_, i) => i), cc: Int8Array.from(CENTER_HOME),
});
const cloneState = (s) => ({ cp: s.cp.slice(), ct: s.ct.slice(), wp: s.wp.slice(), cc: s.cc.slice() });

function applyMove(s, m, o) {
  for (let i = 0; i < 8; i++) {
    const j = CMAP[m * 8 + i];
    o.cp[j] = s.cp[i];
    o.ct[j] = (s.ct[i] + CTW[m * 8 + i]) % 3;
  }
  for (let i = 0; i < 24; i++) {
    o.wp[WMAP[m * 24 + i]] = s.wp[i];
    o.cc[TMAP[m * 24 + i]] = s.cc[i];
  }
}
function applyMoves(s, moves) {
  let a = cloneState(s), b = cloneState(s);
  for (const m of moves) { applyMove(a, m, b); [a, b] = [b, a]; }
  return a;
}

/** Index nálepky v řetězci: stěna·16 + řádek·4 + sloupec (viz hlavička). */
function stickerIndex(p, n) {
  const f = FACE_OF_NORMAL(n);
  const [x, y, z] = p;
  let row, col;
  switch (f) {
    case 0: row = (z + 3) / 2; col = (x + 3) / 2; break; // U
    case 1: row = (3 - y) / 2; col = (3 - z) / 2; break; // R
    case 2: row = (3 - y) / 2; col = (x + 3) / 2; break; // F
    case 3: row = (3 - z) / 2; col = (x + 3) / 2; break; // D
    case 4: row = (3 - y) / 2; col = (z + 3) / 2; break; // L
    default: row = (3 - y) / 2; col = (3 - x) / 2; // B
  }
  return f * 16 + row * 4 + col;
}

// nálepky pozic: roh [3 normály], křídlo [hlavní, vedlejší]
const WING_NORMALS = WING_POS.map((p) => {
  const ext = [0, 1, 2].filter((a) => Math.abs(p[a]) === 3);
  const main = mainAxis(p), other = ext.find((a) => a !== main);
  const unit = (a) => { const n = [0, 0, 0]; n[a] = Math.sign(p[a]); return n; };
  return [unit(main), unit(other)];
});
const CORNER_HOME = CORNER_NORMALS.map((ns) => ns.map(FACE_OF_NORMAL)); // barvy dílku v domovské pozici
const WING_HOME = WING_NORMALS.map((ns) => ns.map(FACE_OF_NORMAL));
/** Co ukáže křídlo w v pozici q: [barva na hlavní nálepce, na vedlejší] (čísla stěn). */
const wingShows = (w, q) => (WING_CLASS[w] ^ WING_CLASS[q]
  ? [WING_HOME[w][1], WING_HOME[w][0]] : [WING_HOME[w][0], WING_HOME[w][1]]);

function toFacelets(s) {
  const f = new Array(96);
  for (let q = 0; q < 8; q++) {
    for (let slot = 0; slot < 3; slot++) {
      const k = (slot - s.ct[q] + 3) % 3;
      f[stickerIndex(CORNER_POS[q], CORNER_NORMALS[q][slot])] = FACES[CORNER_HOME[s.cp[q]][k]];
    }
  }
  for (let q = 0; q < 24; q++) {
    const [a, b] = wingShows(s.wp[q], q);
    f[stickerIndex(WING_POS[q], WING_NORMALS[q][0])] = FACES[a];
    f[stickerIndex(WING_POS[q], WING_NORMALS[q][1])] = FACES[b];
    f[stickerIndex(CENTER_POS[q], CENTER_NORMAL[q])] = FACES[COLOR_TO_FACE[s.cc[q]]];
  }
  return f.join('');
}

/** Opačný převod; vyhodí chybu u nemožné kostky. */
function fromFacelets(str) {
  const f = String(str).replace(/\s+/g, '').toUpperCase();
  if (!/^[URFDLB]{96}$/.test(f)) throw new Error('Očekávám 96 znaků z URFDLB');
  const at = (p, n) => FACES.indexOf(f[stickerIndex(p, n)]);
  const s = solvedState();
  const seenCorner = new Uint8Array(8), seenWing = new Uint8Array(24);
  for (let q = 0; q < 8; q++) {
    const col = [0, 1, 2].map((slot) => at(CORNER_POS[q], CORNER_NORMALS[q][slot]));
    let found = false;
    for (let c = 0; c < 8 && !found; c++) {
      for (let t = 0; t < 3 && !found; t++) {
        if (col.every((x, slot) => x === CORNER_HOME[c][(slot - t + 3) % 3])) {
          if (seenCorner[c]++) throw new Error('Roh je na kostce víckrát');
          s.cp[q] = c; s.ct[q] = t; found = true;
        }
      }
    }
    if (!found) throw new Error(`Neplatný roh na pozici ${q}`);
  }
  for (let q = 0; q < 24; q++) {
    const a = at(WING_POS[q], WING_NORMALS[q][0]), b = at(WING_POS[q], WING_NORMALS[q][1]);
    let w = -1;
    for (let c = 0; c < 24 && w < 0; c++) { const [x, y] = wingShows(c, q); if (x === a && y === b) w = c; }
    if (w < 0 || seenWing[w]++) throw new Error(`Neplatné křídlo na pozici ${q}`);
    s.wp[q] = w;
    s.cc[q] = COLOR_TO_FACE.indexOf(at(CENTER_POS[q], CENTER_NORMAL[q]));
  }
  const cnt = new Uint8Array(6);
  for (const c of s.cc) cnt[c]++;
  if (cnt.some((v) => v !== 4)) throw new Error('Každá barva musí mít 4 středy');
  if (s.ct.reduce((a, b) => a + b, 0) % 3) throw new Error('Nemožné natočení rohů');
  return s;
}

function parseAlg(str) {
  return String(str).split(/\s+/).filter(Boolean).map((t) => {
    const m = NAME_TO_MOVE.get(t);
    if (m === undefined) throw new Error(`Neznámý tah „${t}“`);
    return m;
  });
}
const movesToString = (moves) => moves.map((m) => MOVE_NAMES[m]).join(' ');

// --- masky pozic, pořadová čísla a pruningové tabulky --------------------------------------
// „Kde leží dílky dané třídy“ je 24bitová maska. k-prvkovou masku převádí rank(k)
// na číslo 0 … C(24,k)−1 (kombinatorická číselná soustava, počítaná po bajtech).

const POP = new Uint8Array(256);
for (let i = 1; i < 256; i++) POP[i] = POP[i >> 1] + (i & 1);
const CNK = Array.from({ length: 25 }, () => new Array(25).fill(0));
for (let n = 0; n <= 24; n++) {
  CNK[n][0] = 1;
  for (let k = 1; k <= n; k++) CNK[n][k] = CNK[n - 1][k - 1] + (k <= n - 1 ? CNK[n - 1][k] : 0);
}
/** Tabulka příspěvků bajtů pro k-prvkové masky v `bytes` bajtech. */
function rankTable(k, bytes) {
  const t = new Int32Array(bytes * (k + 1) * 256);
  for (let j = 0; j < bytes; j++) {
    for (let c = 0; c <= k; c++) {
      for (let v = 0; v < 256; v++) {
        let r = 0, cnt = c;
        for (let bit = 0; bit < 8; bit++) {
          if (!((v >> bit) & 1)) continue;
          cnt++;
          if (cnt <= k) r += CNK[8 * j + bit][cnt];
        }
        t[(j * (k + 1) + c) * 256 + v] = r;
      }
    }
  }
  return t;
}
function makeRank(k) {
  const t = rankTable(k, 3), k1 = k + 1;
  return (m) => {
    const b0 = m & 255, b1 = (m >> 8) & 255;
    return t[b0] + t[(k1 + POP[b0]) * 256 + b1] + t[(2 * k1 + POP[b0] + POP[b1]) * 256 + (m >> 16)];
  };
}
function makeRank16(k) {
  const t = rankTable(k, 2);
  return (m) => t[m & 255] + t[(k + 1 + POP[m & 255]) * 256 + (m >> 8)];
}
const rank4 = makeRank(4), rank8 = makeRank(8), rank12 = makeRank(12);
const rank16of8 = makeRank16(8), rank16of4 = makeRank16(4);
const N4 = CNK[24][4], N8 = CNK[24][8], N12 = CNK[24][12];

// osmibitové masky se 4 jedničkami (70 možností): středy jedné barvy v jedné ose
const R70 = new Int16Array(256).fill(-1);
const B70 = [];
for (let v = 0; v < 256; v++) if (POP[v] === 4) { R70[v] = B70.length; B70.push(v); }
const N_CEN = 70 * 70 * 70;
const cenIdx = (b0, b1, b2) => R70[b0] * 4900 + R70[b1] * 70 + R70[b2];

// komprese bitů: PEXT[(c << 8) | v] = bity v na pozicích označených v c (v ⊂ c)
const PEXT = new Uint8Array(65536);
for (let c = 0; c < 256; c++) {
  for (let v = 0; v < 256; v++) {
    let r = 0, n = 0;
    for (let bit = 0; bit < 8; bit++) {
      if (!((c >> bit) & 1)) continue;
      if ((v >> bit) & 1) r |= 1 << n;
      n++;
    }
    PEXT[(c << 8) | v] = r;
  }
}
/**
 * Souřadnice bočních středů po fázi 1: třída R/L (8 z 16 bočních pozic) a barva F
 * mezi zbylými osmi pozicemi (4 z 8); 0 … 900 899.
 */
const N_SIDE = CNK[16][8] * 70;
const sideIdx = (mrl, mf) => {
  const a = mrl >> 8, f = mf >> 8, c = ~a & 0xffff;
  const c0 = c & 255, c1 = c >> 8;
  return rank16of8(a) * 70 + R70[PEXT[(c0 << 8) | (f & 255)] | (PEXT[(c1 << 8) | (f >> 8)] << POP[c0])];
};

/** Tabulka přemístění bitů masky pro každý tah (3 bajty × 256 hodnot). */
function maskTables(map) {
  const t = new Int32Array(N_MOVES * 768);
  for (let m = 0; m < N_MOVES; m++) {
    for (let j = 0; j < 3; j++) {
      for (let v = 0; v < 256; v++) {
        let r = 0;
        for (let bit = 0; bit < 8; bit++) if ((v >> bit) & 1) r |= 1 << map[m * 24 + 8 * j + bit];
        t[m * 768 + j * 256 + v] = r;
      }
    }
  }
  return t;
}
const applyMask = (mask, t, m) => {
  const o = m * 768;
  return t[o + (mask & 255)] | t[o + 256 + ((mask >> 8) & 255)] | t[o + 512 + (mask >> 16)];
};
const maskOf = (arr, pred) => {
  let m = 0;
  for (let i = 0; i < 24; i++) if (pred(arr[i])) m |= 1 << i;
  return m;
};

/** BFS od cílových masek přes sadu tahů (uzavřenou na inverze): vzdálenosti ke cíli. */
function maskPdb(size, rankFn, goals, moves, tbl) {
  const dist = new Uint8Array(size).fill(255);
  const queue = new Int32Array(size);
  let head = 0, tail = 0;
  for (const g of goals) { dist[rankFn(g)] = 0; queue[tail++] = g; }
  while (head < tail) {
    const m0 = queue[head++];
    const d = dist[rankFn(m0)] + 1;
    for (let i = 0; i < moves.length; i++) {
      const nm = applyMask(m0, tbl, moves[i]);
      const r = rankFn(nm);
      if (dist[r] === 255) { dist[r] = d; queue[tail++] = nm; }
    }
  }
  return dist;
}

/** Hustě očíslovaný graf (BFS od startKey); succKey(i, g) dává klíč následníka vrcholu i po tahu g. */
function denseGraph(startKey, nMoves, succKey, onNew) {
  const index = new Map([[startKey, 0]]);
  let table = new Int32Array(4096 * nMoves);
  let n = 1;
  for (let i = 0; i < n; i++) {
    if ((i + 1) * nMoves > table.length) {
      const bigger = new Int32Array(table.length * 2);
      bigger.set(table);
      table = bigger;
    }
    for (let g = 0; g < nMoves; g++) {
      const key = succKey(i, g);
      let j = index.get(key);
      if (j === undefined) { j = n++; index.set(key, j); onNew(j, i, g); }
      table[i * nMoves + g] = j;
    }
  }
  return { index, table: table.slice(0, n * nMoves), n };
}

/** Vzdálenosti v takovém grafu od vrcholu 0; index vrcholu·2 + bit, bit se mění slice tahy. */
function graphDist(n, nMoves, table, sliceBits) {
  const dist = new Uint8Array(2 * n).fill(255);
  const queue = new Int32Array(2 * n);
  let head = 0, tail = 0;
  dist[0] = 0;
  queue[tail++] = 0;
  while (head < tail) {
    const v = queue[head++];
    const d = dist[v] + 1;
    for (let g = 0; g < nMoves; g++) {
      const w = table[(v >> 1) * nMoves + g] * 2 + ((v & 1) ^ sliceBits[g]);
      if (dist[w] === 255) { dist[w] = d; queue[tail++] = w; }
    }
  }
  return dist;
}

// Povolené následující tahy: žádná vrstva dvakrát za sebou; tahy téže osy komutují,
// proto se dovolí jen vzestupné pořadí základů (U < D < L < R < F < B < Uw < Rw < Fw).
const NEXT_OK = new Uint8Array(28 * N_MOVES);
for (let last = -1; last < N_MOVES; last++) {
  for (let m = 0; m < N_MOVES; m++) {
    const bl = baseOf(last), bm = baseOf(m);
    const bad = last >= 0 && BASE_AXIS[bl] === BASE_AXIS[bm] && bm <= bl;
    NEXT_OK[(last + 1) * N_MOVES + m] = bad ? 0 : 1;
  }
}

const permParity = (p) => {
  let s = 0;
  const seen = new Uint8Array(p.length);
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    let j = i, len = 0;
    while (!seen[j]) { seen[j] = 1; j = p[j]; len++; }
    s ^= (len - 1) & 1;
  }
  return s;
};
/** Je permutace křídel daným tahem lichá? (čtvrtotáčka vrstvy uvnitř Uw/Rw/Fw: ano) */
const ODD_WING = Uint8Array.from({ length: N_MOVES }, (_, m) => permParity(Array.from(WMAP.subarray(m * 24, m * 24 + 24))));
/** Tah s vnitřní vrstvou (slice): Uw, Rw, Fw. */
const SLICE_MOVE = Uint8Array.from({ length: N_MOVES }, (_, m) => (baseOf(m) >= 6 ? 1 : 0));

// sady tahů jednotlivých fází (viz hlavička)
const mv = (...names) => names.map((n) => NAME_TO_MOVE.get(n));
const MV1 = Array.from({ length: N_MOVES }, (_, i) => i);
const MV2 = mv('U', "U'", 'U2', 'D', "D'", 'D2', 'L', "L'", 'L2', 'R', "R'", 'R2', 'F', "F'", 'F2', 'B', "B'", 'B2',
  'Uw', "Uw'", 'Uw2', 'Rw2', 'Fw2');
const MV3 = mv('U', "U'", 'U2', 'D', "D'", 'D2', 'L', "L'", 'L2', 'R', "R'", 'R2', 'F2', 'B2', 'Uw2', 'Rw2', 'Fw2');
const MV4 = mv('U', "U'", 'U2', 'D', "D'", 'D2', 'L2', 'R2', 'F2', 'B2', 'Uw2', 'Rw2', 'Fw2');

/** Tabulka bajtů středů po tazích (jen pro tahy, které nemíchají osy středů). */
function centerByteTables(moves) {
  const t = new Uint8Array(N_MOVES * 3 * 256);
  for (const m of moves) {
    for (let g = 0; g < 3; g++) {
      for (let i = 0; i < 8; i++) {
        const j = TMAP[m * 24 + 8 * g + i];
        if (j < 8 * g || j >= 8 * g + 8) throw new Error('4×4: tah míchá osy středů');
      }
      for (let v = 0; v < 256; v++) {
        let r = 0;
        for (let i = 0; i < 8; i++) if ((v >> i) & 1) r |= 1 << (TMAP[m * 24 + 8 * g + i] - 8 * g);
        t[(m * 3 + g) * 256 + v] = r;
      }
    }
  }
  return t;
}
/** Bajty masek barev U, R, F (každá ve své ose; po fázích 1–2 určují středy). */
function centerBytes(s) {
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < 8; i++) {
    if (s.cc[i] === 0) b0 |= 1 << i;
    if (s.cc[8 + i] === 2) b1 |= 1 << i;
    if (s.cc[16 + i] === 4) b2 |= 1 << i;
  }
  return [b0, b1, b2];
}

/** Klíč „kam se dostalo druhé křídlo téhož druhu, jako má křídlo třídy 0 v daném slotu“. */
const POSOF = new Int8Array(24);
function rhoKey(wp) {
  for (let q = 0; q < 24; q++) POSOF[wp[q]] = q;
  let key = 0;
  for (let e = 11; e >= 0; e--) key = key * 12 + WING_SLOT[POSOF[PARTNER[wp[SLOT_WINGS[e][0]]]]];
  return key;
}
const RHO_ID = rhoKey(Int8Array.from({ length: 24 }, (_, i) => i));

// --- stavba tabulek ----------------------------------------------------------------------

let T = null;

/** Fáze 2: boční středy (třída R/L + barva F, 12 cílových rozmístění) × parita křídel. */
function buildSide(t) {
  const { mt } = t;
  let f0 = 0;
  for (let q = 0; q < 24; q++) if (CENTER_HOME[q] === 4) f0 |= 1 << q;
  // v grupě fáze 3 nejsou čtvrtotáčky F, B: barva F se tam dostane jen do 12 rozmístění
  const seen = new Set([f0]);
  const goals = [f0];
  for (let i = 0; i < goals.length; i++) {
    for (const m of MV3) {
      const nm = applyMask(goals[i], mt, m);
      if (!seen.has(nm)) { seen.add(nm); goals.push(nm); }
    }
  }
  if (goals.length !== 12) throw new Error('4×4: neočekávaná orbita středů F');
  const dist = new Uint8Array(N_SIDE * 2).fill(255);
  const qa = new Int32Array(N_SIDE * 2 + 16), qb = new Int32Array(N_SIDE * 2 + 16), qp = new Uint8Array(N_SIDE * 2 + 16);
  let head = 0, tail = 0;
  for (const f of goals) { dist[sideIdx(0xff00, f) * 2] = 0; qa[tail] = 0xff00; qb[tail] = f; qp[tail++] = 0; }
  while (head < tail) {
    const a = qa[head], b = qb[head], pr = qp[head++];
    const d = dist[sideIdx(a, b) * 2 + pr] + 1;
    for (let i = 0; i < MV2.length; i++) {
      const m = MV2[i];
      const na = applyMask(a, mt, m), nb = applyMask(b, mt, m), np = pr ^ ODD_WING[m];
      const r = sideIdx(na, nb) * 2 + np;
      if (dist[r] === 255) { dist[r] = d; qa[tail] = na; qb[tail] = nb; qp[tail++] = np; }
    }
  }
  t.dSide = dist;
}

/** Fáze 2: maska křídel třídy 0 (orientace) × parita permutace křídel. */
function buildOrientation(t) {
  const { mw } = t;
  let p0 = 0;
  for (let q = 0; q < 24; q++) if (WING_CLASS[q] === 0) p0 |= 1 << q;
  const dist = new Uint8Array(N12 * 2).fill(255);
  const queue = new Int32Array(N12 * 2);
  let head = 0, tail = 0;
  dist[rank12(p0) * 2] = 0;
  queue[tail++] = p0 * 2;
  while (head < tail) {
    const v = queue[head++];
    const mask = v >> 1, par = v & 1;
    const d = dist[rank12(mask) * 2 + par] + 1;
    for (let i = 0; i < MV2.length; i++) {
      const m = MV2[i];
      const nm = applyMask(mask, mw, m), np = par ^ ODD_WING[m];
      const r = rank12(nm) * 2 + np;
      if (dist[r] === 255) { dist[r] = d; queue[tail++] = nm * 2 + np; }
    }
  }
  t.dEO = dist;
}

/** Fáze 3: křídla E-vrstvy, natočení rohů, středy (orbita grupy fáze 4). */
function buildStage3(t) {
  const { mw } = t;
  let ypos = 0;
  for (let q = 0; q < 24; q++) if (isYWing(q)) ypos |= 1 << q;
  t.YPOS = ypos;
  t.dY = maskPdb(N8, rank8, [ypos], MV3, mw);

  // středy: trojice bajtů (U, R, F); cíl = orbita složených středů v grupě fáze 4
  const cbt = centerByteTables(MV3);
  t.cbt = cbt;
  const cenStep = (moves) => (idx, g) => {
    const m = moves[g];
    const b0 = B70[(idx / 4900) | 0], b1 = B70[((idx / 70) | 0) % 70], b2 = B70[idx % 70];
    return cenIdx(cbt[m * 768 + b0], cbt[m * 768 + 256 + b1], cbt[m * 768 + 512 + b2]);
  };
  const cenList = [cenIdx(...centerBytes(solvedState()))];
  const step4 = cenStep(MV4);
  const orbit = denseGraph(cenList[0], MV4.length, (i, g) => step4(cenList[i], g),
    (j, i, g) => { cenList.push(step4(cenList[i], g)); });
  {
    const dist = new Uint8Array(N_CEN).fill(255);
    const queue = new Int32Array(N_CEN);
    let head = 0, tail = 0;
    for (const idx of cenList) { dist[idx] = 0; queue[tail++] = idx; }
    const step = cenStep(MV3);
    while (head < tail) {
      const v = queue[head++];
      for (let g = 0; g < MV3.length; g++) {
        const w = step(v, g);
        if (dist[w] === 255) { dist[w] = dist[v] + 1; queue[tail++] = w; }
      }
    }
    t.dC = dist;
  }
  t.cenOrbit = { list: cenList, graph: orbit };

  // natočení rohů: 7 trojkových číslic, osmé se dopočte (součet ≡ 0 mod 3)
  const twMove = new Int16Array(2187 * N_MOVES);
  const ctv = new Int8Array(8), nct = new Int8Array(8);
  for (let tw = 0; tw < 2187; tw++) {
    let x = tw, sum = 0;
    for (let i = 6; i >= 0; i--) { ctv[i] = x % 3; sum += ctv[i]; x = (x / 3) | 0; }
    ctv[7] = (3 - (sum % 3)) % 3;
    for (const m of MV3) {
      for (let i = 0; i < 8; i++) nct[CMAP[m * 8 + i]] = (ctv[i] + CTW[m * 8 + i]) % 3;
      let v = 0;
      for (let i = 0; i < 7; i++) v = v * 3 + nct[i];
      twMove[tw * N_MOVES + m] = v;
    }
  }
  const dTw = new Uint8Array(2187).fill(255);
  {
    const queue = new Int16Array(2187);
    let head = 0, tail = 0;
    dTw[0] = 0;
    queue[tail++] = 0;
    while (head < tail) {
      const v = queue[head++];
      for (const m of MV3) {
        const w = twMove[v * N_MOVES + m];
        if (dTw[w] === 255) { dTw[w] = dTw[v] + 1; queue[tail++] = w; }
      }
    }
    if (tail !== 2187) throw new Error('4×4: natočení rohů nejsou všechna dosažitelná');
  }
  t.twMove = twMove;
  t.dTw = dTw;

  // společné tabulky „křídla E-vrstvy jedné třídy × natočení rohů“ (masky číslované hustě)
  t.dense4 = new Int16Array(N4).fill(-1);
  t.dYT = [0, 1].map((cls) => {
    let start = 0;
    for (let q = 0; q < 24; q++) if (isYWing(q) && WING_CLASS[q] === cls) start |= 1 << q;
    const dense = t.dense4;
    const masks = [start];
    dense[rank4(start)] = 0;
    for (let i = 0; i < masks.length; i++) {
      for (const m of MV3) {
        const nm = applyMask(masks[i], mw, m);
        if (dense[rank4(nm)] < 0) { dense[rank4(nm)] = masks.length; masks.push(nm); }
      }
    }
    const dist = new Uint8Array(masks.length * 2187).fill(255);
    const qm = new Int32Array(dist.length), qt = new Int16Array(dist.length);
    let head = 0, tail = 0;
    dist[dense[rank4(start)] * 2187] = 0;
    qm[tail] = start; qt[tail++] = 0;
    while (head < tail) {
      const m0 = qm[head], t0 = qt[head++];
      const d = dist[dense[rank4(m0)] * 2187 + t0] + 1;
      for (const m of MV3) {
        const nm = applyMask(m0, mw, m), nt = twMove[t0 * N_MOVES + m];
        const k = dense[rank4(nm)] * 2187 + nt;
        if (dist[k] === 255) { dist[k] = d; qm[tail] = nm; qt[tail++] = nt; }
      }
    }
    return dist;
  });
}

/** Fáze 4: permutace párování křídel (rho, 80 640 stavů) a středy (10 080 stavů). */
function buildStage4(t) {
  const nm4 = MV4.length;
  let reps = new Int8Array(1024 * 24); // představitelé stavů: rozmístění křídel
  for (let q = 0; q < 24; q++) reps[q] = q;
  const tmp = new Int8Array(24);
  const rho = denseGraph(RHO_ID, nm4, (i, g) => {
    const m = MV4[g];
    for (let q = 0; q < 24; q++) tmp[WMAP[m * 24 + q]] = reps[i * 24 + q];
    return rhoKey(tmp);
  }, (j) => {
    if ((j + 1) * 24 > reps.length) { const bigger = new Int8Array(reps.length * 2); bigger.set(reps); reps = bigger; }
    reps.set(tmp, j * 24);
  });
  const sliceBits = Uint8Array.from(MV4, (m) => SLICE_MOVE[m]);
  t.rhoIndex = rho.index;
  t.rhoTable = rho.table;
  t.dRho = graphDist(rho.n, nm4, rho.table, sliceBits);
  const { list, graph } = t.cenOrbit;
  t.denseC = new Int32Array(N_CEN).fill(-1);
  list.forEach((idx, i) => { t.denseC[idx] = i; });
  t.cenTable = graph.table;
  t.dCen = graphDist(graph.n, nm4, graph.table, sliceBits);
  delete t.cenOrbit;
}

/** Postaví všechny tabulky (líně, jen jednou; ~4 s a ~45 MB). */
export function init444() {
  if (T) return;
  init333();
  const t = { mw: maskTables(WMAP), mt: maskTables(TMAP) };
  t.d1 = maskPdb(N8, rank8, [0xff], MV1, t.mt); // fáze 1: středy U/D na stěnách U/D
  buildSide(t);
  buildOrientation(t);
  buildStage3(t);
  buildStage4(t);
  T = t;
}

// --- fáze (IDA*) ------------------------------------------------------------------------
// Každá fáze vrací řešení délky d … d+extra (d je optimum fáze, nejvýš `limit` kusů),
// aby šlo vybírat mezi nimi.

const path = new Int8Array(64);
let aborted = false;

/** Prohlubování: hloubky od h0; řešení sbírá do found. */
function deepen(h0, maxDepth, extra, found, limit, runDepth) {
  let first = -1;
  for (let d = h0; d <= maxDepth && found.length < limit; d++) {
    if (first >= 0 && d > first + extra) break;
    runDepth(d);
    if (found.length && first < 0) first = d;
    if (aborted) break;
  }
}

/** Fáze 1: středy barev U, D na stěny U, D. */
function stage1(s, extra, limit) {
  const { mt, d1 } = T;
  const found = [];
  const dfs = (mask, depth, togo, last) => {
    if (togo === 0) {
      if (mask === 0xff) { found.push(Array.from(path.subarray(0, depth))); return found.length >= limit; }
      return false;
    }
    for (let m = 0; m < N_MOVES; m++) {
      if (!NEXT_OK[(last + 1) * N_MOVES + m]) continue;
      const nm = applyMask(mask, mt, m);
      if (d1[rank8(nm)] >= togo) continue;
      path[depth] = m;
      if (dfs(nm, depth + 1, togo - 1, m)) return true;
    }
    return false;
  };
  const m0 = maskOf(s.cc, (c) => c < 2);
  deepen(d1[rank8(m0)], 14, extra, found, limit, (d) => dfs(m0, 0, d, -1));
  if (!found.length) throw new Error('4×4: fáze 1 nenašla řešení');
  return found;
}

/** Souřadnice fáze 2: maska R/L, maska F, maska křídel třídy 0, parita permutace křídel. */
function stage2Coords(s) {
  return [maskOf(s.cc, (c) => c === 2 || c === 3), maskOf(s.cc, (c) => c === 4),
    maskOf(s.wp, (w) => WING_CLASS[w] === 0), permParity(s.wp)];
}
/** Dolní odhad zbývajících tahů fáze 2. */
function stage2Estimate(s) {
  const [mrl, mf, meo, par] = stage2Coords(s);
  return Math.max(T.dSide[sideIdx(mrl, mf) * 2 + par], T.dEO[rank12(meo) * 2 + par]);
}

/**
 * Fáze 2. Překročí-li hledání `cap` uzlů, vrací prázdné pole (řešení přitom nemusí
 * chybět – volající zkusí jiného kandidáta, případně hledá bez limitu).
 */
function stage2(s, extra, limit, cap = Infinity) {
  const { mt, mw, dSide, dEO } = T;
  const found = [];
  let nodes = 0;
  aborted = false;
  const dfs = (mrl, mf, meo, par, depth, togo, last) => {
    if (++nodes > cap) { aborted = true; return true; }
    if (togo === 0) {
      if (par === 0 && dSide[sideIdx(mrl, mf) * 2] === 0 && dEO[rank12(meo) * 2] === 0) {
        found.push(Array.from(path.subarray(0, depth)));
        return found.length >= limit;
      }
      return false;
    }
    for (let i = 0; i < MV2.length; i++) {
      const m = MV2[i];
      if (!NEXT_OK[(last + 1) * N_MOVES + m]) continue;
      const nrl = applyMask(mrl, mt, m), nf = applyMask(mf, mt, m);
      const np = par ^ ODD_WING[m];
      if (dSide[sideIdx(nrl, nf) * 2 + np] >= togo) continue;
      const neo = applyMask(meo, mw, m);
      if (dEO[rank12(neo) * 2 + np] >= togo) continue;
      path[depth] = m;
      if (dfs(nrl, nf, neo, np, depth + 1, togo - 1, m)) return true;
    }
    return false;
  };
  const [mrl, mf, meo, par0] = stage2Coords(s);
  const h0 = Math.max(dSide[sideIdx(mrl, mf) * 2 + par0], dEO[rank12(meo) * 2 + par0]);
  deepen(h0, 18, extra, found, limit, (d) => dfs(mrl, mf, meo, par0, 0, d, -1));
  const wasAborted = aborted;
  aborted = false;
  if (!found.length && !wasAborted) throw new Error('4×4: fáze 2 nenašla řešení');
  return found;
}

/**
 * Fáze 3: křídla E-vrstvy do E-vrstvy, natočení rohů 0, středy v orbitě fáze 4 a párování
 * křídel v orbitě fáze 4 (to poslední se kontroluje až u nalezeného konce).
 */
function stage3(s0, extra, limit, cap = Infinity) {
  const { mw, dY, YPOS, cbt, dC, rhoIndex, twMove, dTw, dYT, dense4 } = T;
  const found = [];
  let wa = new Int8Array(24), wb = new Int8Array(24);
  let nodes = 0;
  aborted = false;
  const dfs = (y0, y1, bu, br, bf, tw, depth, togo, last) => {
    if (++nodes > cap) { aborted = true; return true; }
    if (togo === 0) {
      if ((y0 | y1) !== YPOS || dC[cenIdx(bu, br, bf)] !== 0 || tw !== 0) return false;
      wa.set(s0.wp);
      for (let i = 0; i < depth; i++) { // rozmístění křídel po tazích cesty, bez alokace
        const o = path[i] * 24;
        for (let q = 0; q < 24; q++) wb[WMAP[o + q]] = wa[q];
        const x = wa; wa = wb; wb = x;
      }
      if (!rhoIndex.has(rhoKey(wa))) return false;
      found.push(Array.from(path.subarray(0, depth)));
      return found.length >= limit;
    }
    for (let i = 0; i < MV3.length; i++) {
      const m = MV3[i];
      if (!NEXT_OK[(last + 1) * N_MOVES + m]) continue;
      const n0 = applyMask(y0, mw, m), n1 = applyMask(y1, mw, m);
      if (dY[rank8(n0 | n1)] >= togo) continue;
      const nu = cbt[m * 768 + bu], nr = cbt[m * 768 + 256 + br], nf = cbt[m * 768 + 512 + bf];
      if (dC[cenIdx(nu, nr, nf)] >= togo) continue;
      const ntw = twMove[tw * N_MOVES + m];
      if (dTw[ntw] >= togo) continue;
      if (dYT[0][dense4[rank4(n0)] * 2187 + ntw] >= togo || dYT[1][dense4[rank4(n1)] * 2187 + ntw] >= togo) continue;
      path[depth] = m;
      if (dfs(n0, n1, nu, nr, nf, ntw, depth + 1, togo - 1, m)) return true;
    }
    return false;
  };
  const y0 = maskOf(s0.wp, (w) => isYWing(w) && WING_CLASS[w] === 0);
  const y1 = maskOf(s0.wp, (w) => isYWing(w) && WING_CLASS[w] === 1);
  const [bu, br, bf] = centerBytes(s0);
  let tw0 = 0;
  for (let i = 0; i < 7; i++) tw0 = tw0 * 3 + s0.ct[i];
  const h0 = Math.max(dY[rank8(y0 | y1)], dC[cenIdx(bu, br, bf)], dTw[tw0],
    dYT[0][dense4[rank4(y0)] * 2187 + tw0], dYT[1][dense4[rank4(y1)] * 2187 + tw0]);
  deepen(h0, 22, extra, found, limit, (d) => dfs(y0, y1, bu, br, bf, tw0, 0, d, -1));
  const wasAborted = aborted;
  aborted = false;
  if (!found.length && !wasAborted) throw new Error('4×4: fáze 3 nenašla řešení');
  return found;
}

/**
 * Souřadnice fáze 4: rho (párování), středy a bit parity slice tahů (1 = k dokončení je
 * potřeba lichý počet Uw2/Rw2/Fw2). Vrací null pro stav mimo grupu fáze 4.
 */
function stage4Coords(s) {
  const r = T.rhoIndex.get(rhoKey(s.wp));
  const [bu, br, bf] = centerBytes(s);
  const c = T.denseC[cenIdx(bu, br, bf)];
  if (r === undefined || c < 0) return null;
  // slice tah přehodí dvě křídla třídy 0 (mění znaménko permutace hran), rohy nechá; 3×3 ale
  // potřebuje stejné znaménko permutace hran i rohů
  const sigma = Array.from({ length: 12 }, (_, e) => WING_SLOT[s.wp[SLOT_WINGS[e][0]]]);
  return [r, c, permParity(sigma) ^ permParity(s.cp)];
}
function stage4Estimate(s) {
  const co = stage4Coords(s);
  return co ? Math.max(T.dRho[co[0] * 2 + co[2]], T.dCen[co[1] * 2 + co[2]]) : Infinity;
}

/** Fáze 4: spárování všech křídel a vyřešení středů. */
function stage4(s, extra, limit) {
  const { rhoTable, cenTable, dRho, dCen } = T;
  const nm = MV4.length;
  const co = stage4Coords(s);
  if (!co) throw new Error('4×4: fáze 4 dostala stav mimo svou grupu');
  const found = [];
  const dfs = (r, c, bit, depth, togo, last) => {
    if (togo === 0) {
      if (r === 0 && c === 0 && bit === 0) { found.push(Array.from(path.subarray(0, depth))); return found.length >= limit; }
      return false;
    }
    for (let g = 0; g < nm; g++) {
      const m = MV4[g];
      if (!NEXT_OK[(last + 1) * N_MOVES + m]) continue;
      const nr = rhoTable[r * nm + g], nc = cenTable[c * nm + g], nb = bit ^ SLICE_MOVE[m];
      if (dRho[nr * 2 + nb] >= togo || dCen[nc * 2 + nb] >= togo) continue;
      path[depth] = m;
      if (dfs(nr, nc, nb, depth + 1, togo - 1, m)) return true;
    }
    return false;
  };
  const [r0, c0, bit0] = co;
  deepen(Math.max(dRho[r0 * 2 + bit0], dCen[c0 * 2 + bit0]), 24, extra, found, limit, (d) => dfs(r0, c0, bit0, 0, d, -1));
  if (!found.length) throw new Error('4×4: fáze 4 nenašla řešení');
  return found;
}

// --- celé řešení ---------------------------------------------------------------------------

/** Spojí tahy téže osy (komutují) a vyruší protichůdné; v rámci osy podle pořadí základů. */
function simplify(moves) {
  const out = [];
  let run = new Array(9).fill(0), axis = -1;
  const flush = () => {
    for (let b = 0; b < 9; b++) {
      const net = run[b] & 3;
      if (net) out.push(b * 3 + net - 1);
    }
    run = new Array(9).fill(0);
  };
  for (const m of moves) {
    const a = BASE_AXIS[baseOf(m)];
    if (a !== axis) { flush(); axis = a; }
    run[baseOf(m)] += (m % 3) + 1;
  }
  flush();
  return out;
}

/** 54 nálepek 3×3 z redukované 4×4 (rohy, jedno křídlo z každé hrany, střed). */
function to333(s) {
  const f = toFacelets(s);
  const pick = [0, 1, 3];
  let out = '';
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < 9; i++) out += f[face * 16 + pick[(i / 3) | 0] * 4 + pick[i % 3]];
  }
  return out;
}

// Šířky výběru podle úsilí: pool1/pool3 = kolik řešení fáze 1/3 se prohlíží (x3 = o kolik
// tahů delší než optimum), b1 = kolik kandidátů fáze 1 se dotáhne do konce, cap2 = limit
// uzlů fáze 2 a cap3 fáze 3, ms = časový strop dalších kandidátů, b3 = kolik kandidátů fáze 3 na jednoho kandidáta fáze 2, per4 = kolik řešení
// fáze 4 na každého z nich. Každý celek se dokončí 3×3 a vybere se nejkratší.
const EFFORT = [
  { pool1: 600, pool3: 20, x3: 0, b1: 1, cap2: 300000, cap3: 600000, b3: 4, per4: 1, ms: 700 },
  { pool1: 2500, pool3: 40, x3: 0, b1: 2, cap2: 300000, cap3: 600000, b3: 8, per4: 2, ms: 1200 },
  { pool1: 4000, pool3: 150, x3: 1, b1: 3, cap2: 400000, cap3: 1500000, b3: 8, per4: 2, ms: 2500 },
];

/** Celé řešení stavu: pole tahů (indexy), nejkratší z nalezených kandidátů. */
function solveState(state, { effort = 1, maxLength = 22 } = {}) {
  const E = EFFORT[effort];
  if (!E) throw new Error('4×4: úsilí musí být 0, 1 nebo 2');
  init444();
  const cands = [];
  const deadline = Date.now() + E.ms;
  const late = () => cands.length > 0 && Date.now() > deadline;
  const finish = (prefix, reduced) => {
    const tail = parseAlg(solve333(to333(reduced), { maxLength, timeLimit: 100 }));
    cands.push(simplify([...prefix, ...tail]));
  };
  const c1 = stage1(state, 1, E.pool1).map((mvs) => {
    const s = applyMoves(state, mvs);
    return { mvs, s, score: mvs.length + stage2Estimate(s) };
  }).sort((a, b) => a.score - b.score);
  const tried = new Set();
  let n1 = 0;
  for (const cand of c1) {
    const key = stage2Coords(cand.s).join(',');
    if (tried.has(key)) continue;
    tried.add(key);
    if (n1++ >= E.b1 || late()) break;
    let sol2 = stage2(cand.s, 0, 1, E.cap2);
    if (!sol2.length) {
      if (n1 < E.b1 || cands.length) continue; // jiný kandidát; poslední jde bez limitu
      sol2 = stage2(cand.s, 0, 1);
    }
    const s2 = applyMoves(cand.s, sol2[0]);
    const c3 = stage3(s2, E.x3, E.pool3, E.cap3).map((mvs) => {
      const s = applyMoves(s2, mvs);
      return { mvs, s, score: mvs.length + stage4Estimate(s) };
    }).sort((a, b) => a.score - b.score).slice(0, E.b3);
    for (const x of c3) {
      if (late()) break;
      for (const mv4 of stage4(x.s, 0, E.per4)) {
        finish([...cand.mvs, ...sol2[0], ...x.mvs, ...mv4], applyMoves(x.s, mv4));
      }
    }
  }
  if (!cands.length) { // všechny pokusy o fázi 2 překročily limit uzlů: první kandidát bez limitu
    const s1 = c1[0].s;
    const m2 = stage2(s1, 0, 1)[0];
    const s2 = applyMoves(s1, m2);
    const m3 = stage3(s2, 0, 1)[0];
    const s3 = applyMoves(s2, m3);
    const m4 = stage4(s3, 0, 1)[0];
    finish([...c1[0].mvs, ...m2, ...m3, ...m4], applyMoves(s3, m4));
  }
  return cands.reduce((a, b) => (b.length < a.length ? b : a));
}

/**
 * Řešení kostky zadané 96 nálepkami; rám: roh DLB musí být na místě a správně natočený
 * (jako u randomState444 a u stavů vzniklých ze složené kostky tahy U R F Uw Rw Fw).
 * Vrací tahy U D L R F B Uw Rw Fw jako řetězec.
 * @param {string} facelets
 * @param {{effort?: 0|1|2}} [opts] úsilí: 0 rychlé, 1 běžné, 2 nejkratší
 */
export function solve444(facelets, opts) {
  const s = fromFacelets(facelets);
  if (s.cp[DLB] !== DLB || s.ct[DLB] !== 0) throw new Error('Roh DLB musí být na místě');
  return movesToString(solveState(s, opts));
}

// --- náhodný stav a zamíchání ---------------------------------------------------------------

function cryptoRand(n) {
  const buf = new Uint32Array(1);
  const lim = 0x100000000 - (0x100000000 % n); // bez zkreslení
  do globalThis.crypto.getRandomValues(buf); while (buf[0] >= lim);
  return buf[0] % n;
}

function shuffle(p, rand) {
  for (let i = p.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

/** Rovnoměrně náhodný stav s pevným rohem DLB (viz hlavička). */
function randomState(rand) {
  const s = solvedState();
  const others = [];
  for (let i = 0; i < 8; i++) if (i !== DLB) others.push(i);
  const pieces = shuffle(others.slice(), rand);
  let sum = 0;
  others.forEach((pos, k) => {
    s.cp[pos] = pieces[k];
    const t = k === others.length - 1 ? (3 - (sum % 3)) % 3 : rand(3);
    s.ct[pos] = t;
    sum += t;
  });
  s.wp.set(shuffle(Array.from({ length: 24 }, (_, i) => i), rand));
  s.cc.set(shuffle(Array.from(CENTER_HOME), rand));
  return s;
}

/** Rovnoměrně náhodný stav jako řetězec 96 nálepek (z `rand` se čerpá stejně jako ve scramble444). */
export const randomState444 = (rand = cryptoRand) => toFacelets(randomState(rand));

const MAX_SCRAMBLE = 80;

/**
 * Zamíchání 4×4×4 z náhodného stavu: inverze řešení, WCA notace bez rotací.
 * @param {(n: number) => number} [rand] celé číslo 0 … n-1 (výchozí kryptografické)
 * @param {{effort?: 0|1|2}} [opts] úsilí řešiče: 0 rychlé, 1 běžné (výchozí), 2 nejkratší
 */
export function scramble444(rand = cryptoRand, opts) {
  for (;;) {
    const sol = solveState(randomState(rand), opts);
    if (sol.length <= MAX_SCRAMBLE) return movesToString(sol.reverse().map(invMove));
  }
}
