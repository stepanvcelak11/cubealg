// Stránka Timer: zamíchání pro disciplínu WCA, stopky, rychlé statistiky.

import { solved, applyAlg, toFacelets } from '../core/cube.js';
import { EVENTS, EVENT_BY_ID } from '../timer/events.js';
import { summary, formatValue, formatSolve, formatClock } from '../timer/stats.js';
import { $, el, storage, iconButton } from './dom.js';
import { icon } from './icons.js';
import { solves, groups } from './store.js';
import { Stopwatch } from './stopwatch.js';

const settings = storage.get('ergocube.timer') ?? { event: '333', inspection: false };
settings.groups ??= {};
const saveSettings = () => storage.set('ergocube.timer', settings);
const key = () => groups.key(settings.event, timerGroup());

let worker = null;
let requestId = 0;
let current = '';
const pending = new Map();
let isActiveFn = () => false;

function requestScramble(event, opts) {
  worker ??= new Worker(new URL('../timer/scramble-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => { pending.get(data.id)?.(data); pending.delete(data.id); };
  const id = ++requestId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ id, event, opts });
  });
}

/** „12:34“ nebo „1:02:03“ → ms (NaN, když to nejde přečíst). */
function parseClock(text) {
  const parts = String(text).trim().split(':').map(Number);
  if (!parts.length || parts.length > 3 || parts.some((x) => !Number.isFinite(x) || x < 0)) return NaN;
  return parts.reduce((acc, x) => acc * 60 + x, 0) * 1000;
}

export function eventOptions(select, value) {
  select.replaceChildren(...EVENTS.map((e) => el('option', { value: e.id, textContent: e.name })));
  select.value = value;
}

/** Naplní select skupin disciplíny; poslední volby jsou akce (nová / přejmenovat / smazat). */
export function groupOptions(select, event, value) {
  const list = groups.list(event);
  select.replaceChildren(
    ...list.map((g) => el('option', { value: g.id, textContent: g.name })),
    el('option', { value: '+new', textContent: '+ Nová skupina…' }),
    value !== 'main' ? el('option', { value: '+rename', textContent: 'Přejmenovat skupinu…' }) : null,
    value !== 'main' ? el('option', { value: '+delete', textContent: 'Smazat skupinu…' }) : null);
  select.value = groups.get(event, value) ? value : 'main';
}

/**
 * Zpracuje výběr ve selectu skupin. Vrací id skupiny, která má být aktivní.
 */
export function pickGroup(select, event, current) {
  const v = select.value;
  if (v === '+new') {
    const name = prompt('Název nové skupiny (např. název kostky):', '')?.trim();
    return name ? groups.add(event, name) : current;
  }
  if (v === '+rename') {
    const name = prompt('Nový název skupiny:', groups.get(event, current)?.name ?? '')?.trim();
    if (name) groups.rename(event, current, name);
    return current;
  }
  if (v === '+delete') {
    const g = groups.get(event, current);
    const n = solves.list(groups.key(event, current)).length;
    return g && confirm(`Smazat skupinu „${g.name}“${n ? ` a jejích ${n} složení` : ''}?`) ? (groups.remove(event, current), 'main') : current;
  }
  return v;
}

export function timerGroup() {
  const id = settings.groups[settings.event] ?? 'main';
  return groups.get(settings.event, id) ? id : 'main';
}

async function newScramble() {
  const box = $('t-scramble');
  box.classList.add('loading');
  box.textContent = 'Míchám…';
  const event = settings.event;
  const res = await requestScramble(event, { count: settings.mbfCount ?? 3 });
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
  const list = solves.list(key());
  const s = summary(list);
  const fmt = (v) => formatValue(v, ev.result);
  const tile = (label, v) => el('div', {}, el('span', { textContent: label }), el('b', { textContent: fmt(v) }));
  const count = el('div', {}, el('span', { textContent: 'složení' }), el('b', { textContent: String(s.count) }));
  $('t-mini').replaceChildren(...(ev.result === 'multi'
    ? [tile('poslední', s.single.current), tile('nejlepší', s.single.best), count]
    : [tile('ao5', s.ao5.current), tile('ao12', s.ao12.current), tile('nejlepší', s.single.best), count]));

  const last = list[list.length - 1];
  const box = $('t-last');
  if (!last) { box.replaceChildren(); return; }
  const idx = list.length - 1;
  const penalty = (p, text) => {
    const b = el('button', { type: 'button', className: `chip${last.p === p ? ' on' : ''}`, textContent: text });
    b.onclick = () => solves.update(key(), idx, { p: last.p === p ? 0 : p });
    return b;
  };
  box.replaceChildren(
    el('span', { className: 'last-time', textContent: formatSolve(last, ev.result) }),
    ev.result === 'time' ? penalty(2000, '+2') : null,
    penalty(-1, 'DNF'),
    iconButton(icon('edit', { size: 18 }), {
      label: 'Poznámka k poslednímu složení',
      className: `chip${last.n ? ' on' : ''}`,
      onClick: () => {
        const text = prompt('Poznámka ke složení:', last.n ?? '');
        if (text !== null) solves.update(key(), idx, { n: text.trim() || undefined });
      },
    }),
    iconButton(icon('trash', { size: 18 }), { label: 'Smazat poslední složení', className: 'chip', onClick: () => solves.remove(key(), idx) }));
}

