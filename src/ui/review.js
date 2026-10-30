// Trenažér → Ohodnotit: hodnocení vlastních algoritmů (ergonomics/review.js). Algoritmy jde
// napsat / vložit (každý na řádek, „název: tahy“), nebo vzít z vlastní sady v trenažéru.
// U každého známka, odhad času při tvém tempu, pořadí mezi známými algoritmy pro stejný
// případ, slabá místa v prstokladu (zvýrazněná v zápisu) a rychlejší známé alternativy.

import { el, storage } from './dom.js';
import { algs, algSets, defaultSetId, recordPreference, preferencesOf } from './store.js';
import { labModel } from './models.js';
import { parseAlgText, constraintsFor, withoutRotations } from '../ergonomics/algdb.js';
import { reviewAlg, formatSeconds, normalizeAlg } from '../ergonomics/review.js';
import { userErgo } from './algdb.js';
import { profile } from './profile.js';
import { profileLevel } from '../sim/profile.js';
import { LEVELS } from '../sim/simulate.js';
import { toast } from './share.js';

const KEY = 'ergocube.review';
const fmt = (v, d = 1) => Number(v).toFixed(d).replace('.', ',');

/** Tempa k výběru: můj profil (když je vyplněný průměr) a předvolby úrovní. */
function tempos() {
  const me = profileLevel(profile());
  return [
    ...(me ? [{ id: 'me', label: `Moje tempo (profil) – ${fmt(me.tps.alg)} tahů/s`, tps: me.tps.alg }] : []),
    { id: 'club', label: `Pokročilý (~20 s) – ${fmt(LEVELS.club.tps.alg)} tahů/s`, tps: LEVELS.club.tps.alg },
    { id: 'fast', label: `Rychlý (~10 s) – ${fmt(LEVELS.fast.tps.alg)} tahů/s`, tps: LEVELS.fast.tps.alg },
    { id: 'pro', label: `Světová špička – ${fmt(LEVELS.pro.tps.alg)} tahů/s`, tps: LEVELS.pro.tps.alg },
  ];
}

/** Zadání případu pro Lab / trenažér z algoritmu 3×3 (stav před algoritmem → složeno). */
function taskOf(alg, kind) {
  const m = labModel('333');
  const home = m.home(m.pieceNames);
  return { puzzle: '333', constraints: constraintsFor(kind), colorsA: m.applyMoves(home, m.invertAlg(withoutRotations(alg))), colorsB: home };
}

/** Naměřené časy z trenažéru pro stejný zápis. */
const timesOf = (alg) => algs.list().filter((a) => (a.task?.puzzle ?? '333') === '333' && normalizeAlg(a.alg) === alg).flatMap((a) => (a.times ?? []).map((t) => t.t));

