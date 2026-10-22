// Sekce Metoda: celá vlastní metoda na jednom místě. „Sestavit“ = kroky a jejich
// nastavení (builder.js), „Otestovat“ = simulace náhodných zamíchání (simulator.js).
// Nahoře průvodce na čtení, učebnice a sdílení.

import { el, storage } from './dom.js';
import { icon } from './icons.js';
import { methods, guides } from './store.js';
import { initBuilder, renderBuilder, openBuilderStep } from './builder.js';
import { initSimulator, showSimulator } from './simulator.js';
import { downloadLearning } from './learnexport.js';
import { showGuide, shareMethod } from './methods.js';

const SUB = 'ergocube.method.sub';
let sub = storage.get(SUB) === 'test' ? 'test' : 'build';
let root = null, title = null, tabs = null, build = null, test = null;
let visible = () => false;

/** @param {{lab, practice, train, labTask, isActive}} deps */
export function initMethodPage(deps) {
  root = document.getElementById('method-root');
  visible = deps.isActive;
  title = el('h2', {});
  const tab = (id, n, label) => {
    const b = Object.assign(el('button', { type: 'button' }), { innerHTML: `<i class="step-n">${n}</i><span>${label}</span>`, onclick: () => showMethodPage(id) });
    b.dataset.sub = id;
    return b;
  };
  tabs = el('nav', { className: 'segmented steps mp-tabs', ariaLabel: 'Metoda' }, tab('build', 1, 'Sestavit'), tab('test', 2, 'Otestovat'));
  const action = (ic, label, hint, fn) => Object.assign(el('button', { type: 'button', className: 'secondary small', title: hint }), { innerHTML: `${icon(ic, { size: 16 })}<span>${label}</span>`, onclick: fn });
  build = el('div', { className: 'mp-build' });
  test = el('div', { id: 'sim-root', className: 'sim-page' });
  root.append(
    el('div', { className: 'mp-head' },
      el('div', {}, el('small', { className: 'hint', textContent: 'Tvoje metoda · přepneš ji nahoře v liště' }), title),
      el('div', { className: 'row-btns' },
        action('book', 'Průvodce', 'Celá metoda na čtení (s obrázky a ukázkami)', () => showGuide()),
        action('download', 'Učebnice', 'Celá metoda k učení v jednom souboru (kroky, algoritmy, časy, výsledek testu); jde vytisknout i znovu importovat', () => downloadLearning()),
        action('share', 'Sdílet', 'Poslat metodu i s algoritmy jako soubor', () => shareMethod()))),
    tabs, build, test);
  initBuilder(build, { onTest: () => showMethodPage('test'), practice: deps.practice, train: deps.train, labTask: deps.labTask });
  initSimulator({ lab: deps.lab, onEdit: () => showMethodPage('build'), isVisible: () => visible() && sub === 'test' });
  // jiná metoda nebo úpravy odjinud: sestavení překreslit (při psaní se nepřekresluje)
  const refresh = () => { title.textContent = methods.get(methods.active()).name; if (visible() && sub === 'build' && !build.contains(document.activeElement)) renderBuilder(); };
  methods.subscribe(refresh);
  guides.subscribe(refresh);
}

/** Zobrazí sekci (sestavit / otestovat), případně rovnou otevře krok. */
export function showMethodPage(which = sub, stepId = null) {
  sub = which === 'test' ? 'test' : 'build';
  storage.set(SUB, sub);
  title.textContent = methods.get(methods.active()).name;
  for (const b of tabs.querySelectorAll('button')) b.classList.toggle('active', b.dataset.sub === sub);
  build.hidden = sub !== 'build';
  test.hidden = sub !== 'test';
  if (sub === 'build') openBuilderStep(stepId);
  else showSimulator();
}
