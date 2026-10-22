// Rozložená síť 3×3 (všech 6 stran) jako SVG – natočená podle držení, takže „dole“
// je opravdu dole. Pro náhledy, kde 3D kostka neukáže spodní nebo zadní stranu.

import { FACELETS } from '../core/geometry.js';
import { holdOf } from '../core/hold.js';

const HEX = { U: '#fafaf7', R: '#e5383b', F: '#22b455', D: '#ffd60a', L: '#ff8a1f', B: '#2f6bff' };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// strana pohledu → [sloupec, řádek] v síti (po 3 nálepkách) a souřadnice nálepky na ní
const LAYOUT = {
  U: [1, 0, (v) => [v[0], v[2]]],
  L: [0, 1, (v) => [v[2], v[1]]],
  F: [1, 1, (v) => [v[0], v[1]]],
  R: [2, 1, (v) => [-v[2], v[1]]],
  B: [3, 1, (v) => [-v[0], v[1]]],
  D: [1, 2, (v) => [v[0], -v[2]]],
};

/**
 * @param {{color: string, style?: string}[]} stickers podle pozice (color = stěna nebo 'X' = šedá;
 *   style 'dashed' = jen obrys, 'faint' = slabě)
 * @param {string} hold držení (pohled jako při skládání)
 * @param {number} [size] šířka v px
 */
export function netSvg(stickers, hold = '', size = 132) {
  const [c1, c2, c3] = holdOf(hold).linear();
  const view = (v) => { const css = [v[0], -v[1], v[2]]; return [dot(c1, css), dot(c2, css), dot(c3, css)]; };
  const sideOf = (n) => (n[1] < -0.5 ? 'U' : n[1] > 0.5 ? 'D' : n[2] > 0.5 ? 'F' : n[2] < -0.5 ? 'B' : n[0] > 0.5 ? 'R' : 'L');
  const cells = FACELETS.map((f) => {
    const [col, row, flat] = LAYOUT[sideOf(view(f.normal))];
    const [x, y] = flat(view(f.pos)).map((c) => Math.round(c) + 1);
    const st = stickers[f.index] ?? {};
    const fill = HEX[st.color] ?? '#6b7080';
    const dashed = st.style === 'dashed';
    return `<rect x="${col * 3 + x + 0.06}" y="${row * 3 + y + 0.06}" width="0.88" height="0.88" rx="0.16" fill="${dashed ? 'none' : fill}" ${dashed ? `stroke="${fill}" stroke-width="0.14" stroke-dasharray="0.22 0.12"` : ''} opacity="${st.style === 'faint' ? 0.35 : 1}"/>`;
  });
  return `<svg viewBox="-0.1 -0.1 12.2 9.2" width="${size}" height="${Math.round((size * 9.2) / 12.2)}" role="img" aria-hidden="true"><g>${cells.join('')}</g></svg>`;
}