/** @param {{openLab?: (task: object) => void, onSaved?: (set: string) => void}} [opts] */
export function openReview({ openLab, onSaved } = {}) {
  const saved = storage.get(KEY) ?? {};
  const close = el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít', textContent: '✕' });
  const srcText = el('button', { type: 'button', textContent: 'Napsat / vložit' });
  const srcSet = el('button', { type: 'button', textContent: 'Z mých sad' });
  const text = el('textarea', { className: 'lib-text rv-text', rows: 4, value: saved.text ?? '', spellcheck: false, ariaLabel: 'Algoritmy k ohodnocení',
    placeholder: "Každý algoritmus na řádek, název nepovinný:\nMůj T-perm: R U R' U' R' F R2 U' R' U' R U R' F'\nOLL 27: R U R' U R U2 R'" });
  const setSel = el('select', { ariaLabel: 'Sada' }, ...algSets.list().map((s) => el('option', { value: s.id, textContent: `${s.name} (${algs.inSet(s.id).length})` })));
  const tempoSel = el('select', { ariaLabel: 'Tempo' });
  const list = tempos();
  tempoSel.replaceChildren(...list.map((t) => el('option', { value: t.id, textContent: t.label })));
  tempoSel.value = list.some((t) => t.id === saved.tempo) ? saved.tempo : list[0].id;
  const sortSel = el('select', { ariaLabel: 'Pořadí' }, el('option', { value: 'input', textContent: 'Jak jsou zapsané' }), el('option', { value: 'worst', textContent: 'Nejhorší nahoře' }), el('option', { value: 'best', textContent: 'Nejlepší nahoře' }));
  sortSel.value = saved.sort ?? 'input';
  const go = el('button', { type: 'button', className: 'primary', textContent: 'Ohodnotit' });
  const out = el('div', { className: 'rv-list' });
  const dlg = el('dialog', { className: 'help-dialog lib-dialog rv-dialog' },
    el('div', { className: 'gen-head' }, el('h2', { textContent: 'Ohodnotit moje algoritmy' }), close),
    el('p', { className: 'hint', textContent: 'Aplikace pozná, jaký případ algoritmus řeší, porovná ho s oblíbenými algoritmy skladačů pro stejný případ podle tvých vah (Lab → Tahy a váhy) a ukáže slabá místa v prstokladu. Známka 100 = stejně dobrý nebo lepší než nejlepší známý.' }),
    el('div', { className: 'segmented rv-src', role: 'group', ariaLabel: 'Odkud' }, srcText, srcSet),
    text, setSel,
    el('div', { className: 'row-btns rv-opts' }, el('label', { className: 'field' }, el('span', { textContent: 'Odhad času pro tempo' }), tempoSel), el('label', { className: 'field' }, el('span', { textContent: 'Pořadí' }), sortSel)),
    el('div', { className: 'row-btns' }, go), out);
  document.body.append(dlg);

  let source = saved.source === 'set' && algSets.list().length ? 'set' : 'text';
  if (saved.set && algSets.list().some((s) => s.id === saved.set)) setSel.value = saved.set;
  const remember = () => storage.set(KEY, { text: text.value, tempo: tempoSel.value, sort: sortSel.value, source, set: setSel.value });
  const syncSource = () => {
    srcText.classList.toggle('active', source === 'text'); srcSet.classList.toggle('active', source === 'set');
    text.hidden = source !== 'text'; setSel.hidden = source !== 'set';
  };
  srcText.onclick = () => { source = 'text'; syncSource(); remember(); text.focus(); };
  srcSet.onclick = () => { source = 'set'; syncSource(); remember(); run(); };
  syncSource();

  function items() {
    if (source === 'set') return algs.inSet(setSel.value).filter((a) => (a.task?.puzzle ?? '333') === '333').map((a) => ({ name: a.name, alg: a.alg, id: a.id }));
    return parseAlgText(text.value);
  }

  function run() {
    remember();
    const its = items();
    if (!its.length) {
      out.replaceChildren(el('p', { className: 'hint', textContent: source === 'set' ? 'V sadě nejsou žádné algoritmy 3×3.' : 'Napiš nebo vlož aspoň jeden algoritmus (tahy R U F… – i se závorkami, Rw, M, x y z).' }));
      return;
    }
    const config = userErgo();
    const tps = list.find((t) => t.id === tempoSel.value)?.tps ?? 6;
    const rows = its.map((it, i) => ({ it, i, r: reviewAlg(it.alg, { config, tps, times: timesOf(normalizeAlg(it.alg)) }) }));
    const ok = rows.filter((x) => x.r.ok);
    if (sortSel.value !== 'input') ok.sort((a, b) => (sortSel.value === 'worst' ? a.r.grade - b.r.grade : b.r.grade - a.r.grade));
    const bad = rows.filter((x) => !x.r.ok);
    const avg = ok.length ? Math.round(ok.reduce((a, x) => a + x.r.grade, 0) / ok.length) : null;
    const weakest = ok.length > 1 ? ok.reduce((w, x) => (x.r.grade < w.r.grade ? x : w)) : null;
    out.replaceChildren(
      ok.length > 1 ? el('div', { className: 'rv-summary' },
        el('b', { textContent: `Průměrná známka ${avg} – ${ok.length} algoritmů` }),
        el('span', { textContent: [
          `výborné ${ok.filter((x) => x.r.grade >= 90).length}`,
          `k vylepšení ${ok.filter((x) => x.r.grade < 75).length}`,
          weakest ? `nejslabší: ${weakest.it.name ?? weakest.r.alg}` : null,
        ].filter(Boolean).join(' · ') })) : null,
      ...ok.map((x) => card(x.it, x.r, { config, tps })),
      ...bad.map((x) => el('article', { className: 'rv-card bad' }, el('code', { textContent: x.it.alg }), el('p', { className: 'hint', textContent: x.r.reason }))));
  }

  function card(it, r, { config, tps }) {
    const c = r.compare;
    const title = it.name ?? (c ? c.name : r.kind === 'jiné' ? 'Algoritmus' : r.kind);
    const sub = [r.kind === 'jiné' ? 'vlastní případ' : r.kind, c && it.name && it.name !== c.name ? c.name : null, c?.isPopular ? 'oblíbený algoritmus skladačů' : c?.isKnown ? 'známá alternativa' : null].filter(Boolean).join(' · ');
    const weakAt = new Map(r.weak.map((w) => [w.i, w]));
    const trig = new Set(r.score.triggers.flatMap((t) => Array.from({ length: t.length }, (_, k) => t.start + k)));
    const alg = el('p', { className: 'rv-alg' }, ...r.alg.split(' ').flatMap((m, i) => [
      el('span', { className: `${weakAt.has(i) ? 'weak' : ''}${trig.has(i) ? ' trig' : ''}`.trim(), textContent: m, title: weakAt.get(i)?.reasons.join(', ') ?? '' }), ' ']));
    const facts = [
      `${r.moves} tahů`,
      `odhad ${formatSeconds(r.time)} při ${fmt(tps)} tahů/s`,
      `nepohodlnost ${fmt(r.score.total)}`,
      r.measured ? `tvůj čas v trenažéru ${formatSeconds(r.measured.best)} nejlepší, ${formatSeconds(r.measured.mean)} průměr (${r.measured.count}×)` : null,
    ].filter(Boolean);
    const sections = [];
    if (c) {
      const rows = [...c.better.slice(0, 3), ...(c.popular && !c.better.some((o) => o.alg === c.popular.alg) ? [c.popular] : [])];
      const max = Math.max(r.value, ...rows.map((o) => o.value));
      const bar = (label, v, cls, extra) => el('li', { className: cls },
        el('div', { className: 'rv-bar' }, el('i', { style: `width:${Math.round((v / max) * 100)}%` })),
        el('code', { textContent: label }), extra ?? null);
      sections.push(el('div', { className: 'rv-sec' },
        el('h4', { textContent: c.rank === 1 ? `Nejlepší z ${c.of} známých algoritmů pro ${c.name}` : `${c.rank}. z ${c.of} známých algoritmů pro ${c.name}` }),
        el('ul', { className: 'rv-cmp' },
          bar(`${r.alg}  (tvůj)`, r.value, 'mine'),
          ...rows.map((o) => {
            const save = el('button', { type: 'button', className: 'secondary small', textContent: 'Do trenažéru' });
            save.onclick = () => saveAlg(o.alg, `${c.name}${o.popular ? '' : ' (alternativa)'}`, r.kind);
            return bar(o.alg, o.value, o.popular ? 'popular' : '', el('small', {}, `${o.moves} tahů${o.saving ? ` · o ${formatSeconds(o.saving)} rychlejší` : o.value > r.value ? ' · pomalejší než tvůj' : ''}${o.popular ? ' · oblíbený' : ''} `, save));
          }))));
    }
    if (r.weak.length) sections.push(el('div', { className: 'rv-sec' }, el('h4', { textContent: 'Slabá místa' }),
      el('ul', { className: 'rv-points' }, ...r.weak.map((w) => el('li', { textContent: `${w.i + 1}. tah ${w.move}${w.before ? ` (po ${w.before})` : ''}: ${w.reasons.join(', ')}` })))));
    if (r.strong.length) sections.push(el('div', { className: 'rv-sec' }, el('h4', { textContent: 'Silné stránky' }), el('p', { className: 'rv-good', textContent: r.strong.join(' · ') })));
    if (r.tips.length) sections.push(el('div', { className: 'rv-sec' }, el('h4', { textContent: 'Co zkusit' }), el('ul', { className: 'rv-points' }, ...r.tips.map((t) => el('li', { textContent: t })))));
    const actions = [];
    if (openLab) {
      const lab = el('button', { type: 'button', className: 'secondary small', textContent: 'Hledat lepší v Labu' });
      lab.onclick = () => { dlg.close(); openLab(taskOf(r.alg, r.kind)); };
      actions.push(lab);
    }
    if (!it.id) {
      const save = el('button', { type: 'button', className: 'secondary small', textContent: 'Uložit do trenažéru' });
      save.onclick = () => saveAlg(r.alg, it.name ?? title, r.kind);
      actions.push(save);
    }
    const vs = versus(r, { config, tps });
    const g = r.grade;
    return el('article', { className: 'rv-card' },
      el('div', { className: 'rv-head' },
        el('div', { className: `rv-grade g${g >= 90 ? 5 : g >= 75 ? 4 : g >= 55 ? 3 : g >= 35 ? 2 : 1}` }, el('b', { textContent: String(g) }), el('small', { textContent: r.label })),
        el('div', {}, el('h3', { textContent: title }), el('small', { textContent: sub }))),
      alg, el('p', { className: 'rv-facts', textContent: facts.join(' · ') }), ...sections, vs,
      actions.length ? el('div', { className: 'row-btns' }, ...actions) : null);
  }

  /** Porovnání s jiným algoritmem (např. z generátoru) a tvoje volba, který je lepší. */
  function versus(r, { config, tps }) {
    const input = el('input', { className: 'rv-vs-input', placeholder: "např. M2 D' M' U2 M U M2", spellcheck: false, ariaLabel: 'Jiný algoritmus k porovnání' });
    const cmp = el('button', { type: 'button', className: 'secondary small', textContent: 'Porovnat' });
    const res = el('div', { className: 'rv-vs-res' });
    const run = () => {
      const o = reviewAlg(input.value, { config, tps });
      if (!o.ok) { res.replaceChildren(el('p', { className: 'hint', textContent: o.reason })); return; }
      if (o.alg === r.alg) { res.replaceChildren(el('p', { className: 'hint', textContent: 'To je stejný algoritmus.' })); return; }
      const same = o.key === r.key;
      const diff = o.time - r.time;
      const verdict = Math.abs(diff) < 0.02 ? 'Podle hodnocení jsou skoro stejně rychlé.'
        : diff > 0 ? `Podle hodnocení je tvůj rychlejší o ${formatSeconds(diff)}.` : `Podle hodnocení je ten druhý rychlejší o ${formatSeconds(-diff)} – pokud to cítíš jinak, dej vědět níž, váhy se podle toho doladí.`;
      const row = (label, x) => el('li', {}, el('b', { textContent: label }), el('code', { textContent: x.alg }),
        el('small', { textContent: `${x.moves} tahů · odhad ${formatSeconds(x.time)} · nepohodlnost ${fmt(x.score.total)}${x.weak.length ? ` · slabá místa: ${x.weak.map((w) => `${w.move} (${w.reasons[0]})`).join(', ')}` : ''}` }));
      const choose = (label, fn) => Object.assign(el('button', { type: 'button', className: 'secondary small', textContent: label }), { onclick: () => {
        fn();
        toast('Uloženo jako tvoje porovnání – Lab → Tahy a váhy → „Podle mých porovnání“ z nich doladí váhy');
        res.querySelector('.rv-vs-pick')?.replaceChildren(el('small', { textContent: `Uloženo ✓ (porovnání celkem: ${preferencesOf('333').length})` }));
      } });
      res.replaceChildren(
        el('ul', { className: 'rv-vs-list' }, row('Tvůj', r), row('Druhý', o)),
        el('p', { className: 'rv-facts', textContent: `${same ? '' : 'Pozor: neřeší úplně stejný stav (jiné dílky nebo natočení) – porovnání je jen orientační. '}${verdict}` }),
        el('div', { className: 'row-btns rv-vs-pick' },
          choose('Můj je lepší', () => recordPreference('333', r.alg, o.alg, { source: 'review' })),
          choose('Ten druhý je lepší', () => recordPreference('333', o.alg, r.alg, { source: 'review' })),
          choose('Stejně', () => recordPreference('333', r.alg, o.alg, { tie: true, source: 'review' }))));
    };
    cmp.onclick = run;
    input.onkeydown = (e) => { if (e.key === 'Enter') run(); };
    return el('details', { className: 'rv-vs' }, el('summary', { textContent: 'Porovnat s jiným algoritmem (třeba z generátoru)' }),
      el('div', { className: 'row-btns' }, input, cmp), res);
  }

  function saveAlg(alg, name, kind) {
    try {
      const set = source === 'set' ? setSel.value : defaultSetId();
      if (algs.list().some((a) => a.set === set && normalizeAlg(a.alg) === normalizeAlg(alg))) { toast('Tenhle algoritmus už v sadě je'); return; }
      algs.add({ alg, name, set, task: taskOf(alg, kind) });
      toast(`Uloženo do sady „${algSets.get(set).name}“`);
      onSaved?.(set);
    } catch { toast('Algoritmus nejde uložit'); }
  }

  go.onclick = run;
  tempoSel.onchange = run;
  sortSel.onchange = run;
  setSel.onchange = run;
  text.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); };
  close.onclick = () => dlg.close();
  dlg.addEventListener('close', () => { remember(); dlg.remove(); });
  dlg.showModal();
  if (source === 'set' || text.value.trim()) run(); else text.focus();
  return dlg;
}
