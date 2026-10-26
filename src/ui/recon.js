// Rozbor složení z chytré kostky po krocích aktivní metody: u každého kroku pauza před
// ním (rozpoznání, rozhodování), točení, tahy a tempo – a kde se ztrácí nejvíc času.
// Timer ukazuje rozbor posledního složení, Statistiky průměr přes složení s rozborem.

import { el } from './dom.js';
import { methods, guides } from './store.js';
import { buildPlan } from '../sim/plan.js';
import { stepConfig } from './stepcfg.js';
import { holdOf } from '../core/hold.js';
import { applyAlg, solved } from '../core/cube.js';
import { reconstruct, averageRecons, unpackMoves } from '../smartcube/recon.js';
import { recordSegments } from './smartdata.js';

const cache = new Map();

/** Plán aktivní metody (kroky a cíle) – stejně jako test metody. */
function methodPlan() {
  const method = methods.active();
  const guide = guides.get(method);
  if (!guide?.steps?.length) return null;
  const config = Object.fromEntries(guide.steps.map((st) => [st.id, stepConfig(method, st)]));
  try {
    const { plan, steps } = buildPlan({ guide, config });
    // záloha pro skladače, kteří začínají jinou barvou, než má metoda (barevná neutralita):
    // první krok v kterékoli orientaci – použije se, když rozbor v orientaci metody nesedí
    let neutral = null;
    const first = guide.steps.find((st) => config[st.id].on !== false && config[st.id].solveBy !== 'fixed');
    if (first && config[first.id].free !== 'all') {
      try { neutral = buildPlan({ guide, config: { ...config, [first.id]: { ...config[first.id], free: 'all' } } }).plan; } catch { neutral = null; }
    }
    return { plan, neutral, titles: steps.map((x) => x.st.title || 'Krok'), kinds: steps.map((x) => x.cfg.kind), key: JSON.stringify([method, guide.steps.map((s) => [s.id, s.cells, s.parts, s.rules])]) };
  } catch { return null; }
}

/** Rozbor složení (s uloženými tahy `r` a zamícháním `s`), nebo null. */
export function reconOf(solve, mp = methodPlan()) {
  if (!solve?.r?.m || !mp) return null;
  const key = `${mp.key}|${solve.d}`;
  if (cache.has(key)) return cache.get(key);
  let res = null;
  try {
    const moves = unpackMoves(solve.r);
    const start = applyAlg(solved(), solve.s);
    let r = reconstruct(start, moves, mp.plan, mp.titles);
    let plan = mp.plan;
    if (mp.neutral) {
      // jiná barva dole sedí, když s ní metoda dojde do konce a první krok je hotový dřív
      // (ve špatné orientaci se „kříž“ složí až náhodou někde uprostřed složení)
      const n = reconstruct(start, moves, mp.neutral, mp.titles);
      const firstEnd = (x) => x.steps.find((st) => !st.fixed)?.to ?? Infinity;
      if (n.done && (!r.done || firstEnd(n) < firstEnd(r))) { r = n; plan = mp.neutral; }
    }
    // zápis kroků v držení metody (kostka hlásí tahy podle středů)
    for (const st of r.steps) { try { st.alg = holdOf(plan.variants[st.v ?? 0].hold).toHeldString(st.alg); } catch { /* jak je */ } }
    res = { ...r, moves: moves.length, plan };
  } catch { res = null; }
  cache.set(key, res);
  return res;
}

const sec = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;

/** Rozbor jako tabulka: krok, pauza, točení, tahy, tempo; nejpomalejší krok zvýrazněný. */
export function reconView(r, { title = 'Rozbor složení (chytrá kostka)', avg = false } = {}) {
  if (!r) return null;
  const rows = r.steps.filter((s) => !s.fixed);
  const worst = rows.reduce((w, s) => (s.recog + s.exec > (w?.recog ?? 0) + (w?.exec ?? 0) ? s : w), null);
  const max = Math.max(...rows.map((s) => s.recog + s.exec), 1);
  return el('div', { className: 'recon' },
    el('b', { className: 'recon-title', textContent: title }),
    el('small', { className: 'hint', textContent: avg ? `průměr ${r.count} složení · ${sec(r.total)}` : `${sec(r.total)} · ${r.moves} tahů · ${(r.moves / Math.max(0.1, r.total / 1000)).toFixed(1).replace('.', ',')} tahů/s${r.done ? '' : ' · metoda nedokončená'}` }),
    el('div', { className: 'recon-rows' }, ...rows.map((s) => el('div', { className: `recon-row${s === worst ? ' worst' : ''}${s.skipped && !avg ? ' skipped' : ''}` },
      el('span', { className: 'recon-name', textContent: s.title }),
      el('span', { className: 'recon-bar', title: `pauza ${sec(s.recog)} · točení ${sec(s.exec)}` },
        el('i', { className: 'recog', style: `width: ${(s.recog / max) * 100}%` }),
        el('i', { className: 'exec', style: `width: ${(s.exec / max) * 100}%` })),
      el('small', { textContent: s.skipped && !avg ? 'přeskočeno' : `${sec(s.recog + s.exec)} · pauza ${sec(s.recog)} · ${avg ? s.moves.toFixed(1).replace('.', ',') : s.moves} tahů${s.exec > 0 ? ` · ${(s.moves / (s.exec / 1000)).toFixed(1).replace('.', ',')} t/s` : ''}` }),
      !avg && s.alg ? el('code', { className: 'recon-alg', textContent: s.alg }) : null))),
    worst ? el('p', { className: 'hint', textContent: `Nejvíc času: ${worst.title}${worst.recog > worst.exec ? ' – hlavně pauza před ním (rozpoznání / rozhodování)' : ' – točení'}.` } ) : null,
    el('p', { className: 'hint recon-legend' }, el('i', { className: 'recog' }), ' pauza před krokem  ', el('i', { className: 'exec' }), ' točení'));
}

/** Průměrný rozbor ze složení s tahy (nejnovější `limit`). */
export function averageView(list, limit = 50) {
  const mp = methodPlan();
  const recons = list.filter((x) => x.r).slice(-limit).map((x) => reconOf(x, mp)).filter(Boolean);
  const avg = averageRecons(recons);
  return avg ? reconView(avg, { title: `Rozbor po krocích metody (${methods.get(methods.active())?.name ?? 'metoda'})`, avg: true }) : null;
}

/**
 * Plynulé úseky z kroků algoritmů (OLL, PLL…) složení pro ergonomii – v držení metody
 * (v intuitivních krocích se kostka otáčí, tam by zápis neseděl).
 */
export function recordAlgSteps(solve) {
  const mp = methodPlan();
  const r = reconOf(solve, mp);
  if (!r) return 0;
  const moves = unpackMoves(solve.r);
  let n = 0;
  r.steps.forEach((st, i) => {
    if (mp.kinds[i] === 'alg' && st.to > st.from) n += recordSegments(moves.slice(st.from, st.to), 'timer', r.plan.variants[st.v ?? 0].hold);
  });
  return n;
}
