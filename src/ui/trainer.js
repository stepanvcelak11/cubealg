// Trenažér vlastních algoritmů: náhodný případ ze sady, stopky, odhalení
// algoritmu a statistiky pro každý algoritmus.

import { averageOf, formatTime } from '../timer/stats.js';
import { $, el, iconButton, storage } from './dom.js';
import { icon } from './icons.js';
import { algs, algSets, defaultSetId, methods } from './store.js';
import { setOptions, pickSet } from './sets.js';
import { Stopwatch } from './stopwatch.js';
import { Cube3D } from './cube3d.js';
import { NetView } from './netview.js';
import { labModel } from './models.js';
import { randomInt } from '../timer/scramble.js';
import { retarget, stripU } from './algedit.js';
import { sendLink, algsPayload, toast } from './share.js';
import { recogStats, recordRecog, pickRecog, optionsFor } from './recog.js';
import { holdFor } from './holds.js';
import { pickNext as srsPick, reference, isGood, schedule, mastery, SORTS } from './srs.js';
import { smartCube } from '../smartcube/index.js';
import { mergeQuarters } from '../smartcube/recon.js';
import { recordSegments } from './smartdata.js';
import { openLibrary } from './algdb.js';
import { openReview } from './review.js';

// Trénovaná sada ('all' = všechny).
let trainSet = storage.get('ergocube.trainer.set') ?? 'all';
const inTraining = () => (trainSet === 'all' ? algs.inMethod() : algs.inSet(trainSet));
// sada musí patřit k aktivní metodě (po přepnutí metody se vrátí na všechny sady)
const checkSet = () => { if (trainSet !== 'all' && !algSets.list().some((x) => x.id === trainSet)) trainSet = 'all'; };

let trials = storage.get('ergocube.trainer.n') ?? 0; // počet pokusů celkem (čas plánu)
let sortKey = storage.get('ergocube.trainer.sort') ?? 'order';
let verdict = null; // hodnocení posledního pokusu {id, good, interval}
const MASTERY = { new: 'nový', weak: 'k procvičení', learning: 'učím se', good: 'zvládnuto' };

let cube;
let cubePuzzle = null; // hlavolam, pro který je vytvořený pohled
let currentId = null;
let revealed = false;
let isActiveFn = () => false;

function algStats(a) {
  const ts = a.times.map((x) => x.t);
  return {
    count: ts.length,
    best: ts.length ? Math.min(...ts) : NaN,
    ao5: ts.length >= 5 ? averageOf(ts.slice(-5)) : NaN,
    mean: ts.length ? ts.reduce((s, t) => s + t, 0) / ts.length : NaN,
  };
}

// Opakování podle zvládnutí (viz srs.js): na řadě jsou nové případy a ty, které se
// povedly špatně nebo jejichž termín nastal.
function pickNext() {
  return srsPick(inTraining().filter((a) => a.enabled), trials, randomInt, currentId);
}

// Režim tréninku: 'time' = čas provedení, 'recog' = rozpoznání případu.
let mode = storage.get('ergocube.trainer.mode') === 'recog' ? 'recog' : 'time';

/** Vykreslí případ algoritmu (volitelně po natočení horní vrstvy o auf čtvrtotáček). */
let lookedAt = null; // případ, u kterého je pohled nastavený (tažením si ho jde natočit)
const checked = new Map(); // id → { alg, ok } – řeší algoritmus zobrazený případ?
let openLabFn = null;

/** Řeší uložený algoritmus případ, jak ho trenažér ukazuje? (null = nejde ověřit) */
function solvesCase(a) {
  const c = checked.get(a.id);
  if (c && c.alg === a.alg && c.task === a.task) return c.ok;
  let ok = null;
  try {
    const model = labModel(a.task.puzzle ?? '333');
    if (model.kind === 'perm') {
      const b = model.buildTask(model.deserialize(a.task.colorsA), model.deserialize(a.task.colorsB), a.task.constraints, a.task.marks);
      if (!b.loc) ok = false;
      else {
        const held = a.task.hold ? holdFor(model, a.task.hold) : null;
        const steps = model.steps(a.alg.replace(/[()]/g, ' '));
        const goal = model.goal(b.constraints, b.target);
        ok = goal.test(model.applySteps(b.loc, held ? held.toModel(steps) : steps));
      }
    }
  } catch { ok = false; }
  checked.set(a.id, { alg: a.alg, task: a.task, ok });
  return ok;
}

