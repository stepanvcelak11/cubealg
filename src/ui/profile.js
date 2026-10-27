// Můj profil skladače (Nastavení → Můj profil, Otestovat → úroveň „Já“): co umím, jak rychle
// skládám, rekordy, další kostky, sady algoritmů, tempo a look-ahead. Z profilu vznikne úroveň
// „Já“ pro test metody (sim/profile.js) – odhad času nové metody přímo pro mě a kolik jejích
// algoritmů už umím. Průměry, rekordy a tempo algoritmů jde doplnit z timeru a trenažéru.

import { el, storage } from './dom.js';
import { solves, algs } from './store.js';
import { summary } from '../timer/stats.js';
import { EVENTS } from '../timer/events.js';
import { LEVELS } from '../sim/simulate.js';
import { profileLevel, profileAccuracy, KNOWN_SETS, PROFILE_METHODS, knownTotal } from '../sim/profile.js';
import { toast } from './share.js';
import { myTable } from './mytable.js';

const KEY = 'ergocube.profile';
const EVENT = 'ergocube-profile';
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '');
const num = (s) => { const v = Number(String(s ?? '').replace(',', '.')); return String(s ?? '').trim() && Number.isFinite(v) ? v : undefined; };

export const profile = () => storage.get(KEY) ?? {};

/** Úroveň „Já“ do LEVELS (test metody, vylepšit, vymyslet): z profilu, jinak dočasně jako ~10 s. */
export function applyProfile() {
  const L = profileLevel(profile());
  LEVELS.me = L ?? { ...LEVELS.fast, label: 'Já – můj profil (vyplň v Nastavení)', fromProfile: false };
  return LEVELS.me;
}
/** Změna profilu: kdo počítá s úrovní „Já“, se překreslí. */
export const onProfile = (fn) => window.addEventListener(EVENT, fn);

/** Krátké shrnutí profilu (Nastavení, Otestovat). */
export function profileSummary(p = profile()) {
  if (!(Number(p.avg) > 0)) return 'Profil není vyplněný – test metody zatím nepočítá s tebou.';
  const acc = profileAccuracy(p);
  const known = knownTotal(p);
  return `${PROFILE_METHODS[p.method] ?? 'Metoda'} ${fmt(Number(p.avg))} s${p.single ? ` · single ${fmt(Number(p.single))} s` : ''}${known ? ` · umíš ${known} algoritmů` : ''} · vyplněno ${Math.round(acc.fill * 100)} %, odhad ± ${acc.pct} %`;
}

/** Doplní z dat aplikace: průměry a rekordy z timeru, tempo algoritmů z trenažéru. */
export function profileFromData(p = profile()) {
  const out = { ...p, events: { ...(p.events ?? {}) } };
  const pick = (s) => [s.ao100.current, s.ao50.current, s.ao12.current, s.mean].find((v) => Number.isFinite(v) && v > 0);
  let filled = 0;
  for (const e of EVENTS.filter((x) => x.result === 'time')) {
    const list = solves.list(e.id);
    if (list.length < 5) continue;
    const s = summary(list);
    const avg = pick(s), single = s.single.best;
    if (e.id === '333') {
      if (avg) { out.avg = +(avg / 1000).toFixed(2); filled++; }
      if (Number.isFinite(single)) out.single = +(single / 1000).toFixed(2);
      out.solves = Math.max(out.solves ?? 0, list.length);
    } else if (avg) {
      out.events[e.id] = { avg: +(avg / 1000).toFixed(2), ...(Number.isFinite(single) ? { single: +(single / 1000).toFixed(2) } : {}) };
      filled++;
    }
  }
  // Moje rekordy (tabulka ve Statistikách): kde timer nemá složení, vezme se průměr z tabulky
  for (const row of myTable().rows) {
    const e = EVENTS.find((x) => x.result === 'time' && x.name.toLowerCase() === row.name.toLowerCase());
    if (!e) continue;
    const c = row.cells ?? {};
    const avg = [c.ao100, c.ao50, c.ao12, c.ao5].find((v) => Number.isFinite(v));
    const single = Number.isFinite(c.single) ? +(c.single / 1000).toFixed(2) : undefined;
    if (e.id === '333') {
      if (!(out.avg > 0) && avg) { out.avg = +(avg / 1000).toFixed(2); filled++; }
      if (!(out.single > 0) && single) out.single = single;
    } else if (avg && !out.events[e.id]) {
      out.events[e.id] = { avg: +(avg / 1000).toFixed(2), ...(single ? { single } : {}) };
      filled++;
    }
  }
  // tempo algoritmů: tahy ÷ medián časů provedení (algoritmy aspoň se 2 časy)
  const rates = [];
  for (const a of algs.list()) {
    const times = (a.times ?? []).map((x) => x.t).filter((t) => t > 0).sort((x, y) => x - y);
    const moves = String(a.alg ?? '').split(/\s+/).filter((m) => m && !/^[xyz]/.test(m)).length;
    if (times.length >= 2 && moves >= 4) rates.push(moves / (times[Math.floor(times.length / 2)] / 1000));
  }
  if (rates.length >= 3) { rates.sort((x, y) => x - y); out.algTps = +rates[Math.floor(rates.length / 2)].toFixed(1); filled++; }
  return { profile: out, filled };
}

