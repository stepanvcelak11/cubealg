// Statistiky → Moje rekordy: vlastní tabulka rekordů místo Excelu (timer/records.js). Řádky
// kostky (i ty, které timer nezná), sloupce single / mo3 / ao5… a vlastní; klepnutím na buňku
// se zapíše čas (stejně jako ruční zadání v timeru), stará hodnota jde do historie. U kostek,
// které skládáš i v timeru, je pod buňkou rekord z timeru (⏱). Vložení z Excelu a CSV.

import { el, storage } from './dom.js';
import { solves } from './store.js';
import { summary } from '../timer/stats.js';
import { EVENTS } from '../timer/events.js';
import { emptyTable, setRecord, mergeTable, parseTable, toCsv, columnLabel, columnOf, cellValue, showValue } from '../timer/records.js';
import { toast } from './share.js';

const KEY = 'ergocube.mytable';
export const myTable = () => storage.get(KEY) ?? emptyTable();
const save = (t) => storage.set(KEY, t);

/** Rekord z timeru pro kostku řádku (podle názvu disciplíny) – ms nebo null. */
function timerRecord(name, column) {
  const ev = EVENTS.find((e) => e.result === 'time' && (e.name.toLowerCase() === name.toLowerCase() || e.id === name.toLowerCase()));
  if (!ev) return null;
  const list = solves.list(ev.id);
  if (!list.length) return null;
  const s = summary(list);
  const v = column === 'single' ? s.single.best : s[column]?.best;
  return Number.isFinite(v) ? v : null;
}

export function mountMyTable(host) {
  const draw = () => {
    const t = myTable();
    const editCell = (row, column, btn) => {
      const input = el('input', { className: 'mt-input', value: Number.isFinite(row.cells?.[column]) || row.cells?.[column] === Infinity ? showValue(row.cells[column]) : '', inputMode: 'decimal', ariaLabel: `${row.name} ${columnLabel(column)}`, placeholder: '12.34' });
      let finished = false;
      const done = (commit) => {
        if (finished) return;
        if (commit) {
          const raw = input.value.trim();
          const v = raw ? cellValue(raw) : null;
          if (raw && !v) { toast('Tohle jako čas nejde přečíst – napiš třeba 12.34, 1:02.45 nebo DNF'); return; }
          save(setRecord(myTable(), row.name, column, v ? v.t : null));
        }
        finished = true;
        draw();
      };
      input.onkeydown = (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
      input.onblur = () => done(true);
      btn.replaceWith(input);
      input.focus();
      input.select();
    };
    const head = el('tr', {}, el('th', { textContent: 'Kostka' }), ...t.columns.map((c) => el('th', { textContent: columnLabel(c) })), el('th', { textContent: 'Poznámka' }));
    const body = t.rows.map((row) => {
      const name = el('button', { type: 'button', className: 'mt-name', textContent: row.name, title: 'Přejmenovat nebo smazat' });
      name.onclick = () => {
        const n = prompt('Název kostky (prázdné = smazat řádek):', row.name);
        if (n === null) return;
        const tab = myTable();
        if (!n.trim()) { if (confirm(`Smazat „${row.name}“ i s historií?`)) save({ ...tab, rows: tab.rows.filter((r) => r.name !== row.name) }); }
        else save({ ...tab, rows: tab.rows.map((r) => (r.name === row.name ? { ...r, name: n.trim() } : r)) });
        draw();
      };
      const cells = t.columns.map((c) => {
        const v = row.cells?.[c];
        const timer = timerRecord(row.name, c);
        const hist = row.history?.[c] ?? [];
        const btn = el('button', { type: 'button', className: `mt-cell${v == null ? ' empty' : ''}`, ariaLabel: `${row.name} ${columnLabel(c)}`,
          title: hist.length ? `Dřív: ${hist.map((h) => `${showValue(h.t)}${h.date ? ` (${h.date})` : ''}`).reverse().join(', ')}` : 'Klepni a zapiš čas' },
        el('b', { textContent: v == null ? '–' : showValue(v) }),
        row.dates?.[c] ? el('small', { textContent: row.dates[c].split('-').reverse().join('. ').replace(/^0/, '') }) : null,
        hist.length ? el('i', { className: 'mt-hist', textContent: `↗ ${hist.length}` }) : null);
        btn.onclick = () => editCell(row, c, btn);
        // rekord z timeru (stejná kostka): když je lepší než zapsaný, jde převzít
        const better = timer != null && !(v <= timer);
        const take = timer != null ? el('button', { type: 'button', className: `mt-timer${better ? ' better' : ''}`, title: better ? 'Rekord z timeru je lepší – převzít do tabulky' : 'Rekord z timeru',
          textContent: `⏱ ${showValue(timer)}`, onclick: () => { if (better) { save(setRecord(myTable(), row.name, c, timer)); draw(); } } }) : null;
        return el('td', {}, btn, take);
      });
      const note = el('button', { type: 'button', className: 'mt-note', textContent: row.note || '+', title: 'Poznámka (kde, jaká kostka…)' });
      note.onclick = () => {
        const n = prompt(`Poznámka – ${row.name}:`, row.note ?? '');
        if (n === null) return;
        const tab = myTable();
        save({ ...tab, rows: tab.rows.map((r) => (r.name === row.name ? { ...r, note: n.trim() || undefined } : r)) });
        draw();
      };
      return el('tr', {}, el('th', { scope: 'row' }, name), ...cells, el('td', {}, note));
    });

    const addRow = el('select', { className: 'small-select', ariaLabel: 'Přidat kostku' },
      el('option', { value: '', textContent: '+ Přidat kostku…' }),
      ...EVENTS.filter((e) => e.result === 'time' && !t.rows.some((r) => r.name.toLowerCase() === e.name.toLowerCase())).map((e) => el('option', { value: e.name, textContent: e.name })),
      el('option', { value: '__own', textContent: 'Jiná (napíšu název)…' }));
    addRow.onchange = () => {
      let n = addRow.value;
      if (n === '__own') n = prompt('Název kostky (např. Mirror cube, Gear cube, 3×3 OH s nohama):')?.trim();
      if (n && !myTable().rows.some((r) => r.name.toLowerCase() === n.toLowerCase())) { const tab = myTable(); save({ ...tab, rows: [...tab.rows, { name: n, cells: {}, dates: {}, history: {} }] }); }
      draw();
    };
    const addCol = el('button', { type: 'button', className: 'secondary small', textContent: '+ Sloupec' });
    addCol.onclick = () => {
      const n = prompt('Nový sloupec (např. ao25, ao1000, mo3, nebo vlastní – Soutěž single):')?.trim();
      if (!n) return;
      const c = columnOf(n);
      const tab = myTable();
      if (!tab.columns.includes(c)) save({ ...tab, columns: [...tab.columns, c] });
      draw();
    };
    const paste = el('button', { type: 'button', className: 'secondary small', textContent: 'Vložit z Excelu' });
    paste.onclick = () => openPaste(draw);
    const csv = el('button', { type: 'button', className: 'secondary small', textContent: 'Stáhnout CSV' });
    csv.onclick = () => {
      const blob = new Blob([`﻿${toCsv(myTable())}`], { type: 'text/csv;charset=utf-8' });
      const a = el('a', { href: URL.createObjectURL(blob), download: `moje-rekordy-${new Date().toISOString().slice(0, 10)}.csv` });
      document.body.append(a); a.click(); a.remove();
    };
    const recent = t.rows.flatMap((r) => Object.entries(r.dates ?? {}).map(([c, d]) => ({ r, c, d }))).filter((x) => x.d).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 12);
    host.replaceChildren(
      el('article', { className: 'panel mt-panel' },
        el('div', { className: 'panel-head' }, el('h2', { textContent: 'Moje rekordy' })),
        el('p', { className: 'hint', textContent: 'Tvoje tabulka rekordů na všech kostkách – i těch, které timer nezná. Klepni na buňku a zapiš čas (12.34, 1:02.45, DNF), starší hodnota se uloží do historie. ⏱ = rekord ze složení v timeru (klepnutím ho převezmeš, když je lepší).' }),
        el('div', { className: 'row-btns mt-tools' }, addRow, addCol, paste, csv),
        t.rows.length
          ? el('div', { className: 'mt-scroll' }, el('table', { className: 'mt-table' }, el('thead', {}, head), el('tbody', {}, ...body)))
          : el('p', { className: 'mt-empty', textContent: 'Zatím prázdné – přidej kostku, nebo vlož celou tabulku z Excelu (zkopíruj buňky včetně záhlaví a klepni na „Vložit z Excelu“).' }),
        recent.length ? el('details', { className: 'mt-recent' }, el('summary', { textContent: 'Naposledy zapsané' }),
          el('ul', {}, ...recent.map(({ r, c, d }) => el('li', { textContent: `${d.split('-').reverse().join('. ')} · ${r.name} ${columnLabel(c)} ${showValue(r.cells[c])}` })))) : null));
  };
  draw();
  solves.subscribe(() => { if (!host.hidden) draw(); });
  return draw;
}

