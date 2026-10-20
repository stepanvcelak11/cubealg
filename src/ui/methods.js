// Výběr metody v horní liště: přepne celou aplikaci (timer, statistiky, sady
// algoritmů v Labu i trenažér) do režimu zvolené metody.

import { $, el } from './dom.js';
import { methods, importMethod } from './store.js';
import { openGuide } from './guide.js';

let guideDeps = {};

function render() {
  const select = $('method');
  const active = methods.active();
  select.replaceChildren(...[
    ...methods.list().map((m) => el('option', { value: m.id, textContent: m.name })),
    el('option', { value: '+guide', textContent: 'Průvodce metodou…' }),
    el('option', { value: '+new', textContent: '+ Nová metoda…' }),
    el('option', { value: '+import', textContent: 'Importovat metodu…' }),
    el('option', { value: '+rename', textContent: 'Přejmenovat metodu…' }),
    active !== 'default' ? el('option', { value: '+delete', textContent: 'Smazat metodu…' }) : null,
  ].filter(Boolean));
  select.value = active;
  select.title = `Metoda: ${methods.get(active).name} – složení i algoritmy se ukládají k ní`;
  document.body.dataset.method = active;
}

function pick() {
  const select = $('method');
  const v = select.value;
  const active = methods.active();
  if (v === '+guide') {
    openGuide(guideDeps);
  } else if (v === '+import') {
    importFile();
  } else if (v === '+new') {
    const name = prompt('Název metody (např. Roux, ZZ nebo tvoje vlastní):', '')?.trim();
    if (name) methods.setActive(methods.add(name));
  } else if (v === '+rename') {
    const name = prompt('Nový název metody:', methods.get(active).name)?.trim();
    if (name) methods.rename(active, name);
  } else if (v === '+delete') {
    const m = methods.get(active);
    const { solves, algs } = methods.usage(active);
    const what = [solves && `${solves} složení`, algs && `${algs} algoritmů`].filter(Boolean).join(' a ');
    if (confirm(`Smazat metodu „${m.name}“${what ? ` i s ${what}` : ''}? Tohle nejde vrátit.`)) methods.remove(active);
  } else {
    methods.setActive(v);
  }
  render();
  select.blur();
}

function importFile() {
  const input = el('input', { type: 'file', accept: '.json,application/json' });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      importMethod(JSON.parse(await file.text()));
      openGuide(guideDeps);
    } catch (e) {
      alert(`Metodu se nepodařilo načíst: ${e.message}`);
    }
  };
  input.click();
}

/** Otevře průvodce aktivní metodou (edit: rovnou v úpravách). */
export function showGuide(opts = {}) {
  openGuide({ ...guideDeps, ...opts });
}

/**
 * @param {{labTask: () => object, train: (setId: string) => void, practice: (stepId: string) => void}} deps
 *   labTask – současné zadání Labu (obrázek kroku), train – trénovat sadu,
 *   practice – nacvičit krok v timeru
 */
export function initMethods(deps = {}) {
  guideDeps = deps;
  $('method').onchange = pick;
  methods.subscribe(render);
  render();
}
