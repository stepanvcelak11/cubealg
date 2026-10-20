// Lab: zadání vlastního případu dvěma hlavolamy (výchozí stav a cíl), povolené
// tahy a váhy, hledání ergonomických řešení a jejich přehrávání.
// Hlavolamy: 3×3, 2×2, Pyraminx, Skewb, Square-1 (každý má své uložené zadání).
//
// Zadání:
//   Obě strany se vybarvují po nálepkách barvou z palety (dílek s jednou
//   chybějící nálepkou se doplní, je-li to jednoznačné). Cíl navíc určuje styl
//   každého dílku: plná = místo i natočení, čárkovaná = jen místo, tečkovaná =
//   jen natočení. Se zvoleným stylem (bez barvy) klepnutí na dílek změní jeho
//   styl, prázdné místo vyplní dílkem, který tam patří.

import { AMOUNTS } from '../core/moveset.js';
import { trackedPieces } from '../core/task.js';
import { PUZZLES } from '../puzzles/index.js';
import { scoreFor, defaultErgo, moveDifficulty, SQ1_DEFAULTS } from '../ergonomics/puzzles.js';
import { DEFAULT_CONFIG, DEFAULT_MOVE_WEIGHTS } from '../ergonomics/weights.js';
import { buildTriggers } from '../ergonomics/triggers.js';
import { calibrate, featureLabel } from '../ergonomics/calibrate.js';
import { SearchClient } from '../search/client.js';
import { $, el, storage, iconButton } from './dom.js';
import { icon } from './icons.js';
import { algs } from './store.js';
import { setOptions, pickSet } from './sets.js';
import { Cube3D } from './cube3d.js';
import { NetView } from './netview.js';
import { STYLE_OF } from './cubeview.js';
import { labModel } from './models.js';
import { holdOf, HOLDS } from '../core/hold.js';

const STYLES = [
  { type: 'solved', label: 'Plná', title: 'Místo i natočení' },
  { type: 'permutation', label: 'Čárkovaná', title: 'Jen místo (permutace)' },
  { type: 'orientation', label: 'Tečkovaná', title: 'Jen natočení (orientace)' },
];
const AMOUNT_LABELS = { 1: 'po směru', [-1]: "proti (')", 2: 'dvojitě (2)' };
const SQ1_AMOUNTS = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6];
const SQ1_PRESETS = {
  all: { label: 'Všechna otočení', top: SQ1_AMOUNTS, bottom: SQ1_AMOUNTS },
  small: { label: 'Do ±3', top: [-3, -2, -1, 1, 2, 3], bottom: [-3, -2, -1, 1, 2, 3] },
  cs: { label: '±1, ±3, 6', top: [-3, -1, 1, 3, 6], bottom: [-3, -1, 1, 3, 6] },
};

const storageKey = (id) => (id === '333' ? 'ergocube.v3' : `ergocube.lab.${id}`);
const ergoKey = (id) => (id === '333' ? 'ergocube.ergo' : `ergocube.ergo.${id}`);

let model = labModel(PUZZLES.some((p) => p.id === storage.get('ergocube.lab.puzzle')) ? storage.get('ergocube.lab.puzzle') : '333');
const ui = {
  constraints: {},
  A: null,          // výchozí strana (vybarvení)
  B: null,          // cíl
  bases: [],
  amounts: AMOUNTS,
  sq1: { top: SQ1_AMOUNTS, bottom: SQ1_AMOUNTS, shape: true },
  style: 'solved',  // styl nových dílků v cíli
  paint: { A: 'U', B: null }, // barva štětce (EMPTY = guma); u cíle null = nástroj styl
  lastPaint: -1,    // naposledy vybarvená nálepka (pos + 1000 u cíle)
  memory: {},       // pamatovaný styl dílků, které z cíle zmizely
  autoA: new Set(), // dílky, které do výchozí strany dala aplikace
  undo: [],
  results: new Map(),
  chosen: null,     // algoritmus v přehrávači
  step: 0,
  playing: false,
  ergo: null,
  hold: '',         // držení kostky (core/hold.js): algoritmy jsou psané podle natočení
  sub: 'task',
};
const triggers = buildTriggers();
const client = new SearchClient();
let cubeA, cubeB, cubeP;
let onSubChange = () => {};

const isMarked = (name) => (ui.constraints[name] ?? 'ignore') !== 'ignore';
const P = () => model.P;
const unit = () => (model.kind === 'sq1' ? 'řezů' : 'tahů');

// --- Uložení a načtení zadání ----------------------------------------------------------

function save() {
  const { constraints, bases, amounts, sq1, hold } = ui;
  storage.set(storageKey(model.id), {
    constraints, bases, amounts, sq1, hold, colorsA: model.serialize(ui.A), colorsB: model.serialize(ui.B),
  });
}

