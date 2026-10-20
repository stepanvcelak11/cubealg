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
import { pickNext as srsPick, reference, isGood, schedule, mastery, SORTS } from './srs.js';

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

function showCase() {
  const a = currentId && algs.get(currentId);
  const empty = !inTraining().length;
  $('tr-empty').hidden = !empty;
  $('tr-cube').hidden = empty;
  $('tr-pad').hidden = empty;
  $('tr-next').disabled = !inTraining().some((x) => x.enabled);
  const enabled = inTraining().filter((x) => x.enabled).length;
  $('tr-count').textContent = `v tréninku ${enabled} z ${inTraining().length}`;
  setOptions($('tr-set'), trainSet, { all: true, manage: true });
  if (!a) { $('tr-reveal').replaceChildren(); $('tr-name').textContent = ''; return; }
  const model = labModel(a.task.puzzle ?? '333');
  if (cubePuzzle !== model.id) {
    // pohled podle hlavolamu (3D kostka nebo plošná síť)
    const v = model.view;
    cube = v.type === 'cube3d'
      ? new Cube3D($('tr-cube'), { label: 'Případ', fill: true, facelets: v.facelets, scale: v.scale })
      : new NetView($('tr-cube'), { label: 'Případ', fill: true, viewBox: v.viewBox, polys: v.polys });
    cubePuzzle = model.id;
  }
  // případ se ukáže tak, jak byla kostka držená při hledání algoritmu
  if (cube.setHold && cube.hold !== (a.task.hold ?? '')) cube.setHold(a.task.hold ?? '');
  const side = model.deserialize(a.task.colorsA);
  const { loc } = side ? model.build(side, a.task.constraints) : { loc: null };
  if (loc) {
    cube.render(model.stateStickers(loc, a.task.constraints));
    if (model.overlay) cube.setOverlay(model.overlay(loc));
  }
  $('tr-name').textContent = revealed ? a.name : 'Jaký je to případ?';
  renderReveal(a);
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
    sb.onclick = () => { showSetup = !showSetup; renderReveal(a); };
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

function renderList() {
  const list = [...inTraining()].sort(SORTS[sortKey].cmp);
  $('tr-sheet-title').textContent = trainSet === 'all' ? `Všechny algoritmy · ${methods.get(methods.active()).name}` : algSets.get(trainSet).name;
  $('tr-count').textContent = `v tréninku ${list.filter((x) => x.enabled).length} z ${list.length}`;
  $('tr-list').replaceChildren(...list.map((a) => {
    const st = algStats(a);
    const cb = el('input', { type: 'checkbox', checked: a.enabled, title: 'Zařadit do tréninku' });
    cb.onchange = () => algs.update(a.id, { enabled: cb.checked });
    const name = el('input', { className: 'alg-name', value: a.name, ariaLabel: 'Název' });
    name.onchange = () => algs.update(a.id, { name: name.value.trim() || a.name });
    const train = iconButton(icon('trainer', { size: 18 }), {
      label: 'Trénovat teď',
      onClick: () => { currentId = a.id; revealed = false; closeSheet(); showCase(); },
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
    return el('li', { className: 'alg-item' },
      cb,
      el('div', { className: 'alg-main' }, name,
        el('code', { textContent: `${a.task.puzzle && a.task.puzzle !== '333' ? `[${labModel(a.task.puzzle).P.name}] ` : ''}${a.alg}` }),
        el('div', { className: 'alg-meta' },
          el('small', { textContent: st.count ? `${st.count}× · nejlepší ${formatTime(st.best)} · průměr ${formatTime(st.mean)}` : 'zatím netrénováno' },
            el('b', { className: `mastery ${mastery(a)}`, textContent: MASTERY[mastery(a)] })),
          move)),
      el('div', { className: 'alg-actions' }, train, del));
  }));
  if (!list.length) $('tr-list').replaceChildren(el('li', { className: 'hint', textContent: 'Žádné uložené algoritmy.' }));
}

function closeSheet() { $('tr-sheet').hidden = true; }

let stopwatch;

export function initTrainer({ isActive }) {
  isActiveFn = isActive;
  cube = new Cube3D($('tr-cube'), { label: 'Případ', fill: true });
  cubePuzzle = '333';
  stopwatch = new Stopwatch({
    pad: $('tr-pad'),
    display: $('tr-display'),
    isActive: () => isActiveFn() && !!currentId && $('tr-sheet').hidden,
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
    },
  });
  $('tr-next').onclick = () => { next(); $('tr-next').blur(); };
  $('tr-open').onclick = () => { renderList(); $('tr-sheet').hidden = false; };
  $('tr-close').onclick = closeSheet;
  const sortSel = $('tr-sort');
  sortSel.replaceChildren(...Object.entries(SORTS).map(([k, v]) => el('option', { value: k, textContent: v.label })));
  sortSel.value = sortKey;
  sortSel.onchange = () => { sortKey = sortSel.value; storage.set('ergocube.trainer.sort', sortKey); renderList(); };
  $('tr-all').onclick = () => {
    const all = inTraining().every((a) => a.enabled);
    for (const a of inTraining()) a.enabled = !all;
    algs.save();
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
  showCase();
}

export function showTrainer() {
  cube.layout();
  if (!currentId) currentId = pickNext();
  showCase();
}