function drawCase(a, auf = 0) {
  const model = labModel(a.task.puzzle ?? '333');
  if (cubePuzzle !== model.id) {
    // pohled podle hlavolamu (3D kostka nebo plošná síť)
    const v = model.view;
    cube = v.type === 'cube3d'
      ? new Cube3D($('tr-cube'), { label: 'Případ', fill: true, facelets: v.facelets, scale: v.scale })
      : new NetView($('tr-cube'), { label: 'Případ', fill: true, viewBox: v.viewBox, polys: v.polys });
    cubePuzzle = model.id;
  }
  // případ se ukáže tak, jak byla kostka držená při hledání algoritmu – a natočená tak,
  // jak se na ni skladač v Labu díval při uložení (look)
  if (cube.setHold && cube.hold !== (a.task.hold ?? '')) cube.setHold(a.task.hold ?? '');
  if (lookedAt !== a.id) {
    lookedAt = a.id;
    if (a.look && cube.setLook) cube.setLook(a.look);
    else if (cube.resetView) cube.resetView();
  }
  const side = model.deserialize(a.task.colorsA);
  const sideB = model.deserialize(a.task.colorsB);
  const built = side && sideB ? model.buildTask(side, sideB, a.task.constraints, a.task.marks) : side ? model.build(side, a.task.constraints) : { loc: null };
  let { loc } = built;
  if (!loc) {
    // zadání nejde sestavit: prázdná kostka (ne obrázek předchozího případu)
    cube.render(Array.from({ length: model.P?.size ?? 54 }, () => ({ color: 'X', style: 'none' })));
    return;
  }
  if (auf) {
    // natočení horní vrstvy v rámci držení (U = stěna nahoře)
    const held = a.task.hold ? holdFor(model, a.task.hold) : null;
    const m = { base: 'U', amount: auf === 3 ? -1 : auf };
    try { loc = model.applySteps(loc, held ? held.toModel([m]) : [m]); } catch { /* bez natočení */ }
  }
  cube.render(model.stateStickers(loc, built.constraints ?? a.task.constraints, built.known));
  if (model.overlay) cube.setOverlay(model.overlay(loc));
}

function showCase() {
  if (mode === 'recog') { showRecog(); return; }
  const a = currentId && algs.get(currentId);
  const empty = !inTraining().length;
  $('tr-empty').hidden = !empty;
  $('tr-cube').hidden = empty;
  $('tr-pad').hidden = empty;
  $('tr-reveal').hidden = false;
  $('tr-recog').hidden = true;
  $('tr-next').disabled = !inTraining().some((x) => x.enabled);
  const enabled = inTraining().filter((x) => x.enabled).length;
  $('tr-count').textContent = `v tréninku ${enabled} z ${inTraining().length}`;
  setOptions($('tr-set'), trainSet, { all: true, manage: true });
  if (!a) { $('tr-reveal').replaceChildren(); $('tr-name').textContent = ''; return; }
  drawCase(a);
  $('tr-name').textContent = revealed ? a.name : 'Jaký je to případ?';
  renderReveal(a);
  renderMismatch(a);
  if (smart.id !== a.id || smart.phase === 'off') smartPrepare();
}

/** Upozornění, když algoritmus neřeší zobrazený případ (s opravou v Labu). */
function renderMismatch(a) {
  const box = $('tr-reveal');
  box.querySelector('.tr-mismatch')?.remove();
  if (solvesCase(a) !== false) return;
  const fix = openLabFn ? el('button', { type: 'button', className: 'secondary small', textContent: 'Otevřít v Labu' }) : null;
  if (fix) fix.onclick = () => openLabFn({ ...a.task, ...(a.task.puzzle ? {} : { puzzle: '333' }) }, a.alg);
  box.prepend(el('div', { className: 'tr-mismatch' },
    el('span', { textContent: '⚠ Algoritmus neřeší případ, jak je uložený – obrázek s ním nesedí. Otevři ho v Labu, zkontroluj Start a ulož znovu.' }), fix));
}

