// Doladit podle mých sad (Lab → Tahy a váhy): vybereš sady s algoritmy, které sis sám
// vybral a vyhovují ti; aplikace je porovná se soupeři pro stejné případy (sbírka
// a volitelně krátké hledání v Labu pro zadání každého algoritmu) a naučí váhy tahů
// i návaznosti dvojic tahů tak, aby tvoje algoritmy vycházely nejlepší
// (ergonomics/fromsets.js). Vybrané sady si dialog pamatuje.

import { el, storage } from './dom.js';
import { algs, algSets, methods } from './store.js';
import { learnFromSets } from '../ergonomics/fromsets.js';
import { featureLabel } from '../ergonomics/calibrate.js';

const KEY = 'ergocube.learnsets';

/** Sady s algoritmy 3×3 napříč metodami: [{ id, name, count }]. */
function setsWithAlgs() {
  const out = [];
  for (const m of methods.list()) {
    for (const s of algSets.list(m.id)) {
      const count = algs.inSet(s.id).filter((a) => (a.task?.puzzle ?? '333') === '333').length;
      if (count) out.push({ id: s.id, name: methods.list().length > 1 ? `${m.name} · ${s.name}` : s.name, count });
    }
  }
  return out;
}

/**
 * @param {object} p
 * @param {object} p.puzzle 3×3
 * @param {() => object} p.config základ hodnocení
 * @param {() => object[]} p.extra uložená porovnání (Porovnat algoritmy, generátor)
 * @param {((a: object, seconds: number) => Promise<string[]>) | null} p.searchRivals soupeři z hledání (null = jen sbírka)
 * @param {(res: object) => void} p.onApply
 */
