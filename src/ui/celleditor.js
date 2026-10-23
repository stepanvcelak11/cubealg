// Editor cíle kroku políčko po políčku (core/cells.js): rozložená kostka, klepnutím
// se vybírají místa (i víc najednou nebo celé vrstvy) a pod ní jsou dvě otázky:
//   Co tu musí být?  nic / jeho vlastní dílek / některý z vybraných dílků
//   Jak natočený?    správně / jakkoli / barva na stranu
// Kostka hned ukazuje, co na kterém políčku po kroku musí být. Místa, dílky i barvy
// se ukládají ve skutečných názvech kostky; popisky jsou podle držení metody.

import { el } from './dom.js';
import { SLOTS, SLOT_OF, FACELETS, slotByName } from '../core/geometry.js';
import { holdOf, holdFromFaces } from '../core/hold.js';
import { piecesWithColors, describeCell, remapCells, PIECE_SLOTS } from '../core/cells.js';
import { frameMap, COLOR_NAME, PRESETS } from './parts.js';

const HEX = { U: '#fafaf7', R: '#e5383b', F: '#22b455', D: '#ffd60a', L: '#ff8a1f', B: '#2f6bff' };
const OPP = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' };
const VIEW = ['D', 'U', 'F', 'B', 'R', 'L'];
const WHERE = { D: 'dole', U: 'nahoře', F: 'vpředu', B: 'vzadu', R: 'vpravo', L: 'vlevo' };
const SIDE = { D: 'dolů', U: 'nahoru', F: 'dopředu', B: 'dozadu', R: 'doprava', L: 'doleva' };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const LAYOUT = {
  U: [1, 0, (v) => [v[0], v[2]]], L: [0, 1, (v) => [v[2], v[1]]], F: [1, 1, (v) => [v[0], v[1]]],
  R: [2, 1, (v) => [-v[2], v[1]]], B: [3, 1, (v) => [-v[0], v[1]]], D: [1, 2, (v) => [v[0], -v[2]]],
};

const selections = new Map(); // id kroku → Set vybraných míst (přežije překreslení)
const modes = new Map(); // id kroku → 'tap' (ťukání přepíná stav) | 'select' (výběr míst, pokročilé)
// ťukání: nic → hotovo → jen orientace → jen pozice → nic
const TAP = [null, 'solved', 'oriented', 'place'];
const tapState = (c) => (!c ? null : c.own === 'solved' ? 'solved' : c.own === 'any' ? 'place' : c.ori === 'correct' && c.pieces?.length >= 8 ? 'oriented' : 'custom');

// předvolby „některý z dílků“ v pohledu metody (dole = D)
const typeOf = (n) => (n.length === 3 ? 'corner' : 'edge');
const colorTo = (names, colors) => Object.fromEntries(names.map((n) => [n, { pieces: piecesWithColors(typeOf(n), colors), ori: { side: n.includes('D') ? 'D' : 'U', colors } }]));
const oriented = (names) => Object.fromEntries(names.map((n) => [n, { pieces: piecesWithColors(typeOf(n)), ori: 'correct' }]));
const L = { DE: ['DF', 'DR', 'DB', 'DL'], EE: ['FR', 'BR', 'BL', 'FL'], UE: ['UF', 'UR', 'UB', 'UL'], DC: ['DFR', 'DRB', 'DBL', 'DLF'], UC: ['UFR', 'URB', 'UBL', 'ULF'] };
export const GROUP_PRESETS = [
  { id: 'g-cross', label: 'Kříž z kterýchkoli hran s barvou dole nebo nahoře (tou barvou dolů)', cells: () => colorTo(L.DE, ['D', 'U']) },
  { id: 'g-corner', label: 'Roh vpředu vpravo dole: kterýkoli s barvou dole nebo nahoře (tou dolů)', cells: () => colorTo(['DFR'], ['D', 'U']) },
  { id: 'g-orient-ud', label: 'Natočit horní i spodní vrstvu (barva dole/nahoře nahoru či dolů)', cells: () => colorTo([...L.DE, ...L.UE, ...L.DC, ...L.UC], ['D', 'U']) },
  { id: 'g-sep-edges', label: 'Separace hran: barva dole dolů, barva nahoře nahoru', cells: () => ({ ...colorTo(L.DE, ['D']), ...colorTo(L.UE, ['U']) }) },
  { id: 'g-sep-corners', label: 'Separace rohů: barva dole dolů, barva nahoře nahoru', cells: () => ({ ...colorTo(L.DC, ['D']), ...colorTo(L.UC, ['U']) }) },
  { id: 'g-oll', label: 'Natočená horní vrstva (OLL) – kterékoli dílky', cells: () => oriented([...L.UE, ...L.UC]) },
  { id: 'g-eo', label: 'Natočené všechny hrany (EO)', cells: () => oriented([...L.DE, ...L.EE, ...L.UE]) },
];