let showSetup = false;

function renderReveal(a) {
  const st = algStats(a);
  const box = $('tr-reveal');
  // Nastavení případu na skutečné kostce = inverze algoritmu.
  const setup = showSetup
    ? el('div', { className: 'reveal-setup' }, el('small', { textContent: 'Nastavení na kostce:' }), el('code', { textContent: setupOf(a) }))
    : null;
  if (!revealed) {
    const b = el('button', { type: 'button', className: 'secondary small' });
    b.innerHTML = icon('eye', { size: 16 });
    b.append(el('span', { textContent: 'Ukázat algoritmus' }));
    b.onclick = () => { revealed = true; showCase(); };
    const sb = el('button', { type: 'button', className: `secondary small${showSetup ? ' on' : ''}` });
    sb.innerHTML = icon('shuffle', { size: 16 });
    sb.append(el('span', { textContent: 'Nastavení' }));
    sb.onclick = () => { showSetup = !showSetup; renderReveal(a); renderMismatch(a); };
    box.replaceChildren(...[el('div', { className: 'row-btns' }, b, sb), setup].filter(Boolean));
    return;
  }
  box.replaceChildren(
    el('div', { className: 'reveal-alg', textContent: a.alg }),
    ...(verdict?.id === a.id ? [el('div', { className: `reveal-verdict ${verdict.good ? 'ok' : 'slow'}`, textContent: verdict.good
      ? `Dobře – znovu za ${verdict.interval} případů.` : 'Pomalejší než obvykle – vrátí se hned za pár případů.' })] : []),
    el('div', { className: 'reveal-stats' },
      el('span', { textContent: `pokusů ${st.count}` }),
      el('span', { textContent: `nejlepší ${formatTime(st.best)}` }),
      el('span', { textContent: `ao5 ${formatTime(st.ao5)}` }),
      el('span', { textContent: `průměr ${formatTime(st.mean)}` }),
      el('span', { textContent: MASTERY[mastery(a)] })),
    ...(setup ? [setup] : []));
}

// --- Trénink rozpoznání -----------------------------------------------------------------

let recog = null; // { id, options, auf, shownAt, answer }

const cubeLike = (a) => labModel(a.task.puzzle ?? '333').P.bases.includes('U') && (a.task.puzzle ?? '333') !== 'pyram';

function nextRecog() {
  const list = inTraining().filter((a) => a.enabled);
  const a = pickRecog(list, recog?.id);
  if (!a) { recog = null; showRecog(); return; }
  recog = { id: a.id, options: optionsFor(a, list, 4), auf: cubeLike(a) ? Math.floor(Math.random() * 4) : 0, shownAt: 0, answer: null };
  showRecog();
  recog.shownAt = performance.now();
}

function answerRecog(choice) {
  if (!recog || recog.answer) return;
  const a = algs.get(recog.id);
  if (!a) return;
  const ms = performance.now() - recog.shownAt;
  const ok = choice.id === a.id;
  recog.answer = { id: choice.id, ok, ms };
  algs.update(a.id, { recog: recordRecog(a.recog, ok, ms) }); // přes subscribe → showCase → showRecog
  if (ok) {
    const id = recog.id;
    setTimeout(() => { if (mode === 'recog' && recog?.id === id && recog.answer) nextRecog(); }, 700);
  }
}

