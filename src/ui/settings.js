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

/** Je aplikace uložená pro použití bez internetu? (service worker, sw.js) */
async function offlineStatus() {
  const out = $('set-offline');
  const sw = navigator.serviceWorker;
  if (!sw || !location.protocol.startsWith('http')) { out.textContent = 'Tenhle prohlížeč (nebo otevření ze souboru) offline režim neumí.'; return; }
  out.textContent = 'Zjišťuji…';
  const reg = await Promise.race([sw.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
  if (!reg) { out.textContent = 'Offline režim se ještě nezapnul – otevři aplikaci jednou s internetem.'; return; }
  const answer = new Promise((resolve) => {
    const on = ({ data }) => { if (data?.type === 'offline-status') { sw.removeEventListener('message', on); resolve(data); } };
    sw.addEventListener('message', on);
    setTimeout(() => resolve(null), 60000);
  });
  (sw.controller ?? reg.active)?.postMessage({ type: 'offline-status' });
  const s = await answer;
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  out.textContent = !s ? 'Stav se nepodařilo zjistit – zkus to znovu.'
    : s.dev ? 'Vývojová verze: soubory se ukládají průběžně, jak je aplikace načítá.'
    : s.ready ? `✓ Připraveno: celá aplikace je uložená v zařízení (${s.files} souborů), takže hledání algoritmů, test metody, trenažér i timer fungují i bez internetu – stejně jako online.${persisted ? '' : ' Prohlížeč ale může data při nedostatku místa smazat – aplikaci si raději přidej na plochu.'}`
    : 'Ještě se neuložila celá (chybí připojení při stahování) – nech aplikaci chvíli otevřenou online.';
}

export function initSettings() {
  const dialog = $('settings-dialog');
  $('settings-btn').onclick = () => {
    $('set-voice').checked = timerOptions().voice;
    $('set-smart-paint').checked = storage.get('ergocube.lab.smartPaint') === true;
    $('set-status').textContent = '';
    offlineStatus();
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
