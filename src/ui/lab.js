// Lab: zadání vlastního případu dvěma kostkami, povolené tahy a váhy,
// hledání ergonomických řešení a jejich přehrávání.
//
// Zadání po dílcích:
//   Cíl     – klepnutí na dílek ho označí (aktuálním stylem) a vybere;
//             styl vybraného dílku se mění tlačítky, znovu klepnutí = odebrat
//   Výchozí – klepnutí na místo přesune vybraný dílek tam; klepnutí na
//             vybraný dílek ho natočí; klepnutí na jiný dílek ho vybere

import { SLOTS, SLOT_OF, FACELETS } from '../core/geometry.js';
import { BASES, MOVE_DEFS, parseAlg, moveToString, algToString } from '../core/notation.js';
import { applyAlg, solved } from '../core/cube.js';
import { ROTATIONS } from '../core/rotations.js';
import { compileGoal } from '../core/constraints.js';
import { MoveSet, MOVESET_PRESETS, AMOUNTS } from '../core/moveset.js';
import {
  EMPTY, blankColors, homeColors, moveColors, identifyPieces, buildStart, trackedPieces,
  placePiece, twistAt, removePiece, findPiece, pieceAt,
} from '../core/task.js';
import { scoreAlg } from '../ergonomics/score.js';
import { DEFAULT_CONFIG, DEFAULT_MOVE_WEIGHTS, moveWeight } from '../ergonomics/weights.js';
import { buildTriggers } from '../ergonomics/triggers.js';
import { SearchClient } from '../search/client.js';
import { $, el, storage, iconButton } from './dom.js';
import { icon } from './icons.js';
import { algs } from './store.js';
import { Cube3D } from './cube3d.js';
import { STYLE_OF, stickersOf } from './cubeview.js';

const STYLES = [
  { type: 'solved', label: 'Plná', title: 'Místo i natočení' },
  { type: 'permutation', label: 'Čárkovaná', title: 'Jen místo (permutace)' },
  { type: 'orientation', label: 'Tečkovaná', title: 'Jen natočení (orientace)' },
];
const AMOUNT_LABELS = { 1: 'po směru', [-1]: "proti (')", 2: 'dvojitě (2)' };
const SHOWN_RESULTS = 150;
const CENTERS = SLOTS.filter((s) => s.type === 'center').map((s) => s.name);

const saved = storage.get('ergocube.v3') ?? {};
const ui = {
  constraints: saved.constraints ?? Object.fromEntries(SLOTS.map((s) => [s.name, s.type === 'center' ? 'solved' : 'ignore'])),
  colorsA: saved.colorsA ?? homeColors(CENTERS),
  bases: saved.bases ?? MOVESET_PRESETS.RUF.bases,
  amounts: saved.amounts ?? AMOUNTS,
  style: 'solved',
  selected: null,   // vybraný dílek (název)
  undo: [],
  results: new Map(),
  chosen: null,     // algoritmus v přehrávači
  step: 0,
  playing: false,
  ergo: loadErgo(),
  sub: 'task',
};
const triggers = buildTriggers();
const client = new SearchClient();
let cubeA, cubeB, cubeP;
let onSubChange = () => {};

function save() {
  const { constraints, colorsA, bases, amounts } = ui;
  storage.set('ergocube.v3', { constraints, colorsA, bases, amounts });
}

function loadErgo() {
  const s = storage.get('ergocube.ergo') ?? {};
  return { ...DEFAULT_CONFIG, ...s, moveWeights: { ...DEFAULT_MOVE_WEIGHTS, ...(s.moveWeights ?? {}) } };
}
const score = (alg) => scoreAlg(alg, { ...ui.ergo, triggers });

function snapshot() {
  ui.undo.push({ constraints: { ...ui.constraints }, colorsA: [...ui.colorsA] });
  if (ui.undo.length > 60) ui.undo.shift();
}

const isMarked = (name) => (ui.constraints[name] ?? 'ignore') !== 'ignore';

// --- Pod-záložky -------------------------------------------------------------------

