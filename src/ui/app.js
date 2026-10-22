// ErgoCube Lab – navigace mezi sekcemi Timer / Statistiky / Trenažér / Lab / Simulátor.

import { hydrateIcons } from './icons.js';
import { storage } from './dom.js';
import { initTimer, practiceStep } from './timer.js';
import { initStats, showStats } from './stats.js';
import { initTrainer, showTrainer, trainSetTo } from './trainer.js';
import { initLab, showLab, labTask, labFixed, labErgo } from './lab.js';
import { initSimulator, showSimulator } from './simulator.js';
import { initSettings } from './settings.js';
import { initMethods, showGuide } from './methods.js';
import { takeShared, unpackTask, toast } from './share.js';
import { algs, algSets } from './store.js';
import { openTask } from './lab.js';
import { el } from './dom.js';

let page = storage.get('ergocube.page') ?? 'timer';

// Stránky, které se nesmí posouvat (otáčení kostkou, stopky).
function updateLock() {
  // zadání šipkami je plochá síť – stránka se smí posouvat (dlouhý seznam šipek)
  const fixed = page === 'timer' || page === 'trainer' || (page === 'lab' && labFixed());
  document.body.classList.toggle('lock', fixed);
  document.querySelector('[data-page="lab"]').classList.toggle('fixed', page === 'lab' && labFixed());
}

const TITLES = { timer: 'Timer', stats: 'Statistiky', trainer: 'Trenažér', lab: 'Lab', sim: 'Simulátor' };

function showPage(name) {
  page = name;
  storage.set('ergocube.page', name);
  document.body.dataset.view = name;
  document.getElementById('page-title').textContent = TITLES[name] ?? '';
  for (const p of document.querySelectorAll('.page')) p.hidden = p.dataset.page !== name;
  for (const b of document.querySelectorAll('.tabbar button')) {
    b.classList.toggle('active', b.dataset.tab === name);
    if (b.dataset.tab === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  window.scrollTo({ top: 0 });
  updateLock();
  if (name === 'stats') showStats();
  if (name === 'trainer') showTrainer();
  if (name === 'lab') showLab();
  if (name === 'sim') showSimulator();
}

hydrateIcons();
for (const b of document.querySelectorAll('.tabbar button')) b.onclick = () => { showPage(b.dataset.tab); b.blur(); };

initMethods({
  labTask,
  train: (id) => { trainSetTo(id); showPage('trainer'); },
  practice: (id) => { practiceStep(id); showPage('timer'); },
  simulate: () => showPage('sim'),
});
initTimer({ isActive: () => page === 'timer' });
initStats();
initTrainer({ isActive: () => page === 'trainer' });
initLab({ onSub: () => updateLock(), openSet: (id) => { trainSetTo(id); showPage('trainer'); } });
initSettings();
initSimulator({ lab: () => labErgo(), onEdit: () => showGuide({ edit: true }) });
showPage(page);

// --- Sdílený odkaz (#s=…): přidat algoritmy do sady, nebo otevřít případ v Labu ---------
async function receiveShared() {
  const data = await takeShared();
  if (!data) return;
  if (data.kind === 'task' && data.task) {
    openTask(unpackTask(data.task));
    showPage('lab');
    toast('Sdílený případ je otevřený v Labu (Zpět vrátí původní zadání)');
    return;
  }
  if (data.kind !== 'algs' || !Array.isArray(data.algs) || !data.algs.length) return;
  const list = data.algs.filter((a) => a && typeof a.alg === 'string' && a.task);
  const NEW = '__new__';
  const target = el('select', { ariaLabel: 'Sada' },
    el('option', { value: NEW, textContent: `Nová sada „${data.name ?? 'Sdílené'}“` }),
    ...algSets.list().map((s) => el('option', { value: s.id, textContent: s.name })));
  const add = el('button', { className: 'primary', value: 'add', textContent: `Přidat ${list.length}` });
  const dlg = el('dialog', { className: 'help-dialog share-dialog' },
    el('h2', { textContent: list.length === 1 ? 'Sdílený algoritmus' : `Sdílená sada${data.name ? ` „${data.name}“` : ''}` }),
    el('ul', { className: 'share-list' }, ...list.slice(0, 8).map((a) => el('li', {}, el('b', { textContent: a.name ?? 'Algoritmus' }), el('code', { textContent: a.alg }))),
      ...(list.length > 8 ? [el('li', { className: 'hint', textContent: `… a dalších ${list.length - 8}` })] : [])),
    el('label', { className: 'field' }, 'Přidat do sady', target),
    el('form', { method: 'dialog', className: 'row-btns share-actions' }, el('button', { className: 'secondary', value: 'cancel', textContent: 'Zrušit' }), add));
  document.body.append(dlg);
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'add') {
      const set = target.value === NEW ? algSets.add(data.name ?? 'Sdílené') : target.value;
      for (const a of list) algs.add({ alg: a.alg, task: unpackTask(a.task), name: a.name, set });
      trainSetTo(set);
      showPage('trainer');
      toast(`Přidáno ${list.length} ${list.length === 1 ? 'algoritmus' : list.length < 5 ? 'algoritmy' : 'algoritmů'}`);
    }
    dlg.remove();
  });
  dlg.showModal();
}
receiveShared();
window.addEventListener('hashchange', receiveShared);

// Offline režim (jen přes http/https, ne z file://).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* bez offline režimu */ });
}
