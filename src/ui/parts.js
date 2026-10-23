// Části metody: které dílky 3×3 má po každém kroku hotové. Podle toho timer
// při nácviku kroku zamíchá tak, že předchozí kroky jsou složené. Dílky se
// vybírají přímo v průvodci (předvolby jako kříž nebo blok, případně po dílcích)
// a není k tomu potřeba obrázek z Labu.

import { SLOTS, NORMALS, slotByName } from '../core/geometry.js';
import { solved } from '../core/cube.js';
import { holdFromFaces } from '../core/hold.js';
import { stickersOf } from './cubeview.js';
import { Cube3D } from './cube3d.js';
import { el } from './dom.js';
import { icon } from './icons.js';
import { cellsToParts, remapCells } from '../core/cells.js';

export const COLOR_NAME = { U: 'bílá', D: 'žlutá', F: 'zelená', B: 'modrá', R: 'červená', L: 'oranžová' };
const OPPOSITE = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' };
const STYLE_LABEL = { solved: 'hotový', permutation: 'jen na místě', orientation: 'jen natočený' };
const NEXT_STYLE = { undefined: 'solved', solved: 'permutation', permutation: 'orientation', orientation: undefined };
const PIECES = SLOTS.filter((s) => s.type !== 'center');

/** Výchozí orientace metody: bílá dole, zelená vpředu. */
export const DEFAULT_FRAME = { down: 'U', front: 'F' };

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const faceOf = (v) => Object.keys(NORMALS).find((f) => NORMALS[f].every((x, i) => x === v[i]));

/** Převod stěn: stěna v pohledu metody (D = dole, F = vpředu, …) → stěna kostky. */
export function frameMap(frame = DEFAULT_FRAME) {
  const down = frame.down, front = frame.front;
  const up = OPPOSITE[down];
  const right = faceOf(cross(NORMALS[up], NORMALS[front]));
  return { U: up, D: down, F: front, B: OPPOSITE[front], R: right, L: OPPOSITE[right] };
}

export function validFrame(frame) {
  return !!frame && frame.down in OPPOSITE && frame.front in OPPOSITE
    && frame.front !== frame.down && frame.front !== OPPOSITE[frame.down];
}

const rel = (names, style = 'solved') => Object.fromEntries(names.map((n) => [n, style]));
const CROSS = ['DF', 'DR', 'DB', 'DL'];
const D_CORNERS = ['DFR', 'DRB', 'DBL', 'DLF'];
const E_EDGES = ['FR', 'BR', 'BL', 'FL'];
const U_EDGES = ['UF', 'UR', 'UB', 'UL'];
const U_CORNERS = ['UFR', 'URB', 'UBL', 'ULF'];
const F2L = [...CROSS, ...D_CORNERS, ...E_EDGES];

/** Předvolby v pohledu metody (dole = D, vpředu = F). */
export const PRESETS = [
  { id: 'cross', label: 'Kříž', parts: rel(CROSS) },
  { id: 'xcross', label: 'Kříž + 1 pár (X-cross)', parts: rel([...CROSS, 'DFR', 'FR']) },
  { id: 'pair', label: 'Jeden pár (roh + hrana vpředu vpravo)', parts: rel(['DFR', 'FR']) },
  { id: 'layer1', label: 'První vrstva', parts: rel([...CROSS, ...D_CORNERS]) },
  { id: 'f2l', label: 'První dvě vrstvy (F2L)', parts: rel(F2L) },
  { id: 'block222', label: 'Blok 2×2×2 (vlevo vzadu)', parts: rel(['DBL', 'DL', 'DB', 'BL']) },
  { id: 'block223', label: 'Blok 2×2×3 (vzadu)', parts: rel(['DBL', 'DRB', 'DL', 'DB', 'DR', 'BL', 'BR']) },
  { id: 'roux1', label: 'Levý blok 1×2×3 (Roux)', parts: rel(['DLF', 'DBL', 'DL', 'FL', 'BL']) },
  { id: 'roux2', label: 'Pravý blok 1×2×3 (Roux)', parts: rel(['DFR', 'DRB', 'DR', 'FR', 'BR']) },
  { id: 'cmll', label: 'Horní rohy (CMLL)', parts: rel(U_CORNERS) },
  { id: 'eo', label: 'Natočené hrany (EO)', parts: rel([...CROSS, ...E_EDGES, ...U_EDGES], 'orientation') },
  { id: 'co', label: 'Natočené rohy (CO)', parts: rel([...D_CORNERS, ...U_CORNERS], 'orientation') },
  { id: 'oll', label: 'Natočená horní vrstva (OLL)', parts: rel([...U_EDGES, ...U_CORNERS], 'orientation') },
  { id: 'all', label: 'Celá kostka', parts: rel([...F2L, ...U_EDGES, ...U_CORNERS]) },
];

