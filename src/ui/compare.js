// Porovnání dvojic (Tahy a váhy → Doladit podle mých rukou): dva algoritmy pro stejný
// případ, zatočíš si oba a vybereš, který se ti točí líp. Dvojice vybírá
// ergonomics/compare.js (pokrytí druhů tahů, nejistota hodnocení), z odpovědí spočítá
// váhy learnPreferences (Bradley–Terry). Odpovědi se ukládají a sčítají přes sezení.

import { el, storage } from './dom.js';
import { CORPUS } from '../ergonomics/corpus.js';
import { pairsOf, nextPair, keyOf } from '../ergonomics/compare.js';
import { learnPreferences, featureLabel } from '../ergonomics/calibrate.js';
import { recordPreference, preferencesOf } from './store.js';

const KIND = { PLL: 'PLL', OLL: 'OLL', F2L: 'F2L – poslední slot' };
const COUNT = 'ergocube.compare.count';

export const compareCount = (v) => {
  if (v !== undefined) storage.set(COUNT, v);
  return storage.get(COUNT) ?? 20;
};

/** Čím se dvojice liší (pro „Zkouší:“): nejvýraznější druhy tahů a míst. */
function testsOf(pair) {
  return [...pair.x].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4).map(([k]) => featureLabel(k)).join(', ');
}

/**
 * @param {object} p
 * @param {object} p.puzzle hlavolam (3×3)
 * @param {() => object} p.config dnešní hodnocení (Tahy a váhy)
 * @param {number} p.count kolik porovnání
 * @param {(res: object) => void} p.onApply nové váhy (výsledek learnPreferences)
 */
export function openCompare({ puzzle, config, count, onApply }) {
  const pairs = pairsOf(puzzle, config(), CORPUS);
  const asked = new Set();
  let done = 0, skipped = 0;
  const progress = el('div', { className: 'gen-track' }, el('div', { className: 'gen-bar' }));
  const head = el('p', { className: 'cmp-progress' });
  const body = el('div', { className: 'cmp-body' });
  const close = el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít', textContent: '✕' });
  const dlg = el('dialog', { className: 'help-dialog cmp-dialog' },
    el('div', { className: 'gen-head' }, el('h2', { textContent: 'Který se ti točí líp?' }), close),
    el('p', { className: 'hint', textContent: 'Oba algoritmy řeší stejný případ. Zatoč si je na kostce (na stavu kostky nezáleží, jde o to, jak se točí v rukou), klidně víckrát, a vyber pohodlnější. Neznáš nebo nejde? Přeskoč.' }),
    head, progress, body);
  document.body.append(dlg);
  close.onclick = () => finish();
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(); });

  const alg = (text) => el('code', { className: 'cmp-alg', textContent: text });

  function show() {
    head.textContent = `Porovnání ${Math.min(done + 1, count)} z ${count}${skipped ? ` · přeskočeno ${skipped}` : ''}`;
    progress.firstChild.style.width = `${(done / count) * 100}%`;
    const p = done < count ? nextPair(puzzle, config(), pairs, preferencesOf(puzzle.id), asked) : null;
    if (!p) { finish(); return; }
    asked.add(keyOf(p.a, p.b));
    const answer = (better, worse, tie = false) => {
      recordPreference(puzzle.id, better, worse, { tie, source: 'compare' });
      done++;
      show();
    };
    const card = (letter, text, other) => el('button', { type: 'button', className: 'cmp-card', onclick: () => answer(text, other) },
      el('span', { className: 'cmp-letter', textContent: letter }), alg(text),
      el('small', { textContent: `${text.split(' ').length} tahů · ${letter} je pohodlnější` }));
    body.replaceChildren(
      el('p', { className: 'cmp-case', textContent: `${KIND[p.kind] ?? p.kind} · ${p.case}` }),
      el('div', { className: 'cmp-pair' }, card('A', p.a, p.b), card('B', p.b, p.a)),
      el('p', { className: 'hint cmp-tests', textContent: `Zkouší: ${testsOf(p)}` }),
      el('div', { className: 'row-btns cmp-actions' },
        el('button', { type: 'button', className: 'secondary small', textContent: 'Točí se stejně', onclick: () => answer(p.a, p.b, true) }),
        el('button', { type: 'button', className: 'secondary small', textContent: 'Přeskočit', onclick: () => { skipped++; show(); } }),
        done >= 3 ? el('button', { type: 'button', className: 'secondary small', textContent: 'Hotovo – spočítat váhy', onclick: () => finish() }) : null));
  }

  function finish() {
    if (!dlg.open) return;
    const all = preferencesOf(puzzle.id);
    if (!done && !all.length) { dlg.close(); dlg.remove(); return; }
    const res = learnPreferences(puzzle, config(), all);
    progress.firstChild.style.width = '100%';
    head.textContent = `Porovnáno ${done}${skipped ? ` · přeskočeno ${skipped}` : ''} · celkem uložených odpovědí ${all.length}`;
    const ok = el('button', { type: 'button', className: 'primary small', textContent: 'Zavřít' });
    ok.onclick = () => { dlg.close(); dlg.remove(); };
    if (!res.ok) {
      body.replaceChildren(el('p', { textContent: res.reason }), el('div', { className: 'row-btns' }, ok));
      return;
    }
    onApply(res);
    body.replaceChildren(
      el('p', { className: 'cmp-result', textContent: `Hodnocení teď souhlasí s ${res.agree} z ${res.decided} tvých voleb (předtím s ${res.before}).` }),
      res.changes.length
        ? el('ul', { className: 'cmp-changes' }, ...res.changes.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
          .map((c) => el('li', { textContent: `${featureLabel(c.key)}: ${c.from} → ${c.to} ${c.to > c.from ? '(nepohodlnější)' : '(pohodlnější)'}` })))
        : el('p', { className: 'hint', textContent: 'Váhy sedí, nic se nezměnilo.' }),
      el('p', { className: 'hint', textContent: 'Nové váhy se hned použijí v hledání. Další porovnání odhad zpřesní – odpovědi se sčítají.' }),
      el('div', { className: 'row-btns' }, ok));
  }

  show();
  dlg.showModal();
  return dlg;
}
