// Nastavení a záloha dat: export / import všech dat aplikace do souboru JSON.

import { $, storage } from './dom.js';
import { timerOptions } from './timer.js';

const PREFIX = 'ergocube.';
const FORMAT = 'ergocube-backup';

/** Všechna data aplikace z localStorage jako objekt pro zálohu. */
export function exportData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith(PREFIX)) continue;
    try { data[key] = JSON.parse(localStorage.getItem(key)); } catch { /* poškozená položka */ }
  }
  return { format: FORMAT, version: 1, exported: new Date().toISOString(), data };
}

/** Nahradí data aplikace zálohou (po kontrole formátu). */
export function importData(backup) {
  if (backup?.format !== FORMAT || typeof backup.data !== 'object') throw new Error('Tohle není záloha ErgoCube Lab');
  const keys = Object.keys(backup.data).filter((k) => k.startsWith(PREFIX));
  if (!keys.length) throw new Error('Záloha je prázdná');
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  }
  for (const k of keys) localStorage.setItem(k, JSON.stringify(backup.data[k]));
  return keys.length;
}

function download() {
  const blob = new Blob([JSON.stringify(exportData(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ergocube-zaloha-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $('set-status').textContent = 'Záloha stažená.';
}

let installPrompt = null;

export function initSettings() {
  const dialog = $('settings-dialog');
  $('settings-btn').onclick = () => {
    $('set-voice').checked = timerOptions().voice;
    $('set-smart-paint').checked = storage.get('ergocube.lab.smartPaint') === true;
    $('set-status').textContent = '';
    dialog.showModal();
  };
  $('set-voice').onchange = () => timerOptions({ voice: $('set-voice').checked });
  $('set-smart-paint').onchange = () => storage.set('ergocube.lab.smartPaint', $('set-smart-paint').checked);
  $('set-export').onclick = download;
  $('set-import').onclick = () => $('set-file').click();
  $('set-file').onchange = async () => {
    const file = $('set-file').files[0];
    $('set-file').value = '';
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (!confirm('Obnovit zálohu? Současná data v tomto prohlížeči se nahradí.')) return;
      importData(backup);
      location.reload();
    } catch (e) {
      $('set-status').textContent = `Nepodařilo se: ${e.message}`;
    }
  };

  // Instalace na plochu (Chrome/Android nabízí událost beforeinstallprompt).
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    $('set-install').hidden = false;
  });
  $('set-install-btn').onclick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $('set-install').hidden = true;
  };
}