function syncMode() {
  const result = EVENT_BY_ID[settings.event].result;
  const fm = result === 'moves';
  $('t-fm').hidden = !fm;
  $('t-mbf').hidden = result !== 'multi';
  $('t-mbf-count').value = String(settings.mbfCount ?? 3);
  $('t-display').hidden = fm;
  $('t-hint').hidden = fm;
  const last = solves.list(key()).at(-1);
  stopwatch.show(last && !fm ? last.t : 0);
}

let stopwatch;

export function initTimer({ isActive }) {
  isActiveFn = isActive;
  eventOptions($('t-event'), settings.event);
  $('t-event').onchange = () => {
    settings.event = $('t-event').value;
    saveSettings();
    groupOptions($('t-group'), settings.event, timerGroup());
    syncMode();
    render();
    newScramble();
    $('t-event').blur();
  };
  groupOptions($('t-group'), settings.event, timerGroup());
  $('t-group').onchange = () => {
    settings.groups[settings.event] = pickGroup($('t-group'), settings.event, timerGroup());
    saveSettings();
    groupOptions($('t-group'), settings.event, timerGroup());
    syncMode();
    render();
    $('t-group').blur();
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
    voice: () => !!settings.voice,
    onStop: (ms, p) => {
      // Multi-Blind: čas se jen předvyplní, výsledek se doplní ve formuláři
      if (EVENT_BY_ID[settings.event].result === 'multi') {
        $('t-mbf-time').value = formatClock(ms);
        $('t-mbf-solved').focus();
        return;
      }
      solves.add(key(), { t: ms, p, s: current, d: Date.now() });
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
    solves.add(key(), { t: n, p: 0, s: current, d: Date.now() });
    $('t-fm-moves').value = '';
    newScramble();
  };
  $('t-mbf-count').onchange = () => {
    const n = Math.round(Number($('t-mbf-count').value));
    if (n >= 2 && n <= 60) { settings.mbfCount = n; saveSettings(); newScramble(); }
  };
  $('t-mbf').onsubmit = (e) => {
    e.preventDefault();
    const attempted = Math.round(Number($('t-mbf-count').value));
    const solved = Math.round(Number($('t-mbf-solved').value));
    const ms = parseClock($('t-mbf-time').value);
    if (!(attempted >= 2) || !(solved >= 0 && solved <= attempted) || !Number.isFinite(ms)) {
      $('t-hint').hidden = false;
      $('t-hint').textContent = 'Zadej počet vyřešených (0–počet kostek) a čas jako m:ss.';
      return;
    }
    solves.add(key(), { t: ms, p: 0, s: current, d: Date.now(), m: { solved, attempted } });
    $('t-mbf-solved').value = '';
    $('t-mbf-time').value = '';
    $('t-mbf-solved').blur();
    newScramble();
  };
  $('t-fm-dnf').onclick = () => {
    solves.add(key(), { t: 0, p: -1, s: current, d: Date.now() });
    newScramble();
  };

  solves.subscribe(() => { groupOptions($('t-group'), settings.event, timerGroup()); render(); });
  syncMode();
  render();
  newScramble();
}

/** Volby timeru pro dialog nastavení (čtení, případně změna). */
export function timerOptions(patch) {
  if (patch) { Object.assign(settings, patch); saveSettings(); }
  return { voice: !!settings.voice };
}

export function timerEvent() {
  return settings.event;
}
