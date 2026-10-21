// Simulace soutěžního kola v timeru: nastavení (cutoff, limit, cíl), průběh kola
// (pokusy, BPA/WPA, potřebný čas) a výsledek. Pokusy jsou obyčejná složení skupiny
// (penalizace se upravují jako jinde); kolo si pamatuje jejich časová razítka.
// Dokončená kola se ukládají (ergocube.rounds) a ukazují ve Statistikách.

import { formatOf, roundResult, bpaWpa, neededFor, roundOver, applyLimit } from '../timer/round.js';
import { formatTime, formatSolve } from '../timer/stats.js';
import { EVENT_BY_ID } from '../timer/events.js';
import { $, el, storage } from './dom.js';
import { solves } from './store.js';

const ROUNDS = 'ergocube.rounds';
const CURRENT = 'ergocube.round';
const OPTS = 'ergocube.round.opts';

let round = storage.get(CURRENT); // probíhající kolo {event, key, ds, cutoff, limit, target, d}
const saveRound = () => (round ? storage.set(CURRENT, round) : storage.remove(CURRENT));
const fmtOf = (r) => formatOf(r.event);
const sec = (ms) => (ms ? String(ms / 1000) : '');

/** Dokončená kola skupiny (nejnovější první). */
export function roundsOf(key) {
  return (storage.get(ROUNDS) ?? []).filter((r) => r.key === key).reverse();
}

/** Probíhající kolo pro skupinu (nebo null). */
export const activeRound = (key) => (round && (!key || round.key === key) ? round : null);

/** Pokusy kola (složení podle časových razítek; smazané chybí). */
function attemptsOf(r) {
  const list = solves.list(r.key);
  return r.ds.map((d) => list.find((s) => s.d === d)).filter(Boolean);
}

/** Penalizace pokusu (časový limit = DNF). */
export const roundPenalty = (ms, p) => (round ? applyLimit(ms, p, round.limit) : p);

/** Zapíše pokus (časové razítko uloženého složení); po posledním kolo vyhodnotí. */
export function recordAttempt(key, d) {
  if (!activeRound(key)) return;
  round.ds.push(d);
  saveRound();
  if (roundOver(attemptsOf(round), fmtOf(round), round.cutoff)) finish();
  else onChange();
}

/** Výsledek kola (pro panel i uložení). */
function resultOf(r) {
  const fmt = fmtOf(r);
  const attempts = attemptsOf(r);
  const res = roundResult(attempts, fmt);
  const cut = r.cutoff && attempts.length < fmt.n;
  return { fmt, attempts, ...res, cut, main: fmt.kind === 'bo3' ? res.best : cut ? NaN : res.average };
}

function finish() {
  const r = round;
  round = null;
  saveRound();
  const res = resultOf(r);
  const prev = roundsOf(r.key).map((x) => x.main).filter(Number.isFinite);
  const record = Number.isFinite(res.main) && (!prev.length || res.main < Math.min(...prev));
  const all = storage.get(ROUNDS) ?? [];
  // DNF (nekonečno) se do JSON uloží jako null
  const fin = (v) => (Number.isFinite(v) ? v : null);
  all.push({ event: r.event, key: r.key, d: Date.now(), kind: res.fmt.kind, main: fin(res.main), best: fin(res.best), values: res.values.map(fin), cut: res.cut, target: r.target ?? null });
  storage.set(ROUNDS, all);
  onChange();
  showResult(r, res, record);
}

let onChange = () => {};
let startNext = () => {};

/** Ukončí kolo předčasně (pokusy zůstanou ve složeních). */
export function endRound() {
  round = null;
  saveRound();
  onChange();
}

/** Panel probíhajícího kola v timeru. */
export function renderRound(key) {
  const box = $('t-round');
  const r = activeRound(key);
  document.body.toggleAttribute('data-comp', !!r);
  $('t-comp').setAttribute('aria-pressed', String(!!r));
  if (!r) { box.hidden = true; return; }
  box.hidden = false;
  const res = resultOf(r);
  const { fmt, attempts } = res;
  const chips = Array.from({ length: fmt.n }, (_, i) => {
    const a = attempts[i];
    return el('span', { className: `round-chip${a ? '' : ' empty'}${i === attempts.length ? ' next' : ''}`, textContent: a ? formatSolve(a) : String(i + 1) });
  });
  let info = `Pokus ${Math.min(attempts.length + 1, fmt.n)} z ${fmt.n}`;
  if (r.cutoff && attempts.length < r.cutoff.attempts) info += ` · cutoff: aspoň 1 z ${r.cutoff.attempts} pod ${formatTime(r.cutoff.time)}`;
  if (r.limit) info += ` · limit ${formatTime(r.limit)}`;
  let extra = null;
  if (fmt.kind === 'ao5' && attempts.length === 4) {
    const { bpa, wpa } = bpaWpa(attempts);
    const parts = [`BPA ${formatTime(bpa)}`, `WPA ${formatTime(wpa)}`];
    if (r.target) {
      const need = neededFor(r.target, attempts);
      parts.push(need === null ? `cíl ${formatTime(r.target)} už nejde` : need === 0 ? `cíl ${formatTime(r.target)} máš jistý` : `na ${formatTime(r.target)} potřebuješ ${formatTime(Math.floor(need / 10) * 10)}`);
    }
    extra = el('div', { className: 'round-extra', textContent: parts.join(' · ') });
  }
  box.replaceChildren(
    el('div', { className: 'round-head' },
      el('b', { textContent: `Soutěž · ${EVENT_BY_ID[r.event].name} · ${fmt.label}` }),
      Object.assign(el('button', { type: 'button', className: 'chip', textContent: 'Ukončit' }), {
        onclick: () => { if (confirm('Ukončit kolo? Dokončené pokusy zůstanou ve složeních.')) endRound(); },
      })),
    el('div', { className: 'round-chips' }, ...chips),
    el('div', { className: 'round-info', textContent: info }),
    ...(extra ? [extra] : []));
}

