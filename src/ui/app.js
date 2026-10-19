// ErgoCube Lab – tři záložky:
//   Zadání      – výchozí kostka (vybarvení) a cílová kostka (styl dílků)
//   Tahy a váhy – povolené tahy a ergonomické váhy
//   Řešení      – hledání ve Web Workeru, seznam řešení s hodnocením, přehrávač

import { SLOTS, SLOT_OF, FACES, FACELETS } from '../core/geometry.js';
import { BASES, MOVE_DEFS, parseAlg, moveToString, algToString } from '../core/notation.js';
import { applyAlg, solved } from '../core/cube.js';
import { ROTATIONS } from '../core/rotations.js';
import { compileGoal } from '../core/constraints.js';
import { MoveSet, MOVESET_PRESETS, AMOUNTS } from '../core/moveset.js';
import { EMPTY, blankColors, homeColors, moveColors, identifyPieces, buildStart, trackedPieces } from '../core/task.js';
import { scoreAlg } from '../ergonomics/score.js';
import { DEFAULT_CONFIG, DEFAULT_MOVE_WEIGHTS, moveWeight } from '../ergonomics/weights.js';
import { buildTriggers } from '../ergonomics/triggers.js';
import { SearchClient } from '../search/client.js';
import { CubeScanner } from '../vision/camera.js';
import { Cube3D } from './cube3d.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return e;
};
const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bez úložiště */ } },
};

const STYLE_OF = { solved: 'solid', permutation: 'dashed', orientation: 'dotted' };
const BRUSHES = [
  { type: 'solved', label: 'Plná', title: 'Místo i natočení' },
  { type: 'permutation', label: 'Čárkovaná', title: 'Jen místo (permutace)' },
  { type: 'orientation', label: 'Tečkovaná', title: 'Jen natočení (orientace)' },
];
const AMOUNT_LABELS = { 1: 'po směru', [-1]: "proti (')", 2: 'dvojitě (2)' };
const SHOWN_RESULTS = 150;
const CENTERS = SLOTS.filter((s) => s.type === 'center').map((s) => s.name);

// --- Stav aplikace -------------------------------------------------------------

const saved = storage.get('ergocube.v3') ?? {};
const ui = {
  constraints: saved.constraints ?? Object.fromEntries(SLOTS.map((s) => [s.name, s.type === 'center' ? 'solved' : 'ignore'])),
  colorsA: saved.colorsA ?? homeColors(CENTERS),
  bases: saved.bases ?? MOVESET_PRESETS.RUF.bases,
  amounts: saved.amounts ?? AMOUNTS,
  brush: 'solved',
  paint: 'U',
  undo: [],
  results: new Map(),
  selected: null,
  step: 0,
  playing: false,
  ergo: loadErgo(),
};
const triggers = buildTriggers();
const client = new SearchClient();

function save() {
  const { constraints, colorsA, bases, amounts } = ui;
  storage.set('ergocube.v3', { constraints, colorsA, bases, amounts });
}

function loadErgo() {
  const s = storage.get('ergocube.ergo') ?? {};
  return { ...DEFAULT_CONFIG, ...s, moveWeights: { ...DEFAULT_MOVE_WEIGHTS, ...(s.moveWeights ?? {}) } };
}
const ergoConfig = () => ({ ...ui.ergo, triggers });
const score = (alg) => scoreAlg(alg, ergoConfig());

function snapshot() {
  ui.undo.push({ constraints: { ...ui.constraints }, colorsA: [...ui.colorsA] });
  if (ui.undo.length > 50) ui.undo.shift();
}

// --- Záložky -----------------------------------------------------------------------

function showTab(name) {
  for (const p of document.querySelectorAll('.page')) p.hidden = p.dataset.page !== name;
  for (const b of document.querySelectorAll('.tabbar button')) b.classList.toggle('active', b.dataset.tab === name);
  window.scrollTo({ top: 0 });
  if (name === 'results') { cubeP.layout(); renderPlayer(); }
  if (name === 'task') { cubeA.layout(); cubeB.layout(); }
}
for (const b of document.querySelectorAll('.tabbar button')) b.onclick = () => showTab(b.dataset.tab);

// --- Zadání: kostky ------------------------------------------------------------------

const cubeA = new Cube3D($('cube-a'), { label: 'Výchozí stav', onSticker: paintA });
const cubeB = new Cube3D($('cube-b'), { label: 'Cíl', onSticker: markB });
$('a-view').onclick = () => cubeA.resetView();
$('b-view').onclick = () => cubeB.resetView();

