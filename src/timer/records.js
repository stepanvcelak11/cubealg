// Moje rekordy (Statistiky → Moje rekordy): vlastní tabulka jako v Excelu – řádky kostky
// (i takové, které timer nezná), sloupce druhy rekordů (single, mo3, ao5, ao12…), v buňce čas
// s datem a historie zlepšení. Jde vložit zkopírovanou tabulku z Excelu / Tabulek Google
// (tabulátor, středník nebo čárka) a stáhnout ji zpátky jako CSV.

import { parseTime, formatTime } from './stats.js';

/** Výchozí sloupce. */
export const DEFAULT_COLUMNS = ['single', 'mo3', 'ao5', 'ao12', 'ao50', 'ao100'];
/** Názvy sloupců (vlastní sloupec = jeho text). */
export const COLUMN_LABEL = { single: 'Single', mo3: 'Mo3', ao5: 'Ao5', ao12: 'Ao12', ao25: 'Ao25', ao50: 'Ao50', ao100: 'Ao100', ao1000: 'Ao1000', mean: 'Průměr' };
export const columnLabel = (c) => COLUMN_LABEL[c] ?? c;

/** Prázdná tabulka. */
export const emptyTable = () => ({ columns: [...DEFAULT_COLUMNS], rows: [] });

/** Sloupec z textu záhlaví („Single“, „ao 5“, „průměr z 12“, „Best“…). */
export function columnOf(header) {
  const h = String(header ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!h) return null;
  if (/^(single|best|nejlepší|nejlepsi|jedno(složení)?|pb)$/.test(h)) return 'single';
  const m = h.match(/^(?:ao|avg|průměrz?|prumerz?|average(?:of)?)(\d+)$/) ?? h.match(/^(\d+)$/);
  if (m) return `ao${m[1]}`;
  const mo = h.match(/^(?:mo|mean(?:of)?)(\d+)$/);
  if (mo) return `mo${mo[1]}`;
  if (/^(mean|průměr|prumer)$/.test(h)) return 'mean';
  return String(header).trim();
}

/** Hodnota buňky: čas (ms), DNF, nebo počet tahů u FMC; null = prázdná / nejde přečíst. */
export function cellValue(text) {
  const s = String(text ?? '').trim();
  if (!s || s === '-' || s === '–') return null;
  if (/^dnf$/i.test(s)) return { t: Infinity };
  const v = parseTime(s.replace(/s$/i, ''));
  return v && v.p !== -1 ? { t: v.t + v.p } : null;
}

/** Zápis hodnoty jako v timeru (12.34, 1:02.45, DNF). */
export const showValue = (t) => (t === Infinity ? 'DNF' : Number.isFinite(t) ? formatTime(t) : '');

/**
 * Tabulka vložená z Excelu: první řádek záhlaví (první buňka = kostka), další řádky kostky.
 * Bez záhlaví (první řádek začíná časem) se použijí výchozí sloupce.
 * @returns {{columns: string[], rows: {name: string, cells: Record<string, number>}[], skipped: number}}
 */
export function parseTable(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim());
  if (!lines.length) return { columns: [], rows: [], skipped: 0 };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const split = (l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  const first = split(lines[0]);
  const header = first.slice(1).some((c) => c && !cellValue(c));
  const NOTE = /^(poznámka|poznamka|pozn\.?|note|notes|komentář|komentar)$/i;
  const all = header ? first.slice(1).map(columnOf).map((c, i) => c ?? `Sloupec ${i + 1}`) : DEFAULT_COLUMNS.slice(0, first.length - 1);
  const noteAt = all.findIndex((c) => NOTE.test(c));
  const columns = all.map((c, i) => (i === noteAt ? null : c));
  const rows = [];
  let skipped = 0;
  for (const line of lines.slice(header ? 1 : 0)) {
    const [name, ...cells] = split(line);
    if (!name) continue;
    const row = { name, cells: {} };
    cells.forEach((c, i) => {
      if (i === noteAt) { if (c) row.note = c; return; }
      if (!columns[i]) return;
      const v = cellValue(c);
      if (v) row.cells[columns[i]] = v.t;
      else if (c) skipped++;
    });
    rows.push(row);
  }
  return { columns: columns.filter(Boolean), rows, skipped };
}

/**
 * Zapíše hodnotu do tabulky: při změně se stará hodnota přesune do historie buňky.
 * @param {object} table · @param {string} name kostka · @param {string} column · @param {number|null} t ms (null = smazat)
 */
export function setRecord(table, name, column, t, date = new Date().toISOString().slice(0, 10)) {
  const out = { ...table, columns: table.columns.includes(column) ? table.columns : [...table.columns, column], rows: table.rows.map((r) => ({ ...r, cells: { ...r.cells }, dates: { ...(r.dates ?? {}) }, history: { ...(r.history ?? {}) } })) };
  let row = out.rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (!row) { row = { name, cells: {}, dates: {}, history: {} }; out.rows.push(row); }
  const old = row.cells[column];
  if (old === t) return out;
  if (Number.isFinite(old) || old === Infinity) row.history[column] = [...(row.history[column] ?? []), { t: old, date: row.dates[column] ?? null }].slice(-20);
  if (t == null) { delete row.cells[column]; delete row.dates[column]; } else { row.cells[column] = t; row.dates[column] = date; }
  return out;
}

/** Vloží tabulku z Excelu do mojí (stejné kostky se doplní, nové přibudou). */
export function mergeTable(table, parsed, date) {
  let out = { ...table, columns: [...table.columns] };
  for (const c of parsed.columns) if (c && !out.columns.includes(c)) out.columns.push(c);
  for (const r of parsed.rows) {
    if (!out.rows.some((x) => x.name.toLowerCase() === r.name.toLowerCase())) out = { ...out, rows: [...out.rows, { name: r.name, cells: {}, dates: {}, history: {} }] };
    for (const [c, t] of Object.entries(r.cells)) out = setRecord(out, r.name, c, t, date);
    if (r.note) out = { ...out, rows: out.rows.map((x) => (x.name.toLowerCase() === r.name.toLowerCase() ? { ...x, note: r.note } : x)) };
  }
  return out;
}

/** Tabulka jako CSV (středník – Excel v češtině ho otevře rovnou), s poznámkou na konci řádku. */
export function toCsv(table) {
  const esc = (s) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = ['Kostka', ...table.columns.map(columnLabel), 'Poznámka'];
  const lines = table.rows.map((r) => [r.name, ...table.columns.map((c) => showValue(r.cells[c])), r.note ?? ''].map((x) => esc(String(x))).join(';'));
  return [head.map(esc).join(';'), ...lines].join('\n');
}