function load() {
  const saved = storage.get(storageKey(model.id)) ?? {};
  const names = model.pieceNames;
  ui.constraints = Object.fromEntries(names.map((n) => [n, saved.constraints?.[n] ?? (model.centers.includes(n) ? 'solved' : 'ignore')]));
  const tracked = trackedPieces(ui.constraints);
  ui.A = model.deserialize(saved.colorsA) ?? model.home(tracked);
  ui.B = model.deserialize(saved.colorsB) ?? model.home(tracked);
  if (model.kind === 'perm') {
    ui.bases = (saved.bases ?? P().defaultBases).filter((b) => P().bases.includes(b));
    ui.amounts = saved.amounts ?? AMOUNTS;
  }
  ui.sq1 = { top: SQ1_AMOUNTS, bottom: SQ1_AMOUNTS, shape: true, ...(saved.sq1 ?? {}) };
  ui.hold = model.holdable && HOLDS.includes(saved.hold) ? saved.hold : '';
  ui.memory = {};
  ui.autoA = new Set();
  ui.undo = [];
  ui.lastPaint = -1;
  ui.paint = { A: P().colors[0].face, B: null };
  const e = storage.get(ergoKey(model.id));
  const def = defaultErgo(P());
  ui.ergo = P().ergonomics === 'cube'
    ? { ...DEFAULT_CONFIG, ...e, moveWeights: { ...DEFAULT_MOVE_WEIGHTS, ...(e?.moveWeights ?? {}) } }
    : P().ergonomics === 'sq1' ? { ...def, ...e } : { weights: { ...def.weights, ...(e?.weights ?? {}) } };
}

// Držení: algoritmy v rozhraní jsou ve tvém rámci (U = stěna nahoře), model a hledání
// pracují v rámci modelu.
const held = () => holdOf(ui.hold);
const toModelSteps = (steps) => (ui.hold ? steps.map((m) => held().toModel([m])[0]) : steps);

const score = (alg) => scoreFor(P(), alg, P().ergonomics === 'cube' ? { ...ui.ergo, triggers } : ui.ergo);

function snapshot() {
  ui.undo.push({ constraints: { ...ui.constraints }, A: model.serialize(ui.A), B: model.serialize(ui.B) });
  if (ui.undo.length > 60) ui.undo.shift();
}

// --- Držení kostky ----------------------------------------------------------------------

function renderHoldNote() {
  const note = $('hold-note');
  note.hidden = !ui.hold;
  if (ui.hold) note.firstElementChild.textContent = `Držení: ${held().describe()} · algoritmy jsou psané podle něj`;
}

/** Nastaví držení (z natočení kostky nebo zrušení), přepíše výsledky a pohledy. */
function setHold(rot) {
  if (rot === ui.hold) { for (const c of [cubeA, cubeB, cubeP]) c.setHold?.(rot); return; }
  ui.hold = rot;
  save();
  for (const c of [cubeA, cubeB, cubeP]) c.setHold?.(rot);
  renderHoldNote();
  clearResults();
  renderPlayer();
}

// --- Pohledy -------------------------------------------------------------------------

// Plošná síť místo 3D (jen 3×3 a 2×2); volba se pamatuje.
let flat = !!storage.get('ergocube.lab.flat');
const currentView = () => (flat && model.flatView ? model.flatView : model.view);

function makeView(container, opts) {
  const v = currentView();
  return v.type === 'cube3d'
    ? new Cube3D(container, { ...opts, facelets: v.facelets, scale: v.scale })
    : new NetView(container, { ...opts, viewBox: v.viewBox, polys: v.polys });
}

function buildViews() {
  cubeA = makeView($('cube-a'), { label: 'Výchozí stav', onSticker: tapA, fill: true });
  cubeB = makeView($('cube-b'), { label: 'Cíl', onSticker: tapB, fill: true });
  cubeP = makeView($('cube-p'), { label: 'Přehrávač' });
  const is3d = currentView().type === 'cube3d';
  for (const c of [cubeA, cubeB, cubeP]) c.setHold?.(ui.hold);
  $('a-hold').hidden = !is3d || !model.holdable;
  $('b-hold').hidden = !is3d || !model.holdable;
  $('a-view').hidden = !is3d;
  $('b-view').hidden = !is3d;
  $('flat').hidden = !model.flatView;
  $('flat').setAttribute('aria-pressed', String(flat));
  $('flat').innerHTML = icon(flat ? 'cube3d' : 'net', { size: 22 });
}

function renderView(view, stickers, state) {
  view.render(stickers);
  if (model.overlay && view.setOverlay) view.setOverlay(model.overlay(state));
}

// --- Pod-záložky -----------------------------------------------------------------------

export function showSub(name) {
  ui.sub = name;
  for (const s of document.querySelectorAll('.sub')) s.hidden = s.dataset.sub !== name;
  for (const b of document.querySelectorAll('.segmented button[data-sub]')) b.classList.toggle('active', b.dataset.sub === name);
  if (name === 'task') { cubeA.layout(); cubeB.layout(); }
  if (name === 'results') { cubeP.layout(); renderPlayer(); }
  onSubChange(name);
}

export function labSub() {
  return ui.sub;
}

// --- Zadání -----------------------------------------------------------------------------

/**
 * Řeší se právě ty dílky, které jsou (celé) vybarvené v cíli; styl dílku,
 * který z cíle zmizí, se pamatuje pro případ, že se vrátí. Nový dílek v cíli
 * se objeví i ve výchozí straně na svém místě (je-li volné) a zase zmizí,
 * pokud ho tam dala aplikace a nikdo s ním nehnul.
 */
