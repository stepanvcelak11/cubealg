import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recogStats, recordRecog, recogWeight, pickRecog, optionsFor } from '../src/ui/recog.js';

const a = (id, name, recog, puzzle = '333') => ({ id, name, recog, task: { puzzle } });

test('záznam a statistiky rozpoznání', () => {
  let r = recordRecog(undefined, true, 900);
  r = recordRecog(r, false, 3000);
  r = recordRecog(r, true, 1100);
  const s = recogStats({ recog: r });
  assert.deepEqual([s.n, s.ok, s.t], [3, 2, [900, 1100]]);
  assert.equal(s.avg, 1000);
  assert.equal(Math.round(s.acc * 100), 67);
});

test('výběr: nové a špatně poznávané častěji, ne dvakrát stejný', () => {
  const good = a('g', 'G', { n: 10, ok: 10, t: [500] });
  const bad = a('b', 'B', { n: 10, ok: 3, t: [2500] });
  assert.ok(recogWeight(bad) > recogWeight(good));
  assert.ok(recogWeight(a('n', 'N')) > recogWeight(good));
  let seq = 0;
  const rnd = () => (seq++ % 10) / 10;
  for (let i = 0; i < 20; i++) assert.notEqual(pickRecog([good, bad], 'g', rnd).id, 'g');
});

test('možnosti: správná odpověď je mezi nimi, jen stejný hlavolam a různé názvy', () => {
  const list = [a('1', 'T'), a('2', 'Y'), a('3', 'Ja'), a('4', 'Jb'), a('5', 'V'), a('6', 'Sune', null, 'pyram'), a('7', 'T')];
  const opts = optionsFor(list[0], list, 4);
  assert.equal(opts.length, 4);
  assert.ok(opts.includes(list[0]));
  assert.ok(opts.every((o) => o.task.puzzle === '333'));
  assert.equal(new Set(opts.map((o) => o.name)).size, 4);
});