export function showSub(name) {
  ui.sub = name;
  for (const s of document.querySelectorAll('.sub')) s.hidden = s.dataset.sub !== name;
  for (const b of document.querySelectorAll('.segmented button')) b.classList.toggle('active', b.dataset.sub === name);
  if (name === 'task') { cubeA.layout(); cubeB.layout(); }
  if (name === 'results') { cubeP.layout(); renderPlayer(); }
  onSubChange(name);
}

export function labSub() {
  return ui.sub;
}

// --- Zadání -------------------------------------------------------------------------

function tapB(pos) {
  const piece = SLOTS[SLOT_OF[pos]].name;
  snapshot();
  if (!isMarked(piece)) {
    ui.constraints[piece] = ui.style;
    // Nový dílek se objeví ve výchozí kostce na svém místě (je-li volné).
    if (!findPiece(ui.colorsA, piece)) {
      const home = SLOTS.find((s) => s.name === piece);
      if (home.facelets.every((f) => ui.colorsA[f] === EMPTY)) ui.colorsA = placePiece(ui.colorsA, piece, piece);
    }
    ui.selected = piece;
  } else if (ui.selected === piece) {
    ui.constraints[piece] = 'ignore';
    ui.colorsA = removePiece(ui.colorsA, piece);
    ui.selected = null;
  } else {
    ui.selected = piece;
    ui.style = ui.constraints[piece];
  }
  taskChanged();
}

function tapA(pos) {
  const slot = SLOTS[SLOT_OF[pos]];
  const occupant = pieceAt(ui.colorsA, slot.name);
  const sel = ui.selected && isMarked(ui.selected) ? SLOTS.find((s) => s.name === ui.selected) : null;
  if (occupant && occupant === sel?.name) {
    // klepnutí na vybraný dílek = natočit
    if (slot.type === 'center') return;
    snapshot();
    ui.colorsA = twistAt(ui.colorsA, slot.name);
  } else if (occupant) {
    // klepnutí na jiný dílek = vybrat ho
    ui.selected = occupant;
    if (isMarked(occupant)) ui.style = ui.constraints[occupant];
  } else if (sel && sel.type === slot.type) {
    // klepnutí na prázdné místo = přesunout tam vybraný dílek
    snapshot();
    ui.colorsA = placePiece(ui.colorsA, sel.name, slot.name);
  } else {
    return;
  }
  taskChanged();
}

function renderStyles() {
  $('styles').replaceChildren(...STYLES.map(({ type, label, title }) => {
    const b = el('button', { type: 'button', className: 'style-btn', title },
      el('i', { className: `sw ${STYLE_OF[type]}` }), el('span', { textContent: label }));
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(ui.style === type));
    b.onclick = () => {
      ui.style = type;
      if (ui.selected && isMarked(ui.selected) && ui.constraints[ui.selected] !== type) {
        snapshot();
        ui.constraints[ui.selected] = type;
        taskChanged();
      } else {
        renderStyles();
      }
    };
    return b;
  }));
}

function renderCubes() {
  const { pieces } = identifyPieces(ui.colorsA);
  const pieceAtSlot = new Map([...pieces].map(([name, p]) => [p.slot, name]));
  cubeA.render(ui.colorsA.map((color, pos) => {
    if (color === EMPTY) return { color, style: 'none' };
    const name = pieceAtSlot.get(SLOT_OF[pos]);
    return { color, style: STYLE_OF[ui.constraints[name]] ?? 'faded', selected: !!name && name === ui.selected };
  }));
  cubeB.render(FACELETS.map((f) => {
    const name = SLOTS[SLOT_OF[f.index]].name;
    return { color: f.face, style: STYLE_OF[ui.constraints[name]] ?? 'none', selected: name === ui.selected };
  }));
}

function taskInfo() {
  return { tracked: trackedPieces(ui.constraints), ...buildStart(ui.colorsA, ui.constraints) };
}

