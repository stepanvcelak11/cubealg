// Lab: zadání vlastního případu dvěma hlavolamy (výchozí stav a cíl), povolené
// tahy a váhy, hledání ergonomických řešení a jejich přehrávání.
// Hlavolamy: 3×3, 2×2, Pyraminx, Skewb, Square-1 (každý má své uložené zadání).
//
// Zadání:
//   Obě strany se vybarvují po nálepkách barvou z palety – obarví se jen nálepka,
//   na kterou se klepne. Chytré vybarvování (Nastavení) navíc doplní dílek s jednou
//   chybějící nálepkou a přenáší celé dílky mezi stranami. Cíl navíc určuje styl
//   každého dílku: plná = místo i natočení, čárkovaná = jen místo, tečkovaná =
//   jen natočení. Se zvoleným stylem (bez barvy) klepnutí na dílek změní jeho
//   styl, prázdné místo vyplní dílkem, který tam patří.

import { AMOUNTS } from '../core/moveset.js';
import { trackedPieces } from '../core/task.js';
import { PUZZLES } from '../puzzles/index.js';
import { scoreFor, defaultErgo, moveDifficulty, SQ1_DEFAULTS } from '../ergonomics/puzzles.js';
import { aufCost } from '../ergonomics/score.js';
import { DEFAULT_CONFIG, DEFAULT_MOVE_WEIGHTS } from '../ergonomics/weights.js';
import { buildTriggers } from '../ergonomics/triggers.js';
import { FINGER_MOVES, defaultFinger } from '../ergonomics/flow.js';
import { calibrate, featureLabel, learnPreferences } from '../ergonomics/calibrate.js';
import { VIEWS, styleMetrics, rankResults, ranksOf, paretoFront, speedValue, DEFAULT_LAMBDA } from '../ergonomics/style.js';
import { SearchClient } from '../search/client.js';
import { $, el, storage, iconButton } from './dom.js';
import { icon } from './icons.js';
import { algs, algSets, defaultSetId, preferencesOf, clearPreferences } from './store.js';
import { openCompare, compareCount } from './compare.js';
import { openLearnSets } from './learnsets.js';
import { CORPUS } from '../ergonomics/corpus.js';
import { segmentItems, segmentCount } from './smartdata.js';
import { setOptions, pickSet } from './sets.js';
import { Cube3D } from './cube3d.js';
import { NetView } from './netview.js';
import { STYLE_OF } from './cubeview.js';
import { labModel } from './models.js';
import { holdList, holdFor } from './holds.js';
import { sendLink, algsPayload, packTask, toast } from './share.js';
import { openGenerator } from './generator.js';
import { smartCube } from '../smartcube/index.js';
import { toFacelets, fromFacelets } from '../core/cube.js';
import { solve as twoPhase } from '../timer/twophase.js';
import { methods, guides } from './store.js';
import { buildPlan } from '../sim/plan.js';
import { stepConfig } from './stepcfg.js';

const STYLES = [
  { type: 'solved', label: 'Plná', title: 'Místo i natočení' },
  { type: 'permutation', label: 'Čárkovaná', title: 'Jen místo (permutace)' },
  { type: 'orientation', label: 'Tečkovaná', title: 'Jen natočení (orientace)' },
];
// Co musí platit pro dílky bez šipky (zadání šipkami); sw = vzhled v síti.
const REST_STYLES = [
  { type: 'solved', label: 'Složený', title: 'Dílek zůstane na svém místě správně natočený', sw: 'solid' },
  { type: 'layer', label: 'Ve vrstvě', title: 'Dílek se smí přesunout jen v rámci své vrstvy a zůstane správně natočený', sw: 'dashed' },
  { type: 'orientation', label: 'Orientace', title: 'Dílek se smí přesunout kamkoli, ale zůstane správně natočený', sw: 'dotted' },
  { type: 'ignore', label: 'Nezáleží', title: 'Na dílku nezáleží', sw: 'faded' },
];
const AMOUNT_LABELS = { 1: 'po směru', [-1]: "proti (')", 2: 'dvojitě (2)' };
const SQ1_AMOUNTS = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6];
const SQ1_PRESETS = {
  all: { label: 'Všechna otočení', top: SQ1_AMOUNTS, bottom: SQ1_AMOUNTS },
  small: { label: 'Do ±3', top: [-3, -2, -1, 1, 2, 3], bottom: [-3, -2, -1, 1, 2, 3] },
  cs: { label: '±1, ±3, 6', top: [-3, -1, 1, 3, 6], bottom: [-3, -1, 1, 3, 6] },
};

const storageKey = (id) => (id === '333' ? 'ergocube.v3' : `ergocube.lab.${id}`);
// výchozí hodnoty před doladěním podle sbírky (převod uloženého nastavení, viz initState)
const OLD_ERGO = { regripPenalty: 1.5, gripChangePenalty: 0.6, triggerBonusScale: 1, reuse: 0.6, sameHand: 0.3, alternate: 0.12 };
const OLD_MOVE_WEIGHTS = { R: [1, 1, 1.4], U: [1, 1, 1.4], r: [1.2, 1.2, 1.7], M: [1.7, 1.4, 2], L: [1.5, 1.4, 2], D: [1.5, 1.4, 2.2], F: [1.7, 1.8, 2.4], B: [3, 3, 3.6] };
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
  marks: {},        // vlastní styl jednotlivých nálepek cíle (pozice → styl), core/task.js
  autoA: new Set(), // dílky, které do výchozí strany dala aplikace
  undo: [],
  results: new Map(),
  chosen: null,     // algoritmus v přehrávači
  step: 0,
  playing: false,
  ergo: null,
  hold: '',         // držení kostky (core/hold.js): algoritmy jsou psané podle natočení
  sub: 'task',
  side: 'A',        // upravovaná strana zadání na úzkém displeji (A = start, B = cíl)
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
  const { constraints, marks, bases, amounts, sq1, hold, mode, arrows, restStyle, restDefault, colorBackup } = ui;
  storage.set(storageKey(model.id), {
    constraints, marks, bases, amounts, sq1, hold, colorsA: model.serialize(ui.A), colorsB: model.serialize(ui.B),
    mode, arrows, restStyle, restDefault, colorBackup,
  });
}

function load() {
  const saved = storage.get(storageKey(model.id)) ?? {};
  const names = model.pieceNames;
  ui.constraints = Object.fromEntries(names.map((n) => [n, saved.constraints?.[n] ?? (model.centers.includes(n) ? 'solved' : 'ignore')]));
  ui.marks = model.kind === 'perm' && saved.marks && typeof saved.marks === 'object' ? { ...saved.marks } : {};
  const tracked = trackedPieces(ui.constraints);
  ui.A = model.deserialize(saved.colorsA) ?? model.home(tracked);
  ui.B = model.deserialize(saved.colorsB) ?? model.home(tracked);
  if (model.kind === 'perm') {
    ui.bases = (saved.bases ?? P().defaultBases).filter((b) => P().bases.includes(b));
    ui.amounts = saved.amounts ?? AMOUNTS;
  }
  ui.sq1 = { top: SQ1_AMOUNTS, bottom: SQ1_AMOUNTS, shape: true, ...(saved.sq1 ?? {}) };
  ui.hold = holdList(model).some((h) => h.id === saved.hold) ? saved.hold : '';
  ui.mode = saved.mode === 'arrows' && arrowsAllowed() ? 'arrows' : 'colors';
  ui.arrows = Array.isArray(saved.arrows) ? saved.arrows : [];
  ui.restDefault = REST_STYLES.some((r) => r.type === saved.restDefault) ? saved.restDefault : (saved.arrowRest === false ? 'ignore' : 'solved');
  ui.restStyle = saved.restStyle && typeof saved.restStyle === 'object' ? { ...saved.restStyle } : {};
  ui.arrowTool = 'arrow';
  ui.colorBackup = saved.colorBackup ?? null;
  ui.arrowSel = null;
  ui.memory = {};
  ui.autoA = new Set();
  ui.undo = [];
  ui.lastPaint = -1;
  ui.paint = { A: P().colors[0].face, B: null };
  const e = storage.get(ergoKey(model.id));
  // staré výchozí ceny přehmatu a rotace (uložené s ostatním nastavením) → nové výchozí
  if (e && !e.v2) { if (e.regripPenalty === 2.5) delete e.regripPenalty; if (e.rotationPenalty === 10) delete e.rotationPenalty; e.v2 = true; }
  // výchozí váhy doladěné podle oblíbených algoritmů (bench/fit.mjs): hodnoty, které sis
  // neměnil (rovné starým výchozím), přejdou na nové; tvoje úpravy zůstanou
  if (e && !e.v3 && P().ergonomics === 'cube') {
    for (const [k, v] of Object.entries(OLD_ERGO)) if (e[k] === v) delete e[k];
    for (const [b, w] of Object.entries(OLD_MOVE_WEIGHTS)) if (e.moveWeights?.[b] && e.moveWeights[b].every((x, i) => x === w[i])) delete e.moveWeights[b];
    e.v3 = true;
  }
  const def = defaultErgo(P());
  ui.ergo = P().ergonomics === 'cube'
    ? { ...DEFAULT_CONFIG, ...e, moveWeights: { ...DEFAULT_MOVE_WEIGHTS, ...(e?.moveWeights ?? {}) } }
    : P().ergonomics === 'sq1' ? { ...def, ...e } : { weights: { ...def.weights, ...(e?.weights ?? {}) } };
}

// Držení: algoritmy v rozhraní jsou ve tvém rámci (U = stěna nahoře), model a hledání
// pracují v rámci modelu.
const held = () => holdFor(model, ui.hold);
const toModelSteps = (steps) => (ui.hold ? steps.map((m) => held().toModel([m])[0]) : steps);

