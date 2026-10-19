// Rozložená síť kostky (2D) jako mřížka 12 × 9.

import { FACELETS } from '../core/geometry.js';
import { stickerVisibility } from '../core/constraints.js';

// Levý horní roh každé stěny v síti [sloupec, řádek].
const NET = { U: [3, 0], L: [0, 3], F: [3, 3], R: [6, 3], B: [9, 3], D: [3, 6] };

/** Barvy po pozicích (U…B, nebo 'X' = šedá) ze stavu a omezení. */
export function colorsOf(loc, constraints) {
  const vis = constraints ? stickerVisibility(constraints) : null;
  const out = new Array(54);
  for (let k = 0; k < 54; k++) out[loc[k]] = !vis || vis[k] === 'color' ? FACELETS[k].face : 'X';
  return out;
}

/**
 * @param {HTMLElement} container
 * @param {string[] | string} colors barva pro každou pozici 0–53
 * @param {(pos:number) => void} [onClick]
 */
export function renderNet(container, colors, onClick) {
  const cells = Array.from({ length: 9 * 12 }, () => {
    const s = document.createElement('span');
    s.className = 'gap';
    return s;
  });
  for (let pos = 0; pos < 54; pos++) {
    const { face } = FACELETS[pos];
    const i = pos % 9;
    const [cx, cy] = NET[face];
    const cell = onClick ? document.createElement('button') : cells[(cy + Math.floor(i / 3)) * 12 + cx + (i % 3)];
    cell.className = 'sticker';
    cell.style.background = colors[pos] === 'X' ? 'var(--c-gray)' : `var(--c-${colors[pos]})`;
    if (onClick) {
      cell.type = 'button';
      cell.setAttribute('aria-label', `${face}${i + 1}`);
      cell.onclick = () => onClick(pos);
      cells[(cy + Math.floor(i / 3)) * 12 + cx + (i % 3)] = cell;
    }
  }
  container.classList.toggle('editable', !!onClick);
  container.replaceChildren(...cells);
}