function paintA(pos) {
  if (ui.colorsA[pos] === ui.paint) return;
  snapshot();
  ui.colorsA[pos] = ui.paint;
  taskChanged();
}

function markB(pos) {
  const piece = SLOTS[SLOT_OF[pos]].name;
  snapshot();
  const was = ui.constraints[piece];
  const now = was === ui.brush ? 'ignore' : ui.brush;
  ui.constraints[piece] = now;
  const placed = identifyPieces(ui.colorsA).pieces;
  if (now !== 'ignore' && !placed.has(piece)) {
    // Nový dílek: vlož ho do výchozí kostky na jeho místo, je-li volné.
    const slot = SLOTS.find((s) => s.name === piece);
    if (slot.facelets.every((f) => ui.colorsA[f] === EMPTY)) ui.colorsA = homeColors([piece], ui.colorsA);
  } else if (now === 'ignore' && placed.has(piece)) {
    // Zrušený dílek zmizí i z výchozí kostky.
    for (const f of SLOTS[placed.get(piece).slot].facelets) ui.colorsA[f] = EMPTY;
  }
  taskChanged();
}

function renderPalette() {
  const items = [...FACES.map((f) => ({ value: f, label: `Barva ${f}` })), { value: EMPTY, label: 'Guma' }];
  $('palette').replaceChildren(...items.map(({ value, label }) => {
    const b = el('button', { type: 'button', className: `swatch${value === EMPTY ? ' erase' : ''}`, title: label });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-checked', String(ui.paint === value));
    if (value !== EMPTY) b.style.setProperty('--c', `var(--c-${value})`);
    b.onclick = () => { ui.paint = value; renderPalette(); };
    return b;
  }));
}

function renderBrushes() {
  $('brushes').replaceChildren(...BRUSHES.map(({ type, label, title }) => {
    const b = el('button', { type: 'button', className: 'brush', title },
      el('i', { className: `sw ${STYLE_OF[type]}` }), label);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(ui.brush === type));
    b.onclick = () => { ui.brush = type; renderBrushes(); };
    return b;
  }));
}

$('a-apply').onclick = () => {
  const text = $('a-moves').value.trim();
  if (!text) return;
  try {
    const moves = parseAlg(text);
    snapshot();
    ui.colorsA = moveColors(ui.colorsA, moves);
    $('a-moves').value = '';
    taskChanged();
  } catch (e) {
    setTaskStatus([el('span', { className: 'bad', textContent: e.message })]);
  }
};
$('a-moves').onkeydown = (e) => { if (e.key === 'Enter') $('a-apply').click(); };
$('a-home').onclick = () => {
  snapshot();
  ui.colorsA = homeColors(trackedPieces(ui.constraints));
  taskChanged();
};
$('a-clear').onclick = () => { snapshot(); ui.colorsA = blankColors(); taskChanged(); };
$('b-clear').onclick = () => {
  snapshot();
  for (const k of Object.keys(ui.constraints)) ui.constraints[k] = 'ignore';
  taskChanged();
};
$('undo').onclick = () => {
  const last = ui.undo.pop();
  if (!last) return;
  ui.constraints = last.constraints;
  ui.colorsA = last.colorsA;
  taskChanged();
};

const scanner = new CubeScanner($('scanner'), (facelets) => {
  snapshot();
  ui.colorsA = [...facelets];
  taskChanged();
});
$('a-scan').hidden = !CubeScanner.supported();
$('a-scan').onclick = async () => {
  try { await scanner.open(); } catch (e) { setTaskStatus([el('span', { className: 'bad', textContent: `Kamera: ${e.message}` })]); }
};

function renderCubes() {
  const { pieces } = identifyPieces(ui.colorsA);
  const pieceAt = new Map([...pieces].map(([name, p]) => [p.slot, name]));
  cubeA.render(ui.colorsA.map((color, pos) => {
    if (color === EMPTY) return { color, style: 'none' };
    const name = pieceAt.get(SLOT_OF[pos]);
    const type = name ? ui.constraints[name] : null;
    return { color, style: STYLE_OF[type] ?? 'faded' };
  }));
  cubeB.render(FACELETS.map((f) => {
    const type = ui.constraints[SLOTS[SLOT_OF[f.index]].name];
    return { color: f.face, style: STYLE_OF[type] ?? 'none' };
  }));
}

function setTaskStatus(nodes) {
  $('task-status').replaceChildren(...nodes);
}

function taskInfo() {
  const tracked = trackedPieces(ui.constraints);
  const { loc, errors, untracked } = buildStart(ui.colorsA, ui.constraints);
  return { tracked, loc, errors, untracked };
}

