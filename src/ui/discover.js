// Metoda → Vylepšit: objevitel metod. Navrhne úpravy tvé metody (sim/discover.js), každou
// otestuje na stejných zamíchání jako test metody (stejné workery, stejný model skladače)
// a seřadí podle odhadu času. Nejlepší dvě úpravy zkusí i dohromady. Návrh jde jedním
// klepnutím použít (změní nastavení kroků v Sestavit).

import { el, storage } from './dom.js';
import { methods, guides } from './store.js';
import { LEVELS } from '../sim/simulate.js';
import { stepConfig, setStepConfig } from './stepcfg.js';
import { stepParts } from './parts.js';
import { proposals, applyPatch, combine, LEVEL_TEXT } from '../sim/discover.js';
import { caseCounter } from './casecounter.js';
import { evaluate, workerPool, methodSig, paired } from './evaluate.js';
import { keepAwake } from './longrun.js';
import { toast } from './share.js';

const OPTS = 'ergocube.discover';
const ALG_COST = 0.002; // s za algoritmus navíc (pořadí návrhů)
const fmt = (v, d = 2) => Number(v).toFixed(d).replace('.', ',');
const signed = (v, d = 2, unit = '') => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt(Math.abs(v), d)}${unit}`;

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
    el('p', { className: 'hint', textContent: `Odhad času pro: ${LEVELS[level].label} (změníš v Otestovat). Rozdíly menší než ± můžou být náhoda – víc zamíchání = přesnější. Pořadí počítá i s učením: každých 100 algoritmů navíc se bere jako 0,2 s času. Algoritmy = počet případů kroků (≈ = odhad).` }),
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
    // návrh se stejným otiskem jako tvoje metoda nic nemění (to už metoda dělá)
    const sigOf = ({ g, config }) => methodSig(g, config);
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
    const pool = workerPool();
    const counter = caseCounter();
    const run = ({ g, config }) => evaluate({ guide: g, config, lab, count: saved.count, seconds: saved.seconds, level, stopped: () => !running, onSolve: tick, pool, counter });
    list.replaceChildren();
    try {
      status.textContent = 'Testuji tvoji metodu, jak je…';
      const ref = await run({ g: guide, config: base });
      const results = [];
      const render = () => {
        list.replaceChildren(
          el('div', { className: 'disc-row base' }, el('b', { textContent: 'Tvoje metoda teď' }),
            el('span', { textContent: `${fmt(ref.sum.time)} s · ${fmt(ref.sum.human, 1)} tahů · ${ref.approx ? '≈' : ''}${ref.algs} algoritmů${ref.perStep.length ? ` (${ref.perStep.map(([t, n]) => `${t} ${n}`).join(', ')})` : ''}` })),
          ...results.slice().sort((a, b) => costOf(a) - costOf(b)).map((r) => {
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
                el('b', { textContent: `${signed(r.dt, 2, ' s')}` }), ` ± ${Number.isFinite(r.err) ? fmt(r.err) : "?"} · ${signed(r.dm, 1)} tahů · ${signed(r.da, 0)} algoritmů${r.res.failed ? ` · ${r.res.failed}× nesloženo` : ''}`),
              use);
          }));
      };
      // pořadí: zisk času, ale s cenou učení – každých 100 algoritmů navíc jako 0,2 s
      // (jinak by vyhrálo „všechno jedním algoritmem“ s desítkami tisíc případů)
      const costOf = (r) => r.dt + ALG_COST * Math.max(0, r.da);
      // rozdíl proti tvé metodě párově (jen zamíchání, která složily obě)
      const compare = (res) => paired(ref.sum, res.sum);
      for (const [k, p] of props.entries()) {
        if (!running) break;
        status.textContent = `Návrh ${k + 1} z ${props.length}: ${p.label}`;
        const res = await run(variantOf(p));
        if (!res.sum.count) continue;
        // nový krok, který skoro vždycky nic nedělá (metoda to už dělá jinak) – návrh nic nemění
        const known = new Set(guide.steps.map((x) => x.id));
        if (p.steps && res.ids.some((id, i) => !known.has(id) && res.sum.steps[i].skipped >= 0.9)) continue;
        results.push({ p, res, ...compare(res), da: res.algs - ref.algs });
        render();
      }
      // druhé kolo: nejlepší úpravy dohromady
      const best = results.filter((r) => r.dt < 0 && costOf(r) < 0 && !r.p.steps).sort((a, b) => costOf(a) - costOf(b)).slice(0, 3);
      for (let i = 0; i < best.length && running; i++) for (let j = i + 1; j < best.length && running; j++) {
        const c = combine(best[i].p, best[j].p);
        if (!c) continue;
        status.textContent = `Kombinace: ${c.label}`;
        const res = await run(variantOf(c));
        if (!res.sum.count) continue;
        results.push({ p: c, res, ...compare(res), da: res.algs - ref.algs });
        render();
      }
      render();
      const top = results.filter((r) => r.dt < -r.err).sort((a, b) => costOf(a) - costOf(b))[0];
      const fastest = results.slice().sort((a, b) => a.dt - b.dt)[0];
      status.textContent = running
        ? (top && costOf(top) < 0
          ? `Hotovo: nejvíc se vyplatí „${top.p.label}“ (${signed(top.dt, 2, ' s')}, ${signed(top.da, 0)} algoritmů).${fastest && fastest !== top ? ` Nejrychlejší vůbec: „${fastest.p.label}“ (${signed(fastest.dt, 2, ' s')}, ${signed(fastest.da, 0)} algoritmů).` : ''}`
          : 'Hotovo: žádná úprava jasně nepomohla – tvoje metoda je v tomhle smyslu vyladěná (nebo zkus víc zamíchání).')
        : 'Zastaveno.';
    } finally {
      for (const w of pool) w.terminate();
      counter.close();
      awake.release();
      running = false;
      delete host.dataset.running;
      go.hidden = false; stop.hidden = true; track.hidden = true;
    }
  };
}
