// Sestavení metody (Metoda → Sestavit). Dvě obrazovky:
//   Přehled  – co teď udělat (další krok práce), kroky metody jako časová osa s náhledem
//              kostky po každém kroku, nastavení metody (název, držení, úvod) a šablony.
//   Krok     – jeden krok ve třech otázkách: 1. co je po kroku hotové (kostka pokračuje
//              z minulého kroku, dokreslí se jen nové), 2. jak se řeší (intuitivně /
//              vygenerovat algoritmy / moje sada), 3. omezení; pak Vyzkoušet a Pokročilé.
// Na širokém displeji je časová osa vlevo vedle upravovaného kroku. Všechno se ukládá
// průběžně k metodě (průvodce + st.sim), test metody pak jen čte.

import { el } from './dom.js';
import { icon } from './icons.js';
import { methods, guides, algSets, algs } from './store.js';
import { frameEditor, partsBefore, stepParts, remapParts, validFrame, DEFAULT_FRAME, frameMap, COLOR_NAME } from './parts.js';
import { COLORS, STEP_MOVES, MOVE_BASES, ADJUST, placesCount, buildPlan, stepBases } from '../sim/plan.js';
import { STYLES } from '../sim/simulate.js';
import { caseCounter } from './casecounter.js';

const counter = caseCounter();
import { practiceState } from '../timer/practice.js';
import { solve as twoPhase } from '../timer/twophase.js';
import { toFacelets } from '../core/cube.js';
import { netSvg } from './netsvg.js';
import { holdFromFaces } from '../core/hold.js';
import { VIEWS } from '../ergonomics/style.js';
import { stepConfig, setStepConfig, solveByOf, generatedState } from './stepcfg.js';
import { illustration, examplePlayer } from './guide.js';
import { cellEditor, cellsBefore, cellsSummary, cellsNetSvg, cellLooks, stepLabTask } from './celleditor.js';
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
const SOLVE_TEXT = { intuitive: 'intuitivně', generate: 'vygenerované algoritmy', own: 'moje algoritmy', fixed: 'pevný algoritmus, jen někdy' };
// kdy se dělá krok „jen někdy“ (sim/simulate.js fixedNeeded)
const WHEN = {
  parity: 'když je parita (lichá permutace nahoře nebo dole)',
  'parity-U': 'když je parita nahoře',
  'parity-D': 'když je parita dole',
  always: 'vždy',
};
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n < 5 ? few : many}`;
const algWord = (n) => plural(n, 'algoritmus', 'algoritmy', 'algoritmů');

let deps = { onTest: () => {}, practice: null, train: null, labTask: () => null, openLab: null };
let host = null;
let current = null; // id upravovaného kroku (null = přehled)

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
      x.source === 'skip' ? el('em', { textContent: planSteps[j]?.fixed ? 'není potřeba (přeskočeno)' : 'už hotové (přeskočeno)' }) : x.source === 'none' || x.source === 'missing' ? el('em', { className: 'ko', textContent: x.source === 'missing' ? 'v sadě chybí algoritmus' : 'nenalezeno' })
        : el('code', { textContent: `${x.rotation ? `(${x.rotation}) ` : ''}${x.display ?? ''}` }),
      x.length ? el('small', { textContent: ` · ${x.length} tahů${x.source === 'set' ? ' · ze sady' : ''}` }) : null))),
    stickers.length === 54 ? el('div', { className: 'cell-net' }, Object.assign(el('div', {}), { innerHTML: netSvg(stickers, holdFromFaces(map.U, map.F), 200) })) : null,
    stickers.length === 54 ? el('p', { className: 'hint cell-legend', textContent: 'Kostka po kroku (nahoře horní strana, dole spodní).' }) : null,
  ].filter(Boolean));
}

/** Stav kroku pro přehled: má zadaný cíl? jak se řeší? chybí algoritmy? */
function stepState(method, st) {
  const cfg = stepConfig(method, st);
  const set = st.set ? algSets.list(method).find((x) => x.id === st.set) : null;
  const nSet = set ? algs.inSet(set.id).length : 0;
  const solveBy = solveByOf(cfg, st);
  const hasGoal = solveBy === 'fixed' ? !!String(cfg.fixedAlg ?? '').trim()
    : Object.keys(st.cells ?? {}).length > 0 || Object.keys(stepParts(st)).length > 0 || (st.rules?.length ?? 0) > 0;
  // vygenerované algoritmy si vytvoří test sám; chybí jen vlastní sada
  const gen = solveBy === 'generate' ? generatedState(method, guides.get(method), st) : null;
  return { cfg, set, nSet, hasGoal, solveBy, gen, needAlgs: solveBy === 'own' && !nSet };
}

/** @param {HTMLElement} root @param {{onTest, practice, train, labTask}} d */
export function initBuilder(root, d) {
  host = root;
  deps = { ...deps, ...d };
}

/** Otevře krok (např. z timeru) a překreslí; bez id zůstane, co bylo otevřené. */
export function openBuilderStep(stepId) {
  if (stepId) current = stepId;
  renderBuilder();
}

export function renderBuilder() {
  if (!host) return;
  const method = methods.active();
  const guide = guides.get(method);
  const frame = validFrame(guide.frame) ? guide.frame : DEFAULT_FRAME;
  const save = () => guides.set(method, guide);
  const redraw = () => { save(); renderBuilder(); };
  const go = (id) => { current = id; renderBuilder(); host.closest('.mp')?.scrollIntoView?.({ block: 'start' }); };

  // starší zadání (dílky + pravidla) → políčka (core/cells.js)
  let migrated = false;
  for (const st of guide.steps) {
    if (!st.cells && (st.parts || st.rules?.length)) {
      st.cells = cellsFromLegacy(st.parts, st.rules, () => frameMap(frame));
      delete st.parts; delete st.rules;
      migrated = true;
    }
  }
  if (migrated) save();
  if (current && !guide.steps.some((x) => x.id === current)) current = null;

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
  const sec = (n, title, hint, ...body) => el('section', { className: 'bld-sec' },
    el('header', { className: 'bld-q' }, el('span', { className: 'bld-qn', textContent: n }),
      el('div', {}, el('b', { textContent: title }), hint ? el('small', { textContent: hint }) : null)), ...body);
  const titleOf = (st, i) => st.title || `Krok ${i + 1}`;
  const states = guide.steps.map((st) => stepState(method, st));

  /** Nový krok za `at` (kostka v něm pokračuje z předchozích kroků). */
  const addStep = (at = guide.steps.length - 1) => {
    const st = guides.newStep('');
    st.cells = {};
    guide.steps.splice(at + 1, 0, st);
    current = st.id;
    redraw();
  };

  // --- časová osa kroků (náhled kostky po každém kroku) ------------------------------------------
  const timeline = () => {
    const items = guide.steps.map((st, i) => {
      const s = states[i];
      const thumb = Object.assign(el('span', { className: 'bld-tl-net', ariaHidden: 'true' }),
        { innerHTML: cellsNetSvg(cellLooks(st.cells ?? {}, cellsBefore(guide.steps, i)), frame, { size: 96 }) });
      const badges = [
        !s.hasGoal ? el('span', { className: 'bld-badge warn', textContent: 'nic nezadáno' }) : null,
        s.solveBy === 'intuitive' ? el('span', { className: 'bld-badge', textContent: 'intuitivně' })
          : s.solveBy === 'fixed' ? el('span', { className: 'bld-badge', textContent: 'jen někdy' })
            : s.solveBy === 'generate' ? el('span', { className: `bld-badge${s.gen === 'fresh' ? ' good' : ''}`, textContent: s.gen === 'fresh' ? `${s.nSet} alg.` : 'algoritmy vytvoří test' })
              : s.nSet ? el('span', { className: 'bld-badge good', textContent: `${s.nSet} alg.` })
                : el('span', { className: 'bld-badge warn', textContent: 'chybí algoritmy' }),
        s.cfg.free && s.cfg.free !== 'fixed' ? el('span', { className: 'bld-badge', textContent: FREE_TEXT[s.cfg.free]?.[0].toLowerCase() ?? 'volnost' }) : null,
        s.cfg.on === false ? el('span', { className: 'bld-badge', textContent: 'spojený s dalším' }) : null,
      ].filter(Boolean);
      const b = el('button', { type: 'button', className: `bld-tl-item${current === st.id ? ' active' : ''}`, ariaCurrent: current === st.id ? 'step' : undefined, onclick: () => go(st.id) },
        el('span', { className: 'bld-tl-n', textContent: String(i + 1) }), thumb,
        el('span', { className: 'bld-tl-text' }, el('b', { textContent: titleOf(st, i) }),
          el('small', { textContent: s.solveBy === 'fixed' ? `${s.cfg.fixedAlg ?? ''} · ${WHEN[s.cfg.when ?? 'parity'] ?? ''}` : st.cells && Object.keys(st.cells).length ? cellsSummary(st.cells) : 'zatím nic' }),
          el('span', { className: 'bld-badges' }, ...badges)));
      b.dataset.step = st.id;
      return el('li', {}, b);
    });
    return el('aside', { className: 'bld-rail' },
      el('div', { className: 'bld-rail-head' },
        el('h3', { textContent: `Kroky metody (${guide.steps.length})` }),
        current ? btn('settings', 'Přehled', () => go(null), 'secondary small') : null),
      guide.steps.length ? el('ol', { className: 'bld-tl' }, ...items)
        : el('p', { className: 'hint', textContent: 'Zatím žádný krok – vyber šablonu, nebo přidej první krok.' }),
      el('button', { type: 'button', className: 'secondary bld-add', onclick: () => addStep() },
        Object.assign(el('span', {}), { innerHTML: icon('plus', { size: 18 }) }), el('span', { textContent: guide.steps.length ? 'Přidat další krok' : 'Přidat první krok' })),
      guide.steps.length ? Object.assign(el('button', { type: 'button', className: 'primary bld-test' }), { textContent: 'Otestovat metodu →', onclick: () => deps.onTest() }) : null);
  };

  // --- přehled: co teď udělat, nastavení metody, šablony --------------------------------------------
  const overview = () => {
    const todo = [];
    guide.steps.forEach((st, i) => {
      const s = states[i];
      if (!s.hasGoal) todo.push({ text: s.solveBy === 'fixed' ? `${titleOf(st, i)}: napiš algoritmus` : `${titleOf(st, i)}: na kostce vyber, co má být po kroku hotové`, label: 'Otevřít krok', fn: () => go(st.id) });
      else if (s.needAlgs) todo.push({ text: `${titleOf(st, i)}: vyber sadu svých algoritmů`, label: 'Otevřít krok', fn: () => go(st.id) });
    });
    const ready = guide.steps.length && !todo.length;
    const next = el('section', { className: `bld-next${ready ? ' ready' : ''}` },
      el('b', { className: 'bld-next-title', textContent: !guide.steps.length ? 'Začni: vyber šablonu, nebo přidej první krok' : ready ? 'Metoda je připravená' : 'Co teď udělat' }),
      ready ? el('p', { textContent: `Všechny kroky mají cíl i způsob řešení. Otestuj metodu na náhodných zamícháních${states.some((x) => x.solveBy === 'generate' && x.gen !== 'fresh') ? ' – algoritmy kroků „vygenerovat“ si test vytvoří sám' : ''} a pak ji porovnej s CFOP, Roux a ZZ.` }) : null,
      todo.length ? el('ul', { className: 'bld-todo' }, ...todo.slice(0, 4).map((t) => el('li', {}, el('span', { textContent: t.text }),
        Object.assign(el('button', { type: 'button', className: t.primary ? 'primary small' : 'secondary small' }), { textContent: t.label, onclick: t.fn })))) : null,
      todo.length > 4 ? el('small', { className: 'hint', textContent: `…a ještě ${todo.length - 4}` }) : null,
      ready ? Object.assign(el('button', { type: 'button', className: 'primary' }), { textContent: 'Otestovat metodu →', onclick: () => deps.onTest() }) : null,
      guide.steps.length ? null : el('ol', { className: 'bld-howto' },
        el('li', { textContent: 'Šablona vytvoří metodu se všemi kroky už nastavenými – stačí upravit, co je u tebe jinak.' }),
        el('li', { textContent: 'U každého kroku na kostce dokreslíš, co je po něm nově hotové (kostka pokračuje z minulého kroku).' }),
        el('li', { textContent: 'Řekneš, jak se krok řeší – intuitivně, nebo algoritmy (aplikace je umí vygenerovat).' }),
        el('li', { textContent: 'Otestuješ metodu: počet tahů, odhad času a srovnání s CFOP, Roux a ZZ.' })));

    // nastavení metody
    const name = el('input', { className: 'guide-input bld-name', value: methods.get(method).name, ariaLabel: 'Název metody' });
    name.onchange = () => { if (name.value.trim()) methods.rename(method, name.value.trim()); };
    const intro = el('textarea', { className: 'guide-input', rows: 3, value: guide.intro, placeholder: 'Pro koho metoda je, hlavní myšlenka… (nepovinné)' });
    intro.oninput = () => { guide.intro = intro.value; save(); };
    const base = el('details', { className: 'bld-card bld-base', open: !guide.steps.length },
      el('summary', {}, el('b', { textContent: 'Nastavení metody' }),
        el('small', { textContent: `${COLOR_NAME[frame.down]} dole, ${COLOR_NAME[frame.front]} vpředu · název, držení a úvod` })),
      field('Název', name),
      frameEditor(guide.frame, (f) => { remapParts(guide.steps, guide.frame, f); guide.frame = f; redraw(); }),
      field('Úvod', intro));

    // šablony
    const create = (t) => {
      const taken = new Set(methods.list().map((m) => m.name));
      let nm = t.name;
      for (let n = 2; taken.has(nm); n++) nm = `${t.name} (${n})`;
      const id = methods.add(nm);
      guides.set(id, templateGuide(t, DEFAULT_FRAME, guides.newStep));
      methods.setActive(id);
      current = null;
      renderBuilder();
    };
    const tpl = el('select', { className: 'small-select bld-tpl', ariaLabel: 'Nová metoda ze šablony' },
      el('option', { value: '', textContent: 'Nová metoda ze šablony…' }),
      ...TEMPLATES.map((t) => el('option', { value: t.id, textContent: `${t.name} – ${t.steps.length} kroků` })));
    tpl.onchange = () => { const t = TEMPLATES.find((x) => x.id === tpl.value); if (t) create(t); };
    const cards = el('div', { className: 'bld-tpls' }, ...TEMPLATES.map((t) => el('button', { type: 'button', className: 'bld-tpl-card', onclick: () => create(t) },
      el('b', { textContent: t.name }), el('small', { textContent: t.intro }), el('span', { className: 'bld-tpl-go', textContent: `Vytvořit (${t.steps.length} kroků) →` }))));
    const templates = el('details', { className: 'bld-card bld-how', open: !guide.steps.length },
      el('summary', {}, el('b', { textContent: guide.steps.length ? 'Nová metoda ze šablony' : 'Šablony metod' }),
        el('small', { textContent: 'CFOP, Roux, ZZ, Petrus, Separační – vytvoří novou metodu, tahle zůstane' })),
      cards, tpl);
    return el('div', { className: 'bld-main bld-home' }, next, base, templates);
  };

  // --- jeden krok ------------------------------------------------------------------------------
  const editor = (i) => {
    const st = guide.steps[i];
    const k = i + 1, n = guide.steps.length;
    const { cfg, set, nSet, solveBy, gen } = states[i];
    const before = partsBefore(guide.steps, st.id);
    const parts = stepParts(st);
    const places = placesCount(frame, before, parts, cfg, [], st.cells ?? {});
    const patch = (p, again = true) => { setStepConfig(method, st, p); if (again) redraw(); else save(); };
    const setOpts = () => ({ '': '— bez sady —', ...Object.fromEntries(algSets.list(method).map((x) => [x.id, `${x.name} (${algs.inSet(x.id).length})`])), '+new': '+ Nová sada…' });

    // horní lišta: zpět na přehled, pořadí, předchozí / další
    const prev = guide.steps[i - 1], nextSt = guide.steps[i + 1];
    const top = el('div', { className: 'bld-ed-top' },
      btn('prev', 'Přehled metody', () => go(null), 'secondary small bld-back'),
      el('span', { className: 'bld-ed-pos', textContent: `Krok ${k} z ${n}` }),
      el('span', { className: 'bld-ed-arrows' },
        Object.assign(btn('prev', 'Předchozí krok', () => go(prev.id)), { disabled: !prev }),
        Object.assign(btn('next', 'Další krok', () => go(nextSt.id)), { disabled: !nextSt })));
    // všechny kroky jako čipy (na mobilu místo časové osy)
    const chips = el('nav', { className: 'bld-ed-chips', ariaLabel: 'Kroky metody' }, ...guide.steps.map((x, j) => {
      const c = el('button', { type: 'button', className: `bld-chip${j === i ? ' on' : ''}${states[j].hasGoal ? '' : ' empty'}`, onclick: () => go(x.id) },
        el('i', { textContent: String(j + 1) }), el('span', { textContent: titleOf(x, j) }));
      if (j === i) c.ariaCurrent = 'step';
      return c;
    }));

    const title = el('input', { className: 'guide-input bld-title', value: st.title, placeholder: `Název kroku (např. Kříž, Pár 1, OLL)`, ariaLabel: `Název kroku ${k}` });
    // bez překreslení (psaní by se přerušilo) – jen název v osách
    title.oninput = () => {
      st.title = title.value; save();
      for (const e of host.querySelectorAll(`[data-step="${st.id}"] .bld-tl-text b`)) e.textContent = titleOf(st, i);
      const chip = chips.children[i]?.querySelector('span');
      if (chip) chip.textContent = titleOf(st, i);
    };
    const tools = el('span', { className: 'bld-ed-tools' },
      btn('up', 'Posunout dřív', () => { if (i) { [guide.steps[i - 1], guide.steps[i]] = [guide.steps[i], guide.steps[i - 1]]; redraw(); } }),
      btn('down', 'Posunout později', () => { if (i < n - 1) { [guide.steps[i + 1], guide.steps[i]] = [guide.steps[i], guide.steps[i + 1]]; redraw(); } }),
      btn('trash', 'Smazat krok', () => {
        if (!confirm(`Smazat krok „${titleOf(st, i)}“?`)) return;
        guide.steps.splice(i, 1);
        current = (guide.steps[i] ?? guide.steps[i - 1])?.id ?? null;
        redraw();
      }));
    tools.children[0].disabled = !i;
    tools.children[1].disabled = i === n - 1;

    // 1. co je po kroku hotové + kde to smí být
    const free = FREE_TEXT[cfg.free] ? cfg.free : 'fixed';
    const colorPick = (key, label, hint) => el('div', { className: 'sim-colors', role: 'group', ariaLabel: `${label} – krok ${k}`, title: hint },
      el('span', { textContent: label }),
      ...Object.entries(COLORS).map(([f, cname]) => {
        const box = Object.assign(el('input', { type: 'checkbox', ariaLabel: `${label}: ${cname}` }), { checked: (cfg[key] ?? []).includes(f) });
        box.onchange = () => patch({ [key]: Object.keys(COLORS).filter((x) => (x === f ? box.checked : (cfg[key] ?? []).includes(x))) });
        return el('label', { className: 'sim-color', title: cname }, box, el('i', { style: `--c: var(--c-${f})` }), el('span', { textContent: cname }));
      }));
    const placesNote = !Object.keys(st.cells ?? {}).length ? 'Nejdřív na kostce vyber, co má být po kroku nově hotové.'
      : places > 1 ? `Krok je hotový na kterémkoli z možných míst (${places}). Test u každého zamíchání vybere to nejvýhodnější a další kroky pokračují odtamtud.`
        : free === 'fixed' ? 'Krok je hotový jen tehdy, když jsou hotové přesně vybrané dílky.' : 'Tyhle dílky jsou ve všech povolených polohách na stejném místě – volnost tu nic nemění.';
    const goal = sec('1', 'Jak má kostka vypadat po kroku?',
      i ? 'Kostka už je vybarvená podle minulých kroků – dobarvi jen to, co tento krok nově složí.' : 'Vybarvi nálepky, které mají být po kroku hotové. Šedá = na barvě nezáleží.',
      cellEditor(st, cellsBefore(guide.steps, i), frame, redraw),
      el('div', { className: 'bld-free-row' }, field('Smí se krok složit i jinde?', select(Object.fromEntries(Object.entries(FREE_TEXT).map(([id, [l]]) => [id, l])), free, `Kde smí být – krok ${k}`,
        (v) => patch(v === 'colors' && !cfg.downs?.length ? { free: v, downs: [frame.down, OPPOSITE[frame.down]] } : { free: v })),
      'Např. pár do kteréhokoli slotu = „Na kterémkoli boku“, kříž bílý nebo žlutý = „Dvě protilehlé barvy dole“')),
      free === 'colors' ? el('div', { className: 'sim-colors-box' },
        colorPick('downs', 'Dole smí být', 'Barvy, které smí být po kroku dole'),
        colorPick('fronts', 'Vpředu smí být', 'Nic nezaškrtnuté = vpředu kterákoli barva')) : null,
      el('p', { className: `bld-places${places > 1 ? ' many' : ''}`, textContent: placesNote }));

    // 2. jak se krok řeší: intuitivně / algoritmy vygenerovat / vlastní algoritmy
    const how = (id, label, hint) => {
      const r = Object.assign(el('input', { type: 'radio', name: `how-${st.id}`, value: id }), { checked: solveBy === id });
      r.onchange = () => patch(id === 'intuitive' ? { solveBy: id, mode: 'search', kind: cfg.kind === 'blocks' ? 'blocks' : 'intuitive' }
        : id === 'fixed' ? { solveBy: id, kind: 'alg', fixedAlg: cfg.fixedAlg || 'M2 U2 M2', when: cfg.when || 'parity' }
          : { solveBy: id, mode: 'auto', kind: 'alg' });
      return el('label', { className: `rule-opt bld-how-opt${solveBy === id ? ' on' : ''}` }, r, el('span', {}, el('b', { textContent: label }), el('small', { textContent: hint })));
    };
    const setSel = select(setOpts(), st.set ?? '', `Sada algoritmů – krok ${k}`, (v) => {
      if (v === '+new') {
        const nm = prompt('Název nové sady algoritmů:', titleOf(st, i))?.trim();
        if (nm) st.set = algSets.add(nm);
      } else st.set = v || undefined;
      redraw();
    });
    const makeAlgs = (label) => Object.assign(el('button', { type: 'button', className: 'primary small bld-make-algs' }), {
      textContent: label, onclick: () => deps.onTest({ harvest: st.id }),
    });
    // krok „jen někdy“: algoritmus a kdy se dělá
    const fixedAlg = el('input', { className: 'bld-fixed-alg', value: cfg.fixedAlg ?? '', placeholder: 'např. M2 U2 M2', spellcheck: false, ariaLabel: `Algoritmus – krok ${k}` });
    fixedAlg.onchange = () => patch({ fixedAlg: fixedAlg.value.trim() });
    const howBody = solveBy === 'fixed' ? el('div', { className: 'bld-algs' },
      el('div', { className: 'grid-fields' },
        field('Algoritmus', fixedAlg, 'Jak ho děláš (podle držení metody); víc možností odděl čárkou'),
        field('Kdy se dělá', select(WHEN, cfg.when ?? 'parity', `Kdy se dělá – krok ${k}`, (v) => patch({ when: v })), 'Parita = dílky ve vrstvě jsou prohozené lichým počtem výměn (natočení vrstvy ji nemění)')),
      el('small', { textContent: 'Krok nic nového neskládá – jen připraví kostku pro další krok. Test ho udělá jen tehdy, když nastane parita, jinak ho přeskočí (výsledek ukáže, jak často byl potřeba). Další krok pak počítá jen s případy bez parity.' }))
      : solveBy === 'generate' ? el('div', { className: `bld-algs${gen === 'stale' ? ' todo' : ''}` },
      el('b', { textContent: gen === 'fresh' ? `Vygenerováno: ${algWord(nSet)} (sada „${set.name}“)` : gen === 'stale' ? 'Krok se změnil – algoritmy se při testu vytvoří znovu' : 'Algoritmy vytvoří test sám' }),
      el('small', { textContent: gen === 'fresh'
        ? 'Test krok skládá těmito algoritmy; na případy, které ještě chybí, je dohledá a přidá do sady. Najdeš je i v Trenažéru.'
        : 'Při každém testu metody aplikace u tohoto kroku najde na každý případ dobrý algoritmus a uloží je jako sadu kroku (pak je najdeš v Trenažéru). Když krok později změníš, při dalším testu se vytvoří znovu. Delší test = víc případů.' }),
      el('div', { className: 'row-btns' }, makeAlgs(gen === 'fresh' ? 'Otestovat a doplnit chybějící' : 'Otestovat a vytvořit algoritmy'),
        gen === 'fresh' && deps.train ? btn('trainer', 'Učit se je (Trenažér)', () => deps.train(set.id), 'secondary small') : null))
      : solveBy === 'own' ? el('div', { className: `bld-algs${nSet ? '' : ' todo'}` },
        el('div', { className: 'grid-fields' },
          field('Moje sada', setSel, 'Sada s tvými algoritmy (sady spravuješ v Trenažéru, nové algoritmy přidáš z Labu)'),
          nSet ? field('Když na případ nemám algoritmus', select(MODE_TEXT, cfg.mode === 'set' ? 'set' : 'auto', `Chybějící případ – krok ${k}`, (v) => patch({ mode: v })), 'V testu: najde se hledáním, nebo se počítá jako chybějící') : null),
        el('small', { textContent: nSet ? `${algWord(nSet)} v sadě. Chybějící případy test označí – tlačítkem je doplníš vygenerovanými.` : 'Vyber sadu, nebo založ novou (+ Nová sada…).' }),
        el('div', { className: 'row-btns' }, nSet ? makeAlgs('Doplnit chybějící vygenerovanými') : null,
          nSet && deps.train ? btn('trainer', 'Trénovat sadu', () => deps.train(set.id), 'secondary small') : null))
      : el('small', { className: 'hint', textContent: 'Test u každého zamíchání najde nejlepší řešení kroku povolenými tahy (Omezení níže – např. ⟨R, U, L⟩ pro F2L, jak ho skládá člověk s otočením kostky ke slotu). Kolik tahů navíc proti testu uděláš ty, nastavíš ve Stylu skládání.' });
    const style = solveBy === 'fixed' ? null : field('Styl skládání', select(Object.fromEntries(Object.entries(STYLES).map(([id, x]) => [id, x.label])), cfg.style ?? 'auto', `Styl skládání – krok ${k}`, (v) => patch({ style: v === 'auto' ? undefined : v })),
      `${STYLES[cfg.style ?? 'auto']?.hint ?? ''}. Mění počet tahů v odhadu (test, porovnání i vylepšení metody).`);
    // kolik případů krok má (= kolik algoritmů se naučit) – dopočítá se ve workeru
    const cases = solveBy === 'generate' || solveBy === 'own' ? el('small', { className: 'bld-cases hint', textContent: 'Počítám, kolik případů krok má…' }) : null;
    if (cases) {
      try {
        const g = guides.get(method);
        const { plan, steps } = buildPlan({ guide: g, config: Object.fromEntries(g.steps.map((x) => [x.id, stepConfig(method, x)])) });
        const at = steps.findIndex((x) => x.st.id === st.id);
        if (at < 0) cases.hidden = true;
        else counter.count(plan, at).then((r) => { cases.textContent = r ? `Krok má ${r.exact ? '' : 'asi '}${r.cases} případů = tolik algoritmů se naučit (stejný případ jen s natočenou vrstvou je jeden).` : ''; cases.hidden = !r; });
      } catch { cases.hidden = true; }
    }
    const isFixed = solveBy === 'fixed';
    const solve = sec(isFixed ? '1' : '2', 'Jak se krok řeší?', isFixed ? 'Tento krok nic nového neskládá, proto nemá kostku ani omezení.' : null,
      el('div', { className: 'bld-how-opts' },
        how('intuitive', 'Intuitivně', 'Řešení se pokaždé vymýšlí (kříž, páry, bloky).'),
        how('generate', 'Algoritmy – vygenerovat', 'Aplikace najde algoritmy na případy kroku a uloží je jako sadu.'),
        how('own', 'Algoritmy – moje sada', 'Tvoje algoritmy; chybějící případy doplní vygenerované.'),
        how('fixed', 'Jen někdy – pevný algoritmus', 'Např. parita: M2 U2 M2, jen když je potřeba.')),
      howBody, cases, style ? el('div', { className: 'grid-fields' }, style) : null);

    // 3. omezení: tahy, nejvýš tahů, podle čeho vybírat
    const moves = select({ ...STEP_MOVES, custom: { label: 'Vlastní výběr…' } }, cfg.moves, `Tahy – krok ${k}`, (v) => patch(v === 'custom' && !cfg.custom?.length ? { moves: v, custom: [...STEP_MOVES.faces.bases] } : { moves: v }));
    const chips2 = cfg.moves === 'custom' ? el('div', { className: 'sim-chips', role: 'group', ariaLabel: `Vlastní tahy – krok ${k}` }, ...MOVE_BASES.map((b) => {
      const box = Object.assign(el('input', { type: 'checkbox' }), { checked: (cfg.custom ?? []).includes(b) });
      box.onchange = () => patch({ custom: MOVE_BASES.filter((x) => (x === b ? box.checked : (cfg.custom ?? []).includes(x))) }, false);
      return el('label', {}, box, b);
    })) : null;
    const limits = sec('3', 'Omezení', 'Nepovinné – čím krok skládáš a jak dlouhé řešení ještě bereš.',
      el('div', { className: 'grid-fields' },
        field('Povolené tahy', moves, 'Tahy, kterými krok skládáš'),
        field('Nejvýš tahů', num(cfg.maxLen ?? 0, `Nejvýš tahů – krok ${k}`, 0, 40, 1, (v) => patch({ maxLen: v }, false)), '0 = bez omezení. Delší řešení test nepoužije.'),
        field('Vybírat řešení podle', select(Object.fromEntries(Object.entries(VIEWS).map(([id, v]) => [id, `${v.icon} ${v.label}`])), cfg.view, `Vybírat podle – krok ${k}`, (v) => patch({ view: v }, false)),
          'Nejrychlejší = nejkratší čas provedení (každý tah stojí čas, nepohodlné tahy a přehmaty víc), Nejkratší = co nejméně tahů, Vyvážené = kompromis')),
      chips2);

    // 4. okamžitá kontrola: krok vyzkoušený na náhodném zamíchání
    const check = el('div', { className: 'bld-check' });
    const tryIt = sec(isFixed ? '2' : '4', 'Vyzkoušet', 'Složí náhodné zamíchání kroky 1 až tento a ukáže řešení i kostku po kroku. „Otevřít v Labu“ přenese kostku před krokem a po něm do Labu – tam jde hledat a generovat algoritmy.',
      el('div', { className: 'row-btns' }, btn('play', 'Vyzkoušet krok na náhodném zamíchání', () => tryStep(guide, i, check), 'secondary small'),
        deps.practice ? btn('timer', 'Nacvičit v timeru', () => deps.practice(st.id), 'secondary small') : null,
        deps.openLab && !isFixed ? btn('lab', 'Otevřít v Labu', () => { const { task, lost } = stepLabTask(guide.steps, i, frame); deps.openLab({ ...task, bases: stepBases(cfg) }, lost); }, 'secondary small bld-to-lab') : null), check);

    // pokročilé
    const text = el('textarea', { className: 'guide-input', rows: 3, value: st.text ?? '', placeholder: 'Co se v kroku dělá, na co se dívat, tipy… (nepovinné)', ariaLabel: `Popis kroku ${k}` });
    text.oninput = () => { st.text = text.value; save(); };
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

    // dole: předchozí / další krok, nebo přidat další
    const navBtn = (label, sub, fn, cls) => el('button', { type: 'button', className: `bld-nav-btn ${cls}`, onclick: fn }, el('small', { textContent: sub }), el('b', { textContent: label }));
    const bottom = el('div', { className: 'bld-ed-nav' },
      prev ? navBtn(`‹ ${titleOf(prev, i - 1)}`, 'Předchozí krok', () => go(prev.id), 'secondary') : el('span', {}),
      nextSt ? navBtn(`${titleOf(nextSt, i + 1)} ›`, 'Další krok', () => go(nextSt.id), 'primary')
        : navBtn('+ Přidat další krok', 'Pokračovat z této kostky', () => addStep(i), 'primary bld-add-next'));

    return el('section', { className: 'bld-main bld-step open' },
      top, chips,
      el('div', { className: 'bld-ed-title' }, el('span', { className: 'guide-n', textContent: String(k) }), title, tools),
      ...(isFixed ? [solve] : [goal, solve, limits]), tryIt, advanced, bottom,
      el('p', { className: 'hint bld-ed-foot' }, `Krok se řeší: ${SOLVE_TEXT[solveBy]}${set ? ` · sada „${set.name}“` : ''}. Všechno se ukládá samo.`));
  };

  const at = current ? guide.steps.findIndex((x) => x.id === current) : -1;
  host.replaceChildren(el('div', { className: `bld-layout${at >= 0 ? ' editing' : ''}` }, timeline(), at >= 0 ? editor(at) : overview()));
  // otevřený krok vidět v čipech i v ose
  for (const e of host.querySelectorAll('.bld-chip.on, .bld-tl-item.active')) {
    const box = e.parentElement.closest('.bld-ed-chips, .bld-rail');
    if (box && box.scrollWidth > box.clientWidth) box.scrollLeft = e.offsetLeft - box.clientWidth / 2 + e.offsetWidth / 2;
    if (box && box.scrollHeight > box.clientHeight) box.scrollTop = e.closest('li').offsetTop - box.clientHeight / 3;
  }
}