function showRecog() {
  const empty = !inTraining().length;
  $('tr-empty').hidden = !empty;
  $('tr-cube').hidden = empty;
  $('tr-pad').hidden = true;
  $('tr-reveal').hidden = true;
  const box = $('tr-recog');
  box.hidden = empty;
  const list = inTraining().filter((x) => x.enabled);
  $('tr-count').textContent = `v tréninku ${list.length} z ${inTraining().length}`;
  setOptions($('tr-set'), trainSet, { all: true, manage: true });
  if (empty) return;
  if (list.length < 2) {
    box.replaceChildren(el('p', { className: 'hint', textContent: 'Na rozpoznání jsou potřeba aspoň dva algoritmy v tréninku (s různými názvy).' }));
    return;
  }
  const a = recog && algs.get(recog.id);
  if (!a) { nextRecog(); return; }
  drawCase(a, recog.auf);
  const ans = recog.answer;
  const opts = recog.options.map((o, i) => {
    const b = el('button', { type: 'button', className: 'recog-opt' },
      el('kbd', { textContent: String(i + 1) }), el('b', { textContent: o.name }), el('code', { textContent: o.alg }));
    if (ans) {
      if (o.id === a.id) b.classList.add('right');
      else if (o.id === ans.id) b.classList.add('wrong');
      b.disabled = true;
    }
    b.onclick = () => answerRecog(o);
    return b;
  });
  const st = recogStats(a);
  const total = list.reduce((acc, x) => { const s = recogStats(x); acc.n += s.n; acc.ok += s.ok; return acc; }, { n: 0, ok: 0 });
  box.replaceChildren(...[
    el('div', { className: 'trainer-name', textContent: ans ? (ans.ok ? `Správně · ${formatTime(ans.ms)}` : `Ne – je to ${a.name}`) : 'Co je to za případ?' }),
    el('div', { className: 'recog-opts' }, ...opts),
    ans && !ans.ok ? Object.assign(el('button', { type: 'button', className: 'primary', textContent: 'Další' }), { onclick: nextRecog }) : null,
    el('div', { className: 'reveal-stats' },
      el('span', { textContent: `tento: ${st.n ? `${Math.round(st.acc * 100)} % z ${st.n}` : 'nový'}` }),
      el('span', { textContent: Number.isFinite(st.avg) ? `průměr ${formatTime(st.avg)}` : '' }),
      el('span', { textContent: `celkem ${total.n ? Math.round((total.ok / total.n) * 100) : 0} % správně` })),
  ].filter(Boolean));
}

function setMode(m) {
  mode = m;
  storage.set('ergocube.trainer.mode', m);
  for (const b of $('tr-mode').querySelectorAll('button')) b.classList.toggle('active', b.dataset.mode === m);
  if (m === 'recog') nextRecog(); else showCase();
}

function setupOf(a) {
  try { return labModel(a.task.puzzle ?? '333').invertAlg(a.alg); } catch { return '–'; }
}

function next() {
  currentId = pickNext();
  revealed = false;
  verdict = null;
  stopwatch.show(0);
  showCase();
}

// --- Hromadné úpravy: výběr algoritmů, kopírování a přesun mezi sadami, smazání ---------
let selecting = false;
const selected = new Set();

/** Zkopíruje text do schránky (a dá vědět). */
async function copyText(text, what) {
  try { await navigator.clipboard.writeText(text); toast(`Zkopírováno: ${what}`); } catch { prompt('Zkopíruj:', text); }
}
const algLine = (a) => `${a.name}: ${a.alg}`;