// AUF: řešení smí začít a skončit natočením U v závorce – „(U) R U R' (U2)“. Do délky
// ani hodnocení se nepočítá (závorky parser ignoruje, takže přehrávání funguje).
const aufAllowed = () => P().ergonomics === 'cube';
const AUF_TOKEN = /^U[2']?$/;
function splitAuf(alg) {
  let core = String(alg ?? '').trim(), pre = null, post = null;
  if (!aufAllowed()) return { pre, core, post };
  const a = core.match(/^\(\s*([^()]+?)\s*\)\s*/);
  if (a && AUF_TOKEN.test(a[1])) { pre = a[1]; core = core.slice(a[0].length); }
  const b = core.match(/\s*\(\s*([^()]+?)\s*\)$/);
  if (b && AUF_TOKEN.test(b[1])) { post = b[1]; core = core.slice(0, core.length - b[0].length); }
  return { pre, core, post };
}
const joinAuf = (pre, core, post) => [pre && `(${pre})`, core, post && `(${post})`].filter(Boolean).join(' ');

const score = (alg) => {
  const { pre, core, post } = splitAuf(alg);
  const s = scoreFor(P(), core, P().ergonomics === 'cube' ? { ...ui.ergo, triggers } : ui.ergo);
  if (P().ergonomics !== 'cube' || (!pre && !post)) return s;
  // AUF do délky ne, do pohodlí ano
  const auf = aufCost(pre, post, ui.ergo);
  return { ...s, total: Math.round((s.total + auf) * 100) / 100, breakdown: { ...s.breakdown, auf } };
};

function snapshot() {
  ui.undo.push({
    constraints: { ...ui.constraints }, marks: { ...ui.marks }, A: model.serialize(ui.A), B: model.serialize(ui.B),
    arrows: ui.arrows.map((a) => ({ ...a })), mode: ui.mode, restStyle: { ...ui.restStyle }, restDefault: ui.restDefault,
  });
  if (ui.undo.length > 60) ui.undo.shift();
}

// --- Držení kostky ----------------------------------------------------------------------

function renderHoldNote() {
  const note = $('hold-note');
  const list = holdList(model);
  // 3D kostka se drží zámkem v rohu; ostatní hlavolamy (a plošná síť) výběrem z nabídky
  note.hidden = list.length < 2 || (!ui.hold && currentView().type === 'cube3d');
  const select = $('hold-select');
  select.replaceChildren(...list.map((h) => el('option', { value: h.id, textContent: h.label })));
  select.value = ui.hold;
  $('hold-reset').hidden = !ui.hold;
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
    : new NetView(container, { ...opts, viewBox: v.viewBox, polys: v.polys, zoom: opts.onSticker ? v.zoom : null });
}

function buildViews() {
  cubeA = makeView($('cube-a'), { label: 'Výchozí stav', onSticker: tapA, fill: true });
  cubeB = makeView($('cube-b'), { label: 'Cíl', onSticker: tapB, fill: true });
  cubeP = makeView($('cube-p'), { label: 'Přehrávač' });
  const is3d = currentView().type === 'cube3d';
  for (const c of [cubeA, cubeB, cubeP]) c.setHold?.(ui.hold);
  $('a-hold').hidden = !is3d || holdList(model).length < 2;
  $('b-hold').hidden = !is3d || holdList(model).length < 2;
  $('a-view').hidden = !is3d;
  $('b-view').hidden = !is3d;
  $('flat').hidden = !model.flatView;
  $('flat').setAttribute('aria-pressed', String(flat));
  $('flat').innerHTML = icon(flat ? 'cube3d' : 'net', { size: 22 });
  renderHoldNote();
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

/** Nesmí se stránka posouvat (otáčení kostkami v zadání)? */
export function labFixed() {
  return ui.sub === 'task' && ui.mode !== 'arrows';
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
  const smart = smartPaint();
  for (const name of model.pieceNames) {
    if (inB.has(name)) {
      // středy jen plně (natočení středu se neřeší)
      if (model.centers.includes(name)) ui.constraints[name] = 'solved';
      else if (!isMarked(name)) ui.constraints[name] = ui.memory[name] ?? ui.style;
      if (smart && !model.findPiece(ui.A, name) && model.homeEmpty(ui.A, name)) {
        ui.A = model.placeHome(ui.A, name);
        ui.autoA.add(name);
      }
    } else if (isMarked(name)) {
      ui.memory[name] = ui.constraints[name];
      ui.constraints[name] = 'ignore';
      if (smart && ui.autoA.has(name) && model.homeIs(ui.A, name)) ui.A = model.removePiece(ui.A, name);
      ui.autoA.delete(name);
    }
  }
}

/** Chytré vybarvování (doplňování dílků a přenos mezi stranami) – v Nastavení, výchozí vypnuto. */
export const smartPaint = () => storage.get('ergocube.lab.smartPaint') === true;

function paint(side, pos) {
  const key = side === 'B' ? pos + 1000 : pos;
  const last = (ui.lastPaint >= 1000) === (side === 'B') ? ui.lastPaint % 1000 : -1;
  ui.lastPaint = key;
  const smart = smartPaint();
  if (side === 'B') { delete ui.marks[pos]; ui.B = model.paint(ui.B, pos, ui.paint.B, last, smart); return; }
  const before = model.pieceAtSticker(ui.A, pos);
  ui.A = model.paint(ui.A, pos, ui.paint.A, last, smart);
  ui.autoA.delete(before);
  if (!smart) return;
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
  } else if (!styleTap(pos)) {
    ui.undo.pop();
    return;
  }
  taskChanged();
}

/**
 * Nástroj styl: styl dostane jen klepnutá nálepka (u celého dílku s jedním stylem
 * všech nálepek se z toho stane styl dílku). Stejný styl podruhé: celý dílek se
 * stejným stylem zmizí, jinak se nálepka vrátí ke stylu dílku (u částečně
 * vybarveného dílku se smaže). Prázdné místo se vyplní dílkem, který tam patří.
 * @returns {boolean} změnilo se něco?
 */
function styleTap(pos) {
  const S = ui.style;
  const piece = model.pieceAtSticker(ui.B, pos);
  const home = homePieceAt(pos);
  if (model.kind !== 'perm') {
    // Square-1: styl celého dílku
    if (piece && ui.constraints[piece] === S) ui.B = model.removePiece(ui.B, piece);
    else if (piece) ui.constraints[piece] = S;
    else if (home && !model.findPiece(ui.B, home) && model.homeEmpty(ui.B, home)) { ui.B = model.placeHome(ui.B, home); ui.memory[home] = S; }
    else return false;
    return true;
  }
  if (piece && model.centers.includes(piece)) {
    // střed: jen plně, klepnutí ho odebere
    ui.B = model.removePiece(ui.B, piece);
    return true;
  }
  if (piece) {
    const facelets = P().slots[P().SLOT_OF[pos]].facelets;
    const eff = (q) => ui.marks[q] ?? ui.constraints[piece];
    if (eff(pos) === S) {
      if (facelets.every((q) => eff(q) === S)) {
        for (const q of facelets) delete ui.marks[q];
        ui.B = model.removePiece(ui.B, piece);
      } else {
        delete ui.marks[pos];
      }
    } else {
      ui.marks[pos] = S;
    }
    // všechny nálepky stejně → styl dílku
    const styles = facelets.map(eff);
    if (styles.every((st) => st === styles[0])) {
      ui.constraints[piece] = styles[0];
      for (const q of facelets) delete ui.marks[q];
    }
    return true;
  }
  if (ui.B[pos] !== model.EMPTY) {
    // částečně vybarvený dílek („barva na místě“): styl nálepky, stejný podruhé = smazat
    const cur = ui.marks[pos] ?? 'solved';
    if (cur === S) { delete ui.marks[pos]; ui.B = [...ui.B]; ui.B[pos] = model.EMPTY; }
    else if (S === 'solved') delete ui.marks[pos];
    else ui.marks[pos] = S;
    return true;
  }
  if (home && !model.findPiece(ui.B, home) && model.homeEmpty(ui.B, home)) {
    ui.B = model.placeHome(ui.B, home);
    ui.memory[home] = S;
    return true;
  }
  return false;
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
      // Volba stylu přepne na nástroj styl: klepnutí na dílek mu dá tento styl.
      ui.paint.B = null;
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
  renderView(cubeB, model.stickers(ui.B, ui.constraints, ui.marks), ui.B.state);
}

/** Zadání pro hledání: výchozí stav, cíl a omezení (i „barva na místě“ z částečných dílků). */
function taskInfo() {
  const t = model.buildTask(ui.A, ui.B, ui.constraints, ui.marks);
  return { tracked: t.tracked, loc: t.loc, target: t.target, constraints: t.constraints, errors: t.errors, known: t.known ?? null };
}

function renderTaskStatus() {
  const { tracked, errors: taskErrors } = taskInfo();
  const arrowErr = ui.mode === 'arrows' ? arrowsError() : null;
  if (arrowErr) { $('task-status').replaceChildren(el('span', { className: 'warn', textContent: arrowErr })); return; }
  const errors = taskErrors;
  const pieces = tracked.filter((n) => !model.centers.includes(n));
  let node;
  if (!pieces.length) {
    node = el('span', { className: 'warn', textContent: 'Vybarvi na obou stranách dílky, které se mají vyřešit (nebo v cíli klepni stylem na dílek).' });
  } else if (errors.length) {
    node = el('span', { className: 'bad', textContent: errors[0] + (errors.length > 1 ? ` (+${errors.length - 1})` : '') });
    // dílky z cíle, které ve výchozí straně chybí a jejich místo je volné: doplnit jedním klepnutím
    const missing = tracked.filter((n) => !model.findPiece(ui.A, n) && model.homeEmpty(ui.A, n));
    if (missing.length && model.kind === 'perm' && ui.mode !== 'arrows') {
      const fix = el('button', { type: 'button', className: 'chip fix-missing', textContent: `Doplnit ${missing.length} chybějící do výchozí strany (na svá místa)` });
      fix.onclick = () => { snapshot(); for (const n of missing) ui.A = model.placeHome(ui.A, n); taskChanged(); };
      node = el('span', {}, node, ' ', fix);
    }
  } else {
    node = el('span', { className: 'good', textContent: `✓ ${pieces.length} dílků: ${pieces.join(' ')}` });
  }
  $('task-status').replaceChildren(node);
}

function taskChanged() {
  syncTarget();
  // styly nálepek jen u vybarvených nálepek cíle
  if (model.kind === 'perm') for (const k of Object.keys(ui.marks)) if (ui.B[k] === model.EMPTY) delete ui.marks[k];
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

// --- Moje kostka: stav z kamery nebo chytré kostky a řešení ---------------------------------
// Start = kostka v ruce (nafocená, nebo stav připojené chytré kostky), Cíl = složená kostka.
// Řešení: nejkratší (two-phase, kolem 20 tahů) nebo tvou metodou krok po kroku (stejný
// řešič jako test metody) – jde do výsledků, přehrávač ho ukáže tah po tahu.
function setMine(colors) {
  snapshot();
  ui.A = colors;
  for (const k of Object.keys(ui.constraints)) ui.constraints[k] = 'solved';
  ui.marks = {};
  ui.B = model.home(model.pieceNames);
  taskChanged();
}
function addSolution(alg, note) {
  ui.results.set(alg, score(alg));
  renderResults();
  choose(alg, true);
  showSub?.('results');
  if (note) $('status').textContent = note;
}
function openMine() {
  if (model.id !== '333') { toast('Moje kostka je zatím pro 3×3'); return; }
  const status = el('p', { className: 'hint' });
  const close = el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít', textContent: '✕' });
  const btn = (text, cls, fn, hidden = false) => Object.assign(el('button', { type: 'button', className: cls, textContent: text, hidden }), { onclick: fn });
  const fromCube = btn('Ze chytré kostky', 'secondary', () => { setMine([...toFacelets(smartCube.state)]); status.textContent = 'Start = stav chytré kostky ✓'; sync(); }, !smartCube.connected);
  const fromCam = btn('Nafotit kamerou', 'secondary', () => { dlg.close(); scan('A', () => { setMine([...ui.A]); openMine(); }); });
  const shortest = btn('Nejkratší řešení', 'primary', () => {
    const facelets = ui.A.join('');
    status.textContent = 'Počítám…';
    setTimeout(() => {
      let sol = '';
      try { sol = twoPhase(facelets, { timeLimit: 2500 }) ?? ''; } catch (e) { status.textContent = `Nejde: ${e.message} (je kostka vybarvená celá a správně?)`; return; }
      if (!sol.trim()) { status.textContent = 'Kostka je složená.'; return; }
      dlg.close();
      addSolution(sol.trim(), `Nejkratší řešení: ${sol.trim().split(' ').length} tahů`);
    }, 20);
  });
  const byMethod = btn('Složit mou metodou', 'primary', () => solveByMethod(status, () => dlg.close()));
  const sync = () => { const full = ui.A.every((c) => c !== model.EMPTY); shortest.disabled = !full; byMethod.disabled = !full; };
  const dlg = el('dialog', { className: 'help-dialog' },
    el('div', { className: 'gen-head' }, el('h2', { textContent: 'Moje kostka' }), close),
    el('p', { className: 'hint', textContent: 'Start = kostka, kterou máš v ruce – nafoť ji, nebo vezmi stav připojené chytré kostky. Cíl je složená kostka. Pak nejkratší řešení, nebo řešení tvou metodou krok po kroku (co uděláš v každém kroku).' }),
    el('div', { className: 'row-btns' }, fromCube, fromCam),
    el('div', { className: 'row-btns' }, shortest, byMethod),
    status);
  document.body.append(dlg);
  close.onclick = () => dlg.close();
  dlg.addEventListener('close', () => dlg.remove());
  sync();
  // připojená chytrá kostka = kostka v ruce: Start rovnou z ní
  if (smartCube.connected) fromCube.onclick();
  dlg.showModal();
}
/** Řešení tvou metodou (krok po kroku, ve workeru testu metody). */
function solveByMethod(status, done) {
  const method = methods.active();
  const guide = guides.get(method);
  const config = Object.fromEntries(guide.steps.map((st) => [st.id, stepConfig(method, st)]));
  let built;
  try { built = buildPlan({ guide, config, setAlgs: (id) => algs.list().filter((a) => a.set === id), ergonomics: ui.ergo, lambda }); } catch { built = null; }
  if (!built?.steps.length) { status.textContent = 'Aktivní metoda nemá kroky (Metoda → Sestavit).'; return; }
  const { plan, steps } = built;
  status.textContent = `Skládám metodou ${methods.get(method).name}… (${steps.length} kroků)`;
  const w = new Worker(new URL('../sim/sim-worker.js', import.meta.url), { type: 'module' });
  w.onmessage = ({ data }) => {
    w.terminate();
    if (data.type !== 'solved' || !data.solve.ok) { status.textContent = 'Metodou se to nepovedlo složit (zkus delší hledání u kroků v Sestavit).'; return; }
    // kroky v držení metody (zápis, jak je točíš), otočení kostky mezi kroky
    const parts = data.solve.steps.map((x, i) => ({ title: steps[i].st.title || `Krok ${i + 1}`, alg: [x.rotation, x.display].filter(Boolean).join(' ') })).filter((x) => x.alg);
    // celé řešení v zápisu modelu (pro přehrávač Labu); po krocích v držení metody
    const whole = data.solve.steps.map((x) => x.model).filter(Boolean).join(' ');
    done();
    addSolution(whole, `${methods.get(method).name}: ${parts.map((x) => `${x.title}: ${x.alg}`).join(' · ')}`);
  };
  w.onerror = () => { w.terminate(); status.textContent = 'Metodou se to nepovedlo složit (chyba při skládání).'; };
  w.postMessage({ type: 'plan', plan });
  w.postMessage({ type: 'solve', id: 0, keepModel: true, start: Array.from(fromFacelets(ui.A.join(''))) });
}

// Focení: stěna po stěně do vybarvení zvolené strany.
async function scan(side, onDone) {
  const { openScan } = await import('./scan.js');
  const spec = model.scan;
  openScan({
    onDone,
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

// --- Zadání šipkami ---------------------------------------------------------------------
// Místo barev se klepnutím zadají přesuny dílků (odkud → kam), u každého zda zachovat
// orientaci. U dílků bez šipky se volí, co pro ně musí platit (zůstat složený, smí se
// pohnout jen ve své vrstvě, jen zachovat orientaci, nebo nezáleží) – skutečná kostka
// často samotné prohození neumí (parita), takže se jiné dílky pohnout musí. Ze šipek
// se sestaví obyčejné zadání (výchozí strana = složené dílky, cíl = dílky na nových
// místech), takže hledání, přehrávač, trenažér i ukládání fungují jako u barev.

const arrowsAllowed = () => model.kind === 'perm' && !!model.flatView;
const slotName = (pos) => P().slots[P().SLOT_OF[pos]].name;
const slotType = (name) => P().slotByName(name).type;
let arrowView = null;
// vrstva dílku kostky podle názvu (U…, D…, jinak prostřední)
const layerOf = (name) => (name[0] === 'U' || name[0] === 'D' ? name[0] : 'E');
const layersAllowed = () => P().id === '333' || P().id === '222';
const restOf = (name) => (model.centers.includes(name) ? 'solved' : ui.restStyle[name] ?? ui.restDefault);

function setMode(mode) {
  if (mode === ui.mode || (mode === 'arrows' && !arrowsAllowed())) return;
  snapshot();
  if (mode === 'arrows') {
    // barevné zadání se schová a po návratu obnoví
    ui.colorBackup = { A: model.serialize(ui.A), B: model.serialize(ui.B), constraints: { ...ui.constraints }, marks: { ...ui.marks } };
    ui.mode = 'arrows';
    applyArrows();
  } else {
    ui.mode = 'colors';
    const b = ui.colorBackup;
    if (b) {
      ui.A = model.deserialize(b.A) ?? ui.A; ui.B = model.deserialize(b.B) ?? ui.B;
      ui.constraints = { ...b.constraints }; ui.marks = { ...(b.marks ?? {}) };
    }
    ui.colorBackup = null;
    taskChanged();
  }
  renderMode();
}

/** Úzký displej: upravuje se jedna strana zadání (velká kostka), přepínač Start / Cíl. */
function setSide(side) {
  ui.side = side;
  document.querySelector('.cubes').dataset.side = side;
  for (const b of $('side-switch').querySelectorAll('button')) b.classList.toggle('active', b.dataset.side === side);
}

function renderMode() {
  const arrows = ui.mode === 'arrows';
  $('side-switch').hidden = arrows;
  $('task-mode').hidden = !arrowsAllowed();
  for (const b of $('task-mode').querySelectorAll('button')) b.classList.toggle('active', b.dataset.mode === ui.mode);
  $('arrows-panel').hidden = !arrows;
  document.querySelector('.cubes').hidden = arrows;
  if (arrows) renderArrows();
  onSubChange(ui.sub);
}

/** Dílky bez šipky, jejichž místo zabere jiný dílek (musí se pohnout jinam). */
function displacedPieces() {
  const from = new Set(ui.arrows.map((a) => a.from));
  return ui.arrows.map((a) => a.to).filter((n) => !from.has(n));
}

/** Chyba šipek (nebo null). */
function arrowsError() {
  if (!ui.arrows.length) return 'Přidej aspoň jednu šipku: klepni na dílek a pak na místo, kam se má přesunout.';
  const stuck = displacedPieces().find((n) => restOf(n) === 'solved');
  if (stuck) {
    const a = ui.arrows.find((x) => x.to === stuck);
    return `Na místo ${stuck} se přesouvá ${a.from}, ale dílek ${stuck} má zůstat složený – přidej šipku i pro něj, nebo mu nastav „Ve vrstvě“, „Orientace“ či „Nezáleží“.`;
  }
  return parityError();
}

/**
 * Jsou-li místa všech rohů a hran pevně daná, musí jít o permutaci, kterou kostka
 * umí (samotné prohození dvou dílků neumí).
 */
function parityError() {
  const t = taskInfo();
  if (!t.target || !P().validate) return null;
  const fixed = P().slots.filter((s) => s.facelets.length > 1)
    .every((s) => t.constraints[s.name] === 'solved' || t.constraints[s.name] === 'permutation');
  if (!fixed || !P().validate(t.target)) return null;
  return 'Takové přesuny samy o sobě na kostce nejdou (lichá permutace, např. prohození jen dvou dílků). '
    + 'Povol pohyb dalších dílků: aspoň dvěma jiným rohům (nebo dvěma hranám) nastav „Ve vrstvě“, „Orientace“ nebo „Nezáleží“.';
}

/** Povolené polohy referenční nálepky dílku, který se smí hýbat jen ve své vrstvě (správně natočený). */
function layerAllow(name) {
  const piece = P().slotByName(name);
  return P().slots.filter((s) => s.type === piece.type && layerOf(s.name) === layerOf(name)).map((s) => s.facelets[0]);
}

/** Sestaví zadání (barvy obou stran a styly) ze šipek. */
function applyArrows() {
  const names = model.pieceNames;
  const moved = new Map(ui.arrows.map((a) => [a.from, a]));
  const displaced = new Set(displacedPieces());
  const tracked = names.filter((n) => moved.has(n) || restOf(n) !== 'ignore');
  ui.A = model.home(tracked);
  let B = model.home(tracked.filter((n) => !moved.has(n) && !displaced.has(n)));
  for (const a of ui.arrows) B = model.placePiece(B, a.from, a.to, 0);
  // vytlačené dílky na nějaké volné místo stejného typu (kde přesně, řeší omezení)
  for (const n of displaced) {
    if (!tracked.includes(n)) continue;
    const free = P().slots.find((s) => s.type === slotType(n) && model.homeEmpty(B, s.name));
    if (free) B = model.placePiece(B, n, free.name, 0);
  }
  ui.B = B;
  ui.marks = {};
  ui.constraints = Object.fromEntries(names.map((n) => {
    const a = moved.get(n);
    if (a) return [n, a.keep ? 'solved' : 'permutation'];
    const r = restOf(n);
    if (r === 'layer') return [n, { allow: layerAllow(n) }];
    return [n, r];
  }));
  save();
  renderCubes();
  renderTaskStatus();
  clearResults();
  if (ui.mode === 'arrows') renderArrows();
}

function tapArrow(pos) {
  const name = slotName(pos);
  if (ui.arrowTool !== 'arrow') {
    // styl dílku bez šipky
    if (model.centers.includes(name) || restOf(name) === ui.arrowTool) return;
    snapshot();
    ui.restStyle[name] = ui.arrowTool;
    applyArrows();
    return;
  }
  const sel = ui.arrowSel;
  if (!sel || sel === name || slotType(sel) !== slotType(name) || model.centers.includes(name)) {
    ui.arrowSel = sel === name || model.centers.includes(name) ? null : name;
    renderArrows();
    return;
  }
  snapshot();
  // jedna šipka z každého dílku a jedna do každého místa
  ui.arrows = ui.arrows.filter((a) => a.from !== sel && a.to !== name);
  ui.arrows.push({ from: sel, to: name, keep: $('arrow-keep').checked });
  ui.arrowSel = null;
  applyArrows();
}

/** Nástroje: šipka a styly dílků bez šipky. */
function renderArrowTools() {
  const tools = [{ type: 'arrow', label: '➚ Šipka', title: 'Klepni na dílek a pak na místo, kam se má přesunout' },
    ...REST_STYLES.filter((r) => r.type !== 'layer' || layersAllowed())];
  $('arrow-tools').replaceChildren(...tools.map(({ type, label, title, sw }) => {
    const b = el('button', { type: 'button', className: 'style-btn', title },
      sw ? el('i', { className: `sw ${sw}` }) : null, el('span', { textContent: label }));
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(ui.arrowTool === type));
    b.onclick = () => { ui.arrowTool = type; ui.arrowSel = null; renderArrows(); };
    return b;
  }));
  const all = $('arrow-all');
  const rest = REST_STYLES.find((r) => r.type === ui.arrowTool);
  all.hidden = !rest;
  if (rest) all.textContent = `Všem dílkům bez šipky: ${rest.label}`;
}

/** Střed nálepky v síti (z bodů polygonu). */
function centerOf(points) {
  const pts = points.trim().split(/\s+/).map((p) => p.split(',').map(Number));
  return pts.reduce((a, [x, y]) => [a[0] + x / pts.length, a[1] + y / pts.length], [0, 0]);
}

function renderArrows() {
  if (!arrowsAllowed()) return;
  const v = model.flatView;
  if (!arrowView || arrowView.puzzle !== model.id) {
    arrowView = new NetView($('cube-arrows'), { label: 'Přesuny dílků', viewBox: v.viewBox, polys: v.polys, onSticker: tapArrow, fill: true });
    arrowView.puzzle = model.id;
  }
  const moving = new Set(ui.arrows.map((a) => a.from));
  const home = model.home(model.pieceNames);
  arrowView.render(home.map((color, pos) => {
    const name = slotName(pos);
    const style = moving.has(name) || name === ui.arrowSel ? 'solid' : REST_STYLES.find((r) => r.type === restOf(name))?.sw ?? 'solid';
    return { color, style, selected: name === ui.arrowSel };
  }));
  // šipky od referenční nálepky zdroje k referenční nálepce cíle
  const ref = (name) => centerOf(v.polys[P().slotByName(name).facelets[0]]);
  // oblouk doprava od směru šipky – protisměrné šipky (prohození) se nepřekryjí
  const lines = ui.arrows.map((a) => {
    const [x1, y1] = ref(a.from), [x2, y2] = ref(a.to);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const bend = Math.min(0.6, len * 0.2);
    const cx = (x1 + x2) / 2 - ((y2 - y1) / len) * bend, cy = (y1 + y2) / 2 + ((x2 - x1) / len) * bend;
    const tl = Math.hypot(x2 - cx, y2 - cy) || 1;
    const ux = (x2 - cx) / tl, uy = (y2 - cy) / tl; // směr hrotu
    const ex = x2 - ux * 0.12, ey = y2 - uy * 0.12; // hrot kousek před středem
    const head = `${ex},${ey} ${ex - ux * 0.22 - uy * 0.12},${ey - uy * 0.22 + ux * 0.12} ${ex - ux * 0.22 + uy * 0.12},${ey - uy * 0.22 - ux * 0.12}`;
    const d = `M${x1},${y1} Q${cx},${cy} ${ex - ux * 0.15},${ey - uy * 0.15}`;
    return `<path class="nv-arrow-halo" d="${d}"/><path class="nv-arrow${a.keep ? '' : ' free'}" d="${d}"/><polygon class="nv-arrowhead" points="${head}"/>`;
  });
  arrowView.setOverlay(lines.join(''));
  const list = $('arrow-list');
  list.replaceChildren(...(ui.arrows.length ? ui.arrows.map((a, i) => {
    const ori = el('button', { type: 'button', className: `secondary small ori${a.keep ? ' on' : ''}`, textContent: a.keep ? 'orientace: zachovat' : 'orientace: nezáleží', title: 'Přepnout, zda má dílek skončit správně natočený' });
    ori.onclick = () => { snapshot(); ui.arrows[i] = { ...a, keep: !a.keep }; applyArrows(); };
    const del = el('button', { type: 'button', className: 'icon-btn', ariaLabel: `Smazat šipku ${a.from} → ${a.to}`, textContent: '×' });
    del.onclick = () => { snapshot(); ui.arrows.splice(i, 1); applyArrows(); };
    return el('li', {}, el('b', { textContent: `${a.from} → ${a.to}` }), ori, del);
  }) : [el('li', { className: 'empty', textContent: ui.arrowSel ? `Vybráno ${ui.arrowSel} – klepni, kam se má přesunout.` : 'Zatím žádná šipka.' })]));
  if (ui.arrowSel && ui.arrows.length) list.append(el('li', { className: 'empty', textContent: `Vybráno ${ui.arrowSel} – klepni, kam se má přesunout.` }));
  renderArrowTools();
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
    ['aufScale', 'AUF před a po algoritmu (násobek ceny U)', 0.1],
    ['maxWristTurn', 'Max. ¼ zápěstím bez přehmatu', 1],
    ['flowScale', 'Návaznost tahů – prstoklad (násobek)', 0.1],
    ['reuse', 'Stejný prst dvakrát po sobě', 0.1],
    ['sameHand', 'Dva prstové tahy jednou rukou', 0.05],
    ['sliceBottom', 'M hned po D/E nebo naopak (prsty přes spodek)', 0.1],
    ['alternate', 'Bonus za střídání rukou', 0.05],
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

/** Porovnání dvojic: jen 3×3 (sbírka algoritmů je pro 3×3), kolik odpovědí už je. */
function renderCompare() {
  const on = model.id === '333';
  $('ergo-compare-box').hidden = !on;
  $('ergo-smart').hidden = !on;
  if (!on) return;
  const all = preferencesOf(model.id);
  const mine = all.filter((p) => p.source === 'compare').length;
  $('ergo-compare-info').textContent = all.length
    ? `Uloženo ${mine} porovnání${all.length > mine ? ` a ${all.length - mine} voleb z generátoru` : ''} – další je zpřesní.`
    : 'Zatím žádné porovnání.';
  $('ergo-compare-clear').hidden = !all.length;
}

function renderErgo() {
  renderCompare();
  const kind = P().ergonomics;
  $('ergo-left-row').hidden = kind !== 'cube';
  $('ergo-left').checked = !!ui.ergo.leftHanded;
  $('ergo-main').replaceChildren(...ERGO_FIELDS[kind].map(([key, label, step]) =>
    el('label', { className: 'field' }, label, numberInput(ui.ergo[key], step, (v) => { ui.ergo[key] = v; ergoEdited(); }))));
  const head = $('ergo-moves-head');
  $('ergo-fingering-box').hidden = kind !== 'cube';
  if (kind === 'cube') renderFingering();
  renderPairs(kind);
  if (kind === 'cube') {
    head.replaceChildren('Váhy tahů ', el('small', { textContent: 'po směru / proti / dvojitě' }));
    const bases = P().bases.filter((b) => !P().rotations.includes(b));
    $('ergo-moves').replaceChildren(...bases.map((b) => el('div', { className: 'ergo-move' }, el('b', { textContent: b }),
      ...[0, 1, 2].map((i) => numberInput(ui.ergo.moveWeights[b][i], 0.1, (v) => {
        const w = [...ui.ergo.moveWeights[b]];
        w[i] = v;
        ui.ergo.moveWeights = { ...ui.ergo.moveWeights, [b]: w };
        ergoEdited();
      }, `${b} ${['po směru', 'proti', 'dvojitě'][i]}`)))));
  } else if (kind === 'simple') {
    head.replaceChildren('Váhy tahů ', el('small', { textContent: 'po směru / proti' }));
    $('ergo-moves').replaceChildren(...P().bases.map((b) => el('div', { className: 'ergo-move two' }, el('b', { textContent: b }),
      ...[0, 1].map((i) => numberInput(ui.ergo.weights[b][i], 0.1, (v) => {
        const w = [...ui.ergo.weights[b]];
        w[i] = v;
        ui.ergo.weights = { ...ui.ergo.weights, [b]: w };
        ergoEdited();
      }, `${b} ${['po směru', 'proti'][i]}`)))));
  } else {
    head.replaceChildren('Otočení vrstvy ', el('small', { textContent: 'o 1–6 dvanáctin' }));
    $('ergo-moves').replaceChildren(...[1, 2, 3, 4, 5, 6].map((n) => el('div', { className: 'ergo-move one' }, el('b', { textContent: `±${n}` }),
      numberInput(ui.ergo.turn[n], 0.1, (v) => {
        const t = [...ui.ergo.turn];
        t[n] = v;
        ui.ergo.turn = t;
        ergoEdited();
      }, `Otočení o ${n}`))));
  }
}

/** Naučené návaznosti dvojic tahů (pairWeights): čip = smazat. */
function renderPairs(kind) {
  const w = kind === 'cube' ? ui.ergo.pairWeights ?? {} : {};
  const keys = Object.keys(w).sort((a, b) => Math.abs(w[b]) - Math.abs(w[a]));
  $('ergo-pairs-box').hidden = !keys.length;
  $('ergo-pairs').replaceChildren(...keys.map((k) => el('button', {
    type: 'button', className: `chip ergo-pair ${w[k] > 0 ? 'up' : 'down'}`, title: 'Smazat',
    textContent: `${k.replace('>', ' → ')} ${w[k] > 0 ? '+' : '−'}${String(Math.abs(w[k])).replace('.', ',')}`,
    onclick: () => {
      const next = { ...ui.ergo.pairWeights };
      delete next[k];
      ui.ergo = { ...ui.ergo, pairWeights: next };
      ergoEdited();
      renderErgo();
    },
  })));
}

/**
 * Soupeři algoritmu ze sady: krátké hledání pro jeho zadání (tahy Labu + tahy algoritmu,
 * držení algoritmu). Vrací řešení v zápisu držení bez AUF.
 */
function searchRivals(a, seconds) {
  const m = labModel('333');
  const P3 = m.P;
  let built;
  try { built = m.buildTask(m.deserialize(a.task.colorsA), m.deserialize(a.task.colorsB), a.task.constraints, a.task.marks); } catch { built = null; }
  if (!built?.loc) return Promise.resolve([]);
  const h = a.task.hold ? holdFor(m, a.task.hold) : null;
  const own = [];
  try { for (const x of P3.parseAlg(a.alg.replace(/[()]/g, ' '))) if (!P3.rotations.includes(x.base)) own.push(x); } catch { return Promise.resolve([]); }
  const bases = new Set([...(model.id === '333' ? ui.bases : []), ...own.map((x) => x.base)]);
  const amounts = new Set([...(model.id === '333' ? ui.amounts : []), ...own.map((x) => x.amount)]);
  const moves = [...bases].flatMap((base) => P3.amountsOf(base).filter((x) => amounts.has(x)).map((amount) => ({ base, amount })));
  const toModel = (list) => (h ? list.map((x) => h.toModel([x])[0]) : list);
  const auf = toModel([1, -1, 2].map((amount) => ({ base: 'U', amount })));
  const toHeld = (alg) => (alg && h ? h.toHeldString(alg) : alg);
  const job = {
    puzzle: '333', start: built.loc, target: built.target, constraints: built.constraints, moves: toModel(moves), ergonomics: prefConfig(),
    held: moves, auf: { pre: auf, post: auf }, seeds: [],
    options: { lambda, maxLength: 20, extraDepth: 2, maxResults: 300, timeLimit: seconds * 1000, library: [] },
  };
  return new Promise((resolve) => {
    const found = new Set();
    rivalClient.start(job, {
      onSolutions: (items) => { for (const it of items) { try { found.add(toHeld(it.alg)); } catch { /* jiný zápis */ } } },
      onDone: () => resolve([...found]),
      onError: () => resolve([...found]),
    });
  });
}
const rivalClient = new SearchClient();

/** Můj prstoklad: u každého prstového tahu ruka (nebo podle situace). */
function renderFingering() {
  const f = ui.ergo.fingering ?? {};
  $('ergo-fingering').replaceChildren(...FINGER_MOVES.filter((t) => P().bases.includes(t[0])).map((t) => {
    const def = defaultFinger(t);
    const sel = el('select', { ariaLabel: `${t} – ruka` },
      el('option', { value: '', textContent: 'Podle situace' }),
      el('option', { value: 'R', textContent: 'Pravá ruka' }),
      el('option', { value: 'L', textContent: 'Levá ruka' }));
    sel.value = f[t] ?? '';
    sel.onchange = () => {
      const next = { ...(ui.ergo.fingering ?? {}) };
      if (sel.value) next[t] = sel.value; else delete next[t];
      ui.ergo = { ...ui.ergo, fingering: next };
      if (ui.ergo.prefBase) ui.ergo.prefBase = { ...ui.ergo.prefBase, fingering: next };
      ergoChanged();
    };
    return el('label', { className: 'ergo-finger' }, el('b', { textContent: t }), sel,
      el('small', { textContent: `aplikace: ${def.join(', nebo ')}` }));
  }));
}

/** Ruční změna vah: ta je nový základ pro doladění podle voleb. */
function ergoEdited() {
  delete ui.ergo.prefBase;
  ergoChanged();
}

/**
 * Základ pro doladění podle voleb: váhy před prvním doladěním (jinak by každé další
 * doladění posouvalo váhy dál stejnými odpověďmi), s dnešním nastavením leváka.
 */
function prefConfig() {
  const { prefBase, ...cur } = ui.ergo;
  return prefBase ? { ...prefBase, leftHanded: cur.leftHanded } : cur;
}
function applyPrefs(res, base, what) {
  ui.ergo = { ...res.config, prefBase: base };
  delete ui.ergo.pairs;
  renderErgo();
  ergoChanged();
  $('ergo-calibration').textContent = `${what ?? `Podle ${res.used} porovnání a voleb (hodnocení souhlasí s ${res.agree} z ${res.decided}, předtím s ${res.before})`}: `
    + (res.changes.length ? res.changes.map((c) => `${featureLabel(c.key)} ${c.from} → ${c.to}`).join(', ') : 'váhy sedí, nic se nezměnilo.');
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
  keepAwake(false);
  ui.results.clear();
  ui.chosen = null;
  ui.proof = 0;
  ui.progress = null;
  searchUi(false);
  $('status').textContent = loadFound() ? `Uložená řešení z minulého hledání (${ui.results.size}) – „Hledat“ na ně naváže a dál je zlepšuje.` : '';
  renderResults();
  renderPlayer();
}

// --- Uložená řešení: dlouhé hledání jde přerušit a navázat ------------------------------
// Nejlepší řešení každého zadání se průběžně ukládají (posledních 12 zadání). Po návratu
// do Labu (i když prohlížeč aplikaci na pozadí zastavil) se ukážou a další hledání
// z nich vychází.

const FOUND_INDEX = 'ergocube.lab.found';
function taskKey() {
  const text = JSON.stringify([model.id, ui.hold, ui.constraints, ui.marks, model.serialize(ui.A), model.serialize(ui.B),
    model.kind === 'sq1' ? ui.sq1 : [ui.bases, ui.amounts]]);
  let h1 = 2166136261, h2 = 5381;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (Math.imul(h2, 33) + c) | 0; }
  return `${FOUND_INDEX}.${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

/** Podpis nastavení, na kterém závisí průběh hledání (hodnocení, AUF) – pro navázání. */
function progressSig(useAuf) {
  const text = JSON.stringify([ui.ergo, useAuf]);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Nejlepší řešení v každém pohledu (sjednocení prvních `per`). */
function topResults(per) {
  const { list, ranks } = rankedResults();
  return list.filter((x) => Object.values(ranks.get(x)).some((r) => r <= per)).map((x) => x.alg);
}

let saveTimer = null;
function saveFound(now = false) {
  clearTimeout(saveTimer);
  const doSave = () => {
    if (!ui.results.size) return;
    const key = taskKey();
    storage.set(key, { at: Date.now(), algs: topResults(40), proof: ui.proof, progress: ui.progress ?? null });
    const index = [key, ...(storage.get(FOUND_INDEX) ?? []).filter((k) => k !== key)];
    for (const old of index.splice(12)) storage.remove(old);
    storage.set(FOUND_INDEX, index);
  };
  if (now) doSave(); else saveTimer = setTimeout(doSave, 1500);
}

function loadFound() {
  const data = storage.get(taskKey());
  if (!data?.algs?.length) return false;
  for (const alg of data.algs) { try { ui.results.set(alg, score(alg)); } catch { /* neplatný zápis */ } }
  ui.proof = data.proof ?? 0;
  ui.progress = data.progress ?? null;
  return ui.results.size > 0;
}

// Obrazovka během hledání nezhasne (jen dokud je aplikace otevřená).
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && client.running) keepAwake(true); });

function searchUi(running) {
  $('search').disabled = running;
  $('stop').disabled = !running;
}

const num = (id, min, max) => Math.min(max, Math.max(min, Math.round(Number($(id).value) || min)));

function startSearch() {
  const { tracked, loc, target, errors, constraints } = taskInfo();
  const arrowErr = ui.mode === 'arrows' ? arrowsError() : null;
  if (arrowErr) { $('status').textContent = `Zadání není v pořádku: ${arrowErr}`; return; }
  if (errors.length || !loc) { $('status').textContent = `Zadání není v pořádku: ${errors[0]}`; return; }
  if (!tracked.some((n) => !model.centers.includes(n))) { $('status').textContent = 'V cíli není označený žádný dílek.'; return; }
  const moveSet = currentMoveSet();
  if (model.kind === 'perm' && !moveSet.moves.length) { $('status').textContent = 'Nejsou povolené žádné tahy (Tahy a váhy).'; return; }
  // dosavadní řešení zůstávají a hledání z nich vychází (navázání po přerušení)
  if (client.running) client.cancel();
  const toModel = (alg) => (alg && ui.hold ? held().toModelString(alg) : alg);
  const seeds = model.kind === 'perm' ? topResults(15).map((alg) => {
    const { pre, core, post } = splitAuf(alg);
    return { alg: toModel(core), pre: toModel(pre), post: toModel(post) };
  }) : [];
  keepAwake(true);
  const shown = num('opt-results', 1, 500);
  const useAuf = aufAllowed() && $('opt-auf').checked;
  storage.set('ergocube.lab.auf', $('opt-auf').checked);
  const opts = {
    lambda,
    maxLength: num('opt-max', 1, 30),
    extraDepth: num('opt-extra', 0, 6),
    // hledá se víc kandidátů, než se ukáže – z nich se vybírají nejlepší v každém pohledu
    // (pro „Rychlost“ jsou potřeba i delší plynulé algoritmy, hledání jde od nejkratších)
    maxResults: Math.min(5000, Math.max(3000, shown * 200)),
    timeLimit: num('opt-time', 1, 3600) * 1000,
    library: model.kind === 'perm' ? libraryAlgs() : [],
  };
  // navázání: co už bylo prohledané (jen se stejným hodnocením a AUF – na nich průběh závisí)
  const sig = progressSig(useAuf);
  if (seeds.length && ui.progress?.sig === sig) opts.resume = { cleared: ui.progress.cleared, comfortDone: ui.progress.comfortDone };
  searchUi(true);
  $('status').textContent = seeds.length ? `Navazuji na ${seeds.length} dosavadních řešení…` : 'Spouštím…';
  let pending = false;
  const scheduleRender = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; renderResults(); });
  };
  ui.proof = 0;
  ui.speedProof = false;
  const aufMoves = useAuf ? toModelSteps([1, -1, 2].map((amount) => ({ base: 'U', amount }))) : null;
  const toHeld = (alg) => (alg && ui.hold ? held().toHeldString(alg) : alg);
  client.start({
    puzzle: model.id, start: loc, target, constraints, moves: moveSet.engineMoves, options: opts, ergonomics: ui.ergo,
    held: model.kind === 'perm' ? moveSet.moves : undefined,
    auf: aufMoves ? { pre: aufMoves, post: aufMoves } : null,
    seeds,
    sq1: { shape: ui.sq1.shape, top: ui.sq1.top, bottom: ui.sq1.bottom },
  }, {
    onProgress: (p) => {
      if (p.phase === 'search' && p.cleared > ui.proof) { ui.proof = p.cleared; scheduleRender(); }
      $('status').textContent = p.phase === 'tables'
        ? `Připravuji heuristiku ${p.table}/${p.tables}…`
        : `${searchPhaseText(p)} · nalezeno ${p.found} · ${(p.elapsed / 1000).toFixed(1)} s${p.workers > 1 ? ` · ${p.workers} vlákna` : ''}`;
    },
    onSolutions: (items) => {
      for (const { alg, pre, post } of items) {
        const a = joinAuf(toHeld(pre), toHeld(alg), toHeld(post));
        ui.results.set(a, score(a));
      }
      scheduleRender();
      saveFound();
    },
    onDone: (d) => {
      searchUi(false);
      keepAwake(false);
      ui.proof = Math.max(ui.proof, d.cleared ?? 0);
      ui.speedProof = !!d.speedOptimal;
      ui.progress = { sig, cleared: ui.proof, comfortDone: d.comfortDone ?? [] };
      const why = {
        done: 'Hotovo', time: 'Vypršel časový limit', results: 'Dosažen max. počet kandidátů',
        'not-found': `Do ${opts.maxLength} ${unit()} nic nenalezeno`,
        unsolvable: 'S povolenými tahy to vyřešit nejde',
        'already-solved': 'Výchozí stav už cíl splňuje',
      }[d.reason] ?? d.reason;
      const shortest = d.optimal ?? null;
      const proof = shortest && ui.proof >= shortest ? ` · ✓ kratší než ${shortest} ${unit()} není`
        : ui.proof > 1 && Number.isFinite(ui.proof) ? ` · ověřeno: pod ${ui.proof} ${unit()} řešení není` : '';
      if (d.reason === 'unsolvable' && !d.found) showUnsolvable();
      else $('status').textContent = `${why} · ${d.found} řešení${shortest ? ` · nejkratší ${shortest} ${unit()}` : ''}${proof}${ui.speedProof ? ' · ✓ rychlejší není' : ''} · ${(d.elapsed / 1000).toFixed(1)} s`;
      renderResults();
      saveFound(true);
      if (!ui.chosen && ui.results.size) choose(sortedResults()[0].alg, false);
    },
    onError: (e) => { searchUi(false); keepAwake(false); $('status').textContent = `Chyba: ${e.message}`; },
  });
}

const ALL_FACES = ['R', 'L', 'U', 'D', 'F', 'B'];

/**
 * Hledání skončilo hned: s povolenými tahy cíl nejde splnit (dílky, které se mají
 * přesunout, se povolenými tahy na svá místa vůbec nedostanou). Řekne, které tahy
 * jsou povolené, a nabídne přidat ostatní.
 */
function showUnsolvable() {
  const names = model.kind === 'perm' ? ui.bases.join(' ') : '';
  const text = `S povolenými tahy${names ? ` (${names})` : ''} se Start na Cíl dostat nedá – žádné řešení neexistuje, ať se hledá jakkoli dlouho.`;
  const nodes = [el('span', { className: 'bad', textContent: text })];
  const more = model.kind === 'perm' ? ALL_FACES.filter((b) => P().bases.includes(b) && !ui.bases.includes(b)) : [];
  if (more.length) {
    const b = el('button', { type: 'button', className: 'chip unsolvable-fix', textContent: `Povolit i ${more.join(' ')} a hledat znovu` });
    b.onclick = () => { ui.bases = [...ui.bases, ...more]; save(); renderMoveSet(); clearResults(); startSearch(); };
    nodes.push(' ', b);
  } else {
    nodes.push(' ', el('span', { className: 'hint', textContent: 'Zkontroluj zadání, nebo v kroku Tahy přidej další tahy.' }));
  }
  $('status').replaceChildren(...nodes);
}

// Pohled na výsledky: všestranné / rychlost / efektivita – každý řadí všechna řešení
// jinak (viz ergonomics/style.js). Pořadí v ostatních pohledech se ukazuje u řádků.
let view = VIEWS[storage.get('ergocube.lab.view')] ? storage.get('ergocube.lab.view') : 'balanced';
// Poměr vyváženého pohledu (posuvník kratší ↔ rychlejší).
let lambda = Number.isFinite(storage.get('ergocube.lab.lambda')) ? storage.get('ergocube.lab.lambda') : DEFAULT_LAMBDA;
let ranked = null; // { list, ranks } – zahodí se při každém vykreslení výsledků
function rankedResults() {
  if (!ranked || ranked.size !== ui.results.size) {
    const cube = P().ergonomics === 'cube';
    const list = [...ui.results].map(([alg, s]) => ({ alg, score: s, m: styleMetrics(s, cube) }));
    ranked = { size: ui.results.size, list, ranks: ranksOf(list, { lambda }) };
  }
  return ranked;
}

function sortedResults() {
  const { list, ranks } = rankedResults();
  return rankResults(list, view, { lambda }).map((x) => ({ ...x, ranks: ranks.get(x) }));
}

/** Je nejkratší nalezená délka ověřená (úplná sada prohledala všechny kratší)? */
const provenShortest = (length) => ui.proof >= length;

/** Co hledání právě dělá (úlohy viz search/worker.js: trojice tahů a úplná sada). */
function searchPhaseText(p) {
  if (p.task === 'subset') return `Zlepšuji: prohledávám tahy ${p.label} do ${p.depth} ${unit()}`;
  if (p.task === 'comfort') return `Zlepšuji rychlost: hledám rychlejší řešení na ${p.depth} ${unit()}`;
  if (p.task === 'blocks') return `Zlepšuji pohodlí: skládám z triggerů a bloků (${p.depth} kroků)`;
  if (p.task === 'library') return 'Zkouším tvoje uložené a známé algoritmy s nastavením';
  if (p.task === 'staged') return p.stage
    ? `Hledám první řešení po částech: hotovo ${p.stage.done}/${p.stage.total} dílků (${p.stage.length} ${unit()})`
    : 'Hledám první řešení po částech…';
  if (p.task === 'refine') return `Zlepšuji ${VIEWS[p.view]?.label.toLowerCase() ?? ''}: přeřešuji úseky po ${p.label} ${unit()} (${p.current} ${unit()})`;
  if (p.task === 'full' && p.best && p.depth < p.best) return `Nejkratší zatím ${p.best} ${unit()} · zkouším všechny tahy: jde to za ${p.depth}?`;
  if (p.task === 'full') return `Zlepšuji: prohledávám všechny tahy do ${p.depth} ${unit()}`;
  return `Hloubka ${p.depth}`;
}

/** Nejlepší zatím v každém pohledu – klepnutím se algoritmus otevře v přehrávači. */
function renderBests() {
  const box = $('search-bests');
  const { list, ranks } = rankedResults();
  box.hidden = !list.length;
  if (!list.length) { box.replaceChildren(); return; }
  box.replaceChildren(...Object.entries(VIEWS).map(([id, v]) => {
    const top = list.find((x) => ranks.get(x)[id] === 1);
    const m = top.m;
    const facts = id === 'efficient' ? `${m.length} ${unit()}`
      : `${m.regrips + m.rotations ? `${m.regrips + m.rotations}× přehmat` : 'bez přehmatů'} · ${m.length} ${unit()}`;
    const proven = id === 'efficient' && provenShortest(m.length);
    const comfy = id === 'speed' && ui.speedProof;
    const b = el('button', { type: 'button', className: `best-chip view-${id}${top.alg === ui.chosen ? ' on' : ''}`, title: v.text },
      el('span', { className: 'best-head', textContent: `${v.icon} ${v.label}` }),
      el('code', { textContent: top.alg }),
      el('small', {}, facts,
        proven ? el('span', { className: 'proof', title: 'Úplné hledání se všemi povolenými tahy prošlo všechny kratší délky a nic nenašlo', textContent: ' · ✓ nejkratší možné' }) : null,
        comfy ? el('span', { className: 'proof', title: 'Prošly se všechny délky, do kterých by se rychlejší algoritmus s povolenými tahy vešel (i s bonusy za triggery)', textContent: ' · ✓ nejrychlejší možné' }) : null));
    b.onclick = () => choose(top.alg, true);
    return b;
  }));
}

/**
 * Styly: nejlepší řešení (podle zvoleného pohledu) z každé skupiny podle tahů, které
 * používá – jen R a U, s M, s F, s D, s L… Místo několika skoro stejných variant si
 * vybereš, co ti sedí do ruky.
 */
const groupOf = (alg) => {
  let bases;
  try { bases = new Set(model.steps(alg).map((m) => m.base ?? String(m))); } catch { return null; }
  const rest = [...bases].filter((b) => b !== 'U' && b !== 'R').sort();
  return rest.length ? `R U + ${rest.join(' ')}` : bases.has('R') ? 'jen R U' : [...bases].sort().join(' ');
};
function renderGroups() {
  const box = $('search-styles');
  const list = model.id !== 'sq1' ? sortedResults() : [];
  const groups = new Map();
  for (const x of list) {
    const st = groupOf(x.alg);
    if (st && !groups.has(st)) groups.set(st, x);
  }
  box.hidden = groups.size < 2;
  if (box.hidden) { box.replaceChildren(); return; }
  box.replaceChildren(el('span', { className: 'styles-head', textContent: `Podle stylu (${VIEWS[view].label.toLowerCase()}):` }),
    ...[...groups].slice(0, 8).map(([st, x]) => {
      const b = el('button', { type: 'button', className: `style-chip${x.alg === ui.chosen ? ' on' : ''}`, title: x.alg },
        el('b', { textContent: st }), el('small', { textContent: `${x.m.length} ${unit()} · ${x.score.total.toFixed(1)}` }));
      b.onclick = () => choose(x.alg, true);
      return b;
    }));
}

/** Přepínač pohledu nad výsledky. */
function renderStyleFilter() {
  const box = $('style-filter');
  box.hidden = !ui.results.size;
  box.replaceChildren(...Object.entries(VIEWS).map(([id, v]) => {
    const b = el('button', { type: 'button', className: `${id === view ? 'active' : ''} view-${id}`, title: v.text }, `${v.icon} ${v.label}`);
    b.onclick = () => { view = id; storage.set('ergocube.lab.view', id); renderResults(); };
    return b;
  }));
  $('view-hint').textContent = ui.results.size ? VIEWS[view].text : '';
  $('lambda-row').hidden = !ui.results.size || view !== 'balanced';
  $('lambda').value = String(lambda);
}

/** Graf délka × pohodlí: všechna řešení a Paretova hranice (klepnutím se otevře). */
function renderPareto() {
  const box = $('pareto-box');
  const { list } = rankedResults();
  box.hidden = list.length < 2 || model.kind === 'sq1';
  if (box.hidden || !box.open) return;
  const W = 320, H = 180, L = 18, R = 12, T = 22, B = 26;
  const xs = list.map((x) => x.m.length), ys = list.map((x) => speedValue(x.m));
  const x0 = Math.min(...xs), x1 = Math.max(x0 + 1, ...xs);
  const y0 = Math.min(...ys), y1 = Math.max(y0 + 1, ...ys);
  const sx = (v) => L + 8 + ((v - x0) / (x1 - x0)) * (W - L - R - 16);
  const sy = (v) => T + ((v - y0) / (y1 - y0)) * (H - T - B); // nahoře pohodlnější (nižší hodnota)
  const ns = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Řešení podle délky a pohodlí' });
  root.append(svg('line', { class: 'axis', x1: L, y1: H - B, x2: W - R, y2: H - B }), svg('line', { class: 'axis', x1: L, y1: T, x2: L, y2: H - B }));
  const step = Math.max(1, Math.ceil((x1 - x0) / 8));
  for (let v = x0; v <= x1; v += step) root.append(svg('text', { class: 'tick', x: sx(v), y: H - B + 12, 'text-anchor': 'middle' }, String(v)));
  root.append(svg('text', { class: 'tick', x: (L + W - R) / 2, y: H - 2, 'text-anchor': 'middle' }, `${unit()} →`));
  root.append(svg('text', { class: 'tick', x: 2, y: 2, 'dominant-baseline': 'hanging' }, '↑ rychlejší'));
  // ostatní řešení (stejná místa jen jednou)
  const seen = new Set();
  for (const x of list) {
    const key = `${x.m.length}|${speedValue(x.m).toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    root.append(svg('circle', { class: 'dot', cx: sx(x.m.length), cy: sy(speedValue(x.m)), r: 2.5 }));
  }
  const front = paretoFront(list);
  root.append(svg('polyline', { class: 'front-line', points: front.map((x) => `${sx(x.m.length)},${sy(speedValue(x.m))}`).join(' ') }));
  for (const x of front) {
    const cx = sx(x.m.length), cy = sy(speedValue(x.m));
    const g = svg('g', {});
    g.append(svg('circle', { class: 'front', cx, cy, r: 4.5 }));
    if (x.alg === ui.chosen) g.append(svg('circle', { class: 'chosen', cx, cy, r: 8 }));
    const hit = svg('circle', { class: 'hit', cx, cy, r: 11, tabindex: 0, role: 'button', 'aria-label': x.alg });
    hit.append(svg('title', {}, `${x.alg}\n${x.m.length} ${unit()} · ${x.m.regrips + x.m.rotations ? `${x.m.regrips + x.m.rotations}× přehmat` : 'bez přehmatů'} · čas provedení ${speedValue(x.m).toFixed(1)}`));
    hit.onclick = () => choose(x.alg, true);
    hit.onkeydown = (e) => { if (e.key === 'Enter') choose(x.alg, true); };
    g.append(hit);
    root.append(g);
  }
  $('pareto').replaceChildren(root);
}

/** Údaj podstatný pro pohled (přehmaty a plynulost / počet tahů). */
function viewFacts(m) {
  const grips = m.regrips + m.rotations;
  const speed = `${grips ? `${grips}× přehmat${m.rotations ? '/rotace' : ''}` : 'bez přehmatů'} · ${m.fluency.toFixed(2)}/tah`;
  return view === 'efficient' ? `${m.length} ${unit()}` : view === 'speed' ? speed : `${m.length} ${unit()} · ${speed}`;
}

/** Odznaky „1. v rychlosti“ apod. pro výsledky v první trojce jiného pohledu. */
const rankBadges = (ranks) => Object.keys(VIEWS).filter((id) => id !== view && ranks?.[id] <= 3)
  .map((id) => el('span', { className: `style-tag ${id}`, title: `${ranks[id]}. v pohledu ${VIEWS[id].label}`, textContent: `${VIEWS[id].icon} ${ranks[id]}.` }));

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
  // AUF na začátku a na konci: hodnocení (perMove, triggery) je jen pro jádro
  const { pre, post } = splitAuf(alg);
  const off = pre ? 1 : 0, end = steps.length - (post ? 1 : 0);
  const trig = new Set();
  for (const t of s.triggers) for (let i = t.start; i < t.start + t.length; i++) trig.add(i + off);
  return el('div', { className: 'moves' }, ...steps.map((m, i) => {
    const auf = i < off || i >= end;
    const text = auf ? `(${model.stepToString(m)})` : model.stepToString(m);
    const bad = moveSet && !model.allows(moveSet, m) && !auf;
    const why = auf ? null : s.perMove?.[i - off]?.flowReason;
    const cls = ['mv', auf ? 'auf' : moveClass(text), trig.has(i) && 'trig', why && 'flowbad', i === current && 'current', bad && 'bad'].filter(Boolean).join(' ');
    const title = auf ? 'AUF – natočení horní vrstvy, do délky se nepočítá' : why ? `Návaznost: ${why}` : '';
    if (!onStep) return el('span', { className: cls, textContent: text, title });
    const b = el('button', { type: 'button', className: cls, textContent: text, title });
    b.onclick = () => onStep(i + 1);
    return b;
  }));
}

function bar(b) {
  const parts = [['b-moves', b.moves], ['b-rot', b.rotations], ['b-regrip', b.regrips], ['b-grip', b.gripChanges], ['b-flow', Math.max(0, b.flow ?? 0)]];
  const total = parts.reduce((a, [, v]) => a + v, 0) || 1;
  return el('span', { className: 'bar', title: 'Tahy / rotace / přehmaty / úchopy / návaznost' },
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
  ...(Object.keys(ui.marks).length ? { marks: { ...ui.marks } } : {}),
  ...(model.kind === 'sq1' ? { shape: ui.sq1.shape } : {}),
});
// Sada, do které se ukládají algoritmy (záložka u řešení).
let saveSet = storage.get('ergocube.lab.saveSet') ?? 'default';
const savedFor = (alg) => algs.find(alg, taskSnapshot(), saveSet);

function toggleSave(alg) {
  const existing = savedFor(alg);
  if (existing) algs.remove(existing.id);
  else algs.add({ alg, task: taskSnapshot(), set: saveSet, look: currentLook() });
}

/** Jak má skladač kostku v Labu zrovna natočenou (když jinak než držení) – trenažér ji ukáže stejně. */
function currentLook(view = ui.sub === 'results' ? cubeP : cubeA) {
  const look = view?.nearestHold?.();
  return look != null && look !== (ui.hold ?? '') ? look : undefined;
}

function renderResults() {
  ranked = null;
  renderStyleFilter();
  renderBests();
  renderGroups();
  renderPareto();
  const list = sortedResults();
  const shown = num('opt-results', 1, 500);
  $('results').replaceChildren(...list.slice(0, shown).map(({ alg, score: s, m, ranks }, i) => {
    const isSaved = !!savedFor(alg);
    const row = el('div', { className: `result${alg === ui.chosen ? ' selected' : ''}`, role: 'button', tabIndex: 0 },
      el('span', { className: 'rank', textContent: `${i + 1}.` }),
      movesView(alg, s),
      el('span', { className: 'total', textContent: s.total.toFixed(1) }),
      el('span', { className: 'meta' },
        viewFacts(m),
        bar(s.breakdown),
        ...rankBadges(ranks),
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
  $('results-more').textContent = list.length > shown ? `Zobrazeno ${shown} nejlepších (${VIEWS[view].label.toLowerCase()}) z ${list.length} nalezených.` : '';
  const count = $('results-count');
  count.hidden = !list.length;
  count.textContent = String(Math.min(list.length, shown));
}

// --- Přehrávač --------------------------------------------------------------------------

function choose(alg, scroll) {
  ui.chosen = alg;
  ui.editFrom = alg;
  ui.editSel = -1;
  ui.step = 0;
  $('alg').value = alg;
  stopPlaying();
  renderResults();
  renderPlayer();
  if (scroll && window.matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
}

const narrow = () => window.matchMedia('(max-width: 759px)').matches;

function playerSteps() {
  try { return ui.chosen ? model.steps(ui.chosen) : []; } catch { return null; }
}

function renderPlayer() {
  const { loc, target, errors, constraints, known } = taskInfo();
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
    renderView(cubeP, model.stateStickers(loc, constraints, known), loc);
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
    renderView(cubeP, model.stateStickers(loc, constraints, known), loc);
    detail.replaceChildren(el('p', { className: 'ko', textContent: `Algoritmus nejde provést: ${e.message}` }));
    return;
  }
  renderView(cubeP, model.stateStickers(current, constraints, known), current);
  if (!steps.length) {
    detail.replaceChildren(el('p', { className: 'hint', textContent: 'Vyber řešení ze seznamu nebo napiš vlastní algoritmus.' }));
    return;
  }
  const parts = splitAuf(ui.chosen);
  let algText;
  try { algText = joinAuf(parts.pre, model.algToString(parts.core), parts.post); } catch { algText = model.algToString(steps); }
  const isSaved = !!savedFor(algText);
  saveBtn.innerHTML = icon(isSaved ? 'bookmarked' : 'bookmark', { size: 20 });
  saveBtn.classList.toggle('on', isSaved);

  const moveSet = currentMoveSet();
  const goal = model.goal(constraints, target, { shape: ui.sq1.shape });
  const exact = goal.test(end);
  const rotated = !exact && goal.rotated(end);
  const illegal = model.steps(splitAuf(algText).core).filter((m) => !model.allows(moveSet, m)).map((m) => model.stepToString(m));
  const s = score(algText);
  const b = s.breakdown;
  const row = (color, label, value) => el('tr', {},
    el('td', {}, color ? Object.assign(el('i'), { style: `background:${color}` }) : null, label),
    el('td', { textContent: value }));
  const cube = P().ergonomics === 'cube';

  const editing = ui.editing && model.kind === 'perm';
  const onStep = editing
    ? (i) => { ui.editSel = ui.editSel === i - 1 ? -1 : i - 1; ui.step = ui.editSel + 1; stopPlaying(); renderPlayer(); }
    : (i) => { ui.step = i; stopPlaying(); renderPlayer(); };
  const listed = ui.results.has(algText) || ui.results.has(ui.chosen);
  detail.replaceChildren(...[
    movesView(algText, s, { current: editing ? ui.editSel : ui.step - 1, onStep, moveSet }),
    editing ? editBar(parts) : null,
    el('div', { className: 'verdict' },
      el('span', { className: exact || rotated ? 'ok' : 'ko', textContent: exact ? '✓ řeší zadání' : rotated ? '✓ řeší zadání (po otočení kostky)' : `✗ neřeší zadání (${goal.violations(end)} porušení)` }),
      illegal.length ? el('span', { className: 'ko', textContent: ` · nepovolené tahy: ${illegal.join(' ')}` }) : null),
    el('div', { className: 'edit-actions' },
      model.kind === 'perm' ? Object.assign(el('button', { type: 'button', className: `secondary small${editing ? ' on' : ''}`, textContent: editing ? '✓ Hotovo' : '✎ Upravit' }), {
        onclick: () => { ui.editing = !editing; ui.editSel = -1; renderPlayer(); },
      }) : null,
      Object.assign(el('button', { type: 'button', className: 'secondary small', title: 'Poslat algoritmus i s případem odkazem' }), {
        innerHTML: `${icon('share', { size: 15 })}<span>Sdílet</span>`,
        onclick: () => sendLink(algsPayload([{ name: 'Algoritmus z Labu', alg: algText, task: { ...taskSnapshot(), puzzle: model.id } }]), 'Algoritmus z ErgoCube Lab'),
      }),
      exact && !listed ? Object.assign(el('button', { type: 'button', className: 'secondary small', textContent: '+ Přidat do výsledků', title: 'Upravený algoritmus se zařadí mezi nalezená řešení (a uloží se s nimi)' }), {
        onclick: () => { ui.results.set(algText, score(algText)); saveFound(true); choose(algText, false); },
      }) : null,
      ui.editFrom && ui.editFrom !== algText ? Object.assign(el('button', { type: 'button', className: 'secondary small', textContent: '↺ Původní', title: ui.editFrom }), {
        onclick: () => { const a = ui.editFrom; ui.editSel = -1; choose(a, false); ui.editFrom = a; },
      }) : null),
    el('div', {}, el('span', { className: 'score-big', textContent: s.total.toFixed(1) }), el('span', { className: 'hint', textContent: '  nepohodlnost (nižší = lepší)' })),
    styleNote(algText, s),
    el('details', { className: 'breakdown-box', open: !narrow() }, el('summary', { textContent: 'Rozpis nepohodlnosti' }), el('table', { className: 'breakdown' },
      row('#7d8fb3', model.kind === 'sq1' ? 'Řezy a otočení' : 'Váha tahů', b.moves.toFixed(2)),
      cube ? row('var(--bad)', 'Rotace', b.rotations.toFixed(2)) : null,
      cube ? row('var(--warn)', 'Přehmaty zápěstí', b.regrips.toFixed(2)) : null,
      cube ? row('#b07cc6', 'Změny úchopu', b.gripChanges.toFixed(2)) : null,
      cube ? row('#e0679a', `Návaznost tahů${flowNotes(s)}`, (b.flow ?? 0).toFixed(2)) : null,
      cube && b.auf ? row('#8a8f98', 'AUF (natočení U před a po)', b.auf.toFixed(2)) : null,
      cube ? row('var(--good)', `Triggery${s.triggers.length ? ` (${s.triggers.map((t) => t.name).join(', ')})` : ''}`, b.triggerBonus.toFixed(2)) : null,
      model.kind === 'sq1'
        ? row(null, 'Řezů / tahů celkem', `${s.metrics.htm} / ${s.metrics.qtm}`)
        : row(null, 'HTM / QTM / STM', `${s.metrics.htm} / ${s.metrics.qtm} / ${s.metrics.stm}`))),
  ].filter(Boolean));
}

// --- Úprava algoritmu klepáním -----------------------------------------------------------
// Klepnutím se vybere tah (v movesView je index i s AUF na začátku); tlačítka ho otočí,
// zdvojí, posunou nebo smažou, nebo za něj vloží nový tah. Upravuje se jen jádro
// algoritmu, AUF v závorkách zůstává. Zápis jde měnit i přímo v poli nad tím.

/** Nastaví upravený algoritmus (pole i přehrávač). */
function setEdited(pre, moves, post, sel) {
  const core = moves.map((m) => model.stepToString(m)).join(' ');
  ui.chosen = joinAuf(pre, core, post) || null;
  ui.editSel = sel;
  ui.step = Math.max(0, sel + 1); // kostka ukazuje stav po vybraném tahu
  $('alg').value = ui.chosen ?? '';
  stopPlaying();
  renderResults();
  renderPlayer();
}

function editBar({ pre, core, post }) {
  let moves;
  try { moves = model.steps(core).map((m) => ({ ...m })); } catch { return null; }
  const off = pre ? 1 : 0;
  const i = ui.editSel - off; // index v jádru (−1 = nic, vkládá se na začátek)
  const sel = i >= 0 && i < moves.length ? i : -1;
  const btn = (label, title, fn, disabled = false) => Object.assign(
    el('button', { type: 'button', className: 'chip', textContent: label, title, disabled }), { onclick: fn });
  const change = (fn) => () => { const next = moves.map((m) => ({ ...m })); const s2 = fn(next); setEdited(pre, next, post, s2 + off); };
  const tools = el('div', { className: 'edit-tools' },
    btn("′", 'Opačný směr', change((ms) => { ms[sel].amount = ms[sel].amount === 2 ? 2 : -ms[sel].amount; return sel; }), sel < 0),
    btn('2', 'Dvojitý / zpět na jednoduchý', change((ms) => { ms[sel].amount = ms[sel].amount === 2 ? 1 : 2; return sel; }), sel < 0),
    btn('←', 'Posunout dřív', change((ms) => { [ms[sel - 1], ms[sel]] = [ms[sel], ms[sel - 1]]; return sel - 1; }), sel < 1),
    btn('→', 'Posunout později', change((ms) => { [ms[sel + 1], ms[sel]] = [ms[sel], ms[sel + 1]]; return sel + 1; }), sel < 0 || sel >= moves.length - 1),
    btn('✕', 'Smazat tah', change((ms) => { ms.splice(sel, 1); return Math.min(sel, ms.length - 1); }), sel < 0));
  // vložení tahu za vybraný (bez výběru na začátek): povolené vrstvy
  const bases = (ui.bases.length ? ui.bases : P().defaultBases);
  const insert = el('div', { className: 'edit-tools insert' },
    el('span', { className: 'hint', textContent: sel < 0 ? 'Vložit na začátek:' : `Vložit za ${model.stepToString(moves[sel])}:` }),
    ...bases.map((b) => btn(b, `Vložit ${b}`, change((ms) => { ms.splice(sel + 1, 0, { base: b, amount: 1 }); return sel + 1; }))));
  return el('div', { className: 'edit-bar' },
    el('p', { className: 'hint', textContent: sel < 0 ? 'Klepni na tah, který chceš změnit.' : `Vybráno: ${model.stepToString(moves[sel])} (${sel + 1}. tah)` }),
    tools, insert);
}

/** Nejčastější důvody špatné návaznosti („ · 2× stejný prst …“). */
function flowNotes(s) {
  const counts = new Map();
  for (const m of s.perMove ?? []) for (const r of m.flowReason ? m.flowReason.split(', ') : []) counts.set(r, (counts.get(r) ?? 0) + 1);
  return counts.size ? ` (${[...counts].map(([r, n]) => `${n}× ${r}`).join(', ')})` : '';
}

/** Pořadí algoritmu ve třech pohledech a údaje, ze kterých vychází. */
function styleNote(alg, s) {
  const m = styleMetrics(s, P().ergonomics === 'cube');
  const { list, ranks } = rankedResults();
  const r = ranks.get(list.find((x) => x.alg === alg));
  const facts = [
    `${m.length} ${unit()}`,
    m.regrips || m.rotations ? [m.regrips && `${m.regrips}× přehmat`, m.rotations && `${m.rotations}× rotace`].filter(Boolean).join(', ') : 'bez přehmatů',
    `nepohodlnost ${m.fluency.toFixed(2)} na tah`,
    m.ru !== null ? `R/U ${Math.round(m.ru * 100)} % tahů` : null,
  ].filter(Boolean).join(' · ');
  return el('div', { className: 'style-note' },
    r ? el('div', { className: 'view-ranks' }, ...Object.entries(VIEWS).map(([id, v]) =>
      el('span', { className: `style-tag ${id}`, title: v.text, textContent: `${v.icon} ${v.label}: ${r[id]}. z ${list.length}` }))) : null,
    el('small', { className: 'hint', textContent: facts }));
}

// Rychlost přehrávání (tahů za sekundu): tah se animuje ~¾ doby, zbytek je pauza.
const SPEED_KEY = 'ergocube.lab.playSpeed';
export const playSpeed = () => { const v = Number(storage.get(SPEED_KEY)); return v >= 0.5 && v <= 8 ? v : 2.5; };
const moveMs = (playing) => (playing ? Math.round((1000 / playSpeed()) * 0.75) : Math.min(260, Math.round((1000 / playSpeed()) * 0.75)));

async function step(delta) {
  const steps = playerSteps();
  if (!steps || !steps.length) return false;
  const target = ui.step + delta;
  if (target < 0 || target > steps.length) return false;
  const ms = moveMs(ui.playing);
  if (currentView().type === 'cube3d') {
    const m = toModelSteps([delta > 0 ? steps[ui.step] : model.invertStep(steps[ui.step - 1])])[0];
    await cubeP.animate(m, ms);
  } else {
    await cubeP.animate(null, ms);
  }
  ui.step = target;
  renderPlayer();
  // pauza mezi tahy při přehrávání (ať jde sledovat, co se stalo)
  if (ui.playing) await new Promise((r) => setTimeout(r, Math.round((1000 / playSpeed()) * 0.25)));
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
  if (model.kind === 'sq1') { $('opt-max').value = '7'; $('opt-extra').value = '1'; } else { $('opt-max').value = '20'; $('opt-extra').value = '3'; }
  $('opt-auf-row').hidden = !aufAllowed();
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
  renderMode();
  renderTaskStatus();
  clearResults();
  showSub(ui.sub);
}

// --- Inicializace -----------------------------------------------------------------------

let onOpenSet = () => {};

export function initLab({ onSub, openSet } = {}) {
  onSubChange = onSub ?? onSubChange;
  onOpenSet = openSet ?? onOpenSet;
  $('lab-puzzle').replaceChildren(...PUZZLES.map((p) => el('option', { value: p.id, textContent: p.name })));
  $('lab-puzzle').onchange = () => { selectPuzzle($('lab-puzzle').value); $('lab-puzzle').blur(); };

  for (const b of document.querySelectorAll('.segmented button[data-sub]')) b.onclick = () => showSub(b.dataset.sub);
  $('a-hold').onclick = () => setHold(cubeA.nearestHold());
  $('b-hold').onclick = () => setHold(cubeB.nearestHold());
  $('hold-reset').onclick = () => setHold('');
  $('hold-select').onchange = () => { setHold($('hold-select').value); $('hold-select').blur(); };
  $('a-view').onclick = () => cubeA.resetView();
  $('b-view').onclick = () => cubeB.resetView();

  $('a-scan').onclick = () => scan('A');
  $('a-mine').onclick = () => openMine();
  $('b-scan').onclick = () => scan('B');
  $('a-home').onclick = () => { snapshot(); ui.A = model.home(trackedPieces(ui.constraints)); ui.autoA.clear(); taskChanged(); };
  $('a-clear').onclick = () => { snapshot(); ui.A = model.blank(ui.A); ui.autoA.clear(); taskChanged(); };
  $('b-home').onclick = () => { snapshot(); ui.B = model.home(trackedPieces(ui.constraints)); taskChanged(); };
  $('b-clear').onclick = () => {
    snapshot();
    for (const k of Object.keys(ui.constraints)) ui.constraints[k] = 'ignore';
    ui.marks = {};
    ui.A = model.blank(ui.A);
    ui.B = model.blank(ui.B);
    taskChanged();
  };
  $('undo').onclick = () => {
    const last = ui.undo.pop();
    if (!last) return;
    ui.constraints = last.constraints;
    ui.marks = last.marks ?? {};
    ui.A = model.deserialize(last.A);
    ui.B = model.deserialize(last.B);
    ui.arrows = last.arrows ?? ui.arrows;
    ui.restStyle = last.restStyle ?? ui.restStyle;
    ui.restDefault = last.restDefault ?? ui.restDefault;
    ui.mode = last.mode ?? ui.mode;
    renderMode();
    if (ui.mode === 'arrows') applyArrows(); else taskChanged();
  };
  $('help').onclick = () => $('help-dialog').showModal();
  $('share-task').onclick = shareTask;
  $('gen-set').onclick = generateSet;
  for (const b of $('task-mode').querySelectorAll('button')) b.onclick = () => setMode(b.dataset.mode);
  for (const b of $('side-switch').querySelectorAll('button')) b.onclick = () => setSide(b.dataset.side);
  setSide(ui.side);
  $('arrow-all').onclick = () => { snapshot(); ui.restDefault = ui.arrowTool; ui.restStyle = {}; applyArrows(); };
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
    keepAwake(false);
    saveFound(true);
    searchUi(false);
    $('status').textContent += ' · zastaveno';
    renderResults();
  };
  $('opt-results').onchange = () => renderResults();
  $('opt-auf').checked = storage.get('ergocube.lab.auf') ?? true;
  $('lambda').oninput = () => {
    lambda = Number($('lambda').value);
    storage.set('ergocube.lab.lambda', lambda);
    renderResults();
  };
  $('pareto-box').open = storage.get('ergocube.lab.pareto') ?? false;
  $('pareto-box').ontoggle = () => { storage.set('ergocube.lab.pareto', $('pareto-box').open); renderPareto(); };
  $('ergo-left').onchange = () => { ui.ergo = { ...ui.ergo, leftHanded: $('ergo-left').checked }; ergoChanged(); };
  $('ergo-calibrate').onclick = () => {
    const mine = algs.list().filter((a) => (a.task.puzzle ?? '333') === model.id);
    const res = calibrate(P(), ui.ergo, mine);
    if (!res.ok) { $('ergo-calibration').textContent = res.reason; return; }
    ui.ergo = res.config;
    delete ui.ergo.prefBase;
    renderErgo();
    ergoChanged();
    $('ergo-calibration').textContent = res.changes.length
      ? `Podle ${res.used} algoritmů (≈ ${res.secondsPerUnit.toFixed(2)} s na jednotku váhy): `
        + res.changes.map((c) => `${featureLabel(c.key)} ${c.from} → ${c.to}`).join(', ')
      : `Podle ${res.used} algoritmů váhy sedí, nic se nezměnilo.`;
  };
  $('ergo-smart').onclick = () => {
    const items = segmentItems();
    // úseky z chytré kostky: každý úsek je změřený „algoritmus“ (stačí jedno měření)
    const res = calibrate(P(), ui.ergo, items, { minTimes: 1, minAlgs: 20, lambda: 6 });
    if (!res.ok) {
      $('ergo-calibration').textContent = segmentCount()
        ? `Z chytré kostky zatím ${segmentCount()} plynulých úseků – potřebuju aspoň 20 různých (trénuj s připojenou kostkou v trenažéru nebo skládej v timeru). ${res.reason}`
        : 'Zatím žádná měření z chytré kostky. Připoj kostku (Nastavení → Chytrá kostka) a trénuj v trenažéru nebo skládej v timeru.';
      return;
    }
    ui.ergo = res.config;
    delete ui.ergo.prefBase;
    renderErgo();
    ergoChanged();
    $('ergo-calibration').textContent = `Podle ${res.used} úseků z chytré kostky (≈ ${res.secondsPerUnit.toFixed(2)} s na jednotku váhy): `
      + (res.changes.length ? res.changes.map((c) => `${featureLabel(c.key)} ${c.from} → ${c.to}`).join(', ') : 'váhy sedí, nic se nezměnilo.');
  };
  $('ergo-prefs').onclick = () => {
    const base = prefConfig();
    const res = learnPreferences(P(), base, preferencesOf(model.id));
    if (!res.ok) { $('ergo-calibration').textContent = res.reason; return; }
    applyPrefs(res, base);
  };
  $('ergo-sets').onclick = () => {
    const base = prefConfig();
    openLearnSets({
      puzzle: P(), config: () => base, extra: () => preferencesOf(model.id),
      searchRivals: model.kind === 'perm' ? searchRivals : null,
      onApply: (res) => applyPrefs(res, base, `Podle tvých sad (${res.cases} případů, tvůj algoritmus nejlepší u ${res.winsAfter}, předtím ${res.winsBefore})`),
    }).addEventListener('close', () => { rivalClient.cancel(); renderCompare(); });
  };
  $('ergo-compare-count').value = String(compareCount());
  $('ergo-compare-count').onchange = () => compareCount(Number($('ergo-compare-count').value));
  $('ergo-compare').onclick = () => {
    const base = prefConfig();
    openCompare({ puzzle: P(), config: () => base, count: Number($('ergo-compare-count').value) || 20, onApply: (res) => applyPrefs(res, base) })
      .addEventListener('close', renderCompare);
  };
  $('ergo-compare-clear').onclick = () => {
    if (!confirm('Smazat všechna porovnání a volby z generátoru? Váhy zůstanou, jak jsou (vrátíš je tlačítkem Výchozí hodnoty).')) return;
    clearPreferences(model.id);
    renderCompare();
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
    if (!steps?.length) return;
    // AUF v závorkách zůstává (jako u uložení ze seznamu výsledků)
    const parts = splitAuf(ui.chosen);
    let text;
    try { text = joinAuf(parts.pre, model.algToString(parts.core), parts.post); } catch { text = model.algToString(steps); }
    toggleSave(text);
  };
  const speed = $('p-speed');
  const showSpeed = () => { const v = playSpeed(); $('p-speed-out').textContent = `${String(v).replace('.', ',')} ${!Number.isInteger(v) ? 'tahu' : v === 1 ? 'tah' : v < 5 ? 'tahy' : 'tahů'}/s`; };
  speed.value = String(playSpeed());
  showSpeed();
  speed.oninput = () => { storage.set(SPEED_KEY, Number(speed.value)); showSpeed(); };
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
  const renderSaveSet = () => {
    // sada patří k aktivní metodě; po přepnutí metody se ukládá do její výchozí sady
    if (!algSets.list().some((x) => x.id === saveSet)) saveSet = defaultSetId();
    setOptions($('save-set'), saveSet);
  };
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

/** Současné zadání Labu (pro obrázek kroku v průvodci metodou). */
/** Hodnocení a poměr pohledů z Labu (pro simulátor metody). */
export function labErgo() {
  return { ergo: ui.ergo, lambda };
}

export function labTask() {
  return { ...taskSnapshot(), puzzle: model.id, ...(ui.chosen ? { alg: ui.chosen } : {}) };
}

/** Otevře sdílený případ (zadání) v Labu; předchozí zadání jde vrátit tlačítkem Zpět. */
export function openTask(task) {
  const id = PUZZLES.some((p) => p.id === task.puzzle) ? task.puzzle : '333';
  if (id !== model.id) selectPuzzle(id);
  snapshot();
  if (ui.mode === 'arrows') { ui.mode = 'colors'; ui.colorBackup = null; }
  ui.A = model.deserialize(task.colorsA) ?? ui.A;
  ui.B = model.deserialize(task.colorsB) ?? ui.B;
  ui.constraints = { ...Object.fromEntries(model.pieceNames.map((n) => [n, 'ignore'])), ...(task.constraints ?? {}) };
  ui.marks = { ...(task.marks ?? {}) };
  ui.memory = {};
  ui.autoA = new Set();
  if (model.kind === 'sq1' && task.shape !== undefined) ui.sq1 = { ...ui.sq1, shape: task.shape };
  // povolené tahy (např. krok metody posílá své tahy)
  if (model.kind === 'perm' && Array.isArray(task.bases)) {
    const bases = task.bases.filter((b) => P().bases.includes(b));
    if (bases.length) { ui.bases = bases; renderMoveSet(); }
  }
  setHold(holdList(model).some((h) => h.id === task.hold) ? task.hold : '');
  renderMode();
  taskChanged();
  showSub('task');
}

/**
 * Knihovna pro hledání: uložené algoritmy tohoto hlavolamu v zápisu modelu
 * (nejnovější, nejvýš 150) – hledání je zkouší s nastavením a dokončením.
 */
function libraryAlgs() {
  const toModel = (alg) => (alg && ui.hold ? held().toModelString(alg) : alg);
  const out = [];
  for (const a of [...algs.list()].reverse()) {
    if ((a.task?.puzzle ?? '333') !== model.id) continue;
    try { out.push(toModel(a.alg.replace(/[()]/g, ' ').trim())); } catch { /* jiný zápis */ }
    if (out.length >= 150) break;
  }
  // a známé oblíbené algoritmy skladačů (PLL, OLL, F2L ze sbírky): standardní algoritmus
  // případu se najde hned, i když je delší, než kam hledání dojde
  if (model.id === '333') for (const c of CORPUS) { try { out.push(toModel(c.ref)); } catch { /* jiný zápis */ } }
  return out;
}

/** Generátor sady pro krok metody (všechny případy zadání). */
function generateSet() {
  if (model.kind !== 'perm') { toast('Generátor sady zatím umí jen kostky, Pyraminx a Skewb (ne Square-1)'); return; }
  if (ui.mode === 'arrows') { toast('Generátor sady pracuje se zadáním barvami'); return; }
  const moveSet = currentMoveSet();
  if (!moveSet.moves.length) { toast('Nejsou povolené žádné tahy (Tahy a váhy)'); return; }
  const useAuf = aufAllowed() && $('opt-auf').checked;
  const aufMoves = useAuf ? toModelSteps([1, -1, 2].map((amount) => ({ base: 'U', amount }))) : null;
  openGenerator({
    model,
    cube: P().ergonomics === 'cube',
    task: { ...taskSnapshot(), puzzle: model.id },
    lambda,
    score,
    join: joinAuf,
    toHeld: (alg) => (alg && ui.hold ? held().toHeldString(alg) : alg),
    job: (start, target, constraints, timeLimit, { seeds = [], library = [], resume } = {}) => ({
      puzzle: model.id, start, target, constraints, moves: moveSet.engineMoves, ergonomics: ui.ergo,
      held: moveSet.moves, auf: aufMoves ? { pre: aufMoves, post: aufMoves } : null, seeds,
      options: { lambda, maxLength: num('opt-max', 1, 30), extraDepth: num('opt-extra', 0, 6), maxResults: 2000, timeLimit, library, resume },
    }),
    // na čem závisí výsledky hledání (kromě případu): hlavolam, držení, tahy, hodnocení, AUF
    signature: JSON.stringify([model.id, ui.hold, moveSet.engineMoves, progressSig(useAuf)]),
    library: libraryAlgs,
    look: () => currentLook(cubeA),
    onOpenSet: (id) => onOpenSet(id),
  });
}

/** Sdílet současné zadání odkazem. */
function shareTask() {
  const info = taskInfo();
  if (!info.loc) { toast('Zadání ještě není kompletní'); return; }
  sendLink({ v: 1, kind: 'task', task: packTask({ ...taskSnapshot(), puzzle: model.id }) }, 'Případ z ErgoCube Lab');
}

export function showLab() {
  showSub(ui.sub);
}
