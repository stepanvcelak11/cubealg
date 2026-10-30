// Kopírování sad algoritmů mezi metodami: vybereš cílovou metodu (i novou) a zaškrtáš
// sady z ostatních metod. Algoritmy se zkopírují (originály zůstanou, kde byly).

import { el } from './dom.js';
import { algs, algSets, methods, copySets } from './store.js';

/**
 * @param {{target?: string, onDone?: (r: {sets: number, algs: number, target: string}) => void}} [p]
 */
export function openCopySets({ target = methods.active(), onDone } = {}) {
  const chosen = new Set();
  const close = el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít', textContent: '✕' });
  const to = el('select', { className: 'small-select', ariaLabel: 'Kam kopírovat' });
  const body = el('div', { className: 'tp-groups' });
  const count = el('span', { className: 'hint' });
  const go = el('button', { type: 'button', className: 'primary', textContent: 'Kopírovat' });
  const dlg = el('dialog', { className: 'help-dialog tp-dialog cs-dialog' },
    el('div', { className: 'gen-head' }, el('h2', { textContent: 'Kopírovat sady algoritmů' }), close),
    el('p', { className: 'hint', textContent: 'Algoritmy se zkopírují, v původní metodě zůstanou. „Moje algoritmy“ se přidají do „Moje algoritmy“ cílové metody, ostatní sady vzniknou jako nové. Co už v cílové sadě je, se nezdvojí.' }),
    el('label', { className: 'cs-target' }, el('span', { textContent: 'Kopírovat do metody' }), to),
    el('b', { className: 'cs-from', textContent: 'Které sady' }),
    body, el('div', { className: 'row-btns tp-foot' }, count, go));
  document.body.append(dlg);
  const done = () => { dlg.close(); dlg.remove(); };
  close.onclick = done;
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(); });

  const fillTarget = () => {
    to.replaceChildren(...methods.list().map((m) => el('option', { value: m.id, textContent: m.name })),
      el('option', { value: '+new', textContent: '+ Nová metoda…' }));
    to.value = methods.get(target) ? target : 'default';
  };
  to.onchange = () => {
    if (to.value === '+new') {
      const name = prompt('Název nové metody:', '')?.trim();
      if (name) target = methods.add(name);
      fillTarget();
    } else target = to.value;
    render();
  };

  function render() {
    const groups = methods.list().filter((m) => m.id !== target).map((m) => ({
      m, sets: algSets.list(m.id).map((s) => ({ s, n: algs.inSet(s.id).length })).filter((x) => x.n),
    })).filter((g) => g.sets.length);
    for (const id of [...chosen]) if (algSets.methodOf(id) === target) chosen.delete(id);
    body.replaceChildren(...groups.map(({ m, sets }) => {
      const all = el('input', { type: 'checkbox', ariaLabel: `Všechny sady metody ${m.name}` });
      const n = sets.filter((x) => chosen.has(x.s.id)).length;
      all.checked = n === sets.length;
      all.indeterminate = n > 0 && n < sets.length;
      all.onchange = () => { for (const x of sets) { if (all.checked) chosen.add(x.s.id); else chosen.delete(x.s.id); } render(); };
      return el('div', { className: 'tp-group cs-group' },
        el('label', { className: 'cs-method' }, all, el('b', { textContent: ` ${m.name}` })),
        ...sets.map(({ s, n: k }) => {
          const cb = el('input', { type: 'checkbox', checked: chosen.has(s.id) });
          cb.onchange = () => { if (cb.checked) chosen.add(s.id); else chosen.delete(s.id); render(); };
          return el('label', { className: 'tp-alg' }, cb, el('span', { textContent: s.name }), el('small', { textContent: `${k} alg.` }));
        }));
    }));
    if (!groups.length) body.replaceChildren(el('p', { className: 'hint', textContent: 'Ostatní metody nemají žádné algoritmy.' }));
    const total = [...chosen].reduce((k, id) => k + algs.inSet(id).length, 0);
    count.textContent = chosen.size ? `${chosen.size} sad · ${total} algoritmů` : 'Nic nevybráno';
    go.disabled = !chosen.size;
  }
  go.onclick = () => {
    const r = copySets([...chosen], target);
    done();
    onDone?.({ ...r, target });
  };
  fillTarget();
  render();
  dlg.showModal();
  return dlg;
}
