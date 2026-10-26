// Stránka Timer: zamíchání pro disciplínu WCA, stopky, rychlé statistiky.

import { EVENTS, EVENT_BY_ID } from '../timer/events.js';
import { summary, formatValue, formatSolve, formatClock } from '../timer/stats.js';
import { $, el, storage, iconButton } from './dom.js';
import { icon } from './icons.js';
import { solves, groups, methods, guides, algs } from './store.js';
import { buildPlan } from '../sim/plan.js';
import { stepConfig } from './stepcfg.js';
import { hasGroupCells } from '../core/cells.js';
import { Stopwatch } from './stopwatch.js';
import { renderPreview } from './preview.js';
import { partsBefore, describeParts } from './parts.js';
import { showGuide } from './methods.js';
import { activeRound, recordAttempt, roundPenalty, renderRound, openRoundSetup, initRounds, endRound } from './compround.js';
import { smartCube } from '../smartcube/index.js';
import { mergeQuarters, packMoves } from '../smartcube/recon.js';
import { applyAlg, solved as solvedCube } from '../core/cube.js';
import { reconOf, reconView, recordAlgSteps } from './recon.js';
import { openMetronome } from './metronome.js';

const settings = storage.get('ergocube.timer') ?? { event: '333', inspection: false };
settings.groups ??= {};
const saveSettings = () => storage.set('ergocube.timer', settings);
const key = () => groups.key(settings.event, timerGroup()) + stepSuffix(timerPractice());

// --- Nácvik kroku metody ------------------------------------------------------------
// Kroky průvodce aktivní metody (CFOP i vlastní): timer zamíchá tak, že dílky, které
// složí předchozí kroky (výběr „Po kroku je hotovo“ v průvodci, jinak cíl obrázku
// z Labu), jsou hotové. Časy nácviku se ukládají zvlášť.

const PRACTICE_EVENTS = new Set(['333', '333oh']);
export const stepSuffix = (step) => (step ? `~${step}` : '');

/** Kroky průvodce aktivní metody (jen když jde nácvik pro disciplínu). */
export function practiceSteps(event = settings.event) {
  return PRACTICE_EVENTS.has(event) ? guides.get().steps : [];
}

/** Právě nacvičovaný krok (id) nebo null. */
export function timerPractice() {
  const id = settings.practice?.[methods.active()];
  return id && practiceSteps().some((st) => st.id === id) ? id : null;
}

/** Dílky hotové před krokem (název → styl): co složí předchozí kroky. */
export function stepFixed(stepId) {
  return partsBefore(guides.get().steps, stepId);
}

/**
 * Plán předchozích kroků pro nácvik, když některý z nich má pravidla pro skupiny dílků
 * (kříž z kterýchkoli hran, separace…): zamíchání pak vznikne složením náhodného stavu
 * podle těchto kroků (scramble-worker). Jinak stačí pevné dílky (null).
 */
function practicePlan(stepId) {
  const guide = guides.get();
  const end = guide.steps.findIndex((st) => st.id === stepId);
  const before = guide.steps.slice(0, Math.max(0, end));
  if (!before.some((st) => st.rules?.length || hasGroupCells(st.cells))) return null;
  const method = methods.active();
  // na kvalitě řešení tu nezáleží – krátké hledání
  const config = Object.fromEntries(before.map((st) => [st.id, { ...stepConfig(method, st), time: 0.15 }]));
  try {
    return buildPlan({ guide: { ...guide, steps: before }, config, setAlgs: (id) => algs.list().filter((a) => a.set === id) }).plan;
  } catch { return null; }
}

let refreshPractice = () => {};

/** Přepne timer na nácvik kroku aktivní metody (z průvodce). */
export function practiceStep(stepId) {
  if (!PRACTICE_EVENTS.has(settings.event)) settings.event = '333';
  settings.practice = { ...settings.practice, [methods.active()]: stepId };
  saveSettings();
  refreshPractice();
}

