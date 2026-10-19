// Trenažér vlastních algoritmů: náhodný případ ze sady, stopky, odhalení
// algoritmu a statistiky pro každý algoritmus.

import { averageOf, formatTime } from '../timer/stats.js';
import { $, el, iconButton } from './dom.js';
import { icon } from './icons.js';
import { algs } from './store.js';
import { Stopwatch } from './stopwatch.js';
import { Cube3D } from './cube3d.js';
import { NetView } from './netview.js';
import { labModel } from './models.js';
import { randomInt } from '../timer/scramble.js';

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

// Častěji vybírá algoritmy s méně pokusy a pomalejším průměrem.
function pickNext() {
  const pool = algs.list().filter((a) => a.enabled);
  if (!pool.length) return null;
  const candidates = pool.length > 1 ? pool.filter((a) => a.id !== currentId) : pool;
  const means = candidates.map((a) => algStats(a).mean).filter(Number.isFinite);
  const avgMean = means.length ? means.reduce((s, m) => s + m, 0) / means.length : 1;
  const weights = candidates.map((a) => {
    const st = algStats(a);
    const slow = Number.isFinite(st.mean) ? st.mean / avgMean : 1.5;
    return Math.max(0.2, slow) * (1 + 3 / (1 + st.count));
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let r = (randomInt(1e6) / 1e6) * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i].id;
  }
  return candidates.at(-1).id;
}

function showCase() {
  const a = currentId && algs.get(currentId);
  const empty = !algs.list().length;
  $('tr-empty').hidden = !empty;
  $('tr-cube').hidden = empty;
  $('tr-pad').hidden = empty;
  $('tr-next').disabled = !algs.list().some((x) => x.enabled);
  const enabled = algs.list().filter((x) => x.enabled).length;
  $('tr-count').textContent = `Moje algoritmy (${enabled}/${algs.list().length})`;
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
    box.replaceChildren(el('div', { className: 'row-btns' }, b, sb), setup);
    return;
  }
  box.replaceChildren(
    el('div', { className: 'reveal-alg', textContent: a.alg }),
    el('div', { className: 'reveal-stats' },
      el('span', { textContent: `pokusů ${st.count}` }),
      el('span', { textContent: `nejlepší ${formatTime(st.best)}` }),
      el('span', { textContent: `ao5 ${formatTime(st.ao5)}` }),
      el('span', { textContent: `průměr ${formatTime(st.mean)}` })),
    setup);
}

function setupOf(a) {
  try { return labModel(a.task.puzzle ?? '333').invertAlg(a.alg); } catch { return '–'; }
}

function next() {
  currentId = pickNext();
  revealed = false;
  stopwatch.show(0);
  showCase();
}

function renderList() {
  const list = algs.list();
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
    return el('li', { className: 'alg-item' },
      cb,
      el('div', { className: 'alg-main' }, name,
        el('code', { textContent: `${a.task.puzzle && a.task.puzzle !== '333' ? `[${labModel(a.task.puzzle).P.name}] ` : ''}${a.alg}` }),
        el('small', { textContent: st.count ? `${st.count}× · nejlepší ${formatTime(st.best)} · průměr ${formatTime(st.mean)}` : 'zatím netrénováno' })),
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
      algs.update(a.id, { times: [...a.times, { t: ms, d: Date.now() }] });
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
  $('tr-all').onclick = () => {
    const all = algs.list().every((a) => a.enabled);
    for (const a of algs.list()) a.enabled = !all;
    algs.save();
  };
  algs.subscribe(() => {
    if (!$('tr-sheet').hidden) renderList();
    if (currentId && !algs.get(currentId)) currentId = null;
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
