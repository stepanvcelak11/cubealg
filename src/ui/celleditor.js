// Editor cíle kroku (core/cells.js) na rozložené kostce, která pokračuje z minulého
// kroku: vlevo kostka před krokem, vpravo po kroku (hotové z dřívějška je vidět, nové
// má rámeček).
//   Základ: barvení nálepek jako v Labu – vybereš barvu (víc barev = kterákoli z nich,
//           např. bílá nebo žlutá), „správnou barvu“ (jako střed strany), nebo „nezáleží“
//           a klepeš na nálepky (klepnutí na střed vybarví celou stranu).
//   Pokročilé: výběr míst a dvě otázky – Co tu musí být? (vlastní dílek / některý
//           z vybraných dílků) a Jak natočený? (správně – např. EO / jakkoli / barva na stranu).
// Místa, dílky i barvy se ukládají ve skutečných názvech kostky; popisky jsou podle
// držení metody.

import { el } from './dom.js';
import { SLOTS, SLOT_OF, FACELETS, slotByName } from '../core/geometry.js';
import { holdOf, holdFromFaces } from '../core/hold.js';
import { piecesWithColors, describeCell, remapCells, PIECE_SLOTS, cellStickers, stickersSolved, cellsBefore } from '../core/cells.js';

export { cellsBefore };
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
const modes = new Map(); // id kroku → 'paint' (barvení nálepek) | 'select' (výběr míst, pokročilé)
const brushes = new Map(); // id kroku → { pick: 'colors' | 'own' | 'none', colors: [...], piece: bool }
const PALETTE = ['U', 'D', 'F', 'B', 'R', 'L'];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const sortColors = (cs) => [...cs].sort((a, b) => PALETTE.indexOf(a) - PALETTE.indexOf(b));

/** Uložení buňky po nálepkách: prázdná = pryč, všechny barvy vlastní = hotový dílek. */
function storeStickers(cells, name, colors, before) {
  const slot = slotByName(name);
  const clean = Object.fromEntries(Object.entries(colors).filter(([, cs]) => cs?.length).map(([f, cs]) => [f, sortColors(cs)]));
  const cell = !Object.keys(clean).length ? null : stickersSolved(slot, clean) ? { own: 'solved' } : { colors: clean };
  // stejné jako po dřívějších krocích = nic nového (zůstane zachované samo)
  const prev = before[name] ? cellStickers(before[name], slot) : null;
  if (!cell || (prev && same(prev, cellStickers(cell, slot)))) delete cells[name]; else cells[name] = cell;
}

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
  const painted = list.filter((c) => c.colors).length;
  const n = (k, one, few, many) => `${k} ${k === 1 ? one : k < 5 ? few : many}`;
  return [own && n(own, 'hotový dílek', 'hotové dílky', 'hotových dílků'), ownAny && `${ownAny} na svém místě`,
    painted && `${n(painted, 'dílek', 'dílky', 'dílků')} s barvami`, group && `${n(group, 'místo', 'místa', 'míst')} s kterýmkoli dílkem`].filter(Boolean).join(', ');
}

/** Buňky kroku, které něco mění proti stavu před krokem (bez opakování dřívějších). */
export function freshCells(cells, before = {}) {
  return Object.fromEntries(Object.entries(cells ?? {}).filter(([n, c]) => JSON.stringify(before?.[n] ?? null) !== JSON.stringify(c)));
}

/**
 * Vzhled políček: co na kterém políčku po kroku musí být (pro síť i náhledy).
 * Hotové z dřívějších kroků se kreslí normálně (kostka pokračuje z minulého kroku),
 * co přidává tento krok, má barevný rámeček (když nějaké dřívější je).
 */
export function cellLooks(cells, before = {}) {
  const look = FACELETS.map((f) => (SLOTS[SLOT_OF[f.index]].type === 'center' ? { fill: [f.face] } : { fill: null }));
  const fresh = Object.values(before ?? {}).some(Boolean);
  const paint = (cs, own) => {
    for (const [name, c] of Object.entries(cs ?? {})) {
      if (!c) continue;
      const slot = slotByName(name);
      const mark = own && fresh;
      for (const k of slot.facelets) {
        if (c.own) { look[k] = { fill: [FACELETS[k].face], dashed: c.own === 'any', fresh: mark }; continue; }
        if (c.colors) { const cs = c.colors[FACELETS[k].face]; if (cs?.length) look[k] = { fill: cs, fresh: mark }; continue; }
        if (c.ori && typeof c.ori === 'object') {
          look[k] = FACELETS[k].face === c.ori.side ? { fill: c.ori.colors, fresh: mark } : { fill: null, mark: true, fresh: mark };
        } else look[k] = { fill: null, mark: true, ring: c.ori === 'correct' && k === slot.facelets[0], fresh: mark };
      }
    }
  };
  paint(before, false);
  paint(cells, true);
  return look;
}

