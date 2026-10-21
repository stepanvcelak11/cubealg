import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, search, tableKeys, NEAR_LIMIT } from '../src/search/engine.js';
import { caseOf } from '../src/core/cube.js';
import { SLOTS } from '../src/core/geometry.js';
import { MoveSet } from '../src/core/moveset.js';

test('pattern databáze z mezipaměti: stejné klíče, stejné výsledky hledání', () => {
  const constraints = Object.fromEntries(SLOTS.map((s) => [s.name, 'solved']));
  const moves = new MoveSet({ bases: ['R', 'U', 'F'] }).moves();
  const store = new Map();
  let sets = 0, gets = 0;
  const cache = { get: (k) => { const v = store.get(k); if (v) gets++; return v; }, set: (k, v) => { sets++; store.set(k, v); } };
  const opts = { constraints, moves, nearLimit: NEAR_LIMIT / 8 };
  const a = prepare({ ...opts, cache });
  assert.equal(sets, a.tables.length);
  assert.deepEqual([...store.keys()].sort(), tableKeys(opts).sort());
  const b = prepare({ ...opts, cache });
  assert.equal(gets, b.tables.length);
  const start = caseOf("R U R' U' R' F R2 U' R' U' R U R' F'");
  const ra = search(a, start, { maxLength: 14, extraDepth: 0 });
  const rb = search(b, start, { maxLength: 14, extraDepth: 0 });
  assert.deepEqual(rb.solutions, ra.solutions);
  // jiné tahy nebo jiný cíl = jiné klíče
  const other = tableKeys({ ...opts, moves: new MoveSet({ bases: ['R', 'U'] }).moves() });
  assert.ok(other.every((k) => !store.has(k)));
});