/** Vložení tabulky z Excelu: náhled, co se načte, pak doplnění do mojí tabulky. */
function openPaste(done) {
  const dlg = document.body.appendChild(el('dialog', { className: 'help-dialog mt-paste' }));
  const text = el('textarea', { rows: 8, className: 'guide-input', placeholder: 'Kostka\tSingle\tAo5\tAo12\n3×3\t8.52\t10.41\t11.02\nMegaminx\t1:12.40\t1:20.00\t', ariaLabel: 'Tabulka z Excelu' });
  const info = el('p', { className: 'hint', textContent: 'V Excelu označ tabulku i se záhlavím (první sloupec = kostka, první řádek = Single / Ao5 / Ao12…), zkopíruj a vlož sem.' });
  const ok = el('button', { type: 'button', className: 'primary', textContent: 'Vložit do tabulky', disabled: true });
  text.oninput = () => {
    const p = parseTable(text.value);
    ok.disabled = !p.rows.length;
    info.textContent = p.rows.length ? `Načtu ${p.rows.length} kostek a sloupce ${p.columns.map(columnLabel).join(', ')}${p.skipped ? ` · ${p.skipped} buněk nejde přečíst jako čas (vynechám)` : ''}` : 'Zatím nic k vložení.';
  };
  ok.onclick = () => {
    const p = parseTable(text.value);
    save(mergeTable(myTable(), p));
    toast(`Vloženo: ${p.rows.length} kostek`);
    dlg.close();
  };
  dlg.onclose = () => { dlg.remove(); done(); };
  dlg.replaceChildren(el('h2', { textContent: 'Vložit z Excelu' }), info, text,
    el('div', { className: 'row-btns share-actions' }, Object.assign(el('button', { type: 'button', className: 'secondary', textContent: 'Zrušit' }), { onclick: () => dlg.close() }), ok));
  dlg.showModal();
  text.focus();
}
