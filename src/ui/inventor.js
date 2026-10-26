// Metoda → Vymyslet: aplikace vymyslí metody ze stavebních kamenů a z originálních principů
// (sim/inventor.js, sim/originals.js) podle tvých přání – klepnutím (chci / nechci) nebo
// vlastními slovy („baví mě EO jako u ZZ, nechci tahy M“). Hledá ve třech kolech jako
// skladač, který zkouší nápady:
//   1. prosívání – hodně nápadů krátce (3 zamíchání), nepovedené a pomalé vypadnou
//   2. test      – nejlepší na všech zamícháních (stejná jako test metody)
//   3. vylepšování – vítěze upravuje objevitel (sim/discover.js: spojit, rozdělit, prohodit,
//      natočit hrany jinde, jiný konec…) a kříží nejlepší (začátek jedné, konec druhé);
//      nová metoda zůstane, jen když párově pomůže
// Nejlepší nálezy si pamatuje i mezi hledáními. Každá metoda má vysvětlení a jde uložit.

import { el, storage } from './dom.js';
import { methods, guides } from './store.js';
import { LEVELS } from '../sim/simulate.js';
import { stepConfig } from './stepcfg.js';
import { stepParts, DEFAULT_FRAME } from './parts.js';
import { templateGuide } from '../sim/templates.js';
import { WISHES, parseWishes, inventMethods, story, toTemplate, guidePrior, ALG_COST } from '../sim/inventor.js';
import { proposals, crossover, stepPieces } from '../sim/discover.js';
import { evaluate, workerPool, methodSig, paired } from './evaluate.js';
import { caseCounter } from './casecounter.js';
import { keepAwake } from './longrun.js';
import { toast } from './share.js';

const OPTS = 'ergocube.inventor';
const BEST = 'ergocube.inventor.best';
const SCREEN = 3; // zamíchání při prosívání
const EVO = 8; // úprav vítěze na kolo
const fmt = (v, d = 2) => Number(v).toFixed(d).replace('.', ',');
const BUDGETS = [[30, 'Málo (do 30)'], [60, 'Do 60'], [150, 'Do 150'], [0, 'Klidně hodně']];
const cfgOf = (st) => stepConfig('__inventor__', st);
const configOf = (g) => Object.fromEntries(g.steps.map((st) => [st.id, cfgOf(st)]));
const has = (st) => Object.keys(stepParts(st)).length || st.rules?.length || Object.keys(st.cells ?? {}).length;
const live = (g) => g.steps.filter((st) => cfgOf(st).on !== false);
/** Cena výsledku: čas + učení; nesložená zamíchání = metoda nefunguje (vzadu). */
const costOf = (r) => (r?.sum.count ? r.sum.time + ALG_COST * r.algs + (r.sum.failed ? 5 : 0) : Infinity);

/** Různorodý výběr: nejvýš dva se stejným začátkem i středem, aspoň jedna nová kombinace. */
function pickDiverse(list, k, source = 'mix') {
  if (k <= 0) return [];
  // mix: polovina míst pro originální nápady
  if (source === 'mix') {
    const orig = list.filter((m) => m.original), known = list.filter((m) => !m.original);
    const a = pickDiverse(orig, Math.min(orig.length, Math.ceil(k / 2)), 'one');
    const b = pickDiverse(known, k - a.length, 'one');
    return [...a, ...b, ...pickDiverse(orig.filter((m) => !a.includes(m)), k - a.length - b.length, 'one')];
  }
  const out = [], seen = new Map();
  for (const m of list) {
    const key = m.original ? `${m.principle}|${m.roux ? 'roux' : ''}` : `${m.start.id}|${m.mid.id}`;
    if ((seen.get(key) ?? 0) >= 2) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    out.push(m);
    if (out.length >= k) break;
  }
  if (out.length && !out.some((m) => !m.known)) {
    const novel = list.find((m) => !m.known && !out.includes(m));
    if (novel) out[out.length - 1] = novel;
  }
  return out;
}

