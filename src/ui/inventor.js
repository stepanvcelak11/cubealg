// Metoda → Vymyslet: aplikace vymyslí metody ze stavebních kamenů (sim/inventor.js) podle
// tvých přání – klepnutím (chci / nechci) nebo vlastními slovy („baví mě EO jako u ZZ,
// nechci tahy M“). Nejslibnější metody (odhad času + cena učení, různorodé) pak otestuje
// simulací na stejných zamícháních (ui/evaluate.js) a seřadí podle výsledku. Každá má
// vysvětlení, proč dává smysl, a jde uložit jako nová metoda.

import { el, storage } from './dom.js';
import { methods, guides } from './store.js';
import { LEVELS } from '../sim/simulate.js';
import { stepConfig } from './stepcfg.js';
import { templateGuide } from '../sim/templates.js';
import { DEFAULT_FRAME } from './parts.js';
import { WISHES, parseWishes, inventMethods, story, toTemplate, ALG_COST } from '../sim/inventor.js';
import { evaluate, workerPool } from './evaluate.js';
import { caseCounter } from './casecounter.js';
import { keepAwake } from './longrun.js';
import { toast } from './share.js';

const OPTS = 'ergocube.inventor';
const fmt = (v, d = 2) => Number(v).toFixed(d).replace('.', ',');
const BUDGETS = [[30, 'Málo (do 30)'], [60, 'Do 60'], [150, 'Do 150'], [0, 'Klidně hodně']];

/** Různorodý výběr: nejvýš dva se stejným začátkem i středem, aspoň jedna nová kombinace. */
function pickDiverse(list, k, source = 'mix') {
  // mix: polovina míst pro originální nápady
  if (source === 'mix') {
    const orig = list.filter((m) => m.original), known = list.filter((m) => !m.original);
    const half = Math.ceil(k / 2);
    const a = pickDiverse(orig, Math.min(orig.length, half), 'one');
    const b = pickDiverse(known, k - a.length, 'one');
    return [...a, ...b, ...pickDiverse(orig.filter((m) => !a.includes(m)), k - a.length - b.length, 'one')];
  }
  const out = [], seen = new Map();
  for (const m of list) {
    const key = m.original ? `${m.principle}|${m.name.split(' → ')[0]}` : `${m.start.id}|${m.mid.id}`;
    if ((seen.get(key) ?? 0) >= 2) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    out.push(m);
    if (out.length >= k) break;
  }
  if (k <= 0) return [];
  if (out.length && !out.some((m) => !m.known)) {
    const novel = list.find((m) => !m.known && !out.includes(m));
    if (novel) out[out.length - 1] = novel;
  }
  return out;
}

