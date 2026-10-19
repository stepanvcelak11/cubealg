// Rozpoznání barev nálepek z obrázku (bez externích knihoven).
//
// 1. sampleGrid: z oblasti obrázku vezme 3 × 3 průměrné barvy (jen střed
//    každého políčka, aby nerušily okraje a lesk).
// 2. classifyFaces: každou nálepku přiřadí ke středu, kterému je barevně
//    nejblíž (v prostoru CIELAB), s podmínkou, že každá barva je právě 9×.

import { FACES } from '../core/geometry.js';

/**
 * @param {{data: Uint8ClampedArray, width: number}} image ImageData
 * @param {{x:number, y:number, size:number}} square oblast mřížky v pixelech
 * @returns {number[][]} 9 barev [r, g, b] po řádcích
 */
export function sampleGrid(image, { x, y, size }) {
  const cell = size / 3;
  const out = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const x0 = Math.round(x + (c + 0.3) * cell), x1 = Math.round(x + (c + 0.7) * cell);
    const y0 = Math.round(y + (r + 0.3) * cell), y1 = Math.round(y + (r + 0.7) * cell);
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const i = (yy * image.width + xx) * 4;
      sr += image.data[i]; sg += image.data[i + 1]; sb += image.data[i + 2]; n++;
    }
    out.push(n ? [sr / n, sg / n, sb / n] : [0, 0, 0]);
  }
  return out;
}

export function rgbToLab([r, g, b]) {
  const lin = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * @param {Record<string, number[][]>} faces stěna (U R F D L B) → 9 barev RGB
 *   ve stejném pořadí a natočení jako formát Kociemba
 * @returns {string} 54 znaků z URFDLB
 */
export function classifyFaces(faces) {
  const centers = FACES.map((f) => rgbToLab(faces[f][4]));
  const stickers = [];
  FACES.forEach((f, fi) => faces[f].forEach((rgb, i) => stickers.push({ index: fi * 9 + i, lab: rgbToLab(rgb) })));

  const result = new Array(54).fill(null);
  const count = new Array(6).fill(0);
  // Středy určují barvu své stěny napevno.
  FACES.forEach((f, fi) => { result[fi * 9 + 4] = f; count[fi]++; });

  // Hladové přiřazení od nejjistějších dvojic (nálepka, barva), max. 9 na barvu.
  const pairs = [];
  for (const s of stickers) {
    if (result[s.index]) continue;
    centers.forEach((c, ci) => pairs.push({ s: s.index, c: ci, d: dist2(s.lab, c) }));
  }
  pairs.sort((a, b) => a.d - b.d);
  for (const { s, c } of pairs) {
    if (result[s] || count[c] >= 9) continue;
    result[s] = FACES[c];
    count[c]++;
  }
  return result.join('');
}

// Jak držet kostku při focení jednotlivých stěn (odpovídá formátu Kociemba).
export const SCAN_GUIDE = {
  U: 'Horní stěna (U): přední stěna dole, zadní nahoře',
  R: 'Pravá stěna (R): horní stěna nahoře',
  F: 'Přední stěna (F): horní stěna nahoře',
  D: 'Spodní stěna (D): přední stěna nahoře',
  L: 'Levá stěna (L): horní stěna nahoře',
  B: 'Zadní stěna (B): horní stěna nahoře',
};