/** Buňky hotové před krokem i (pro zobrazení): předchozí kroky (i starší zadání dílky). */
export function cellsBefore(steps, i) {
  const out = {};
  for (const st of steps.slice(0, i)) {
    if (!st.cells) for (const [n, s] of Object.entries(st.parts ?? {})) if (s !== 'orientation') out[n] = { own: s === 'permutation' ? 'any' : 'solved' };
    Object.assign(out, st.cells ?? {});
  }
  return out;
}

/** Zadání kroku po skupinách stejných buněk slovy („4× hrana: kterákoli…“). */
export function cellsLines(cells, frame) {
  const back = Object.fromEntries(Object.entries(frameMap(frame)).map(([v, r]) => [r, v]));
  const groups = new Map();
  for (const [n, c] of Object.entries(cells ?? {})) {
    const type = slotByName(n).type;
    const key = JSON.stringify([type, c]);
    const g = groups.get(key) ?? { n: 0, c, type };
    g.n++;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => `${g.n}× ${g.type === 'edge' ? (g.n === 1 ? 'hrana' : 'hrany') : (g.n === 1 ? 'roh' : 'rohy')}: ${describeCell(g.c, g.type, back)}`);
}

/** Shrnutí buněk kroku („8 vlastních dílků, 4 místa: kterákoli hrana…“). */
export function cellsSummary(cells) {
  const list = Object.values(cells ?? {}).filter(Boolean);
  if (!list.length) return 'nic';
  const own = list.filter((c) => c.own === 'solved').length, ownAny = list.filter((c) => c.own === 'any').length, group = list.filter((c) => c.pieces).length;
  return [own && `${own} hotových`, ownAny && `${ownAny} na místě`, group && `${group} ${group === 1 ? 'místo' : group < 5 ? 'místa' : 'míst'} s kterýmkoli dílkem`].filter(Boolean).join(', ');
}

/** Vzhled políček: co na kterém políčku po kroku musí být (pro síť i náhledy). */
export function cellLooks(cells, before = {}) {
  const look = FACELETS.map((f) => (SLOTS[SLOT_OF[f.index]].type === 'center' ? { fill: [f.face] } : { fill: null }));
  const paint = (cs, faded) => {
    for (const [name, c] of Object.entries(cs ?? {})) {
      if (!c) continue;
      const slot = slotByName(name);
      for (const k of slot.facelets) {
        if (c.own) { look[k] = { fill: [FACELETS[k].face], dashed: c.own === 'any', faded }; continue; }
        if (c.ori && typeof c.ori === 'object') {
          look[k] = FACELETS[k].face === c.ori.side ? { fill: c.ori.colors, faded } : { fill: null, mark: true, faded };
        } else look[k] = { fill: null, mark: true, ring: c.ori === 'correct' && k === slot.facelets[0], faded };
      }
    }
  };
  paint(before, true);
  paint(cells, false);
  return look;
}

