import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAlg } from '../src/ergonomics/score.js';

const flow = (alg) => scoreAlg(alg).breakdown.flow;

test('návaznost: plynulé triggery jsou lepší než stejné tahy v nešikovném pořadí', () => {
  // sexy move střídá ruce, U F U' F' tahá jedním prstem dvakrát po sobě
  assert.ok(flow("R U R' U'") < flow("U F U' F'"));
  // U po R jde pravým ukazováčkem, U po R' ne
  assert.ok(flow("R U") < flow("R' U"));
  // sledgehammer: F po R' je přirozené, F po R ne
  assert.ok(flow("R' F") < flow("R F"));
});

test('návaznost: důvod u tahu a promítnutí do celkového skóre', () => {
  const s = scoreAlg("U F U' F'");
  assert.ok(s.perMove.some((m) => /stejný prst/.test(m.flowReason ?? '')));
  const off = scoreAlg("U F U' F'", { flowScale: 0 });
  assert.equal(off.breakdown.flow, 0);
  assert.ok(s.total > off.total);
});

test('návaznost: rotace přeruší prstoklad', () => {
  const s = scoreAlg("R' y U");
  assert.equal(s.perMove[1].flow, 0);
  assert.equal(s.perMove[2].flowReason, null);
});
