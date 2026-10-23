// Sestavení metody: celá metoda na jednom místě, krok po kroku. Nahoře držení
// a úvod, pod tím kroky. U každého kroku jdou otázky popořadě:
//   1. Jak se krok jmenuje a co se v něm dělá
//   2. Co je po kroku hotové (dílky)
//   3. Musí to být přesně tady, nebo kdekoli (volnost: kterýkoli pár, barva dole…)
//   4. Čím krok skládáš (sada algoritmů, tahy, natočení vrstev)
//   5. Podrobnosti pro test a obrázek z Labu (nepovinné)
// Všechno se ukládá průběžně k metodě (průvodce + st.sim), test metody pak jen čte.

import { el } from './dom.js';
import { icon } from './icons.js';
import { methods, guides, algSets, algs } from './store.js';
import { frameEditor, partsBefore, stepParts, describeParts, PRESETS, presetParts, remapParts, validFrame, DEFAULT_FRAME, frameMap } from './parts.js';
import { COLORS, STEP_MOVES, MOVE_BASES, ADJUST, placesCount, buildPlan } from '../sim/plan.js';
import { practiceState } from '../timer/practice.js';
import { solve as twoPhase } from '../timer/twophase.js';
import { toFacelets } from '../core/cube.js';
import { netSvg } from './netsvg.js';
import { holdFromFaces } from '../core/hold.js';
import { VIEWS } from '../ergonomics/style.js';
import { stepConfig, setStepConfig } from './stepcfg.js';
import { illustration, examplePlayer } from './guide.js';
import { cellEditor, cellsBefore, cellsLines, cellsSummary } from './celleditor.js';
import { cellsFromLegacy } from '../core/cells.js';
import { TEMPLATES, templateGuide } from '../sim/templates.js';

const OPPOSITE = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' };
// volnost v řeči kroku: co přesně znamená pro dílky kroku
const FREE_TEXT = {
  fixed: ['Přesně tady', 'Jen tyhle dílky na tomhle místě (vůči tomu, jak kostku držíš).'],
  side: ['Na kterémkoli boku', 'Stejný tvar vpředu, vpravo, vzadu i vlevo – např. kterýkoli ze 4 párů, blok na kterékoli straně.'],
  colors: ['Jen s vybranými barvami', 'Zaškrtni, které barvy smí být dole (a případně vpředu) – např. kříž jen bílý nebo žlutý.'],
  dual: ['Dvě protilehlé barvy dole', 'Tvoje barva dole, nebo ta naproti (bílá nebo žlutá…).'],
  dualSide: ['Dvě barvy dole + kterýkoli bok', 'Jako předchozí a k tomu na kterémkoli boku.'],
  all: ['Kdekoli, libovolnou barvou', 'Plná barevná neutralita – na kterékoli straně kostky.'],
};
const MODE_TEXT = { auto: 'Najde se hledáním (jako bys improvizoval)', set: 'Počítá se jako chybějící (učím se jen sadu)' };
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n < 5 ? few : many}`;

let deps = { onTest: () => {}, practice: null, train: null, labTask: () => null };
let host = null;
const open = new Set();

const invert = (m) => (m.endsWith("'") ? m.slice(0, -1) : m.endsWith('2') ? m : `${m}'`);

/**
 * Okamžitá kontrola kroku i: náhodné zamíchání se složí podle kroků 1…i (worker
 * simulátoru, kratší hledání) a ukáže se zamíchání, řešení kroků a stav kostky po kroku;
 * když se krok složit nepodaří, varování.
 */