function renderTaskStatus() {
  const { tracked, errors } = taskInfo();
  const pieces = tracked.filter((n) => !CENTERS.includes(n));
  let node;
  if (ui.selected && isMarked(ui.selected)) {
    node = el('span', {}, el('b', { textContent: ui.selected }),
      ' – ve výchozí kostce: prázdné místo = přesunout, dílek samotný = natočit.');
  } else if (!pieces.length) {
    node = el('span', { className: 'warn', textContent: 'Klepni v cíli na dílky, které se mají vyřešit.' });
  } else if (errors.length) {
    node = el('span', { className: 'bad', textContent: errors[0] + (errors.length > 1 ? ` (+${errors.length - 1})` : '') });
  } else {
    node = el('span', { className: 'good', textContent: `✓ ${pieces.length} dílků: ${pieces.join(' ')}` });
  }
  $('task-status').replaceChildren(node);
  $('b-remove').disabled = !(ui.selected && isMarked(ui.selected));
}

function taskChanged() {
  save();
  renderStyles();
  renderCubes();
  renderTaskStatus();
  clearResults();
}

// --- Tahy a váhy -----------------------------------------------------------------------

function renderMoveSet() {
  const sel = $('moveset-preset');
  sel.replaceChildren(...Object.entries(MOVESET_PRESETS).map(([id, p]) => el('option', { value: id, textContent: p.label })),
    el('option', { value: 'custom', textContent: 'Vlastní' }));
  const match = Object.entries(MOVESET_PRESETS).find(([, p]) => [...p.bases].sort().join() === [...ui.bases].sort().join());
  sel.value = match ? match[0] : 'custom';
  const bases = $('bases');
  bases.replaceChildren(...BASES.map((b) => {
    const cb = el('input', { type: 'checkbox', value: b, checked: ui.bases.includes(b) });
    cb.onchange = () => { sel.value = 'custom'; moveSetChanged(); };
    return el('label', { title: MOVE_DEFS[b].kind }, cb, b);
  }));
  $('amounts').replaceChildren(...AMOUNTS.map((a) => {
    const cb = el('input', { type: 'checkbox', value: String(a), checked: ui.amounts.includes(a) });
    cb.onchange = moveSetChanged;
    return el('label', {}, cb, AMOUNT_LABELS[a]);
  }));
  sel.onchange = () => {
    if (sel.value === 'custom') return;
    const chosen = MOVESET_PRESETS[sel.value].bases;
    for (const cb of bases.querySelectorAll('input')) cb.checked = chosen.includes(cb.value);
    moveSetChanged();
  };
}

const currentMoveSet = () => new MoveSet({ bases: ui.bases, amounts: ui.amounts });

function moveSetChanged() {
  const checked = (id) => [...$(id).querySelectorAll('input:checked')].map((c) => c.value);
  ui.bases = checked('bases');
  ui.amounts = checked('amounts').map(Number);
  save();
  clearResults();
}

const ERGO_FIELDS = [
  ['rotationPenalty', 'Rotace x/y/z (za ¼)', 0.5],
  ['regripPenalty', 'Přehmat zápěstí', 0.1],
  ['gripChangePenalty', 'Změna úchopu', 0.1],
  ['triggerBonusScale', 'Násobič bonusů triggerů', 0.1],
  ['maxWristTurn', 'Max. ¼ zápěstím bez přehmatu', 1],
];

function renderErgo() {
  $('ergo-main').replaceChildren(...ERGO_FIELDS.map(([key, label, step]) => {
    const input = el('input', { type: 'number', step: String(step), min: '0', value: String(ui.ergo[key]) });
    input.onchange = () => {
      const v = Number(input.value);
      if (Number.isFinite(v) && v >= 0) { ui.ergo[key] = v; ergoChanged(); }
    };
    return el('label', { className: 'field' }, label, input);
  }));
  $('ergo-moves').replaceChildren(...BASES.filter((b) => MOVE_DEFS[b].kind !== 'rotation').map((b) => {
    const inputs = [0, 1, 2].map((i) => {
      const input = el('input', { type: 'number', step: '0.1', min: '0', value: String(ui.ergo.moveWeights[b][i]) });
      input.ariaLabel = `${b} ${['po směru', 'proti', 'dvojitě'][i]}`;
      input.onchange = () => {
        const v = Number(input.value);
        if (!Number.isFinite(v) || v < 0) return;
        const w = [...ui.ergo.moveWeights[b]];
        w[i] = v;
        ui.ergo.moveWeights = { ...ui.ergo.moveWeights, [b]: w };
        ergoChanged();
      };
      return input;
    });
    return el('div', { className: 'ergo-move' }, el('b', { textContent: b }), ...inputs);
  }));
}

