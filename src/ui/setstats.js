// Statistika sady (výběr sady → Statistika sady…): průměrná délka algoritmů, šance,
// že případ padne, a které tahy sada točí (R, U, M, S…) – na první pohled je vidět,
// jestli sada stojí na tazích, které ti nesedí.

import { el } from './dom.js';
import { algs, algSets, methods } from './store.js';
import { labModel } from './models.js';
import { holdFor } from './holds.js';
import { algLength, moveUsage, caseWeight, caseShares } from '../core/setstats.js';
import { EMPTY } from '../core/task.js';

const fmt = (x, d = 1) => x.toLocaleString('cs-CZ', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (x) => `${fmt(x * 100, x < 0.1 ? 1 : 0)} %`;
const oneIn = (x) => (x ? `1/${fmt(1 / x, 1 / x >= 10 ? 0 : 1)}` : '–');

/** Váha případu algoritmu z jeho zadání (null = nejde spočítat). */
function weightOf(a) {
  try {
    const model = labModel(a.task?.puzzle ?? '333');
    if (model.kind !== 'perm' || model.id !== '333') return null;
    const A = model.deserialize(a.task.colorsA), B = model.deserialize(a.task.colorsB);
    const built = A && B ? model.buildTask(A, B, a.task.constraints, a.task.marks) : null;
    if (!built?.loc) return null;
    const loc = built.loc;
    const tracked = [];
    for (let k = 0; k < loc.length; k++) if (A[loc[k]] !== EMPTY) tracked.push(k);
    const held = a.task.hold ? holdFor(model, a.task.hold) : null;
    const turn = (m) => model.applySteps(model.solved(), model.steps(held ? held.toModelString(m) : m));
    const turns = ['U', 'U2', "U'"].map(turn);
    const faceOf = (k) => model.stickerFace?.[k] ?? k;
    const w = caseWeight(loc, tracked, faceOf, turns, turns);
    const skip = caseWeight(model.solved(), tracked, faceOf, turns, turns).weight;
    return { ...w, skip, sig: tracked.join(',') };
  } catch { return null; }
}

/** Statistika jedné sady (seznam uložených algoritmů). */
export function setStats(list) {
  const lengths = list.map((a) => { try { return algLength(a.alg); } catch { return null; } });
  const ws = list.map(weightOf);
  // přeskočení jen když všechny případy sledují stejné nálepky (jeden krok)
  const same = ws.every((w) => w && w.sig === ws[0]?.sig);
  const sh = caseShares(ws, same && ws.length ? ws[0].skip : 0);
  // uložená přesná šance z generátoru sady má přednost
  const share = list.map((a, i) => (typeof a.share === 'number' ? a.share : sh.share[i]));
  const ok = lengths.filter(Boolean);
  const avg = (f) => (ok.length ? ok.reduce((s, x) => s + f(x), 0) / ok.length : 0);
  const known = list.map((_, i) => (lengths[i] && share[i] != null ? i : -1)).filter((i) => i >= 0);
  const wsum = known.reduce((s, i) => s + share[i], 0);
  const expected = wsum ? known.reduce((s, i) => s + share[i] * lengths[i].stm, 0) / wsum : null;
  return {
    rows: list.map((a, i) => ({ a, len: lengths[i], share: share[i] })),
    stm: avg((x) => x.stm), htm: avg((x) => x.htm),
    min: ok.length ? Math.min(...ok.map((x) => x.stm)) : 0, max: ok.length ? Math.max(...ok.map((x) => x.stm)) : 0,
    expected, skip: same ? sh.skip : null, cases: sh.distinct,
    usage: moveUsage(list.map((a) => a.alg)),
    weighted: known.length ? moveUsage(known.map((i) => list[i].alg), known.map((i) => share[i])) : null,
  };
}

function usageBars(u) {
  const top = u.rows[0]?.share ?? 1;
  return el('div', { className: 'ss-bars' }, ...u.rows.map((r) => el('div', { className: 'ss-bar' },
    el('b', { textContent: r.base }),
    el('span', { className: 'ss-track' }, el('span', { className: 'ss-fill', style: `width:${(r.share / top) * 100}%` })),
    el('small', { textContent: pct(r.share) }))));
}

function section(name, list) {
  const s = setStats(list);
  const sort = el('select', { className: 'small-select', ariaLabel: 'Seřadit' },
    el('option', { value: 'share', textContent: 'podle šance' }),
    el('option', { value: 'len', textContent: 'podle délky' }),
    el('option', { value: 'name', textContent: 'podle názvu' }));
  const table = el('div', { className: 'ss-table' });
  const drawTable = () => {
    const rows = [...s.rows];
    if (sort.value === 'share') rows.sort((x, y) => (y.share ?? -1) - (x.share ?? -1));
    else if (sort.value === 'len') rows.sort((x, y) => (y.len?.stm ?? 0) - (x.len?.stm ?? 0));
    else rows.sort((x, y) => x.a.name.localeCompare(y.a.name, 'cs', { numeric: true }));
    table.replaceChildren(...rows.map((r) => el('div', { className: 'ss-row' },
      el('span', { className: 'ss-name', textContent: r.a.name }),
      el('code', { textContent: r.a.alg }),
      el('span', { className: 'ss-len', textContent: r.len ? `${r.len.stm} tahů` : '–' }),
      el('span', { className: 'ss-share', textContent: r.share != null ? `${oneIn(r.share)} · ${pct(r.share)}` : '–' }))));
  };
  sort.onchange = drawTable;
  drawTable();
  const tile = (v, label) => el('div', { className: 'ss-tile' }, el('b', { textContent: v }), el('small', { textContent: label }));
  const u = s.weighted ?? s.usage;
  return el('section', { className: 'ss-set' },
    name ? el('h3', { textContent: name }) : null,
    el('div', { className: 'ss-tiles' },
      tile(String(list.length), `algoritmů · ${s.cases || '–'} případů`),
      tile(fmt(s.stm), `tahů v průměru (STM) · HTM ${fmt(s.htm)}`),
      tile(s.expected != null ? fmt(s.expected) : '–', 'tahů při složení (podle šancí)'),
      tile(`${s.min}–${s.max}`, 'nejkratší–nejdelší'),
      s.skip ? tile(oneIn(s.skip), 'přeskočení (krok už hotový)') : null),
    el('h4', { textContent: s.weighted ? 'Tahy podle toho, jak často je točíš (váženo šancí)' : 'Tahy v sadě' }),
    usageBars(u),
    el('p', { className: 'hint', textContent: `Dvojité tahy ${pct(u.doubles)} · rotace ${fmt(u.rotations, 2)} na algoritmus` }),
    el('div', { className: 'ss-head' }, el('h4', { textContent: 'Algoritmy' }), sort),
    table);
}

/**
 * @param {string|'all'} setId sada (nebo 'all' = všechny sady aktivní metody)
 */
export function openSetStats(setId) {
  const sets = setId === 'all' ? algSets.list().filter((x) => algs.inSet(x.id).length) : [algSets.get(setId)];
  const close = el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít', textContent: '✕' });
  const title = setId === 'all' ? `Statistika sad – ${methods.get(methods.active()).name}` : `Statistika sady „${sets[0].name}“`;
  const body = el('div', { className: 'ss-body' });
  const dlg = el('dialog', { className: 'help-dialog ss-dialog' },
    el('div', { className: 'gen-head' }, el('h2', { textContent: title }), close),
    el('p', { className: 'hint', textContent: 'Šance = jak často případ padne. Počítá se, v kolika podobách případ přijde (natočený o U před a po algoritmu), vůči ostatním případům sady – pro úplnou sadu je přesná (OLL 1/54, PLL 1/18…), pro neúplnou je to podíl mezi případy, které sada má. U sad z generátoru je přesná z výčtu stavů.' }),
    body);
  body.replaceChildren(...(sets.length ? sets.map((x) => section(sets.length > 1 ? x.name : '', algs.inSet(x.id))) : [el('p', { className: 'hint', textContent: 'Sada je prázdná.' })]));
  if (sets.length && !algs.inSet(sets[0].id).length && sets.length === 1) body.replaceChildren(el('p', { className: 'hint', textContent: 'Sada je prázdná.' }));
  document.body.append(dlg);
  const done = () => { dlg.close(); dlg.remove(); };
  close.onclick = done;
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(); });
  dlg.showModal();
  return dlg;
}