function save(p) {
  storage.set(KEY, p);
  applyProfile();
  window.dispatchEvent(new Event(EVENT));
}

let dialog = null;
/** Dialog profilu (vytvoří se při prvním otevření). */
export function openProfile() {
  dialog ??= document.body.appendChild(el('dialog', { className: 'help-dialog profile-dialog', ariaLabel: 'Můj profil skladače' }));
  render();
  if (!dialog.open) dialog.showModal();
}

function render() {
  const p = profile();
  const set = (patch) => { save({ ...profile(), ...patch }); render(); };
  const input = (key, label, hint, { step = '0.01', min = 0, unit } = {}) => {
    const i = el('input', { type: 'number', inputMode: 'decimal', step, min, value: p[key] ?? '', ariaLabel: label });
    i.onchange = () => set({ [key]: num(i.value) });
    return el('label', { className: 'field' }, unit ? `${label} (${unit})` : label, i, hint ? el('small', { className: 'hint', textContent: hint }) : null);
  };
  const choice = (key, label, options, hint) => {
    const s = el('select', { ariaLabel: label }, el('option', { value: '', textContent: '— nevím / nevyplněno —' }), ...Object.entries(options).map(([v, t]) => el('option', { value: v, textContent: t })));
    s.value = p[key] ?? '';
    s.onchange = () => set({ [key]: s.value ? (Number.isFinite(Number(s.value)) && key === 'lookahead' ? Number(s.value) : s.value) : undefined });
    return el('label', { className: 'field' }, label, s, hint ? el('small', { className: 'hint', textContent: hint }) : null);
  };
  const acc = profileAccuracy(p);
  const L = profileLevel(p);
  const fill = el('div', { className: 'prof-fill' }, el('i', { style: `width: ${Math.round(acc.fill * 100)}%` }));
  const auto = el('button', { type: 'button', className: 'secondary small', textContent: 'Doplnit z mých dat (timer, rekordy, trenažér)' });
  auto.onclick = () => {
    const { profile: np, filled } = profileFromData(profile());
    save(np);
    toast(filled ? `Doplněno ${filled} údajů z timeru, rekordů a trenažéru` : 'V timeru a trenažéru zatím není dost dat (aspoň 5 složení, 3 algoritmy s časy)');
    render();
  };
  // sady algoritmů: zaškrtnout; u velkých sad i kolik z nich
  const known = p.known ?? {};
  const sets = el('div', { className: 'prof-sets' }, ...KNOWN_SETS.map((s) => {
    const box = Object.assign(el('input', { type: 'checkbox' }), { checked: !!known[s.id] });
    box.onchange = () => set({ known: { ...profile().known, [s.id]: box.checked ? (s.partial ? s.n : true) : undefined } });
    const count = s.partial && known[s.id] ? el('input', { type: 'number', min: 1, max: s.n, value: Number(known[s.id]) || s.n, ariaLabel: `Kolik z ${s.label}`, className: 'prof-count' }) : null;
    if (count) count.onchange = () => set({ known: { ...profile().known, [s.id]: Math.max(1, Math.min(s.n, Number(count.value) || s.n)) } });
    return el('label', { className: `prof-set${known[s.id] ? ' on' : ''}` }, box, el('span', {}, el('b', { textContent: s.label }), el('small', { textContent: s.partial ? `${s.n} případů – kolik umíš:` : `${s.n} algoritmů` })), count);
  }));
  // další kostky: průměr a single
  const events = EVENTS.filter((e) => e.result === 'time' && e.id !== '333');
  const evRows = events.map((e) => {
    const cur = p.events?.[e.id] ?? {};
    const field = (k, label) => {
      const i = el('input', { type: 'number', inputMode: 'decimal', step: '0.01', min: 0, value: cur[k] ?? '', placeholder: label, ariaLabel: `${e.name} ${label}` });
      i.onchange = () => { const ev = { ...(profile().events ?? {}) }; ev[e.id] = { ...(ev[e.id] ?? {}), [k]: num(i.value) }; if (!ev[e.id].avg && !ev[e.id].single) delete ev[e.id]; set({ events: ev }); };
      return i;
    };
    return el('div', { className: 'prof-ev' }, el('span', { textContent: e.name }), field('avg', 'průměr s'), field('single', 'single s'));
  });
  dialog.replaceChildren(
    el('div', { className: 'prof-head' }, el('h2', { textContent: 'Můj profil skladače' }),
      el('p', { className: 'hint', textContent: 'Co umíš a jak rychle skládáš. Test metody pak odhadne čas nové metody přímo pro tebe (úroveň „Já“ v Otestovat) a spočítá, kolik jejích algoritmů už umíš. Čím víc vyplníš, tím přesnější odhad.' }),
      fill, el('small', { className: 'prof-acc', textContent: `Vyplněno ${Math.round(acc.fill * 100)} % · odhad času ± ${acc.pct} %${L ? ` · tvoje tempo: algoritmy ${fmt(L.tps.alg, 1)} tahů/s, intuitivní ${fmt(L.tps.intuitive, 1)}, rozpoznání ${Math.round(L.recog * 100)} % ze základu` : ''}` }),
      el('div', { className: 'row-btns' }, auto)),
    el('h3', { textContent: '3×3 – hlavní údaj' }),
    el('div', { className: 'grid-fields' },
      choice('method', 'Jakou metodou skládáš', PROFILE_METHODS, 'Odhad se ukotví na tvůj průměr touto metodou'),
      input('avg', 'Průměr', 'Ideálně ao100 nebo ao50 (bez ostatních údajů je to nejdůležitější)', { unit: 's' }),
      input('single', 'Nejlepší single', null, { unit: 's' }),
      input('solves', 'Kolik jsi složil(a) celkem', 'Přibližně – víc složení = stálejší výkon', { step: '1' })),
    el('h3', { textContent: 'Jak skládáš' }),
    el('div', { className: 'grid-fields' },
      input('algTps', 'Tempo algoritmů', 'Kolik tahů za sekundu uděláš v naučeném algoritmu (z trenažéru se doplní samo)', { step: '0.1', unit: 'tahů/s' }),
      choice('lookahead', 'Look-ahead', { 1: '1 – po každém kroku se zastavím', 2: '2 – krátké pauzy', 3: '3 – průměrný', 4: '4 – vidím další krok během tahů', 5: '5 – skoro bez pauz' }, 'Jak moc se díváš dopředu – mění pauzy na rozpoznání'),
      choice('inspection', 'Co naplánuješ v inspekci', { none: 'Jen začátek kříže', cross: 'Celý kříž', xcross: 'Kříž s párem (X-kříž)', more: 'Kříž a víc párů' }),
      choice('neutral', 'Barevná neutralita', { fixed: 'Jedna barva', dual: 'Dvě protilehlé', full: 'Všechny barvy' }),
      choice('hand', 'Ruka', { right: 'Pravák', left: 'Levák' }),
      input('years', 'Kolik let skládáš', null, { step: '0.5' }),
      input('hours', 'Trénink týdně', null, { step: '0.5', unit: 'h' })),
    el('h3', { textContent: 'Algoritmy, které umíš' }),
    sets,
    el('div', { className: 'grid-fields' }, input('otherAlgs', 'Další algoritmy (počet)', 'Cokoli dalšího (vlastní sady, BLD…)', { step: '1' })),
    el('h3', { textContent: 'Další kostky (nepovinné)' }),
    el('p', { className: 'hint', textContent: 'Průměr a single na dalších kostkách – ukáže, jak všestranný jsi; jde doplnit z timeru.' }),
    el('div', { className: 'prof-evs' }, ...evRows),
    el('form', { method: 'dialog' }, el('button', { className: 'primary', textContent: 'Hotovo' })));
}