function syncTarget() {
  const inB = model.identify(ui.B).pieces;
  for (const name of model.pieceNames) {
    if (inB.has(name)) {
      if (!isMarked(name)) ui.constraints[name] = ui.memory[name] ?? ui.style;
      if (!model.findPiece(ui.A, name) && model.homeEmpty(ui.A, name)) {
        ui.A = model.placeHome(ui.A, name);
        ui.autoA.add(name);
      }
    } else if (isMarked(name)) {
      ui.memory[name] = ui.constraints[name];
      ui.constraints[name] = 'ignore';
      if (ui.autoA.has(name) && model.homeIs(ui.A, name)) ui.A = model.removePiece(ui.A, name);
      ui.autoA.delete(name);
    }
  }
}

function paint(side, pos) {
  const key = side === 'B' ? pos + 1000 : pos;
  const last = (ui.lastPaint >= 1000) === (side === 'B') ? ui.lastPaint % 1000 : -1;
  ui.lastPaint = key;
  if (side === 'B') { ui.B = model.paint(ui.B, pos, ui.paint.B, last); return; }
  const before = model.pieceAtSticker(ui.A, pos);
  ui.A = model.paint(ui.A, pos, ui.paint.A, last);
  ui.autoA.delete(before);
  // Dokončený dílek ve výchozí straně, který v cíli není, se v cíli objeví na svém místě.
  const after = model.pieceAtSticker(ui.A, pos);
  ui.autoA.delete(after);
  if (after && after !== before && !model.findPiece(ui.B, after) && model.homeEmpty(ui.B, after)) {
    ui.B = model.placeHome(ui.B, after);
  }
}

function tapA(pos) {
  snapshot();
  paint('A', pos);
  taskChanged();
}

function tapB(pos) {
  snapshot();
  if (ui.paint.B !== null) {
    paint('B', pos);
  } else {
    // nástroj styl: dílek dostane styl (stejný styl podruhé = odebrat),
    // prázdné místo se vyplní dílkem, který tam patří
    const piece = model.pieceAtSticker(ui.B, pos);
    const home = homePieceAt(pos);
    if (piece && ui.constraints[piece] === ui.style) {
      ui.B = model.removePiece(ui.B, piece);
    } else if (piece) {
      ui.constraints[piece] = ui.style;
    } else if (home && !model.findPiece(ui.B, home) && model.homeEmpty(ui.B, home)) {
      ui.B = model.placeHome(ui.B, home);
      ui.memory[home] = ui.style;
    } else {
      ui.undo.pop();
      return;
    }
  }
  taskChanged();
}

// Dílek, který na místo s nálepkou pos patří ve složeném stavu.
function homePieceAt(pos) {
  if (model.kind === 'perm') return P().slots[P().SLOT_OF[pos]].name;
  return model.pieceAtSticker(model.home(model.pieceNames), pos);
}

function renderPalette(side) {
  const colors = [...P().colors, { face: model.EMPTY, label: 'Guma' }];
  $(`palette-${side.toLowerCase()}`).replaceChildren(...colors.map(({ face, label, css }) => {
    const b = el('button', { type: 'button', className: `paint${face === model.EMPTY ? ' eraser' : ''}`, title: label, ariaLabel: label });
    if (face === model.EMPTY) b.innerHTML = icon('eraser', { size: 16 });
    else b.style.setProperty('--c', css);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(ui.paint[side] === face));
    b.onclick = () => {
      ui.paint[side] = face;
      renderPalette(side);
      if (side === 'B') renderStyles();
    };
    return b;
  }));
}

function renderStyles() {
  const styleTool = ui.paint.B === null;
  $('styles').classList.toggle('tool', styleTool);
  $('styles').replaceChildren(...STYLES.map(({ type, label, title }) => {
    const b = el('button', { type: 'button', className: 'style-btn', title },
      el('i', { className: `sw ${STYLE_OF[type]}` }), el('span', { textContent: label }));
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(ui.style === type));
    b.onclick = () => {
      // Opakované klepnutí na zvolený styl přepne na nástroj styl (klepání na dílky).
      if (ui.style === type || styleTool) ui.paint.B = null;
      ui.style = type;
      renderStyles();
      renderPalette('B');
      renderTaskStatus();
    };
    return b;
  }));
}

function renderCubes() {
  renderView(cubeA, model.stickers(ui.A, ui.constraints), ui.A.state);
  renderView(cubeB, model.stickers(ui.B, ui.constraints), ui.B.state);
}

function taskInfo() {
  const start = model.build(ui.A, ui.constraints, 'výchozí straně');
  const target = model.build(ui.B, ui.constraints, 'cílové straně');
  return {
    tracked: trackedPieces(ui.constraints),
    loc: start.loc && target.loc ? start.loc : null,
    target: target.loc,
    errors: [...start.errors.map((e) => `Výchozí: ${e}`), ...target.errors.map((e) => `Cíl: ${e}`)],
  };
}

function renderTaskStatus() {
  const { tracked, errors } = taskInfo();
  const pieces = tracked.filter((n) => !model.centers.includes(n));
  let node;
  if (!pieces.length) {
    node = el('span', { className: 'warn', textContent: 'Vybarvi na obou stranách dílky, které se mají vyřešit (nebo v cíli klepni stylem na dílek).' });
  } else if (errors.length) {
    node = el('span', { className: 'bad', textContent: errors[0] + (errors.length > 1 ? ` (+${errors.length - 1})` : '') });
  } else {
    node = el('span', { className: 'good', textContent: `✓ ${pieces.length} dílků: ${pieces.join(' ')}` });
  }
  $('task-status').replaceChildren(node);
}