function ergoChanged() {
  storage.set('ergocube.ergo', ui.ergo);
  for (const alg of ui.results.keys()) ui.results.set(alg, score(alg));
  renderResults();
  renderPlayer();
}

// --- Hledání --------------------------------------------------------------------------

function clearResults() {
  if (client.running) client.cancel();
  ui.results.clear();
  ui.chosen = null;
  searchUi(false);
  $('status').textContent = '';
  renderResults();
  renderPlayer();
}

function searchUi(running) {
  $('search').disabled = running;
  $('stop').disabled = !running;
}

const num = (id, min, max) => Math.min(max, Math.max(min, Math.round(Number($(id).value) || min)));

function startSearch() {
  const { tracked, loc, errors } = taskInfo();
  if (errors.length || !loc) { $('status').textContent = `Zadání není v pořádku: ${errors[0]}`; return; }
  if (!tracked.some((n) => !CENTERS.includes(n))) { $('status').textContent = 'V cíli není označený žádný dílek.'; return; }
  const moveSet = currentMoveSet();
  if (!moveSet.moves().length) { $('status').textContent = 'Nejsou povolené žádné tahy (Tahy a váhy).'; return; }
  clearResults();
  const opts = {
    maxLength: num('opt-max', 1, 20),
    extraDepth: num('opt-extra', 0, 6),
    maxResults: num('opt-results', 1, 5000),
    timeLimit: num('opt-time', 1, 300) * 1000,
  };
  searchUi(true);
  $('status').textContent = 'Spouštím…';
  let pending = false;
  const scheduleRender = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; renderResults(); });
  };
  client.start({ start: loc, target: solved(), constraints: ui.constraints, moves: moveSet.moves(), options: opts, ergonomics: ui.ergo }, {
    onProgress: (p) => {
      $('status').textContent = p.phase === 'tables'
        ? `Připravuji heuristiku ${p.table}/${p.tables}…`
        : `Hloubka ${p.depth} · ${p.nodes.toLocaleString('cs')} uzlů · nalezeno ${p.found} · ${(p.elapsed / 1000).toFixed(1)} s`;
    },
    onSolutions: (items) => {
      for (const { alg } of items) ui.results.set(alg, score(alg));
      scheduleRender();
    },
    onDone: (d) => {
      searchUi(false);
      const why = {
        done: 'Hotovo', time: 'Vypršel časový limit', results: 'Dosažen max. počet výsledků',
        'not-found': `Do ${opts.maxLength} tahů nic nenalezeno`,
        unsolvable: 'S povolenými tahy to vyřešit nejde',
        'already-solved': 'Výchozí stav už cíl splňuje',
      }[d.reason] ?? d.reason;
      $('status').textContent = `${why} · ${d.found} řešení${d.optimal ? ` · nejkratší ${d.optimal} tahů` : ''} · ${(d.elapsed / 1000).toFixed(1)} s`;
      renderResults();
      if (!ui.chosen && ui.results.size) choose(sortedResults()[0].alg, false);
    },
    onError: (e) => { searchUi(false); $('status').textContent = `Chyba: ${e.message}`; },
  });
}

function sortedResults() {
  const list = [...ui.results].map(([alg, s]) => ({ alg, score: s }));
  const byLength = $('sort').value === 'length';
  return list.sort((a, b) => (byLength
    ? a.score.metrics.htm - b.score.metrics.htm || a.score.total - b.score.total
    : a.score.total - b.score.total || a.score.metrics.htm - b.score.metrics.htm));
}