/** Síť kostky jako SVG (natočená podle držení); look z cellLooks, sel = vybraná místa. */
export function cellsNetSvg(look, frame, { sel = new Set(), size = 300, interactive = false } = {}) {
  const [c1, c2, c3] = holdOf(holdFromFaces(OPP[frame.down], frame.front)).linear();
  const view = (v) => { const css = [v[0], -v[1], v[2]]; return [dot(c1, css), dot(c2, css), dot(c3, css)]; };
  const sideOf = (n) => (n[1] < -0.5 ? 'U' : n[1] > 0.5 ? 'D' : n[2] > 0.5 ? 'F' : n[2] < -0.5 ? 'B' : n[0] > 0.5 ? 'R' : 'L');
  const out = [];
  for (const f of FACELETS) {
    const [col, row, flat] = LAYOUT[sideOf(view(f.normal))];
    const [x, y] = flat(view(f.pos)).map((c) => Math.round(c) + 1);
    const X = col * 3 + x + 0.06, Y = row * 3 + y + 0.06, W = 0.88;
    const lk = look[f.index];
    const slot = SLOTS[SLOT_OF[f.index]];
    const selected = sel.has(slot.name);
    const op = lk.faded ? 0.38 : 1;
    const attrs = interactive && slot.type !== 'center' ? ` data-slot="${slot.name}" class="cell-hit"` : '';
    if (lk.fill?.length) {
      const n = lk.fill.length;
      lk.fill.forEach((c, i) => out.push(`<rect x="${X + (W * i) / n}" y="${Y}" width="${W / n}" height="${W}" fill="${HEX[c]}" opacity="${op}"${i === 0 ? '' : ''}/>`));
      out.push(`<rect x="${X}" y="${Y}" width="${W}" height="${W}" rx="0.14" fill="none" stroke="${lk.dashed ? '#14151c' : 'rgb(20 21 28 / 0.35)'}" stroke-width="${lk.dashed ? 0.08 : 0.04}" ${lk.dashed ? 'stroke-dasharray="0.16 0.1"' : ''} opacity="${op}"/>`);
    } else {
      out.push(`<rect x="${X}" y="${Y}" width="${W}" height="${W}" rx="0.14" fill="${lk.mark ? '#8a8f9c' : '#d6d8de'}" opacity="${lk.mark ? op : 1}"/>`);
      if (lk.ring) out.push(`<circle cx="${X + W / 2}" cy="${Y + W / 2}" r="0.16" fill="#fff" opacity="${op}"/>`);
    }
    if (selected) out.push(`<rect x="${X - 0.03}" y="${Y - 0.03}" width="${W + 0.06}" height="${W + 0.06}" rx="0.16" fill="none" stroke="var(--accent, #4b4bff)" stroke-width="0.14"/>`);
    if (attrs) out.push(`<rect x="${X}" y="${Y}" width="${W}" height="${W}" fill="transparent"${attrs}/>`);
  }
  return `<svg viewBox="-0.15 -0.15 12.3 9.3" width="${size}" style="max-width:100%;height:auto" role="img" aria-label="Kostka po kroku (síť)">${out.join('')}</svg>`;
}

/**
 * @param {{id:string, cells?: object}} step krok (cells se mění na místě)
 * @param {object} before buňky hotové z předchozích kroků (jen pro zobrazení)
 * @param {{down:string, front:string}} frame držení metody
 * @param {() => void} onChange uložit a překreslit
 */
