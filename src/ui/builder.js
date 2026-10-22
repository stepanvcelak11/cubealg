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
import { partsEditor, frameEditor, partsBefore, stepParts, describeParts, PRESETS, presetParts, remapParts, validFrame, DEFAULT_FRAME } from './parts.js';
import { COLORS, STEP_MOVES, MOVE_BASES, ADJUST, placesCount } from '../sim/plan.js';
import { VIEWS } from '../ergonomics/style.js';
import { stepConfig, setStepConfig } from './stepcfg.js';
import { illustration, examplePlayer } from './guide.js';
import { ruleEditor, newRule } from './ruleeditor.js';
import { RULE_PRESETS } from '../core/rules.js';
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
    const before = partsBefore(guide.steps, st.id);
    const parts = stepParts(st);
    const cfg = stepConfig(method, st);
    const set = st.set ? algSets.list(method).find((x) => x.id === st.set) : null;
    const nSet = set ? algs.inSet(set.id).length : 0;
    const rules = st.rules ?? [];
    const places = placesCount(frame, before, parts, cfg, rules);
    const patch = (p, again = true) => { setStepConfig(method, st, p); if (again) redraw(); else save(); };
    const isOpen = open.has(st.id);
    const summary = [
      Object.keys(parts).length || rules.length
        ? [Object.keys(parts).length ? `hotovo: ${describeParts(parts)}` : null, rules.length ? `${rules.length} ${rules.length === 1 ? 'pravidlo' : rules.length < 5 ? 'pravidla' : 'pravidel'} pro skupiny` : null].filter(Boolean).join(' + ')
        : 'dílky zatím nevybrané',
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
    const freeList = el('div', { className: 'bld-free', role: 'radiogroup', ariaLabel: `Kde smí být – krok ${k}` }, ...Object.entries(FREE_TEXT).map(([id, [label, hint]]) => {
      const r = Object.assign(el('input', { type: 'radio', name: `free-${st.id}`, value: id }), { checked: free === id });
      r.onchange = () => patch(id === 'colors' && !cfg.downs?.length ? { free: id, downs: [frame.down, OPPOSITE[frame.down]] } : { free: id });
      return el('label', { className: `bld-free-opt${free === id ? ' on' : ''}` }, r, el('span', {}, el('b', { textContent: label }), el('small', { textContent: hint })));
    }));
    const colorPick = (key, label, hint) => el('div', { className: 'sim-colors', role: 'group', ariaLabel: `${label} – krok ${k}`, title: hint },
      el('span', { textContent: label }),
      ...Object.entries(COLORS).map(([f, cname]) => {
        const box = Object.assign(el('input', { type: 'checkbox', ariaLabel: `${label}: ${cname}` }), { checked: (cfg[key] ?? []).includes(f) });
        box.onchange = () => patch({ [key]: Object.keys(COLORS).filter((x) => (x === f ? box.checked : (cfg[key] ?? []).includes(x))) });
        return el('label', { className: 'sim-color', title: cname }, box, el('i', { style: `--c: var(--c-${f})` }), el('span', { textContent: cname }));
      }));
    const placesNote = !Object.keys(parts).length && !rules.length ? 'Nejdřív vyber dílky nebo pravidlo (bod 2).'
      : places > 1 ? `Krok je hotový na kterémkoli z možných míst (${places}). Test u každého zamíchání vybere to nejvýhodnější a další kroky pokračují odtamtud.`
        : free === 'fixed' ? 'Krok je hotový jen tehdy, když jsou hotové přesně vybrané dílky.' : 'Tyhle dílky jsou ve všech povolených polohách na stejném místě – volnost tu nic nemění.';

    // 4. čím krok skládáš
    const setSel = select(setOpts(), st.set ?? '', `Sada algoritmů – krok ${k}`, (v) => {
      if (v === '+new') {
        const n = prompt('Název nové sady algoritmů:', st.title || `Krok ${k}`)?.trim();
        if (n) st.set = algSets.add(n);
      } else st.set = v || undefined;
      redraw();
    });
    const moves = select({ ...STEP_MOVES, custom: { label: 'Vlastní výběr…' } }, cfg.moves, `Tahy – krok ${k}`, (v) => patch(v === 'custom' && !cfg.custom?.length ? { moves: v, custom: [...STEP_MOVES.faces.bases] } : { moves: v }));
    const chips = cfg.moves === 'custom' ? el('div', { className: 'sim-chips', role: 'group', ariaLabel: `Vlastní tahy – krok ${k}` }, ...MOVE_BASES.map((b) => {
      const box = Object.assign(el('input', { type: 'checkbox' }), { checked: (cfg.custom ?? []).includes(b) });
      box.onchange = () => patch({ custom: MOVE_BASES.filter((x) => (x === b ? box.checked : (cfg.custom ?? []).includes(x))) }, false);
      return el('label', {}, box, b);
    })) : null;
    const helpers = el('input', { value: cfg.helpers ?? '', placeholder: 'např. M2 U2 M2', spellcheck: false, ariaLabel: `Pomocné algoritmy – krok ${k}` });
    helpers.onchange = () => patch({ helpers: helpers.value }, false);
    const useSet = nSet > 0;
    const solve = el('div', { className: 'grid-fields' },
      field('Sada algoritmů', setSel, 'Algoritmy, kterými krok skládáš (sady spravuješ v Trenažéru, nové přidáš z Labu)'),
      useSet ? field('Když na případ v sadě nemám algoritmus', select(MODE_TEXT, cfg.mode === 'set' ? 'set' : 'auto', `Chybějící případ – krok ${k}`, (v) => patch({ mode: v })), 'V testu: najde se hledáním, nebo se počítá jako chybějící') : null,
      field('Tahy', moves, 'Tahy, kterými krok skládáš (hledání i hodnocení). Vkládat z boku = přidej F, B, L…'),
      useSet ? field('Natočení vrstev k algoritmu', select(ADJUST, cfg.adjust, `Natočení vrstev – krok ${k}`, (v) => patch({ adjust: v }, false)), 'AUF/ADF před algoritmem a po něm (počítá se do tahů)') : null,
      useSet ? field('Pomocné algoritmy', helpers, 'Smíš je udělat před algoritmem ze sady (např. oprava parity); víc oddělených čárkou') : null);
    const setNote = set && !nSet ? el('p', { className: 'hint', textContent: 'Sada je zatím prázdná – algoritmy do ní uložíš v Labu (najdi řešení a „Uložit do sady“) nebo generátorem sady. Do té doby se krok jen hledá.' }) : null;

    // 5. nepovinné: test, obrázek, nácvik
    const testOpts = el('details', { className: 'bld-more' }, el('summary', { textContent: 'Podrobnosti pro test (nepovinné)' }),
      el('div', { className: 'grid-fields' },
        field('Vybírat řešení podle', select(Object.fromEntries(Object.entries(VIEWS).map(([id, v]) => [id, `${v.icon} ${v.label}`])), cfg.view, `Vybírat podle – krok ${k}`, (v) => patch({ view: v }, false)), 'Které z nalezených řešení test použije'),
        field('Čas hledání (s)', num(cfg.time, `Čas hledání – krok ${k}`, 0.5, 120, 0.5, (v) => patch({ time: v }, false)), 'Delší = blíž nejlepšímu možnému řešení, test trvá déle'),
        field('Rozpoznání (s)', num(cfg.recog, `Rozpoznání – krok ${k}`, 0, 5, 0.1, (v) => patch({ recog: v }, false)), 'Kolik ti trvá krok rozpoznat (odhad času)'),
        field('Druh kroku', select({ alg: 'Naučený algoritmus', intuitive: 'Intuitivní (vymýšlím)' }, cfg.kind ?? 'intuitive', `Druh kroku – krok ${k}`, (v) => patch({ kind: v }, false)),
          'Pro odhad času: naučený algoritmus jde rychle a s tolika tahy jako v simulaci, intuitivní krok (kříž, páry, bloky) dělá člověk s víc tahy a pomaleji')),
      el('label', { className: 'check-row' }, Object.assign(el('input', { type: 'checkbox' }), { checked: cfg.on === false, onchange: (e) => patch({ on: !e.target.checked }, false) }),
        'V testu spojit s dalším krokem (vyplatilo by se je dělat najednou?)'));
    const alg = el('input', { className: 'guide-input', value: st.task?.alg ?? '', placeholder: 'Ukázkový algoritmus (např. R U R\' U\')', disabled: !st.task, ariaLabel: `Ukázkový algoritmus – krok ${k}` });
    alg.onchange = () => { if (st.task) { st.task.alg = alg.value.trim() || undefined; redraw(); } };
    const picture = el('details', { className: 'bld-more', open: !!st.task }, el('summary', { textContent: 'Obrázek a ukázka z Labu (nepovinné)' }),
      el('p', { className: 'hint', textContent: 'V Labu nastav výchozí stav a cíl (případně vyber řešení v přehrávači) a tady klepni na „Vzít z Labu“.' }),
      illustration(st.task), examplePlayer(st.task), alg,
      el('div', { className: 'row-btns' },
        btn('lab', st.task ? 'Nahradit z Labu' : 'Vzít z Labu', () => { st.task = deps.labTask(); redraw(); }, 'secondary small'),
        st.task ? btn('close', 'Odebrat obrázek', () => { delete st.task; redraw(); }, 'secondary small') : null));

    return el('section', { className: 'bld-card bld-step open' }, head,
      q('1', 'Název a popis'), title, text,
      q('2', 'Co je po kroku hotové?', 'Klepni na dílky, nebo vyber předvolbu. Bledé jsou hotové z dřívějších kroků.'),
      el('b', { className: 'bld-sub', textContent: 'a) Konkrétní dílky' }),
      partsEditor(st, before, frame, redraw),
      el('b', { className: 'bld-sub', textContent: 'b) Kterékoli dílky ze skupiny' }),
      el('p', { className: 'hint bld-sub-hint', textContent: 'Když nezáleží na tom, který dílek to je – např. kříž z kterýchkoli bílých a žlutých hran, do slotu kterýkoli bílý/žlutý roh, natočení horní a spodní vrstvy, separace barev.' }),
      ...rules.map((r, j) => ruleEditor(r, frame, j + 1, redraw, () => { rules.splice(j, 1); st.rules = rules.length ? rules : undefined; redraw(); })),
      (() => {
        const add = el('select', { className: 'small-select bld-rule-add', ariaLabel: `Přidat pravidlo – krok ${k}` },
          el('option', { value: '', textContent: '+ Přidat pravidlo pro skupinu dílků…' }),
          el('option', { value: 'new', textContent: 'Vlastní pravidlo (nastavím sám)' }),
          el('optgroup', { label: 'Předvolby' }, ...RULE_PRESETS.map((p) => el('option', { value: p.id, textContent: p.label }))));
        add.onchange = () => {
          if (!add.value) return;
          const preset = RULE_PRESETS.find((p) => p.id === add.value);
          st.rules = [...rules, preset ? structuredClone(preset.rule) : newRule()];
          redraw();
        };
        return add;
      })(),
      q('3', 'Musí to být přesně tady?', 'Např. pár: „Přesně tady“ = jen ten jeden pár, „Na kterémkoli boku“ = kterýkoli ze 4 párů.'),
      freeList,
      free === 'colors' ? el('div', { className: 'sim-colors-box' },
        colorPick('downs', 'Dole smí být', 'Barvy, které smí být po kroku dole'),
        colorPick('fronts', 'Vpředu smí být', 'Nic nezaškrtnuté = vpředu kterákoli barva')) : null,
      el('p', { className: `bld-places${places > 1 ? ' many' : ''}`, textContent: placesNote }),
      q('4', 'Čím krok skládáš?', 'Sadou algoritmů, nebo bez ní (test najde řešení sám). Tahy říkají, jakými tahy krok děláš.'),
      solve, chips, setNote,
      testOpts, picture,
      el('div', { className: 'row-btns bld-step-tools' },
        deps.practice ? btn('timer', 'Nacvičit v timeru', () => deps.practice(st.id), 'secondary small') : null,
        set && deps.train ? btn('trainer', 'Trénovat sadu', () => deps.train(set.id), 'secondary small') : null,
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
    if (preset) st.parts = presetParts(preset.id, frame);
    // páry se obvykle skládají do kteréhokoli slotu
    if (preset?.id === 'pair') st.sim = { free: 'side' };
    guide.steps.push(st);
    open.add(st.id);
    redraw();
  };

  host.replaceChildren(...[
    el('div', { className: 'bld-how' },
      el('b', { textContent: 'Jak na to' }),
      el('ol', {},
        el('li', { textContent: 'Nahoře nastav, jak kostku držíš.' }),
        el('li', { textContent: 'Přidej kroky v pořadí, jak je skládáš. U každého odpověz na otázky 1–4.' }),
        el('li', { textContent: 'Přepni na „Otestovat“ – test složí náhodná zamíchání podle tvých kroků.' })),
      (() => {
        const tpl = el('select', { className: 'small-select bld-tpl', ariaLabel: 'Nová metoda ze šablony' },
          el('option', { value: '', textContent: 'Nebo začni ze šablony (vytvoří novou metodu)…' }),
          ...TEMPLATES.map((t) => el('option', { value: t.id, textContent: `${t.name} – ${t.steps.length} kroků` })));
        tpl.onchange = () => {
          const t = TEMPLATES.find((x) => x.id === tpl.value);
          if (!t) return;
          const taken = new Set(methods.list().map((m) => m.name));
          let name = t.name;
          for (let n = 2; taken.has(name); n++) name = `${t.name} (${n})`;
          const id = methods.add(name);
          guides.set(id, templateGuide(t, DEFAULT_FRAME, guides.newStep));
          methods.setActive(id);
          open.clear();
          renderBuilder();
        };
        return tpl;
      })()),
    base,
    el('h3', { className: 'bld-h', textContent: `Kroky (${guide.steps.length})` }),
    guide.steps.length ? null : el('p', { className: 'hint', textContent: 'Zatím žádný krok. Přidej první – třeba „Kříž“ nebo „Levý blok“ z předvoleb.' }),
    ...stepCards,
    add,
    guide.steps.length ? Object.assign(el('button', { type: 'button', className: 'primary bld-test' }), { textContent: 'Otestovat metodu →', onclick: () => deps.onTest() }) : null,
  ].filter(Boolean));
}
