// Dashboard ErgoCube Lab: stav A → cíl (omezení dílků) → povolené tahy →
// hledání ve Web Workeru → přehrávač, ergonomické skóre a srovnání.

import { SLOTS, FACES } from '../core/geometry.js';
import { BASES, MOVE_DEFS, parseAlg, moveToString, algToString } from '../core/notation.js';
import { solved, applyAlg, caseOf, toFacelets, fromFacelets } from '../core/cube.js';
import { ROTATIONS } from '../core/rotations.js';
import { SUBSTATE_PRESETS, CONSTRAINT_TYPES, presetConstraints, compileGoal } from '../core/constraints.js';
import { MoveSet, MOVESET_PRESETS, AMOUNTS } from '../core/moveset.js';
import { scoreAlg, rankAlgs } from '../ergonomics/score.js';
import { DEFAULT_CONFIG, DEFAULT_MOVE_WEIGHTS } from '../ergonomics/weights.js';
import { buildTriggers } from '../ergonomics/triggers.js';
import { SearchClient } from '../search/client.js';
import { matchCommunity } from '../search/community.js';
import { CubeScanner } from '../vision/camera.js';
import { renderNet, colorsOf } from './net.js';
import { loadTwisty, showTwisty } from './twisty.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};
const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bez úložiště */ } },
};

const CONSTRAINT_LABELS = { solved: 'složeno', permutation: 'permutace', orientation: 'orientace', ignore: 'nezáleží' };
const AMOUNT_LABELS = { 1: 'po směru', [-1]: "proti (')", 2: 'dvojitě (2)' };
const START_LABELS = { case: 'Algoritmus, který případ řeší', scramble: 'Zamíchání složené kostky' };
const SHOWN_RESULTS = 100;

const ui = {
  constraints: presetConstraints('f2l-fr'),
  startMode: 'case',
  startTexts: { case: "U R U' R' U' F' U F", scramble: '' },
  facelets: toFacelets(solved()),
  paint: 'U',
  results: new Map(),      // alg → skóre
  community: [],
  step: 0,
  ergo: loadErgo(),
  twistyOn: false,
};
const triggers = buildTriggers();
const client = new SearchClient();

// --- Ergonomická konfigurace -------------------------------------------------

function loadErgo() {
  const saved = storage.get('ergocube.ergo') ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    moveWeights: { ...DEFAULT_MOVE_WEIGHTS, ...(saved.moveWeights ?? {}) },
  };
}

const ergoConfig = () => ({ ...ui.ergo, triggers });
const score = (alg) => scoreAlg(alg, ergoConfig());

const ERGO_FIELDS = [
  ['rotationPenalty', 'Rotace x/y/z (za ¼)', 0.5],
  ['regripPenalty', 'Přehmat zápěstí', 0.1],
  ['gripChangePenalty', 'Změna úchopu', 0.1],
  ['triggerBonusScale', 'Násobič bonusů triggerů', 0.1],
  ['maxWristTurn', 'Max. ¼ zápěstím bez přehmatu', 1],
  ['fallbackWeight', 'Váha neznámého tahu', 0.1],
];

