// Jednoduchý dashboard pro milník 1: editor omezení dílků, sada tahů,
// skóre algoritmu a porovnání.

import { SLOTS, FACELETS } from '../core/geometry.js';
import { BASES, MOVE_DEFS, parseAlg, moveToString } from '../core/notation.js';
import { solved, applyAlg, caseOf } from '../core/cube.js';
import { SUBSTATE_PRESETS, CONSTRAINT_TYPES, presetConstraints, compileGoal, stickerVisibility } from '../core/constraints.js';
import { MoveSet, MOVESET_PRESETS, AMOUNTS } from '../core/moveset.js';
import { scoreAlg, rankAlgs } from '../ergonomics/score.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};

const CONSTRAINT_LABELS = { solved: 'složeno', permutation: 'permutace', orientation: 'orientace', ignore: 'nezáleží' };
const AMOUNT_LABELS = { 1: 'po směru', [-1]: "proti (')", 2: 'dvojitě (2)' };

let constraints = presetConstraints('f2l-fr');

// --- Cíl: omezení dílků ------------------------------------------------------

function renderPresets() {
  const sel = $('preset');
  for (const [id, p] of Object.entries(SUBSTATE_PRESETS)) sel.append(el('option', { value: id, textContent: p.label }));
  sel.append(el('option', { value: 'custom', textContent: 'Vlastní' }));
  sel.value = 'f2l-fr';
  sel.onchange = () => {
    if (sel.value === 'custom') return;
    constraints = presetConstraints(sel.value);
    renderPieces();
    update();
  };
}

function renderPieces() {
  const box = $('pieces');
  box.replaceChildren();
  for (const [type, title] of [['center', 'Středy'], ['edge', 'Hrany'], ['corner', 'Rohy']]) {
    box.append(el('h4', { textContent: title }));
    for (const slot of SLOTS.filter((s) => s.type === type)) {
      const sel = el('select');
      const options = type === 'center' ? ['ignore', 'solved'] : CONSTRAINT_TYPES;
      for (const c of options) sel.append(el('option', { value: c, textContent: CONSTRAINT_LABELS[c] }));
      sel.value = constraints[slot.name] === 'ignore' || options.includes(constraints[slot.name]) ? constraints[slot.name] : 'solved';
      sel.dataset.v = sel.value;
      sel.onchange = () => {
        constraints[slot.name] = sel.dataset.v = sel.value;
        $('preset').value = 'custom';
        update();
      };
      box.append(el('div', { className: 'piece' }, el('b', { textContent: slot.name }), sel));
    }
  }
}

// --- Povolené tahy -----------------------------------------------------------

function renderMoveSet() {
  const sel = $('moveset-preset');
  for (const [id, p] of Object.entries(MOVESET_PRESETS)) sel.append(el('option', { value: id, textContent: p.label }));
  sel.append(el('option', { value: 'custom', textContent: 'Vlastní' }));
  sel.value = 'F2L';

  const bases = $('bases');
  for (const b of BASES) {
    const cb = el('input', { type: 'checkbox', value: b, checked: MOVESET_PRESETS.F2L.bases.includes(b) });
    cb.onchange = () => { sel.value = 'custom'; update(); };
    const kind = MOVE_DEFS[b].kind;
    bases.append(el('label', { title: kind }, cb, b));
  }
  const amounts = $('amounts');
  for (const a of AMOUNTS) {
    const cb = el('input', { type: 'checkbox', value: String(a), checked: true });
    cb.onchange = update;
    amounts.append(el('label', {}, cb, AMOUNT_LABELS[a]));
  }
  sel.onchange = () => {
    if (sel.value === 'custom') return;
    const chosen = MOVESET_PRESETS[sel.value].bases;
    for (const cb of bases.querySelectorAll('input')) cb.checked = chosen.includes(cb.value);
    update();
  };
}

function currentMoveSet() {
  const checked = (id) => [...$(id).querySelectorAll('input:checked')].map((c) => c.value);
  return new MoveSet({ bases: checked('bases'), amounts: checked('amounts').map(Number) });
}

// --- Vykreslení ----------------------------------------------------------------

// Rozložení sítě 12 × 9: [stěna, sloupec, řádek] levého horního rohu.
const NET = { U: [3, 0], L: [0, 3], F: [3, 3], R: [6, 3], B: [9, 3], D: [3, 6] };

function renderNet(loc) {
  const vis = stickerVisibility(constraints);
  const cells = Array.from({ length: 9 * 12 }, () => el('span', { className: 'gap' }));
  for (let k = 0; k < 54; k++) {
    const pos = loc[k];
    const { face } = FACELETS[pos];
    const i = pos % 9;
    const [cx, cy] = NET[face];
    const cell = cells[(cy + Math.floor(i / 3)) * 12 + cx + (i % 3)];
    cell.className = '';
    cell.style.background = vis[k] === 'color' ? `var(--c-${FACELETS[k].face})` : 'var(--c-gray)';
  }
  $('net').replaceChildren(...cells);
}

function renderAlg(alg, score, moveSet) {
  const trig = new Set();
  for (const t of score.triggers) for (let i = t.start; i < t.start + t.length; i++) trig.add(i);
  const moves = parseAlg(alg);
  return el('p', { className: 'alg-view' }, ...moves.flatMap((m, i) => {
    const cls = [trig.has(i) && 'trig', MOVE_DEFS[m.base].kind === 'rotation' && 'rot', !moveSet.allows(m) && 'bad'];
    return [el('span', { className: cls.filter(Boolean).join(' '), textContent: moveToString(m) }), ' '];
  }));
}

function row(label, value) {
  return el('tr', {}, el('td', { textContent: label }), el('td', { textContent: value }));
}

function update() {
  const err = $('alg-error');
  err.hidden = true;
  let alg, start;
  try {
    alg = parseAlg($('alg').value);
    const scramble = $('scramble').value.trim();
    start = scramble ? applyAlg(solved(), scramble) : caseOf(alg);
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    return;
  }
  renderNet(start);

  const moveSet = currentMoveSet();
  const goal = compileGoal(constraints);
  const reached = goal.test(applyAlg(start, alg));
  const illegal = moveSet.check(alg);
  const s = scoreAlg(alg);
  const b = s.breakdown;

  $('result').replaceChildren(
    el('h3', { textContent: 'Discomfort Score' }),
    el('div', { className: 'score', textContent: s.total.toFixed(2) }),
    renderAlg(alg, s, moveSet),
    el('p', {},
      el('span', { className: reached ? 'ok' : 'ko', textContent: reached ? '✔ cíl splněn' : `✘ cíl nesplněn (${goal.violations(applyAlg(start, alg))} porušení)` }),
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
  updateRanking();
}

function updateRanking() {
  const lines = $('compare').value.split('\n').map((l) => l.trim()).filter(Boolean);
  const items = [];
  const valid = [];
  for (const l of lines) {
    try { parseAlg(l); valid.push(l); } catch (e) { items.push(el('li', { className: 'ko', textContent: `${l} – ${e.message}` })); }
  }
  const ranked = rankAlgs(valid).map(({ alg, score }) => el('li', {},
    el('code', { textContent: alg }),
    el('small', { textContent: `skóre ${score.total.toFixed(2)} · ${score.metrics.htm} HTM · ${score.triggers.map((t) => t.name).join(', ') || 'bez triggerů'}` })));
  $('ranking').replaceChildren(...ranked, ...items);
}

renderPresets();
renderPieces();
renderMoveSet();
for (const id of ['alg', 'scramble']) $(id).oninput = update;
$('compare').oninput = updateRanking;
update();
