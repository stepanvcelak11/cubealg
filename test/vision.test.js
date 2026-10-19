import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACES } from '../src/core/geometry.js';
import { solved, applyAlg, toFacelets, fromFacelets, equals } from '../src/core/cube.js';
import { classifyFaces, sampleGrid } from '../src/vision/detect.js';

// Typické (nedokonalé) barvy z kamery.
const PALETTE = {
  U: [222, 226, 218], R: [180, 30, 40], F: [20, 150, 70],
  D: [225, 205, 40], L: [235, 110, 25], B: [25, 70, 190],
};

let seed = 7;
const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 40; };
const clamp = (v) => Math.max(0, Math.min(255, v));

function photograph(facelets) {
  const faces = {};
  FACES.forEach((f, fi) => {
    faces[f] = [...facelets.slice(fi * 9, fi * 9 + 9)].map((c) => PALETTE[c].map((v) => clamp(v + noise())));
  });
  return faces;
}

test('rozpozná zamíchanou kostku i se šumem', () => {
  const state = applyAlg(solved(), "R U2 F' L D B2 R' U F2 D' L2 B U'");
  const facelets = toFacelets(state);
  const detected = classifyFaces(photograph(facelets));
  assert.equal(detected, facelets);
  assert.ok(equals(fromFacelets(detected), state));
});

test('vzorkování mřížky bere průměr ze středu políček', () => {
  const size = 30;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const cell = Math.floor(y / 10) * 3 + Math.floor(x / 10);
    data[i] = cell * 20; data[i + 1] = 100; data[i + 2] = 200; data[i + 3] = 255;
  }
  const grid = sampleGrid({ data, width: size }, { x: 0, y: 0, size });
  assert.deepEqual(grid.map((c) => c[0]), [0, 20, 40, 60, 80, 100, 120, 140, 160]);
});
