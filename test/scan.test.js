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

import { labModel } from '../src/ui/models.js';
import { toPalette, polyScale } from '../src/ui/scan.js';
import { CUBE_COLORS, PYRAMINX_COLORS } from '../src/puzzles/colors.js';

test('focení: obrys stěn pokrývá každou nálepku právě jednou', () => {
  const expected = { 333: [6, 9], 222: [6, 4], skewb: [6, 5], pyram: [4, 9] };
  for (const [id, [faces, per]] of Object.entries(expected)) {
    const m = labModel(id);
    const spec = m.scan;
    assert.equal(spec.faces.length, faces, id);
    const seen = new Set();
    for (const f of spec.faces) {
      const { indices, polys } = spec.cells(f);
      assert.equal(indices.length, per, `${id} ${f}`);
      assert.equal(polys.length, per);
      for (const i of indices) { assert.ok(!seen.has(i)); seen.add(i); assert.equal(m.P.stickerFace[i], f); }
      for (const poly of polys) for (const [x, y] of poly) {
        assert.ok(x > -1e-9 && x < 1 + 1e-9 && y > -1e-9 && y < 1 + 1e-9, `${id} ${f} mimo ${x},${y}`);
      }
    }
    assert.equal(seen.size, m.P.size, id);
  }
});

test('focení: Pyraminx – zvolený vrchol je nahoře a stěna nezrcadlí', () => {
  const spec = labModel('pyram').scan;
  for (const f of spec.faces) {
    const { marks } = spec.cells(f);
    assert.equal(marks.length, 3);
    const top = marks.reduce((a, b) => (b.at[1] < a.at[1] ? b : a));
    assert.equal(top.text, { F: 'U', L: 'U', R: 'U', D: 'B' }[f]);
    // ostatní dva vrcholy leží dole, vlevo a vpravo od vrcholu
    const [a, b] = marks.filter((m) => m !== top);
    assert.ok(Math.abs(a.at[1] - b.at[1]) < 1e-3);
    assert.ok(Math.abs((a.at[0] + b.at[0]) / 2 - top.at[0]) < 1e-3);
  }
  // pohled zvenku, vrchol nahoře: F má L vlevo a R vpravo (jako v síti)
  const F = spec.cells('F').marks;
  assert.ok(F.find((m) => m.text === 'L').at[0] < F.find((m) => m.text === 'R').at[0]);
});

test('focení: 3×3 pozná stěnu podle středu', () => {
  const spec = labModel('333').scan;
  assert.equal(spec.detect(['U', 'U', 'U', 'U', 'F', 'U', 'U', 'U', 'U']), 'F');
});

test('focení: barvy se převádějí do palety hlavolamu', () => {
  assert.equal(toPalette('F', CUBE_COLORS), 'F');
  assert.equal(toPalette('F', PYRAMINX_COLORS), 'F');
  assert.equal(toPalette('B', PYRAMINX_COLORS), 'R');   // modrá = stěna R
  assert.equal(toPalette('R', PYRAMINX_COLORS), 'L');   // červená = stěna L
  assert.equal(toPalette('L', PYRAMINX_COLORS), 'L');   // oranžová → nejbližší červená
  assert.equal(toPalette('U', PYRAMINX_COLORS), 'D');   // bílá (přeexponovaná žlutá) → žlutá
  assert.ok(Math.abs(polyScale([[0, 0], [1, 0], [1, 1], [0, 1]]) - 1) < 1e-9);
});
