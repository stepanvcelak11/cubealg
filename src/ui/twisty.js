// 3D náhled přes cubing.js (<twisty-player>). Knihovna se načítá až na
// vyžádání; když CDN není dostupné, aplikace funguje dál s 2D sítí.

import { SLOTS } from '../core/geometry.js';

const SOURCES = [
  'https://cdn.cubing.net/v0/js/cubing/twisty',
  'https://esm.sh/cubing@0.63.3/twisty',
  'https://cdn.jsdelivr.net/npm/cubing@0.63.3/dist/lib/cubing/twisty/index.js/+esm',
];

let loading = null;

export function loadTwisty() {
  loading ??= (async () => {
    for (const url of SOURCES) {
      try {
        await import(url);
        if (customElements.get('twisty-player')) return true;
      } catch { /* zkusíme další zdroj */ }
    }
    loading = null;
    throw new Error('Knihovnu cubing.js se nepodařilo načíst');
  })();
  return loading;
}

// Pořadí dílků v cubing.js (kpuzzle 3x3x3).
const ORBITS = {
  EDGES: ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'],
  CORNERS: ['UFR', 'URB', 'UBL', 'ULF', 'DRF', 'DFL', 'DLB', 'DBR'],
  CENTERS: ['U', 'L', 'F', 'R', 'B', 'D'],
};
const MASK_CHAR = { solved: '-', permutation: '-', orientation: 'O', ignore: 'I' };
const norm = (n) => [...n].sort().join('');
const SLOT_BY_NORM = new Map(SLOTS.map((s) => [norm(s.name), s.name]));

/** Maska nálepek pro cubing.js podle omezení dílků. */
export function stickeringMask(constraints) {
  return Object.entries(ORBITS).map(([orbit, names]) => `${orbit}:${names.map((n) => {
    const c = constraints[SLOT_BY_NORM.get(norm(n))] ?? 'ignore';
    return orbit === 'CENTERS' && c === 'orientation' ? 'I' : MASK_CHAR[c];
  }).join('')}`).join(',');
}

/**
 * @param {HTMLElement} container
 * @param {{alg:string, setup?:string, anchor:'start'|'end', constraints:Record<string,string>}} opts
 */
export function showTwisty(container, { alg, setup = '', anchor, constraints }) {
  let player = container.querySelector('twisty-player');
  if (!player) {
    player = document.createElement('twisty-player');
    player.setAttribute('background', 'none');
    player.setAttribute('control-panel', 'bottom-row');
    player.style.width = '100%';
    player.style.height = '320px';
    container.replaceChildren(player);
  }
  player.setAttribute('experimental-setup-anchor', anchor);
  player.setAttribute('experimental-setup-alg', setup);
  player.setAttribute('experimental-stickering-mask-orbits', stickeringMask(constraints));
  player.setAttribute('alg', alg);
}