/** Lišta hromadných úprav (dole v seznamu, když je zapnutý výběr). */
function renderBulk(list) {
  const bar = $('tr-bulk');
  bar.hidden = !selecting;
  $('tr-sheet').classList.toggle('selecting', selecting);
  $('tr-select').setAttribute('aria-pressed', String(selecting));
  $('tr-select').textContent = selecting ? 'Hotovo' : 'Upravit';
  $('tr-all').hidden = selecting;
  if (!selecting) return;
  for (const id of [...selected]) if (!list.some((a) => a.id === id)) selected.delete(id);
  const picked = list.filter((a) => selected.has(a.id));
  const n = picked.length;
  const target = el('select', { className: 'small-select', ariaLabel: 'Cílová sada' },
    ...algSets.list().map((st) => el('option', { value: st.id, textContent: st.name })));
  if (trainSet !== 'all') target.value = algSets.list().find((st) => st.id !== trainSet)?.id ?? trainSet;
  const btn = (text, cls, fn, title) => Object.assign(el('button', { type: 'button', className: `${cls} small`, textContent: text, disabled: !n, title }), { onclick: fn });
  const setName = () => algSets.get(target.value).name;
  bar.replaceChildren(
    el('div', { className: 'bulk-row' },
      el('b', { textContent: n ? `Vybráno ${n}` : 'Vyber algoritmy' }),
      Object.assign(el('button', { type: 'button', className: 'secondary small', textContent: n === list.length && n ? 'Zrušit výběr' : 'Vybrat vše' }), {
        onclick: () => { if (n === list.length) selected.clear(); else for (const a of list) selected.add(a.id); renderList(); },
      })),
    el('div', { className: 'bulk-row' }, target,
      btn('Kopírovat', 'secondary', () => {
        for (const a of picked) algs.add({ alg: a.alg, task: structuredClone(a.task), name: a.name, set: target.value });
        toast(`${n}× zkopírováno do „${setName()}“`);
      }, 'Přidá kopie do vybrané sady (originály zůstanou)'),
      btn('Přesunout', 'secondary move', () => {
        const name = setName();
        for (const a of picked) a.set = target.value;
        selected.clear();
        algs.save();
        toast(`${n}× přesunuto do „${name}“`);
      }, 'Přesune do vybrané sady (i se statistikami)')),
    el('div', { className: 'bulk-row' },
      btn('Kopírovat text', 'secondary', () => copyText(picked.map(algLine).join('\n'), `${n} ${n === 1 ? 'algoritmus' : n < 5 ? 'algoritmy' : 'algoritmů'}`), 'Zkopíruje názvy a zápisy do schránky'),
      btn('Smazat', 'danger', () => {
        if (!confirm(`Smazat ${n} ${n === 1 ? 'algoritmus' : n < 5 ? 'algoritmy' : 'algoritmů'} i se statistikami?`)) return;
        for (const a of picked) algs.remove(a.id);
        selected.clear();
        if (currentId && !algs.get(currentId)) next();
      })));
}

function renderList() {
  const list = [...inTraining()].sort(SORTS[sortKey].cmp);
  renderBulk(list);
  $('tr-sheet-title').textContent = trainSet === 'all' ? `Všechny algoritmy · ${methods.get(methods.active()).name}` : algSets.get(trainSet).name;
  $('tr-count').textContent = `v tréninku ${list.filter((x) => x.enabled).length} z ${list.length}`;
  $('tr-list').replaceChildren(...list.map((a) => {
    const st = algStats(a);
    // při úpravách zaškrtávátko vybírá algoritmus, jinak zařazuje do tréninku
    const cb = selecting
      ? el('input', { type: 'checkbox', checked: selected.has(a.id), title: 'Vybrat', ariaLabel: `Vybrat ${a.name}` })
      : el('input', { type: 'checkbox', checked: a.enabled, title: 'Zařadit do tréninku' });
    cb.onchange = selecting
      ? () => { if (cb.checked) selected.add(a.id); else selected.delete(a.id); renderBulk(list); }
      : () => algs.update(a.id, { enabled: cb.checked });
    const name = el('input', { className: 'alg-name', value: a.name, ariaLabel: 'Název' });
    name.onchange = () => algs.update(a.id, { name: name.value.trim() || a.name });
    const train = iconButton(icon('trainer', { size: 18 }), {
      label: 'Trénovat teď',
      onClick: () => { currentId = a.id; revealed = false; closeSheet(); showCase(); },
    });
    const edit = iconButton(icon('edit', { size: 18 }), {
      label: 'Upravit algoritmus',
      onClick: () => { editing = editing === a.id ? null : a.id; renderList(); },
    });
    const copy = iconButton(icon('copy', { size: 18 }), {
      label: 'Kopírovat algoritmus',
      onClick: () => copyText(a.alg, a.name),
    });
    const share = iconButton(icon('share', { size: 18 }), {
      label: 'Sdílet odkazem',
      onClick: () => sendLink(algsPayload([a]), a.name),
    });
    const del = iconButton(icon('trash', { size: 18 }), {
      label: 'Smazat',
      onClick: () => { if (confirm(`Smazat „${a.name}“?`)) { algs.remove(a.id); if (currentId === a.id) next(); } },
    });
    // přesun do jiné sady
    const move = el('select', { className: 'alg-set', ariaLabel: 'Sada' },
      ...algSets.list().map((st) => el('option', { value: st.id, textContent: st.name })));
    move.value = algSets.list().some((x) => x.id === a.set) ? a.set : defaultSetId();
    move.onchange = () => algs.update(a.id, { set: move.value });
    return el('li', { className: `alg-item${selecting && selected.has(a.id) ? ' picked' : ''}` },
      cb,
      el('div', { className: 'alg-main' }, name,
        el('code', { textContent: `${a.task.puzzle && a.task.puzzle !== '333' ? `[${labModel(a.task.puzzle).P.name}] ` : ''}${a.alg}` }),
        el('div', { className: 'alg-meta' },
          el('small', { textContent: st.count ? `${st.count}× · nejlepší ${formatTime(st.best)} · průměr ${formatTime(st.mean)}` : 'zatím netrénováno' },
            el('b', { className: `mastery ${mastery(a)}`, textContent: MASTERY[mastery(a)] })),
          move),
        editing === a.id ? editor(a) : null),
      el('div', { className: 'alg-actions' }, train, edit, copy, share, del));
  }));
  if (!list.length) $('tr-list').replaceChildren(el('li', { className: 'hint', textContent: 'Žádné uložené algoritmy.' }));
}