function renderErgo() {
  const main = $('ergo-main');
  main.replaceChildren(...ERGO_FIELDS.map(([key, label, stepValue]) => {
    const input = el('input', { type: 'number', step: String(stepValue), min: '0', value: String(ui.ergo[key]) });
    input.onchange = () => {
      const v = Number(input.value);
      if (Number.isFinite(v) && v >= 0) { ui.ergo[key] = v; ergoChanged(); }
    };
    return el('label', {}, label, input);
  }));
  const moves = $('ergo-moves');
  moves.replaceChildren(...BASES.filter((b) => MOVE_DEFS[b].kind !== 'rotation').map((b) => {
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
  const { triggers: _t, ...plain } = ui.ergo;
  storage.set('ergocube.ergo', plain);
  for (const alg of ui.results.keys()) ui.results.set(alg, score(alg));
  renderResults();
  updatePlayer();
  updateRanking();
}

$('ergo-reset').onclick = () => {
  ui.ergo = { ...DEFAULT_CONFIG, moveWeights: { ...DEFAULT_MOVE_WEIGHTS } };
  renderErgo();
  ergoChanged();
};

// --- Stav A ------------------------------------------------------------------

function startState() {
  if (ui.startMode === 'colors') return fromFacelets(ui.facelets);
  const text = ui.startTexts[ui.startMode];
  return ui.startMode === 'case' ? caseOf(text) : applyAlg(solved(), text);
}

function targetState() {
  const t = $('target-text').value.trim();
  return t ? applyAlg(solved(), t) : solved();
}

function setStartMode(mode) {
  if (mode === 'colors' && ui.startMode !== 'colors') {
    try { ui.facelets = toFacelets(startState()); } catch { /* ponecháme předchozí */ }
  }
  ui.startMode = mode;
  for (const b of $('start-mode').querySelectorAll('button')) b.classList.toggle('active', b.dataset.mode === mode);
  $('start-text-wrap').hidden = mode === 'colors';
  $('editor').hidden = mode !== 'colors';
  if (mode !== 'colors') {
    $('start-text-label').textContent = START_LABELS[mode];
    $('start-text').value = ui.startTexts[mode];
  }
  startChanged();
}

for (const b of $('start-mode').querySelectorAll('button')) b.onclick = () => setStartMode(b.dataset.mode);
$('start-text').oninput = () => { ui.startTexts[ui.startMode] = $('start-text').value; startChanged(); };

function renderPalette() {
  $('palette').replaceChildren(...FACES.map((f) => {
    const b = el('button', { type: 'button', className: f === ui.paint ? 'active' : '', title: f });
    b.style.background = `var(--c-${f})`;
    b.setAttribute('aria-label', `Barva ${f}`);
    b.onclick = () => { ui.paint = f; renderPalette(); };
    return b;
  }));
}

function setFacelets(str) {
  ui.facelets = str;
  $('facelets').value = str;
  startChanged();
}

$('facelets').oninput = () => {
  const v = $('facelets').value.replace(/\s+/g, '').toUpperCase();
  if (v.length === 54) { ui.facelets = v; startChanged(); }
};
$('editor-reset').onclick = () => setFacelets(toFacelets(solved()));
$('editor-from-start').onclick = () => {
  const text = ui.startTexts.case;
  try { setFacelets(toFacelets(caseOf(text))); } catch { /* neplatný algoritmus */ }
};

const scanner = new CubeScanner($('scanner'), (facelets) => setFacelets(facelets));
$('scan').hidden = !CubeScanner.supported();
$('scan').onclick = async () => {
  try {
    await scanner.open();
  } catch (e) {
    showStartError(`Kameru se nepodařilo spustit: ${e.message}`);
  }
};

function showStartError(msg) {
  const err = $('start-error');
  err.textContent = msg ?? '';
  err.hidden = !msg;
}

function startChanged() {
  let loc = null;
  try {
    loc = startState();
    showStartError(null);
  } catch (e) {
    showStartError(e.message);
  }
  if (ui.startMode === 'colors') {
    $('facelets').value = ui.facelets;
    renderNet($('start-net'), [...ui.facelets], (pos) => {
      if (pos % 9 === 4) return; // středy určují barvy stěn
      const arr = [...ui.facelets];
      arr[pos] = ui.paint;
      setFacelets(arr.join(''));
    });
  } else if (loc) {
    renderNet($('start-net'), colorsOf(loc, ui.constraints));
  }
  clearResults();
  updatePlayer();
}

// --- Cíl -------------------------------------------------------------------------

function renderPresets() {
  const sel = $('preset');
  for (const [id, p] of Object.entries(SUBSTATE_PRESETS)) sel.append(el('option', { value: id, textContent: p.label }));
  sel.append(el('option', { value: 'custom', textContent: 'Vlastní' }));
  sel.value = 'f2l-fr';
  sel.onchange = () => {
    if (sel.value === 'custom') return;
    ui.constraints = presetConstraints(sel.value);
    renderPieces();
    goalChanged();
  };
}

function renderPieces() {
  const box = $('pieces');
  box.replaceChildren();
  for (const [type, title] of [['center', 'Středy'], ['edge', 'Hrany'], ['corner', 'Rohy']]) {
    box.append(el('h4', { textContent: title }));
    for (const slot of SLOTS.filter((s) => s.type === type)) {
      const options = type === 'center' ? ['ignore', 'solved'] : CONSTRAINT_TYPES;
      const sel = el('select');
      sel.setAttribute('aria-label', `Dílek ${slot.name}`);
      for (const c of options) sel.append(el('option', { value: c, textContent: CONSTRAINT_LABELS[c] }));
      const cur = ui.constraints[slot.name];
      sel.value = options.includes(cur) ? cur : 'solved';
      sel.dataset.v = sel.value;
      sel.onchange = () => {
        ui.constraints[slot.name] = sel.dataset.v = sel.value;
        $('preset').value = 'custom';
        goalChanged();
      };
      box.append(el('div', { className: 'piece' }, el('b', { textContent: slot.name }), sel));
    }
  }
}

$('target-text').oninput = () => goalChanged();

function goalChanged() {
  startChanged();
}

// --- Povolené tahy -----------------------------------------------------------

function renderMoveSet() {
  const sel = $('moveset-preset');
  for (const [id, p] of Object.entries(MOVESET_PRESETS)) sel.append(el('option', { value: id, textContent: p.label }));
  sel.append(el('option', { value: 'custom', textContent: 'Vlastní' }));
  sel.value = 'RUF';

  const bases = $('bases');
  for (const b of BASES) {
    const cb = el('input', { type: 'checkbox', value: b, checked: MOVESET_PRESETS.RUF.bases.includes(b) });
    cb.onchange = () => { sel.value = 'custom'; moveSetChanged(); };
    bases.append(el('label', { title: MOVE_DEFS[b].kind }, cb, b));
  }
  const amounts = $('amounts');
  for (const a of AMOUNTS) {
    const cb = el('input', { type: 'checkbox', value: String(a), checked: true });
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
  const checked = (id) => [...$(id).querySelectorAll('input:checked')].map((c) => c.value);
  return new MoveSet({ bases: checked('bases'), amounts: checked('amounts').map(Number) });
}

function moveSetChanged() {
  clearResults();
  updatePlayer();
}

// --- Hledání -----------------------------------------------------------------------

function clearResults() {
  if (client.running) client.cancel();
  ui.results.clear();
  ui.community = [];
  searchUi(false);
  $('status').textContent = '';
  renderResults();
}

function searchUi(running) {
  $('search').disabled = running;
  $('stop').disabled = !running;
}

const num = (id, min, max) => Math.min(max, Math.max(min, Math.round(Number($(id).value) || min)));

$('search').onclick = () => {
  let start;
  try { start = startState(); } catch (e) { showStartError(e.message); return; }
  const moveSet = currentMoveSet();
  if (!moveSet.moves().length) { $('status').textContent = 'Nejsou povolené žádné tahy.'; return; }
  clearResults();
  const target = targetState();
  const goal = compileGoal(ui.constraints, target);
  ui.community = matchCommunity(start, goal).map((c) => ({ ...c, score: score(c.alg), illegal: moveSet.check(c.alg) }));
  renderResults();

  const opts = {
    maxLength: num('opt-max', 1, 20),
    extraDepth: num('opt-extra', 0, 6),
    maxResults: num('opt-results', 1, 5000),
    timeLimit: num('opt-time', 1, 300) * 1000,
  };
  const { triggers: _t, ...ergonomics } = ui.ergo;
  searchUi(true);
  $('status').textContent = 'Spouštím…';
  let pending = false;
  const scheduleRender = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; renderResults(); });
  };
  client.start({ start, target, constraints: ui.constraints, moves: moveSet.moves(), options: opts, ergonomics }, {
    onProgress: (p) => {
      $('status').textContent = p.phase === 'tables'
        ? `Počítám tabulky heuristiky ${p.table}/${p.tables}…`
        : `Hloubka ${p.depth} · ${p.nodes.toLocaleString('cs')} uzlů · nalezeno ${p.found} · ${(p.elapsed / 1000).toFixed(1)} s`;
    },
    onSolutions: (items) => {
      for (const { alg } of items) ui.results.set(alg, score(alg));
      scheduleRender();
    },
    onDone: (d) => {
      searchUi(false);
      renderResults();
      const why = {
        done: 'Hotovo', time: 'Vypršel časový limit', results: 'Dosažen max. počet výsledků',
        'not-found': `Do ${opts.maxLength} tahů nic nenalezeno`,
        unsolvable: 'S povolenými tahy nelze cíle dosáhnout',
        'already-solved': 'Stav A už cíl splňuje',
      }[d.reason] ?? d.reason;
      $('status').textContent = `${why}. ${d.found} algoritmů${d.optimal ? `, optimum ${d.optimal} tahů` : ''} · `
        + `${d.nodes.toLocaleString('cs')} uzlů · ${(d.elapsed / 1000).toFixed(1)} s (tabulky ${(d.tablesMs / 1000).toFixed(1)} s)`;
    },
    onError: (e) => { searchUi(false); $('status').textContent = `Chyba: ${e.message}`; },
  });
};

$('stop').onclick = () => {
  client.cancel();
  searchUi(false);
  $('status').textContent += ' · zastaveno';
};

function triggerText(s) {
  return s.triggers.map((t) => t.name).join(', ') || 'bez triggerů';
}

function resultItem({ alg, score: s, community, illegal }) {
  const play = el('button', { type: 'button', className: 'link', textContent: alg });
  play.onclick = () => selectAlg(alg);
  const meta = `skóre ${s.total.toFixed(2)} · ${s.metrics.htm} HTM · ${triggerText(s)}`;
  return el('li', {},
    play,
    community ? el('span', { className: 'badge', textContent: `${community.set} ${community.name}` }) : '',
    illegal?.length ? el('span', { className: 'badge bad', textContent: `mimo povolené: ${illegal.join(' ')}` }) : '',
    el('small', { textContent: meta }));
}

function renderResults() {
  const found = [...ui.results].map(([alg, s]) => ({ alg, score: s }));
  found.sort((a, b) => a.score.total - b.score.total || a.score.metrics.htm - b.score.metrics.htm);
  const community = [...ui.community].sort((a, b) => a.score.total - b.score.total);
  const merged = [...found.slice(0, SHOWN_RESULTS), ...community.map((c) => ({ ...c, community: c }))]
    .sort((a, b) => a.score.total - b.score.total || a.score.metrics.htm - b.score.metrics.htm);
  $('results').replaceChildren(...merged.map(resultItem));
  $('results-more').textContent = found.length > SHOWN_RESULTS ? `Zobrazeno ${SHOWN_RESULTS} nejlepších z ${found.length}.` : '';

  const cmp = $('comparison');
  if (!found.length && !community.length) { cmp.replaceChildren(); return; }
  const best = found[0], bestC = community[0];
  const parts = [];
  if (best) parts.push(el('div', {}, el('span', { textContent: 'Nejlepší nalezený: ' }), el('b', { textContent: best.score.total.toFixed(2) }), ` (${best.score.metrics.htm} HTM)`));
  if (bestC) parts.push(el('div', {}, el('span', { textContent: `Nejlepší komunitní (${bestC.set} ${bestC.name}): ` }), el('b', { textContent: bestC.score.total.toFixed(2) }), ` (${bestC.score.metrics.htm} HTM)`));
  else parts.push(el('div', { className: 'hint', textContent: 'V databázi komunitních algoritmů není algoritmus pro tento případ.' }));
  if (best && bestC) {
    const diff = bestC.score.total - best.score.total;
    parts.push(el('div', {
      className: diff > 0 ? 'ok' : 'hint',
      textContent: diff > 0 ? `Nalezený je o ${diff.toFixed(2)} bodu pohodlnější.` : 'Komunitní algoritmus je zatím stejně dobrý nebo lepší.',
    }));
  }
  cmp.replaceChildren(el('div', { className: 'comparison' }, ...parts));
}

// --- Přehrávač a hodnocení --------------------------------------------------------

function selectAlg(alg) {
  $('alg').value = alg;
  ui.step = parseAlg(alg).length;
  updatePlayer();
  $('player-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('alg').oninput = () => { ui.step = Infinity; updatePlayer(); };
$('step').oninput = () => { ui.step = Number($('step').value); updatePlayer(); };
$('step-first').onclick = () => { ui.step = 0; updatePlayer(); };
$('step-back').onclick = () => { ui.step = Math.max(0, ui.step - 1); updatePlayer(); };
$('step-fwd').onclick = () => { ui.step += 1; updatePlayer(); };
$('step-last').onclick = () => { ui.step = Infinity; updatePlayer(); };
$('show-3d').onclick = async () => {
  const btn = $('show-3d');
  btn.disabled = true;
  btn.textContent = 'Načítám 3D…';
  try {
    await loadTwisty();
    ui.twistyOn = true;
    btn.hidden = true;
    updatePlayer();
  } catch (e) {
    btn.textContent = `3D není dostupné: ${e.message}`;
  }
};

function row(label, value) {
  return el('tr', {}, el('td', { textContent: label }), el('td', { textContent: value }));
}

function updatePlayer() {
  const err = $('alg-error');
  err.hidden = true;
  let moves, start;
  try {
    moves = parseAlg($('alg').value);
    start = startState();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    $('result').replaceChildren();
    return;
  }
  const n = moves.length;
  ui.step = Math.min(Math.max(0, ui.step), n);
  const slider = $('step');
  slider.max = String(n);
  slider.value = String(ui.step);
  const now = applyAlg(start, moves.slice(0, ui.step));
  renderNet($('player-net'), colorsOf(now, ui.constraints));

  const moveSet = currentMoveSet();
  const goal = compileGoal(ui.constraints, targetState());
  const end = applyAlg(start, moves);
  const exact = goal.test(end);
  const withRotation = !exact && ROTATIONS.some((r) => goal.test(applyAlg(end, r)));
  const illegal = moveSet.check(moves);
  const s = score(moves);
  const b = s.breakdown;

  const trig = new Set();
  for (const t of s.triggers) for (let i = t.start; i < t.start + t.length; i++) trig.add(i);
  const view = el('p', { className: 'alg-view' }, ...moves.flatMap((m, i) => {
    const cls = [trig.has(i) && 'trig', MOVE_DEFS[m.base].kind === 'rotation' && 'rot',
      !moveSet.allows(m) && 'bad', i === ui.step - 1 && 'current'];
    const span = el('button', { type: 'button', className: cls.filter(Boolean).join(' '), textContent: moveToString(m) });
    span.onclick = () => { ui.step = i + 1; updatePlayer(); };
    return [span, ' '];
  }));

  const goalText = exact ? '✔ cíl splněn' : withRotation ? '✔ cíl splněn (po otočení celé kostky)'
    : `✘ cíl nesplněn (${goal.violations(end)} porušení)`;
  $('result').replaceChildren(
    el('h3', { textContent: 'Discomfort Score' }),
    el('div', { className: 'score', textContent: s.total.toFixed(2) }),
    view,
    el('p', {},
      el('span', { className: exact || withRotation ? 'ok' : 'ko', textContent: goalText }),
      el('br'),
      el('span', { className: illegal.length ? 'ko' : 'ok', textContent: illegal.length ? `✘ nepovolené tahy: ${illegal.join(', ')}` : '✔ jen povolené tahy' })),
    el('table', {},
      row('Váha tahů', b.moves.toFixed(2)),
      row('Rotace', b.rotations.toFixed(2)),
      row('Přehmaty zápěstí', b.regrips.toFixed(2)),
      row('Změny úchopu', b.gripChanges.toFixed(2)),
      row(`Triggery (${s.triggers.map((t) => t.name).join(', ') || '–'})`, b.triggerBonus.toFixed(2)),
      row('HTM / QTM / STM / ETM', `${s.metrics.htm} / ${s.metrics.qtm} / ${s.metrics.stm} / ${s.metrics.etm}`)),
  );

  if (ui.twistyOn) {
    const alg = algToString(moves);
    if (ui.startMode === 'scramble') {
      showTwisty($('twisty'), { alg, setup: ui.startTexts.scramble, anchor: 'start', constraints: ui.constraints });
    } else {
      showTwisty($('twisty'), { alg, anchor: 'end', constraints: ui.constraints });
    }
  }
}

// --- Porovnání ---------------------------------------------------------------------

function updateRanking() {
  const lines = $('compare').value.split('\n').map((l) => l.trim()).filter(Boolean);
  const errors = [];
  const valid = [];
  for (const l of lines) {
    try { parseAlg(l); valid.push(l); } catch (e) { errors.push(el('li', { className: 'ko', textContent: `${l} – ${e.message}` })); }
  }
  const ranked = rankAlgs(valid, ergoConfig()).map(({ alg, score: s }) => {
    const b = el('button', { type: 'button', className: 'link', textContent: alg });
    b.onclick = () => selectAlg(alg);
    return el('li', {}, b, el('small', { textContent: `skóre ${s.total.toFixed(2)} · ${s.metrics.htm} HTM · ${triggerText(s)}` }));
  });
  $('ranking').replaceChildren(...ranked, ...errors);
}
$('compare').oninput = updateRanking;

// --- Start -------------------------------------------------------------------------

renderPalette();
renderPresets();
renderPieces();
renderMoveSet();
renderErgo();
setStartMode('case');
ui.step = Infinity;
updatePlayer();
updateRanking();
