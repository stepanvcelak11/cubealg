import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg } from '../src/core/cube.js';
import { HOLDS, holdOf, holdFromFaces } from '../src/core/hold.js';

const eq = (a, b) => a.join() === b.join();
const ALGS = ["R U R' U'", "F2 D' L B2 U", "M' E S2 r u' f", "x R U' y2 L z' D", "Rw Uw' Fw2 B"];

test('držení: 24 různých držení, výchozí je identita', () => {
  assert.equal(HOLDS.length, 24);
  assert.equal(HOLDS[0], '');
  const id = holdOf('');
  assert.equal(id.toModelString("R U2 F'"), "R U2 F'");
  assert.equal(id.describe(), 'bílá nahoře, zelená vpředu');
  assert.equal(new Set(HOLDS.map((r) => JSON.stringify(holdOf(r).faces))).size, 24);
});

test('držení: tah v ruce = tah modelu (kostka otočená do držení)', () => {
  // otočit do držení a táhnout v držení  ≡  táhnout v modelu a pak otočit do držení
  for (const rot of HOLDS) {
    const h = holdOf(rot);
    for (const alg of ALGS) {
      const viaHold = applyAlg(applyAlg(solved(), rot), alg);
      const viaModel = applyAlg(applyAlg(solved(), h.toModelString(alg)), rot);
      assert.ok(eq(viaHold, viaModel), `${rot || 'výchozí'} · ${alg}`);
    }
  }
});

test('držení: převod tam a zpět', () => {
  for (const rot of HOLDS) {
    const h = holdOf(rot);
    for (const alg of ALGS) assert.equal(h.toHeldString(h.toModelString(alg)), holdOf('').toHeldString(alg));
  }
});

test('držení: x = zelená nahoře, U v ruce je model. F', () => {
  const h = holdOf('x');
  assert.equal(h.describe(), 'zelená nahoře, žlutá vpředu');
  assert.equal(h.faces.F, 'U');
  assert.equal(h.toModel('U')[0].base, 'F');
  assert.equal(h.toModel('U')[0].amount, 1);
});

test('držení: určení podle stěn nahoře a vpředu', () => {
  for (const rot of HOLDS) {
    const f = holdOf(rot).faces;
    const up = Object.keys(f).find((k) => f[k] === 'U');
    const front = Object.keys(f).find((k) => f[k] === 'F');
    assert.equal(holdFromFaces(up, front), rot);
  }
  assert.equal(holdFromFaces('U', 'F'), '');
});

test('držení: matice natočení', () => {
  const lin = holdOf('').linear();
  assert.deepEqual(lin, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
});
