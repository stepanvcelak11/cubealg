import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg, toFacelets } from '../src/core/cube.js';
import { scrambledColors, parseNxN } from '../src/timer/nxn.js';

const ALGS = ["R U R' U'", "F2 D' L B2 U", "Rw Uw' Fw2 B", "R2 L2 U2 D2 F2 B2", "B' L F R' D U2"];

test('n×n: pro n = 3 totéž co jádro 3×3 (vč. širokých tahů)', () => {
  for (const alg of ALGS) {
    assert.equal(scrambledColors(3, alg), toFacelets(applyAlg(solved(), alg)), alg);
  }
});

test('n×n: inverze skládá kostku, čtyři čtvrtotáčky nic nezmění', () => {
  for (const n of [2, 4, 5, 6, 7]) {
    const solvedColors = scrambledColors(n, '');
    assert.equal(solvedColors.length, 6 * n * n);
    const alg = n === 2 ? "R U F' R2 U'" : `R U Fw' 3Rw2 U' ${n > 5 ? '3Uw ' : ''}Lw B2 Dw'`;
    const inverse = parseNxN(alg, n).reverse().map((m) => `${m.width > 1 ? m.width + m.face + 'w' : m.face}${m.turns === 2 ? '2' : m.turns === 1 ? "'" : ''}`).join(' ');
    assert.notEqual(scrambledColors(n, alg), solvedColors);
    assert.equal(scrambledColors(n, `${alg} ${inverse}`), solvedColors, `n=${n}`);
    for (const f of 'URFDLB') assert.equal(scrambledColors(n, `${f} ${f} ${f} ${f}`), solvedColors);
  }
});

test('n×n: počty barev zůstanou stejné', () => {
  const s = scrambledColors(5, "R Uw Fw2 3Rw' B 3Dw L2 Dw'");
  for (const f of 'URFDLB') assert.equal([...s].filter((c) => c === f).length, 25);
});
