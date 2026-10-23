// Nastavení kroku metody (volnost, tahy, sada, natočení vrstev…): ukládá se přímo
// u kroku v průvodci (st.sim), aby byla celá metoda na jednom místě. Starší
// nastavení ze simulátoru (ergocube.sim.options) se použije, dokud krok vlastní nemá.

import { storage } from './dom.js';
import { algs } from './store.js';
import { stepDefaults, solveByOf } from '../sim/plan.js';

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

export { solveByOf };

const hash = (text) => {
  let h1 = 2166136261, h2 = 5381;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (Math.imul(h2, 33) + c) | 0; }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
};

/**
 * Otisk kroku pro vygenerované algoritmy: co je po kroku hotové (i u kroků před ním),
 * volnost a tahy kroku. Když se změní, vygenerované algoritmy už neplatí a test je
 * vytvoří znovu.
 */
export function stepSignature(method, guide, st) {
  const at = guide.steps.findIndex((x) => x.id === st.id);
  const cfgOf = (x) => stepConfig(method, x);
  const before = guide.steps.slice(0, at + 1).map((x) => {
    const c = cfgOf(x);
    return [x.cells ?? x.parts ?? {}, x.rules ?? [], c.free, c.downs, c.fronts, c.solveBy === 'fixed' ? [c.fixedAlg, c.when] : null];
  });
  const c = cfgOf(st);
  return hash(JSON.stringify([guide.frame ?? null, before, c.moves, c.custom, c.maxLen, c.view, c.helpers, c.adjust]));
}

/** Stav vygenerovaných algoritmů kroku: 'fresh' (platí), 'stale' (krok se změnil) nebo 'none'. */
export function generatedState(method, guide, st) {
  const cfg = stepConfig(method, st);
  if (!st.set || !cfg.genSig || !algs.inSet(st.set).length) return 'none';
  return cfg.genSig === stepSignature(method, guide, st) ? 'fresh' : 'stale';
}