/** Název dílku v pohledu metody → skutečný název dílku kostky. */
function toCube(name, map) {
  return slotByName([...name].map((f) => map[f]).join('')).name;
}

/** Po změně držení metody převede vybrané dílky kroků tak, aby zůstaly na stejném místě vůči držení. */
export function remapParts(steps, from, to) {
  const a = frameMap(validFrame(from) ? from : DEFAULT_FRAME), b = frameMap(to);
  const back = Object.fromEntries(Object.entries(a).map(([r, f]) => [f, r]));
  for (const st of steps) {
    if (st.cells) st.cells = remapCells(st.cells, Object.fromEntries(Object.keys(back).map((f) => [f, b[back[f]]])));
    if (!st.parts) continue;
    st.parts = Object.fromEntries(Object.entries(st.parts).map(([n, s]) => {
      try { return [toCube([...n].map((f) => back[f]).join(''), b), s]; } catch { return [n, s]; }
    }));
  }
}

/** Předvolba převedená na dílky kostky podle orientace metody. */
export function presetParts(id, frame) {
  const map = frameMap(frame);
  const p = PRESETS.find((x) => x.id === id);
  return Object.fromEntries(Object.entries(p?.parts ?? {}).map(([n, s]) => [toCube(n, map), s]));
}

/** Sjednocení: plná vyhrává, „jen místo“ + „jen natočení“ = hotový dílek. */
export function mergeParts(a, b) {
  const out = { ...a };
  for (const [n, s] of Object.entries(b ?? {})) {
    if (!s || s === 'ignore') continue;
    const was = out[n];
    out[n] = !was || was === s ? s : 'solved';
  }
  return out;
}

/** Dílky hotové po kroku (vlastní dílky na místě): buňky a výběr dílků, jinak cíl obrázku z Labu (3×3). */
export function stepParts(step) {
  // buňky s vlastním dílkem (zadání políčko po políčku, core/cells.js) + starší výběr dílků
  if (step.cells) return mergeParts(step.parts ?? {}, cellsToParts(step.cells));
  if (step.parts && Object.keys(step.parts).length) return step.parts;
  if (step.task && (step.task.puzzle ?? '333') === '333') {
    const pieces = new Set(PIECES.map((s) => s.name));
    return Object.fromEntries(Object.entries(step.task.constraints ?? {}).filter(([n, s]) => pieces.has(n) && s && s !== 'ignore'));
  }
  return {};
}

/** Dílky hotové před krokem: sjednocení předchozích kroků. */
export function partsBefore(steps, stepId) {
  const end = Math.max(0, steps.findIndex((x) => x.id === stepId));
  return steps.slice(0, end).reduce((acc, st) => mergeParts(acc, stepParts(st)), {});
}

/** Krátký popis výběru („8 hotových, 4 jen natočené“). */
export function describeParts(parts) {
  const n = { solved: 0, permutation: 0, orientation: 0 };
  for (const s of Object.values(parts)) if (s in n) n[s] += 1;
  const out = [];
  if (n.solved) out.push(`${n.solved} hotových`);
  if (n.permutation) out.push(`${n.permutation} jen na místě`);
  if (n.orientation) out.push(`${n.orientation} jen natočených`);
  return out.join(', ') || 'nic';
}

/**
 * Malá 3D kostka s dílky: předchozí kroky slabě, tento krok plně (podle stylu).
 * Kostka je natočená podle orientace metody.
 */
export function partsCube(before, now, frame, label = 'Po kroku') {
  const host = el('div', { className: 'parts-cube' });
  queueMicrotask(() => {
    const view = new Cube3D(host, { label });
    const f = validFrame(frame) ? frame : DEFAULT_FRAME;
    view.setHold?.(holdFromFaces(OPPOSITE[f.down], f.front));
    const all = { ...Object.fromEntries(SLOTS.filter((s) => s.type === 'center').map((s) => [s.name, 'solved'])), ...mergeParts(before, now) };
    const stickers = stickersOf(solved(), all);
    // dílky z předchozích kroků (a ne z tohoto) slabě
    for (const s of PIECES) {
      if (before[s.name] && !now[s.name]) for (const k of s.facelets) if (stickers[k].style !== 'none') stickers[k].style = 'faded';
    }
    view.render(stickers);
  });
  return host;
}

/** Barevné tečky dílku. */
function swatches(name) {
  return el('span', { className: 'part-sw' }, ...[...name].map((f) => el('i', { style: `--c: var(--c-${f})` })));
}