// --- Úprava uloženého algoritmu ------------------------------------------------------------
let editing = null; // id upravovaného algoritmu

/** Editor algoritmu v seznamu: zápis, smazání úvodního/koncového U, uložení. */
function editor(a) {
  const input = el('input', { className: 'alg-edit', value: a.alg, ariaLabel: 'Algoritmus', autocomplete: 'off', spellcheck: false });
  const msg = el('small', { className: 'hint' });
  const strip = (first) => {
    const b = el('button', { type: 'button', className: 'secondary small', textContent: first ? 'Smazat úvodní U' : 'Smazat koncové U' });
    b.onclick = () => { const s = stripU(input.value, first); if (s !== null) { input.value = s; check(); } };
    return b;
  };
  const check = () => {
    const r = retarget(a, input.value);
    msg.className = r.ok ? 'hint ok' : 'hint ko';
    msg.textContent = r.ok
      ? (r.pre || r.post
        ? `✓ řeší případ po posunu: ${[r.pre && `výchozí stav se natočí o ${r.pre}`, r.post && `cíl bude natočený o ${r.post} méně`].filter(Boolean).join(', ')}`
        : '✓ řeší uložený případ')
      : `✗ ${r.reason}`;
    return r;
  };
  input.oninput = check;
  const save = el('button', { type: 'button', className: 'primary small', textContent: 'Uložit' });
  save.onclick = () => {
    const alg = input.value.trim().replace(/\s+/g, ' ');
    if (!alg) return;
    const r = check();
    if (!r.ok && !confirm(`${r.reason}\nUložit i tak (případ zůstane stejný)?`)) return;
    editing = null;
    algs.update(a.id, r.ok ? { alg, task: r.task } : { alg });
    if (currentId === a.id) showCase();
  };
  const cancel = el('button', { type: 'button', className: 'secondary small', textContent: 'Zrušit' });
  cancel.onclick = () => { editing = null; renderList(); };
  check();
  return el('div', { className: 'alg-editor' }, input,
    el('div', { className: 'row-btns' }, strip(true), strip(false), save, cancel), msg);
}

function closeSheet() { $('tr-sheet').hidden = true; selecting = false; selected.clear(); }

let stopwatch;

