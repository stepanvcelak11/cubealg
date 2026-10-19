// Výběr sady algoritmů (select s volbami „Nová sada…“, přejmenovat, smazat).

import { el } from './dom.js';
import { algSets, algs } from './store.js';

/**
 * Naplní select sadami.
 * @param {HTMLSelectElement} select
 * @param {string} value vybraná sada (nebo 'all')
 * @param {{all?: boolean, manage?: boolean}} [opts] all = volba „Všechny sady“, manage = přejmenovat/smazat
 */
export function setOptions(select, value, { all = false, manage = false } = {}) {
  const count = (id) => algs.inSet(id).length;
  select.replaceChildren(
    all ? el('option', { value: 'all', textContent: `Všechny sady (${algs.list().length})` }) : null,
    ...algSets.list().map((s) => el('option', { value: s.id, textContent: `${s.name} (${count(s.id)})` })),
    el('option', { value: '+new', textContent: '+ Nová sada…' }),
    manage && value !== 'all' ? el('option', { value: '+rename', textContent: 'Přejmenovat sadu…' }) : null,
    manage && value !== 'all' && value !== 'default' ? el('option', { value: '+delete', textContent: 'Smazat sadu…' }) : null,
  );
  select.value = value === 'all' && all ? 'all' : algSets.get(value).id;
}

/** Zpracuje volbu v selectu sad; vrací id sady, která má být vybraná. */
export function pickSet(select, current) {
  const v = select.value;
  if (v === '+new') {
    const name = prompt('Název nové sady (např. situace nebo metoda):', '')?.trim();
    return name ? algSets.add(name) : current;
  }
  if (v === '+rename') {
    const name = prompt('Nový název sady:', algSets.get(current).name)?.trim();
    if (name) algSets.rename(current, name);
    return current;
  }
  if (v === '+delete') {
    const s = algSets.get(current);
    const n = algs.inSet(current).length;
    if (confirm(`Smazat sadu „${s.name}“?${n ? ` Jejích ${n} algoritmů se přesune do „${algSets.get('default').name}“.` : ''}`)) {
      algSets.remove(current);
      return 'default';
    }
    return current;
  }
  return v;
}
