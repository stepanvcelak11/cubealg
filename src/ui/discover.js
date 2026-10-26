// Metoda → Vylepšit: objevitel metod. Navrhne úpravy tvé metody (sim/discover.js), každou
// otestuje na stejných zamíchání jako test metody (stejné workery, stejný model skladače)
// a seřadí podle odhadu času. Nejlepší dvě úpravy zkusí i dohromady. Návrh jde jedním
// klepnutím použít (změní nastavení kroků v Sestavit).

import { el, storage } from './dom.js';
import { methods, guides, algs } from './store.js';
import { buildPlan } from '../sim/plan.js';
import { summarize, seededRandom, LEVELS } from '../sim/simulate.js';
import { practiceState } from '../timer/practice.js';
import { stepConfig, setStepConfig } from './stepcfg.js';
import { stepParts } from './parts.js';
import { proposals, applyPatch, combine, LEVEL_TEXT } from '../sim/discover.js';
import { constraintsKey } from '../core/rules.js';
import { makeLearner } from '../sim/learn.js';
import { keepAwake } from './longrun.js';
import { toast } from './share.js';

const OPTS = 'ergocube.discover';
const fmt = (v, d = 2) => Number(v).toFixed(d).replace('.', ',');
const signed = (v, d = 2, unit = '') => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt(Math.abs(v), d)}${unit}`;
const workerCount = () => Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));

/**
 * Otestuje nastavení kroků na zamícháních (souběžně ve workerech) → souhrn a počet algoritmů.
 * @returns {Promise<{sum: object, algs: number, failed: number}>}
 */
async function evaluate({ guide, config, lab, count, seconds, level, stopped, onSolve }) {
  const setAlgs = (id) => algs.list().filter((a) => a.set === id);
  const { plan, steps } = buildPlan({ guide, config, setAlgs, rotation: 'free', ergonomics: lab.ergo, lambda: lab.lambda });
  // kratší hledání než v testu (návrhů je hodně) – pro všechny stejné, porovnání je férové
  plan.stepOpts = plan.stepOpts.map((o) => ({ ...o, time: Math.min(o.time, seconds * 1000) }));
  const learner = makeLearner(plan);
  plan.stepOpts.forEach((o, i) => learner.seed(i, plan.variants[0].steps[i].candidates));
  const rand = seededRandom(7);
  const starts = Array.from({ length: count }, () => practiceState({}, rand));
  const solves = [];
  const pool = Array.from({ length: workerCount() }, () => new Worker(new URL('../sim/sim-worker.js', import.meta.url), { type: 'module' }));
  try {
    await new Promise((resolve) => {
      let next = 0, active = 0;
      const feed = (w) => {
        if (stopped() || next >= starts.length) { if (!active) resolve(); return; }
        const k = next++;
        active++;
        w.postMessage({ type: 'solve', id: k, start: Array.from(starts[k]) });
      };
      for (const w of pool) {
        w.onmessage = ({ data }) => {
          active--;
          if (data.type === 'solved') {
            data.solve.steps.forEach((x, i) => {
              if (x.case?.state && x.display) {
                const { entry, fresh } = learner.offer(i, { display: x.display, model: x.model, state: Uint8Array.from(x.case.state), goal: x.case.goal, variant: x.case.variant, score: x.score });
                if (fresh && plan.stepOpts[i]?.learn) for (const p of pool) p.postMessage({ type: 'learn', step: i, display: entry.display, name: `${i}` });
              }
            });
            solves.push({ ...data.solve, id: data.id });
            onSolve?.();
          }
          feed(w);
        };
        w.onerror = () => { active--; feed(w); };
        w.postMessage({ type: 'plan', plan });
      }
      for (const w of pool) feed(w);
    });
  } finally {
    for (const w of pool) w.terminate();
  }
  const kinds = steps.map((x) => x.cfg.kind ?? 'intuitive');
  const sum = summarize(solves, steps.length, { tps: 4, recog: plan.stepOpts.map((o) => o.recog), kinds, level, styles: steps.map((x) => x.cfg.style) });
  // algoritmy: kroky algoritmů – sada kroku + nové případy, které test potkal
  // (různé případy – víc algoritmů sady na tentýž případ je jeden; intuitivní kroky žádné)
  const perStep = steps.map((x, i) => (x.cfg.kind === 'alg' && !x.fixed && x.cfg.solveBy !== 'intuitive' ? learner.cases(i) : 0));
  const algCount = perStep.reduce((a, b) => a + b, 0);
  return { ids: steps.map((x) => x.st.id), sum, algs: algCount, perStep: steps.map((x, i) => [x.st.title || `Krok ${i + 1}`, perStep[i]]).filter(([, n]) => n), failed: sum.failed };
}

export function mountDiscover(host, lab) {
  const method = methods.active();
  const guide = guides.get(method);
  const saved = { count: 12, seconds: 1, level: 3, ...(storage.get(OPTS) ?? {}) };
  const level = LEVELS[storage.get('ergocube.sim.options')?.level] ? storage.get('ergocube.sim.options').level : 'pro';
  const has = (st) => Object.keys(stepParts(st)).length || st.rules?.length || Object.keys(st.cells ?? {}).length;
  const cfgOf = (st) => stepConfig(method, st);
  const select = (value, options, label, onChange) => {
    const s = el('select', { ariaLabel: label }, ...options.map(([v, t]) => el('option', { value: String(v), textContent: t })));
    s.value = String(value);
    s.onchange = () => onChange(Number(s.value));
    return el('label', { className: 'field' }, label, s);
  };
  const go = el('button', { type: 'button', className: 'primary', textContent: 'Hledat vylepšení' });
  const stop = el('button', { type: 'button', className: 'secondary', textContent: 'Zastavit', hidden: true });
  const status = el('p', { className: 'status' });
  const bar = el('div', { className: 'gen-bar' });
  const track = el('div', { className: 'gen-track', hidden: true }, bar);
  const list = el('div', { className: 'disc-list' });
  host.replaceChildren(el('section', { className: 'sim-card' },
    el('header', { className: 'bld-q sim-card-head' }, el('span', { className: 'bld-qn', textContent: '✦' }),
      el('div', {}, el('b', { textContent: 'Objevitel metod' }),
        el('small', { textContent: 'Navrhne úpravy tvé metody – od drobných (volnost, barevná neutralita, algoritmy místo intuice) přes větší (spojit kroky, rozdělit krok na natočení a permutaci, jiné pořadí) až po brutální přestavby (natočit hrany hned na začátku jako ZZ, celý konec metody jinak) – a každou otestuje na stejných zamícháních jako test metody. Návrhy, které tvoje metoda už dělá, vynechá.' }))),
    el('div', { className: 'grid-fields' },
      select(saved.count, [[8, '8 zamíchání (rychle)'], [12, '12 zamíchání'], [24, '24 zamíchání (přesněji)'], [48, '48 zamíchání (nejpřesněji)']], 'Zamíchání na návrh', (v) => { saved.count = v; storage.set(OPTS, saved); }),
      select(saved.seconds, [[0.5, '0,5 s'], [1, '1 s'], [2, '2 s'], [4, '4 s']], 'Hledání na krok', (v) => { saved.seconds = v; storage.set(OPTS, saved); }),
      select(saved.level, [[1, 'Jen drobné úpravy'], [2, 'I větší přestavby'], [3, 'Všechno, i brutální přestavby']], 'Odvaha návrhů', (v) => { saved.level = v; storage.set(OPTS, saved); })),
    el('p', { className: 'hint', textContent: `Odhad času pro: ${LEVELS[level].label} (změníš v Otestovat). Rozdíly menší než ± u výsledku můžou být náhoda – víc zamíchání = přesnější.` }),
    el('div', { className: 'row-btns' }, go, stop), track, status, list));

  if (!guide.steps.some(has)) { status.textContent = 'Nejdřív sestav kroky metody (Sestavit).'; go.disabled = true; return; }
  let running = false;
  stop.onclick = () => { running = false; status.textContent = 'Zastavuji…'; };
  go.onclick = async () => {
    running = true;
    host.dataset.running = '1';
    go.hidden = true; stop.hidden = false; track.hidden = false;
    const awake = keepAwake();
    const base = Object.fromEntries(guide.steps.map((st) => [st.id, cfgOf(st)]));
    // návrh → metoda k testu: změna nastavení, nebo nové kroky
    const variantOf = (p) => (p.steps ? { g: { ...guide, steps: p.steps }, config: Object.fromEntries(p.steps.map((st) => [st.id, cfgOf(st)])) } : { g: guide, config: applyPatch(base, p.patch) });
    // otisk metody: co je po každém kroku hotové, kolik míst smí krok mít, jak se řeší –
    // návrh se stejným otiskem jako tvoje metoda nic nemění (to už metoda dělá)
    const sigOf = ({ g, config }) => {
      try {
        const { plan, steps } = buildPlan({ guide: g, config });
        return JSON.stringify(steps.map((x, i) => [constraintsKey(plan.variants[0].steps[i].parts), plan.choices[i], x.cfg.kind, x.cfg.solveBy === 'intuitive']));
      } catch { return null; }
    };
    const baseSig = sigOf({ g: guide, config: base });
    const seen = new Set([baseSig]);
    const props = proposals(guide, cfgOf, has, { level: saved.level, newId: () => guides.newStep().id }).filter((p) => {
      const sig = sigOf(variantOf(p));
      if (!sig || seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
    const total = (props.length + 1 + 3) * saved.count;
    let done = 0;
    const tick = () => { done++; bar.style.width = `${Math.min(100, (done / total) * 100)}%`; };
    const run = ({ g, config }) => evaluate({ guide: g, config, lab, count: saved.count, seconds: saved.seconds, level, stopped: () => !running, onSolve: tick });
    list.replaceChildren();
    try {
      status.textContent = 'Testuji tvoji metodu, jak je…';
      const ref = await run({ g: guide, config: base });
      const results = [];
      const render = () => {
        list.replaceChildren(
          el('div', { className: 'disc-row base' }, el('b', { textContent: 'Tvoje metoda teď' }),
            el('span', { textContent: `${fmt(ref.sum.time)} s · ${fmt(ref.sum.human, 1)} tahů · ${ref.algs} algoritmů${ref.perStep.length ? ` (${ref.perStep.map(([t, n]) => `${t} ${n}`).join(', ')})` : ''}` })),
          ...results.slice().sort((a, b) => a.dt - b.dt).map((r) => {
            const use = el('button', { type: 'button', className: 'secondary small', textContent: r.p.steps ? 'Uložit jako novou metodu' : 'Použít' });
            use.onclick = () => {
              if (r.p.steps) {
                // přestavba: nová metoda (tvoje zůstane, jak je) – kroky, držení i sady nezměněných kroků
                const id = methods.add(`${methods.get(method)?.name ?? 'Metoda'} – ${r.p.label.slice(0, 40)}`);
                // vygenerované sady patří tvé metodě – nová metoda si je při testu vytvoří vlastní
                const steps = r.p.steps.map((st) => {
                  if (cfgOf(st).solveBy !== 'generate') return st;
                  const { set: _, ...rest } = st;
                  const sim = { ...(st.sim ?? {}) };
                  delete sim.genSig;
                  return { ...rest, sim };
                });
                guides.set(id, { intro: guide.intro, frame: guide.frame, steps });
                toast('Uloženo jako nová metoda – přepneš ji nahoře v liště (tvoje metoda zůstala beze změny)');
              } else {
                for (const [id, p] of Object.entries(r.p.patch)) { const st = guide.steps.find((x) => x.id === id); if (st) setStepConfig(method, st, p); }
                guides.set(method, guide);
                toast(`Použito: ${r.p.label} – nastavení kroků je v Sestavit, test metody ukáže nový výsledek`);
              }
              use.disabled = true;
              use.textContent = r.p.steps ? 'Uloženo' : 'Použito';
            };
            const good = r.dt < -r.err;
            return el('div', { className: `disc-row${good ? ' good' : r.dt > r.err ? ' bad' : ''}` },
              el('div', {}, el('span', { className: `disc-level l${r.p.level ?? 1}`, textContent: LEVEL_TEXT[r.p.level ?? 1] }), el('b', { textContent: r.p.label }), el('small', { textContent: r.p.why })),
              el('span', { className: 'disc-nums' },
                el('b', { textContent: `${signed(r.dt, 2, ' s')}` }), ` ± ${fmt(r.err)} · ${signed(r.dm, 1)} tahů · ${signed(r.da, 0)} algoritmů${r.res.failed ? ` · ${r.res.failed}× nesloženo` : ''}`),
              use);
          }));
      };
      // nejistota rozdílu: párově (stejná zamíchání) – rozdíl času na každém zamíchání zvlášť
      const errOf = (res) => {
        const d = Object.keys(res.sum.solveTimes).filter((k) => k in ref.sum.solveTimes).map((k) => res.sum.solveTimes[k] - ref.sum.solveTimes[k]);
        if (d.length < 2) return Math.sqrt(res.sum.timeSd ** 2 + ref.sum.timeSd ** 2);
        const m = d.reduce((a, b) => a + b, 0) / d.length;
        const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (d.length - 1));
        return (1.64 * sd) / Math.sqrt(d.length);
      };
      for (const [k, p] of props.entries()) {
        if (!running) break;
        status.textContent = `Návrh ${k + 1} z ${props.length}: ${p.label}`;
        const res = await run(variantOf(p));
        if (!res.sum.count) continue;
        // nový krok, který skoro vždycky nic nedělá (metoda to už dělá jinak) – návrh nic nemění
        const known = new Set(guide.steps.map((x) => x.id));
        if (p.steps && res.ids.some((id, i) => !known.has(id) && res.sum.steps[i].skipped >= 0.9)) continue;
        results.push({ p, res, dt: res.sum.time - ref.sum.time, dm: res.sum.human - ref.sum.human, da: res.algs - ref.algs, err: errOf(res) });
        render();
      }
      // druhé kolo: nejlepší úpravy dohromady
      const best = results.filter((r) => r.dt < 0).sort((a, b) => a.dt - b.dt).slice(0, 3);
      for (let i = 0; i < best.length && running; i++) for (let j = i + 1; j < best.length && running; j++) {
        const c = combine(best[i].p, best[j].p);
        if (!c) continue;
        status.textContent = `Kombinace: ${c.label}`;
        const res = await run(variantOf(c));
        if (!res.sum.count) continue;
        results.push({ p: c, res, dt: res.sum.time - ref.sum.time, dm: res.sum.human - ref.sum.human, da: res.algs - ref.algs, err: errOf(res) });
        render();
      }
      render();
      const top = results.slice().sort((a, b) => a.dt - b.dt)[0];
      status.textContent = running
        ? (top && top.dt < -top.err ? `Hotovo: nejvíc pomůže „${top.p.label}“ (${signed(top.dt, 2, ' s')}).` : 'Hotovo: žádná úprava jasně nepomohla – tvoje metoda je v tomhle smyslu vyladěná (nebo zkus víc zamíchání).')
        : 'Zastaveno.';
    } finally {
      awake.release();
      running = false;
      delete host.dataset.running;
      go.hidden = false; stop.hidden = true; track.hidden = true;
    }
  };
}
