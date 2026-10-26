// Počty případů kroků metody (= algoritmů k naučení) pro test i objevitel metod.

import { constraintsKey } from '../core/rules.js';
import { stepGoals } from '../sim/casecount.js';

/**
 * Počty případů kroků (= algoritmů k naučení) – ve zvláštním workeru, zapamatované podle
 * toho, co je před krokem a po něm hotové (stejný krok v jiném návrhu se nepočítá znovu).
 */
export function caseCounter() {
  const cache = new Map();
  let worker = null, seq = 0;
  const waiting = new Map();
  const ask = (plan, step) => {
    worker ??= Object.assign(new Worker(new URL('../sim/count-worker.js', import.meta.url), { type: 'module' }), {
      onmessage: ({ data }) => { waiting.get(data.id)?.(data.result); waiting.delete(data.id); },
    });
    const id = ++seq;
    return new Promise((resolve) => { waiting.set(id, resolve); worker.postMessage({ id, plan, step }); });
  };
  return {
    count(plan, i) {
      const { done, goal } = stepGoals(plan, i);
      const st = plan.variants[0].steps[i];
      const fixes = plan.variants[0].steps.slice(0, i).map((x) => x.fixed?.when ?? '').join(',');
      const key = JSON.stringify([constraintsKey(done), constraintsKey(goal), st.adjust.pre.map((a) => a.model), st.adjust.helpers.map((a) => a.model), fixes]);
      if (!cache.has(key)) cache.set(key, ask(plan, i));
      return cache.get(key);
    },
    close() { worker?.terminate(); worker = null; for (const r of waiting.values()) r(null); waiting.clear(); },
  };
}