/** @param {{onOpen?: (methodId) => void}} [opts] */
export function mountInventor(host, lab, { onOpen } = {}) {
  const saved = { wishes: {}, text: '', budget: 0, count: 8, tests: 6, source: 'mix', ...(storage.get(OPTS) ?? {}) };
  const save = () => storage.set(OPTS, saved);
  const level = LEVELS[storage.get('ergocube.sim.options')?.level] ? storage.get('ergocube.sim.options').level : 'pro';
  const select = (value, options, label, onChange) => {
    const s = el('select', { ariaLabel: label }, ...options.map(([v, t]) => el('option', { value: String(v), textContent: t })));
    s.value = String(value);
    s.onchange = () => onChange(Number(s.value));
    return el('label', { className: 'field' }, label, s);
  };
  // přání: klepnutí = chci → nechci → je mi to jedno
  const chips = Object.entries(WISHES).map(([id, w]) => {
    const b = el('button', { type: 'button', className: 'chip inv-wish' });
    const show = () => {
      const st = saved.wishes[id] ?? 0;
      b.dataset.state = String(st);
      b.textContent = `${st === 1 ? '✓ ' : st === -1 ? '✕ ' : ''}${w.label}`;
      b.title = st === 1 ? 'Chci (klepni: nechci)' : st === -1 ? 'Nechci (klepni: je mi to jedno)' : 'Je mi to jedno (klepni: chci)';
    };
    b.onclick = () => { const st = saved.wishes[id] ?? 0; saved.wishes[id] = st === 0 ? 1 : st === 1 ? -1 : 0; save(); show(); };
    show();
    return b;
  });
  const text = el('textarea', { className: 'inv-text', rows: 2, value: saved.text, placeholder: 'Vlastními slovy, např. „baví mě EO jako u ZZ, nechci tahy M, chci málo algoritmů“' });
  text.oninput = () => { saved.text = text.value; save(); };
  const go = el('button', { type: 'button', className: 'primary', textContent: 'Vymyslet metody' });
  const stop = el('button', { type: 'button', className: 'secondary', textContent: 'Zastavit', hidden: true });
  const status = el('p', { className: 'status' });
  const bar = el('div', { className: 'gen-bar' });
  const track = el('div', { className: 'gen-track', hidden: true }, bar);
  const list = el('div', { className: 'inv-list' });
  const more = el('details', { className: 'inv-more', hidden: true });
  host.replaceChildren(el('section', { className: 'sim-card' },
    el('header', { className: 'bld-q sim-card-head' }, el('span', { className: 'bld-qn', textContent: '✧' }),
      el('div', {}, el('b', { textContent: 'Vymyslet metodu' }),
        el('small', { textContent: 'Dva druhy nápadů: kombinace osvědčených kroků (kříž, EOLine, EO-kříž, bloky, páry, ZBLS, OLL/PLL, COLL, ZBLL, CMLL/LSE…) a úplně originální metody s novými kroky – blok rostoucí z různých zárodků, rohy napřed, nejdřív natočit všechno, pás napřed, natočení hran kdekoli, neobvyklé konce. Každé klepnutí vymyslí jiné. Vybere podle tvých přání, nejslibnější otestuje na stejných zamícháních a každou vysvětlí.' }))),
    el('b', { className: 'bld-sub', textContent: 'Co tě baví (klepni: chci → nechci → jedno)' }),
    el('div', { className: 'inv-wishes' }, ...chips),
    text,
    el('div', { className: 'grid-fields' },
      select(saved.budget, BUDGETS, 'Kolik algoritmů se naučit', (v) => { saved.budget = v; save(); }),
      (() => {
        const s = el('select', { ariaLabel: 'Jaké metody' }, ...[['mix', 'Známé kroky i originální nápady'], ['original', 'Jen úplně originální'], ['known', 'Jen z osvědčených kroků']].map(([v, t]) => el('option', { value: v, textContent: t })));
        s.value = saved.source;
        s.onchange = () => { saved.source = s.value; save(); };
        return el('label', { className: 'field' }, 'Jaké metody', s);
      })(),
      select(saved.tests, [[4, '4 metody'], [6, '6 metod'], [10, '10 metod']], 'Otestovat simulací', (v) => { saved.tests = v; save(); }),
      select(saved.count, [[8, '8 zamíchání (rychle)'], [12, '12 zamíchání'], [24, '24 zamíchání (přesněji)']], 'Zamíchání na metodu', (v) => { saved.count = v; save(); })),
    el('p', { className: 'hint', textContent: `Odhad času pro: ${LEVELS[level].label} (změníš v Otestovat). Pořadí: čas + učení (100 algoritmů ≈ 0,2 s).` }),
    el('div', { className: 'row-btns' }, go, stop), track, status, list, more));

  let running = false;
  stop.onclick = () => { running = false; status.textContent = 'Zastavuji…'; };

  /** Karta metody (odhad, nebo výsledek testu). */
  const card = (m, r) => {
    const keep = el('button', { type: 'button', className: 'primary small', textContent: 'Uložit jako novou metodu' });
    keep.onclick = () => {
      const id = methods.add(m.name);
      guides.set(id, templateGuide(toTemplate(m), DEFAULT_FRAME, (title) => guides.newStep(title)));
      keep.disabled = true;
      keep.textContent = 'Uloženo';
      const open = el('button', { type: 'button', className: 'secondary small', textContent: 'Přepnout na ni' });
      open.onclick = () => { methods.setActive(id); onOpen?.(id); };
      keep.after(open);
      toast(`Uloženo: „${m.name}“ – najdeš ji nahoře v liště metod`);
    };
    const nums = r
      ? `${fmt(r.sum.time)} s · ${fmt(r.sum.human, 1)} tahů · ${r.approx ? '≈' : ''}${r.algs} algoritmů${r.sum.failed ? ` · ${r.sum.failed}× nesloženo` : ''}`
      : `odhad ${fmt(m.prior)} s · ${m.original ? '≈' : ''}${m.algs} algoritmů · čeká na test`;
    return el('article', { className: `inv-card${r ? ' tested' : ''}` },
      el('div', { className: 'inv-head' },
        el('span', { className: `disc-level ${m.known ? 'l1' : m.original ? 'l3' : 'l2'}`, textContent: m.known ? 'známá' : m.original ? `originální · ${m.principle}` : 'nová kombinace' }),
        el('b', { textContent: m.name })),
      el('ol', { className: 'inv-steps' }, ...m.steps.map((x) => el('li', { textContent: x.title }))),
      el('span', { className: 'inv-nums', textContent: nums }),
      el('small', { className: 'inv-story', textContent: story(m) }),
      el('div', { className: 'row-btns' }, keep));
  };

  go.onclick = async () => {
    const fromText = parseWishes(saved.text);
    const want = new Set([...Object.entries(saved.wishes).filter(([, v]) => v === 1).map(([k]) => k), ...fromText.want]);
    const avoid = new Set([...Object.entries(saved.wishes).filter(([, v]) => v === -1).map(([k]) => k), ...fromText.avoid]);
    for (const w of want) avoid.delete(w);
    const budget = saved.budget || fromText.budget || Infinity;
    // originální nápady jsou pokaždé jiné (nové semínko)
    const { list: found, relaxed } = inventMethods({ want, avoid, budget, level, source: saved.source, seed: Date.now() });
    if (!found.length) { status.textContent = 'Nic takového nejde postavit – zkus přání zmírnit.'; return; }
    const chosen = pickDiverse(found, saved.tests, saved.source);
    const results = new Map(); // key → výsledek testu
    const render = () => {
      const cost = (m) => { const r = results.get(m.key); return r ? r.sum.time + ALG_COST * r.algs : m.score + 100; };
      list.replaceChildren(...chosen.slice().sort((a, b) => cost(a) - cost(b)).map((m) => card(m, results.get(m.key))));
    };
    render();
    const rest = found.filter((m) => !chosen.includes(m));
    more.hidden = !rest.length;
    more.replaceChildren(el('summary', { textContent: `Další nápady (${rest.length}) – jen odhad bez testu` }),
      ...rest.slice(0, 40).map((m) => el('div', { className: 'inv-idea' }, el('b', { textContent: m.name }), el('small', { textContent: ` · odhad ${fmt(m.prior)} s · ${m.algs} algoritmů` }))));
    const wishText = [...want].map((w) => WISHES[w]?.label).filter(Boolean).join(', ');
    status.textContent = `${relaxed ? 'Všechna přání najednou nejdou splnit – tady jsou nejbližší metody. ' : ''}${found.length} metod podle přání${wishText ? ` (${wishText})` : ''}; testuji ${chosen.length} nejslibnějších…`;
    // test simulací
    running = true;
    host.dataset.running = '1';
    go.hidden = true; stop.hidden = false; track.hidden = false;
    const awake = keepAwake();
    const pool = workerPool();
    const counter = caseCounter();
    let done = 0;
    const total = chosen.length * saved.count;
    const tick = () => { done++; bar.style.width = `${Math.min(100, (done / total) * 100)}%`; };
    try {
      for (const [k, m] of chosen.entries()) {
        if (!running) break;
        status.textContent = `Testuji ${k + 1} z ${chosen.length}: ${m.name}`;
        let n = 0;
        const guide = templateGuide(toTemplate(m), DEFAULT_FRAME, (title) => ({ id: `inv${k}s${++n}`, title }));
        const config = Object.fromEntries(guide.steps.map((st) => [st.id, stepConfig('__inventor__', st)]));
        const res = await evaluate({ guide, config, lab, count: saved.count, seconds: 1, level, stopped: () => !running, onSolve: tick, pool, counter });
        if (res.sum.count) { results.set(m.key, res); render(); }
      }
      const best = chosen.filter((m) => results.has(m.key)).sort((a, b) => (results.get(a.key).sum.time + ALG_COST * results.get(a.key).algs) - (results.get(b.key).sum.time + ALG_COST * results.get(b.key).algs))[0];
      status.textContent = running && best
        ? `Hotovo: nejvíc se vyplatí „${best.name}“ (${fmt(results.get(best.key).sum.time)} s, ${results.get(best.key).algs} algoritmů). Ulož si ji a v „Vylepšit“ ji můžeš dál ladit.`
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