async function tryStep(guide, i, host) {
  host.replaceChildren(el('p', { className: 'hint', textContent: 'Zkouším na náhodném zamíchání…' }));
  const method = methods.active();
  const steps = guide.steps.slice(0, i + 1);
  const config = Object.fromEntries(steps.map((st) => { const c = stepConfig(method, st); return [st.id, { ...c, time: Math.min(Number(c.time) || 3, 1.5) }]; }));
  let plan, planSteps;
  try {
    ({ plan, steps: planSteps } = buildPlan({ guide: { ...guide, steps }, config, setAlgs: (id) => algs.list().filter((a) => a.set === id) }));
  } catch (e) { host.replaceChildren(el('p', { className: 'ko', textContent: `Krok nejde připravit: ${e.message}` })); return; }
  if (!planSteps.length) { host.replaceChildren(el('p', { className: 'ko', textContent: 'Nejdřív v bodě 1 vyber, co má být po kroku hotové.' })); return; }
  const start = practiceState({});
  const w = new Worker(new URL('../sim/sim-worker.js', import.meta.url), { type: 'module' });
  const res = await new Promise((resolve) => {
    w.onmessage = ({ data }) => resolve(data);
    w.onerror = (e) => resolve({ type: 'error', message: e.message });
    w.postMessage({ type: 'plan', plan });
    w.postMessage({ type: 'solve', id: 1, start: Array.from(start) });
  });
  w.terminate();
  if (res.type !== 'solved') { host.replaceChildren(el('p', { className: 'ko', textContent: `Chyba: ${res.message ?? 'neznámá'}` })); return; }
  const sol = res.solve;
  let scramble = '';
  try { scramble = (twoPhase(toFacelets(start), { timeLimit: 800 }) ?? '').split(' ').filter(Boolean).reverse().map(invert).join(' '); } catch { /* bez zápisu */ }
  const failedAt = sol.ok ? -1 : sol.steps.length - 1;
  const total = sol.steps.reduce((a, x) => a + (x.length ?? 0), 0);
  const frame = validFrame(guide.frame) ? guide.frame : DEFAULT_FRAME;
  const map = frameMap(frame);
  const stickers = [...(sol.end ?? '')].map((c) => ({ color: c }));
  host.replaceChildren(...[
    sol.ok ? el('p', { className: 'ok', textContent: `Funguje: kroky 1–${i + 1} složené za ${total} tahů.` })
      : el('p', { className: 'ko', textContent: `Krok „${planSteps[failedAt]?.st.title || `Krok ${failedAt + 1}`}“ se nepodařilo složit. Zkontroluj povolené tahy (nesmí rozbít, co je hotové z dřívějška) a co má být po kroku hotové.` }),
    scramble ? el('p', {}, el('small', { textContent: 'Zamíchání: ' }), el('code', { textContent: scramble })) : null,
    el('ol', { className: 'bld-check-steps' }, ...sol.steps.map((x, j) => el('li', {},
      el('b', { textContent: `${planSteps[j]?.st.title || `Krok ${j + 1}`}: ` }),
      x.source === 'skip' ? el('em', { textContent: 'už hotové (přeskočeno)' }) : x.source === 'none' || x.source === 'missing' ? el('em', { className: 'ko', textContent: x.source === 'missing' ? 'v sadě chybí algoritmus' : 'nenalezeno' })
        : el('code', { textContent: `${x.rotation ? `(${x.rotation}) ` : ''}${x.display ?? ''}` }),
      x.length ? el('small', { textContent: ` · ${x.length} tahů${x.source === 'set' ? ' · ze sady' : ''}` }) : null))),
    stickers.length === 54 ? el('div', { className: 'cell-net' }, Object.assign(el('div', {}), { innerHTML: netSvg(stickers, holdFromFaces(map.U, map.F), 200) })) : null,
    stickers.length === 54 ? el('p', { className: 'hint cell-legend', textContent: 'Kostka po kroku (nahoře horní strana, dole spodní).' }) : null,
  ].filter(Boolean));
}

/** @param {HTMLElement} root @param {{onTest, practice, train, labTask}} d */
export function initBuilder(root, d) {
  host = root;
  deps = { ...deps, ...d };
}