/** Naplní select kroků (celé složení + kroky). */
export function stepOptions(select, value, steps) {
  select.replaceChildren(el('option', { value: '', textContent: 'Celé složení' }),
    ...steps.map((st, i) => el('option', { value: st.id, textContent: `Nácvik: ${i + 1}. ${st.title || `krok ${i + 1}`}` })));
  select.value = value ?? '';
  select.hidden = !steps.length;
}

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
  select.replaceChildren(...[
    ...list.map((g) => el('option', { value: g.id, textContent: g.name })),
    el('option', { value: '+new', textContent: '+ Nová skupina…' }),
    value !== 'main' ? el('option', { value: '+rename', textContent: 'Přejmenovat skupinu…' }) : null,
    value !== 'main' ? el('option', { value: '+delete', textContent: 'Smazat skupinu…' }) : null,
  ].filter(Boolean));
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
  const step = timerPractice();
  const res = await requestScramble(event, { count: settings.mbfCount ?? 3, fixed: step ? stepFixed(step) : null, plan: step ? practicePlan(step) : null });
  if (event !== settings.event || step !== timerPractice()) return;
  box.classList.remove('loading');
  current = res.scramble ?? '';
  box.textContent = res.error ? `Chyba: ${res.error}` : current;
  box.dataset.size = current.length > 300 ? 'xs' : current.length > 120 ? 's' : 'm';
  updatePreview();
  if (stopwatch) cubeReset();
}

function updatePreview() {
  renderPreview($('t-preview'), settings.event, current);
}