function moveClass(m) {
  if (MOVE_DEFS[m.base].kind === 'rotation') return 'rot';
  const w = moveWeight(m, ui.ergo);
  return w <= 1.25 ? 'easy' : w <= 2 ? 'mid' : 'hard';
}

function movesView(alg, s, { current = -1, onStep, moveSet } = {}) {
  const moves = parseAlg(alg);
  const trig = new Set();
  for (const t of s.triggers) for (let i = t.start; i < t.start + t.length; i++) trig.add(i);
  return el('div', { className: 'moves' }, ...moves.map((m, i) => {
    const cls = ['mv', moveClass(m), trig.has(i) && 'trig', i === current && 'current', moveSet && !moveSet.allows(m) && 'bad']
      .filter(Boolean).join(' ');
    if (!onStep) return el('span', { className: cls, textContent: moveToString(m) });
    const b = el('button', { type: 'button', className: cls, textContent: moveToString(m) });
    b.onclick = () => onStep(i + 1);
    return b;
  }));
}

function bar(b) {
  const parts = [['b-moves', b.moves], ['b-rot', b.rotations], ['b-regrip', b.regrips], ['b-grip', b.gripChanges]];
  const total = parts.reduce((a, [, v]) => a + v, 0) || 1;
  return el('span', { className: 'bar', title: 'Tahy / rotace / přehmaty / úchopy' },
    ...parts.filter(([, v]) => v > 0).map(([cls, v]) => {
      const s = el('span', { className: cls });
      s.style.width = `${(v / total) * 100}%`;
      return s;
    }));
}

const taskSnapshot = () => ({ colorsA: [...ui.colorsA], constraints: { ...ui.constraints } });
const savedFor = (alg) => algs.find(alg, taskSnapshot());

function toggleSave(alg) {
  const existing = savedFor(alg);
  if (existing) algs.remove(existing.id);
  else algs.add({ alg, task: taskSnapshot() });
}

function renderResults() {
  const list = sortedResults();
  $('results').replaceChildren(...list.slice(0, SHOWN_RESULTS).map(({ alg, score: s }, i) => {
    const isSaved = !!savedFor(alg);
    const row = el('div', { className: `result${alg === ui.chosen ? ' selected' : ''}`, role: 'button', tabIndex: 0 },
      el('span', { className: 'rank', textContent: `${i + 1}.` }),
      movesView(alg, s),
      el('span', { className: 'total', textContent: s.total.toFixed(1) }),
      el('span', { className: 'meta' },
        `${s.metrics.htm} tahů`,
        bar(s.breakdown),
        s.triggers.length ? `✦ ${s.triggers.map((t) => t.name).join(', ')}` : null,
        s.breakdown.rotations ? 'rotace' : null));
    const save = iconButton(icon(isSaved ? 'bookmarked' : 'bookmark', { size: 18 }), {
      label: isSaved ? 'Odebrat z trenažéru' : 'Uložit do trenažéru',
      className: `icon-btn save${isSaved ? ' on' : ''}`,
      onClick: (e) => { e.stopPropagation(); toggleSave(alg); },
    });
    row.append(save);
    row.onclick = () => choose(alg, true);
    row.onkeydown = (e) => { if (e.key === 'Enter') choose(alg, true); };
    return el('li', {}, row);
  }));
  $('results-more').textContent = list.length > SHOWN_RESULTS ? `Zobrazeno ${SHOWN_RESULTS} z ${list.length}.` : '';
  const count = $('results-count');
  count.hidden = !list.length;
  count.textContent = String(list.length);
}

// --- Přehrávač ------------------------------------------------------------------------