/** Dialog: nastavení nového kola. */
export function openRoundSetup(event, key) {
  const fmt = formatOf(event);
  if (!fmt) { alert('Simulace soutěže je jen pro disciplíny na čas (ne FMC a multi naslepo).'); return; }
  const saved = (storage.get(OPTS) ?? {})[event] ?? {};
  const num = (value, ph) => el('input', { type: 'number', min: '0', step: '0.01', inputMode: 'decimal', value, placeholder: ph });
  const cutN = el('select', {}, ...[['0', 'bez cutoffu'], ['1', '1 pokus'], ['2', '2 pokusy']].map(([v, t]) => el('option', { value: v, textContent: t })));
  cutN.value = String(saved.cutoff?.attempts ?? 0);
  const cutT = num(sec(saved.cutoff?.time), 's');
  const limit = num(sec(saved.limit), 's');
  const target = num(sec(saved.target), 's');
  const dlg = el('dialog', { className: 'help-dialog round-dialog' },
    el('h2', { textContent: `Soutěžní kolo · ${EVENT_BY_ID[event].name}` }),
    el('p', { className: 'hint', textContent: `${fmt.label} · povinná inspekce 15 s (15–17 s = +2, potom DNF). Pokusy se ukládají do zvolené skupiny jako běžná složení.` }),
    el('div', { className: 'grid-fields' },
      el('label', { className: 'field' }, 'Cutoff', cutN),
      el('label', { className: 'field' }, 'pod (s)', cutT),
      el('label', { className: 'field' }, 'Časový limit (s)', limit),
      el('label', { className: 'field' }, fmt.kind === 'bo3' ? 'Cíl – single (s)' : 'Cíl – průměr (s)', target)),
    el('form', { method: 'dialog', className: 'row-btns round-actions' },
      el('button', { className: 'secondary', value: 'cancel', textContent: 'Zrušit' }),
      el('button', { className: 'primary', value: 'start', textContent: 'Začít kolo' })));
  document.body.append(dlg);
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'start') {
      const ms = (input) => (Number(input.value) > 0 ? Math.round(Number(input.value) * 1000) : null);
      const cutoff = Number(cutN.value) && ms(cutT) ? { attempts: Number(cutN.value), time: ms(cutT) } : null;
      const opts = { cutoff, limit: ms(limit), target: ms(target) };
      storage.set(OPTS, { ...(storage.get(OPTS) ?? {}), [event]: opts });
      round = { event, key, ds: [], ...opts, d: Date.now() };
      saveRound();
      onChange();
    }
    dlg.remove();
  });
  dlg.showModal();
}

function showResult(r, res, record) {
  const f = (v) => formatTime(v);
  const label = res.fmt.kind === 'bo3' ? 'Nejlepší' : res.fmt.kind === 'mo3' ? 'Průměr (mean)' : 'Průměr';
  const trimmed = res.fmt.kind === 'ao5' && !res.cut;
  const sorted = [...res.values].sort((a, b) => a - b);
  const dropped = trimmed ? new Set([res.values.indexOf(sorted[0]), res.values.lastIndexOf(sorted[4])]) : new Set();
  const dlg = el('dialog', { className: 'help-dialog round-dialog round-result' },
    el('p', { className: 'round-kicker', textContent: `${EVENT_BY_ID[r.event].name} · ${res.fmt.label}` }),
    res.cut
      ? el('div', { className: 'round-big cut', textContent: 'Cutoff nesplněn' })
      : el('div', { className: 'round-big', textContent: f(res.main) }),
    el('p', { className: 'round-sub', textContent: res.cut ? `Nejlepší pokus ${f(res.best)}` : `${label}${res.fmt.kind !== 'bo3' ? ` · nejlepší ${f(res.best)}` : ''}` }),
    record ? el('p', { className: 'round-record', textContent: '🏆 Nejlepší kolo v této skupině!' }) : null,
    r.target && Number.isFinite(res.main) ? el('p', { className: res.main <= r.target ? 'ok' : 'ko', textContent: res.main <= r.target ? `Cíl ${f(r.target)} splněn` : `Cíl ${f(r.target)} nesplněn (o ${f(res.main - r.target)})` }) : null,
    el('div', { className: 'round-chips' }, ...res.attempts.map((a, i) => el('span', { className: 'round-chip', textContent: dropped.has(i) ? `(${formatSolve(a)})` : formatSolve(a) }))),
    el('form', { method: 'dialog', className: 'row-btns round-actions' },
      el('button', { className: 'secondary', value: 'close', textContent: 'Zavřít' }),
      el('button', { className: 'primary', value: 'again', textContent: 'Další kolo' })));
  document.body.append(dlg);
  dlg.addEventListener('close', () => { if (dlg.returnValue === 'again') startNext(); dlg.remove(); });
  dlg.showModal();
}

export function initRounds({ changed, again }) {
  onChange = changed;
  startNext = again;
}
