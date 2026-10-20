// Export složení do CSV (UTF-8, oddělovač čárka, Excel i tabulkové procesory).

const HEADER = ['disciplína', 'skupina', 'pořadí', 'datum', 'čas_ms', 'trest', 'výsledek_ms', 'vyřešeno', 'pokusů', 'zamíchání', 'poznámka'];

const cell = (v) => {
  const text = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/**
 * @param {{event:string, group:string, solves:object[]}[]} sets složení po skupinách
 * @param {(solve:object) => number} valueOf výsledná hodnota složení (Infinity = DNF)
 */
export function solvesToCsv(sets, valueOf) {
  const rows = [HEADER];
  for (const { event, group, solves } of sets) {
    solves.forEach((s, i) => {
      const v = valueOf(s);
      rows.push([
        event, group, i + 1, new Date(s.d).toISOString(), s.t,
        s.p === -1 ? 'DNF' : s.p > 0 ? '+2' : '', Number.isFinite(v) ? v : 'DNF',
        s.m?.solved, s.m?.attempted, s.s, s.n,
      ]);
    });
  }
  return `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
