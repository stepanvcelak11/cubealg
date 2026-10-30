// Výběr k tréninku (Trenažér → Sada → Vybrat algoritmy k tréninku…): ze svých sad
// (i z víc sad a metod najednou) zaškrtáš celé sady nebo jednotlivé algoritmy.
// Trenažér pak dává případy jen z výběru (Můj výběr).

import { el } from './dom.js';
import { algs, algSets, methods } from './store.js';

/**
 * @param {{picked: Set<string>, onDone: (ids: string[]) => void}} p
 */
export function openTrainPick({ picked, onDone }) {
  const chosen = new Set([...picked].filter((id) => algs.get(id)));
  const many = methods.list().length > 1;
  const groups = methods.list().flatMap((m) => algSets.list(m.id).map((s) => ({
    id: s.id, name: many ? `${m.name} · ${s.name}` : s.name, list: algs.inSet(s.id),
  }))).filter((g) => g.list.length);
  const close = el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít', textContent: '✕' });
  const filter = el('input', { type: 'search', className: 'tp-filter', placeholder: 'Hledat podle názvu nebo tahů', ariaLabel: 'Hledat' });
  const body = el('div', { className: 'tp-groups' });
  const count = el('span', { className: 'hint' });
  const go = el('button', { type: 'button', className: 'primary', textContent: 'Trénovat' });
  const none = el('button', { type: 'button', className: 'secondary small', textContent: 'Zrušit výběr' });
  const dlg = el('dialog', { className: 'help-dialog tp-dialog' },
    el('div', { className: 'gen-head' }, el('h2', { textContent: 'Co chceš trénovat?' }), close),
    el('p', { className: 'hint', textContent: 'Zaškrtni celé sady nebo rozbal sadu a vyber jednotlivé algoritmy. Trenažér ti pak dá zamíchání do vybraných případů.' }),
    filter, body, el('div', { className: 'row-btns tp-foot' }, count, none, go));
  document.body.append(dlg);
  const done = () => { dlg.close(); dlg.remove(); };
  close.onclick = done;
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(); });
  none.onclick = () => { chosen.clear(); render(); };
  go.onclick = () => { onDone([...chosen]); done(); };

  const open = new Set(groups.filter((g) => g.list.some((a) => chosen.has(a.id)) && !g.list.every((a) => chosen.has(a.id))).map((g) => g.id));
  function render() {
    const q = filter.value.trim().toLowerCase();
    const match = (a) => !q || a.name.toLowerCase().includes(q) || a.alg.toLowerCase().includes(q);
    body.replaceChildren(...groups.map((g) => {
      const list = g.list.filter(match);
      if (!list.length) return '';
      const n = g.list.filter((a) => chosen.has(a.id)).length;
      const all = el('input', { type: 'checkbox', checked: n === g.list.length, ariaLabel: `Celá sada ${g.name}` });
      all.indeterminate = n > 0 && n < g.list.length;
      all.onchange = () => { for (const a of g.list) { if (all.checked) chosen.add(a.id); else chosen.delete(a.id); } render(); };
      const det = el('details', { className: 'tp-group', open: !!q || open.has(g.id) });
      det.ontoggle = () => { if (det.open) open.add(g.id); else open.delete(g.id); };
      det.append(
        el('summary', {}, all, el('b', { textContent: ` ${g.name} ` }), el('small', { textContent: `${n} z ${g.list.length}` })),
        ...list.map((a) => {
          const cb = el('input', { type: 'checkbox', checked: chosen.has(a.id) });
          cb.onchange = () => { if (cb.checked) chosen.add(a.id); else chosen.delete(a.id); render(); };
          return el('label', { className: 'tp-alg' }, cb, el('span', { textContent: a.name }), el('code', { textContent: a.alg }));
        }));
      // klepnutí na zaškrtávátko sady nemá rozbalit/sbalit sadu
      all.onclick = (e) => e.stopPropagation();
      return det;
    }));
    if (!groups.length) body.replaceChildren(el('p', { className: 'hint', textContent: 'Zatím nemáš uložené žádné algoritmy.' }));
    count.textContent = `Vybráno ${chosen.size}`;
    go.disabled = !chosen.size;
    go.textContent = chosen.size ? `Trénovat (${chosen.size})` : 'Trénovat';
  }
  filter.oninput = render;
  render();
  dlg.showModal();
  return dlg;
}
