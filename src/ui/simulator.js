// Simulátor metody (okno z průvodce metodou): náhodná zamíchání se složí krok po
// kroku podle kroků metody (dílky hotové po kroku, viz parts.js). Krok řeší algoritmus
// z tvé sady kroku, když nějaký pasuje, jinak hledání stejné jako v Labu. Výsledek:
// průměrné tahy a náročnost celé metody i kroků, co nejvíc zdržuje, jak dobře pokrývá
// tvoje sada případy, ukázkové složení a porovnání s dřívějšími simulacemi metod.

import { el, storage } from './dom.js';
import { icon } from './icons.js';
import { methods, guides, algs } from './store.js';
import { stepParts, partsBefore, describeParts, mergeParts, frameMap, validFrame, DEFAULT_FRAME } from './parts.js';
import { SearchClient } from '../search/client.js';
import { simulate, summarize, pickFromSet } from '../sim/simulate.js';
import { holdOf, holdFromFaces } from '../core/hold.js';
import { MOVESET_PRESETS } from '../core/moveset.js';
import { solved, toFacelets } from '../core/cube.js';
import { solve as twoPhase } from '../timer/twophase.js';
import { getPuzzle } from '../puzzles/index.js';
import { scoreFor } from '../ergonomics/puzzles.js';
import { buildTriggers } from '../ergonomics/triggers.js';
import { styleMetrics, rankResults } from '../ergonomics/style.js';

const OPTS = 'ergocube.sim.options';
const HISTORY = 'ergocube.sim.history';
const HISTORY_MAX = 30;
const CENTERS = { U: 'solved', D: 'solved', F: 'solved', B: 'solved', R: 'solved', L: 'solved' };
// sady tahů kroku: předvolby Labu + pár typických pro metody
const MOVES = {
  ...Object.fromEntries(Object.entries(MOVESET_PRESETS).map(([id, p]) => [id, { label: p.label, bases: p.bases }])),
  facesM: { label: 'Vnější + M', bases: ['R', 'L', 'U', 'D', 'F', 'B', 'M'] },
  RrUM: { label: '<R, r, U, M>', bases: ['R', 'r', 'U', 'M'] },
};
const COUNTS = [5, 10, 25, 50, 100];
const P = getPuzzle('333');
const invertMove = (m) => (m.endsWith("'") ? m.slice(0, -1) : m.endsWith('2') ? m : `${m}'`);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '–');

/** Kroky metody, které jde simulovat (mají vybrané dílky), s cílem po kroku. */
function plan(guide) {
  const out = [];
  let done = {};
  guide.steps.forEach((st, i) => {
    const parts = stepParts(st);
    if (!Object.keys(parts).length) return;
    done = mergeParts(partsBefore(guide.steps, st.id), parts);
    out.push({ st, index: i, parts, goal: { ...done, ...CENTERS } });
  });
  return out;
}

/**
 * @param {{ergo: object, lambda: number}} lab hodnocení z Labu (Tahy a váhy)
 */
