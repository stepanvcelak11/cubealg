// Výběr sady algoritmů (select s volbami „Nová sada…“, přejmenovat, smazat).

import { el } from './dom.js';
import { algSets, algs, defaultSetId } from './store.js';
import { openCopySets } from './copysets.js';

/**
 * Naplní select sadami.
 * @param {HTMLSelectElement} select
 * @param {string} value vybraná sada (nebo 'all')
 * @param {{all?: boolean, manage?: boolean}} [opts] all = volba „Všechny sady“, manage = přejmenovat/smazat
 */
export function setOptions(select, value, { all = false, manage = false, pick = null } = {}) {
  const count = (id) => algs.inSet(id).length;
  const own = pick !== null && pick !== undefined; // vlastní výběr algoritmů (trenažér), číslo = kolik
  select.replaceChildren(...[
    own && pick ? el('option', { value: 'pick', textContent: `Můj výběr (${pick})` }) : null,
    all ? el('option', { value: 'all', textContent: `Všechny sady (${algs.inMethod().length})` }) : null,
    ...algSets.list().map((s) => el('option', { value: s.id, textContent: `${s.name} (${count(s.id)})` })),
    own ? el('option', { value: '+pick', textContent: 'Vybrat algoritmy k tréninku…' }) : null,
    el('option', { value: '+new', textContent: '+ Nová sada…' }),
    manage ? el('option', { value: '+copy', textContent: 'Kopírovat sady z/do jiné metody…' }) : null,
    manage && value !== 'all' && value !== 'pick' ? el('option', { value: '+rename', textContent: 'Přejmenovat sadu…' }) : null,
    manage && value !== 'all' && value !== 'pick' && value !== defaultSetId() ? el('option', { value: '+delete', textContent: 'Smazat sadu…' }) : null,
  ].filter(Boolean));
  const known = algSets.list().some((x) => x.id === value);
  select.value = value === 'pick' && own && pick ? 'pick' : value === 'all' && all ? 'all' : known ? value : defaultSetId();
}

/** Zpracuje volbu v selectu sad; vrací id sady, která má být vybraná. */
export function pickSet(select, current) {
  const v = select.value;
  if (v === '+new') {
    const name = prompt('Název nové sady (např. situace):', '')?.trim();
    return name ? algSets.add(name) : current;
  }
  if (v === '+copy') {
    openCopySets();
    return current;
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