function taskChanged() {
  syncTarget();
  save();
  renderStyles();
  renderCubes();
  renderTaskStatus();
  clearResults();
}

// Tahy na jedné straně zadání (tlačítka tvaru u Square-1).
function applyMoves(side, alg) {
  try {
    const next = model.applyMoves(side === 'A' ? ui.A : ui.B, alg);
    snapshot();
    if (side === 'A') ui.A = next; else ui.B = next;
    taskChanged();
  } catch (e) {
    $('task-status').replaceChildren(el('span', { className: 'bad', textContent: e.message }));
  }
}

// Square-1: tvar se nastavuje tlačítky (otočení vrstev o 30° a řez).
const SQ1_PAD = [['(1,0)', 'U ↻'], ['(-1,0)', 'U ↺'], ['/', '/'], ['(0,1)', 'D ↻'], ['(0,-1)', 'D ↺']];
function renderSq1Pads() {
  for (const side of ['A', 'B']) {
    const pad = $(`sq1-pad-${side.toLowerCase()}`);
    pad.hidden = model.kind !== 'sq1';
    pad.replaceChildren(...SQ1_PAD.map(([alg, label]) => {
      const b = el('button', { type: 'button', className: 'chip', textContent: label, title: alg === '/' ? 'Řez' : `Otočit ${alg}` });
      b.onclick = () => applyMoves(side, alg);
      return b;
    }));
  }
}

// Focení: stěna po stěně do vybarvení zvolené strany.
async function scan(side) {
  const { openScan } = await import('./scan.js');
  const spec = model.scan;
  openScan({
    spec,
    colors: P().colors,
    onFace: (face, grid) => {
      snapshot();
      const colors = [...(side === 'A' ? ui.A : ui.B)];
      spec.cells(face).indices.forEach((pos, i) => { colors[pos] = grid[i]; });
      if (side === 'A') ui.A = colors; else ui.B = colors;
      taskChanged();
    },
  });
}

// --- Tahy a váhy -----------------------------------------------------------------------

const same = (a, b) => [...a].map(String).sort().join() === [...b].map(String).sort().join();

function renderMoveSet() {
  const sel = $('moveset-preset');
  const chip = (value, label, checked, onchange, title) => {
    const cb = el('input', { type: 'checkbox', value: String(value), checked });
    cb.onchange = onchange;
    return el('label', { title: title ?? '' }, cb, label);
  };
  $('sq1-shape-row').hidden = model.kind !== 'sq1';
  if (model.kind === 'sq1') {
    sel.replaceChildren(...Object.entries(SQ1_PRESETS).map(([id, p]) => el('option', { value: id, textContent: p.label })),
      el('option', { value: 'custom', textContent: 'Vlastní' }));
    const match = Object.entries(SQ1_PRESETS).find(([, p]) => same(p.top, ui.sq1.top) && same(p.bottom, ui.sq1.bottom));
    sel.value = match ? match[0] : 'custom';
    const changed = () => { sel.value = 'custom'; moveSetChanged(); };
    $('bases').replaceChildren(el('b', { className: 'chips-label', textContent: 'Nahoře' }),
      ...SQ1_AMOUNTS.map((a) => chip(a, String(a), ui.sq1.top.includes(a), changed)));
    $('amounts').replaceChildren(el('b', { className: 'chips-label', textContent: 'Dole' }),
      ...SQ1_AMOUNTS.map((a) => chip(a, String(a), ui.sq1.bottom.includes(a), changed)));
    $('sq1-shape').checked = ui.sq1.shape;
    sel.onchange = () => {
      if (sel.value === 'custom') return;
      const p = SQ1_PRESETS[sel.value];
      ui.sq1 = { ...ui.sq1, top: p.top, bottom: p.bottom };
      renderMoveSet();
      moveSetChanged(false);
    };
    return;
  }
  const presets = P().presets;
  sel.replaceChildren(...Object.entries(presets).map(([id, p]) => el('option', { value: id, textContent: p.label })),
    el('option', { value: 'custom', textContent: 'Vlastní' }));
  const match = Object.entries(presets).find(([, p]) => same(p.bases, ui.bases));
  sel.value = match ? match[0] : 'custom';
  const bases = $('bases');
  bases.replaceChildren(...P().bases.map((b) => chip(b, b, ui.bases.includes(b), () => { sel.value = 'custom'; moveSetChanged(); })));
  const amounts = [...new Set(P().bases.flatMap((b) => P().amountsOf(b)))];
  $('amounts').replaceChildren(...AMOUNTS.filter((a) => amounts.includes(a))
    .map((a) => chip(a, AMOUNT_LABELS[a], ui.amounts.includes(a), () => moveSetChanged())));
  sel.onchange = () => {
    if (sel.value === 'custom') return;
    const chosen = presets[sel.value].bases;
    for (const cb of bases.querySelectorAll('input')) cb.checked = chosen.includes(cb.value);
    moveSetChanged();
  };
}

/** Povolené tahy pro hledání a kontrolu algoritmů. */
function currentMoveSet() {
  if (model.kind === 'sq1') return { top: ui.sq1.top, bottom: ui.sq1.bottom, moves: [] };
  const moves = ui.bases.flatMap((base) => P().amountsOf(base).filter((a) => ui.amounts.includes(a)).map((amount) => ({ base, amount })));
  return { moves, engineMoves: toModelSteps(moves), allowedNames: new Set(moves.map((m) => P().moveToString(m))) };
}

