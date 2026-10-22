// Simulátor metody (samostatná sekce aplikace): náhodná zamíchání se složí krok po
// kroku podle kroků metody (dílky hotové po kroku, viz parts.js). U každého kroku
// si nastavíš, jak se řeší: tahy, tvoje sada (i s natočením vrstev a pomocným
// algoritmem jako oprava parity), nebo hledání, podle čeho vybírat, čas rozpoznání,
// a volnost – kde smí být jeho dílky (kříž libovolnou barvou, pár v kterémkoli slotu,
// blok na kterémkoli boku). Kroky jde vypnout (složí se s dalším).
//
// Zamíchání skládá víc workerů souběžně (sim/sim-worker.js). Běh může jet i přes noc:
// průběžně se ukládá, po zavření jde navázat a výsledky se doplňují. Stejné semínko
// = stejná zamíchání, takže změny nastavení i metody jde férově porovnat.

import { el, storage } from './dom.js';
import { icon } from './icons.js';
import { methods, guides, algs } from './store.js';
import { describeParts, stepParts, validFrame, DEFAULT_FRAME } from './parts.js';
import { buildPlan, stepDefaults, STEP_MOVES, MOVE_BASES, ADJUST, FREEDOM, ROTATION, COLORS } from '../sim/plan.js';
import { summarize, seededRandom } from '../sim/simulate.js';
import { practiceState } from '../timer/practice.js';
import { toFacelets } from '../core/cube.js';
import { solve as twoPhase } from '../timer/twophase.js';
import { VIEWS } from '../ergonomics/style.js';
import { keepAwake, askNotify, notify, titleProgress } from './longrun.js';
import { toast } from './share.js';
import { REFERENCES, REFERENCE_NOTE } from '../sim/references.js';
import { downloadLearning } from './learnexport.js';

const OPTS = 'ergocube.sim.options';
const HISTORY = 'ergocube.sim.history';
const RUN = 'ergocube.sim.run';
const HISTORY_MAX = 40;
const KEEP_DISPLAY = 60; // u kolika zamíchání si pamatovat zápis (ukázky)
const HOUR = 3600 * 1000;
const LENGTHS = {
  c10: { label: '10 zamíchání', count: 10 },
  c25: { label: '25 zamíchání', count: 25 },
  c50: { label: '50 zamíchání', count: 50 },
  c100: { label: '100 zamíchání', count: 100 },
  c250: { label: '250 zamíchání', count: 250 },
  h1: { label: '1 hodinu', hours: 1 },
  h3: { label: '3 hodiny', hours: 3 },
  h8: { label: '8 hodin (přes noc)', hours: 8 },
  inf: { label: 'Dokud nezastavím', hours: Infinity },
};
const OPPOSITE = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' };
const MODES = { auto: 'Moje sada, jinak hledání', set: 'Jen moje sada', search: 'Jen hledání' };
const invertMove = (m) => (m.endsWith("'") ? m.slice(0, -1) : m.endsWith('2') ? m : `${m}'`);
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '–');
const pct = (x) => `${Math.round(x * 100)} %`;
const fmtTime = (ms) => {
  const t = Math.round(ms / 1000);
  if (t < 60) return `${t} s`;
  if (t < 3600) return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  return `${Math.floor(t / 3600)} h ${String(Math.floor((t % 3600) / 60)).padStart(2, '0')} min`;
};
const when = (at) => new Date(at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const hash = (text) => {
  let h1 = 2166136261, h2 = 5381;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (Math.imul(h2, 33) + c) | 0; }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
};
// workery skládají různá zamíchání souběžně; jedno jádro zůstane pro aplikaci
const workerCount = () => Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));

/** Zamíchání (WCA zápis) ke stavu – pro ukázky. */
function scrambleOf(start) {
  try { return (twoPhase(toFacelets(Uint8Array.from(start)), { timeLimit: 800 }) ?? '').split(' ').filter(Boolean).reverse().map(invertMove).join(' '); } catch { return ''; }
}

let deps = { lab: () => ({ ergo: {}, lambda: 0.5 }), onEdit: null };
let current = null; // { running(), destroy() }

/**
 * @param {{lab: () => {ergo: object, lambda: number}, onEdit?: () => void}} d
 *   lab = hodnocení z Labu (Tahy a váhy), onEdit = upravit kroky v průvodci metodou
 */
export function initSimulator(d) {
  deps = { ...deps, ...d };
  // jiná metoda nebo upravené kroky: překreslit (běžící simulaci nechat doběhnout)
  const refresh = () => { if (current && !current.running() && !document.querySelector('[data-page="sim"]')?.hidden) showSimulator(); };
  methods.subscribe(refresh);
  guides.subscribe(refresh);
}

/** Zobrazí simulátor aktivní metody (běžící simulace zůstane, jak je). */
export function showSimulator() {
  const host = document.getElementById('sim-root');
  if (!host) return;
  if (current?.running()) return;
  current?.destroy();
  host.replaceChildren();
  current = mountSimulator(host, deps.lab(), { onEdit: deps.onEdit });
}

/**
 * @param {HTMLElement} host
 * @param {{ergo: object, lambda: number}} lab hodnocení z Labu (Tahy a váhy)
 * @param {{onEdit?: () => void}} [opts] onEdit = upravit dílky kroků v průvodci
 */