// --- chytrá kostka: trenažér pozná nastavený případ, změří a ověří provedení ---------------
// Případ je nastavený, když z dnešního stavu kostky algoritmus (i s natočením U před a po)
// splní cíl případu. První tah spustí čas, splnění cíle ho zastaví (podle hodin kostky).
const smart = { phase: 'off', moves: [], goal: null, id: null, note: '' };
function smartCase(a) {
  if (!a || (a.task.puzzle ?? '333') !== '333') return null;
  const model = labModel('333');
  const side = model.deserialize(a.task.colorsA), sideB = model.deserialize(a.task.colorsB);
  const built = side && sideB ? model.buildTask(side, sideB, a.task.constraints, a.task.marks) : null;
  if (!built?.loc) return null;
  const held = a.task.hold ? holdFor(model, a.task.hold) : null;
  const toModel = (alg) => (held ? held.toModelString(alg) : alg);
  const aufs = ['', 'U', "U'", 'U2'].map((x) => (x ? toModel(x) : ''));
  let alg;
  try { alg = toModel(a.alg.replace(/[()]/g, ' ').trim()); } catch { return null; }
  return { goal: model.goal(built.constraints, built.target).test, alg, aufs, model, held };
}
function smartPrepare() {
  const a = currentId && algs.get(currentId);
  const c = smartCube.connected && mode === 'time' ? smartCase(a) : null;
  smart.case = c;
  smart.id = a?.id ?? null;
  smart.phase = c ? 'wait' : 'off';
  smart.moves = [];
  smartCheck();
}
/** Je na kostce nastavený případ (algoritmus s natočením U před a po splní cíl)? */
function caseFits(st) {
  const c = smart.case;
  if (!c || c.goal(st)) return false;
  return c.aufs.some((pre) => c.aufs.some((post) => {
    try { return c.goal(c.model.applySteps(st, c.model.steps([pre, c.alg, post].filter(Boolean).join(' ')))); } catch { return false; }
  }));
}
// případ je nastavený, až když kostka po nastavení chvíli stojí (cestou může „sedět“ i mezistav)
const SETTLE = 500;
function smartCheck() {
  clearTimeout(smart.settle);
  if (!smart.case || smart.phase !== 'wait') return smartHint();
  smart.settle = setTimeout(() => {
    if (smart.phase === 'wait' && caseFits(smartCube.state)) smart.phase = 'ready';
    smartHint();
  }, SETTLE);
  smartHint();
}
function smartHint() {
  if (!smartCube.connected || mode !== 'time' || stopwatch?.state === 'running') return;
  const text = smart.phase === 'wait' ? `Chytrá kostka: nastav případ (Nastavení ukáže tahy)${smart.note ? ` · ${smart.note}` : ''}`
    : smart.phase === 'ready' ? 'Případ nastavený ✓ – první tah spustí čas' : '';
  if (text) $('tr-hint').textContent = text;
}
function initSmartTrainer() {
  smartCube.on('status', smartPrepare);
  smartCube.on('state', smartCheck);
  smartCube.on('move', ({ move, t, state }) => {
    if (!isActiveFn() || mode !== 'time' || !smart.case) return;
    if (smart.id !== currentId) smartPrepare();
    if (smart.phase === 'wait') { smartCheck(); return; }
    // dokud případ sedí (dotáčení nastavení, natočení U), čas se nespouští
    if (smart.phase === 'ready') { if (caseFits(state)) return; smart.phase = 'solving'; smart.moves = []; stopwatch.startAt(t); }
    if (smart.phase !== 'solving') return;
    smart.moves.push({ move, t });
    if (!smart.case.goal(state)) return;
    // hotovo: ověření provedení (v držení algoritmu, bez natočení U na krajích)
    const merged = mergeQuarters(smart.moves);
    const hold = algs.get(currentId)?.task.hold ?? '';
    recordSegments(merged, 'trainer', hold);
    let done = merged.map((x) => x.move).join(' ');
    try { if (smart.case.held) done = smart.case.held.toHeldString(done); } catch { /* jak je */ }
    const core = (x) => x.replace(/[()]/g, ' ').trim().split(/\s+/).filter(Boolean);
    const strip = (list) => { while (list.length && /^U/.test(list[0])) list.shift(); while (list.length && /^U/.test(list.at(-1))) list.pop(); return list.join(' '); };
    const want = strip(core(algs.get(currentId)?.alg ?? '')), got = strip(core(done));
    smart.note = want === got ? 'provedeno přesně podle algoritmu ✓' : `provedeno jinak: ${done}`;
    smart.phase = 'wait';
    stopwatch.stopAt(t);
    toast(want === got ? 'Přesně podle algoritmu ✓' : `Jiným postupem: ${done}`);
  });
}