function moveSetChanged(read = true) {
  const checked = (id) => [...$(id).querySelectorAll('input:checked')].map((c) => c.value);
  if (model.kind === 'sq1') {
    if (read) ui.sq1 = { ...ui.sq1, top: checked('bases').map(Number), bottom: checked('amounts').map(Number) };
  } else {
    ui.bases = checked('bases');
    ui.amounts = checked('amounts').map(Number);
  }
  save();
  clearResults();
}

const ERGO_FIELDS = {
  cube: [
    ['rotationPenalty', 'Rotace x/y/z (za ¼)', 0.5],
    ['regripPenalty', 'Přehmat zápěstí', 0.1],
    ['gripChangePenalty', 'Změna úchopu', 0.1],
    ['triggerBonusScale', 'Násobič bonusů triggerů', 0.1],
    ['maxWristTurn', 'Max. ¼ zápěstím bez přehmatu', 1],
  ],
  sq1: [
    ['slash', 'Řez „/“', 0.1],
    ['simultaneous', 'Současné otočení druhé vrstvy (násobek)', 0.1],
  ],
  simple: [],
};

function numberInput(value, step, onValue, ariaLabel) {
  const input = el('input', { type: 'number', step: String(step), min: '0', value: String(value) });
  if (ariaLabel) input.ariaLabel = ariaLabel;
  input.onchange = () => {
    const v = Number(input.value);
    if (Number.isFinite(v) && v >= 0) onValue(v);
  };
  return input;
}

function renderErgo() {
  const kind = P().ergonomics;
  $('ergo-main').replaceChildren(...ERGO_FIELDS[kind].map(([key, label, step]) =>
    el('label', { className: 'field' }, label, numberInput(ui.ergo[key], step, (v) => { ui.ergo[key] = v; ergoChanged(); }))));
  const head = $('ergo-moves-head');
  if (kind === 'cube') {
    head.replaceChildren('Váhy tahů ', el('small', { textContent: 'po směru / proti / dvojitě' }));
    const bases = P().bases.filter((b) => !P().rotations.includes(b));
    $('ergo-moves').replaceChildren(...bases.map((b) => el('div', { className: 'ergo-move' }, el('b', { textContent: b }),
      ...[0, 1, 2].map((i) => numberInput(ui.ergo.moveWeights[b][i], 0.1, (v) => {
        const w = [...ui.ergo.moveWeights[b]];
        w[i] = v;
        ui.ergo.moveWeights = { ...ui.ergo.moveWeights, [b]: w };
        ergoChanged();
      }, `${b} ${['po směru', 'proti', 'dvojitě'][i]}`)))));
  } else if (kind === 'simple') {
    head.replaceChildren('Váhy tahů ', el('small', { textContent: 'po směru / proti' }));
    $('ergo-moves').replaceChildren(...P().bases.map((b) => el('div', { className: 'ergo-move two' }, el('b', { textContent: b }),
      ...[0, 1].map((i) => numberInput(ui.ergo.weights[b][i], 0.1, (v) => {
        const w = [...ui.ergo.weights[b]];
        w[i] = v;
        ui.ergo.weights = { ...ui.ergo.weights, [b]: w };
        ergoChanged();
      }, `${b} ${['po směru', 'proti'][i]}`)))));
  } else {
    head.replaceChildren('Otočení vrstvy ', el('small', { textContent: 'o 1–6 dvanáctin' }));
    $('ergo-moves').replaceChildren(...[1, 2, 3, 4, 5, 6].map((n) => el('div', { className: 'ergo-move one' }, el('b', { textContent: `±${n}` }),
      numberInput(ui.ergo.turn[n], 0.1, (v) => {
        const t = [...ui.ergo.turn];
        t[n] = v;
        ui.ergo.turn = t;
        ergoChanged();
      }, `Otočení o ${n}`))));
  }
}

function ergoChanged() {
  storage.set(ergoKey(model.id), ui.ergo);
  for (const alg of ui.results.keys()) ui.results.set(alg, score(alg));
  difficultyCache.clear();
  renderResults();
  renderPlayer();
}

