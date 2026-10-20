// Náhled zamíchání: jak má kostka po zamíchání vypadat. Kostky n×n jako síť
// z nálepek, ostatní hlavolamy přes modely Labu (stejné pohledy).

import { scrambledColors } from '../timer/nxn.js';
import { labModel } from './models.js';
import { NetView } from './netview.js';

const CUBES = { 222: 2, 333: 3, '333oh': 3, '333bf': 3, '333fm': 3, 444: 4, '444bf': 4, 555: 5, '555bf': 5, 666: 6, 777: 7 };
const MODELS = { pyram: 'pyram', skewb: 'skewb', sq1: 'sq1' };

export const hasPreview = (eventId) => eventId in CUBES || eventId in MODELS;

// Sítě stěn v buňkách po n: pozice levého horního rohu stěny (násobky n).
const NET = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
const FACES = 'URFDLB';

function cubeSvg(n, colors) {
  const cell = 30 / n;
  let rects = '';
  for (const [cx, cy] of Object.values(NET)) rects += `<rect x="${cx * 30 - 0.5}" y="${cy * 30 - 0.5}" width="31" height="31" rx="2.5" class="face-bg"/>`;
  [...FACES].forEach((f, fi) => {
    const [cx, cy] = NET[f];
    for (let i = 0; i < n * n; i++) {
      const x = cx * 30 + (i % n) * cell, y = cy * 30 + Math.floor(i / n) * cell;
      rects += `<rect x="${(x + 0.4).toFixed(2)}" y="${(y + 0.4).toFixed(2)}" width="${(cell - 0.8).toFixed(2)}" height="${(cell - 0.8).toFixed(2)}" rx="${n > 4 ? 0.6 : 1.5}" style="fill:var(--c-${colors[fi * n * n + i]})"/>`;
    }
  });
  return `<svg viewBox="0 0 120 90" role="img" aria-label="Náhled zamíchání">${rects}</svg>`;
}

/** Vykreslí náhled do `box`; bez náhledu (nebo při chybě zápisu) ho vyprázdní. */
export function renderPreview(box, eventId, scramble) {
  box.replaceChildren();
  if (!hasPreview(eventId) || !scramble) return;
  try {
    if (eventId in CUBES) {
      const n = CUBES[eventId];
      box.innerHTML = cubeSvg(n, scrambledColors(n, scramble));
      return;
    }
    const model = labModel(MODELS[eventId]);
    const loc = model.applySteps(model.solved(), model.steps(scramble));
    const constraints = Object.fromEntries(model.pieceNames.map((name) => [name, 'solved']));
    const view = new NetView(box, { viewBox: model.view.viewBox, polys: model.view.polys, label: 'Náhled zamíchání' });
    view.render(model.stateStickers(loc, constraints));
  } catch {
    box.replaceChildren();
  }
}
