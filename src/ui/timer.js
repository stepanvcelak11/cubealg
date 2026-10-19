// Stránka Timer: zamíchání pro disciplínu WCA, stopky, rychlé statistiky.

import { solved, applyAlg, toFacelets } from '../core/cube.js';
import { EVENTS, EVENT_BY_ID } from '../timer/events.js';
import { summary, formatValue, formatSolve } from '../timer/stats.js';
import { $, el, storage, iconButton } from './dom.js';
import { icon } from './icons.js';
import { solves } from './store.js';
import { Stopwatch } from './stopwatch.js';

const settings = storage.get('ergocube.timer') ?? { event: '333', inspection: false };
const saveSettings = () => storage.set('ergocube.timer', settings);

let worker = null;
let requestId = 0;
let current = '';
const pending = new Map();
let isActiveFn = () => false;

function requestScramble(event) {
  worker ??= new Worker(new URL('../timer/scramble-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => { pending.get(data.id)?.(data); pending.delete(data.id); };
  const id = ++requestId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ id, event });
  });
}

export function eventOptions(select, value) {
  select.replaceChildren(...EVENTS.map((e) => el('option', { value: e.id, textContent: e.name })));
  select.value = value;
}

async function newScramble() {
  const box = $('t-scramble');
  box.classList.add('loading');
  box.textContent = 'Míchám…';
  const event = settings.event;
  const res = await requestScramble(event);
  if (event !== settings.event) return;
  box.classList.remove('loading');
  current = res.scramble ?? '';
  box.textContent = res.error ? `Chyba: ${res.error}` : current;
  box.dataset.size = current.length > 300 ? 'xs' : current.length > 120 ? 's' : 'm';
  renderPreview();
}

// Náhled zamíchání 3×3 jako malá síť.
function renderPreview() {
  const box = $('t-preview');
  if (!EVENT_BY_ID[settings.event].preview || !current) { box.replaceChildren(); return; }
  let colors;
  try { colors = toFacelets(applyAlg(solved(), current)); } catch { box.replaceChildren(); return; }
  const NET = { U: [3, 0], L: [0, 3], F: [3, 3], R: [6, 3], B: [9, 3], D: [3, 6] };
  const faces = ['U', 'R', 'F', 'D', 'L', 'B'];
  let rects = '';
  for (const [cx, cy] of Object.values(NET)) rects += `<rect x="${cx * 10 - 0.5}" y="${cy * 10 - 0.5}" width="31" height="31" rx="2.5" class="face-bg"/>`;
  faces.forEach((f, fi) => {
    const [cx, cy] = NET[f];
    for (let i = 0; i < 9; i++) {
      const x = cx + (i % 3), y = cy + Math.floor(i / 3);
      rects += `<rect x="${x * 10 + 0.5}" y="${y * 10 + 0.5}" width="9" height="9" rx="1.5" style="fill:var(--c-${colors[fi * 9 + i]})"/>`;
    }
  });
  box.innerHTML = `<svg viewBox="0 0 120 90" role="img" aria-label="Náhled zamíchání">${rects}</svg>`;
}

function render() {
  const ev = EVENT_BY_ID[settings.event];
  const list = solves.list(settings.event);
  const s = summary(list);
  const fmt = (v) => formatValue(v, ev.result);
  const tile = (label, v) => el('div', {}, el('span', { textContent: label }), el('b', { textContent: fmt(v) }));
  $('t-mini').replaceChildren(
    tile('ao5', s.ao5.current), tile('ao12', s.ao12.current),
    tile('nejlepší', s.single.best), el('div', {}, el('span', { textContent: 'složení' }), el('b', { textContent: String(s.count) })));

  const last = list[list.length - 1];
  const box = $('t-last');
  if (!last) { box.replaceChildren(); return; }
  const idx = list.length - 1;
  const penalty = (p, text) => {
    const b = el('button', { type: 'button', className: `chip${last.p === p ? ' on' : ''}`, textContent: text });
    b.onclick = () => solves.update(settings.event, idx, { p: last.p === p ? 0 : p });
    return b;
  };
  box.replaceChildren(
    el('span', { className: 'last-time', textContent: formatSolve(last, ev.result) }),
    ev.result === 'time' ? penalty(2000, '+2') : null,
    penalty(-1, 'DNF'),
    iconButton(icon('trash', { size: 18 }), { label: 'Smazat poslední složení', className: 'chip', onClick: () => solves.remove(settings.event, idx) }));
}

function syncMode() {
  const fm = EVENT_BY_ID[settings.event].result === 'moves';
  $('t-fm').hidden = !fm;
  $('t-display').hidden = fm;
  $('t-hint').hidden = fm;
  const last = solves.list(settings.event).at(-1);
  stopwatch.show(last && !fm ? last.t : 0);
}

let stopwatch;

export function initTimer({ isActive }) {
  isActiveFn = isActive;
  eventOptions($('t-event'), settings.event);
  $('t-event').onchange = () => {
    settings.event = $('t-event').value;
    saveSettings();
    syncMode();
    render();
    newScramble();
    $('t-event').blur();
  };
  const insp = $('t-inspection');
  insp.setAttribute('aria-pressed', String(settings.inspection));
  insp.onclick = () => {
    settings.inspection = !settings.inspection;
    insp.setAttribute('aria-pressed', String(settings.inspection));
    saveSettings();
    insp.blur();
  };
  $('t-new').onclick = () => { newScramble(); $('t-new').blur(); };

  stopwatch = new Stopwatch({
    pad: $('t-pad'),
    display: $('t-display'),
    isActive: () => isActiveFn() && EVENT_BY_ID[settings.event].result === 'time',
    inspection: () => settings.inspection,
    onStop: (ms, p) => {
      solves.add(settings.event, { t: ms, p, s: current, d: Date.now() });
      newScramble();
    },
    onState: (s) => {
      $('t-hint').textContent = {
        idle: 'Podrž mezerník nebo prst, pusť pro start',
        holding: 'Drž…', ready: 'Pusť!', inspecting: 'Inspekce – podrž pro start', running: '',
      }[s];
    },
  });

  $('t-fm').onsubmit = (e) => {
    e.preventDefault();
    const n = Number($('t-fm-moves').value);
    if (!Number.isInteger(n) || n < 1) return;
    solves.add(settings.event, { t: n, p: 0, s: current, d: Date.now() });
    $('t-fm-moves').value = '';
    newScramble();
  };
  $('t-fm-dnf').onclick = () => {
    solves.add(settings.event, { t: 0, p: -1, s: current, d: Date.now() });
    newScramble();
  };

  solves.subscribe(render);
  syncMode();
  render();
  newScramble();
}

export function timerEvent() {
  return settings.event;
}