/** Síť kostky jako SVG (natočená podle držení); look z cellLooks, sel = vybraná místa. */
export function cellsNetSvg(look, frame, { sel = new Set(), size = 300, interactive = false } = {}) {
  const [c1, c2, c3] = holdOf(holdFromFaces(OPP[frame.down], frame.front)).linear();
  const view = (v) => { const css = [v[0], -v[1], v[2]]; return [dot(c1, css), dot(c2, css), dot(c3, css)]; };
  const sideOf = (n) => (n[1] < -0.5 ? 'U' : n[1] > 0.5 ? 'D' : n[2] > 0.5 ? 'F' : n[2] < -0.5 ? 'B' : n[0] > 0.5 ? 'R' : 'L');
  const out = [], top = [];
  for (const f of FACELETS) {
    const [col, row, flat] = LAYOUT[sideOf(view(f.normal))];
    const [x, y] = flat(view(f.pos)).map((c) => Math.round(c) + 1);
    const X = col * 3 + x + 0.06, Y = row * 3 + y + 0.06, W = 0.88;
    const lk = look[f.index];
    const slot = SLOTS[SLOT_OF[f.index]];
    const selected = sel.has(slot.name);
    const op = lk.faded ? 0.38 : 1;
    const attrs = !interactive ? '' : slot.type === 'center' ? ` data-k="${f.index}" data-center="${f.face}" class="cell-hit"`
      : ` data-slot="${slot.name}" data-k="${f.index}" class="cell-hit"`;
    if (lk.fill?.length) {
      const n = lk.fill.length;
      lk.fill.forEach((c, i) => out.push(`<rect x="${X + (W * i) / n}" y="${Y}" width="${W / n}" height="${W}" fill="${HEX[c]}" opacity="${op}"/>`));
      out.push(`<rect x="${X}" y="${Y}" width="${W}" height="${W}" rx="0.14" fill="none" stroke="${lk.dashed ? '#14151c' : 'rgb(20 21 28 / 0.35)'}" stroke-width="${lk.dashed ? 0.08 : 0.04}" ${lk.dashed ? 'stroke-dasharray="0.16 0.1"' : ''} opacity="${op}"/>`);
    } else {
      out.push(`<rect x="${X}" y="${Y}" width="${W}" height="${W}" rx="0.14" fill="${lk.mark ? '#8a8f9c' : '#d6d8de'}" opacity="${lk.mark ? op : 1}"/>`);
      if (lk.ring) out.push(`<circle cx="${X + W / 2}" cy="${Y + W / 2}" r="0.16" fill="#fff" opacity="${op}"/>`);
    }
    // nové v tomto kroku: rámeček (kreslí se navrch, aby ho sousední políčka nepřekryla)
    if (lk.fresh) top.push(`<rect x="${X + 0.02}" y="${Y + 0.02}" width="${W - 0.04}" height="${W - 0.04}" rx="0.14" fill="none" stroke="#e8467c" stroke-width="0.1"/>`);
    if (selected) top.push(`<rect x="${X - 0.03}" y="${Y - 0.03}" width="${W + 0.06}" height="${W + 0.06}" rx="0.16" fill="none" stroke="var(--accent, #4b4bff)" stroke-width="0.14"/>`);
    if (attrs) top.push(`<rect x="${X}" y="${Y}" width="${W}" height="${W}" fill="transparent"${attrs}/>`);
  }
  return `<svg viewBox="-0.15 -0.15 12.3 9.3" width="${size}" style="max-width:100%;height:auto" role="img" aria-label="Kostka po kroku (síť)">${out.join('')}${top.join('')}</svg>`;
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
  // po nálepkách jde zadat skoro všechno; jen pozice, EO a vybrané dílky → pokročilé
  const mode = modes.get(step.id) ?? (Object.entries(cells).some(([n, c]) => cellStickers(c, slotByName(n)) === null) ? 'select' : 'paint');
  modes.set(step.id, mode); // zvolený režim zůstane i po úpravách
  const brush = brushes.get(step.id) ?? { pick: 'own', colors: [], piece: false };
  const want = (f) => (brush.pick === 'none' ? null : brush.pick === 'own' ? [f] : sortColors(brush.colors));
  /**
   * Barví nálepky (pairs [místo, [stěny]]); když už všechny tu barvu mají, vrátí je
   * (klepnutí znovu = zpět). Buňky jiného druhu se přepíšou na nálepky.
   */
  const paint = (pairs) => {
    if (brush.pick === 'colors' && !brush.colors.length) return;
    const now = Object.fromEntries(pairs.map(([n]) => [n, cellStickers(cells[n], slotByName(n)) ?? {}]));
    const off = brush.pick !== 'none' && pairs.every(([n, fs]) => fs.every((f) => same(now[n][f], want(f))));
    for (const [n, fs] of pairs) {
      for (const f of fs) { if (off || !want(f)) delete now[n][f]; else now[n][f] = want(f); }
      storeStickers(cells, n, now[n], before);
    }
    commit();
  };
  net.onclick = (e) => {
    const k = Number(e.target?.dataset?.k);
    const name = e.target?.dataset?.slot;
    if (mode === 'paint') {
      if (!Number.isInteger(k) || !e.target.dataset.k) return;
      const face = FACELETS[k].face;
      if (e.target.dataset.center) {
        // střed: celá strana
        paint(PIECE_SLOTS.filter((x) => x.facelets.some((i) => FACELETS[i].face === face)).map((x) => [x.name, [face]]));
      } else paint([[name, brush.piece ? slotByName(name).facelets.map((i) => FACELETS[i].face) : [face]]]);
      return;
    }
    if (!name) return;
    if (sel.has(name)) sel.delete(name); else sel.add(name);
    commit();
  };
  const switchMode = (m) => { modes.set(step.id, m); if (m === 'paint') sel.clear(); commit(); };
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
    const what = !same ? null : !first ? 'none' : first.own ? 'own' : first.pieces ? 'pieces' : 'stickers';
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
    el('option', { value: '', textContent: 'Rychle vybarvit: kříž, F2L, blok…' }),
    el('optgroup', { label: 'Vlastní dílky na místa' }, ...PRESETS.filter((p) => !Object.values(p.parts).includes('orientation')).map((p) => el('option', { value: p.id, textContent: p.label }))),
    el('optgroup', { label: 'Kterékoli dílky ze skupiny' }, ...GROUP_PRESETS.map((p) => el('option', { value: p.id, textContent: p.label }))));
  preset.onchange = () => {
    const g = GROUP_PRESETS.find((p) => p.id === preset.value);
    const p = PRESETS.find((x) => x.id === preset.value);
    const add = g ? g.cells() : p ? Object.fromEntries(Object.keys(p.parts).map((n) => [n, { own: 'solved' }])) : null;
    if (!add) return;
    Object.assign(cells, remapCells(add, map));
    // co po nálepkách zadat nejde (EO…) = pokročilé zadání
    if (Object.entries(remapCells(add, map)).some(([n, c]) => cellStickers(c, slotByName(n)) === null)) modes.set(step.id, 'select');
    sel.clear();
    Object.keys(remapCells(add, map)).forEach((n) => sel.add(n));
    commit();
  };
  const clear = el('button', { type: 'button', className: 'secondary small', textContent: 'Vymazat tento krok', disabled: !Object.keys(cells).length,
    onclick: () => { if (confirm('Vymazat celé zadání kroku?')) { for (const k of Object.keys(cells)) delete cells[k]; sel.clear(); commit(); } } });

  const beforeNet = Object.assign(el('div', { className: 'cell-net cell-before' }), { innerHTML: cellsNetSvg(cellLooks({}, before), frame, { size: 220 }) });
  const nets = el('div', { className: 'cell-nets' },
    el('figure', { className: 'cell-fig cell-fig-before' }, beforeNet, el('figcaption', { textContent: 'Před krokem' })),
    el('figure', { className: 'cell-fig cell-fig-after' }, net, el('figcaption', { textContent: mode === 'paint' ? 'Po kroku – klepni na nálepku' : 'Po kroku – klepni na místo' })));
  if (mode === 'paint') {
    // barvení nálepek: paleta (víc barev = kterákoli z nich), správná barva, nezáleží
    const setBrush = (b) => { brushes.set(step.id, { ...brush, ...b }); commit(); };
    const swatch = (c) => {
      const on = brush.pick === 'colors' && brush.colors.includes(c);
      const b = el('button', { type: 'button', className: `cell-swatch${on ? ' on' : ''}`, ariaPressed: String(on), title: color(c),
        onclick: () => setBrush({ pick: 'colors', colors: brush.pick !== 'colors' ? [c] : on ? brush.colors.filter((x) => x !== c) : [...brush.colors, c] }) },
      el('i', { style: `--c: var(--c-${c})` }), el('span', { textContent: color(c) }));
      b.dataset.color = c;
      return b;
    };
    const special = (pick, label, look, hint) => {
      const b = el('button', { type: 'button', className: `cell-swatch wide${brush.pick === pick ? ' on' : ''}`, ariaPressed: String(brush.pick === pick), title: hint,
        onclick: () => setBrush({ pick, colors: [] }) }, Object.assign(el('i', { className: 'cell-sw-look' }), { innerHTML: look }), el('span', { textContent: label }));
      b.dataset.pick = pick;
      return b;
    };
    const sw = (inner) => `<svg viewBox="0 0 1 1" width="18" height="18" aria-hidden="true">${inner}</svg>`;
    const what = brush.pick === 'none' ? 'Klepnutí nálepku vymaže – na její barvě nezáleží (šedá).'
      : brush.pick === 'own' ? 'Klepnutí dá nálepce správnou barvu – stejnou jako střed té strany.'
        : brush.colors.length ? `Klepnutí dá nálepce barvu: ${brush.colors.map(color).join(' nebo ')}${brush.colors.length > 1 ? ' (kterákoli z nich)' : ''}.`
          : 'Vyber aspoň jednu barvu.';
    const pieceBtn = (v, label) => el('button', { type: 'button', className: `rule-chip${brush.piece === v ? ' on' : ''}`, textContent: label, onclick: () => setBrush({ piece: v }) });
    return el('div', { className: 'cell-editor' },
      el('div', { className: 'cell-palette', role: 'group', ariaLabel: 'Barva' },
        special('own', 'Správná barva', sw('<rect width="1" height="0.5" fill="#22b455"/><rect y="0.5" width="1" height="0.5" fill="#e5383b"/>'), 'Barva středu té strany – jako ve složené kostce'),
        ...PALETTE.map(swatch),
        special('none', 'Nezáleží', sw('<rect width="1" height="1" rx="0.15" fill="#d6d8de"/>'), 'Šedá – na barvě nálepky po kroku nezáleží')),
      el('p', { className: 'cell-brush-hint', textContent: what }),
      el('div', { className: 'rule-chips cell-kinds' }, el('span', { className: 'hint', textContent: 'Klepnutí barví:' }),
        pieceBtn(false, 'jednu nálepku'), pieceBtn(true, 'celý dílek')),
      nets,
      el('p', { className: 'hint cell-legend' }, 'Víc barev na nálepce = může tam být kterákoli z nich · šedá = na barvě nezáleží · klepnutí na střed vybarví celou stranu',
        Object.values(before).some(Boolean) ? ' · ' : '', Object.values(before).some(Boolean) ? el('i', { className: 'cell-fresh-key' }) : '',
        Object.values(before).some(Boolean) ? ' = přidává tento krok (bez rámečku = z minulých kroků, zůstane)' : ''),
      overview ? el('div', { className: 'cell-said' }, el('b', { textContent: 'Po kroku musí platit:' }), overview) : null,
      el('div', { className: 'row-btns cell-tools' }, preset, clear),
      el('div', { className: 'row-btns' },
        el('button', { type: 'button', className: 'link-btn cell-adv', textContent: 'Pokročilé (natočení hran – EO, jen pozice, vybrané dílky) →', onclick: () => switchMode('select') })));
  }
  return el('div', { className: 'cell-editor' },
    el('div', { className: 'row-btns cell-tools' }, preset, clear),
    el('button', { type: 'button', className: 'link-btn cell-adv', textContent: '← Zpět na barvení nálepek', onclick: () => switchMode('paint') }),
    nets,
    el('p', { className: 'hint cell-legend' }, 'Barevné políčko = tahle barva tam musí být (víc barev = kterákoli z nich) · tmavě šedé = na dílku záleží, ale ne na barvě tohoto políčka (bílá tečka = správně natočený) · světlé = nezáleží · růžový rámeček = přidává tento krok'),
    quick, panel,
    overview ? el('b', { className: 'bld-sub', textContent: 'Celé zadání kroku' }) : null, overview);
}