export function openSimulator(lab) {
  const method = methods.active();
  const guide = guides.get(method);
  const steps = plan(guide);
  const saved = storage.get(OPTS) ?? {};
  const frame = validFrame(guide.frame) ? guide.frame : DEFAULT_FRAME;
  const map = frameMap(frame);
  const hold = holdOf(holdFromFaces(map.U, map.F));
  const config = { ...lab.ergo, triggers: buildTriggers() };

  const close = Object.assign(el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít' }), { innerHTML: icon('close', { size: 20 }) });
  const body = el('div', { className: 'sim-body' });
  const dlg = el('dialog', { className: 'help-dialog sim-dialog' },
    el('div', { className: 'sim-head' }, el('div', {}, el('small', { className: 'hint', textContent: 'Simulátor metody' }), el('h2', { textContent: methods.get(method).name })), close),
    body);
  document.body.append(dlg);
  const client = new SearchClient();
  let running = false;
  close.onclick = () => dlg.close();
  dlg.addEventListener('close', () => { running = false; client.cancel(); dlg.remove(); });

  if (!steps.length) {
    body.append(el('div', { className: 'guide-empty' },
      el('p', { textContent: 'Simulátor potřebuje kroky metody s vybranými dílky.' }),
      el('p', { className: 'hint', textContent: 'V průvodci metodou klepni na „Upravit“ a u každého kroku vyber, které dílky jsou po něm hotové (předvolby jako kříž, F2L, bloky…).' })));
    dlg.showModal();
    return dlg;
  }

  // nastavení kroků: sada tahů a jestli použít algoritmy ze sady kroku
  const stepOpts = saved.steps?.[method] ?? {};
  const rows = steps.map((s, k) => {
    const prev = stepOpts[s.st.id] ?? {};
    const moves = el('select', { className: 'small-select', ariaLabel: `Tahy pro krok ${s.index + 1}` },
      ...Object.entries(MOVES).map(([id, m]) => el('option', { value: id, textContent: m.label })));
    moves.value = prev.moves && MOVES[prev.moves] ? prev.moves : 'faces';
    const setAlgs = s.st.set ? algs.list().filter((a) => a.set === s.st.set) : [];
    const useSet = Object.assign(el('input', { type: 'checkbox', disabled: !setAlgs.length }), { checked: setAlgs.length > 0 && prev.useSet !== false });
    const row = el('div', { className: 'sim-step' },
      el('div', { className: 'sim-step-head' }, el('span', { className: 'guide-n', textContent: String(s.index + 1) }),
        el('div', { className: 'sim-step-title' }, el('b', { textContent: s.st.title || `Krok ${s.index + 1}` }), el('small', { textContent: describeParts(s.parts) }))),
      el('div', { className: 'sim-step-opts' }, moves,
        setAlgs.length
          ? el('label', { className: 'check-row', title: 'Případy, které vyřeší algoritmus ze sady kroku, se řeší jím (jako při skutečném složení)' }, useSet, `Moje algoritmy (${setAlgs.length})`)
          : el('small', { className: 'hint', title: 'Sadu kroku vybereš v průvodci (Upravit)', textContent: 'bez sady – řeší hledání' })));
    return { ...s, k, moves, useSet, setAlgs, row };
  });

  const count = el('select', { ariaLabel: 'Počet zamíchání' }, ...COUNTS.map((n) => el('option', { value: String(n), textContent: `${n} zamíchání` })));
  count.value = String(COUNTS.includes(saved.count) ? saved.count : 10);
  const time = el('input', { type: 'number', min: '1', max: '120', value: String(saved.time ?? 3), ariaLabel: 'Čas hledání na krok (s)' });
  const go = el('button', { type: 'button', className: 'primary', textContent: 'Spustit simulaci' });
  const stop = el('button', { type: 'button', className: 'secondary', textContent: 'Zastavit', hidden: true });
  const status = el('p', { className: 'status' });
  const bar = el('div', { className: 'gen-bar' });
  const track = el('div', { className: 'gen-track sim-track', hidden: true }, bar);
  const results = el('div', { className: 'sim-results' });
  const history = el('div', { className: 'sim-history' });

  body.append(
    el('p', { className: 'hint', textContent: 'Náhodná zamíchání se složí krok po kroku podle tvé metody. Krok vyřeší algoritmus z tvé sady, když na případ nějaký máš, jinak ho najde hledání (stejné jako v Labu, podle tvých vah ergonomie). Tahy se počítají včetně natočení vrstvy.' }),
    el('div', { className: 'sim-steps' }, ...rows.map((r) => r.row)),
    el('div', { className: 'grid-fields' },
      el('label', { className: 'field' }, 'Zamíchání', count),
      el('label', { className: 'field', title: 'Jak dlouho hledat řešení kroku, který nevyřeší tvoje sada. Delší = blíž nejlepšímu možnému.' }, 'Hledání na krok (s)', time)),
    el('div', { className: 'row-btns' }, go, stop), track, status, results, history);
  renderHistory();

  const remember = () => {
    const all = storage.get(OPTS) ?? {};
    all.count = Number(count.value);
    all.time = Number(time.value);
    all.steps = { ...(all.steps ?? {}), [method]: Object.fromEntries(rows.map((r) => [r.st.id, { moves: r.moves.value, useSet: r.useSet.checked }])) };
    storage.set(OPTS, all);
  };

  /** Algoritmy sady kroku: zápis modelu, jak se dělají, náročnost a medián času z trenažéru. */
  const candidatesOf = (r) => r.setAlgs.flatMap((a) => {
    try {
      const display = a.alg.replace(/[()]/g, ' ').trim().split(/\s+/).join(' ');
      const model = holdOf(a.task?.hold ?? '').toModelString(display);
      const recent = (a.times ?? []).slice(-5).map((x) => x.t);
      return [{ model, display, name: a.name, score: scoreFor(P, display, config).total, time: recent.length >= 3 ? median(recent) : undefined }];
    } catch { return []; }
  });
  const aufs = ['', 'U', "U'", 'U2'].map((d) => ({ display: d, model: d ? hold.toModelString(d) : '' }));

  /** Hledání kroku (workery jako v Labu); nejlepší podle rychlosti. */
  const searchStep = (r, state, limit, library) => new Promise((resolve) => {
    const held = MOVES[r.moves.value].bases.flatMap((base) => [1, -1, 2].map((amount) => ({ base, amount })));
    const moves = held.map((m) => hold.toModel(P.moveToString(m))[0]);
    const found = [];
    stopSearch = () => resolve(null);
    client.start({
      puzzle: '333', start: state, target: solved(), constraints: r.goal, moves, held, auf: null, ergonomics: lab.ergo,
      options: { lambda: lab.lambda, maxLength: 20, extraDepth: 1, maxResults: 500, timeLimit: limit, library },
    }, {
      onSolutions: (items) => found.push(...items),
      onDone: () => {
        if (!found.length) { resolve(null); return; }
        const ranked = rankResults(found.map((it) => ({ it, m: styleMetrics(it.score, true) })), 'speed');
        const best = ranked[0].it;
        const model = [best.pre, best.alg, best.post].filter(Boolean).join(' ');
        resolve({ model, display: hold.toHeldString(model), score: ranked[0].m.total, source: 'search' });
      },
      onError: () => resolve(null),
    });
  });
  let stopSearch = () => {};

  go.onclick = async () => {
    remember();
    running = true;
    go.hidden = true; stop.hidden = false; track.hidden = false;
    for (const r of rows) { r.moves.disabled = true; r.useSet.disabled = true; }
    results.replaceChildren();
    const n = Number(count.value);
    const limit = Math.max(1, Math.min(120, Number(time.value) || 3)) * 1000;
    const cands = rows.map((r) => (r.useSet.checked ? candidatesOf(r) : []));
    const t0 = performance.now();
    const totalSteps = n * rows.length;
    const { solves } = await simulate({
      count: n,
      goals: rows.map((r) => r.goal),
      stopped: () => !running,
      onProgress: ({ solve, step }) => {
        const done = solve * rows.length + step;
        bar.style.width = `${Math.min(100, (done / totalSteps) * 100)}%`;
        const el2 = (performance.now() - t0) / 1000;
        const eta = done ? (el2 / done) * (totalSteps - done) : NaN;
        status.textContent = solve < n ? `Složení ${solve + 1} z ${n} · krok ${Math.min(step + 1, rows.length)} z ${rows.length} · ${Math.round(el2)} s${Number.isFinite(eta) ? ` · zbývá asi ${Math.round(eta)} s` : ''}` : 'Počítám souhrn…';
      },
      solveStep: async (i, state, test) => {
        const fromSet = cands[i].length ? pickFromSet(state, test, cands[i], aufs) : null;
        if (fromSet) return fromSet;
        return searchStep(rows[i], state, limit, cands[i].map((c) => c.model));
      },
    });
    running = false;
    client.cancel();
    go.hidden = false; stop.hidden = true; track.hidden = true;
    for (const r of rows) { r.moves.disabled = false; r.useSet.disabled = !r.setAlgs.length; }
    const sum = summarize(solves, rows.length);
    status.textContent = sum.count ? `Hotovo: ${sum.count} složení${sum.failed ? ` (${sum.failed} se nepodařilo dořešit – zkus delší hledání nebo víc tahů)` : ''} · ${Math.round((performance.now() - t0) / 1000)} s` : 'Nic nedoběhlo';
    if (!sum.count) return;
    renderSummary(sum, solves);
    addHistory(sum);
    renderHistory();
  };
  stop.onclick = () => { running = false; client.cancel(); stopSearch(); };

  function renderSummary(sum, solves) {
    const maxMoves = Math.max(...sum.steps.map((s) => s.moves), 1);
    const stepRows = rows.map((r, i) => {
      const s = sum.steps[i];
      const worst = i === sum.worst;
      const cover = r.useSet.checked && r.setAlgs.length && s.needed
        ? `${Math.round((s.fromSet / s.needed) * 100)} % případů tvou sadou${s.searched ? ` (${s.searched}× chyběl algoritmus)` : ''}` : null;
      return el('div', { className: `sim-res-row${worst ? ' worst' : ''}` },
        el('div', { className: 'sim-res-label' }, el('b', { textContent: r.st.title || `Krok ${r.index + 1}` }),
          worst ? el('span', { className: 'sim-tag', textContent: 'nejvíc tahů' }) : null),
        el('div', { className: 'sim-res-bar', role: 'img', ariaLabel: `${fmt(s.moves)} tahů v průměru` }, el('i', { style: `width: ${(s.moves / maxMoves) * 100}%` })),
        el('div', { className: 'sim-res-nums' },
          el('b', { textContent: `${fmt(s.moves)} tahů` }),
          el('small', { textContent: [`náročnost ${fmt(s.score)}`, `${Math.round(s.share * 100)} % celku`, s.skipped ? `${Math.round(s.skipped * 100)} % přeskočeno` : null, cover].filter(Boolean).join(' · ') })));
    });
    // ukázka: složení nejblíž průměru
    const totals = solves.filter((s) => s.ok).map((s) => ({ s, t: s.steps.reduce((a, x) => a + x.length, 0) }));
    const example = totals.sort((a, b) => Math.abs(a.t - sum.moves) - Math.abs(b.t - sum.moves))[0]?.s;
    let scramble = '';
    try { scramble = (twoPhase(toFacelets(example.start), { timeLimit: 1000 }) ?? '').split(' ').filter(Boolean).reverse().map(invertMove).join(' '); } catch { /* bez zamíchání */ }
    results.replaceChildren(
      el('div', { className: 'sim-hero' },
        el('div', {}, el('span', { className: 'tile-label', textContent: 'Průměr na složení' }), el('b', { textContent: `${fmt(sum.moves)} tahů` }),
          el('small', { textContent: `± ${fmt(sum.movesSd)} · od ${sum.min} do ${sum.max} · náročnost ${fmt(sum.score)}` }))),
      el('div', { className: 'sim-res' }, ...stepRows),
      sum.hist.length > 1 ? el('div', { className: 'sim-hist', role: 'img', ariaLabel: 'Rozložení počtu tahů na složení' },
        ...sum.hist.map((h) => el('div', { className: 'sim-hist-col', title: `${h.from}–${h.to} tahů: ${h.n}×` },
          el('i', { style: `height: ${(h.n / Math.max(...sum.hist.map((x) => x.n))) * 100}%` }), el('small', { textContent: String(h.from) })))) : null,
      example ? el('details', { className: 'sim-example' }, el('summary', { textContent: 'Ukázkové složení (nejblíž průměru)' }),
        scramble ? el('p', {}, el('small', { textContent: 'Zamíchání' }), el('code', { textContent: scramble })) : null,
        el('ol', {}, ...example.steps.map((x, i) => el('li', {},
          el('b', { textContent: `${rows[i].st.title || `Krok ${rows[i].index + 1}`}: ` }),
          x.source === 'skip' ? el('em', { textContent: 'přeskočeno' }) : el('code', { textContent: x.display }),
          el('small', { textContent: x.source === 'set' ? ` · ${x.name ?? 'ze sady'} · ${x.length} tahů` : x.source === 'skip' ? '' : ` · ${x.length} tahů` }))))) : null);
  }

  function addHistory(sum) {
    const list = storage.get(HISTORY) ?? [];
    list.unshift({ method, name: methods.get(method).name, at: Date.now(), n: sum.count, moves: sum.moves, score: sum.score,
      steps: rows.map((r, i) => ({ title: r.st.title || `Krok ${r.index + 1}`, moves: sum.steps[i].moves })) });
    storage.set(HISTORY, list.slice(0, HISTORY_MAX));
  }

  /** Porovnání: poslední simulace každé metody. */
  function renderHistory() {
    const byMethod = new Map();
    for (const h of storage.get(HISTORY) ?? []) if (!byMethod.has(h.method)) byMethod.set(h.method, h);
    const rowsH = [...byMethod.values()].sort((a, b) => a.moves - b.moves);
    if (!rowsH.length) { history.replaceChildren(); return; }
    history.replaceChildren(el('h3', { textContent: 'Porovnání metod' }),
      el('table', { className: 'compare' },
        el('thead', {}, el('tr', {}, el('th', { textContent: 'Metoda' }), el('th', { textContent: 'Tahů' }), el('th', { textContent: 'Náročnost' }), el('th', { textContent: 'Složení' }))),
        el('tbody', {}, ...rowsH.map((h, i) => el('tr', {},
          el('td', { textContent: `${h.name}${h.method === method ? ' (tahle)' : ''}` }),
          el('td', { className: i === 0 && rowsH.length > 1 ? 'win' : '', textContent: fmt(h.moves) }),
          el('td', { textContent: fmt(h.score) }),
          el('td', { textContent: String(h.n) }))))),
      el('p', { className: 'hint', textContent: 'Poslední simulace každé metody. Srovnání je férové jen při podobném nastavení (počet zamíchání, čas hledání, sady tahů).' }));
  }

  dlg.showModal();
  return dlg;
}