/** Otevře krok (např. z timeru) a překreslí. */
export function openBuilderStep(stepId) {
  if (stepId) open.add(stepId);
  renderBuilder();
}

export function renderBuilder() {
  if (!host) return;
  const method = methods.active();
  const guide = guides.get(method);
  const frame = validFrame(guide.frame) ? guide.frame : DEFAULT_FRAME;
  const save = () => guides.set(method, guide);
  const redraw = () => { save(); renderBuilder(); };

  const btn = (ic, label, fn, cls = 'icon-btn') => Object.assign(el('button', { type: 'button', className: cls, title: label, ariaLabel: label }),
    { innerHTML: cls === 'icon-btn' ? icon(ic, { size: 18 }) : `${icon(ic, { size: 16 })}<span>${label}</span>`, onclick: fn });
  const select = (opts, value, label, onChange, cls = 'small-select') => {
    const s = el('select', { className: cls, ariaLabel: label }, ...Object.entries(opts).map(([id, t]) => el('option', { value: id, textContent: typeof t === 'string' ? t : t.label })));
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
  const q = (n, title, hint) => el('div', { className: 'bld-q' }, el('span', { className: 'bld-qn', textContent: n }),
    el('div', {}, el('b', { textContent: title }), hint ? el('small', { textContent: hint }) : null));

  // --- základ metody ----------------------------------------------------------------------------
  const name = el('input', { className: 'guide-input bld-name', value: methods.get(method).name, ariaLabel: 'Název metody' });
  name.onchange = () => { if (name.value.trim()) methods.rename(method, name.value.trim()); };
  const intro = el('textarea', { className: 'guide-input', rows: 3, value: guide.intro, placeholder: 'Pro koho metoda je, hlavní myšlenka… (nepovinné)' });
  intro.oninput = () => { guide.intro = intro.value; save(); };
  const base = el('section', { className: 'bld-card bld-base' },
    el('div', { className: 'bld-q' }, el('span', { className: 'bld-qn', textContent: '★' }), el('div', {}, el('b', { textContent: 'Metoda' }),
      el('small', { textContent: 'Název, jak kostku držíš (barva dole a vpředu) a krátký úvod.' }))),
    field('Název', name),
    frameEditor(guide.frame, (f) => { remapParts(guide.steps, guide.frame, f); guide.frame = f; redraw(); }),
    field('Úvod', intro));

  // --- kroky ------------------------------------------------------------------------------------
  const setOpts = () => ({ '': '— bez sady —', ...Object.fromEntries(algSets.list(method).map((x) => [x.id, `${x.name} (${algs.inSet(x.id).length})`])), '+new': '+ Nová sada…' });
  const stepCards = guide.steps.map((st, i) => {
    const k = i + 1;
    // starší zadání (dílky + pravidla) → políčka (core/cells.js), jednou při otevření kroku
    if (open.has(st.id) && !st.cells && (st.parts || st.rules?.length)) {
      st.cells = cellsFromLegacy(st.parts, st.rules, () => frameMap(frame));
      delete st.parts; delete st.rules;
      save();
    }
    const before = partsBefore(guide.steps, st.id);
    const parts = stepParts(st);
    const cfg = stepConfig(method, st);
    const set = st.set ? algSets.list(method).find((x) => x.id === st.set) : null;
    const nSet = set ? algs.inSet(set.id).length : 0;
    const rules = st.rules ?? [];
    const places = placesCount(frame, before, parts, cfg, rules, st.cells ?? {});
    const patch = (p, again = true) => { setStepConfig(method, st, p); if (again) redraw(); else save(); };
    const isOpen = open.has(st.id);
    const summary = [
      // krátce: popis kroku (první věta), jinak souhrn políček
      st.text?.trim() ? st.text.trim().split(/(?<=[.!?])\s|\n/)[0].slice(0, 110)
        : st.cells && Object.keys(st.cells).length ? (cellsLines(st.cells, frame).length === 1 ? cellsLines(st.cells, frame)[0] : `po kroku: ${cellsSummary(st.cells)}`)
        : Object.keys(parts).length || rules.length
          ? [Object.keys(parts).length ? `hotovo: ${describeParts(parts)}` : null, rules.length ? `${rules.length} ${rules.length === 1 ? 'pravidlo' : rules.length < 5 ? 'pravidla' : 'pravidel'} pro skupiny` : null].filter(Boolean).join(' + ')
          : 'zatím nic nevybráno',
      cfg.free && cfg.free !== 'fixed' ? `${FREE_TEXT[cfg.free]?.[0].toLowerCase()} (${plural(places, 'místo', 'místa', 'míst')})` : 'přesně tady',
      set ? `sada ${set.name} (${nSet})` : 'bez sady',
    ].join(' · ');
    const head = el('div', { className: 'bld-step-head' },
      el('span', { className: 'guide-n', textContent: String(k) }),
      el('button', { type: 'button', className: 'bld-step-toggle', ariaExpanded: String(isOpen), onclick: () => { if (isOpen) open.delete(st.id); else open.add(st.id); renderBuilder(); } },
        el('b', { textContent: st.title || `Krok ${k}` }), el('small', { textContent: summary })),
      btn('up', 'Posunout nahoru', () => { if (i) { [guide.steps[i - 1], guide.steps[i]] = [guide.steps[i], guide.steps[i - 1]]; redraw(); } }),
      btn('down', 'Posunout dolů', () => { if (i < guide.steps.length - 1) { [guide.steps[i + 1], guide.steps[i]] = [guide.steps[i], guide.steps[i + 1]]; redraw(); } }),
      btn('trash', 'Smazat krok', () => { if (confirm(`Smazat krok „${st.title || k}“?`)) { guide.steps.splice(i, 1); redraw(); } }));
    if (!isOpen) return el('section', { className: 'bld-card bld-step' }, head);

    // 1. název a popis
    const title = el('input', { className: 'guide-input', value: st.title, placeholder: `Název kroku (např. Kříž, První pár, OLL)`, ariaLabel: `Název kroku ${k}` });
    // bez překreslení (psaní by se přerušilo) – jen název v hlavičce kroku
    title.oninput = () => { st.title = title.value; save(); head.querySelector('.bld-step-toggle b').textContent = st.title || `Krok ${k}`; };
    const text = el('textarea', { className: 'guide-input', rows: 3, value: st.text ?? '', placeholder: 'Co se v kroku dělá, na co se dívat, tipy… (nepovinné)', ariaLabel: `Popis kroku ${k}` });
    text.oninput = () => { st.text = text.value; save(); };

    // 3. kde to smí být
    const free = FREE_TEXT[cfg.free] ? cfg.free : 'fixed';
    const colorPick = (key, label, hint) => el('div', { className: 'sim-colors', role: 'group', ariaLabel: `${label} – krok ${k}`, title: hint },
      el('span', { textContent: label }),
      ...Object.entries(COLORS).map(([f, cname]) => {
        const box = Object.assign(el('input', { type: 'checkbox', ariaLabel: `${label}: ${cname}` }), { checked: (cfg[key] ?? []).includes(f) });
        box.onchange = () => patch({ [key]: Object.keys(COLORS).filter((x) => (x === f ? box.checked : (cfg[key] ?? []).includes(x))) });
        return el('label', { className: 'sim-color', title: cname }, box, el('i', { style: `--c: var(--c-${f})` }), el('span', { textContent: cname }));
      }));
    const placesNote = !Object.keys(parts).length && !rules.length && !Object.keys(st.cells ?? {}).length ? 'Nejdřív v bodě 2 vyber, co má být po kroku hotové.'
      : places > 1 ? `Krok je hotový na kterémkoli z možných míst (${places}). Test u každého zamíchání vybere to nejvýhodnější a další kroky pokračují odtamtud.`
        : free === 'fixed' ? 'Krok je hotový jen tehdy, když jsou hotové přesně vybrané dílky.' : 'Tyhle dílky jsou ve všech povolených polohách na stejném místě – volnost tu nic nemění.';

    // 2. jak se krok řeší: intuitivně / algoritmy vygenerovat / vlastní algoritmy
    // výchozí: se sadou „moje sada“, krok s naučenými algoritmy (OLL, PLL…) „vygenerovat“, jinak intuitivně
    const solveBy = cfg.solveBy ?? (st.set ? 'own' : cfg.kind === 'alg' ? 'generate' : 'intuitive');
    const how = (id, label, hint) => {
      const r = Object.assign(el('input', { type: 'radio', name: `how-${st.id}`, value: id }), { checked: solveBy === id });
      r.onchange = () => patch(id === 'intuitive' ? { solveBy: id, mode: 'search', kind: cfg.kind === 'blocks' ? 'blocks' : 'intuitive' } : { solveBy: id, mode: 'auto', kind: 'alg' });
      return el('label', { className: `rule-opt${solveBy === id ? ' on' : ''}` }, r, el('span', {}, el('b', { textContent: label }), el('small', { textContent: hint })));
    };
    const setSel = select(setOpts(), st.set ?? '', `Sada algoritmů – krok ${k}`, (v) => {
      if (v === '+new') {
        const n = prompt('Název nové sady algoritmů:', st.title || `Krok ${k}`)?.trim();
        if (n) st.set = algSets.add(n);
      } else st.set = v || undefined;
      redraw();
    });
    const algWord = (n) => `${n} ${n === 1 ? 'algoritmus' : n < 5 ? 'algoritmy' : 'algoritmů'}`;
    const makeAlgs = (label) => Object.assign(el('button', { type: 'button', className: 'primary small bld-make-algs' }), {
      textContent: label, onclick: () => deps.onTest({ harvest: st.id }),
    });
    const howBody = solveBy === 'generate' ? el('div', { className: 'bld-algs' },
      el('b', { textContent: nSet ? `Vygenerováno: ${algWord(nSet)} (sada „${set.name}“)` : 'Algoritmy zatím nejsou' }),
      el('small', { textContent: nSet
        ? 'Test krok skládá těmito algoritmy. Na případy, které ještě chybí, je dohledá – „Doplnit“ je přidá do sady.'
        : 'Klepni níž: test složí náhodná zamíchání, u tohoto kroku najde na každý případ dobrý algoritmus a uloží je do sady kroku. Delší test (Délka v Otestovat) = víc případů.' }),
      el('div', { className: 'row-btns' }, makeAlgs(nSet ? 'Doplnit chybějící algoritmy' : 'Vygenerovat algoritmy'),
        nSet && deps.train ? btn('trainer', 'Učit se je (Trenažér)', () => deps.train(set.id), 'secondary small') : null))
      : solveBy === 'own' ? el('div', { className: 'bld-algs' },
        el('div', { className: 'grid-fields' },
          field('Moje sada', setSel, 'Sada s tvými algoritmy (sady spravuješ v Trenažéru, nové algoritmy přidáš z Labu)'),
          nSet ? field('Když na případ nemám algoritmus', select(MODE_TEXT, cfg.mode === 'set' ? 'set' : 'auto', `Chybějící případ – krok ${k}`, (v) => patch({ mode: v })), 'V testu: najde se hledáním, nebo se počítá jako chybějící') : null),
        el('small', { textContent: nSet ? `${algWord(nSet)} v sadě. Chybějící případy test označí – tlačítkem je doplníš vygenerovanými.` : 'Vyber sadu, nebo založ novou (+ Nová sada…).' }),
        el('div', { className: 'row-btns' }, nSet ? makeAlgs('Doplnit chybějící vygenerovanými') : null,
          nSet && deps.train ? btn('trainer', 'Trénovat sadu', () => deps.train(set.id), 'secondary small') : null))
      : el('small', { className: 'hint', textContent: 'Test u každého zamíchání najde nejlepší řešení kroku (jako bys ho vymýšlel). Odhad času počítá s tím, že člověk udělá víc tahů než počítač.' });

    // 3. omezení: tahy, nejvýš tahů, podle čeho vybírat
    const moves = select({ ...STEP_MOVES, custom: { label: 'Vlastní výběr…' } }, cfg.moves, `Tahy – krok ${k}`, (v) => patch(v === 'custom' && !cfg.custom?.length ? { moves: v, custom: [...STEP_MOVES.faces.bases] } : { moves: v }));
    const chips = cfg.moves === 'custom' ? el('div', { className: 'sim-chips', role: 'group', ariaLabel: `Vlastní tahy – krok ${k}` }, ...MOVE_BASES.map((b) => {
      const box = Object.assign(el('input', { type: 'checkbox' }), { checked: (cfg.custom ?? []).includes(b) });
      box.onchange = () => patch({ custom: MOVE_BASES.filter((x) => (x === b ? box.checked : (cfg.custom ?? []).includes(x))) }, false);
      return el('label', {}, box, b);
    })) : null;
    const limits = el('div', { className: 'grid-fields' },
      field('Povolené tahy', moves, 'Tahy, kterými krok skládáš'),
      field('Nejvýš tahů', num(cfg.maxLen ?? 0, `Nejvýš tahů – krok ${k}`, 0, 40, 1, (v) => patch({ maxLen: v }, false)), '0 = bez omezení. Delší řešení test nepoužije.'),
      field('Vybírat řešení podle', select(Object.fromEntries(Object.entries(VIEWS).map(([id, v]) => [id, `${v.icon} ${v.label}`])), cfg.view, `Vybírat podle – krok ${k}`, (v) => patch({ view: v }, false)),
        'Rychlost = pohodlné tahy (bez přehmatů, málo B a D), Efektivita = co nejméně tahů'));

    // okamžitá kontrola: krok vyzkoušený na náhodném zamíchání
    const check = el('div', { className: 'bld-check' });
    const tryBtn = btn('play', 'Vyzkoušet krok na náhodném zamíchání', () => tryStep(guide, i, check), 'secondary small');

    // pokročilé
    const helpers = el('input', { value: cfg.helpers ?? '', placeholder: 'např. M2 U2 M2', spellcheck: false, ariaLabel: `Pomocné algoritmy – krok ${k}` });
    helpers.onchange = () => patch({ helpers: helpers.value }, false);
    const alg = el('input', { className: 'guide-input', value: st.task?.alg ?? '', placeholder: 'Ukázkový algoritmus (např. R U R\' U\')', disabled: !st.task, ariaLabel: `Ukázkový algoritmus – krok ${k}` });
    alg.onchange = () => { if (st.task) { st.task.alg = alg.value.trim() || undefined; redraw(); } };
    const advanced = el('details', { className: 'bld-more' }, el('summary', { textContent: 'Pokročilé (nepovinné)' }),
      el('label', { className: 'field' }, 'Popis kroku', text),
      el('div', { className: 'grid-fields' },
        nSet ? field('Natočení vrstev k algoritmu', select(ADJUST, cfg.adjust, `Natočení vrstev – krok ${k}`, (v) => patch({ adjust: v }, false)), 'AUF/ADF před algoritmem a po něm (počítá se do tahů)') : null,
        nSet ? field('Pomocné algoritmy', helpers, 'Smíš je udělat před algoritmem ze sady (např. oprava parity M2 U2 M2); víc oddělených čárkou') : null,
        field('Druh kroku (odhad času)', select({ alg: 'Naučený algoritmus', intuitive: 'Intuitivní (kříž, páry…)', blocks: 'Stavění bloků (plánuji dopředu)' }, cfg.kind ?? 'intuitive', `Druh kroku – krok ${k}`, (v) => patch({ kind: v }, false)),
          'Naučený algoritmus jde rychle, intuitivní krok o něco pomaleji, bloky člověk staví s víc tahy a pomaleji'),
        field('Rozpoznání (s)', num(cfg.recog, `Rozpoznání – krok ${k}`, 0, 5, 0.1, (v) => patch({ recog: v }, false)), 'Kolik ti trvá krok rozpoznat (odhad času)'),
        field('Čas hledání (s)', num(cfg.time, `Čas hledání – krok ${k}`, 0.5, 120, 0.5, (v) => patch({ time: v }, false)), 'Delší = blíž nejlepšímu možnému řešení, test trvá déle')),
      el('label', { className: 'check-row' }, Object.assign(el('input', { type: 'checkbox' }), { checked: cfg.on === false, onchange: (e) => patch({ on: !e.target.checked }, false) }),
        'V testu spojit s dalším krokem (vyplatilo by se je dělat najednou?)'),
      el('b', { className: 'bld-sub', textContent: 'Obrázek a ukázka z Labu' }),
      el('p', { className: 'hint', textContent: 'V Labu nastav výchozí stav a cíl (případně vyber řešení v přehrávači) a tady klepni na „Vzít z Labu“.' }),
      illustration(st.task), examplePlayer(st.task), alg,
      el('div', { className: 'row-btns' },
        btn('lab', st.task ? 'Nahradit z Labu' : 'Vzít z Labu', () => { st.task = deps.labTask(); redraw(); }, 'secondary small'),
        st.task ? btn('close', 'Odebrat obrázek', () => { delete st.task; redraw(); }, 'secondary small') : null));

    return el('section', { className: 'bld-card bld-step open' }, head,
      field('Název kroku', title),
      q('1', 'Co má být po kroku hotové?', 'Co je hotové z dřívějších kroků, zůstane zachované samo.'),
      cellEditor(st, cellsBefore(guide.steps, i), frame, redraw),
      el('div', { className: 'bld-free-row' }, field('Smí se krok složit i jinde?', select(Object.fromEntries(Object.entries(FREE_TEXT).map(([id, [l]]) => [id, l])), free, `Kde smí být – krok ${k}`,
        (v) => patch(v === 'colors' && !cfg.downs?.length ? { free: v, downs: [frame.down, OPPOSITE[frame.down]] } : { free: v })),
      'Např. pár do kteréhokoli slotu = „Na kterémkoli boku“, kříž bílý nebo žlutý = „Dvě protilehlé barvy dole“')),
      free === 'colors' ? el('div', { className: 'sim-colors-box' },
        colorPick('downs', 'Dole smí být', 'Barvy, které smí být po kroku dole'),
        colorPick('fronts', 'Vpředu smí být', 'Nic nezaškrtnuté = vpředu kterákoli barva')) : null,
      el('p', { className: `bld-places${places > 1 ? ' many' : ''}`, textContent: placesNote }),
      q('2', 'Jak se krok řeší?'),
      el('div', { className: 'rule-opts' },
        how('intuitive', 'Intuitivně', 'Řešení se pokaždé vymýšlí (kříž, páry, bloky).'),
        how('generate', 'Algoritmy – vygenerovat', 'Aplikace najde algoritmy na případy kroku a uloží je jako sadu.'),
        how('own', 'Algoritmy – moje sada', 'Tvoje algoritmy; chybějící případy doplní vygenerované.')),
      howBody,
      q('3', 'Omezení'),
      limits, chips,
      el('div', { className: 'row-btns' }, tryBtn), check,
      advanced,
      el('div', { className: 'row-btns bld-step-tools' },
        deps.practice ? btn('timer', 'Nacvičit v timeru', () => deps.practice(st.id), 'secondary small') : null,
        btn('check', 'Hotovo', () => { open.delete(st.id); renderBuilder(); }, 'secondary small')));
  });

  // --- přidat krok ------------------------------------------------------------------------------
  const add = el('select', { className: 'bld-add', ariaLabel: 'Přidat krok' },
    el('option', { value: '', textContent: '+ Přidat krok…' }),
    el('option', { value: 'empty', textContent: 'Prázdný krok (dílky vyberu sám)' }),
    el('optgroup', { label: 'Krok podle předvolby' }, ...PRESETS.map((p) => el('option', { value: p.id, textContent: p.label }))));
  add.onchange = () => {
    if (!add.value) return;
    const preset = PRESETS.find((p) => p.id === add.value);
    const st = guides.newStep(preset ? preset.label.replace(/ \(.*\)$/, '') : '');
    st.cells = preset ? cellsFromLegacy(presetParts(preset.id, frame), [], () => frameMap(frame)) : {};
    // páry se obvykle skládají do kteréhokoli slotu
    if (preset?.id === 'pair') st.sim = { free: 'side' };
    guide.steps.push(st);
    open.add(st.id);
    redraw();
  };

  host.replaceChildren(...[
    (() => {
      // nová metoda ze šablony (karty; select pro rychlý výběr)
      const create = (t) => {
        const taken = new Set(methods.list().map((m) => m.name));
        let name = t.name;
        for (let n = 2; taken.has(name); n++) name = `${t.name} (${n})`;
        const id = methods.add(name);
        guides.set(id, templateGuide(t, DEFAULT_FRAME, guides.newStep));
        methods.setActive(id);
        open.clear();
        renderBuilder();
      };
      const tpl = el('select', { className: 'small-select bld-tpl', ariaLabel: 'Nová metoda ze šablony' },
        el('option', { value: '', textContent: 'Nová metoda ze šablony…' }),
        ...TEMPLATES.map((t) => el('option', { value: t.id, textContent: `${t.name} – ${t.steps.length} kroků` })));
      tpl.onchange = () => { const t = TEMPLATES.find((x) => x.id === tpl.value); if (t) create(t); };
      const cards = el('div', { className: 'bld-tpls' }, ...TEMPLATES.map((t) => el('button', { type: 'button', className: 'bld-tpl-card', onclick: () => create(t) },
        el('b', { textContent: t.name }), el('small', { textContent: t.intro }), el('span', { className: 'bld-tpl-go', textContent: `Vytvořit (${t.steps.length} kroků) →` }))));
      return el('details', { className: 'bld-how', open: !guide.steps.length },
        el('summary', { textContent: 'Jak na to a šablony metod' }),
        el('ol', {},
          el('li', { textContent: 'Vyber šablonu nejbližší tvé metodě – vytvoří se nová metoda se všemi kroky už nastavenými (Separační = kříž z bílých a žlutých hran, páry, OLL, separace, rohy, EPBL). Nebo přidávej kroky sám.' }),
          el('li', { textContent: 'U kroku v bodu 2 klepni na kostku a řekni, co tam po kroku musí být. V šabloně už je to vyplněné – stačí zkontrolovat a případně upravit.' }),
          el('li', { textContent: 'Kde chceš skládat naučenými algoritmy, klepni u kroku na „Vytvořit algoritmy pro tento krok“ (bod 4).' }),
          el('li', { textContent: 'Přepni na „Otestovat“ – test složí náhodná zamíchání podle tvých kroků a spočítá tahy a čas.' })),
        cards, tpl);
    })(),
    base,
    el('h3', { className: 'bld-h', textContent: `Kroky (${guide.steps.length})` }),
    guide.steps.length ? null : el('p', { className: 'hint', textContent: 'Zatím žádný krok. Přidej první – třeba „Kříž“ nebo „Levý blok“ z předvoleb.' }),
    ...stepCards,
    add,
    guide.steps.length ? Object.assign(el('button', { type: 'button', className: 'primary bld-test' }), { textContent: 'Otestovat metodu →', onclick: () => deps.onTest() }) : null,
  ].filter(Boolean));
}
