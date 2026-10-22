// Nastavení kroku metody (volnost, tahy, sada, natočení vrstev…): ukládá se přímo
// u kroku v průvodci (st.sim), aby byla celá metoda na jednom místě. Starší
// nastavení ze simulátoru (ergocube.sim.options) se použije, dokud krok vlastní nemá.

import { storage } from './dom.js';
import { algs } from './store.js';
import { stepDefaults } from '../sim/plan.js';

/** Úplné nastavení kroku (výchozí hodnoty + uložené). */
export function stepConfig(method, st) {
  const legacy = storage.get('ergocube.sim.options')?.steps?.[method]?.[st.id];
  const hasSet = st.set ? algs.inSet(st.set).length > 0 : false;
  const cfg = { ...stepDefaults(hasSet), ...(legacy ?? {}), ...(st.sim ?? {}) };
  if (!hasSet) cfg.mode = 'search';
  return cfg;
}

/** Změní nastavení kroku (jen změněné položky zůstanou u kroku). */
export function setStepConfig(method, st, patch) {
  const legacy = storage.get('ergocube.sim.options')?.steps?.[method]?.[st.id];
  st.sim = { ...(legacy ?? {}), ...(st.sim ?? {}), ...patch };
}
