import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTable, columnOf, cellValue, setRecord, mergeTable, toCsv, emptyTable, showValue } from '../src/timer/records.js';

test('moje rekordy: tabulka zkopírovaná z Excelu', () => {
  const text = 'Kostka\tSingle\tAo5\tAo12\tprůměr z 100\tPoznámka\n3×3\t8.52\t10,41\t11.02\t12.30\tdoma\n4×4\t41.2\t48.90\t\t\t\nMegaminx\t1:12.40\tDNF\t1:25.00\t\t\n';
  const t = parseTable(text);
  assert.deepEqual(t.columns, ['single', 'ao5', 'ao12', 'ao100']);
  assert.equal(t.rows[0].note, 'doma');
  assert.equal(t.rows.length, 3);
  assert.deepEqual(t.rows[0].cells, { single: 8520, ao5: 10410, ao12: 11020, ao100: 12300 });
  assert.equal(t.rows[2].cells.single, 72400);
  assert.equal(t.rows[2].cells.ao5, Infinity);
  assert.equal(t.skipped, 0);
  // středník (CSV z Excelu) a bez záhlaví
  const b = parseTable('2×2;1.98;3.21\nPyraminx;2.50;3.90');
  assert.deepEqual(b.columns, ['single', 'mo3']);
  assert.equal(b.rows[1].cells.mo3, 3900);
});

test('moje rekordy: záhlaví, hodnoty, historie zlepšení a CSV', () => {
  assert.equal(columnOf('Best'), 'single');
  assert.equal(columnOf('ao 12'), 'ao12');
  assert.equal(columnOf('Mo3'), 'mo3');
  assert.equal(columnOf('Slepě'), 'Slepě');
  assert.equal(cellValue('12.34s').t, 12340);
  assert.equal(cellValue('–'), null);
  let tab = setRecord(emptyTable(), '3×3', 'single', 9000, '2026-01-01');
  tab = setRecord(tab, '3×3', 'single', 8500, '2026-03-01');
  const row = tab.rows[0];
  assert.equal(row.cells.single, 8500);
  assert.deepEqual(row.history.single, [{ t: 9000, date: '2026-01-01' }]);
  // vlastní sloupec přibude, vložení doplní existující kostku
  tab = mergeTable(tab, parseTable('Kostka\tSingle\tOH ao5\n3×3\t8.10\t20.00\nClock\t6.00\t'), '2026-04-01');
  assert.ok(tab.columns.includes('OH ao5'));
  assert.equal(tab.rows.length, 2);
  assert.equal(tab.rows[0].cells.single, 8100);
  assert.equal(tab.rows[0].history.single.length, 2);
  const csv = toCsv(tab);
  assert.match(csv, /^Kostka;Single;Mo3;Ao5;Ao12;Ao50;Ao100;OH ao5;Poznámka\n3×3;8\.10;;;;;;20\.00;/);
  assert.equal(showValue(Infinity), 'DNF');
});
