// Test metody (sekce Metoda → Otestovat): náhodná zamíchání se složí krok po
// kroku podle kroků metody (dílky hotové po kroku, viz parts.js). U každého kroku
// si nastavíš, jak se řeší: tahy, tvoje sada (i s natočením vrstev a pomocným
// algoritmem jako oprava parity), nebo hledání, podle čeho vybírat, čas rozpoznání,
// a volnost – kde smí být jeho dílky (kříž libovolnou barvou, pár v kterémkoli slotu,
// blok na kterémkoli boku). Kroky jde vypnout (složí se s dalším).
//
// Zamíchání skládá víc workerů souběžně (sim/sim-worker.js). Běh může jet i přes noc:
// průběžně se ukládá, po zavření jde navázat a výsledky se doplňují. Stejné semínko
// = stejná zamíchání, takže změny nastavení i metody jde férově porovnat.

import { KNOWN_SETS } from '../sim/knownsets.js';
import { el, storage } from './dom.js';
import { icon } from './icons.js';
import { methods, guides, algs, algSets } from './store.js';
import { describeParts, stepParts, mergeParts } from './parts.js';
import { buildPlan, STEP_MOVES, FREEDOM, ROTATION, NEUTRAL, stepBases } from '../sim/plan.js';
import { caseCounter } from './casecounter.js';
import { summarize, seededRandom, stepEstimate, LEVELS, levelTps, STYLES } from '../sim/simulate.js';
import { practiceState } from '../timer/practice.js';
import { toFacelets } from '../core/cube.js';
import { solve as twoPhase } from '../timer/twophase.js';
import { keepAwake, askNotify, notify, titleProgress } from './longrun.js';
import { toast } from './share.js';
import { REFERENCES, REFERENCE_NOTE } from '../sim/references.js';
import { methodReport } from '../sim/report.js';
import { openProfile, onProfile, profileSummary, profile } from './profile.js';
import { knownForStep } from '../sim/profile.js';
import { stepConfig, setStepConfig, solveByOf, generatedState, stepSignature } from './stepcfg.js';
import { SLOTS } from '../core/geometry.js';
import { cellsSummary } from './celleditor.js';
import { netSvg } from './netsvg.js';
import { VIEWS } from '../ergonomics/style.js';
import { makeLearner } from '../sim/learn.js';

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
let pendingHarvest = null; // id kroků: po otevření testu ho spustit a nalezená řešení uložit jako jejich sady

/** Otevře test tak, že ho spustí a řešení kroku (nebo kroků) uloží jako jejich sady algoritmů. */
export function harvestStep(stepIds) { pendingHarvest = [stepIds].flat(); }
const HARVEST_MAX = 800; // nejvýš tolik různých řešení na krok

/**
 * @param {{lab: () => {ergo: object, lambda: number}, onEdit?: () => void}} d
 *   lab = hodnocení z Labu (Tahy a váhy), onEdit = upravit kroky (Sestavit), isVisible = test je vidět
 */
export function initSimulator(d) {
  deps = { ...deps, ...d };
  // jiná metoda nebo upravené kroky: překreslit (běžící simulaci nechat doběhnout)
  const refresh = () => { if (current && !current.running() && deps.isVisible?.()) showSimulator(); };
  methods.subscribe(refresh);
  guides.subscribe(refresh);
}

/** Zobrazí simulátor aktivní metody (běžící simulace zůstane, jak je). */
export function showSimulator() {
  const host = document.getElementById('sim-root');
  if (!host) return;
  if (current?.running()) return;
  current?.destroy();
  const cmpHost = document.getElementById('cmp-root');
  host.replaceChildren();
  cmpHost?.replaceChildren();
  current = mountSimulator(host, deps.lab(), { onEdit: deps.onEdit, cmpHost });
}

/**
 * @param {HTMLElement} host
 * @param {{ergo: object, lambda: number}} lab hodnocení z Labu (Tahy a váhy)
 * @param {{onEdit?: () => void}} [opts] onEdit = upravit dílky kroků v průvodci
 */