function render() {
  renderRound(key());
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
  if (!last) { box.replaceChildren(); $('t-recon').replaceChildren(); return; }
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
  // rozbor posledního složení z chytré kostky (po krocích metody)
  // (metoda bez kroků → aspoň rada, kde je nastavit)
  const recon = last.r ? reconView(reconOf(last)) : null;
  $('t-recon').replaceChildren(...[recon ?? (last.r && settings.event === '333' ? el('p', { className: 'hint', textContent: 'Rozbor složení po krocích: aktivní metoda nemá kroky, nebo se jí složení nedalo rozdělit (Metoda → Sestavit, třeba šablona CFOP).' }) : null)].filter(Boolean));
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

// --- chytrá kostka: timer se spustí a zastaví sám --------------------------------------------
// zamíchej podle zamíchání (aplikace pozná, že sedí), první tah spustí čas (s inspekcí ji
// spustí už zamíchání), složení ho zastaví; čas podle hodin kostky, tahy se uloží
const cube = { phase: 'off', moves: [], recon: null };
const cubeEvents = () => ['333', '333oh'].includes(settings.event) && !timerPractice() && isActiveFn();
const same = (a, b) => a.every((v, i) => v === b[i]);
function cubeHint() {
  if (!smartCube.connected || !['333', '333oh'].includes(settings.event)) return;
  const text = { scramble: 'Chytrá kostka: zamíchej podle zamíchání nahoře', ready: 'Zamícháno ✓ – první tah spustí čas', solving: '' }[cube.phase];
  if (text !== undefined && stopwatch.state !== 'running') $('t-hint').textContent = text;
}
function cubeReset() {
  cube.phase = smartCube.connected ? 'scramble' : 'off';
  cube.moves = [];
  checkScrambled();
  cubeHint();
}
function checkScrambled() {
  if (!smartCube.connected || cube.phase !== 'scramble' || !current) return;
  let target;
  try { target = applyAlg(solvedCube(), current); } catch { return; }
  if (same(smartCube.state, target)) {
    cube.phase = 'ready';
    if (settings.inspection && stopwatch.state === 'idle') stopwatch.startInspection();
  }
}
function initCubeTimer() {
  smartCube.on('status', cubeReset);
  smartCube.on('state', () => { if (cube.phase === 'scramble') { checkScrambled(); cubeHint(); } });
  smartCube.on('move', ({ move, t, state }) => {
    if (!cubeEvents()) return;
    if (cube.phase === 'scramble') { checkScrambled(); cubeHint(); return; }
    if (cube.phase === 'ready') {
      cube.phase = 'solving';
      cube.moves = [];
      stopwatch.startAt(t);
    }
    if (cube.phase !== 'solving') return;
    cube.moves.push({ move, t });
    if (same(state, solvedCube())) {
      const merged = mergeQuarters(cube.moves);
      cube.recon = packMoves(merged);
      cube.phase = 'scramble';
      stopwatch.stopAt(t);
    }
  });
  cubeReset();
}

export function initTimer({ isActive }) {
  isActiveFn = isActive;
  eventOptions($('t-event'), settings.event);
  $('t-event').onchange = () => {
    settings.event = $('t-event').value;
    saveSettings();
    renderSteps();
    lastStep = timerPractice();
    groupOptions($('t-group'), settings.event, timerGroup());
    syncMode();
    render();
    newScramble();
    $('t-event').blur();
  };
  const renderSteps = () => {
    const steps = practiceSteps();
    stepOptions($('t-step'), timerPractice(), steps);
    $('t-practice').hidden = !PRACTICE_EVENTS.has(settings.event);
    $('t-parts-new').hidden = !!steps.length;
    const step = timerPractice();
    const i = steps.findIndex((x) => x.id === step);
    const info = $('t-step-info');
    info.hidden = !step;
    document.body.toggleAttribute('data-practice', !!step);
    if (step) {
      const before = describeParts(stepFixed(step));
      const byRules = i > 0 && steps.slice(0, i).some((st) => st.rules?.length || hasGroupCells(st.cells));
      info.textContent = i === 0 ? 'od zamíchané kostky' : byRules ? `předem: kroky 1–${i} složené podle metody` : before === 'nic' ? 'nastav dílky předchozích kroků' : `předem: ${before}`;
      info.classList.toggle('warn', i > 0 && !byRules && before === 'nic');
    }
  };
  renderSteps();
  $('t-parts-new').onclick = () => showGuide({ edit: true });
  $('t-step-info').onclick = () => showGuide({ edit: true });
  refreshPractice = () => {
    eventOptions($('t-event'), settings.event);
    groupOptions($('t-group'), settings.event, timerGroup());
    renderSteps();
    lastStep = timerPractice();
    syncMode();
    render();
    newScramble();
  };
  $('t-step').onchange = () => {
    settings.practice = { ...settings.practice, [methods.active()]: $('t-step').value || null };
    saveSettings();
    render();
    newScramble();
    $('t-step').blur();
  };
  let lastStep = timerPractice();
  let lastFixed = JSON.stringify(lastStep ? stepFixed(lastStep) : null);
  const stepsChanged = () => {
    renderSteps();
    const fixed = JSON.stringify(timerPractice() ? stepFixed(timerPractice()) : null);
    if (timerPractice() !== lastStep) { lastStep = timerPractice(); render(); }
    else if (fixed === lastFixed) return;
    lastFixed = fixed;
    newScramble();
  };
  guides.subscribe(stepsChanged);
  methods.subscribe(stepsChanged);
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
  $('t-metronome').onclick = () => { $('t-metronome').blur(); openMetronome(); };
  initRounds({ changed: render, again: () => openRoundSetup(settings.event, key()) });
  $('t-comp').onclick = () => {
    $('t-comp').blur();
    if (activeRound(key())) {
      if (confirm('Ukončit soutěžní kolo? Dokončené pokusy zůstanou ve složeních.')) endRound();
      return;
    }
    openRoundSetup(settings.event, key());
  };

  stopwatch = new Stopwatch({
    pad: $('t-pad'),
    display: $('t-display'),
    isActive: () => isActiveFn() && EVENT_BY_ID[settings.event].result === 'time',
    inspection: () => settings.inspection || !!activeRound(key()),
    voice: () => !!settings.voice,
    onStop: (ms, p) => {
      // Multi-Blind: čas se jen předvyplní, výsledek se doplní ve formuláři
      if (EVENT_BY_ID[settings.event].result === 'multi') {
        $('t-mbf-time').value = formatClock(ms);
        $('t-mbf-solved').focus();
        return;
      }
      const d = Date.now();
      const comp = activeRound(key());
      // chytrá kostka: tahy složení s časy (rozbor po krocích metody)
      const r = cube.recon;
      cube.recon = null;
      solves.add(key(), { t: ms, p: comp ? roundPenalty(ms, p) : p, s: current, d, ...(r ? { r } : {}) });
      if (r) recordAlgSteps({ s: current, r, d });
      if (comp) recordAttempt(key(), d);
      newScramble();
    },
    onState: (s) => {
      $('t-hint').textContent = {
        idle: 'Podrž mezerník nebo prst, pusť pro start',
        holding: 'Drž…', ready: 'Pusť!', inspecting: 'Inspekce – podrž pro start', running: '',
      }[s];
      if (s === 'idle' || s === 'inspecting') cubeHint();
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

  initCubeTimer();
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