function renderTaskStatus() {
  const { tracked, errors, untracked } = taskInfo();
  const nonCenter = tracked.filter((n) => !CENTERS.includes(n));
  const nodes = [];
  if (!nonCenter.length) {
    nodes.push(el('span', { className: 'warn', textContent: 'V cíli zatím není označený žádný dílek (kromě středů).' }));
  } else if (errors.length) {
    nodes.push(el('ul', { className: 'bad' }, ...errors.map((e) => el('li', { textContent: e }))));
  } else {
    nodes.push(el('span', { className: 'good', textContent: `✔ Zadání je v pořádku – řeší se ${nonCenter.length} dílků: ${nonCenter.join(', ')}` }));
  }
  if (untracked.length) {
    nodes.push(el('div', { className: 'warn', textContent: `Vybarvené, ale v cíli neoznačené (ignorují se): ${untracked.join(', ')}` }));
  }
  setTaskStatus(nodes);
  $('topbar-info').textContent = nonCenter.length ? `${nonCenter.length} dílků · ${currentMoveSet().bases.join(' ')}` : '';
}

function taskChanged() {
  save();
  renderCubes();
  renderTaskStatus();
  clearResults();
}

$('go-search').onclick = () => { showTab('results'); startSearch(); };

// --- Tahy a váhy ----------------------------------------------------------------

function renderMoveSet() {
  const sel = $('moveset-preset');
  for (const [id, p] of Object.entries(MOVESET_PRESETS)) sel.append(el('option', { value: id, textContent: p.label }));
  sel.append(el('option', { value: 'custom', textContent: 'Vlastní' }));
  const match = Object.entries(MOVESET_PRESETS).find(([, p]) => p.bases.join() === [...ui.bases].sort().join() || p.bases.join() === ui.bases.join());
  sel.value = match ? match[0] : 'custom';

  const bases = $('bases');
  for (const b of BASES) {
    const cb = el('input', { type: 'checkbox', value: b, checked: ui.bases.includes(b) });
    cb.onchange = () => { sel.value = 'custom'; moveSetChanged(); };
    bases.append(el('label', { title: MOVE_DEFS[b].kind }, cb, b));
  }
  const amounts = $('amounts');
  for (const a of AMOUNTS) {
    const cb = el('input', { type: 'checkbox', value: String(a), checked: ui.amounts.includes(a) });
    cb.onchange = moveSetChanged;
    amounts.append(el('label', {}, cb, AMOUNT_LABELS[a]));
  }
  sel.onchange = () => {
    if (sel.value === 'custom') return;
    const chosen = MOVESET_PRESETS[sel.value].bases;
    for (const cb of bases.querySelectorAll('input')) cb.checked = chosen.includes(cb.value);
    moveSetChanged();
  };
}

function currentMoveSet() {
  return new MoveSet({ bases: ui.bases, amounts: ui.amounts });
}

function moveSetChanged() {
  const checked = (id) => [...$(id).querySelectorAll('input:checked')].map((c) => c.value);
  ui.bases = checked('bases');
  ui.amounts = checked('amounts').map(Number);
  save();
  renderTaskStatus();
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
      input.setAttribute('aria-label', `${b} ${['po směru', 'proti', 'dvojitě'][i]}`);
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

$('ergo-reset').onclick = () => {
  ui.ergo = { ...DEFAULT_CONFIG, moveWeights: { ...DEFAULT_MOVE_WEIGHTS } };
  renderErgo();
  ergoChanged();
};

// --- Hledání ---------------------------------------------------------------------

function clearResults() {
  if (client.running) client.cancel();
  ui.results.clear();
  ui.selected = null;
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
  if (errors.length || !loc) {
    $('status').textContent = 'Zadání není v pořádku – oprav ho v záložce Zadání.';
    return;
  }
  if (!tracked.some((n) => !CENTERS.includes(n))) {
    $('status').textContent = 'V cíli není označený žádný dílek.';
    return;
  }
  const moveSet = currentMoveSet();
  if (!moveSet.moves().length) { $('status').textContent = 'Nejsou povolené žádné tahy (záložka Tahy a váhy).'; return; }
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
  client.start({
    start: loc, target: solved(), constraints: ui.constraints,
    moves: moveSet.moves(), options: opts, ergonomics: ui.ergo,
  }, {
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
      if (!ui.selected && ui.results.size) selectAlg(sortedResults()[0].alg, false);
    },
    onError: (e) => { searchUi(false); $('status').textContent = `Chyba: ${e.message}`; },
  });
}