function mountSimulator(host, lab, { onEdit, cmpHost = host } = {}) {
  const method = methods.active();
  const guide = guides.get(method);
  const saved = storage.get(OPTS) ?? {};
  // nastavení kroků patří ke krokům metody (Sestavit), test je jen čte
  const config = Object.fromEntries(guide.steps.map((st) => [st.id, stepConfig(method, st)]));
  const setAlgs = (id) => algs.list().filter((a) => a.set === id);
  const stepsWithParts = guide.steps.map((st, i) => ({ st, i, parts: stepParts(st) }))
    .filter((x) => Object.keys(x.parts).length || x.st.rules?.length || Object.keys(x.st.cells ?? {}).length || (config[x.st.id].solveBy === 'fixed' && config[x.st.id].fixedAlg));

  const body = el('div', { className: 'sim-body' });
  host.append(body);
  let alive = true;
  const harvest = new Map(); // krok → Map(algoritmus → { n, a, b, hold })
  // kroky algoritmů: nalezená řešení po případech (sim/learn.js) – jeden algoritmus na případ
  let learner = null;
  const used = new Map(); // krok → Map(zápis → { n, source, score, length, name }) – které algoritmy test použil
  const USED_MAX = 300;
  const misses = new Map(); // krok → Map(barvy případu → { n, a, b, goal, hold, found }) – na co sada neměla algoritmus
  const MISS_MAX = 60;
  let harvestTargets = [];
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
      el('p', { textContent: 'Test potřebuje kroky metody s vybranými dílky.' }),
      el('p', { className: 'hint', textContent: 'V části „Sestavit“ přidej kroky a u každého vyber, co je po něm hotové (předvolby jako kříž, pár, bloky…).' }),
      editBtn('Upravit kroky', 'primary')));
    if (cmpHost !== host) cmpHost.append(el('div', { className: 'guide-empty' }, el('p', { textContent: 'Porovnat jde až otestovanou metodu – nejdřív přidej kroky v části „Sestavit“.' })));
    return { running: () => false, destroy };
  }

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

  // --- kroky (jen přehled – nastavují se v Sestavit) ------------------------------------------------
  const stepList = el('div', { className: 'sim-steps' });
  function renderSteps() {
    stepList.replaceChildren(...stepsWithParts.map(({ st, i, parts }) => {
      const cfg = config[st.id];
      const n = cfg.solveBy === 'known' && KNOWN_SETS[cfg.knownSet] ? KNOWN_SETS[cfg.knownSet].algs.length : st.set ? setAlgs(st.set).length : 0;
      const at = planSteps.findIndex((x) => x.st.id === st.id);
      const places = at >= 0 ? plan?.choices?.[at] ?? 1 : 1;
      const info = cfg.solveBy === 'fixed' ? `jen někdy: ${cfg.fixedAlg} (${cfg.when === 'always' ? 'vždy' : 'když je parita'})` : cfg.on === false ? 'v testu spojený s dalším krokem' : [
        st.cells && Object.keys(st.cells).length ? cellsSummary(st.cells) : [Object.keys(parts).length ? describeParts(parts) : null, st.rules?.length ? `${st.rules.length}× pravidlo` : null].filter(Boolean).join(' + '),
        cfg.free && cfg.free !== 'fixed' ? `${FREEDOM[cfg.free]?.label.replace(/ \(.*\)|…/g, '').toLowerCase()} (${places} míst)` : 'přesně tady',
        n && cfg.mode !== 'search' ? `${cfg.solveBy === 'known' ? KNOWN_SETS[cfg.knownSet].short : cfg.mode === 'set' ? 'jen sada' : 'sada'} (${n})` : 'hledání',
        cfg.moves === 'custom' ? `<${(cfg.custom ?? []).join(', ')}>` : (STEP_MOVES[cfg.moves] ?? STEP_MOVES.faces).label,
        cfg.style && STYLES[cfg.style] ? STYLES[cfg.style].label.toLowerCase() : null,
      ].filter(Boolean).join(' · ');
      return el('div', { className: `sim-step${cfg.on === false ? ' off' : ''}` },
        el('div', { className: 'sim-step-head' },
          el('span', { className: 'guide-n', textContent: String(i + 1) }),
          el('div', { className: 'sim-step-title' }, el('b', { textContent: st.title || `Krok ${i + 1}` }), el('small', { textContent: info }))));
    }));
  }

  // --- nastavení simulace ---------------------------------------------------------------------
  const rotation = select(ROTATION, ROTATION[saved.rotation] ? saved.rotation : 'free', 'Otočení kostky', () => changed());
  const length = select(LENGTHS, LENGTHS[saved.length] ? saved.length : 'c25', 'Délka simulace', () => remember());
  const seed = num(saved.seed ?? 1, 'Semínko zamíchání', 0, 999999, 1, () => changed());
  const neutral = select(NEUTRAL, NEUTRAL[saved.colorNeutral] ? saved.colorNeutral : 'fixed', 'Barevná neutralita', () => changed());
  const rerender = () => { remember(); tpsField.hidden = !!LEVELS[level.value].tps; updateProfileNote(); if (last) renderResults(last.solves, last.meta); renderCompare(); };
  // úroveň „Já“: shrnutí profilu a odkaz na jeho úpravu
  const profileNote = el('p', { className: 'hint sim-profile' });
  function updateProfileNote() {
    profileNote.hidden = level.value !== 'me';
    profileNote.replaceChildren(profileSummary(), ' ', Object.assign(el('button', { type: 'button', className: 'link-btn' }), { textContent: LEVELS.me?.fromProfile ? 'Upravit profil' : 'Vyplnit profil', onclick: () => openProfile() }));
  }
  onProfile(() => {
    const o = level.querySelector('option[value="me"]');
    if (o) o.textContent = LEVELS.me.label;
    rerender();
  });
  const tps = num(saved.tps ?? 4, 'Tahy za sekundu', 1, 15, 0.5, rerender);
  // úroveň skladače: světová špička (potenciál metody), rychlý skladač, vlastní tempo, počítač
  const level = select(Object.fromEntries(Object.entries(LEVELS).map(([id, x]) => [id, x.label])), LEVELS[saved.level] ? saved.level : 'pro', 'Úroveň skladače', rerender);
  const lvl = () => level.value;
  const levelText = () => (LEVELS[lvl()].tps ? LEVELS[lvl()].label : `${LEVELS[lvl()].label}: ${fmt(Number(tps.value))} tahů/s`);
  const tpsField = field('Tahy za sekundu', tps, 'Tvoje tempo – algoritmy jdou rychleji, intuitivní kroky a bloky pomaleji');
  tpsField.hidden = !!LEVELS[lvl()].tps;
  updateProfileNote();
  const go = el('button', { type: 'button', className: 'primary sim-go', textContent: 'Spustit test' });
  const more = el('button', { type: 'button', className: 'secondary', textContent: 'Přidat zamíchání', hidden: true, title: 'Pokračuje dalšími zamícháními (stejné semínko) a výsledky doplní' });
  const stop = el('button', { type: 'button', className: 'secondary', textContent: 'Zastavit', hidden: true });
  const status = el('p', { className: 'status sim-status' });
  const bar = el('div', { className: 'gen-bar' });
  const track = el('div', { className: 'gen-track sim-track', hidden: true }, bar);
  const banner = el('div', { className: 'gen-resume', hidden: true });
  const results = el('div', { className: 'sim-results sim-card' });
  const history = el('div', { className: 'sim-history' });
  const compare = el('div', { className: 'sim-compare sim-card' });
  const head = (n, title, hint, extra) => el('header', { className: 'bld-q sim-card-head' }, el('span', { className: 'bld-qn', textContent: n }),
    el('div', {}, el('b', { textContent: title }), hint ? el('small', { textContent: hint }) : null), extra ?? null);

  body.append(
    banner,
    el('section', { className: 'sim-card sim-setup' },
      head('1', 'Spustit test', 'Náhodná zamíchání se složí krok po kroku podle tvé metody – algoritmem ze sady, jinak hledáním. Algoritmy kroků „vygenerovat“ si test vytvoří sám. Srovnání s CFOP, Roux a ZZ je v části „Porovnat“.'),
      el('div', { className: 'grid-fields' },
        field('Délka', length, 'Počet zamíchání, nebo čas – dlouhý běh se průběžně ukládá a jde navázat'),
        field('Odhad času pro', level, 'Světová špička = co z metody jde vytáhnout (tempo a rozpoznání nejlepších skladačů); „Já“ = podle tvého profilu skladače'),
        field('Barevná neutralita', neutral, 'Dvě barvy: první krok smí být s tvou barvou dole i s tou naproti (bílá i žlutá) – test u každého zamíchání vybere lepší, jako bys to viděl při prohlídce. Algoritmy platí pro obě.'),
        tpsField),
      profileNote,
      el('details', { className: 'sim-more' }, el('summary', { textContent: 'Další nastavení (otočení kostky, semínko zamíchání)' }),
        el('div', { className: 'grid-fields' },
          field('Otočení kostky', rotation, 'Když krok volnost složí jinde, kostku otočíš (y, x2…) – počítat to do tahů?'),
          field('Semínko zamíchání', seed, 'Číslo, ze kterého se vyrobí náhodná zamíchání. Stejné semínko = přesně stejná zamíchání, takže dvě nastavení nebo metody porovnáš férově; jiné semínko = jiná sada zamíchání.'))),
      el('div', { className: 'row-btns sim-run-btns' }, go, more, stop), track, status),
    el('details', { className: 'sim-card sim-steps-box' },
      el('summary', {}, el('b', { textContent: `Co se testuje (${stepsWithParts.length} ${stepsWithParts.length === 1 ? 'krok' : stepsWithParts.length < 5 ? 'kroky' : 'kroků'})` }),
        el('small', { textContent: 'kroky a jejich nastavení – upravíš v Sestavit' })),
      stepList, el('div', { className: 'row-btns' }, editBtn('Upravit kroky', 'secondary small'))),
    results);
  // část „Porovnat“: srovnání s jinými metodami a historie testů
  cmpHost.append(el('div', { className: 'sim-body' }, compare, history));

  let sigNow = '';
  let plan = null, planSteps = [];
  let last = null; // { solves, meta, next }
  function remember() {
    const all = storage.get(OPTS) ?? {};
    storage.set(OPTS, { ...all, neutral: undefined, colorNeutral: neutral.value, rotation: rotation.value, length: length.value, seed: Number(seed.value), tps: Number(tps.value), level: level.value });
  }
  function changed() {
    remember();
    ({ plan, steps: planSteps } = buildPlan({ guide, config, setAlgs, neutral: neutral.value, rotation: rotation.value, ergonomics: lab.ergo, lambda: lab.lambda }));
    // na čem výsledky závisí (bez časů z trenažéru – ty mění jen odhad času)
    sigNow = hash(JSON.stringify([method, Number(seed.value), plan.rotation, plan.stepOpts.map(({ recog, ...o }) => o),
      plan.variants.map((v) => ({ next: v.next, steps: v.steps.map((s) => ({ parts: s.parts, moves: s.moves, adjust: s.adjust, c: s.candidates.map((c) => c.model) })) })), lab.ergo]));
    if (!running && last) {
      const same = last.meta.sig === sigNow;
      more.hidden = !same;
      if (!same) status.textContent = 'Nastavení se změnilo – „Spustit test“ začne znovu (výsledky níž jsou z minulého nastavení)';
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
      length: x.length, score: x.score, source: x.source, time: x.time, extra: x.extra, helper: x.helper ?? undefined, rotation: x.rotation, adjust: x.adjust || undefined,
      variant: x.variant,
      name: k < KEEP_DISPLAY ? x.name : undefined, missingSet: x.missingSet || undefined,
      // zápis: u ukázek a u případů, na které sada neměla algoritmus (návrh do sady)
      display: k < KEEP_DISPLAY || x.missingSet ? x.display : undefined,
      // tahy modelu u prvních pár složení: ukázkové složení v průvodci a učebnici (teach.js)
      model: k < 8 ? x.model || undefined : undefined,
    })),
  });

  /**
   * Kroky „algoritmy – vygenerovat“: test si je vytvoří sám. Když se krok od minulého
   * vygenerování změnil, staré algoritmy pryč (vytvoří se znovu); na konci testu se
   * nalezená řešení uloží jako sada kroku.
   */
  function generatedSteps() {
    const g = guides.get(method);
    const ids = [];
    for (const st of g.steps) {
      const cfg = stepConfig(method, st);
      if (solveByOf(cfg, st) !== 'generate') continue;
      if (generatedState(method, g, st) === 'stale' && cfg.genSet === st.set) for (const a of algs.inSet(st.set)) algs.remove(a.id);
      ids.push(st.id);
    }
    for (const st of g.steps) config[st.id] = stepConfig(method, st);
    return ids;
  }

  async function run(resume) {
    harvestTargets = [...new Set([...harvestTargets, ...generatedSteps()])];
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
    // nový test: případy kroků od začátku (známé jsou jen algoritmy, které kroky už mají)
    if (!resume || !learner) {
      learner = makeLearner(plan);
      plan.stepOpts.forEach((o, i) => { if (o.cases) learner.seed(i, plan.variants[0].steps[i].candidates); });
    }
    /** Nový algoritmus kroku: všechna vlákna ho od teď používají (hledá se jen u nových případů). */
    const teach = (w, i, entry) => w.postMessage({ type: 'learn', step: i, display: entry.display, name: `${meta.stepTitles[i]} ${learner.count(i)}` });
    const scr = scrambles(meta.seed);
    const t0 = performance.now();
    const done0 = solves.length;
    let lastRender = 0, lastSave = 0;
    const save = (finished = false) => storage.set(RUN, { meta, solves, next: Math.min(next, solves.length), finished, used: [...used].map(([i, m]) => [i, [...m]]), misses: [...misses].map(([i, m]) => [i, [...m]]) });
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
            data.solve.steps.forEach((x, i) => {
              if (x.source === 'search' && meta.hasSet[i]) x.missingSet = true;
              // případ bez algoritmu v sadě: obrázek a zadání (ukáže se ve výsledku, jde otevřít v Labu)
              if (x.miss) {
                const m = misses.get(i) ?? new Map();
                const h = m.get(x.miss.a);
                if (h) { h.n++; if (!h.found && x.display) h.found = x.display; } else if (m.size < MISS_MAX) m.set(x.miss.a, { n: 1, ...x.miss, found: x.source === 'search' ? x.display : null });
                misses.set(i, m);
                delete x.miss;
              }
              // použité algoritmy (i ze sady) – kolikrát a proč
              if (x.display && x.source !== 'skip' && x.source !== 'none') {
                const m = used.get(i) ?? new Map();
                const u = m.get(x.display);
                if (u) u.n++; else if (m.size < USED_MAX) m.set(x.display, { n: 1, source: x.source, score: x.score, length: x.length, name: x.name });
                used.set(i, m);
              }
              // krok algoritmů: nové řešení je nový algoritmus, jen když případ ještě žádný známý nevyřeší
              if (x.case?.state && x.display) {
                const { entry, fresh } = learner.offer(i, { display: x.display, model: x.model, state: Uint8Array.from(x.case.state), goal: x.case.goal, variant: x.case.variant, score: x.score });
                if (fresh) {
                  const m = harvest.get(i) ?? new Map();
                  m.set(entry.display, entry);
                  harvest.set(i, m);
                  if (plan.stepOpts[i]?.learn) for (const p of pool) teach(p, i, entry);
                }
                delete x.case;
              }
              // nalezená řešení (případ + algoritmus) – z nich jde vytvořit sada kroku
              if (x.case && x.display) {
                const m = harvest.get(i) ?? new Map();
                const h = m.get(x.display);
                if (h) h.n++; else if (m.size < HARVEST_MAX) m.set(x.display, { n: 1, ...x.case });
                harvest.set(i, m);
                delete x.case;
              }
            });
            solves.push(compact(data.solve, data.id));
            if (performance.now() - lastRender > 1500) { lastRender = performance.now(); renderResults(solves, meta); }
            if (long && performance.now() - lastSave > 15000) { lastSave = performance.now(); save(); }
          } else if (data.type === 'error') toast(`Simulace: ${data.message}`);
          feed(w);
        };
        w.onerror = (e) => { active--; toast(`Simulace: ${e.message || 'chyba ve workeru'}`); feed(w); };
        w.postMessage({ type: 'plan', plan });
        // navázaný test: algoritmy nalezené dřív (plán je má jen ze sady)
        plan.stepOpts.forEach((o, i) => { if (o.learn) for (const entry of learner.list(i)) teach(w, i, entry); });
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
    const targets = harvestTargets.splice(0);
    if (targets.length) {
      const done = targets.map((id) => meta.stepIds.indexOf(id)).filter((i) => i >= 0).map((i) => saveHarvest(i, meta, true)).filter(Boolean);
      if (done.length) toast(`Algoritmy kroků uložené: ${done.map((x) => `${x.title} ${x.total} (+${x.added})`).join(' · ')} – najdeš je v Trenažéru`);
    }
    if (long && finished && sum?.count) notify('Simulace metody', `${methods.get(method).name}: ${fmt(sum.moves)} tahů na složení (${sum.count} zamíchání)`);
  }

  go.onclick = () => { last = null; harvest.clear(); used.clear(); misses.clear(); learner = null; run(null); };

  /** Nalezená řešení kroku i uloží jako algoritmy jeho sady (sadu případně založí). */
  function saveHarvest(i, meta, quiet = false) {
    const found = harvest.get(i);
    if (!found?.size) { if (!quiet) toast('Krok nemá žádná nalezená řešení (sada ho už celý pokryla, nebo se přeskočil)'); return null; }
    const guide = guides.get(method);
    const st = guide.steps.find((x) => x.id === meta.stepIds[i]);
    if (!st) return null;
    const title = st.title || `Krok ${i + 1}`;
    const cfg = stepConfig(method, st);
    const generated = solveByOf(cfg, st) === 'generate';
    const exists = (id) => id && algSets.list(method).some((x) => x.id === id);
    // vygenerované algoritmy do vlastní sady kroku (ne do tvé ručně vybrané sady)
    let setId = generated ? (exists(cfg.genSet) ? cfg.genSet : null) : exists(st.set) ? st.set : null;
    if (!setId) setId = algSets.add(title);
    st.set = setId;
    const have = new Set(algs.inSet(setId).map((a) => a.alg));
    const all = Object.fromEntries(SLOTS.map((x) => [x.name, 'solved']));
    let n = algs.inSet(setId).length, added = 0;
    for (const [alg, h] of [...found].sort((a, b) => b[1].n - a[1].n)) {
      if (have.has(alg)) continue;
      algs.add({ alg, name: `${title} ${++n}`, set: setId, task: { puzzle: '333', constraints: all, colorsA: [...h.a], colorsB: [...h.b], hold: h.hold } });
      added++;
    }
    // krok teď skládá sadou (chybějící případy dál hledáním); u vygenerovaných i otisk kroku
    setStepConfig(method, st, { mode: 'auto', ...(generated ? { solveBy: 'generate', genSet: setId } : {}) });
    if (generated) setStepConfig(method, st, { genSig: stepSignature(method, guide, st) });
    found.clear();
    guides.set(method, guide);
    if (!quiet) toast(`${title}: ${added} ${added === 1 ? 'nový algoritmus' : added < 5 ? 'nové algoritmy' : 'nových algoritmů'} v sadě – spusť test znovu, krok je bude používat`);
    return { title, added, total: algs.inSet(setId).length };
  }
  more.onclick = () => { if (last && last.meta.sig === sigNow) run(last); };
  stop.onclick = () => { stopAll(); stopResolve(); };

  // --- výsledky -------------------------------------------------------------------------------
  /** Co znamená co (výsledek i porovnání). */
  function explain() {
    const L = LEVELS[lvl()];
    const item = (term, text) => el('div', { className: 'sim-explain-item' }, el('dt', { textContent: term }), el('dd', { textContent: text }));
    return el('details', { className: 'sim-explain' }, el('summary', { textContent: 'Co znamenají čísla' }),
      el('dl', {},
        item('Odhad času', `Rozpoznání + provedení každého kroku, sečtené. Provedení = tahy skladače ÷ tempo. ${L.tps
          ? `Pro „${L.label}“: algoritmy ${fmt(L.tps.alg)} tahů/s, intuitivní kroky ${fmt(L.tps.intuitive)}, bloky ${fmt(L.tps.blocks)}; rozpoznání ${pct(L.recog)} z nastaveného u kroku (špička rozpozná často už během předchozího kroku). Vestavěné metody tak vyjdou CFOP asi 6,2 s a Roux 6,3 s – jako průměry nejlepších skladačů.`
          : L.human ? `Tvoje tempo ${fmt(Number(tps.value))} tahů/s platí pro algoritmy; intuitivní kroky jdou na 90 %, bloky na 55 % (plánování).` : 'Všechny kroky stejným tempem, tahy přesně podle simulace.'}`),
        item('Tahů na složení', `Kolik tahů udělá skutečný skladač. Vychází ze simulace (krok skládá jen povolenými tahy kroku – u F2L třeba ⟨R, U, L, F⟩ s otočením kostky ke slotu): ${L.moves
          ? `pro „${L.label}“ intuitivní kroky × ${fmt(L.moves.intuitive)} (zaběhnuté postupy, ne vždy nejkratší), bloky × ${fmt(L.moves.blocks)}, algoritmy × ${fmt(L.moves.alg)}.`
          : 'intuitivní kroky × 0,9 (špička vidí dopředu, dělá x-cross a víc slotů naráz – simulace skládá krok po kroku), bloky × 1,2 (počítač je najde optimálně, člověk ne), algoritmy beze změny. Nastavené tak, aby CFOP vyšel kolem 57 a Roux kolem 48 tahů – jako v rekonstrukcích světové špičky.'} U každého kroku jde nastavit vlastní Styl skládání (Sestavit → Jak se krok řeší).`),
        item('Simulace', 'Kolik tahů našel počítač, když každý krok složí zvlášť skoro nejlépe (počítá se i natočení vrstev). ± = o kolik se průměr může lišit náhodou; víc zamíchání = přesnější. Medián = polovina složení má méně; „9 z 10 ≤“ = jak dlouhé jsou horší případy.'),
        item('Tempo a rozpoznání', 'Tahy za sekundu podle druhu kroku (nastavíš u kroku v Sestavit → Pokročilé: naučený algoritmus / intuitivní / bloky) a pauza na rozpoznání před krokem (tamtéž).'),
        item('Ergonomie', 'Jak nepohodlné jsou tahy podle hodnocení z Labu (přehmaty, tahy B a D, otáčení kostky…) – součet za krok, čím méně, tím pohodlnější. Do času se nepočítá, slouží k porovnání; vestavěné metody: CFOP 76, Roux 53, ZZ 66.'),
        item('Nejvíc času', 'Krok, který nejvíc zdržuje – tam se nejvíc vyplatí zlepšovat (víc algoritmů, jiné tahy, spojit s jiným krokem).')));
  }

  // kolik případů má krok algoritmů (= kolik algoritmů se naučit) – dopočítá se ve workeru
  const counter = caseCounter();
  function casesOf(i, id) {
    const cfg = config[id];
    if (!plan || cfg?.kind !== 'alg' || cfg.solveBy === 'intuitive' || cfg.solveBy === 'fixed' || plan.variants[0].steps[i]?.fixed) return null;
    const out = el('small', { className: 'sim-cover sim-cases', textContent: 'Počítám případy kroku…' });
    counter.count(plan, i).then((r) => {
      out.textContent = r ? `Krok má ${r.exact ? '' : 'asi '}${r.cases} případů = tolik algoritmů se naučit (stejný případ jen s natočenou vrstvou je jeden)` : '';
      out.hidden = !r;
    });
    return out;
  }

  /**
   * „Jak dobrá je metoda“: index proti CFOP, srovnání s vestavěnými metodami, čas na různých
   * úrovních skladače, rozptyl složení a kde je rezerva (sim/report.js). Počet algoritmů se
   * dopočítá ve workeru – karta se pak překreslí.
   */
  function qualityCard(solves, meta, timing) {
    const box = el('section', { className: 'sim-quality' });
    // skládá metoda celou kostku? (kroky s pravidly pro skupiny dílků se berou jako celé)
    const g = guides.get(method);
    const done = g.steps.reduce((acc, st) => mergeParts(acc, stepParts(st)), {});
    const partial = !g.steps.some((st) => st.rules?.length) && !SLOTS.filter((s) => s.type !== 'center').every((s) => done[s.name] === 'solved');
    const draw = (algCount, knownAlgs = null) => {
      const r = methodReport({ solves, stepCount: meta.stepTitles.length, timing, titles: meta.stepTitles, algCount, knownAlgs, partial });
      if (!r) { box.replaceChildren(); return; }
      const f2 = (v) => fmt(v, 2);
      const show = (m, v) => (Number.isFinite(v) ? (m.unit ? `${fmt(v, m.digits)} ${m.unit}` : fmt(v, m.digits)) : '–');
      const refNames = r.metrics[0].refs.map((x) => x.name);
      const best = (m) => Math.min(...[m.mine, ...m.refs.map((x) => x.value)].filter(Number.isFinite));
      const d = r.dist;
      const maxH = Math.max(...d.hist.map((h) => h.n), 1);
      const cfopT = r.ref.cfop?.time;
      box.replaceChildren(
        el('div', { className: 'sim-q-head' },
          el('div', { className: 'sim-q-index' }, el('b', { textContent: r.index ?? '–' }), el('small', { textContent: 'index rychlosti · CFOP = 100' })),
          el('div', {}, el('b', { className: 'sim-q-title', textContent: 'Jak dobrá je metoda' }),
            el('ul', { className: 'sim-q-verdict' }, ...r.verdict.map((t) => el('li', { textContent: t }))))),
        // srovnávací tabulka
        el('div', { className: 'sim-q-scroll' }, el('table', { className: 'compare sim-q-table' },
          el('thead', {}, el('tr', {}, el('th', {}), el('th', { className: 'mine', textContent: 'Tvoje' }), ...refNames.map((n) => el('th', { textContent: n })), el('th', { textContent: 'Pořadí' }))),
          el('tbody', {}, ...r.metrics.map((m) => el('tr', {},
            el('td', { textContent: m.label }),
            el('td', { className: `mine${Number.isFinite(m.mine) && m.mine <= best(m) + 1e-9 ? ' win' : ''}`, textContent: show(m, m.mine) }),
            ...m.refs.map((x) => el('td', { className: Number.isFinite(x.value) && x.value <= best(m) + 1e-9 ? 'win' : '', textContent: show(m, x.value) })),
            el('td', { className: 'sim-q-rank', textContent: m.rank ? `${m.rank}. z ${m.of}` : r.partial ? '–' : '…' })))))),
        // úrovně skladače
        el('b', { className: 'sim-cmp-sub', textContent: 'Čas podle úrovně skladače' }),
        el('div', { className: 'sim-q-levels' }, ...r.levels.map((l) => el('div', { className: `sim-q-level${l.level === r.level ? ' on' : ''}` },
          el('small', { textContent: l.label }),
          el('b', { textContent: `${f2(l.time)} s` }),
          el('span', { textContent: `CFOP ${f2(l.refs.cfop)} · Roux ${f2(l.refs.roux)} · ZZ ${f2(l.refs.zz)}` }),
          r.partial ? null : el('i', { className: l.index >= 100 ? 'good' : 'bad', textContent: `index ${l.index}` })))),
        // rozptyl složení
        el('b', { className: 'sim-cmp-sub', textContent: 'Jednotlivá složení (odhad času)' }),
        el('div', { className: 'sim-q-dist' },
          ...[['Nejlepší', d.best], ['1 z 10 pod', d.p10], ['Medián', d.median], ['9 z 10 pod', d.p90], ['Nejhorší', d.worst]].map(([k, v]) => el('div', {}, el('small', { textContent: k }), el('b', { textContent: `${f2(v)} s` })))),
        d.hist.length > 1 ? el('div', { className: 'sim-hist sim-q-hist', role: 'img', ariaLabel: 'Rozložení odhadu času složení' },
          ...d.hist.map((h) => el('div', { className: `sim-hist-col${cfopT && h.to <= cfopT ? ' fast' : ''}`, title: `${f2(h.from)}–${f2(h.to)} s: ${h.n}×` },
            el('i', { style: `height: ${(h.n / maxH) * 100}%` }), el('small', { textContent: fmt(h.from, 1) })))) : null,
        el('p', { className: 'hint', textContent: `Rozptyl ± ${f2(d.sd)} s na složení${d.beatsCfop != null && !r.partial ? ` · v ${pct(d.beatsCfop)} složení rychlejší než průměrné CFOP (${f2(cfopT)} s)` : ''}. Přesnost průměru ± ${f2(d.ci)} s${d.ci > 0.06 ? ` – na ± 0,05 s by bylo potřeba asi ${d.needFor} zamíchání` : ''}.` }),
        // kde je rezerva
        el('b', { className: 'sim-cmp-sub', textContent: 'Kde je rezerva' }),
        el('div', { className: 'sim-q-steps' }, ...r.steps.slice(0, 5).map((s) => el('div', { className: 'sim-q-step' },
          el('div', { className: 'sim-q-step-head' }, el('b', { textContent: s.title }), el('span', { textContent: `${f2(s.time)} s · ${pct(s.share)} času` })),
          el('div', { className: 'sim-q-split', role: 'img', ariaLabel: `rozpoznání ${f2(s.recog)} s, provedení ${f2(s.exec)} s` },
            el('i', { className: 'recog', style: `width: ${(s.recog / s.time) * 100}%` }), el('i', { className: 'exec', style: `width: ${(s.exec / s.time) * 100}%` })),
          el('small', { textContent: `rozpoznání ${f2(s.recog)} s + provedení ${f2(s.exec)} s (${fmt(s.moves)} tahů při ${fmt(s.tps)} tahů/s)${s.skipped > 0.02 ? ` · přeskočeno v ${pct(s.skipped)}` : ''}` }),
          el('small', { className: 'sim-q-save', textContent: `o 10 % méně tahů ušetří ${f2(s.saveMoves)} s${s.saveRecog > 0.005 ? ` · poloviční rozpoznání ${f2(s.saveRecog)} s` : ''}` })))),
        el('p', { className: 'hint', textContent: `Vestavěné metody jsou spočtené stejným modelem skladače (${levelText()}), takže srovnání je férové. Algoritmů k naučení: kroky algoritmů – počet různých případů${Number.isFinite(algCount) ? '' : ' (počítá se…)'}.` }));
    };
    draw(null);
    // algoritmy k naučení: součet případů kroků algoritmů (worker)
    const idx = meta.stepIds.map((id, i) => [id, i]).filter(([id, i]) => {
      const cfg = config[id];
      return plan && cfg?.kind === 'alg' && cfg.solveBy !== 'intuitive' && cfg.solveBy !== 'fixed' && !plan.variants[0].steps[i]?.fixed;
    }).map(([, i]) => i);
    // z toho už umíš (sady v profilu skladače, podle názvu kroku)
    Promise.all(idx.map((i) => counter.count(plan, i))).then((list) => {
      const p = profile();
      const known = p.known || p.otherAlgs ? list.reduce((a, x, k) => a + knownForStep(meta.stepTitles[idx[k]], x?.cases ?? 0, p), 0) : null;
      draw(list.reduce((a, x) => a + (x?.cases ?? 0), 0), known);
    }, () => {});
    return box;
  }

  function renderResults(solves, meta) {
    const timing = { tps: Number(tps.value) || 4, recog: meta.stepIds.map((id) => Number(config[id]?.recog) || 0), kinds: meta.stepIds.map((id) => config[id]?.kind ?? 'intuitive'), styles: meta.stepIds.map((id) => config[id]?.style), level: lvl() };
    const sum = summarize(solves, meta.stepTitles.length, timing);
    if (!sum.count) { results.replaceChildren(); return sum; }
    const maxTime = Math.max(...sum.steps.map((s) => s.time), 0.01);
    // minulý běh této metody s jiným nastavením: rozdíl po krocích
    const prev = (storage.get(HISTORY) ?? []).find((h) => h.method === method && h.sig !== meta.sig && h.steps?.length);
    const delta = (a, b, unit = '') => el('span', { className: `sim-delta${a < b - 0.05 ? ' good' : a > b + 0.05 ? ' bad' : ''}`, title: 'Proti minulému testu', textContent: `${a <= b ? '−' : '+'}${fmt(Math.abs(a - b), unit ? 2 : 1)}${unit}` });
    const kindWord = { alg: 'algoritmus', intuitive: 'intuitivní', blocks: 'bloky' };
    // krok „vygenerovat“: kolik různých případů test potkal (stejný případ otočený o U/D je jeden)
    const learned = (i) => {
      const n = config[meta.stepIds[i]]?.solveBy !== 'fixed' && learner && plan?.stepOpts[i]?.learn ? learner.count(i) : 0;
      return n ? `Nové algoritmy: ${n} – jeden na každý případ, který test potkal (stejný případ jen otočený o vrstvu se počítá jednou)` : '';
    };
    const rows = meta.stepTitles.map((t, i) => {
      const s = sum.steps[i];
      const id = meta.stepIds[i];
      const fixed = config[id]?.solveBy === 'fixed';
      const tags = [i === sum.slowest ? 'nejvíc času' : null, i === sum.worst && sum.worst !== sum.slowest ? 'nejvíc tahů' : null].filter(Boolean);
      // hlavní řádek: čas kroku a z čeho je (tahy člověka, tempo, rozpoznání)
      const main = [`${fmt(s.human)} tahů`, `${fmt(s.tps)} tahů/s (${kindWord[config[id]?.kind ?? 'intuitive'] ?? 'intuitivní'})`,
        s.recogTime > 0.005 ? `rozpoznání ${fmt(s.recogTime, 2)} s` : null,
        fixed ? `potřeba v ${pct(1 - s.skipped)} složení` : s.skipped ? `${pct(s.skipped)} přeskočeno` : null].filter(Boolean).join(' · ');
      const detail = fixed ? null : `simulace ${fmt(s.moves)} tahů (medián ${s.median}, 9 z 10 ≤ ${s.p90}) · ergonomie ${fmt(s.score)}`;
      const cover = meta.hasSet[i] && s.needed
        ? [`sadou ${pct(s.fromSet / s.needed)} případů`, s.searched ? `${s.searched}× chyběl algoritmus` : null, s.helper ? `${s.helper}× s pomocným algoritmem` : null].filter(Boolean).join(' · ') : null;
      const pstep = prev?.steps.find((x) => x.id === id);
      const ptime = pstep && Number.isFinite(pstep.moves) ? stepEstimate({ length: pstep.moves, source: 'search' }, { tps: timing.tps, recog: pstep.recog ?? 0, kind: pstep.kind, level: lvl() }).time : null;
      return el('div', { className: `sim-res-row${tags.length ? ' worst' : ''}` },
        el('div', { className: 'sim-res-label' }, el('b', { textContent: t }), ...tags.map((x) => el('span', { className: 'sim-tag', textContent: x }))),
        el('div', { className: 'sim-res-bar', role: 'img', ariaLabel: `${fmt(s.time, 2)} s v průměru` }, el('i', { style: `width: ${(s.time / maxTime) * 100}%` })),
        el('div', { className: 'sim-res-nums' }, el('b', { textContent: `${fmt(s.time, 2)} s` }), ptime !== null ? delta(s.time, ptime, ' s') : null,
          el('span', { className: 'sim-res-share', textContent: `${pct(s.timeShare)} času` }), el('small', { textContent: main })),
        detail ? el('small', { className: 'sim-res-detail', textContent: detail }) : null,
        cover ? el('small', { className: 'sim-cover', textContent: cover }) : null,
        learned(i) ? el('small', { className: 'sim-cover', textContent: learned(i) }) : null,
        casesOf(i, id),
        harvest.get(i)?.size && config[id]?.solveBy !== 'known' ? el('button', { type: 'button', className: 'secondary small sim-harvest',
          textContent: `Uložit ${harvest.get(i).size} nalezených řešení jako algoritmy kroku`,
          title: 'Řešení, která test u tohoto kroku našel, se uloží do sady kroku (případ + algoritmus). Další test je bude používat; najdeš je i v Trenažéru.',
          onclick: () => saveHarvest(i, meta) }) : null,
        s.missing ? el('small', { className: 'ko', textContent: `V sadě chyběl algoritmus u ${s.missing} zamíchání (jen sada) – ta se nedosložila` }) : null,
        usedAlgs(i, id));
    });
    const examples = pickExamples(solves);
    results.replaceChildren(...[ // replaceChildren nevynechá null jako el()
      head('2', 'Výsledek', `${sum.count} zamíchání${sum.failed ? ` (${sum.failed} se nepodařilo složit – nejspíš krátký čas hledání)` : ''} · odhad pro: ${levelText()}`),
      el('div', { className: 'sim-hero' },
        el('div', {}, el('span', { className: 'tile-label', textContent: 'Odhad času složení' }), el('b', { textContent: `${fmt(sum.time, 2)} s` }),
          el('small', { textContent: `${levelText()} · rozpoznání ${fmt(sum.steps.reduce((a, x) => a + x.recogTime, 0), 2)} s + provedení ${fmt(sum.steps.reduce((a, x) => a + x.execTime, 0), 2)} s` })),
        el('div', {}, el('span', { className: 'tile-label', textContent: 'Tahů na složení' }), el('b', { textContent: fmt(sum.human) }),
          el('small', { textContent: `odhad skutečného skladače · simulace ${fmt(sum.moves)} (± ${fmt(sum.ci)}, od ${sum.min} do ${sum.max})` })),
        prev ? el('small', { className: 'sim-hero-prev', textContent: `Minulý test (${when(prev.at)}, ${prev.label ?? ''}): ${fmt(prev.moves)} tahů simulace` }) : null),
      qualityCard(solves, meta, timing),
      Object.keys(sum.variants).length > 1 || meta.variants.length > 1
        ? el('p', { className: 'hint', textContent: `Orientace: ${Object.entries(sum.variants).map(([v, n]) => `${meta.variants[v]} ${pct(n / sum.count)}`).join(' · ')}` }) : null,
      el('div', { className: 'sim-res' }, ...rows),
      sum.hist.length > 1 ? el('b', { className: 'sim-cmp-sub', textContent: 'Kolik tahů měla jednotlivá složení (simulace)' }) : null,
      sum.hist.length > 1 ? el('div', { className: 'sim-hist', role: 'img', ariaLabel: 'Rozložení počtu tahů na složení' },
        ...sum.hist.map((h) => el('div', { className: 'sim-hist-col', title: `${h.from}–${h.to} tahů: ${h.n}×` },
          el('i', { style: `height: ${(h.n / Math.max(...sum.hist.map((x) => x.n))) * 100}%` }), el('small', { textContent: String(h.from) })))) : null,
      deps.onCompare ? Object.assign(el('button', { type: 'button', className: 'primary sim-to-cmp' }), { textContent: 'Porovnat s jinými metodami →', onclick: () => deps.onCompare() }) : null,
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
        })) : null, explain()].filter(Boolean));
    return sum;
  }

  /** Algoritmy, které test u kroku použil: kolikrát, délka, ergonomie, odkud a proč. */
  function usedAlgs(i, id) {
    const m = used.get(i);
    if (!m?.size) return null;
    const cfg = config[id] ?? {};
    const total = [...m.values()].reduce((a, u) => a + u.n, 0);
    const view = cfg.view ?? 'speed';
    const why = cfg.solveBy === 'fixed' ? 'Pevný algoritmus kroku – udělá se jen tehdy, když je potřeba (parita).'
      : `U každého zamíchání hledání našlo řešení kroku a vybralo ${view === 'efficient' ? 'nejkratší (při shodě to pohodlnější)'
        : view === 'balanced' ? 'nejlepší poměr tahů a pohodlí' : 'nejpohodlnější – nejmenší ergonomická náročnost: bez přehmatů, málo tahů B a D, dobré triggery (při shodě kratší)'}`
        + ` z řešení, která jsou nejvýš o pár tahů delší než nejkratší (Vybírat řešení podle: ${VIEWS[view]?.label ?? view} – mění se v Sestavit → Omezení).`
        + `${cfg.mode !== 'search' ? ' Algoritmy ze sady kroku mají přednost, když případ vyřeší (i s natočením vrstvy před a po).' : ''}`;
    const src = { set: 'ze sady', search: 'nalezený', fixed: 'pevný' };
    const list = [...m].sort((a, b) => b[1].n - a[1].n).slice(0, 40);
    const intuitive = plan?.stepOpts[i]?.intuitive;
    return el('details', { className: 'sim-used' },
      el('summary', { textContent: intuitive ? `Ukázky řešení (${m.size}${m.size >= USED_MAX ? '+' : ''} různých)` : `Použité algoritmy (${m.size}${m.size >= USED_MAX ? '+' : ''} různých)` }),
      el('p', { className: 'hint', textContent: intuitive ? 'Intuitivní krok: test ho skládá hledáním povolenými tahy, jak by ho skládal člověk – tohle nejsou algoritmy k naučení, nesbírají se do sady a nepočítají do algoritmů metody.' : why }),
      el('table', { className: 'sim-used-table' },
        el('thead', {}, el('tr', {}, el('th', { textContent: 'Algoritmus' }), el('th', { textContent: 'Použit' }), el('th', { textContent: 'Tahů' }), el('th', { textContent: 'Ergonomie' }), el('th', { textContent: 'Odkud' }))),
        el('tbody', {}, ...list.map(([alg, u]) => el('tr', {},
          el('td', {}, el('code', { textContent: alg }), u.name ? el('small', { textContent: ` ${u.name}` }) : null),
          el('td', { textContent: `${u.n}× (${pct(u.n / total)})` }), el('td', { textContent: String(u.length ?? '') }),
          el('td', { textContent: Number.isFinite(u.score) ? fmt(u.score) : '–' }), el('td', { textContent: src[u.source] ?? u.source }))))),
      m.size > list.length ? el('small', { className: 'hint', textContent: `…a dalších ${m.size - list.length} (méně častých)` }) : null);
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

  /** Případy, na které sada neměla algoritmus: obrázek případu, kolikrát přišel, co našlo hledání, otevřít v Labu. */
  function missingCases(solves, meta) {
    const blocks = meta.stepTitles.map((t, i) => {
      if (!meta.hasSet[i]) return null;
      const m = misses.get(i);
      if (!m?.size) return null;
      const list = [...m.values()].sort((x, y) => y.n - x.n);
      const total = list.reduce((k, x) => k + x.n, 0);
      const bases = (() => { const st = guide.steps.find((x) => x.id === meta.stepIds[i]); return st && config[st.id] ? stepBases(config[st.id]) : null; })();
      return el('div', { className: 'sim-missing-step' },
        el('b', { textContent: `${t}: ${list.length} ${list.length === 1 ? 'případ' : list.length < 5 ? 'případy' : 'případů'} bez algoritmu (${total}× v testu)` }),
        el('div', { className: 'sim-miss-grid' }, ...list.slice(0, 24).map((x) => {
          const copy = x.found ? Object.assign(el('button', { type: 'button', className: 'icon-btn', title: 'Kopírovat řešení', ariaLabel: `Kopírovat ${x.found}` }), { innerHTML: icon('copy', { size: 16 }) }) : null;
          if (copy) copy.onclick = () => navigator.clipboard?.writeText(x.found).then(() => toast('Zkopírováno'), () => toast('Kopírování se nepovedlo'));
          return el('div', { className: 'sim-miss-card' },
            el('div', { className: 'sim-miss-head' }, el('b', { textContent: `${x.n}×` }), el('small', { textContent: x.found ? 'hledání našlo:' : 'test tu skončil' })),
            Object.assign(el('div', { className: 'sim-miss-net' }), { innerHTML: netSvg([...x.a].map((c) => ({ color: c })), x.hold, 150) }),
            x.found ? el('div', { className: 'sim-miss-alg' }, el('code', { textContent: x.found }), copy) : null,
            deps.openLab ? Object.assign(el('button', { type: 'button', className: 'secondary small' }), {
              textContent: 'Otevřít v Labu',
              title: 'Případ jako zadání v Labu: najdi algoritmus a ulož ho do sady kroku',
              onclick: () => deps.openLab({ puzzle: '333', colorsA: [...x.a], colorsB: [...x.b], constraints: x.goal, hold: x.hold, ...(bases ? { bases } : {}) }),
            }) : null);
        })),
        list.length > 24 ? el('small', { className: 'hint', textContent: `…a ještě ${list.length - 24} dalších` }) : null);
    }).filter(Boolean);
    return blocks.length ? el('details', { className: 'sim-example sim-missing', open: true },
      el('summary', { textContent: 'Případy, na které v sadě nemáš algoritmus' }),
      el('p', { className: 'hint', textContent: 'Jak případ vypadá před krokem (šedé = na nich teď nezáleží), kolikrát v testu přišel a co v něm našlo hledání. „Otevřít v Labu“ ho dá jako zadání – najdeš algoritmus a uložíš ho do sady. Všechny případy kroku najednou spočítá generátor sady.' }), ...blocks) : null;
  }

  // --- historie a porovnání ---------------------------------------------------------------------
  const settingsLabel = () => {
    const free = planSteps.filter((x) => x.cfg.free && x.cfg.free !== 'fixed').length;
    const nt = { dual: 'dvě barvy dole · ', all: 'plná neutralita · ' }[neutral.value] ?? '';
    return `${nt}${free ? `volnost u ${free} ${free === 1 ? 'kroku' : 'kroků'}` : 'pevně'} · semínko ${seed.value} · ${planSteps.length} kroků`;
  };
  function addHistory(sum, meta) {
    const list = (storage.get(HISTORY) ?? []).filter((h) => h.sig !== meta.sig);
    list.unshift({
      method, name: methods.get(method).name, sig: meta.sig, at: Date.now(), n: sum.count, moves: sum.moves, ci: sum.ci, time: sum.time, score: sum.score,
      median: sum.median, label: settingsLabel(),
      steps: meta.stepTitles.map((t, i) => ({ id: meta.stepIds[i], title: t, moves: sum.steps[i].moves, median: sum.steps[i].median, time: sum.steps[i].time, recog: Number(config[meta.stepIds[i]]?.recog) || 0, kind: config[meta.stepIds[i]]?.kind ?? 'intuitive' })),
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
      id: `run:${h.sig}`, label: `${h.name} · ${when(h.at)}`, name: h.name, n: h.n, moves: h.moves, ci: h.ci, median: h.median, score: h.score, steps: h.steps, mine: h.method === method, note: h.label,
    }));
    return [...refs, ...runs];
  }
  /** Odhad času stejným vzorcem pro obě strany: rozpoznání + tahy / TPS. */
  // stejný model skladače jako u výsledků (sim/simulate.js) pro obě strany porovnání
  const estOf = (src) => {
    const steps = src.steps.map((st) => ({ title: st.title, ...stepEstimate(st.moves > 0 ? { length: st.moves, source: 'search' } : null, { tps: Number(tps.value) || 4, recog: st.recog ?? 0, kind: st.kind ?? 'intuitive', level: lvl() }) }));
    return { steps, time: steps.reduce((a, x) => a + x.time, 0), human: steps.reduce((a, x) => a + x.moves, 0), recog: steps.reduce((a, x) => a + x.recog, 0) };
  };
  const estTime = (src) => estOf(src).time;
  const humanOf = (src) => estOf(src).human;
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
        runs.length ? el('optgroup', { label: 'Tvoje testy' }, ...runs.map((x) => el('option', { value: x.id, textContent: x.label }))) : null);
      sel.value = value;
      sel.onchange = () => { onChange(sel.value); renderCompare(); };
      return sel;
    };
    const L = byId(cmpLeft), R = byId(cmpRight);
    const eL = estOf(L), eR = estOf(R);
    const est = (x) => (x === L ? eL : eR);
    const max = Math.max(...eL.steps.map((x) => x.time), ...eR.steps.map((x) => x.time), 0.01);
    const slowest = (x) => est(x).steps.reduce((w, st) => (st.time > w.time ? st : w), { time: -1 });
    const metrics = [
      ['Odhad času složení', (x) => est(x).time, (v) => `${fmt(v, 2)} s`, true],
      ['Tahů skladače (odhad)', (x) => est(x).human, (v) => fmt(v), true],
      ['Tahů simulace', (x) => x.moves, (v) => fmt(v), true],
      ['z toho rozpoznání', (x) => est(x).recog, (v) => `${fmt(v, 2)} s`, true],
      ['Ergonomie (méně = pohodlnější)', (x) => x.score, (v) => (Number.isFinite(v) ? fmt(v) : '–'), true],
      ['Kroků', (x) => x.steps.length, (v) => String(v), false],
      ['Nejpomalejší krok', (x) => slowest(x).time, (v) => `${fmt(v, 2)} s`, true],
      ['Zamíchání v testu', (x) => x.n, (v) => String(v), false],
    ];
    const cell = (v, other, lower, show) => el('td', { className: lower && Number.isFinite(v) && Number.isFinite(other) && v < other - 0.05 ? 'win' : '', textContent: show(v) });
    const column = (src) => el('div', { className: 'sim-cmp-col' },
      el('b', { textContent: `${src.name} · ${src.steps.length} kroků` }),
      el('div', { className: 'sim-cmp-steps' }, ...est(src).steps.map((st) => el('div', { className: 'sim-cmp-step' },
        el('div', { className: 'sim-cmp-step-head' }, el('span', { textContent: st.title }), el('b', { textContent: `${fmt(st.time, 2)} s` })),
        el('div', { className: 'sim-res-bar' }, el('i', { style: `width: ${(st.time / max) * 100}%` })),
        el('small', { textContent: `${fmt(st.moves)} tahů · ${fmt(st.tps)} tahů/s${st.recog > 0.005 ? ` · rozpoznání ${fmt(st.recog, 2)} s` : ''}` })))));
    compare.replaceChildren(
      el('header', { className: 'sim-card-head sim-cmp-head' }, el('b', { textContent: 'Srovnání s jinými metodami' }),
        el('small', { textContent: `Vlevo metoda ke srovnání, vpravo tvoje. Obě se počítají stejně – odhad pro: ${levelText()} (změníš v Otestovat).` })),
      el('div', { className: 'sim-cmp' },
        el('div', { className: 'sim-cmp-pick' }, pick(cmpLeft, (v) => { cmpLeft = v; const all = storage.get(OPTS) ?? {}; storage.set(OPTS, { ...all, cmpLeft: v }); }, 'Metoda ke srovnání')),
        el('div', { className: 'sim-cmp-pick mine' }, pick(cmpRight, (v) => { cmpRight = v; }, 'Tvoje metoda'))),
      (() => {
        const dt = eR.time - eL.time, dm = eR.human - eL.human;
        const sign = (x) => (x <= 0 ? '−' : '+');
        return el('div', { className: 'sim-cmp-total' },
          el('b', { className: dt < -0.05 ? 'ok' : dt > 0.05 ? 'ko' : '', textContent: `${sign(dt)}${fmt(Math.abs(dt), 2)} s (${sign(dt)}${Math.round(Math.abs(dt / eL.time) * 100)} %)` }),
          el('small', { textContent: `${R.name} proti ${L.name}: odhad času ${dt <= 0 ? 'rychlejší' : 'pomalejší'} · tahů skladače ${sign(dm)}${fmt(Math.abs(dm))}` }));
      })(),
      el('table', { className: 'compare sim-cmp-table' },
        el('thead', {}, el('tr', {}, el('th', {}), el('th', { textContent: L.name }), el('th', { textContent: R.name }))),
        el('tbody', {}, ...metrics.map(([label, f, show, lower]) => el('tr', {}, el('td', { textContent: label }),
          cell(f(L), f(R), lower, show), cell(f(R), f(L), lower, show))))),
      explain(),
      realData(L, R),
      el('b', { className: 'sim-cmp-sub', textContent: 'Čas po krocích' }),
      el('div', { className: 'sim-cmp' }, column(L), column(R)),
      el('p', { className: 'hint', textContent: `${runs.length ? '' : 'Spusť test své metody – objeví se vpravo. '}${L.ref ? `${L.name}: ${L.description} ` : ''}${R.ref ? `${R.name}: ${R.description} ` : ''}${REFERENCE_NOTE}` }));
  }

  /** Skuteční skladači (u vestavěných metod): tahy z rekonstrukcí a nejlepší oficiální průměr. */
  function realData(L, R) {
    if (!L.real && !R.real) return null;
    const val = (src, key) => (src.real ? src.real[key] ?? '–' : 'jen simulace');
    const rows = [['Tahů v reálných složeních', 'moves'], ['Nejlepší výsledky', 'best'], ['Poznámka', 'note']];
    const sources = [...new Map([...(L.real?.sources ?? []), ...(R.real?.sources ?? [])].map((x) => [x.url, x])).values()];
    return el('details', { className: 'sim-real' },
      el('summary', { textContent: 'Skuteční skladači (data z internetu)' }),
      el('table', { className: 'compare sim-real-table' },
        el('thead', {}, el('tr', {}, el('th', {}), el('th', { textContent: L.name }), el('th', { textContent: R.name }))),
        el('tbody', {}, ...rows.map(([label, key]) => el('tr', {}, el('td', { textContent: label }), el('td', { textContent: val(L, key) }), el('td', { textContent: val(R, key) }))))),
      el('p', { className: 'hint', textContent: 'Simulace ukazuje, kolik tahů metoda potřebuje, když se každý krok složí skoro nejlépe. Skuteční skladači dělají víc tahů a rychlost závisí na tom, jak dobře se metoda „točí“ a dívá dopředu – proto odhad času počítá u intuitivních kroků s víc tahy a pomalejším tempem. Rekordy navíc ovlivňuje i to, kolik lidí metodu používá (CFOP většina světové špičky).' }),
      sources.length ? el('p', { className: 'hint sim-sources' }, 'Zdroje: ', ...sources.flatMap((x, i) => [i ? ' · ' : '', el('a', { href: x.url, target: '_blank', rel: 'noopener', textContent: x.title })])) : null);
  }

  function renderHistory() {
    renderCompare();
    const list = storage.get(HISTORY) ?? [];
    if (!list.length) { history.replaceChildren(); return; }
    const best = Math.min(...list.map((h) => h.moves));
    history.replaceChildren(el('details', { className: 'sim-card' }, el('summary', {}, el('b', { textContent: `Historie testů (${list.length})` }), el('small', { textContent: 'minulé výsledky všech metod' })),
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
      el('p', { className: 'hint', textContent: 'Férové porovnání: stejné semínko a dost zamíchání (± u průměru říká, o kolik se může lišit náhodou).' })));
  }

  // --- start: minulý nebo rozpracovaný běh ------------------------------------------------------
  changed();
  renderSteps();
  renderHistory();
  const r = storage.get(RUN);
  if (r?.meta?.method === method && r.solves?.length) {
    const same = r.meta.sig === sigNow;
    for (const [i, list] of r.used ?? []) used.set(i, new Map(list));
    for (const [i, list] of r.misses ?? []) misses.set(i, new Map(list));
    last = { solves: r.solves, meta: r.meta, next: contiguous(r.solves) };
    renderResults(r.solves, r.meta);
    const resume = el('button', { type: 'button', className: 'primary small', textContent: r.finished ? 'Přidat zamíchání' : 'Pokračovat', hidden: !same });
    resume.onclick = () => run(last);
    banner.replaceChildren(
      el('div', {}, el('b', { textContent: r.finished ? 'Poslední simulace' : 'Rozpracovaná simulace' }),
        el('small', { textContent: `${when(r.meta.started)} · ${r.solves.length} zamíchání${same ? ' · navážeš dalšími' : ' · od té doby se změnily kroky nebo jejich algoritmy (i vygenerované) – „Spustit test“ začne znovu'}` })),
      el('div', { className: 'row-btns' }, resume));
    banner.hidden = false;
    more.hidden = !same;
  }
  // otevřeno s „Vytvořit algoritmy pro krok“: hned spustit a na konci uložit
  if (pendingHarvest) {
    harvestTargets = pendingHarvest;
    pendingHarvest = null;
    queueMicrotask(() => go.click());
  }
  return { running: () => running, destroy };
}