export function openLearnSets({ puzzle, config, extra, searchRivals, onApply }) {
  const saved = storage.get(KEY) ?? {};
  const sets = setsWithAlgs();
  const picked = new Set((saved.sets ?? []).filter((id) => sets.some((s) => s.id === id)));
  const close = el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít', textContent: '✕' });
  const body = el('div', { className: 'ls-body' });
  const dlg = el('dialog', { className: 'help-dialog ls-dialog' },
    el('div', { className: 'gen-head' }, el('h2', { textContent: 'Doladit podle mých sad' }), close), body);
  document.body.append(dlg);
  let cancelled = false;
  const done = () => { cancelled = true; dlg.close(); dlg.remove(); };
  close.onclick = done;
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(); });

  function pickView() {
    if (!sets.length) {
      body.replaceChildren(el('p', { textContent: 'Zatím nemáš uložené žádné algoritmy 3×3. Ulož si je z Labu nebo vlož v Trenažéru a pak se sem vrať.' }));
      return;
    }
    const count = () => sets.filter((s) => picked.has(s.id)).reduce((a, s) => a + s.count, 0);
    const go = el('button', { type: 'button', className: 'primary', textContent: 'Naučit váhy' });
    const info = el('small', { className: 'hint' });
    const sync = () => { go.disabled = !picked.size; info.textContent = picked.size ? `Vybráno ${count()} algoritmů.` : 'Vyber aspoň jednu sadu.'; };
    const list = el('div', { className: 'ls-sets' }, ...sets.map((s) => {
      const box = el('input', { type: 'checkbox', checked: picked.has(s.id) });
      box.onchange = () => { if (box.checked) picked.add(s.id); else picked.delete(s.id); sync(); };
      return el('label', { className: 'check-row' }, box, ` ${s.name} `, el('small', { textContent: `(${s.count})` }));
    }));
    const search = el('select', { ariaLabel: 'Hledání soupeřů' },
      el('option', { value: '0', textContent: 'Jen sbírka oblíbených algoritmů (rychle)' }),
      el('option', { value: '2', textContent: 'I hledání v Labu – 2 s na algoritmus' }),
      el('option', { value: '5', textContent: 'I hledání v Labu – 5 s na algoritmus (přesnější)' }));
    search.value = String(saved.seconds ?? (searchRivals ? 2 : 0));
    search.disabled = !searchRivals;
    const prefs = extra();
    const withPrefs = el('input', { type: 'checkbox', checked: saved.prefs ?? true });
    go.onclick = () => {
      const seconds = Number(search.value) || 0;
      storage.set(KEY, { sets: [...picked], seconds, prefs: withPrefs.checked });
      run(seconds, withPrefs.checked ? prefs : []);
    };
    sync();
    body.replaceChildren(
      el('p', { className: 'hint', textContent: 'Vyber sady, ve kterých máš algoritmy, které ti vyhovují. Každý se porovná s jinými algoritmy pro stejný případ (oblíbené algoritmy skladačů a co najde Lab pro jeho zadání). Váhy tahů, přehmatů a návaznosti dvojic tahů po sobě se nastaví tak, aby tvoje algoritmy vycházely nejlepší – hledání pak dává přednost podobným.' }),
      list, info,
      el('label', { className: 'field' }, 'Soupeři', search),
      prefs.length ? el('label', { className: 'check-row' }, withPrefs, ` Započítat i moje porovnání a volby (${prefs.length})`) : '',
      el('div', { className: 'row-btns' }, go));
  }

  async function run(seconds, prefs) {
    const mine = algs.list().filter((a) => picked.has(a.set ?? 'default') && (a.task?.puzzle ?? '333') === '333' && a.enabled !== false);
    const bar = el('div', { className: 'gen-bar' });
    const head = el('p', { className: 'cmp-progress' });
    const stop = el('button', { type: 'button', className: 'secondary small', textContent: 'Dost – spočítat z toho, co mám' });
    let early = false;
    stop.onclick = () => { early = true; };
    body.replaceChildren(head, el('div', { className: 'gen-track' }, bar), seconds && searchRivals ? stop : '');
    const rivals = new Map();
    if (seconds && searchRivals) {
      for (let i = 0; i < mine.length && !cancelled && !early; i++) {
        head.textContent = `Hledám soupeře: ${i + 1} z ${mine.length} – ${mine[i].name}`;
        bar.style.width = `${(i / mine.length) * 100}%`;
        try { rivals.set(mine[i].id, await searchRivals(mine[i], seconds)); } catch { /* bez soupeřů z hledání */ }
      }
      if (cancelled) return;
    }
    bar.style.width = '100%';
    head.textContent = 'Počítám váhy…';
    await new Promise((r) => setTimeout(r, 30));
    const res = learnFromSets(puzzle, config(), mine, { rivals, extra: prefs });
    resultView(res);
  }

  function resultView(res) {
    const again = el('button', { type: 'button', className: 'secondary small', textContent: 'Zpět' });
    again.onclick = pickView;
    const ok = el('button', { type: 'button', className: 'primary small', textContent: 'Zavřít' });
    ok.onclick = done;
    if (!res.ok) { body.replaceChildren(el('p', { textContent: res.reason }), el('div', { className: 'row-btns' }, again, ok)); return; }
    onApply(res);
    const moves = res.changes.filter((c) => !c.key.startsWith('pair:'));
    const pairs = res.changes.filter((c) => c.key.startsWith('pair:'));
    const item = (c) => el('li', { textContent: `${featureLabel(c.key)}: ${c.from} → ${c.to} ${c.to > c.from ? '(nepohodlnější)' : '(pohodlnější)'}` });
    const byChange = (a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from);
    body.replaceChildren(
      el('p', { className: 'cmp-result ls-result', textContent: `Tvůj algoritmus teď vychází nejlepší u ${res.winsAfter} z ${res.cases} případů (předtím u ${res.winsBefore}).` }),
      el('p', { className: 'hint', textContent: `Porovnáno se ${res.pairs} soupeři. Nové váhy se hned použijí v hodnocení i hledání.` }),
      moves.length ? el('h3', { textContent: 'Tahy a místa' }) : '',
      moves.length ? el('ul', { className: 'cmp-changes' }, ...moves.sort(byChange).slice(0, 12).map(item)) : '',
      pairs.length ? el('h3', { textContent: 'Návaznost tahů po sobě' }) : '',
      pairs.length ? el('ul', { className: 'cmp-changes' }, ...pairs.sort(byChange).slice(0, 12).map(item)) : '',
      !res.changes.length ? el('p', { className: 'hint', textContent: 'Váhy sedí, nic se nezměnilo.' }) : '',
      el('div', { className: 'row-btns' }, again, ok));
  }

  pickView();
  dlg.showModal();
  return dlg;
}