export function initTrainer({ isActive, openLab }) {
  isActiveFn = isActive;
  openLabFn = openLab ?? null;
  cube = new Cube3D($('tr-cube'), { label: 'Případ', fill: true });
  cubePuzzle = '333';
  stopwatch = new Stopwatch({
    pad: $('tr-pad'),
    display: $('tr-display'),
    isActive: () => isActiveFn() && mode === 'time' && !!currentId && $('tr-sheet').hidden,
    onStop: (ms) => {
      const a = algs.get(currentId);
      if (!a) return;
      const good = isGood(ms, reference(a, inTraining()));
      trials += 1;
      storage.set('ergocube.trainer.n', trials);
      const sr = schedule(a.sr, good, trials);
      verdict = { id: a.id, good, interval: sr.interval };
      algs.update(a.id, { times: [...a.times, { t: ms, d: Date.now() }], sr });
      revealed = true;
      showCase();
    },
    onState: (s) => {
      $('tr-hint').textContent = { idle: 'Podrž mezerník nebo prst, pusť pro start', holding: 'Drž…', ready: 'Pusť!', running: '' }[s] ?? '';
      if (s === 'idle') smartHint();
    },
  });
  $('tr-next').onclick = () => { if (mode === 'recog') nextRecog(); else next(); $('tr-next').blur(); };
  for (const b of $('tr-mode').querySelectorAll('button')) b.onclick = () => { setMode(b.dataset.mode); b.blur(); };
  // rozpoznání z klávesnice: 1–4 = odpověď, mezerník / Enter = další
  window.addEventListener('keydown', (e) => {
    if (!isActiveFn() || mode !== 'recog' || !$('tr-sheet').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '')) return;
    const i = Number(e.key) - 1;
    if (recog && !recog.answer && i >= 0 && i < recog.options.length) { e.preventDefault(); answerRecog(recog.options[i]); }
    else if (recog?.answer && (e.code === 'Space' || e.key === 'Enter')) { e.preventDefault(); nextRecog(); }
  });
  $('tr-open').onclick = () => { renderList(); $('tr-sheet').hidden = false; };
  $('tr-library').onclick = () => openLibrary({ onSaved: (set) => trainSetTo(set) });
  $('tr-review').onclick = () => openReview({ openLab, onSaved: (set) => trainSetTo(set) });
  $('tr-close').onclick = closeSheet;
  const sortSel = $('tr-sort');
  sortSel.replaceChildren(...Object.entries(SORTS).map(([k, v]) => el('option', { value: k, textContent: v.label })));
  sortSel.value = sortKey;
  sortSel.onchange = () => { sortKey = sortSel.value; storage.set('ergocube.trainer.sort', sortKey); renderList(); };
  $('tr-select').onclick = () => { selecting = !selecting; selected.clear(); renderList(); };
  $('tr-all').onclick = () => {
    const all = inTraining().every((a) => a.enabled);
    for (const a of inTraining()) a.enabled = !all;
    algs.save();
  };
  $('tr-share').onclick = () => {
    const list = inTraining();
    if (!list.length) return;
    const name = trainSet === 'all' ? methods.get(methods.active()).name : algSets.get(trainSet).name;
    sendLink(algsPayload(list, name), `Sada ${name}`);
  };
  $('tr-set').onchange = () => {
    trainSet = pickSet($('tr-set'), trainSet);
    checkSet();
    storage.set('ergocube.trainer.set', trainSet);
    $('tr-set').blur();
    currentId = pickNext();
    revealed = false;
    showCase();
    if (!$('tr-sheet').hidden) renderList();
  };
  algs.subscribe(() => {
    checkSet();
    if (!$('tr-sheet').hidden) renderList();
    if (currentId && (!algs.get(currentId) || !inTraining().includes(algs.get(currentId)))) currentId = null;
    if (!currentId) currentId = pickNext();
    showCase();
  });
  currentId = pickNext();
  setMode(mode);
  initSmartTrainer();
}

/** Přepne trénovanou sadu (z průvodce metodou). */
export function trainSetTo(id) {
  trainSet = id;
  checkSet();
  storage.set('ergocube.trainer.set', trainSet);
  currentId = pickNext();
  revealed = false;
  showCase();
}

export function showTrainer() {
  cube.layout();
  if (!currentId) currentId = pickNext();
  showCase();
}