function choose(alg, scroll) {
  ui.chosen = alg;
  ui.step = 0;
  $('alg').value = alg;
  stopPlaying();
  renderResults();
  renderPlayer();
  if (scroll && window.matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function playerMoves() {
  try { return ui.chosen ? parseAlg(ui.chosen) : []; } catch { return null; }
}

function renderPlayer() {
  const { loc, errors } = taskInfo();
  const detail = $('detail');
  const saveBtn = $('p-save');
  const moves = playerMoves();
  saveBtn.hidden = !loc || !moves?.length;
  if (!loc) {
    cubeP.render(new Array(54).fill({ color: EMPTY, style: 'none' }));
    detail.replaceChildren(el('p', { className: 'hint', textContent: errors[0] ?? 'Zadání není kompletní.' }));
    return;
  }
  if (moves === null) {
    cubeP.render(stickersOf(loc, ui.constraints));
    detail.replaceChildren(el('p', { className: 'ko', textContent: 'Algoritmus nejde přečíst.' }));
    return;
  }
  ui.step = Math.min(Math.max(0, ui.step), moves.length);
  cubeP.render(stickersOf(applyAlg(loc, moves.slice(0, ui.step)), ui.constraints));
  if (!moves.length) {
    detail.replaceChildren(el('p', { className: 'hint', textContent: 'Vyber řešení ze seznamu nebo napiš vlastní algoritmus.' }));
    return;
  }
  const isSaved = !!savedFor(algToString(moves));
  saveBtn.innerHTML = icon(isSaved ? 'bookmarked' : 'bookmark', { size: 20 });
  saveBtn.classList.toggle('on', isSaved);

  const moveSet = currentMoveSet();
  const goal = compileGoal(ui.constraints);
  const end = applyAlg(loc, moves);
  const exact = goal.test(end);
  const rotated = !exact && ROTATIONS.some((r) => goal.test(applyAlg(end, r)));
  const illegal = moveSet.check(moves);
  const s = score(moves);
  const b = s.breakdown;
  const row = (color, label, value) => el('tr', {},
    el('td', {}, color ? Object.assign(el('i'), { style: `background:${color}` }) : null, label),
    el('td', { textContent: value }));

  detail.replaceChildren(
    movesView(algToString(moves), s, { current: ui.step - 1, onStep: (i) => { ui.step = i; stopPlaying(); renderPlayer(); }, moveSet }),
    el('div', { className: 'verdict' },
      el('span', { className: exact || rotated ? 'ok' : 'ko', textContent: exact ? '✓ řeší zadání' : rotated ? '✓ řeší zadání (po otočení kostky)' : `✗ neřeší zadání (${goal.violations(end)} porušení)` }),
      illegal.length ? el('span', { className: 'ko', textContent: ` · nepovolené tahy: ${illegal.join(' ')}` }) : null),
    el('div', {}, el('span', { className: 'score-big', textContent: s.total.toFixed(1) }), el('span', { className: 'hint', textContent: '  nepohodlnost (nižší = lepší)' })),
    el('table', { className: 'breakdown' },
      row('#7d8fb3', 'Váha tahů', b.moves.toFixed(2)),
      row('var(--bad)', 'Rotace', b.rotations.toFixed(2)),
      row('var(--warn)', 'Přehmaty zápěstí', b.regrips.toFixed(2)),
      row('#b07cc6', 'Změny úchopu', b.gripChanges.toFixed(2)),
      row('var(--good)', `Triggery${s.triggers.length ? ` (${s.triggers.map((t) => t.name).join(', ')})` : ''}`, b.triggerBonus.toFixed(2)),
      row(null, 'HTM / QTM / STM', `${s.metrics.htm} / ${s.metrics.qtm} / ${s.metrics.stm}`)),
  );
}

async function step(delta) {
  const moves = playerMoves();
  if (!moves || !moves.length) return false;
  const target = ui.step + delta;
  if (target < 0 || target > moves.length) return false;
  if (delta > 0) {
    await cubeP.animate(moves[ui.step]);
  } else {
    const prev = moves[ui.step - 1];
    await cubeP.animate({ base: prev.base, amount: prev.amount === 2 ? 2 : -prev.amount });
  }
  ui.step = target;
  renderPlayer();
  return true;
}

function stopPlaying() {
  ui.playing = false;
  $('p-play').innerHTML = icon('play', { size: 20 });
}

// --- Inicializace ----------------------------------------------------------------------

export function initLab({ onSub } = {}) {
  onSubChange = onSub ?? onSubChange;
  cubeA = new Cube3D($('cube-a'), { label: 'Výchozí stav', onSticker: tapA, fill: true });
  cubeB = new Cube3D($('cube-b'), { label: 'Cíl', onSticker: tapB, fill: true });
  cubeP = new Cube3D($('cube-p'), { label: 'Přehrávač' });

  for (const b of document.querySelectorAll('.segmented button')) b.onclick = () => showSub(b.dataset.sub);
  $('a-view').onclick = () => cubeA.resetView();
  $('b-view').onclick = () => cubeB.resetView();

  $('a-apply').onclick = () => {
    const text = $('a-moves').value.trim();
    if (!text) return;
    try {
      const moves = parseAlg(text);
      snapshot();
      ui.colorsA = moveColors(ui.colorsA, moves);
      $('a-moves').value = '';
      $('a-moves').blur();
      taskChanged();
    } catch (e) {
      $('task-status').replaceChildren(el('span', { className: 'bad', textContent: e.message }));
    }
  };
  $('a-moves').onkeydown = (e) => { if (e.key === 'Enter') $('a-apply').click(); };
  $('a-home').onclick = () => { snapshot(); ui.colorsA = homeColors(trackedPieces(ui.constraints)); taskChanged(); };
  $('a-clear').onclick = () => { snapshot(); ui.colorsA = blankColors(); taskChanged(); };
  $('b-remove').onclick = () => {
    if (!ui.selected || !isMarked(ui.selected)) return;
    snapshot();
    ui.colorsA = removePiece(ui.colorsA, ui.selected);
    ui.constraints[ui.selected] = 'ignore';
    ui.selected = null;
    taskChanged();
  };
  $('b-clear').onclick = () => {
    snapshot();
    for (const k of Object.keys(ui.constraints)) ui.constraints[k] = 'ignore';
    ui.colorsA = blankColors();
    ui.selected = null;
    taskChanged();
  };
  $('undo').onclick = () => {
    const last = ui.undo.pop();
    if (!last) return;
    ui.constraints = last.constraints;
    ui.colorsA = last.colorsA;
    taskChanged();
  };
  $('help').onclick = () => $('help-dialog').showModal();
  $('go-search').onclick = () => { showSub('results'); startSearch(); };

  $('search').onclick = startSearch;
  $('stop').onclick = () => {
    client.cancel();
    searchUi(false);
    $('status').textContent += ' · zastaveno';
    renderResults();
  };
  $('sort').onchange = () => renderResults();
  $('ergo-reset').onclick = () => {
    ui.ergo = { ...DEFAULT_CONFIG, moveWeights: { ...DEFAULT_MOVE_WEIGHTS } };
    renderErgo();
    ergoChanged();
  };

  $('alg').oninput = () => {
    ui.chosen = $('alg').value.trim() || null;
    ui.step = 0;
    stopPlaying();
    renderResults();
    renderPlayer();
  };
  $('p-first').onclick = () => { stopPlaying(); ui.step = 0; renderPlayer(); };
  $('p-last').onclick = () => { stopPlaying(); ui.step = Infinity; renderPlayer(); };
  $('p-back').onclick = () => { stopPlaying(); step(-1); };
  $('p-fwd').onclick = () => { stopPlaying(); step(1); };
  $('p-save').onclick = () => {
    const moves = playerMoves();
    if (moves?.length) toggleSave(algToString(moves));
  };
  $('p-play').onclick = async () => {
    if (ui.playing) { stopPlaying(); return; }
    const moves = playerMoves();
    if (!moves?.length) return;
    if (ui.step >= moves.length) { ui.step = 0; renderPlayer(); await new Promise((r) => setTimeout(r, 250)); }
    ui.playing = true;
    $('p-play').innerHTML = icon('pause', { size: 20 });
    while (ui.playing && await step(1)) { /* další tah */ }
    stopPlaying();
  };
  algs.subscribe(() => { renderResults(); renderPlayer(); });

  stopPlaying();
  renderStyles();
  renderMoveSet();
  renderErgo();
  renderCubes();
  renderTaskStatus();
  renderResults();
  renderPlayer();
}

export function showLab() {
  showSub(ui.sub);
}
