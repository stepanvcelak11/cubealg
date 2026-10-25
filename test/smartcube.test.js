import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solved, applyAlg } from '../src/core/cube.js';
import { mergeQuarters, fluentSegments, reconstruct, packMoves, unpackMoves } from '../src/smartcube/recon.js';
import { ganCipher, gen3Driver } from '../src/smartcube/gan.js';
import { buildPlan } from '../src/sim/plan.js';
import { holdOf } from '../src/core/hold.js';
import { DEFAULT_FRAME } from '../src/ui/parts.js';
import { TEMPLATES, templateGuide } from '../src/sim/templates.js';

const timed = (alg, gap = 100, start = 0) => alg.split(' ').map((move, i) => ({ move, t: start + i * gap }));

test('chytrá kostka: dva čtvrttahy rychle po sobě jsou dvojitý tah, U U\' se zruší', () => {
  const m = mergeQuarters([{ move: 'R', t: 0 }, { move: 'U', t: 100 }, { move: 'U', t: 180 }, { move: "R'", t: 300 }, { move: 'F', t: 700 }, { move: "F'", t: 760 }, { move: 'R', t: 1500 }, { move: 'R', t: 2000 }]);
  assert.deepEqual(m.map((x) => x.move), ['R', 'U2', "R'", 'R', 'R']);
  assert.equal(m[1].end, 180);
});

test('chytrá kostka: plynulé úseky bez pauzy (pro kalibraci ergonomie)', () => {
  const moves = mergeQuarters([...timed("R U R' U'", 100), ...timed("F R U R' U' F'", 90, 2000)]);
  const seg = fluentSegments(moves);
  assert.deepEqual(seg.map((s) => s.alg), ["R U R' U'", "F R U R' U' F'"]);
  assert.equal(seg[0].ms, 300);
});

test('chytrá kostka: rozbor složení po krocích metody (CFOP: kříž, páry, OLL, PLL)', () => {
  let n = 0;
  const guide = templateGuide(TEMPLATES.find((t) => t.id === 'cfop'), DEFAULT_FRAME, (title) => ({ id: `s${++n}`, title }));
  const config = Object.fromEntries(guide.steps.map((st) => [st.id, { ...(st.sim ?? {}) }]));
  const { plan, steps } = buildPlan({ guide, config });
  // zamíchání = inverze složení: T-perm na konci (PLL), Sune (OLL)
  const solve = "R U R' U' R' F R2 U' R' U' R U R' F'";
  const sune = "R U R' U R U2 R'";
  const all = `${sune} ${solve}`;
  // kostka hlásí tahy podle středů (bílý střed = U); metoda drží bílou dole – tahy v držení metody
  const hold = holdOf(plan.variants[0].hold);
  const real = (alg) => hold.toModelString(alg);
  const inverse = (alg) => alg.split(' ').reverse().map((m) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : `${m}'`)).join(' ');
  const start = applyAlg(solved(), real(inverse(all)));
  const moves = mergeQuarters([...timed(real(sune), 100, 1000), ...timed(real(solve), 100, 3000)]);
  const r = reconstruct(start, moves, plan, steps.map((x) => x.st.title));
  for (const s of r.steps) s.alg = hold.toHeldString(s.alg);
  assert.equal(r.done, true);
  const oll = r.steps.find((s) => s.title === 'OLL'), pll = r.steps.find((s) => s.title === 'PLL');
  assert.equal(oll.alg, sune);
  assert.equal(pll.alg, solve);
  assert.equal(pll.recog, 3000 - (1000 + 6 * 100));
  assert.ok(r.steps.filter((s) => s.title.startsWith('Pár')).every((s) => s.skipped));
  assert.deepEqual(unpackMoves(packMoves(moves)).map((x) => x.move), moves.map((x) => x.move));
});

test('chytrá kostka: Gen3 – šifrování a čtení tahů', async () => {
  const c = ganCipher('AB:12:CD:34:EF:56');
  const d = gen3Driver();
  const bits = (buf, start, len, value) => { for (let i = 0; i < len; i++) if ((value >> (len - 1 - i)) & 1) buf[(start + i) >> 3] |= 0x80 >> ((start + i) & 7); };
  // stav kostky (složená: rohy 0…6, hrany 0…10, natočení 0), serial 10
  const f = new Uint8Array(16);
  f.set([0x55, 0x02, 0x10, 10, 0]);
  for (let i = 0; i < 7; i++) bits(f, 40 + i * 3, 3, i);
  for (let i = 0; i < 11; i++) bits(f, 77 + i * 4, 4, i);
  const ev = await d.handle(c.decrypt(c.encrypt(f)), async () => {}, 0);
  assert.equal(ev[0].facelets, 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
  // tah R' (směr 1, stěna R = 32) se serialem 11 a časem kostky 500 ms
  const m = new Uint8Array(16);
  m.set([0x55, 0x01, 0x08]);
  m[3] = 500 & 0xff; m[4] = 500 >> 8; m[7] = 11;
  bits(m, 72, 2, 1); bits(m, 74, 6, 32);
  const mv = await d.handle(c.decrypt(c.encrypt(m)), async () => {}, 10);
  assert.deepEqual(mv.map((x) => [x.move, x.cubeTime]), [["R'", 500]]);
});
