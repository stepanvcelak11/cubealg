// Stránka Statistiky: souhrn, graf vývoje a seznam složení.

import { EVENT_BY_ID } from '../timer/events.js';
import { summary, value, currentAverage, formatValue, formatSolve, DNF } from '../timer/stats.js';
import { $, el, iconButton } from './dom.js';
import { icon } from './icons.js';
import { solves } from './store.js';
import { eventOptions, timerEvent } from './timer.js';

let event = '333';

function tiles(s, result) {
  const f = (v) => formatValue(v, result);
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
      el('span', { className: 'tile-label', textContent: 'Průměr / počet' }),
      el('b', { textContent: f(s.mean) }),
      el('small', { textContent: `${s.count} složení${s.dnf ? `, ${s.dnf}× DNF` : ''}` })),
  ];
}

// Graf: body = jednotlivé časy, čára = průběžný ao5 (u FMC mo3).
function chart(list, result) {
  const box = $('s-chart');
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
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Graf vývoje časů">
    <line x1="${pad}" y1="${y(max)}" x2="${W - 8}" y2="${y(max)}" class="grid"/>
    <line x1="${pad}" y1="${y(min)}" x2="${W - 8}" y2="${y(min)}" class="grid"/>
    <text x="2" y="${y(max) + 4}" class="axis">${label(max)}</text>
    <text x="2" y="${y(min) + 4}" class="axis">${label(min)}</text>
    ${line}${dots}</svg>
    <div class="legend-row"><span><i class="dot-sw"></i>složení</span>${line ? `<span><i class="line-sw"></i>${result === 'moves' ? 'mo3' : 'ao5'}</span>` : ''}</div>`;
}

function render() {
  const ev = EVENT_BY_ID[event];
  const list = solves.list(event);
  $('s-tiles').replaceChildren(...tiles(summary(list), ev.result));
  chart(list, ev.result);
  const date = (d) => new Date(d).toLocaleString('cs', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  $('s-list').replaceChildren(...list.map((solve, i) => {
    const penalty = (p, text) => {
      const b = el('button', { type: 'button', className: `chip${solve.p === p ? ' on' : ''}`, textContent: text });
      b.onclick = () => solves.update(event, i, { p: solve.p === p ? 0 : p });
      return b;
    };
    return el('li', { className: 'solve' },
      el('span', { className: 'solve-n', textContent: `${i + 1}.` }),
      el('b', { className: 'solve-time', textContent: formatSolve(solve, ev.result) }),
      el('span', { className: 'solve-meta' },
        el('span', { textContent: date(solve.d) }),
        el('span', { className: 'solve-scramble', textContent: solve.s ?? '' })),
      el('span', { className: 'solve-actions' },
        ev.result === 'time' ? penalty(2000, '+2') : null,
        penalty(-1, 'DNF'),
        iconButton(icon('trash', { size: 16 }), { label: 'Smazat', className: 'chip', onClick: () => solves.remove(event, i) })));
  }).reverse());
  if (!list.length) $('s-list').replaceChildren(el('li', { className: 'hint', textContent: 'Zatím žádná složení.' }));
}

export function initStats() {
  event = timerEvent();
  eventOptions($('s-event'), event);
  $('s-event').onchange = () => { event = $('s-event').value; render(); };
  $('s-clear').onclick = () => {
    const name = EVENT_BY_ID[event].name;
    if (solves.list(event).length && confirm(`Smazat všechna složení ${name}?`)) solves.clear(event);
  };
  solves.subscribe(render);
  render();
}

/** Při otevření stránky ukáže disciplínu, která je právě v timeru. */
export function showStats() {
  event = timerEvent();
  $('s-event').value = event;
  render();
}
