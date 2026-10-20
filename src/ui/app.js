// ErgoCube Lab – navigace mezi sekcemi Timer / Statistiky / Trenažér / Lab.

import { hydrateIcons } from './icons.js';
import { storage } from './dom.js';
import { initTimer } from './timer.js';
import { initStats, showStats } from './stats.js';
import { initTrainer, showTrainer } from './trainer.js';
import { initLab, showLab, labSub } from './lab.js';
import { initSettings } from './settings.js';
import { initMethods } from './methods.js';

let page = storage.get('ergocube.page') ?? 'timer';

// Stránky, které se nesmí posouvat (otáčení kostkou, stopky).
function updateLock() {
  const fixed = page === 'timer' || page === 'trainer' || (page === 'lab' && labSub() === 'task');
  document.body.classList.toggle('lock', fixed);
  document.querySelector('[data-page="lab"]').classList.toggle('fixed', page === 'lab' && labSub() === 'task');
}

function showPage(name) {
  page = name;
  storage.set('ergocube.page', name);
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
}

hydrateIcons();
for (const b of document.querySelectorAll('.tabbar button')) b.onclick = () => { showPage(b.dataset.tab); b.blur(); };

initMethods();
initTimer({ isActive: () => page === 'timer' });
initStats();
initTrainer({ isActive: () => page === 'trainer' });
initLab({ onSub: () => updateLock() });
initSettings();
showPage(page);

// Offline režim (jen přes http/https, ne z file://).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* bez offline režimu */ });
}
