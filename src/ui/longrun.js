// Dlouhé běhy (noční generování sady, simulace metody): displej nezhasne (jinak
// telefon výpočet uspí), průběh v názvu karty a oznámení na konci.

/** Drží displej rozsvícený, dokud se nezavolá release(); po návratu do aplikace zámek obnoví. */
export function keepAwake() {
  let lock = null, on = true;
  const take = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { lock = null; } };
  const onVisible = () => { if (on && document.visibilityState === 'visible') take(); };
  document.addEventListener('visibilitychange', onVisible);
  take();
  return {
    release() {
      on = false;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release?.();
      lock = null;
    },
  };
}

/** Požádá o povolení oznámení (volat z klepnutí). */
export function askNotify() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}

/** Oznámení (přes service worker, aby fungovalo i na Androidu) a zavibrování. */
export async function notify(title, body) {
  navigator.vibrate?.([200, 100, 200]);
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) await reg.showNotification(title, { body, tag: `ergocube-${title}` });
    else new Notification(title, { body });
  } catch { /* bez oznámení */ }
}

/** Průběh v názvu karty; vrací funkci, která název vrátí. */
export function titleProgress() {
  const base = document.title;
  return { set: (text) => { document.title = `${text} ${base}`; }, reset: () => { document.title = base; } };
}