/** Úpravy vítěze k vyzkoušení: různé druhy (spojit, rozdělit, pořadí, hrany, konec, volnost…) střídavě. */
function pickProposals(props, k) {
  const byKind = new Map();
  for (const p of props) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p]);
  const out = [];
  // v každém druhu nejslibnější podle odhadu (čas + učení) napřed
  const queues = [...byKind.values()].map((q) => q.sort((a, b) => a.prior - b.prior));
  while (out.length < k && queues.some((q) => q.length)) for (const q of queues) if (q.length && out.length < k) out.push(q.shift());
  return out;
}

/** @param {{onOpen?: (methodId) => void}} [opts] */
export function mountInventor(host, lab, { onOpen } = {}) {
  const saved = { wishes: {}, text: '', budget: 0, count: 8, tests: 6, source: 'mix', evolve: 2, ...(storage.get(OPTS) ?? {}) };
  const save = () => storage.set(OPTS, saved);
  const level = LEVELS[storage.get('ergocube.sim.options')?.level] ? storage.get('ergocube.sim.options').level : 'pro';
  const select = (value, options, label, onChange) => {
    const s = el('select', { ariaLabel: label }, ...options.map(([v, t]) => el('option', { value: String(v), textContent: t })));
    s.value = String(value);
    s.onchange = () => onChange(/^\d+$/.test(s.value) ? Number(s.value) : s.value);
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
  const best = el('details', { className: 'inv-more inv-best' });
  host.replaceChildren(el('section', { className: 'sim-card' },
    el('header', { className: 'bld-q sim-card-head' }, el('span', { className: 'bld-qn', textContent: '✧' }),
      el('div', {}, el('b', { textContent: 'Vymyslet metodu' }),
        el('small', { textContent: 'Dva druhy nápadů: kombinace osvědčených kroků (kříž, EOLine, EO-kříž, bloky, páry, ZBLS, OLL/PLL, COLL, ZBLL, CMLL/LSE…) a úplně originální metody s novými kroky – blok rostoucí z různých zárodků, dva bloky s koncem tahy M, rohy napřed, nejdřív natočit všechno, hrany napřed, natočení hran kdekoli, neobvyklé konce. Hledá jako skladač: hodně nápadů krátce vyzkouší, nejlepší otestuje pořádně a vítěze dál vylepšuje (spojit, rozdělit, prohodit kroky, natočit hrany jinde…). Každé klepnutí vymyslí jiné.' }))),
    el('b', { className: 'bld-sub', textContent: 'Co tě baví (klepni: chci → nechci → jedno)' }),
    el('div', { className: 'inv-wishes' }, ...chips),
    text,
    el('div', { className: 'grid-fields' },
      select(saved.budget, BUDGETS, 'Kolik algoritmů se naučit', (v) => { saved.budget = v; save(); }),
      select(saved.source, [['mix', 'Známé kroky i originální nápady'], ['original', 'Jen úplně originální'], ['known', 'Jen z osvědčených kroků']], 'Jaké metody', (v) => { saved.source = v; save(); }),
      select(saved.tests, [[4, '4 metody'], [6, '6 metod'], [10, '10 metod']], 'Otestovat pořádně', (v) => { saved.tests = v; save(); }),
      select(saved.count, [[8, '8 zamíchání (rychle)'], [12, '12 zamíchání'], [24, '24 zamíchání (přesněji)']], 'Zamíchání na metodu', (v) => { saved.count = v; save(); }),
      select(saved.evolve, [[0, 'Nevylepšovat'], [1, '1 kolo'], [2, '2 kola'], [4, '4 kola'], [99, 'Dokud nezastavím']], 'Vylepšovat vítěze', (v) => { saved.evolve = v; save(); })),
    el('p', { className: 'hint', textContent: `Odhad času pro: ${LEVELS[level].label} (změníš v Otestovat). Pořadí: čas + učení (100 algoritmů ≈ 0,2 s). Nejdřív se na ${SCREEN} zamícháních prosívá dvojnásobek nápadů, pak se nejlepší testují na všech.` }),
    el('div', { className: 'row-btns' }, go, stop), track, status, list, more, best));

  // --- nejlepší nálezy (pamatují se mezi hledáními) ------------------------------------
  const keepBest = (c) => {
    if (!c.res?.sum.count || c.res.sum.failed) return;
    const all = (storage.get(BEST) ?? []).filter((x) => x.sig !== c.sig);
    all.push({ sig: c.sig, name: c.name, badge: c.badge, lineage: c.lineage, story: c.story, guide: c.guide, time: c.res.sum.time, human: c.res.sum.human, algs: c.res.algs, approx: c.res.approx, cost: costOf(c.res), at: Date.now() });
    all.sort((a, b) => a.cost - b.cost);
    storage.set(BEST, all.slice(0, 8));
  };
  const saveGuide = (name, guide, intro) => {
    const id = methods.add(name);
    // vlastní id kroků (nastavení kroků je v kroku – sim)
    guides.set(id, { intro, frame: guide.frame ?? DEFAULT_FRAME, steps: guide.steps.map((st) => ({ ...st, id: guides.newStep().id })) });
    toast(`Uloženo: „${name}“ – najdeš ji nahoře v liště metod`);
    return id;
  };
  const saveButton = (name, guide, intro) => {
    const keep = el('button', { type: 'button', className: 'primary small', textContent: 'Uložit jako novou metodu' });
    keep.onclick = () => {
      const id = saveGuide(name, guide, intro);
      keep.disabled = true;
      keep.textContent = 'Uloženo';
      const open = el('button', { type: 'button', className: 'secondary small', textContent: 'Přepnout na ni' });
      open.onclick = () => { methods.setActive(id); onOpen?.(id); };
      keep.after(open);
    };
    return keep;
  };
  const renderBest = () => {
    const all = storage.get(BEST) ?? [];
    best.hidden = !all.length;
    const clear = el('button', { type: 'button', className: 'secondary small', textContent: 'Zapomenout' });
    clear.onclick = () => { storage.set(BEST, []); renderBest(); };
    best.replaceChildren(el('summary', { textContent: `Nejlepší nálezy ze všech hledání (${all.length})` }),
      ...all.map((x) => el('article', { className: 'inv-card tested' },
        el('div', { className: 'inv-head' }, el('span', { className: 'disc-level l2', textContent: x.badge }), el('b', { textContent: x.name })),
        el('ol', { className: 'inv-steps' }, ...live(x.guide).map((st) => el('li', { textContent: st.title }))),
        x.lineage?.length ? el('small', { className: 'inv-evo', textContent: `Vylepšeno: ${x.lineage.join(' → ')}` }) : '',
        el('span', { className: 'inv-nums', textContent: `${fmt(x.time)} s · ${fmt(x.human, 1)} tahů · ${x.approx ? '≈' : ''}${x.algs} algoritmů` }),
        el('div', { className: 'row-btns' }, saveButton(x.name, x.guide, x.story)))),
      el('div', { className: 'row-btns' }, clear));
  };
  renderBest();

  let running = false;
  stop.onclick = () => { running = false; status.textContent = 'Zastavuji…'; };

  /** Karta kandidáta: odhad, předběžný výsledek (prosívání) nebo výsledek testu. */
  const card = (c) => {
    const r = c.res, s = c.screen;
    const nums = r
      ? `${fmt(r.sum.time)} s · ${fmt(r.sum.human, 1)} tahů · ${r.approx ? '≈' : ''}${r.algs} algoritmů${r.sum.failed ? ` · ${r.sum.failed}× nesloženo` : ''}`
      : s ? `předběžně ${s.sum.count ? `${fmt(s.sum.time)} s` : 'nesloženo'} (${SCREEN} zamíchání) · ${s.approx ? '≈' : ''}${s.algs} algoritmů${c.out ? ' · vypadla v prosívání' : ''}${s.sum.failed ? ` · ${s.sum.failed}× nesloženo` : ''}`
        : `odhad ${fmt(c.prior)} s · ${c.approxPrior ? '≈' : ''}${c.algsPrior} algoritmů · čeká na test`;
    return el('article', { className: `inv-card${r ? ' tested' : ''}${c.out ? ' out' : ''}` },
      el('div', { className: 'inv-head' },
        el('span', { className: `disc-level ${c.badgeClass}`, textContent: c.badge }),
        el('b', { textContent: c.name })),
      el('ol', { className: 'inv-steps' }, ...live(c.guide).map((st) => el('li', { textContent: st.title }))),
      c.lineage.length ? el('small', { className: 'inv-evo', textContent: `Vylepšeno: ${c.lineage.join(' → ')}${c.gain ? ` (o ${fmt(c.gain)} s lepší než původní)` : ''}` }) : '',
      el('span', { className: 'inv-nums', textContent: nums }),
      el('small', { className: 'inv-story', textContent: c.story }),
      el('div', { className: 'row-btns' }, saveButton(c.name, c.guide, c.story)));
  };

  go.onclick = async () => {
    const fromText = parseWishes(saved.text);
    const want = new Set([...Object.entries(saved.wishes).filter(([, v]) => v === 1).map(([k]) => k), ...fromText.want]);
    const avoid = new Set([...Object.entries(saved.wishes).filter(([, v]) => v === -1).map(([k]) => k), ...fromText.avoid]);
    for (const w of want) avoid.delete(w);
    const budget = saved.budget || fromText.budget || Infinity;
    // originální nápady jsou pokaždé jiné (nové semínko)
    const { list: found, relaxed } = inventMethods({ want, avoid, budget, level, source: saved.source, seed: Date.now(), originals: 150 });
    if (!found.length) { status.textContent = 'Nic takového nejde postavit – zkus přání zmírnit.'; return; }
    // prosívání: dvojnásobek nápadů (různorodě), pak nejlepší pořádně
    const seen = new Set();
    let seq = 0;
    const cands = [];
    for (const m of pickDiverse(found, Math.min(found.length, saved.tests * 2), saved.source)) {
      const k = cands.length;
      let n = 0;
      const guide = templateGuide(toTemplate(m), DEFAULT_FRAME, (title) => ({ id: `i${k}s${++n}`, title }));
      const sig = methodSig(guide, configOf(guide));
      if (!sig || seen.has(sig)) continue;
      seen.add(sig);
      cands.push({
        key: m.key, sig, name: m.name, guide, story: story(m), lineage: [], original: !!m.original,
        badge: m.known ? 'známá' : m.original ? `originální · ${m.principle}` : 'nová kombinace',
        badgeClass: m.known ? 'l1' : m.original ? 'l3' : 'l2',
        prior: m.prior, algsPrior: m.algs, approxPrior: !!m.original,
      });
    }
    const order = (c) => (c.res ? costOf(c.res) : c.screen && !c.out ? 1000 + costOf(c.screen) : c.screen ? 3000 + costOf(c.screen) : 2000 + c.prior);
    const render = () => list.replaceChildren(...cands.slice().sort((a, b) => order(a) - order(b)).map(card));
    render();
    const rest = found.filter((m) => !cands.some((c) => c.key === m.key));
    more.hidden = !rest.length;
    more.replaceChildren(el('summary', { textContent: `Další nápady (${rest.length}) – jen odhad bez testu` }),
      ...rest.slice(0, 40).map((m) => el('div', { className: 'inv-idea' }, el('b', { textContent: m.name }), el('small', { textContent: ` · odhad ${fmt(m.prior)} s · ${m.original ? '≈' : ''}${m.algs} algoritmů` }))));
    const wishText = [...want].map((w) => WISHES[w]?.label).filter(Boolean).join(', ');
    const intro = `${relaxed ? 'Všechna přání najednou nejdou splnit – tady jsou nejbližší metody. ' : ''}${found.length} metod podle přání${wishText ? ` (${wishText})` : ''}.`;
    running = true;
    host.dataset.running = '1';
    go.hidden = true; stop.hidden = false; track.hidden = false;
    const awake = keepAwake();
    const pool = workerPool();
    const counter = caseCounter();
    const total = cands.length * SCREEN + saved.tests * saved.count + Math.min(saved.evolve, 4) * ((EVO + 4) * SCREEN + 3 * saved.count);
    let done = 0;
    const tick = () => { done++; bar.style.width = `${Math.min(100, (done / total) * 100)}%`; };
    const run = (guide, count) => evaluate({ guide, config: configOf(guide), lab, count, seconds: 1, level, stopped: () => !running, onSolve: tick, pool, counter });
    try {
      // 1. prosívání
      for (const [k, c] of cands.entries()) {
        if (!running) break;
        status.textContent = `${intro} Prosívám ${k + 1} z ${cands.length}: ${c.name}`;
        c.screen = await run(c.guide, SCREEN);
        render();
      }
      const finalists = cands.filter((c) => c.screen?.sum.count).sort((a, b) => costOf(a.screen) - costOf(b.screen)).slice(0, saved.tests);
      for (const c of cands) c.out = running && !finalists.includes(c);
      render();
      // 2. test na všech zamícháních (první tři má worker spočítané z prosívání)
      for (const [k, c] of finalists.entries()) {
        if (!running) break;
        status.textContent = `Testuji pořádně ${k + 1} z ${finalists.length}: ${c.name}`;
        const res = await run(c.guide, saved.count);
        if (res.sum.count) { c.res = res; keepBest(c); }
        render();
      }
      // 3. vylepšování: úpravy objevitele (střídavě nejlepší metoda a nejlepší originální –
      // i originální nápad má dostat šanci se vyladit) a křížení (začátek jedné, konec druhé);
      // nová metoda zůstane, jen když párově (na stejných zamícháních) porazí rodiče
      const tried = new Set();
      const leader = (f = () => true) => cands.filter((c) => c.res && !c.res.sum.failed && !tried.has(c) && f(c)).sort((x, y) => costOf(x.res) - costOf(y.res))[0];
      const gainOf = (parent, r) => paired(parent.res.sum, r.sum).dt + ALG_COST * (r.algs - parent.res.algs);
      /** Zkusí nápady {parent, guide, sig, id, label, why} krátce, nejlepší `verify` pořádně. */
      const trial = async (ideas, verify, what) => {
        const kids = [];
        for (const [k, x] of ideas.entries()) {
          if (!running) break;
          status.textContent = `${what(x)}: zkouším ${k + 1} z ${ideas.length} – ${x.label}`;
          const screen = await run(x.guide, SCREEN);
          if (screen.sum.count && !screen.sum.failed) kids.push({ ...x, screen, gain: gainOf(x.parent, screen) });
        }
        for (const kid of kids.filter((x) => x.gain < 0).sort((x, y) => x.gain - y.gain).slice(0, verify)) {
          if (!running) break;
          status.textContent = `${what(kid)}: ověřuji ${kid.label}`;
          const res = await run(kid.guide, saved.count);
          if (!res.sum.count || res.sum.failed) continue;
          const gain = gainOf(kid.parent, res);
          if (gain >= 0) continue;
          const parent = kid.parent;
          const child = {
            ...parent, ...(kid.extra ?? {}), key: `${parent.key}+${kid.id}`, sig: kid.sig, guide: kid.guide, res, screen: kid.screen, out: false,
            base: parent.base ?? parent.name, name: `${parent.base ?? parent.name} (vylepšená ${parent.lineage.length + 1}×)`,
            lineage: [...parent.lineage, kid.label], gain: (parent.gain ?? 0) - gain,
            badge: `vylepšená · ${parent.badge.replace(/^vylepšená · /, '')}`, badgeClass: 'l2',
            story: `${parent.story} Vylepšení: ${kid.label} – ${kid.why}`,
          };
          cands.push(child);
          keepBest(child);
          render();
        }
      };
      // dárci konců: všechny vymyšlené metody (i ty, které se netestovaly)
      const donors = [...cands, ...found.filter((m) => !cands.some((c) => c.key === m.key)).map((m, k) => {
        let n = 0;
        return { name: m.name, guide: templateGuide(toTemplate(m), DEFAULT_FRAME, (title) => ({ id: `d${k}s${++n}`, title })) };
      })];
      for (let round = 0; round < saved.evolve && running; round++) {
        // a) úpravy objevitele
        const parent = (round % 2 ? leader((c) => c.original) : null) ?? leader();
        if (!parent) break;
        tried.add(parent);
        const props = proposals(parent.guide, cfgOf, has, { level: 3, newId: () => `e${++seq}` }).map((p) => {
          // úprava nastavení se zapíše do kroků (metoda pak nese všechno v sobě)
          const steps = p.steps ?? parent.guide.steps.map((st) => (p.patch[st.id] ? { ...st, sim: { ...(st.sim ?? {}), ...p.patch[st.id] } } : st));
          const guide = { ...parent.guide, steps };
          const sig = methodSig(guide, configOf(guide));
          return { ...p, parent, guide, sig: sig && !seen.has(sig) ? sig : null, prior: guidePrior(steps, cfgOf, stepPieces, level).cost };
        }).filter((p, k, all) => p.sig && all.findIndex((q) => q.sig === p.sig) === k);
        const picked = pickProposals(props, EVO);
        for (const x of picked) seen.add(x.sig);
        await trial(picked, 2, (x) => `Vylepšuji „${x.parent.name}“ (kolo ${round + 1})`);
        // b) křížení: začátek otestované, konec z kterékoli vymyšlené (po obou je hotové totéž)
        const elite = cands.filter((c) => c.res && !c.res.sum.failed).sort((x, y) => costOf(x.res) - costOf(y.res)).slice(0, 5);
        const ideas = [], tails = new Set(), local = new Set();
        for (const A of elite) for (const B of donors) {
          if (A.guide === B.guide) continue;
          for (const c of crossover(A.guide.steps, B.guide.steps, cfgOf)) {
            // stejný konec od víc dárců jen jednou
            const tail = `${A.key}|${c.a}|${JSON.stringify(c.steps.slice(c.a).map((st) => [st.cells, st.parts, st.sim]))}`;
            if (tails.has(tail)) continue;
            tails.add(tail);
            // id kroků jedinečná (konec mohl přijít z metody, která už byla křížená)
            const ids = new Set();
            const guide = { ...A.guide, steps: c.steps.map((st) => (ids.has(st.id) ? { ...st, id: `${st.id}_${++seq}` } : (ids.add(st.id), st))) };
            const sig = methodSig(guide, configOf(guide));
            if (!sig || seen.has(sig) || local.has(sig)) continue;
            local.add(sig);
            // odhad: o kolik je konec lepší než konec rodiče (čas + učení)
            const prior = guidePrior(guide.steps, cfgOf, stepPieces, level).cost - guidePrior(A.guide.steps, cfgOf, stepPieces, level).cost;
            ideas.push({ parent: A, guide, sig, prior, id: `x${++seq}`, label: `jiný konec: ${c.steps.slice(c.a).map((st) => st.title).join(' + ')} (z „${B.name}“)`, why: 'po obou začátcích je na kostce hotové totéž, takže jde vzít lepší konec' });
          }
        }
        // vyzkoušené se už neopakují
        // nejslibnější podle odhadu, nejvýš dvě od jednoho rodiče
        const perParent = new Map();
        const crosses = ideas.sort((x, y) => x.prior - y.prior).filter((x) => {
          const n = perParent.get(x.parent) ?? 0;
          if (n >= 2) return false;
          perParent.set(x.parent, n + 1);
          return true;
        }).slice(0, 4);
        for (const x of crosses) seen.add(x.sig);
        await trial(crosses, 1, () => `Křížím metody (kolo ${round + 1})`);
      }
      const top = cands.filter((c) => c.res).sort((a, b) => costOf(a.res) - costOf(b.res))[0];
      status.textContent = running && top
        ? `Hotovo: nejvíc se vyplatí „${top.name}“ – ${fmt(top.res.sum.time)} s, ${top.res.approx ? '≈' : ''}${top.res.algs} algoritmů. Ulož si ji; nejlepší nálezy se pamatují i pro příští hledání.`
        : 'Zastaveno.';
    } finally {
      for (const w of pool) w.terminate();
      counter.close();
      awake.release();
      running = false;
      delete host.dataset.running;
      go.hidden = false; stop.hidden = true; track.hidden = true;
      renderBest();
    }
  };
}
