// Trenažér → Knihovna: algoritmy z vestavěné sbírky (oblíbené algoritmy skladačů a jejich
// alternativy) nebo vložené jako text z veřejných databází (SpeedCubeDB, AlgDb, cubing.net…)
// roztříděné podle případů a seřazené podle tvých vah (Lab → Tahy a váhy). Nejlepší pro tebe
// je nahoře a předvybraný; vybrané se uloží do sady v trenažéru i s případem.

import { el, storage } from './dom.js';
import { algs, algSets } from './store.js';
import { labModel } from './models.js';
import { CORPUS } from '../ergonomics/corpus.js';
import { groupByCase, parseAlgText, constraintsFor, withoutRotations } from '../ergonomics/algdb.js';
import { DEFAULT_CONFIG, DEFAULT_MOVE_WEIGHTS } from '../ergonomics/weights.js';
import { buildTriggers } from '../ergonomics/triggers.js';
import { toast } from './share.js';

/** Tvoje váhy z Labu (Tahy a váhy). */
function userErgo() {
  const e = storage.get('ergocube.ergo') ?? {};
  return { ...DEFAULT_CONFIG, ...e, moveWeights: { ...DEFAULT_MOVE_WEIGHTS, ...(e.moveWeights ?? {}) }, triggers: buildTriggers() };
}

const fmt = (v) => Number(v).toFixed(1).replace('.', ',');

/** @param {{onSaved?: (setId) => void}} [opts] */
export function openLibrary({ onSaved } = {}) {
  const config = userErgo();
  const builtin = CORPUS.flatMap((c) => [{ name: c.name, alg: c.ref }, ...c.alts.map((alg) => ({ name: c.name, alg }))]);
  const text = el('textarea', { className: 'lib-text', rows: 6, placeholder: "Vlož algoritmy – každý na řádek, třeba „T-perm: R U R' U' R' F R2 U' R' U' R U R' F'“. Funguje i zkopírovaná tabulka z SpeedCubeDB nebo AlgDb." });
  const srcBuiltin = el('button', { type: 'button', className: 'secondary small on', textContent: 'Vestavěná sbírka' });
  const srcText = el('button', { type: 'button', className: 'secondary small', textContent: 'Vložit text' });
  const sortBtn = el('button', { type: 'button', className: 'primary small', textContent: 'Seřadit podle mých vah', hidden: true });
  const list = el('div', { className: 'lib-list' });
  const target = el('select', { ariaLabel: 'Uložit do sady' });
  const save = el('button', { type: 'button', className: 'primary small', textContent: 'Uložit vybrané' });
  const bar = el('div', { className: 'row-btns lib-save' }, target, save);
  const close = el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít', textContent: '✕' });
  const dlg = el('dialog', { className: 'help-dialog lib-dialog' },
    el('div', { className: 'gen-head' }, el('h2', { textContent: 'Knihovna algoritmů' }), close),
    el('p', { className: 'hint', textContent: 'Algoritmy roztříděné podle případu (PLL, OLL, F2L…) a seřazené podle tvých vah z Labu (Tahy a váhy) – nahoře je ten, který ti podle hodnocení půjde nejrychleji. Hodnota = nepohodlnost + čas tahů, nižší je lepší.' }),
    el('div', { className: 'row-btns' }, srcBuiltin, srcText), text, sortBtn, list, bar);
  document.body.append(dlg);
  text.hidden = true;
  const chosen = new Set();
  let groups = [];

  function fillTargets() {
    const NEW = '__new__';
    target.replaceChildren(el('option', { value: NEW, textContent: 'Nová sada „Knihovna“' }), ...algSets.list().map((s) => el('option', { value: s.id, textContent: s.name })));
  }
  function render() {
    list.replaceChildren(...groups.map((g) => el('section', { className: 'lib-case' },
      el('b', { textContent: `${g.kind}${g.name ? ` · ${g.name}` : ''}` }),
      el('ol', { className: 'lib-algs' }, ...g.algs.map((a, i) => {
        const box = Object.assign(el('input', { type: 'checkbox' }), { checked: chosen.has(a.alg) });
        box.onchange = () => { if (box.checked) chosen.add(a.alg); else chosen.delete(a.alg); syncSave(); };
        return el('li', { className: i === 0 ? 'best' : '' },
          el('label', {}, box, el('code', { textContent: a.alg })),
          el('small', { textContent: `${a.moves} tahů · ${fmt(a.value)}${i === 0 ? ' · nejlepší pro tebe' : ''}` }));
      })))));
    if (!groups.length) list.replaceChildren(el('p', { className: 'hint', textContent: 'Žádné algoritmy k roztřídění.' }));
    syncSave();
  }
  const syncSave = () => { bar.hidden = !chosen.size; save.textContent = `Uložit vybrané (${chosen.size})`; };
  function load(items) {
    groups = groupByCase(items, config);
    chosen.clear();
    for (const g of groups) chosen.add(g.algs[0].alg);
    render();
  }
  srcBuiltin.onclick = () => { srcBuiltin.classList.add('on'); srcText.classList.remove('on'); text.hidden = true; sortBtn.hidden = true; load(builtin); };
  srcText.onclick = () => { srcText.classList.add('on'); srcBuiltin.classList.remove('on'); text.hidden = false; sortBtn.hidden = false; groups = []; chosen.clear(); render(); text.focus(); };
  sortBtn.onclick = () => {
    const items = parseAlgText(text.value);
    if (!items.length) { toast('V textu nejsou žádné algoritmy (tahy R U F…)'); return; }
    load(items);
    toast(`${items.length} algoritmů ve ${groups.length} případech`);
  };
  save.onclick = () => {
    const m = labModel('333');
    const home = m.home(m.pieceNames);
    const set = target.value === '__new__' ? algSets.add('Knihovna') : target.value;
    let n = 0;
    for (const g of groups) for (const a of g.algs) {
      if (!chosen.has(a.alg)) continue;
      try {
        const core = withoutRotations(a.alg);
        algs.add({ alg: a.alg, name: a.name ?? `${g.kind} ${n + 1}`, set, task: { puzzle: '333', constraints: constraintsFor(g.kind), colorsA: m.applyMoves(home, m.invertAlg(core)), colorsB: home } });
        n++;
      } catch { /* nejde uložit */ }
    }
    toast(n === chosen.size ? `Uloženo ${n} algoritmů do trenažéru` : `Uloženo ${n} z ${chosen.size} algoritmů (zbytek nejde převést)`);
    dlg.close();
    onSaved?.(set);
  };
  close.onclick = () => dlg.close();
  dlg.addEventListener('close', () => dlg.remove());
  fillTargets();
  load(builtin);
  dlg.showModal();
  return dlg;
}