$('search').onclick = startSearch;
$('stop').onclick = () => {
  client.cancel();
  searchUi(false);
  $('status').textContent += ' · zastaveno';
  renderResults();
};
$('sort').onchange = () => renderResults();

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

function renderResults() {
  const list = sortedResults();
  $('results').replaceChildren(...list.slice(0, SHOWN_RESULTS).map(({ alg, score: s }, i) => {
    const b = el('button', { type: 'button', className: `result${alg === ui.selected ? ' selected' : ''}` },
      el('span', { className: 'rank', textContent: `${i + 1}.` }),
      movesView(alg, s),
      el('span', { className: 'total', textContent: s.total.toFixed(1) }),
      el('span', { className: 'meta' },
        `${s.metrics.htm} tahů`,
        bar(s.breakdown),
        s.triggers.length ? `✦ ${s.triggers.map((t) => t.name).join(', ')}` : null,
        s.breakdown.rotations ? 'rotace' : null));
    b.onclick = () => selectAlg(alg, true);
    return el('li', {}, b);
  }));
  $('results-more').textContent = list.length > SHOWN_RESULTS ? `Zobrazeno ${SHOWN_RESULTS} z ${list.length}.` : '';
  const count = $('results-count');
  count.hidden = !list.length;
  count.textContent = String(list.length);
}

// --- Přehrávač -------------------------------------------------------------------

const cubeP = new Cube3D($('cube-p'), { label: 'Přehrávač' });

function selectAlg(alg, scroll) {
  ui.selected = alg;
  ui.step = 0;
  $('alg').value = alg;
  stopPlaying();
  renderResults();
  renderPlayer();
  if (scroll && window.matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('alg').oninput = () => {
  ui.selected = $('alg').value.trim() || null;
  ui.step = 0;
  stopPlaying();
  renderResults();
  renderPlayer();
};

function playerMoves() {
  try { return ui.selected ? parseAlg(ui.selected) : []; } catch { return null; }
}

function stickersOf(loc) {
  const out = new Array(54);
  for (let k = 0; k < 54; k++) {
    const type = ui.constraints[SLOTS[SLOT_OF[k]].name];
    out[loc[k]] = { color: FACELETS[k].face, style: STYLE_OF[type] ?? 'none' };
  }
  return out;
}

function renderPlayer() {
  const { loc, errors } = taskInfo();
  const detail = $('detail');
  if (!loc) {
    cubeP.render(new Array(54).fill({ color: EMPTY, style: 'none' }));
    detail.replaceChildren(el('p', { className: 'hint', textContent: errors[0] ?? 'Zadání není kompletní.' }));
    return;
  }
  const moves = playerMoves();
  if (moves === null) {
    cubeP.render(stickersOf(loc));
    detail.replaceChildren(el('p', { className: 'ko', textContent: 'Algoritmus nejde přečíst.' }));
    return;
  }
  ui.step = Math.min(Math.max(0, ui.step), moves.length);
  cubeP.render(stickersOf(applyAlg(loc, moves.slice(0, ui.step))));
  if (!moves.length) {
    detail.replaceChildren(el('p', { className: 'hint', textContent: 'Vyber řešení ze seznamu nebo napiš vlastní algoritmus.' }));
    return;
  }

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
      el('span', { className: exact || rotated ? 'ok' : 'ko', textContent: exact ? '✔ řeší zadání' : rotated ? '✔ řeší zadání (po otočení kostky)' : `✘ neřeší zadání (${goal.violations(end)} porušení)` }),
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
  const { loc } = taskInfo();
  if (!loc) return false;
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
  $('p-play').textContent = '▶';
}

$('p-first').onclick = () => { stopPlaying(); ui.step = 0; renderPlayer(); };
$('p-last').onclick = () => { stopPlaying(); ui.step = Infinity; renderPlayer(); };
$('p-back').onclick = () => { stopPlaying(); step(-1); };
$('p-fwd').onclick = () => { stopPlaying(); step(1); };
$('p-play').onclick = async () => {
  if (ui.playing) { stopPlaying(); return; }
  const moves = playerMoves();
  if (!moves?.length) return;
  if (ui.step >= moves.length) { ui.step = 0; renderPlayer(); await new Promise((r) => setTimeout(r, 250)); }
  ui.playing = true;
  $('p-play').textContent = '❚❚';
  while (ui.playing && await step(1)) { /* další tah */ }
  stopPlaying();
};

// --- Start -------------------------------------------------------------------------

renderPalette();
renderBrushes();
renderMoveSet();
renderErgo();
renderCubes();
renderTaskStatus();
renderResults();
renderPlayer();