/**
 * Zadání pro Lab z kroku i metody: výchozí strana = kostka po předchozích krocích, cíl =
 * po kroku i (jen nálepky s jednou barvou; víc barev na nálepce Lab neumí – zůstanou
 * nevybarvené a vrátí se v `lost`). Celé dílky v cíli mají styl „solved“.
 */
export function stepLabTask(steps, i, frame) {
  const paint = (cells) => {
    const out = FACELETS.map((f) => (SLOTS[SLOT_OF[f.index]].type === 'center' ? f.face : 'X'));
    let lost = 0;
    for (const [name, c] of Object.entries(cells)) {
      const slot = slotByName(name);
      const st = cellStickers(c, slot);
      if (!st) { lost++; continue; }
      for (const k of slot.facelets) {
        const cs = st[FACELETS[k].face];
        if (cs?.length === 1) out[k] = cs[0];
        else if (cs?.length > 1) lost++;
      }
    }
    return { out, lost };
  };
  const A = paint(cellsBefore(steps, i));
  const B = paint(cellsBefore(steps, i + 1));
  const constraints = {};
  for (const slot of SLOTS) if (slot.facelets.every((k) => B.out[k] !== 'X')) constraints[slot.name] = 'solved';
  const map = frameMap(frame);
  return { task: { puzzle: '333', colorsA: A.out, colorsB: B.out, constraints, hold: holdFromFaces(map.U, map.F) }, lost: A.lost + B.lost };
}