/**
 * Editor dílků kroku.
 * @param {{parts?: object}} step krok průvodce (parts se mění na místě)
 * @param {object} before dílky hotové z předchozích kroků
 * @param {{down:string, front:string}} frame orientace metody
 * @param {() => void} onChange uložení a překreslení
 */
export function partsEditor(step, before, frame, onChange) {
  const f = validFrame(frame) ? frame : DEFAULT_FRAME;
  const map = frameMap(f);
  const parts = { ...stepParts(step) };
  const commit = () => { step.parts = Object.keys(parts).length ? { ...parts } : undefined; onChange(); };

  const preset = el('select', { className: 'small-select', ariaLabel: 'Přidat předvolbu' },
    el('option', { value: '', textContent: '+ Přidat předvolbu…' }),
    ...PRESETS.map((p) => el('option', { value: p.id, textContent: p.label })));
  preset.onchange = () => {
    Object.assign(parts, mergeParts(parts, presetParts(preset.value, f)));
    commit();
  };
  const clear = Object.assign(el('button', { type: 'button', className: 'secondary small', disabled: !Object.keys(parts).length }), {
    innerHTML: `${icon('eraser', { size: 16 })}<span>Vymazat</span>`,
    onclick: () => { for (const k of Object.keys(parts)) delete parts[k]; commit(); },
  });

  // dílky po vrstvách v pohledu metody (dole, uprostřed, nahoře)
  const layer = (label, names) => el('div', { className: 'parts-row' },
    el('span', { className: 'parts-row-label', textContent: label }),
    el('div', { className: 'parts-chips' }, ...names.map((relName) => {
      const name = toCube(relName, map);
      const s = parts[name];
      const done = !s && before[name];
      const b = el('button', {
        type: 'button', className: `part-chip${s ? ` ${s}` : ''}${done ? ' before' : ''}`,
        title: `${[...name].map((x) => COLOR_NAME[x]).join('-')}: ${s ? STYLE_LABEL[s] : done ? 'hotový z předchozího kroku' : 'nehotový'} (klepnutím změníš)`,
        ariaLabel: `${[...name].map((x) => COLOR_NAME[x]).join('-')} dílek: ${s ? STYLE_LABEL[s] : 'nehotový'}`,
      }, swatches(name));
      b.onclick = () => {
        const next = NEXT_STYLE[s];
        if (next) parts[name] = next; else delete parts[name];
        commit();
      };
      return b;
    })));

  return el('div', { className: 'parts-editor' },
    el('div', { className: 'parts-head' },
      el('b', { textContent: 'Po kroku je hotovo' }),
      el('small', { className: 'hint', textContent: describeParts(parts) })),
    el('div', { className: 'parts-body' },
      partsCube(before, parts, f),
      el('div', { className: 'parts-grid' },
        layer('Nahoře', [...U_EDGES, ...U_CORNERS]),
        layer('Střed', E_EDGES),
        layer('Dole', [...CROSS, ...D_CORNERS]))),
    el('div', { className: 'row-btns parts-tools' }, preset, clear),
    el('p', { className: 'hint parts-legend' },
      'Klepnutím na dílek: ', el('span', { className: 'part-key solved', textContent: 'hotový' }), ' → ',
      el('span', { className: 'part-key permutation', textContent: 'jen na místě' }), ' → ',
      el('span', { className: 'part-key orientation', textContent: 'jen natočený' }), ' → nic. Podle toho timer při nácviku dalších kroků zamíchá.'));
}

/** Výběr orientace metody (barva dole a vpředu). */
export function frameEditor(frame, onChange) {
  const f = { ...(validFrame(frame) ? frame : DEFAULT_FRAME) };
  const opt = (faces, value) => faces.map((x) => el('option', { value: x, textContent: COLOR_NAME[x], selected: x === value }));
  const down = el('select', { className: 'small-select', ariaLabel: 'Barva dole' }, ...opt(Object.keys(COLOR_NAME), f.down));
  const fronts = () => Object.keys(COLOR_NAME).filter((x) => x !== f.down && x !== OPPOSITE[f.down]);
  const front = el('select', { className: 'small-select', ariaLabel: 'Barva vpředu' }, ...opt(fronts(), f.front));
  down.onchange = () => {
    f.down = down.value;
    if (!fronts().includes(f.front)) f.front = fronts()[0];
    onChange({ ...f });
  };
  front.onchange = () => { f.front = front.value; onChange({ ...f }); };
  return el('div', { className: 'frame-editor' },
    el('span', { textContent: 'Držení metody:' }),
    el('label', {}, 'dole ', down), el('label', {}, 'vpředu ', front));
}
