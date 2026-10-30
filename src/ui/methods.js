// Výběr metody v horní liště: přepne celou aplikaci (timer, statistiky, sady
// algoritmů v Labu i trenažér) do režimu zvolené metody.

import { $, el } from './dom.js';
import { methods, importMethod, duplicateMethod, myTemplates } from './store.js';
import { openCopySets } from './copysets.js';
import { toast } from './share.js';
import { openGuide, shareMethod, shareMethodMenu } from './guide.js';

export { shareMethod, shareMethodMenu };

let guideDeps = {};

function render() {
  const select = $('method');
  const active = methods.active();
  select.replaceChildren(...[
    ...methods.list().map((m) => el('option', { value: m.id, textContent: m.name })),
    el('option', { value: '+build', textContent: 'Sestavit / upravit metodu…' }),
    el('option', { value: '+guide', textContent: 'Průvodce metodou…' }),
    el('option', { value: '+new', textContent: '+ Nová metoda…' }),
    el('option', { value: '+import', textContent: 'Importovat metodu…' }),
    el('option', { value: '+dup', textContent: 'Duplikovat metodu' }),
    el('option', { value: '+keep', textContent: 'Uložit jako předlohu…' }),
    el('option', { value: '+copy', textContent: 'Kopírovat sady algoritmů…' }),
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
  if (v === '+build') {
    guideDeps.build?.();
  } else if (v === '+guide') {
    openGuide(guideDeps);
  } else if (v === '+import') {
    importFile();
  } else if (v === '+new') {
    const name = prompt('Název metody (např. Roux, ZZ nebo tvoje vlastní):', '')?.trim();
    if (name) { methods.setActive(methods.add(name)); guideDeps.build?.(); }
  } else if (v === '+dup') {
    duplicateMethod(active);
    toast(`Vytvořená kopie „${methods.get(methods.active()).name}“ – originál zůstal`);
  } else if (v === '+keep') {
    const name = prompt('Název předlohy (najdeš ji v Sestavit → šablony):', `${methods.get(active).name} – předloha`)?.trim();
    if (name) { myTemplates.save(active, name); toast(`Uloženo mezi předlohy: ${name}`); }
  } else if (v === '+copy') {
    openCopySets({ onDone: ({ sets, algs, target }) => toast(sets ? `Zkopírováno ${algs} algoritmů (${sets} sad) do metody ${methods.get(target)?.name}` : 'Nic se nezkopírovalo') });
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
  const input = el('input', { type: 'file', accept: '.json,application/json,.html,text/html' });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      // učebnice metody (HTML) nese data metody uvnitř
      const inner = text.trimStart().startsWith('<') ? new DOMParser().parseFromString(text, 'text/html').getElementById('ergocube-method')?.textContent : null;
      importMethod(JSON.parse(inner ?? text));
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
