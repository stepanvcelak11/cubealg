// Stránka Statistiky: souhrn, graf vývoje a seznam složení.

import { EVENT_BY_ID } from '../timer/events.js';
import { summary, value, currentAverage, formatValue, formatSolve, DNF } from '../timer/stats.js';
import { $, el, iconButton } from './dom.js';
import { icon } from './icons.js';
import { solves, groups } from './store.js';
import { eventOptions, timerEvent, timerGroup, groupOptions, pickGroup } from './timer.js';

// Období, ze kterého se počítají statistiky (ms zpět, 0 = vše).
const RANGES = [['all', 'Vše', 0], ['day', 'Dnes', 0], ['week', '7 dní', 7 * 864e5], ['month', '30 dní', 30 * 864e5]];
let range = 'all';

let event = '333';
let group = 'main';
const key = () => groups.key(event, group);

function tiles(s, result) {
  const f = (v) => formatValue(v, result);
  if (result === 'multi') {
    return [
      el('div', { className: 'tile' }, el('span', { className: 'tile-label', textContent: 'Nejlepší' }), el('b', { textContent: f(s.single.best) })),
      el('div', { className: 'tile' }, el('span', { className: 'tile-label', textContent: 'Poslední' }), el('b', { textContent: f(s.single.current) })),
      el('div', { className: 'tile' }, el('span', { className: 'tile-label', textContent: 'Pokusů' }), el('b', { textContent: String(s.count) }),
        el('small', { textContent: s.dnf ? `${s.dnf} DNF` : '' })),
    ];
  }
  const tile = (label, cur, best) => el('div', { className: 'tile' },
    el('span', { className: 'tile-label', textContent: label }),
    el('b', { textContent: f(cur) }),
    best !== undefined ? el('small', { textContent: `nejlepší ${f(best)}` }) : null);
  return [
    tile('Single', s.single.current, s.single.best),
    tile(result === 'moves' ? 'mo3' : 'ao5', result === 'moves' ? s.mo3.current : s.ao5.current, result === 'moves' ? s.mo3.best : s.ao5.best),
    tile('ao12', s.ao12.current, s.ao12.best),
    tile('ao50', s.ao50.current, s.ao50.best),
    tile('ao100', s.ao100.current, s.ao100.best),
    el('div', { className: 'tile' },
      el('span', { className: 'tile-label', textContent: 'Průměr' }),
      el('b', { textContent: f(s.mean) }),
      el('small', { textContent: `${s.count} složení${s.dnf ? ` · ${s.dnf} DNF` : ''}` })),
  ];
}