function mountSimulator(host, lab, { onEdit } = {}) {
  const method = methods.active();
  const guide = guides.get(method);
  const saved = storage.get(OPTS) ?? {};
  const config = structuredClone(saved.steps?.[method] ?? {});
  const setAlgs = (id) => algs.list().filter((a) => a.set === id);
  const frame = validFrame(guide.frame) ? guide.frame : DEFAULT_FRAME;
  const stepsWithParts = guide.steps.map((st, i) => ({ st, i, parts: stepParts(st) })).filter((x) => Object.keys(x.parts).length);

  const body = el('div', { className: 'sim-body' });
  const guideBtn = onEdit ? Object.assign(el('button', { type: 'button', className: 'secondary small', title: 'Kroky metody a jejich dílky se upravují v průvodci metodou' }),
    { innerHTML: `${icon('book', { size: 16 })}<span>Kroky v průvodci</span>`, onclick: () => onEdit() }) : null;
  host.append(
    el('div', { className: 'sim-head' },
      el('div', {}, el('small', { className: 'hint', textContent: 'Testování metody' }), el('h2', { textContent: methods.get(method).name }),
        el('small', { className: 'sim-head-note', textContent: 'Metodu přepneš nahoře v liště' })),
      el('div', { className: 'row-btns' }, guideBtn,
        Object.assign(el('button', { type: 'button', className: 'secondary small sim-learn', title: 'Celá metoda k učení v jednom souboru (kroky, algoritmy, časy, nastavení a výsledek simulace)' }),
          { innerHTML: `${icon('download', { size: 16 })}<span>Učebnice</span>`, onclick: () => downloadLearning(method) }))),
    body);
  let alive = true;
  let running = false;
  let pool = [];
  let awake = null;
  let stopResolve = () => {};
  const title = titleProgress();
  const stopAll = () => { for (const w of pool) w.terminate(); pool = []; };
  const destroy = () => { alive = false; running = false; stopAll(); stopResolve(); awake?.release(); title.reset(); };
  const editBtn = (text, cls) => (onEdit ? Object.assign(el('button', { type: 'button', className: cls, textContent: text }), { onclick: () => onEdit() }) : null);

  if (!stepsWithParts.length) {
    body.append(el('div', { className: 'guide-empty' },
      el('p', { textContent: 'Simulátor potřebuje kroky metody s vybranými dílky.' }),
      el('p', { className: 'hint', textContent: 'V průvodci metodou klepni na „Upravit“ a u každého kroku vyber, které dílky jsou po něm hotové (předvolby jako kříž, F2L, bloky…).' }),
      editBtn('Upravit kroky', 'primary')));
    return { running: () => false, destroy };
  }

  // --- nastavení kroků ------------------------------------------------------------------------
  const cfgOf = (st) => {
    const hasSet = st.set ? setAlgs(st.set).length > 0 : false;
    config[st.id] = { ...stepDefaults(hasSet), ...(config[st.id] ?? {}) };
    if (!hasSet) config[st.id].mode = 'search';
    return config[st.id];
  };
  const select = (opts, value, label, onChange) => {
    const s = el('select', { className: 'small-select', ariaLabel: label },
      ...Object.entries(opts).map(([id, t]) => el('option', { value: id, textContent: typeof t === 'string' ? t : t.label })));
    s.value = value;
    s.onchange = () => onChange(s.value);
    return s;
  };
  const num = (value, label, min, max, step, onChange) => {
    const i = el('input', { type: 'number', min: String(min), max: String(max), step: String(step), value: String(value), ariaLabel: label });
    i.onchange = () => onChange(Math.max(min, Math.min(max, Number(i.value) || min)));
    return i;
  };
  const field = (label, control, hint) => el('label', { className: 'field', title: hint ?? '' }, label, control);
  const openSteps = new Set();

  const stepList = el('div', { className: 'sim-steps' });
  function renderSteps() {
    stepList.replaceChildren(...stepsWithParts.map(({ st, i, parts }) => {
      const cfg = cfgOf(st);
      const n = st.set ? setAlgs(st.set).length : 0;
      const k = i + 1;
      const on = Object.assign(el('input', { type: 'checkbox', ariaLabel: `Krok ${k} zvlášť` }), { checked: cfg.on !== false });
      on.onchange = () => { cfg.on = on.checked; changed(); renderSteps(); };
      if (cfg.on === false) {
        return el('div', { className: 'sim-step off' },
          el('div', { className: 'sim-step-head' }, el('span', { className: 'guide-n', textContent: String(k) }),
            el('div', { className: 'sim-step-title' }, el('b', { textContent: st.title || `Krok ${k}` }), el('small', { textContent: 'složí se najednou s dalším krokem' })),
            el('label', { className: 'sim-switch', title: 'Vypnutý krok se složí s dalším – zkus, jestli by se vyplatilo kroky spojit' }, on, el('span', { textContent: 'zvlášť' }))));
      }
      const moves = select({ ...STEP_MOVES, custom: { label: 'Vlastní výběr…' } }, cfg.moves, `Tahy – krok ${k}`, (v) => {
        cfg.moves = v;
        if (v === 'custom' && !cfg.custom?.length) cfg.custom = [...STEP_MOVES.faces.bases];
        changed(); renderSteps();
      });
      const chips = cfg.moves === 'custom' ? el('div', { className: 'sim-chips', role: 'group', ariaLabel: `Vlastní tahy – krok ${k}` }, ...MOVE_BASES.map((b) => {
        const box = Object.assign(el('input', { type: 'checkbox' }), { checked: (cfg.custom ?? []).includes(b) });
        box.onchange = () => { cfg.custom = MOVE_BASES.filter((x) => (x === b ? box.checked : (cfg.custom ?? []).includes(x))); changed(); };
        return el('label', {}, box, b);
      })) : null;
      const mode = select(n ? MODES : { search: MODES.search }, cfg.mode, `Řešení – krok ${k}`, (v) => { cfg.mode = v; changed(); renderSteps(); });
      const view = select(Object.fromEntries(Object.entries(VIEWS).map(([id, v]) => [id, `${v.icon} ${v.label}`])), cfg.view, `Vybírat podle – krok ${k}`, (v) => { cfg.view = v; changed(); renderSteps(); });
      const adjust = select(ADJUST, cfg.adjust, `Natočení vrstev – krok ${k}`, (v) => { cfg.adjust = v; changed(); });
      const helpers = el('input', { value: cfg.helpers ?? '', placeholder: 'např. M2 U2 M2', spellcheck: false, ariaLabel: `Pomocné algoritmy – krok ${k}` });
      helpers.onchange = () => { cfg.helpers = helpers.value; changed(); };
      const usesSet = n > 0 && cfg.mode !== 'search';
      const free = select(Object.fromEntries(Object.entries(FREEDOM).map(([id, f]) => [id, f.label])), FREEDOM[cfg.free] ? cfg.free : 'fixed', `Volnost – krok ${k}`, (v) => {
        cfg.free = v;
        if (v === 'colors' && !cfg.downs?.length) cfg.downs = [frame.down, OPPOSITE[frame.down]];
        changed(); renderSteps();
      });
      // výběr barev: které smí být dole / vpředu
      const colorPick = (key, label, hint) => el('div', { className: 'sim-colors', role: 'group', ariaLabel: `${label} – krok ${k}`, title: hint },
        el('span', { textContent: label }),
        ...Object.entries(COLORS).map(([f, name]) => {
          const box = Object.assign(el('input', { type: 'checkbox', ariaLabel: `${label}: ${name}` }), { checked: (cfg[key] ?? []).includes(f) });
          box.onchange = () => { cfg[key] = Object.keys(COLORS).filter((x) => (x === f ? box.checked : (cfg[key] ?? []).includes(x))); changed(); renderSteps(); };
          return el('label', { className: 'sim-color', title: name }, box, el('i', { style: `--c: var(--c-${f})` }), el('span', { textContent: name }));
        }));
      const colors = cfg.free === 'colors' ? el('div', { className: 'sim-colors-box' },
        colorPick('downs', 'Dole smí být', 'Barvy, které smí být po kroku dole (např. kříž jen bílý nebo žlutý)'),
        colorPick('fronts', 'Vpředu smí být', 'Nic nezaškrtnuté = vpředu kterákoli barva (dílky kroku na kterémkoli boku)')) : null;
      const at = planSteps.findIndex((x) => x.st.id === st.id);
      const places = at >= 0 ? plan.choices?.[at] ?? 1 : 1;
      const freeNote = cfg.free && cfg.free !== 'fixed'
        ? `${FREEDOM[cfg.free].hint}. ${places > 1 ? `Zkouší se ${places} ${places < 5 ? "místa" : "míst"} a vybere se nejlepší – hledání kroku trvá až ${places}× déle.` : 'Dílky kroku jsou ve všech orientacích na stejných místech – volnost tu nic nemění.'}`
        : null;
      const summary = [cfg.free && cfg.free !== 'fixed' ? `↻ ${FREEDOM[cfg.free].label.replace(/ \(.*\)/, '').toLowerCase()}` : null,
        cfg.moves === 'custom' ? `<${(cfg.custom ?? []).join(', ')}>` : (STEP_MOVES[cfg.moves] ?? STEP_MOVES.faces).label,
        usesSet ? `${cfg.mode === 'set' ? 'jen sada' : 'sada'} (${n})` : 'hledání', VIEWS[cfg.view]?.label.toLowerCase(), `${fmt(cfg.time, 1)} s`].filter(Boolean).join(' · ');
      const details = el('details', { className: 'sim-step-more', open: openSteps.has(st.id) },
        el('summary', { textContent: summary }),
        el('div', { className: 'grid-fields' },
          field('Volnost (kde smí být)', free, 'Kde smí být dílky kroku: pevně jako v průvodci, nebo kdekoli z povolených míst (kříž libovolnou barvou, pár do kteréhokoli slotu…). Vybere se místo, kde je krok nejlepší, a další kroky pokračují odtud.'),
          field('Tahy', moves, 'Tahy, kterými krok skládáš (pro hledání i hodnocení)'),
          field('Řešení', mode, n ? 'Moje sada: případ, který vyřeší algoritmus ze sady kroku, se řeší jím (jako při skutečném složení). Jen sada: případ bez algoritmu se počítá jako chybějící.' : 'Krok nemá v průvodci sadu algoritmů – řeší ho hledání'),
          field('Vybírat podle', view, 'Které z nalezených řešení se použije'),
          field('Hledání (s)', num(cfg.time, `Čas hledání – krok ${k}`, 0.5, 120, 0.5, (v) => { cfg.time = v; changed(); renderSteps(); }), 'Jak dlouho hledat řešení kroku (delší = blíž nejlepšímu možnému)'),
          usesSet ? field('Natočení vrstev', adjust, 'Natočení horní (a spodní) vrstvy před algoritmem ze sady a po něm – počítá se do tahů') : null,
          usesSet ? field('Pomocné algoritmy', helpers, 'Smíš je udělat před algoritmem ze sady (např. oprava parity M2 U2 M2); víc oddělených čárkou') : null,
          field('Rozpoznání (s)', num(cfg.recog, `Rozpoznání – krok ${k}`, 0, 5, 0.1, (v) => { cfg.recog = v; changed(); }), 'Kolik ti trvá krok rozpoznat (do odhadu času)')),
        colors,
        freeNote ? el('p', { className: 'hint sim-free-note', textContent: freeNote }) : null,
        chips);
      details.addEventListener('toggle', () => { if (details.open) openSteps.add(st.id); else openSteps.delete(st.id); });
      return el('div', { className: 'sim-step' },
        el('div', { className: 'sim-step-head' },
          el('span', { className: 'guide-n', textContent: String(k) }),
          el('div', { className: 'sim-step-title' }, el('b', { textContent: st.title || `Krok ${k}` }), el('small', { textContent: describeParts(parts) })),
          el('label', { className: 'sim-switch', title: 'Vypnutý krok se složí s dalším – zkus, jestli by se vyplatilo kroky spojit' }, on, el('span', { textContent: 'zvlášť' }))),
        details);
    }));
  }

  // --- nastavení simulace ---------------------------------------------------------------------
  const rotation = select(ROTATION, ROTATION[saved.rotation] ? saved.rotation : 'free', 'Otočení kostky', () => changed());
  // dřív jedna volba „barevná neutralita“ pro celou metodu = volnost prvního kroku
  if (saved.neutral && saved.neutral !== 'fixed' && stepsWithParts[0] && !config[stepsWithParts[0].st.id]?.free) {
    config[stepsWithParts[0].st.id] = { ...(config[stepsWithParts[0].st.id] ?? {}), free: saved.neutral };
  }
  // rychlé nastavení volností (kdo neví, kde začít)
  const quick = (label, hint, apply) => Object.assign(el('button', { type: 'button', className: 'secondary small', textContent: label, title: hint }),
    { onclick: () => { apply(); changed(); renderSteps(); } });
  const firstOn = () => stepsWithParts.find(({ st }) => cfgOf(st).on !== false)?.st;
  const freeHelp = el('details', { className: 'sim-free-help' },
    el('summary', { textContent: 'Jak nastavit volnosti metody (barva, strana, slot)' }),
    el('p', { textContent: 'Každý krok má „Volnost“ – kde smí být jeho dílky. Simulátor u každého zamíchání zkusí všechna povolená místa, vezme to, kde je krok nejlepší, a další kroky pokračují odtamtud (jako když si při skládání vybereš).' }),
    el('ul', {},
      el('li', {}, el('b', { textContent: 'Kříž (první krok) libovolnou barvou, klidně skládaný z boku: ' }), 'u prvního kroku „Kterákoli strana a barva“. Na které straně kříž skládáš, je jedno – počítá se, kde skončí, a kostku pak otočíš.'),
      el('li', {}, el('b', { textContent: 'Jen některé barvy (např. kříž bílý nebo žlutý): ' }), '„Vybrané barvy…“ a zaškrtni, které smí být dole (případně i vpředu).'),
      el('li', {}, el('b', { textContent: 'Páry do kteréhokoli slotu, blok na kterékoli straně: ' }), 'u těch kroků „Kterýkoli bok“.'),
      el('li', {}, el('b', { textContent: 'Další volnosti: ' }), 'natočení horní/spodní vrstvy a pomocné algoritmy u kroků se sadou, tahy kroku (vkládat i z boku = přidej F, B, L…), vypnutí kroku (spojit s dalším). Otočení kostky můžeš počítat jako tah.')),
    el('p', { className: 'hint', textContent: 'Tip: nastav semínko, pusť simulaci, změň jednu volnost a pusť znovu – v historii a porovnání uvidíš, co pomohlo.' }),
    el('div', { className: 'row-btns' },
      quick('1. krok bílá nebo žlutá', 'Volnost prvního kroku: dole bílá nebo žlutá, vpředu kterákoli', () => { const st = firstOn(); if (st) Object.assign(cfgOf(st), { free: 'colors', downs: ['U', 'D'], fronts: [] }); }),
      quick('1. krok libovolnou barvou', 'Volnost prvního kroku: kterákoli strana a barva', () => { const st = firstOn(); if (st) cfgOf(st).free = 'all'; }),
      quick('Další kroky: kterýkoli bok', 'Volnost ostatních kroků: kterýkoli bok (y)', () => { const f = firstOn(); for (const { st } of stepsWithParts) if (st !== f) cfgOf(st).free = 'side'; }),
      quick('Vše pevně', 'Všechny kroky přesně jak jsou v průvodci', () => { for (const { st } of stepsWithParts) cfgOf(st).free = 'fixed'; })));
  const length = select(LENGTHS, LENGTHS[saved.length] ? saved.length : 'c25', 'Délka simulace', () => remember());
  const seed = num(saved.seed ?? 1, 'Semínko zamíchání', 0, 999999, 1, () => changed());
  const tps = num(saved.tps ?? 4, 'Tahy za sekundu', 1, 15, 0.5, () => { remember(); if (last) renderResults(last.solves, last.meta); renderCompare(); });
  const go = el('button', { type: 'button', className: 'primary', textContent: 'Spustit simulaci' });
  const more = el('button', { type: 'button', className: 'secondary', textContent: 'Přidat zamíchání', hidden: true, title: 'Pokračuje dalšími zamícháními (stejné semínko) a výsledky doplní' });
  const stop = el('button', { type: 'button', className: 'secondary', textContent: 'Zastavit', hidden: true });
  const status = el('p', { className: 'status sim-status' });
  const bar = el('div', { className: 'gen-bar' });
  const track = el('div', { className: 'gen-track sim-track', hidden: true }, bar);
  const banner = el('div', { className: 'gen-resume', hidden: true });
  const results = el('div', { className: 'sim-results' });
  const history = el('div', { className: 'sim-history' });
  const compare = el('div', { className: 'sim-compare' });

  body.append(
    el('p', { className: 'hint', textContent: 'Náhodná zamíchání se složí krok po kroku podle tvé metody. Krok vyřeší algoritmus z tvé sady, když na případ nějaký máš, jinak ho najde hledání (podle tvých vah ergonomie). U každého kroku si nastavíš, jak ho řešíš. Tahy se počítají včetně natočení vrstev.' }),
    banner,
    el('div', { className: 'sim-section-head' }, el('h3', { textContent: 'Kroky' }), editBtn('Upravit dílky kroků', 'secondary small')),
    freeHelp,
    stepList,
    el('h3', { textContent: 'Simulace' }),
    el('div', { className: 'grid-fields' },
      field('Délka', length, 'Počet zamíchání, nebo čas – dlouhý běh se průběžně ukládá a jde navázat'),
      field('Otočení kostky', rotation, 'Když krok volnost složí jinde, kostku otočíš (y, x2…) – počítat to do tahů?'),
      field('Semínko', seed, 'Stejné semínko = stejná zamíchání (férové porovnání nastavení i metod)'),
      field('Tahy za sekundu', tps, 'Rychlost provedení pro odhad času (u algoritmů s časem z trenažéru se použije ten)')),
    el('div', { className: 'row-btns' }, go, more, stop), track, status, results, compare, history);

  let sigNow = '';
  let plan = null, planSteps = [];
  let last = null; // { solves, meta, next }
  function remember() {
    const all = storage.get(OPTS) ?? {};
    storage.set(OPTS, { ...all, neutral: undefined, rotation: rotation.value, length: length.value, seed: Number(seed.value), tps: Number(tps.value), steps: { ...(all.steps ?? {}), [method]: config } });
  }
  function changed() {
    remember();
    ({ plan, steps: planSteps } = buildPlan({ guide, config, setAlgs, rotation: rotation.value, ergonomics: lab.ergo, lambda: lab.lambda }));
    // na čem výsledky závisí (bez časů z trenažéru – ty mění jen odhad času)
    sigNow = hash(JSON.stringify([method, Number(seed.value), plan.rotation, plan.stepOpts.map(({ recog, ...o }) => o),
      plan.variants.map((v) => ({ next: v.next, steps: v.steps.map((s) => ({ parts: s.parts, moves: s.moves, adjust: s.adjust, c: s.candidates.map((c) => c.model) })) })), lab.ergo]));
    if (!running && last) {
      const same = last.meta.sig === sigNow;
      more.hidden = !same;
      if (!same) status.textContent = 'Nastavení se změnilo – „Spustit simulaci“ začne znovu (výsledky níž jsou z minulého nastavení)';
    }
  }

  // --- běh ------------------------------------------------------------------------------------
  /** Nedokončená zamíchání (zastaveno, zavřeno) se příště složí znovu: platí souvislý začátek. */
  function contiguous(solves) {
    solves.sort((a, b) => a.k - b.k);
    let upto = 0;
    while (upto < solves.length && solves[upto].k === upto) upto++;
    solves.length = upto;
    return upto;
  }
  /** Zamíchání v pořadí podle semínka (generují se postupně). */
  function scrambles(seedValue) {
    const rand = seededRandom(seedValue);
    const list = [];
    return (k) => { while (list.length <= k) list.push(practiceState({}, rand)); return list[k]; };
  }
  const compact = (solve, k) => ({
    k, ok: solve.ok, variant: solve.variant,
    start: k < KEEP_DISPLAY ? solve.start : undefined,
    steps: solve.steps.map((x) => ({
      length: x.length, score: x.score, source: x.source, time: x.time, extra: x.extra, helper: x.helper ?? undefined, rotation: x.rotation,
      variant: x.variant,
      name: k < KEEP_DISPLAY ? x.name : undefined, missingSet: x.missingSet || undefined,
      // zápis: u ukázek a u případů, na které sada neměla algoritmus (návrh do sady)
      display: k < KEEP_DISPLAY || x.missingSet ? x.display : undefined,
    })),
  });

  async function run(resume) {
    changed();
    const len = LENGTHS[length.value];
    const meta = resume?.meta ?? {
      sig: sigNow, method, seed: Number(seed.value), started: Date.now(),
      stepTitles: planSteps.map((x) => x.st.title || `Krok ${x.index + 1}`), stepIds: planSteps.map((x) => x.st.id),
      variants: plan.variants.map((v) => v.label), hasSet: plan.variants[0].steps.map((s) => s.candidates.length > 0),
    };
    const solves = resume?.solves ?? [];
    let next = resume?.next ?? solves.length;
    const target = len.count ? next + len.count : Infinity;
    const deadline = len.hours ? Date.now() + len.hours * HOUR : Infinity;
    const long = !!len.hours || len.count >= 100;
    running = true;
    go.hidden = true; more.hidden = true; stop.hidden = false; track.hidden = false; banner.hidden = true;
    stepList.classList.add('locked');
    if (long) { awake = keepAwake(); askNotify(); }
    const scr = scrambles(meta.seed);
    const t0 = performance.now();
    const done0 = solves.length;
    let lastRender = 0, lastSave = 0;
    const save = (finished = false) => storage.set(RUN, { meta, solves, next: Math.min(next, solves.length), finished });
    const progress = () => {
      const n = solves.length - done0;
      const elapsed = performance.now() - t0;
      const per = n ? elapsed / n : NaN;
      const left = Math.min(Number.isFinite(target) ? (target - solves.length) * per : Infinity, Number.isFinite(deadline) ? deadline - Date.now() : Infinity);
      bar.style.width = Number.isFinite(target) ? `${Math.min(100, (n / (target - done0)) * 100)}%`
        : Number.isFinite(deadline) ? `${Math.min(100, (elapsed / (len.hours * HOUR)) * 100)}%` : `${(elapsed / 600) % 100}%`;
      status.textContent = `Složeno ${solves.length}${Number.isFinite(target) ? ` z ${target}` : ''} · ${fmtTime(elapsed)}`
        + `${Number.isFinite(per) ? ` · ${fmt(per / 1000)} s na zamíchání` : ''}${Number.isFinite(left) && n ? ` · zbývá asi ${fmtTime(left)}` : ''} · ${pool.length} vlákna`;
      if (long) title.set(`(${solves.length})`);
    };
    const statusTimer = setInterval(progress, 1000);
    await new Promise((resolve) => {
      let active = 0;
      const finish = () => { if (!active) resolve(); };
      stopResolve = () => { running = false; resolve(); };
      const feed = (w) => {
        if (!running || next >= target || Date.now() >= deadline) { finish(); return; }
        const k = next++;
        active++;
        w.postMessage({ type: 'solve', id: k, start: Array.from(scr(k)) });
      };
      stopAll();
      pool = Array.from({ length: workerCount() }, () => {
        const w = new Worker(new URL('../sim/sim-worker.js', import.meta.url), { type: 'module' });
        w.onmessage = ({ data }) => {
          active--;
          if (data.type === 'solved' && running) {
            // případ, na který sada neměla algoritmus (řešilo ho hledání)
            data.solve.steps.forEach((x, i) => { if (x.source === 'search' && meta.hasSet[i]) x.missingSet = true; });
            solves.push(compact(data.solve, data.id));
            if (performance.now() - lastRender > 1500) { lastRender = performance.now(); renderResults(solves, meta); }
            if (long && performance.now() - lastSave > 15000) { lastSave = performance.now(); save(); }
          } else if (data.type === 'error') toast(`Simulace: ${data.message}`);
          feed(w);
        };
        w.onerror = (e) => { active--; toast(`Simulace: ${e.message || 'chyba ve workeru'}`); feed(w); };
        w.postMessage({ type: 'plan', plan });
        return w;
      });
      progress();
      for (const w of pool) feed(w);
    });
    clearInterval(statusTimer);
    const finished = running;
    running = false;
    stopAll();
    stopResolve = () => {};
    awake?.release(); awake = null;
    title.reset();
    next = contiguous(solves);
    go.hidden = false; more.hidden = false; stop.hidden = true; track.hidden = true;
    stepList.classList.remove('locked');
    if (!alive) return;
    save(true);
    last = { solves, meta, next };
    const sum = renderResults(solves, meta);
    status.textContent = `${finished ? 'Hotovo' : 'Zastaveno'}: ${solves.length} zamíchání${sum?.failed ? ` (${sum.failed} se nepodařilo složit – zkus delší hledání, víc tahů nebo „Moje sada, jinak hledání“)` : ''} · ${fmtTime(performance.now() - t0)}`;
    if (sum?.count) { addHistory(sum, meta); renderHistory(); }
    if (long && finished && sum?.count) notify('Simulace metody', `${methods.get(method).name}: ${fmt(sum.moves)} tahů na složení (${sum.count} zamíchání)`);
  }

  go.onclick = () => { last = null; run(null); };
  more.onclick = () => { if (last && last.meta.sig === sigNow) run(last); };
  stop.onclick = () => { stopAll(); stopResolve(); };

  // --- výsledky -------------------------------------------------------------------------------
  function renderResults(solves, meta) {
    const timing = { tps: Number(tps.value) || 4, recog: meta.stepIds.map((id) => Number(config[id]?.recog) || 0) };
    const sum = summarize(solves, meta.stepTitles.length, timing);
    if (!sum.count) { results.replaceChildren(); return sum; }
    const maxMoves = Math.max(...sum.steps.map((s) => s.moves), 1);
    // minulý běh této metody s jiným nastavením: rozdíl po krocích
    const prev = (storage.get(HISTORY) ?? []).find((h) => h.method === method && h.sig !== meta.sig && h.steps?.length);
    const delta = (a, b) => el('span', { className: `sim-delta${a < b - 0.05 ? ' good' : a > b + 0.05 ? ' bad' : ''}`, title: 'Proti minulé simulaci', textContent: `${a <= b ? '−' : '+'}${fmt(Math.abs(a - b))}` });
    const rows = meta.stepTitles.map((t, i) => {
      const s = sum.steps[i];
      const tags = [i === sum.worst ? 'nejvíc tahů' : null, i === sum.slowest && sum.slowest !== sum.worst ? 'nejvíc času' : null].filter(Boolean);
      const info = [`medián ${s.median}`, `90 % ≤ ${s.p90}`, `náročnost ${fmt(s.score)}`, `${fmt(s.time, 2)} s`, `${pct(s.share)} tahů`, s.skipped ? `${pct(s.skipped)} přeskočeno` : null].filter(Boolean).join(' · ');
      const cover = meta.hasSet[i] && s.needed
        ? [`sadou ${pct(s.fromSet / s.needed)} případů`, s.searched ? `${s.searched}× chyběl algoritmus` : null, s.helper ? `${s.helper}× s pomocným algoritmem` : null].filter(Boolean).join(' · ') : null;
      const pstep = prev?.steps.find((x) => x.id === meta.stepIds[i]);
      return el('div', { className: `sim-res-row${tags.length ? ' worst' : ''}` },
        el('div', { className: 'sim-res-label' }, el('b', { textContent: t }), ...tags.map((x) => el('span', { className: 'sim-tag', textContent: x }))),
        el('div', { className: 'sim-res-bar', role: 'img', ariaLabel: `${fmt(s.moves)} tahů v průměru` }, el('i', { style: `width: ${(s.moves / maxMoves) * 100}%` })),
        el('div', { className: 'sim-res-nums' }, el('b', { textContent: `${fmt(s.moves)} tahů` }), pstep ? delta(s.moves, pstep.moves) : null, el('small', { textContent: info })),
        cover ? el('small', { className: 'sim-cover', textContent: cover }) : null,
        s.missing ? el('small', { className: 'ko', textContent: `V sadě chyběl algoritmus u ${s.missing} zamíchání (jen sada) – ta se nedosložila` }) : null);
    });
    const examples = pickExamples(solves);
    results.replaceChildren(...[ // replaceChildren nevynechá null jako el()
      el('div', { className: 'sim-hero' },
        el('div', {}, el('span', { className: 'tile-label', textContent: 'Průměr na složení' }), el('b', { textContent: `${fmt(sum.moves)} tahů` }),
          el('small', { textContent: `± ${fmt(sum.ci)} (95 %) · medián ${sum.median} · od ${sum.min} do ${sum.max} · ${sum.count} zamíchání` })),
        el('div', {}, el('span', { className: 'tile-label', textContent: 'Odhad času' }), el('b', { textContent: `${fmt(sum.time, 2)} s` }),
          el('small', { textContent: `rozpoznání + provedení při ${fmt(Number(tps.value))} tazích/s · náročnost ${fmt(sum.score)}` })),
        prev ? el('small', { className: 'sim-hero-prev', textContent: `Minulá simulace (${when(prev.at)}, ${prev.label ?? ''}): ${fmt(prev.moves)} tahů${prev.time ? ` · ${fmt(prev.time, 2)} s` : ''}` }) : null),
      Object.keys(sum.variants).length > 1 || meta.variants.length > 1
        ? el('p', { className: 'hint', textContent: `Orientace: ${Object.entries(sum.variants).map(([v, n]) => `${meta.variants[v]} ${pct(n / sum.count)}`).join(' · ')}` }) : null,
      el('div', { className: 'sim-res' }, ...rows),
      sum.hist.length > 1 ? el('div', { className: 'sim-hist', role: 'img', ariaLabel: 'Rozložení počtu tahů na složení' },
        ...sum.hist.map((h) => el('div', { className: 'sim-hist-col', title: `${h.from}–${h.to} tahů: ${h.n}×` },
          el('i', { style: `height: ${(h.n / Math.max(...sum.hist.map((x) => x.n))) * 100}%` }), el('small', { textContent: String(h.from) })))) : null,
      missingCases(solves, meta),
      examples.length ? el('details', { className: 'sim-example' }, el('summary', { textContent: 'Ukázková složení' }),
        ...examples.map(({ label, s }) => {
          const scramble = scrambleOf(s.start);
          return el('div', { className: 'sim-ex' }, el('b', { textContent: `${label}: ${s.steps.reduce((a, x) => a + x.length, 0)} tahů` }),
            scramble ? el('p', {}, el('small', { textContent: 'Zamíchání' }), el('code', { textContent: scramble })) : null,
            el('ol', {}, ...s.steps.map((x, i) => el('li', {},
              el('b', { textContent: `${meta.stepTitles[i]}: ` }),
              x.rotation ? el('code', { className: 'sim-rot', title: 'Otočení kostky (volnost kroku)', textContent: `(${x.rotation}) ` }) : null,
              x.source === 'skip' ? el('em', { textContent: 'přeskočeno' }) : el('code', { textContent: x.display ?? '' }),
              i === 0 && meta.variants.length > 1 && meta.variants[x.variant] ? el('small', { textContent: ` · ${meta.variants[x.variant]}` }) : null,
              el('small', { textContent: x.source === 'skip' ? '' : ` · ${x.length} tahů${x.source === 'set' ? ` · ${x.name ?? 'ze sady'}${x.helper ? ` (+ ${x.helper})` : ''}` : ''}` })))));
        })) : null].filter(Boolean));
    return sum;
  }

  /** Ukázky: nejbližší průměru, nejkratší a nejdelší (z těch, u kterých se pamatuje zápis). */
  function pickExamples(solves) {
    const list = solves.filter((s) => s.ok && s.start).map((s) => ({ s, t: s.steps.reduce((a, x) => a + x.length, 0) }));
    if (!list.length) return [];
    const avg = list.reduce((a, x) => a + x.t, 0) / list.length;
    const by = (f) => list.reduce((b, x) => (f(x) < f(b) ? x : b));
    const out = [{ label: 'Nejbližší průměru', s: by((x) => Math.abs(x.t - avg)).s }, { label: 'Nejkratší', s: by((x) => x.t).s }, { label: 'Nejdelší', s: by((x) => -x.t).s }];
    return out.filter((x, i) => out.findIndex((y) => y.s === x.s) === i);
  }

  /** Případy, na které sada neměla algoritmus: co v nich našlo hledání (návrh do sady). */
  function missingCases(solves, meta) {
    const blocks = meta.stepTitles.map((t, i) => {
      if (!meta.hasSet[i]) return null;
      const counts = new Map();
      for (const s of solves) { const x = s.steps[i]; if (x?.missingSet && x.display) counts.set(x.display, (counts.get(x.display) ?? 0) + 1); }
      if (!counts.size) return null;
      const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12);
      return el('div', { className: 'sim-missing-step' }, el('b', { textContent: `${t}: ${counts.size}× řešení mimo sadu` }),
        el('ul', {}, ...top.map(([alg, n]) => {
          const copy = Object.assign(el('button', { type: 'button', className: 'icon-btn', title: 'Kopírovat', ariaLabel: `Kopírovat ${alg}` }), { innerHTML: icon('copy', { size: 16 }) });
          copy.onclick = () => navigator.clipboard?.writeText(alg).then(() => toast('Zkopírováno'), () => toast('Kopírování se nepovedlo'));
          return el('li', {}, el('code', { textContent: alg }), el('small', { textContent: `${n}×` }), copy);
        })));
    }).filter(Boolean);
    return blocks.length ? el('details', { className: 'sim-example sim-missing' },
      el('summary', { textContent: 'Případy, na které v sadě nemáš algoritmus' }),
      el('p', { className: 'hint', textContent: 'Co v nich našlo hledání – kandidáti, které můžeš doplnit do sady (v Labu nebo generátorem sady).' }), ...blocks) : null;
  }

  // --- historie a porovnání ---------------------------------------------------------------------
  const settingsLabel = () => {
    const free = planSteps.filter((x) => x.cfg.free && x.cfg.free !== 'fixed').length;
    return `${free ? `volnost u ${free} ${free === 1 ? 'kroku' : 'kroků'}` : 'pevně'} · semínko ${seed.value} · ${planSteps.length} kroků`;
  };
  function addHistory(sum, meta) {
    const list = (storage.get(HISTORY) ?? []).filter((h) => h.sig !== meta.sig);
    list.unshift({
      method, name: methods.get(method).name, sig: meta.sig, at: Date.now(), n: sum.count, moves: sum.moves, ci: sum.ci, time: sum.time, score: sum.score,
      median: sum.median, label: settingsLabel(),
      steps: meta.stepTitles.map((t, i) => ({ id: meta.stepIds[i], title: t, moves: sum.steps[i].moves, median: sum.steps[i].median, time: sum.steps[i].time, recog: Number(config[meta.stepIds[i]]?.recog) || 0 })),
    });
    storage.set(HISTORY, list.slice(0, HISTORY_MAX));
    cmpRight = `run:${meta.sig}`; // porovnání ukáže právě dokončenou simulaci
  }
  // --- porovnání ve dvou sloupcích: vlevo metoda ke srovnání, vpravo tvoje ------------------------
  let cmpLeft = saved.cmpLeft ?? 'ref:cfop', cmpRight = null;
  /** Zdroje k porovnání: vestavěné metody a tvoje simulace (poslední u každého nastavení). */
  function sources() {
    const refs = REFERENCES.map((r) => ({ id: `ref:${r.id}`, label: `${r.name} (vestavěná)`, ...r, ref: true }));
    const runs = (storage.get(HISTORY) ?? []).filter((h) => h.steps?.length).map((h) => ({
      id: `run:${h.sig}`, label: `${h.name} · ${when(h.at)}`, name: h.name, n: h.n, moves: h.moves, ci: h.ci, median: h.median, steps: h.steps, mine: h.method === method, note: h.label,
    }));
    return [...refs, ...runs];
  }
  /** Odhad času stejným vzorcem pro obě strany: rozpoznání + tahy / TPS. */
  const estTime = (src) => src.steps.reduce((a, st) => a + (st.moves > 0 ? (st.recog ?? 0) : 0) + st.moves / (Number(tps.value) || 4), 0);
  function renderCompare() {
    const list = sources();
    const runs = list.filter((x) => !x.ref);
    const byId = (id) => list.find((x) => x.id === id);
    if (!byId(cmpLeft)) cmpLeft = list[0].id;
    // vpravo tvoje poslední simulace (bez ní zatím druhá vestavěná metoda)
    if (!cmpRight || !byId(cmpRight)) cmpRight = (runs.find((x) => x.mine) ?? runs[0] ?? list.find((x) => x.id !== cmpLeft)).id;
    const pick = (value, onChange, label) => {
      const sel = el('select', { className: 'small-select', ariaLabel: label },
        el('optgroup', { label: 'Vestavěné metody' }, ...list.filter((x) => x.ref).map((x) => el('option', { value: x.id, textContent: x.label }))),
        runs.length ? el('optgroup', { label: 'Tvoje simulace' }, ...runs.map((x) => el('option', { value: x.id, textContent: x.label }))) : null);
      sel.value = value;
      sel.onchange = () => { onChange(sel.value); renderCompare(); };
      return sel;
    };
    const L = byId(cmpLeft), R = byId(cmpRight);
    const max = Math.max(...L.steps.map((x) => x.moves), ...R.steps.map((x) => x.moves), 1);
    const metrics = [
      ['Tahů na složení', (x) => x.moves, (v) => fmt(v), true],
      ['Odhad času', (x) => estTime(x), (v) => `${fmt(v, 2)} s`, true],
      ['Medián tahů', (x) => x.median, (v) => (Number.isFinite(v) ? String(v) : '–'), true],
      ['Kroků', (x) => x.steps.length, (v) => String(v), false],
      ['Nejdelší krok', (x) => Math.max(...x.steps.map((st) => st.moves)), (v) => `${fmt(v)} tahů`, true],
      ['Zamíchání', (x) => x.n, (v) => String(v), false],
    ];
    const cell = (v, other, lower, show) => el('td', { className: lower && Number.isFinite(v) && Number.isFinite(other) && v < other - 0.05 ? 'win' : '', textContent: show(v) });
    const diff = R.moves - L.moves;
    const column = (src) => el('div', { className: 'sim-cmp-col' },
      el('b', { textContent: `${src.name} · ${src.steps.length} kroků` }),
      el('div', { className: 'sim-cmp-steps' }, ...src.steps.map((st) => el('div', { className: 'sim-cmp-step' },
        el('div', { className: 'sim-cmp-step-head' }, el('span', { textContent: st.title }), el('b', { textContent: fmt(st.moves) })),
        el('div', { className: 'sim-res-bar' }, el('i', { style: `width: ${(st.moves / max) * 100}%` }))))));
    compare.replaceChildren(
      el('h3', { textContent: 'Porovnání metod' }),
      el('div', { className: 'sim-cmp' },
        el('div', { className: 'sim-cmp-pick' }, pick(cmpLeft, (v) => { cmpLeft = v; const all = storage.get(OPTS) ?? {}; storage.set(OPTS, { ...all, cmpLeft: v }); }, 'Metoda ke srovnání')),
        el('div', { className: 'sim-cmp-pick mine' }, pick(cmpRight, (v) => { cmpRight = v; }, 'Tvoje metoda'))),
      el('div', { className: 'sim-cmp-total' },
        el('b', { className: diff < -0.05 ? 'ok' : diff > 0.05 ? 'ko' : '', textContent: `${diff <= 0 ? '−' : '+'}${fmt(Math.abs(diff))} tahů (${diff <= 0 ? '−' : '+'}${Math.round(Math.abs(diff / L.moves) * 100)} %)` }),
        el('small', { textContent: `vpravo proti vlevo · čas ${estTime(R) <= estTime(L) ? '−' : '+'}${fmt(Math.abs(estTime(R) - estTime(L)), 2)} s` })),
      el('table', { className: 'compare sim-cmp-table' },
        el('thead', {}, el('tr', {}, el('th', {}), el('th', { textContent: L.name }), el('th', { textContent: R.name }))),
        el('tbody', {}, ...metrics.map(([label, f, show, lower]) => el('tr', {}, el('td', { textContent: label }),
          cell(f(L), f(R), lower, show), cell(f(R), f(L), lower, show))))),
      el('div', { className: 'sim-cmp' }, column(L), column(R)),
      el('p', { className: 'hint', textContent: `${runs.length ? '' : 'Spusť simulaci své metody – objeví se vpravo. '}${L.ref ? `${L.name}: ${L.description} ` : ''}${R.ref ? `${R.name}: ${R.description} ` : ''}${REFERENCE_NOTE}` }));
  }

  function renderHistory() {
    renderCompare();
    const list = storage.get(HISTORY) ?? [];
    if (!list.length) { history.replaceChildren(); return; }
    const best = Math.min(...list.map((h) => h.moves));
    history.replaceChildren(el('h3', { textContent: 'Historie simulací' }),
      el('div', { className: 'sim-hist-list' }, ...list.slice(0, 15).map((h) => {
        const del = Object.assign(el('button', { type: 'button', className: 'icon-btn', title: 'Smazat z historie', ariaLabel: 'Smazat z historie' }), { innerHTML: icon('trash', { size: 16 }) });
        del.onclick = () => { storage.set(HISTORY, (storage.get(HISTORY) ?? []).filter((x) => !(x.sig === h.sig && x.at === h.at))); renderHistory(); };
        return el('div', { className: `sim-hist-item${h.method === method ? ' mine' : ''}` },
          el('div', { className: 'sim-hist-main' }, el('b', { textContent: h.name }),
            el('small', { textContent: `${when(h.at)} · ${h.n} zamíchání${h.label ? ` · ${h.label}` : ''}` }),
            h.steps ? el('small', { className: 'sim-hist-steps', textContent: h.steps.map((s) => `${s.title} ${fmt(s.moves)}`).join(' · ') } ) : null),
          el('div', { className: 'sim-hist-nums' }, el('b', { className: h.moves === best && list.length > 1 ? 'ok' : '', textContent: `${fmt(h.moves)} tahů` }),
            h.ci ? el('small', { textContent: `± ${fmt(h.ci)}` }) : null, h.time ? el('small', { textContent: `${fmt(h.time, 2)} s` }) : null),
          del);
      })),
      el('p', { className: 'hint', textContent: 'Férové porovnání: stejné semínko a dost zamíchání (± u průměru říká, o kolik se může lišit náhodou).' }));
  }

  // --- start: minulý nebo rozpracovaný běh ------------------------------------------------------
  changed();
  renderSteps();
  renderHistory();
  const r = storage.get(RUN);
  if (r?.meta?.method === method && r.solves?.length) {
    const same = r.meta.sig === sigNow;
    last = { solves: r.solves, meta: r.meta, next: contiguous(r.solves) };
    renderResults(r.solves, r.meta);
    const resume = el('button', { type: 'button', className: 'primary small', textContent: r.finished ? 'Přidat zamíchání' : 'Pokračovat', hidden: !same });
    resume.onclick = () => run(last);
    banner.replaceChildren(
      el('div', {}, el('b', { textContent: r.finished ? 'Poslední simulace' : 'Rozpracovaná simulace' }),
        el('small', { textContent: `${when(r.meta.started)} · ${r.solves.length} zamíchání${same ? ' · navážeš dalšími' : ' · nastavení se od té doby změnilo'}` })),
      el('div', { className: 'row-btns' }, resume));
    banner.hidden = false;
    more.hidden = !same;
  }
  return { running: () => running, destroy };
}
