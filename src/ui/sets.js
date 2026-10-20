// Výběr sady algoritmů (select s volbami „Nová sada…“, přejmenovat, smazat).

import { el } from './dom.js';
import { algSets, algs, defaultSetId } from './store.js';

/**
 * Naplní select sadami.
 * @param {HTMLSelectElement} select
 * @param {string} value vybraná sada (nebo 'all')
 * @param {{all?: boolean, manage?: boolean}} [opts] all = volba „Všechny sady“, manage = přejmenovat/smazat
 */
export function setOptions(select, value, { all = false, manage = false } = {}) {
  const count = (id) => algs.inSet(id).length;
  select.replaceChildren(...[
    all ? el('option', { value: 'all', textContent: `Všechny sady (${algs.inMethod().length})` }) : null,
    ...algSets.list().map((s) => el('option', { value: s.id, textContent: `${s.name} (${count(s.id)})` })),
    el('option', { value: '+new', textContent: '+ Nová sada…' }),
    manage && value !== 'all' ? el('option', { value: '+rename', textContent: 'Přejmenovat sadu…' }) : null,
    manage && value !== 'all' && value !== defaultSetId() ? el('option', { value: '+delete', textContent: 'Smazat sadu…' }) : null,
  ].filter(Boolean));
  const known = algSets.list().some((x) => x.id === value);
  select.value = value === 'all' && all ? 'all' : known ? value : defaultSetId();
}

/** Zpracuje volbu v selectu sad; vrací id sady, která má být vybraná. */
export function pickSet(select, current) {
  const v = select.value;
  if (v === '+new') {
    const name = prompt('Název nové sady (např. situace):', '')?.trim();
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
    if (confirm(`Smazat sadu „${s.name}“?${n ? ` Jejích ${n} algoritmů se přesune do „${algSets.get(defaultSetId()).name}“.` : ''}`)) {
      algSets.remove(current);
      return defaultSetId();
    }
    return current;
  }
  return v;
}