// Graf: body = jednotlivé časy, čára = průběžný ao5 (u FMC mo3).
function chart(list, result) {
  const box = $('s-chart');
  if (result === 'multi') {
    box.replaceChildren(el('p', { className: 'hint', textContent: 'U Multi-Blind se graf nekreslí, výsledky jsou v seznamu.' }));
    return;
  }
  const pts = list.map(value);
  const finite = pts.filter((v) => v !== DNF);
  if (finite.length < 2) {
    box.replaceChildren(el('p', { className: 'hint', textContent: 'Graf se zobrazí po několika složeních.' }));
    return;
  }
  const W = Math.max(280, Math.round(box.clientWidth || 600)), H = 200, pad = 40;
  const max = Math.max(...finite), min = Math.min(...finite);
  const span = max - min || 1;
  const x = (i) => pad + (i / Math.max(1, pts.length - 1)) * (W - pad - 8);
  const y = (v) => 8 + (1 - (v - min) / span) * (H - 8 - pad);
  const dots = pts.map((v, i) => (v === DNF ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" class="dot"/>`)).join('');
  const n = result === 'moves' ? 3 : 5;
  const avg = [];
  for (let i = n; i <= list.length; i++) {
    const a = currentAverage(list.slice(0, i), n, { mean: result === 'moves' });
    if (Number.isFinite(a)) avg.push(`${x(i - 1).toFixed(1)},${y(a).toFixed(1)}`);
  }
  const line = avg.length > 1 ? `<polyline points="${avg.join(' ')}" class="avg"/>` : '';
  const label = (v) => formatValue(v, result);
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Graf vývoje časů">
    <line x1="${pad}" y1="${y(max)}" x2="${W - 8}" y2="${y(max)}" class="grid"/>
    <line x1="${pad}" y1="${y(min)}" x2="${W - 8}" y2="${y(min)}" class="grid"/>
    <text x="2" y="${y(max) + 4}" class="axis">${label(max)}</text>
    <text x="2" y="${y(min) + 4}" class="axis">${label(min)}</text>
    ${line}${dots}</svg>
    <div class="legend-row"><span><i class="dot-sw"></i>složení</span>${line ? `<span><i class="line-sw"></i>${result === 'moves' ? 'mo3' : 'ao5'}</span>` : ''}</div>`;
}

// Rozložení časů: sloupce po „hezkých“ intervalech (bez DNF).
function histogram(list, result) {
  const box = $('s-hist');
  const vals = list.map(value).filter((v) => v !== DNF);
  box.closest('article').hidden = result === 'multi';
  if (vals.length < 5) {
    box.replaceChildren(el('p', { className: 'hint', textContent: 'Rozložení se zobrazí po pěti složeních.' }));
    return;
  }
  const min = Math.min(...vals), max = Math.max(...vals);
  const steps = result === 'moves' ? [1, 2, 5, 10] : [100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000];
  const step = steps.find((st) => (max - min) / st <= 12) ?? steps.at(-1);
  const lo = Math.floor(min / step) * step;
  const bins = new Array(Math.floor((max - lo) / step) + 1).fill(0);
  for (const v of vals) bins[Math.floor((v - lo) / step)]++;
  const top = Math.max(...bins);
  const W = 100 / bins.length;
  const label = (v) => (result === 'moves' ? String(v) : formatValue(v, result).replace(/\.00$/, ''));
  box.innerHTML = `<div class="hist" role="img" aria-label="Rozložení časů">${bins.map((n, i) => `
    <div class="hist-col" style="width:${W}%" title="${label(lo + i * step)} – ${label(lo + (i + 1) * step)}: ${n}×">
      <span class="hist-n">${n || ''}</span><span class="hist-bar" style="height:${(n / top) * 100}%"></span>
      <span class="hist-x">${i % Math.ceil(bins.length / 6) === 0 ? label(lo + i * step) : ''}</span>
    </div>`).join('')}</div>`;
}

function inRange(solve) {
  const r = RANGES.find(([id]) => id === range);
  if (!r || r[0] === 'all') return true;
  if (r[0] === 'day') return new Date(solve.d).toDateString() === new Date().toDateString();
  return Date.now() - solve.d <= r[2];
}

function renderRanges() {
  $('s-range').replaceChildren(...RANGES.map(([id, label]) => {
    const b = el('button', { type: 'button', textContent: label, className: id === range ? 'active' : '' });
    b.onclick = () => { range = id; render(); };
    return b;
  }));
}

function render() {
  const ev = EVENT_BY_ID[event];
  if (!groups.get(event, group)) group = 'main';
  groupOptions($('s-group'), event, group);
  renderRanges();
  const all = solves.list(key());
  // indexy do celého seznamu (kvůli úpravám), statistiky jen ze zvoleného období
  const shown = all.map((solve, i) => ({ solve, i })).filter(({ solve }) => inRange(solve));
  const list = shown.map(({ solve }) => solve);
  $('s-tiles').replaceChildren(...tiles(summary(list), ev.result));
  chart(list, ev.result);
  histogram(list, ev.result);
  const date = (d) => new Date(d).toLocaleString('cs', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  $('s-list').replaceChildren(...shown.map(({ solve, i }, n) => {
    const penalty = (p, text) => {
      const b = el('button', { type: 'button', className: `chip${solve.p === p ? ' on' : ''}`, textContent: text });
      b.onclick = () => solves.update(key(), i, { p: solve.p === p ? 0 : p });
      return b;
    };
    const note = () => {
      const text = prompt('Poznámka ke složení:', solve.n ?? '');
      if (text !== null) solves.update(key(), i, { n: text.trim() || undefined });
    };
    return el('li', { className: 'solve' },
      el('span', { className: 'solve-n', textContent: `${n + 1}.` }),
      el('b', { className: 'solve-time', textContent: formatSolve(solve, ev.result) }),
      el('button', { type: 'button', className: 'solve-meta', title: 'Poznámka ke složení', onclick: note },
        el('span', { textContent: date(solve.d) }),
        solve.n ? el('span', { className: 'solve-note', textContent: solve.n }) : null,
        el('span', { className: 'solve-scramble', textContent: solve.s ?? '' })),
      el('span', { className: 'solve-actions' },
        ev.result === 'time' ? penalty(2000, '+2') : null,
        penalty(-1, 'DNF'),
        iconButton(icon('trash', { size: 16 }), { label: 'Smazat', className: 'chip', onClick: () => solves.remove(key(), i) })));
  }).reverse());
  if (!list.length) $('s-list').replaceChildren(el('li', { className: 'hint', textContent: all.length ? 'V tomto období žádná složení.' : 'Zatím žádná složení.' }));
}

export function initStats() {
  event = timerEvent();
  group = timerGroup();
  eventOptions($('s-event'), event);
  $('s-event').onchange = () => { event = $('s-event').value; group = 'main'; render(); };
  $('s-group').onchange = () => { group = pickGroup($('s-group'), event, group); render(); };
  $('s-clear').onclick = () => {
    const name = `${EVENT_BY_ID[event].name} – ${groups.get(event, group)?.name}`;
    if (solves.list(key()).length && confirm(`Smazat všechna složení ${name}?`)) solves.clear(key());
  };
  solves.subscribe(render);
  render();
}

/** Při otevření stránky ukáže disciplínu, která je právě v timeru. */
export function showStats() {
  event = timerEvent();
  group = timerGroup();
  $('s-event').value = event;
  render();
}