export function cellEditor(step, before, frame, onChange) {
  const map = frameMap(frame); // pohled metody → kostka
  const back = Object.fromEntries(Object.entries(map).map(([v, r]) => [r, v]));
  const cells = step.cells ?? (step.cells = {});
  const sel = selections.get(step.id) ?? new Set();
  selections.set(step.id, sel);
  for (const n of [...sel]) if (!slotByName(n)) sel.delete(n);
  const commit = () => { onChange(); };
  const chosen = [...sel];
  const types = new Set(chosen.map((n) => slotByName(n).type));
  const real = (names) => names.map((n) => slotByName([...n].map((f) => map[f]).join('')).name);
  const color = (r) => COLOR_NAME[r];

  // --- síť ------------------------------------------------------------------------------------
  const net = el('div', { className: 'cell-net' });
  net.innerHTML = cellsNetSvg(cellLooks(cells, before), frame, { sel, interactive: true });
  const mode = modes.get(step.id) ?? (Object.values(cells).some((c) => tapState(c) === 'custom') ? 'select' : 'tap');
  modes.set(step.id, mode); // zvolený režim zůstane i po úpravách
  net.onclick = (e) => {
    const name = e.target?.dataset?.slot;
    if (!name) return;
    if (mode === 'tap') {
      const cur = tapState(cells[name]);
      const nextState = cur === 'custom' ? null : TAP[(TAP.indexOf(cur) + 1) % TAP.length];
      const type = slotByName(name).type;
      if (!nextState) delete cells[name];
      else cells[name] = nextState === 'solved' ? { own: 'solved' } : nextState === 'place' ? { own: 'any' } : { pieces: piecesWithColors(type), ori: 'correct' };
    } else if (sel.has(name)) sel.delete(name); else sel.add(name);
    commit();
  };
  const switchMode = (m) => { modes.set(step.id, m); if (m === 'tap') sel.clear(); commit(); };
  const pick = (label, names) => {
    const r = real(names);
    const on = r.length && r.every((n) => sel.has(n));
    return el('button', { type: 'button', className: `rule-chip${on ? ' on' : ''}`, textContent: label,
      onclick: () => { if (on) r.forEach((n) => sel.delete(n)); else r.forEach((n) => sel.add(n)); commit(); } });
  };
  const quick = el('div', { className: 'rule-chips cell-quick' },
    pick('Hrany dole', L.DE), pick('Rohy dole', L.DC), pick('Hrany uprostřed', L.EE), pick('Hrany nahoře', L.UE), pick('Rohy nahoře', L.UC),
    el('button', { type: 'button', className: 'rule-chip', textContent: 'Zrušit výběr', disabled: !sel.size, onclick: () => { sel.clear(); commit(); } }));

  // --- panel pro vybraná místa ------------------------------------------------------------------
  let panel;
  if (!chosen.length) {
    panel = el('p', { className: 'hint cell-hint', textContent: 'Klepni na políčko kostky (vybere se celé místo – hrana nebo roh), nebo vyber víc míst tlačítky výš. Pak řekneš, co tam po kroku musí být.' });
  } else {
    const first = cells[chosen[0]];
    const same = chosen.every((n) => JSON.stringify(cells[n] ?? null) === JSON.stringify(first ?? null));
    const what = !same ? null : !first ? 'none' : first.own ? 'own' : 'pieces';
    const setAll = (fn) => { for (const n of chosen) { const v = fn(n, cells[n]); if (v) cells[n] = v; else delete cells[n]; } commit(); };
    const radio = (group, value, current, label, hint, onPick) => {
      const r = Object.assign(el('input', { type: 'radio', name: `${group}-${step.id}`, value }), { checked: current === value });
      r.onchange = onPick;
      return el('label', { className: `rule-opt${current === value ? ' on' : ''}` }, r, el('span', {}, el('b', { textContent: label }), hint ? el('small', { textContent: hint }) : null));
    };
    const defaultPieces = (n) => piecesWithColors(slotByName(n).type, [...new Set(slotByName(n).facelets.map((f) => FACELETS[f].face))].filter((c) => c === map.D || c === map.U).length
      ? [map.D, map.U] : []);
    const whatOpts = el('div', { className: 'rule-opts' },
      radio('what', 'none', what, 'Nic', 'Na tomto místě po kroku nezáleží.', () => setAll(() => null)),
      radio('what', 'own', what, 'Jeho vlastní dílek', 'Dílek, který sem patří (např. hrana bílá-zelená na své místo).', () => setAll(() => ({ own: 'solved' }))),
      radio('what', 'pieces', what, 'Některý z vybraných dílků', 'Kterýkoli z dílků, které vybereš (třeba všechny s bílou nebo žlutou).',
        () => setAll((n, c) => (c?.pieces ? c : { pieces: defaultPieces(n), ori: 'any' }))));
    const parts = [el('span', { className: 'rule-label', textContent: 'Co tu musí být?' }), whatOpts];

    if (what === 'own') {
      parts.push(el('span', { className: 'rule-label', textContent: 'Jak natočený?' }), el('div', { className: 'rule-opts' },
        radio('own', 'solved', first.own, 'Správně', 'Hotový – jako ve složené kostce.', () => setAll(() => ({ own: 'solved' }))),
        radio('own', 'any', first.own, 'Jakkoli', 'Jen na svém místě, natočení nevadí.', () => setAll(() => ({ own: 'any' })))));
    }
    if (what === 'pieces') {
      // dílky: podle barev (všechny dílky s některou z barev), nebo ručně
      // barvy výběru: všechny dílky s tou barvou jsou vybrané (u „všech dílků“ žádná konkrétní)
      const everything = chosen.every((n) => cells[n].pieces.length >= piecesWithColors(slotByName(n).type).length);
      const colorsOn = everything ? [] : VIEW.filter((v) => chosen.every((n) => {
        const has = piecesWithColors(slotByName(n).type, [map[v]]);
        return has.every((p) => cells[n].pieces.includes(p));
      }));
      // natočení „tou barvou na stranu“ jde s výběrem dílků (barva se nezadává dvakrát)
      const byColors = (vs) => setAll((n, c) => ({
        ...c, pieces: piecesWithColors(slotByName(n).type, vs.map((v) => map[v])),
        ...(c.ori && typeof c.ori === 'object' && vs.length ? { ori: { ...c.ori, colors: vs.map((v) => map[v]) } } : {}),
      }));
      parts.push(el('span', { className: 'rule-label', textContent: 'Které dílky?' }),
        el('div', { className: 'rule-row' }, el('span', { className: 'hint', textContent: 'všechny s barvou:' }),
          el('div', { className: 'rule-chips' }, ...VIEW.map((v) => el('button', { type: 'button', className: `rule-chip${colorsOn.includes(v) ? ' on' : ''}`,
            onclick: () => byColors(colorsOn.includes(v) ? colorsOn.filter((x) => x !== v) : [...colorsOn, v]) },
          el('i', { style: `--c: var(--c-${map[v]})` }), `${color(map[v])} (${WHERE[v]})`)),
          el('button', { type: 'button', className: 'rule-chip', textContent: 'všechny', onclick: () => byColors([]) }))));
      // ruční výběr: dílky po typu
      for (const type of types) {
        const list = PIECE_SLOTS.filter((s) => s.type === type);
        const inAll = (p) => chosen.filter((n) => slotByName(n).type === type).every((n) => cells[n].pieces.includes(p));
        parts.push(el('details', { className: 'cell-pieces' },
          el('summary', { textContent: `Vybrat ${type === 'edge' ? 'hrany' : 'rohy'} ručně (${list.filter((p) => inAll(p.name)).length} z ${list.length})` }),
          el('div', { className: 'rule-chips' }, ...list.map((p) => el('button', { type: 'button', className: `rule-chip piece-chip${inAll(p.name) ? ' on' : ''}`, title: p.facelets.map((f) => color(FACELETS[f].face)).join('-'),
            onclick: () => setAll((n, c) => (slotByName(n).type !== type ? c : { ...c, pieces: inAll(p.name) ? c.pieces.filter((x) => x !== p.name) : [...c.pieces, p.name] })) },
          ...p.facelets.map((f) => el('i', { style: `--c: var(--c-${FACELETS[f].face})` })))))));
      }
      // natočení
      const ori = first.ori;
      const oriKind = ori === 'correct' ? 'correct' : ori && typeof ori === 'object' ? 'color' : 'any';
      // strany, které mají všechna vybraná místa (v pohledu metody)
      const sidesOf = (n) => slotByName(n).facelets.map((f) => back[FACELETS[f].face]);
      const common = VIEW.filter((v) => chosen.every((n) => sidesOf(n).includes(v)));
      const udEach = chosen.every((n) => sidesOf(n).some((v) => v === 'U' || v === 'D'));
      const sideFor = (n, v) => (v === 'UD' ? map[sidesOf(n).find((x) => x === 'U' || x === 'D')] : map[v]);
      const colorOpts = (n, c) => (c.ori && typeof c.ori === 'object' ? c.ori.colors : [...new Set(c.pieces.flatMap((p) => [...p]))].filter((x) => x === map.D || x === map.U).slice(0, 2));
      parts.push(el('span', { className: 'rule-label', textContent: 'Jak natočený?' }), el('div', { className: 'rule-opts' },
        radio('ori', 'any', oriKind, 'Jakkoli', null, () => setAll((n, c) => ({ ...c, ori: 'any' }))),
        radio('ori', 'correct', oriKind, 'Správně natočený', 'Rohy barvou nahoře/dole nahoru či dolů, hrany jako ve složené kostce (EO).', () => setAll((n, c) => ({ ...c, ori: 'correct' }))),
        radio('ori', 'color', oriKind, colorsOn.length ? `${colorsOn.map((v) => color(map[v])).join(' nebo ')} nálepkou na určitou stranu` : 'Určitá barva na určitou stranu',
          colorsOn.length ? 'Barva z výběru dílků výš míří na stranu, kterou vybereš (např. dolů).' : 'Např. bílá nebo žlutá dolů.',
          () => setAll((n, c) => ({ ...c, ori: { side: sideFor(n, udEach ? 'UD' : common[0] ?? 'D'), colors: colorsOn.length ? colorsOn.map((v) => map[v]) : colorOpts(n, c).length ? colorOpts(n, c) : [map.D] } })))));
      if (oriKind === 'color') {
        const curSide = chosen.every((n) => cells[n].ori.side === sideFor(n, 'UD')) && udEach ? 'UD' : back[ori.side];
        const curColors = ori.colors.map((r) => back[r]);
        const sameAsPieces = colorsOn.length && curColors.length === colorsOn.length && curColors.every((v) => colorsOn.includes(v));
        parts.push(el('div', { className: 'rule-sub' },
          el('div', { className: 'rule-row' }, el('span', { className: 'hint', textContent: 'míří:' }), el('div', { className: 'rule-chips' },
            ...(udEach ? [el('button', { type: 'button', className: `rule-chip${curSide === 'UD' ? ' on' : ''}`, textContent: 'nahoru či dolů (podle vrstvy)',
              onclick: () => setAll((n, c) => ({ ...c, ori: { ...c.ori, side: sideFor(n, 'UD') } })) })] : []),
            ...common.map((v) => el('button', { type: 'button', className: `rule-chip${curSide === v ? ' on' : ''}`, textContent: SIDE[v],
              onclick: () => setAll((n, c) => ({ ...c, ori: { ...c.ori, side: map[v] } })) })))),
          // jiná barva než u výběru dílků – jen výjimečně (např. roh s bílou, ale dolů má mířit zelená)
          el('details', { className: 'cell-pieces', open: !sameAsPieces },
            el('summary', { textContent: sameAsPieces ? 'Jiná barva, než jakou mají vybrané dílky (výjimečně)' : 'Barva nálepky' }),
            el('div', { className: 'rule-chips' }, ...VIEW.map((v) => el('button', {
              type: 'button', className: `rule-chip${curColors.includes(v) ? ' on' : ''}`,
              onclick: () => setAll((n, c) => ({ ...c, ori: { ...c.ori, colors: (curColors.includes(v) ? curColors.filter((x) => x !== v) : [...curColors, v]).map((x) => map[x]) } })) },
            el('i', { style: `--c: var(--c-${map[v]})` }), color(map[v])))))));
      }
    }
    const placeWord = chosen.length === 1 ? 'místo' : chosen.length < 5 ? 'místa' : 'míst';
    const say = !same ? 'Vybraná místa mají různé nastavení – volba výš ho sjednotí.'
      : `${chosen.length} ${placeWord}: ${describeCell(first, slotByName(chosen[0]).type, back)}.`;
    panel = el('div', { className: 'cell-panel' },
      el('b', { className: 'cell-panel-title', textContent: `Vybráno: ${chosen.length} ${placeWord}` }),
      ...parts,
      el('p', { className: 'rule-say', textContent: say }));
  }

  // --- přehled kroku (stejné buňky dohromady) a předvolby ----------------------------------------
  const groups = new Map();
  for (const [n, c] of Object.entries(cells)) {
    const key = JSON.stringify([slotByName(n).type, c]);
    const g = groups.get(key) ?? { names: [], c, type: slotByName(n).type };
    g.names.push(n);
    groups.set(key, g);
  }
  const overview = groups.size ? el('ul', { className: 'cell-overview' }, ...[...groups.values()].map((g) => el('li', {},
    el('button', { type: 'button', className: 'link-btn', textContent: `${g.names.length}× ${g.type === 'edge' ? 'hrana' : 'roh'}`, title: 'Vybrat tato místa',
      onclick: () => { sel.clear(); g.names.forEach((n) => sel.add(n)); commit(); } }),
    el('span', { textContent: ` ${describeCell(g.c, g.type, back)}` })))) : null;
  const preset = el('select', { className: 'small-select cell-preset', ariaLabel: 'Přidat předvolbu' },
    el('option', { value: '', textContent: '+ Předvolba (kříž, F2L, bloky, OLL, separace…)' }),
    el('optgroup', { label: 'Vlastní dílky na místa' }, ...PRESETS.filter((p) => !Object.values(p.parts).includes('orientation')).map((p) => el('option', { value: p.id, textContent: p.label }))),
    el('optgroup', { label: 'Kterékoli dílky ze skupiny' }, ...GROUP_PRESETS.map((p) => el('option', { value: p.id, textContent: p.label }))));
  preset.onchange = () => {
    const g = GROUP_PRESETS.find((p) => p.id === preset.value);
    const p = PRESETS.find((x) => x.id === preset.value);
    const add = g ? g.cells() : p ? Object.fromEntries(Object.keys(p.parts).map((n) => [n, { own: 'solved' }])) : null;
    if (!add) return;
    Object.assign(cells, remapCells(add, map));
    if (g) modes.set(step.id, 'select'); // skupina dílků = pokročilé zadání
    sel.clear();
    Object.keys(remapCells(add, map)).forEach((n) => sel.add(n));
    commit();
  };
  const clear = el('button', { type: 'button', className: 'secondary small', textContent: 'Vymazat vše', disabled: !Object.keys(cells).length,
    onclick: () => { if (confirm('Vymazat celé zadání kroku?')) { for (const k of Object.keys(cells)) delete cells[k]; sel.clear(); commit(); } } });

  if (mode === 'tap') {
    // základ: ťukání na dílky přepíná stav; legenda vypadá jako políčka na kostce
    const key = (look, label, hint) => el('span', { className: 'cell-key', title: hint }, Object.assign(el('span', { className: 'cell-key-sw' }), { innerHTML: look }), label);
    const sw = (inner) => `<svg viewBox="0 0 1 1" width="16" height="16">${inner}</svg>`;
    return el('div', { className: 'cell-editor' },
      el('div', { className: 'row-btns cell-tools' }, preset, clear),
      el('p', { className: 'hint cell-hint', textContent: 'Ťukej na dílky kostky – každé ťuknutí přepne stav:' }),
      el('div', { className: 'cell-keys' },
        key(sw('<rect width="1" height="1" rx="0.15" fill="#22b455"/>'), 'hotovo', 'Správné místo i natočení (barvy jako ve složené kostce)'),
        key(sw('<rect width="1" height="1" rx="0.15" fill="#8a8f9c"/><circle cx="0.5" cy="0.5" r="0.18" fill="#fff"/>'), 'jen orientace', 'Kterýkoli dílek, ale správně natočený (EO, OLL)'),
        key(sw('<rect x="0.05" y="0.05" width="0.9" height="0.9" rx="0.15" fill="#22b455" opacity="0.55" stroke="#14151c" stroke-width="0.08" stroke-dasharray="0.16 0.1"/>'), 'jen pozice', 'Vlastní dílek na svém místě, natočení nevadí'),
        key(sw('<rect width="1" height="1" rx="0.15" fill="#d6d8de"/>'), 'nezajímá mě', 'Na dílku po kroku nezáleží')),
      net,
      el('p', { className: 'hint cell-legend', textContent: 'Bledé = hotové z dřívějších kroků (zůstane zachované samo).' }),
      el('button', { type: 'button', className: 'link-btn cell-adv', textContent: 'Pokročilé: kterýkoli dílek ze skupiny (např. kříž z bílých i žlutých hran) →', onclick: () => switchMode('select') }),
      overview ? el('b', { className: 'bld-sub', textContent: 'Celé zadání kroku' }) : null, overview);
  }
  return el('div', { className: 'cell-editor' },
    el('div', { className: 'row-btns cell-tools' }, preset, clear),
    el('button', { type: 'button', className: 'link-btn cell-adv', textContent: '← Zpět na jednoduché ťukání', onclick: () => switchMode('tap') }),
    net,
    el('p', { className: 'hint cell-legend' }, 'Barevné políčko = tahle barva tam musí být (víc barev = kterákoli z nich) · tmavě šedé = na dílku záleží, ale ne na barvě tohoto políčka (bílá tečka = správně natočený) · světlé = nezáleží · bledé = hotové z dřívějších kroků'),
    quick, panel,
    overview ? el('b', { className: 'bld-sub', textContent: 'Celé zadání kroku' }) : null, overview);
}

