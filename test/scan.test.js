import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/ui/scan.js';

test('focení: rozpoznání barev nálepek i při různém světle', () => {
  const samples = {
    U: [[235, 235, 228], [200, 205, 210], [170, 168, 160], [250, 245, 235]],
    D: [[240, 210, 20], [210, 190, 40], [250, 230, 90], [190, 170, 30]],
    F: [[30, 160, 80], [20, 120, 60], [60, 190, 110], [40, 140, 50]],
    B: [[30, 90, 210], [20, 60, 160], [70, 120, 230], [10, 70, 180]],
    R: [[200, 40, 40], [160, 20, 30], [220, 50, 70], [180, 30, 20]],
    L: [[240, 130, 30], [230, 110, 20], [250, 150, 60], [210, 100, 30]],
  };
  for (const [face, list] of Object.entries(samples)) {
    for (const rgb of list) assert.equal(classify(...rgb), face, `${face} ${rgb}`);
  }
});