// --- Hledání ----------------------------------------------------------------------------

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
  const { tracked, loc, target, errors } = taskInfo();
  if (errors.length || !loc) { $('status').textContent = `Zadání není v pořádku: ${errors[0]}`; return; }
  if (!tracked.some((n) => !model.centers.includes(n))) { $('status').textContent = 'V cíli není označený žádný dílek.'; return; }
  const moveSet = currentMoveSet();
  if (model.kind === 'perm' && !moveSet.moves.length) { $('status').textContent = 'Nejsou povolené žádné tahy (Tahy a váhy).'; return; }
  clearResults();
  const shown = num('opt-results', 1, 500);
  const opts = {
    maxLength: num('opt-max', 1, 20),
    extraDepth: num('opt-extra', 0, 6),
    // hledá se víc kandidátů, než se ukáže – z nich se vybírají nejpohodlnější
    maxResults: Math.min(5000, Math.max(500, shown * 40)),
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
  client.start({
    puzzle: model.id, start: loc, target, constraints: ui.constraints, moves: moveSet.engineMoves, options: opts, ergonomics: ui.ergo,
    sq1: { shape: ui.sq1.shape, top: ui.sq1.top, bottom: ui.sq1.bottom },
  }, {
    onProgress: (p) => {
      $('status').textContent = p.phase === 'tables'
        ? `Připravuji heuristiku ${p.table}/${p.tables}…`
        : `Hloubka ${p.depth} · ${p.nodes.toLocaleString('cs')} uzlů · nalezeno ${p.found} · ${(p.elapsed / 1000).toFixed(1)} s`;
    },
    onSolutions: (items) => {
      for (const { alg } of items) { const a = ui.hold ? held().toHeldString(alg) : alg; ui.results.set(a, score(a)); }
      scheduleRender();
    },
    onDone: (d) => {
      searchUi(false);
      const why = {
        done: 'Hotovo', time: 'Vypršel časový limit', results: 'Dosažen max. počet kandidátů',
        'not-found': `Do ${opts.maxLength} ${unit()} nic nenalezeno`,
        unsolvable: 'S povolenými tahy to vyřešit nejde',
        'already-solved': 'Výchozí stav už cíl splňuje',
      }[d.reason] ?? d.reason;
      $('status').textContent = `${why} · ${d.found} řešení${d.optimal ? ` · nejkratší ${d.optimal} ${unit()}` : ''} · ${(d.elapsed / 1000).toFixed(1)} s`;
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

const difficultyCache = new Map();
function moveClass(token) {
  if (!difficultyCache.has(token)) {
    difficultyCache.set(token, moveDifficulty(P(), token, P().ergonomics === 'cube' ? { ...ui.ergo, triggers } : ui.ergo));
  }
  return difficultyCache.get(token);
}

function movesView(alg, s, { current = -1, onStep, moveSet } = {}) {
  let steps;
  try { steps = model.steps(alg); } catch { steps = []; }
  const trig = new Set();
  for (const t of s.triggers) for (let i = t.start; i < t.start + t.length; i++) trig.add(i);
  return el('div', { className: 'moves' }, ...steps.map((m, i) => {
    const text = model.stepToString(m);
    const bad = moveSet && !model.allows(moveSet, m);
    const cls = ['mv', moveClass(text), trig.has(i) && 'trig', i === current && 'current', bad && 'bad'].filter(Boolean).join(' ');
    if (!onStep) return el('span', { className: cls, textContent: text });
    const b = el('button', { type: 'button', className: cls, textContent: text });
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

const taskSnapshot = () => ({
  ...(model.id !== '333' ? { puzzle: model.id } : {}),
  ...(ui.hold ? { hold: ui.hold } : {}),
  colorsA: model.serialize(ui.A), colorsB: model.serialize(ui.B), constraints: { ...ui.constraints },
  ...(model.kind === 'sq1' ? { shape: ui.sq1.shape } : {}),
});
// Sada, do které se ukládají algoritmy (záložka u řešení).
let saveSet = storage.get('ergocube.lab.saveSet') ?? 'default';
const savedFor = (alg) => algs.find(alg, taskSnapshot(), saveSet);

function toggleSave(alg) {
  const existing = savedFor(alg);
  if (existing) algs.remove(existing.id);
  else algs.add({ alg, task: taskSnapshot(), set: saveSet });
}

function renderResults() {
  const list = sortedResults();
  const shown = num('opt-results', 1, 500);
  $('results').replaceChildren(...list.slice(0, shown).map(({ alg, score: s }, i) => {
    const isSaved = !!savedFor(alg);
    const row = el('div', { className: `result${alg === ui.chosen ? ' selected' : ''}`, role: 'button', tabIndex: 0 },
      el('span', { className: 'rank', textContent: `${i + 1}.` }),
      movesView(alg, s),
      el('span', { className: 'total', textContent: s.total.toFixed(1) }),
      el('span', { className: 'meta' },
        `${s.metrics.htm} ${unit()}`,
        bar(s.breakdown),
        s.triggers.length ? `✦ ${s.triggers.map((t) => t.name).join(', ')}` : null,
        s.breakdown.rotations ? 'rotace' : null));
    const saveBtn = iconButton(icon(isSaved ? 'bookmarked' : 'bookmark', { size: 18 }), {
      label: isSaved ? 'Odebrat z trenažéru' : 'Uložit do trenažéru',
      className: `icon-btn save${isSaved ? ' on' : ''}`,
      onClick: (e) => { e.stopPropagation(); toggleSave(alg); },
    });
    row.append(saveBtn);
    row.onclick = () => choose(alg, true);
    row.onkeydown = (e) => { if (e.key === 'Enter') choose(alg, true); };
    return el('li', {}, row);
  }));
  $('results-more').textContent = list.length > shown ? `Zobrazeno ${shown} nejlepších z ${list.length} nalezených.` : '';
  const count = $('results-count');
  count.hidden = !list.length;
  count.textContent = String(Math.min(list.length, shown));
}

// --- Přehrávač --------------------------------------------------------------------------

function choose(alg, scroll) {
  ui.chosen = alg;
  ui.step = 0;
  $('alg').value = alg;
  stopPlaying();
  renderResults();
  renderPlayer();
  if (scroll && window.matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function playerSteps() {
  try { return ui.chosen ? model.steps(ui.chosen) : []; } catch { return null; }
}

function renderPlayer() {
  const { loc, target, errors } = taskInfo();
  const detail = $('detail');
  const saveBtn = $('p-save');
  const steps = playerSteps();
  saveBtn.hidden = !loc || !steps?.length;
  if (!loc) {
    renderView(cubeP, model.stickers(model.blank(ui.A), {}), ui.A.state);
    detail.replaceChildren(el('p', { className: 'hint', textContent: errors[0] ?? 'Zadání není kompletní.' }));
    return;
  }
  if (steps === null) {
    renderView(cubeP, model.stateStickers(loc, ui.constraints), loc);
    detail.replaceChildren(el('p', { className: 'ko', textContent: 'Algoritmus nejde přečíst.' }));
    return;
  }
  ui.step = Math.min(Math.max(0, ui.step), steps.length);
  let current, end;
  try {
    const real = toModelSteps(steps);
    current = model.applySteps(loc, real.slice(0, ui.step));
    end = model.applySteps(loc, real);
  } catch (e) {
    renderView(cubeP, model.stateStickers(loc, ui.constraints), loc);
    detail.replaceChildren(el('p', { className: 'ko', textContent: `Algoritmus nejde provést: ${e.message}` }));
    return;
  }
  renderView(cubeP, model.stateStickers(current, ui.constraints), current);
  if (!steps.length) {
    detail.replaceChildren(el('p', { className: 'hint', textContent: 'Vyber řešení ze seznamu nebo napiš vlastní algoritmus.' }));
    return;
  }
  const algText = model.algToString(steps);
  const isSaved = !!savedFor(algText);
  saveBtn.innerHTML = icon(isSaved ? 'bookmarked' : 'bookmark', { size: 20 });
  saveBtn.classList.toggle('on', isSaved);

  const moveSet = currentMoveSet();
  const goal = model.goal(ui.constraints, target, { shape: ui.sq1.shape });
  const exact = goal.test(end);
  const rotated = !exact && goal.rotated(end);
  const illegal = steps.filter((m) => !model.allows(moveSet, m)).map((m) => model.stepToString(m));
  const s = score(algText);
  const b = s.breakdown;
  const row = (color, label, value) => el('tr', {},
    el('td', {}, color ? Object.assign(el('i'), { style: `background:${color}` }) : null, label),
    el('td', { textContent: value }));
  const cube = P().ergonomics === 'cube';

  detail.replaceChildren(
    movesView(algText, s, { current: ui.step - 1, onStep: (i) => { ui.step = i; stopPlaying(); renderPlayer(); }, moveSet }),
    el('div', { className: 'verdict' },
      el('span', { className: exact || rotated ? 'ok' : 'ko', textContent: exact ? '✓ řeší zadání' : rotated ? '✓ řeší zadání (po otočení kostky)' : `✗ neřeší zadání (${goal.violations(end)} porušení)` }),
      illegal.length ? el('span', { className: 'ko', textContent: ` · nepovolené tahy: ${illegal.join(' ')}` }) : null),
    el('div', {}, el('span', { className: 'score-big', textContent: s.total.toFixed(1) }), el('span', { className: 'hint', textContent: '  nepohodlnost (nižší = lepší)' })),
    el('table', { className: 'breakdown' },
      row('#7d8fb3', model.kind === 'sq1' ? 'Řezy a otočení' : 'Váha tahů', b.moves.toFixed(2)),
      cube ? row('var(--bad)', 'Rotace', b.rotations.toFixed(2)) : null,
      cube ? row('var(--warn)', 'Přehmaty zápěstí', b.regrips.toFixed(2)) : null,
      cube ? row('#b07cc6', 'Změny úchopu', b.gripChanges.toFixed(2)) : null,
      cube ? row('var(--good)', `Triggery${s.triggers.length ? ` (${s.triggers.map((t) => t.name).join(', ')})` : ''}`, b.triggerBonus.toFixed(2)) : null,
      model.kind === 'sq1'
        ? row(null, 'Řezů / tahů celkem', `${s.metrics.htm} / ${s.metrics.qtm}`)
        : row(null, 'HTM / QTM / STM', `${s.metrics.htm} / ${s.metrics.qtm} / ${s.metrics.stm}`)),
  );
}

async function step(delta) {
  const steps = playerSteps();
  if (!steps || !steps.length) return false;
  const target = ui.step + delta;
  if (target < 0 || target > steps.length) return false;
  if (currentView().type === 'cube3d') {
    const m = toModelSteps([delta > 0 ? steps[ui.step] : model.invertStep(steps[ui.step - 1])])[0];
    await cubeP.animate(m);
  } else {
    await cubeP.animate();
  }
  ui.step = target;
  renderPlayer();
  return true;
}

function stopPlaying() {
  ui.playing = false;
  $('p-play').innerHTML = icon('play', { size: 20 });
}

// --- Výběr hlavolamu --------------------------------------------------------------------

function selectPuzzle(id) {
  if (client.running) client.cancel();
  model = labModel(id);
  storage.set('ergocube.lab.puzzle', id);
  $('lab-puzzle').value = id;
  load();
  buildViews();
  // výchozí hloubka hledání podle hlavolamu (Square-1 se měří v řezech)
  $('opt-max-label').textContent = model.kind === 'sq1' ? 'Max. řezů' : 'Max. tahů';
  $('opt-extra-label').textContent = model.kind === 'sq1' ? 'Řezů nad optimum' : 'Tahů nad optimum';
  if (model.kind === 'sq1') { $('opt-max').value = '7'; $('opt-extra').value = '1'; } else { $('opt-max').value = '11'; $('opt-extra').value = '3'; }
  $('a-scan').hidden = !model.scan;
  $('b-scan').hidden = !model.scan;
  renderSq1Pads();
  renderHoldNote();
  syncTarget();
  stopPlaying();
  renderPalette('A');
  renderPalette('B');
  renderStyles();
  renderMoveSet();
  renderErgo();
  renderCubes();
  renderTaskStatus();
  clearResults();
  showSub(ui.sub);
}

// --- Inicializace -----------------------------------------------------------------------

export function initLab({ onSub } = {}) {
  onSubChange = onSub ?? onSubChange;
  $('lab-puzzle').replaceChildren(...PUZZLES.map((p) => el('option', { value: p.id, textContent: p.name })));
  $('lab-puzzle').onchange = () => { selectPuzzle($('lab-puzzle').value); $('lab-puzzle').blur(); };

  for (const b of document.querySelectorAll('.segmented button[data-sub]')) b.onclick = () => showSub(b.dataset.sub);
  $('a-hold').onclick = () => setHold(cubeA.nearestHold());
  $('b-hold').onclick = () => setHold(cubeB.nearestHold());
  $('hold-reset').onclick = () => setHold('');
  $('a-view').onclick = () => cubeA.resetView();
  $('b-view').onclick = () => cubeB.resetView();

  $('a-scan').onclick = () => scan('A');
  $('b-scan').onclick = () => scan('B');
  $('a-home').onclick = () => { snapshot(); ui.A = model.home(trackedPieces(ui.constraints)); ui.autoA.clear(); taskChanged(); };
  $('a-clear').onclick = () => { snapshot(); ui.A = model.blank(ui.A); ui.autoA.clear(); taskChanged(); };
  $('b-home').onclick = () => { snapshot(); ui.B = model.home(trackedPieces(ui.constraints)); taskChanged(); };
  $('b-clear').onclick = () => {
    snapshot();
    for (const k of Object.keys(ui.constraints)) ui.constraints[k] = 'ignore';
    ui.A = model.blank(ui.A);
    ui.B = model.blank(ui.B);
    taskChanged();
  };
  $('undo').onclick = () => {
    const last = ui.undo.pop();
    if (!last) return;
    ui.constraints = last.constraints;
    ui.A = model.deserialize(last.A);
    ui.B = model.deserialize(last.B);
    taskChanged();
  };
  $('help').onclick = () => $('help-dialog').showModal();
  $('flat').onclick = () => {
    flat = !flat;
    storage.set('ergocube.lab.flat', flat);
    buildViews();
    renderCubes();
    renderPlayer();
  };
  $('go-search').onclick = () => { showSub('results'); startSearch(); };
  $('sq1-shape').onchange = () => { ui.sq1 = { ...ui.sq1, shape: $('sq1-shape').checked }; save(); clearResults(); };

  $('search').onclick = startSearch;
  $('stop').onclick = () => {
    client.cancel();
    searchUi(false);
    $('status').textContent += ' · zastaveno';
    renderResults();
  };
  $('sort').onchange = () => renderResults();
  $('opt-results').onchange = () => renderResults();
  $('ergo-calibrate').onclick = () => {
    const mine = algs.list().filter((a) => (a.task.puzzle ?? '333') === model.id);
    const res = calibrate(P(), ui.ergo, mine);
    if (!res.ok) { $('ergo-calibration').textContent = res.reason; return; }
    ui.ergo = res.config;
    renderErgo();
    ergoChanged();
    $('ergo-calibration').textContent = res.changes.length
      ? `Podle ${res.used} algoritmů (≈ ${res.secondsPerUnit.toFixed(2)} s na jednotku váhy): `
        + res.changes.map((c) => `${featureLabel(c.key)} ${c.from} → ${c.to}`).join(', ')
      : `Podle ${res.used} algoritmů váhy sedí, nic se nezměnilo.`;
  };
  $('ergo-reset').onclick = () => {
    $('ergo-calibration').textContent = '';
    ui.ergo = defaultErgo(P());
    if (P().ergonomics === 'sq1') ui.ergo = { ...SQ1_DEFAULTS, turn: [...SQ1_DEFAULTS.turn] };
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
    const steps = playerSteps();
    if (steps?.length) toggleSave(model.algToString(steps));
  };
  $('p-play').onclick = async () => {
    if (ui.playing) { stopPlaying(); return; }
    const steps = playerSteps();
    if (!steps?.length) return;
    if (ui.step >= steps.length) { ui.step = 0; renderPlayer(); await new Promise((r) => setTimeout(r, 250)); }
    ui.playing = true;
    $('p-play').innerHTML = icon('pause', { size: 20 });
    while (ui.playing && await step(1)) { /* další tah */ }
    stopPlaying();
  };
  const renderSaveSet = () => setOptions($('save-set'), saveSet);
  $('save-set').onchange = () => {
    saveSet = pickSet($('save-set'), saveSet);
    storage.set('ergocube.lab.saveSet', saveSet);
    renderSaveSet();
    renderResults();
    renderPlayer();
  };
  renderSaveSet();
  algs.subscribe(() => { renderSaveSet(); renderResults(); renderPlayer(); });

  selectPuzzle(model.id);
}

export function showLab() {
  showSub(ui.sub);
}
