// Generátor sady algoritmů pro krok metody: ze zadání Labu (Start = co je hotové
// před krokem, Cíl = po něm) spočítá všechny případy (core/cases.js), pro každý
// najde algoritmus stejným hledáním jako Lab, ověří ho na všech stavech případu
// a uloží výsledky jako novou sadu v trenažéru.

import { enumerateCases, verifyCase, colorsOfState, layerParity, checkParityFix } from '../core/cases.js';
import { SearchClient } from '../search/client.js';
import { styleMetrics, rankResults, VIEWS } from '../ergonomics/style.js';
import { $, el, storage } from './dom.js';
import { NetView } from './netview.js';
import { algs, algSets } from './store.js';
import { toast } from './share.js';
import { recordPreference } from './store.js';
import { keepAwake, askNotify, notify, titleProgress } from './longrun.js';

const OPTS = 'ergocube.lab.generator';
// paměť hledání po případech: nejlepší algoritmy a prohledané délky (příště se navazuje,
// u dokázaně nejpohodlnějších se už nehledá)
const MEMORY = 'ergocube.gen.memory';
const MEMORY_MAX = 1500;
// rozpracovaný dlouhý běh (noční generování): po zavření aplikace jde navázat
const JOB = 'ergocube.gen.job';
const HOUR = 3600 * 1000;
const MODES = {
  once: { label: 'Jedno kolo', hours: 0 },
  h1: { label: 'Do dokázání, nejvýš 1 h', hours: 1 },
  h3: { label: 'Do dokázání, nejvýš 3 h', hours: 3 },
  h8: { label: 'Do dokázání, nejvýš 8 h (přes noc)', hours: 8 },
  inf: { label: 'Do dokázání, bez omezení', hours: Infinity },
};
const ROUND_CAP = 10 * 60 * 1000; // nejdelší hledání jednoho případu v dalších kolech
const hash = (text) => {
  let h1 = 2166136261, h2 = 5381;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (Math.imul(h2, 33) + c) | 0; }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
};
const memory = {
  get: (key) => (storage.get(MEMORY) ?? {})[key] ?? null,
  set(key, value) {
    const all = storage.get(MEMORY) ?? {};
    all[key] = { ...value, at: Date.now() };
    const keys = Object.keys(all);
    if (keys.length > MEMORY_MAX) keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - MEMORY_MAX).forEach((k) => delete all[k]);
    storage.set(MEMORY, all);
  },
};
const fmtTime = (ms) => { const t = Math.round(ms / 1000); return t < 60 ? `${t} s` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const CHOICES = 6; // kolik nalezených algoritmů nabídnout u případu
const CHECK = 40; // kolik nejlepších řešení ověřit při výběru nabídky

/**
 * @param {object} ctx z Labu: model, task {colorsA, colorsB, constraints, marks, hold, puzzle},
 *   job(start, target, constraints, timeLimit) → úloha pro SearchClient,
 *   toHeld(alg) → zápis v rámci držení, score(alg) → hodnocení, join(pre, alg, post), lambda,
 *   cube (je to kostka – AUF a otočení), onOpenSet(id)
 */
export function openGenerator(ctx) {
  const { model } = ctx;
  const P = model.P;
  const saved = storage.get(OPTS) ?? {};
  const cube = ctx.cube;
  const check = (id, label, on, title) => el('label', { className: 'check-row', title },
    Object.assign(el('input', { type: 'checkbox', id }), { checked: on }), label);
  const name = el('input', { value: saved.name ?? 'Nová sada', ariaLabel: 'Název sady' });
  const fix = el('input', { value: saved.fix ?? 'M2 U2 M2', ariaLabel: 'Oprava parity', spellcheck: false });
  const time = el('input', { type: 'number', min: '2', max: '600', value: String(saved.time ?? 10), ariaLabel: 'Průměrný čas na případ (s)' });
  const view = el('select', { ariaLabel: 'Vybírat podle' }, ...Object.entries(VIEWS).map(([id, v]) => el('option', { value: id, textContent: `${v.icon} ${v.label}` })));
  view.value = saved.view ?? 'balanced';
  const mode = el('select', { ariaLabel: 'Délka běhu' }, ...Object.entries(MODES).map(([id, m]) => el('option', { value: id, textContent: m.label })));
  mode.value = MODES[saved.mode] ? saved.mode : 'once';
  const opts = el('div', { className: 'gen-opts' },
    cube ? check('gen-auf', 'Slučovat natočení horní vrstvy (AUF)', saved.auf ?? true, 'Případy, které se liší jen natočením U před nebo po algoritmu, jsou jeden') : null,
    cube ? check('gen-adf', 'Slučovat i natočení spodní vrstvy (D)', saved.adf ?? true, 'Případy, které se liší jen natočením D před nebo po algoritmu, jsou jeden (PBL, EPBL…). Natočení D pak uděláš sám jako AUF.') : null,
    cube ? check('gen-y', 'Stejný případ z jiné strany (otočení y)', saved.y ?? false, 'Případ viděný po otočení celé kostky kolem svislé osy je stejný') : null,
    cube ? check('gen-z2', 'I vzhůru nohama (z2)', saved.z2 ?? false, 'Případ viděný po převrácení kostky je stejný (metody, kde jsou horní a spodní vrstva rovnocenné)') : null,
    cube ? check('gen-par', 'Vynechat paritní případy (lichá permutace ve vrstvě)', saved.par ?? false, 'Případy, které v jedné vrstvě samy o sobě nejdou (např. prohozené dvě hrany), se předem opraví algoritmem níže a pak jsou jako jiný případ') : null,
    cube ? el('label', { className: 'field gen-fix' }, 'Oprava parity', fix) : null,
    cube ? check('gen-wy', 'Bílá a žlutá jsou na Startu zaměnitelné', saved.wy ?? false, 'Bílá nálepka na Startu znamená „bílá nebo žlutá“') : null,
    el('div', { className: 'grid-fields' },
      el('label', { className: 'field' }, 'Název sady', name),
      el('label', { className: 'field', title: 'Průměr: případ, u kterého je nejpohodlnější algoritmus dokázaný dřív, skončí a ušetřený čas dostanou těžší (nejvýš 3× průměr, max. minuta)' }, 'Průměrný čas na případ (s)', time),
      el('label', { className: 'field' }, 'Vybírat podle', view),
      el('label', { className: 'field', title: 'Po prvním kole se nedokázané případy hledají znovu a déle (navazuje se), dokud není u každého dokázaný nejpohodlnější algoritmus nebo nevyprší čas. Displej zůstane rozsvícený; nech aplikaci otevřenou (nejlépe v nabíječce). Když ji zavřeš, příště můžeš pokračovat.' }, 'Délka běhu', mode)));
  const status = el('p', { className: 'status gen-status' });
  // průběh generování: pruh s dílkem za každý případ a pruh času aktuálního případu
  const timeline = el('div', { className: 'gen-timeline', hidden: true, role: 'list', ariaLabel: 'Průběh generování' });
  const bar = el('div', { className: 'gen-bar' });
  const live = el('div', { className: 'gen-live', hidden: true }, el('div', { className: 'gen-track' }, bar), el('span', { className: 'gen-live-text', ariaLive: 'polite' }));
  const list = el('div', { className: 'gen-cases' });
  const countBtn = el('button', { type: 'button', className: 'secondary', textContent: 'Spočítat případy' });
  const goBtn = el('button', { type: 'button', className: 'primary', textContent: 'Generovat', hidden: true });
  const stopBtn = el('button', { type: 'button', className: 'secondary', textContent: 'Zastavit', hidden: true });
  const openBtn = el('button', { type: 'button', className: 'secondary', textContent: 'Otevřít sadu v Trenažéru', hidden: true });
  // uložení: nic se neukládá samo – vybereš algoritmy (u každého případu jeden nebo víc) a sadu
  const target = el('select', { ariaLabel: 'Uložit do sady' });
  const parityBox = Object.assign(el('input', { type: 'checkbox' }), { checked: true });
  const parityRow = el('label', { className: 'check-row', hidden: true }, parityBox, el('span', { className: 'gen-parity-label' }));
  const saveBtn = el('button', { type: 'button', className: 'primary small', textContent: 'Uložit vybrané' });
  const saveBar = el('div', { className: 'gen-save', hidden: true }, target, saveBtn, parityRow);
  const close = el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít', textContent: '✕' });
  const dlg = el('dialog', { className: 'help-dialog gen-dialog' },
    el('div', { className: 'gen-head' }, el('h2', { textContent: 'Generátor sady' }), close),
    el('div', { className: 'gen-body' },
      el('p', { className: 'hint', textContent: 'Krok metody podle zadání: Start = co je hotové před krokem (nevybarvené dílky můžou být jakkoli, dílek jen s částí barev = „tahle barva tady“), Cíl = co má být hotové po kroku. Tahy a ergonomie podle „Tahy a váhy“. Aplikace projde všechny stavy, které Startu odpovídají, sloučí stejné případy, pro každý najde algoritmus a ověří ho na všech jeho stavech. Hledání zkouší i tvoje uložené algoritmy a ty, které už v tomto běhu našlo.' }),
      opts, el('div', { className: 'row-btns gen-actions' }, countBtn, goBtn, stopBtn, openBtn), el('div', { className: 'gen-progress' }, status, timeline, live, saveBar), list));
  document.body.append(dlg);

  const client = new SearchClient();
  let result = null; // výsledek výčtu
  let cards = [];
  let running = false;
  let setId = null;
  let parity = null; // vynechané paritní případy { cases, fix, bad }
  const syncFix = () => { fix.closest('label').hidden = !val('gen-par'); };
  dlg.querySelector('#gen-par')?.addEventListener('change', syncFix);
  const val = (id) => dlg.querySelector(`#${id}`)?.checked ?? false;
  const settings = () => ({ auf: cube && val('gen-auf'), adf: cube && val('gen-adf'), y: val('gen-y'), z2: val('gen-z2'), wy: val('gen-wy'), par: val('gen-par') });
  const enumOpts = () => {
    const s = settings();
    return { auf: s.auf, adf: s.adf, rotations: [s.y && 'y', s.z2 && 'z2'].filter(Boolean), interchange: s.wy ? [['U', 'D']] : [] };
  };
  const remember = () => storage.set(OPTS, { ...settings(), fix: fix.value, name: name.value, time: Number(time.value), view: view.value, mode: mode.value });
  // zadání běhu (Lab + nastavení výčtu): podle něj se pozná, že jde navázat
  const jobKey = () => hash(JSON.stringify([ctx.signature, ctx.task, settings(), fix.value]));

  close.onclick = () => dlg.close();
  dlg.addEventListener('close', () => { running = false; client.cancel(); resolveCurrent?.(); dlg.remove(); });

  countBtn.onclick = () => {
    status.textContent = 'Počítám případy…';
    setTimeout(countCases, 30);
  };
  /** Výčet případů ze zadání (karty, tlačítko Generovat). */
  function countCases() {
    remember();
    saveBar.hidden = true; openBtn.hidden = true; setId = null;
    list.replaceChildren();
    goBtn.hidden = true;
    const t0 = performance.now();
    result = enumerateCases(P, ctx.task, enumOpts());
    if (result.error) { status.textContent = `Zadání: ${result.error}`; return; }
    let todo = result.cases.filter((c) => !c.solved);
    const solved = result.cases.length - todo.length;
    parity = null;
    let parText = '';
    if (settings().par) {
      const odd = todo.filter((c) => layerParity(P, c.rep).odd);
      todo = todo.filter((c) => !odd.includes(c));
      let bad = 0;
      try { bad = fix.value.trim() ? checkParityFix(P, odd.flatMap((c) => c.members), fix.value, enumOpts()) : 0; } catch { bad = -1; }
      parity = { cases: odd, fix: fix.value.trim(), bad };
      parText = ` · ${odd.length} paritních vynecháno`
        + (!odd.length || !parity.fix ? '' : bad === -1 ? ' (opravu parity nejde přečíst)' : bad ? ` (⚠ ${parity.fix} neopraví ${bad} stavů)` : ` (opraví ${parity.fix})`);
    }
    status.textContent = `${result.signatures} stavů → ${todo.length} případů${solved ? ` (+ ${solved} jen natočením vrstvy)` : ''}${parText}`
      + `${result.tooMany ? ' · POZOR: moc stavů, výčet není úplný – omez Start' : ''} · ${Math.round(performance.now() - t0)} ms`;
    renderCards(todo);
    goBtn.hidden = !todo.length || result.tooMany;
    goBtn.textContent = `Generovat ${todo.length} algoritmů`;
  }

  function renderCards(todo) {
    const v = model.flatView ?? model.view;
    cards = todo.slice(0, 600).map((c, i) => {
      const box = el('input', { type: 'checkbox', checked: true, ariaLabel: `Případ ${i + 1}` });
      const pic = el('div', { className: 'gen-pic' });
      const out = el('div', { className: 'gen-out' });
      const card = el('div', { className: 'gen-card' }, el('label', { className: 'gen-card-head' }, box, el('b', { textContent: `${i + 1}.` }),
        el('small', { textContent: `${c.members.length} ${c.members.length === 1 ? 'stav' : c.members.length < 5 ? 'stavy' : 'stavů'}` })), pic, out);
      if (v.type === 'net') {
        const net = new NetView(pic, { label: `Případ ${i + 1}`, viewBox: v.viewBox, polys: v.polys });
        net.render(model.stateStickers(c.rep, result.constraints));
      }
      return { c, box, out, card, i };
    });
    list.replaceChildren(...cards.map((x) => x.card));
    if (todo.length > cards.length) list.append(el('p', { className: 'hint', textContent: `… a dalších ${todo.length - cards.length} (zobrazeno prvních ${cards.length})` }));
  }

  /** Hledání se nespustilo: proč (bez internetu = aplikace není v zařízení uložená celá). */
  const failText = (msg) => (navigator.onLine === false
    ? 'Hledání se nespustilo: bez internetu chybí část aplikace – otevři ji jednou s internetem (Nastavení → Bez internetu ukáže, jestli je uložená celá)'
    : `Hledání se nespustilo: ${msg}`);
  /** Najde algoritmus pro jeden případ (Promise → { alg, pre, post, display } | null). */
  let resolveCurrent = null; // zastavení ukončí i probíhající hledání
  // vrací { found: Map, optimal: dokázaně nejpohodlnější }; seeds = dosavadní řešení (navázání)
  const keyOf = (c) => hash(JSON.stringify([ctx.signature, result.constraints, Array.from(result.target), Array.from(c.rep)]));
  const solveOne = (c, timeLimit, onFound, { seeds = [], found = new Map() } = {}) => new Promise((resolve) => {
    const key = keyOf(c);
    const mem = memory.get(key);
    const add = (it) => found.set(`${it.pre}|${it.alg}|${it.post}`, it);
    // z paměti: dřívější nejlepší jako výchozí body; dokázané optimum se už nehledá
    if (mem && !seeds.length) for (const it of mem.seeds ?? []) add(it);
    if (mem?.optimal && found.size) { onFound?.(found); resolve({ found, optimal: true, cached: true }); return; }
    const remember = (d) => {
      // nejlepší podle rychlosti musí být mezi výchozími body (z jeho hodnocení vychází mez
      // prohledaných délek), k němu nabídka případu
      const fastest = rankResults([...found.values()].map((it) => ({ it, m: styleMetrics(ctx.score(ctx.join(ctx.toHeld(it.pre), ctx.toHeld(it.alg), ctx.toHeld(it.post))), cube) })), 'speed')[0].it;
      const list = [fastest, ...choicesOf({ c }, found).map((ch) => ch.it)].filter((it, i, a) => a.indexOf(it) === i);
      memory.set(key, { seeds: list.slice(0, 10).map(({ alg, pre, post }) => ({ alg, pre, post })),
        progress: { cleared: d.cleared ?? 0, comfortDone: d.comfortDone ?? [] }, optimal: !!d.speedOptimal });
    };
    resolveCurrent = () => resolve({ found, optimal: false });
    const allSeeds = [...seeds, ...(seeds.length ? [] : mem?.seeds ?? [])];
    client.start(ctx.job(c.rep, result.target, result.constraints, timeLimit, {
      seeds: allSeeds, library: [...ctx.library(), ...learned], resume: allSeeds.length ? mem?.progress : undefined,
    }), {
      onSolutions: (items) => { for (const it of items) add(it); onFound?.(found); },
      onDone: (d) => { if (found.size) remember(d); resolve({ found, optimal: !!d.speedOptimal }); },
      onError: (e) => resolve({ found, optimal: false, error: e?.message || 'hledání se nespustilo' }),
    });
  });
  const learned = []; // algoritmy nalezené v tomto běhu – knihovna pro další případy
  const modelAlg = (it) => [it.pre, it.alg, it.post].filter(Boolean).join(' ');

  /** Nabídka u případu z nalezených řešení (seřazená podle zvoleného pohledu). */
  const choicesOf = (x, found) => pickChoices(rankResults([...found.values()].map((it) => {
    const display = ctx.join(ctx.toHeld(it.pre), ctx.toHeld(it.alg), ctx.toHeld(it.post));
    return { it, display, m: styleMetrics(ctx.score(display), cube) };
  }), view.value, { lambda: ctx.lambda }), x.c.members, enumOpts());

  /** Seznam nalezených řešení případu → nabídka; vybrané k uložení zůstanou vybrané. */
  function applyResult(x, { found, optimal, cached }) {
    const choices = choicesOf(x, found);
    if (!x.state) {
      // k uložení: nabídnutý (nejlepší), když řeší celý případ
      x.state = { found, choices, keep: new Set(choices[0].v.ok ? [choices[0].display] : []), optimal, cached };
      if (choices[0].v.ok) learned.push(modelAlg(choices[0].it));
      return;
    }
    const before = x.state.choices[0].display;
    // nový nejlepší se přidá k uložení, jen když byl vybraný dosavadní nejlepší
    const keep = new Set(x.state.keep);
    if (choices[0].display !== before && keep.has(before) && choices[0].v.ok) { keep.delete(before); keep.add(choices[0].display); }
    const lost = x.state.choices.filter((ch) => keep.has(ch.display) && !choices.some((c2) => c2.display === ch.display));
    x.state = { ...x.state, found, choices: [...choices, ...lost], keep, optimal, cached: false };
  }

  /** Stav dílku průběhu podle výsledku případu. */
  function markSeg(x) {
    if (!x.seg) return;
    x.seg.classList.remove('ok', 'warn', 'none', 'proof');
    if (!x.state) x.seg.classList.add('none');
    else {
      x.seg.classList.add(x.state.choices[0].v.ok ? 'ok' : 'warn');
      if (x.state.optimal) x.seg.classList.add('proof');
    }
  }

  /** Jedno hledání případu (navazuje na nalezená řešení); label = text průběhu. */
  async function attempt(x, limit, label) {
    x.card.classList.add('busy');
    x.seg?.classList.add('busy');
    x.card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const start = performance.now();
    let count = x.state?.found.size ?? 0;
    const tick = () => {
      const t = performance.now() - start;
      bar.style.width = `${Math.min(100, (t / limit) * 100)}%`;
      live.lastChild.textContent = `${label()} · ${(t / 1000).toFixed(1)} / ${Math.round(limit / 1000)} s · ${count} řešení`;
    };
    tick();
    const timer = setInterval(tick, 200);
    const seeds = x.state ? x.state.choices.map((ch) => ({ alg: ch.it.alg, pre: ch.it.pre, post: ch.it.post })) : [];
    const res = await solveOne(x.c, limit, (f) => {
      count = f.size;
      if (!x.state) x.out.replaceChildren(el('span', { className: 'gen-searching', textContent: `hledám… ${count} řešení` }));
    }, x.state ? { seeds, found: x.state.found } : {});
    clearInterval(timer);
    x.card.classList.remove('busy');
    x.seg?.classList.remove('busy');
    return { ...res, elapsed: performance.now() - start };
  }

  /** Souhrn stavu případů (po kole i na konci). */
  function tally(chosen) {
    const t = { ok: 0, warn: 0, none: 0, proven: 0, done: 0 };
    for (const x of chosen) {
      if (!x.tried) continue;
      t.done++;
      if (!x.state) t.none++;
      else if (x.state.choices[0].v.ok) t.ok++; else t.warn++;
      if (x.state?.optimal) t.proven++;
    }
    return t;
  }

  // noční běh: displej nezhasne, průběh v názvu karty, na konci oznámení
  let awake = null;
  const title = titleProgress();
  dlg.addEventListener('close', () => { awake?.release(); title.reset(); });
  let longRun = false;

  goBtn.onclick = async () => {
    if (!result || running) return;
    remember();
    running = true;
    const runMode = MODES[mode.value];
    longRun = runMode.hours > 0;
    goBtn.hidden = true; countBtn.disabled = true; stopBtn.hidden = false; openBtn.hidden = true; saveBar.hidden = true;
    for (const x of cards) x.box.disabled = true;
    const chosen = cards.filter((x) => x.box.checked);
    // čas: zadaný čas na případ je průměr; případ, u kterého je nejpohodlnější
    // dokázané dřív, skončí a ušetřený čas dostanou těžší případy (nejvýš 3× průměr, max. minuta)
    const per = Math.max(2, Math.min(600, Number(time.value) || 10)) * 1000;
    const cap = Math.max(per, Math.min(60000, per * 3));
    let budget = per * chosen.length;
    setId = null;
    const segs = chosen.map((x) => Object.assign(el('button', { type: 'button', className: 'gen-seg', role: 'listitem', title: `Případ ${x.i + 1}`, ariaLabel: `Případ ${x.i + 1}` }), {
      onclick: () => x.card.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    }));
    chosen.forEach((x, n) => { x.seg = segs[n]; markSeg(x); });
    timeline.replaceChildren(...segs);
    timeline.hidden = false;
    live.hidden = false;
    const t0 = performance.now();
    const deadline = Date.now() + runMode.hours * HOUR;
    const job = { key: jobKey(), name: name.value.trim() || 'Nová sada', mode: mode.value, started: Date.now(), deadline, total: chosen.length, proven: 0, done: false };
    const saveJob = () => { if (longRun) storage.set(JOB, { ...job, proven: tally(chosen).proven }); };
    if (longRun) {
      awake = keepAwake();
      askNotify();
      saveJob();
      banner.hidden = true;
    }
    const showTitle = () => { if (longRun) title.set(`(${tally(chosen).proven}/${chosen.length})`); };

    // 1. kolo: každý případ jednou, čas podle průměru
    for (let n = 0; n < chosen.length && running; n++) {
      const x = chosen[n];
      const limit = Math.round(Math.min(cap, Math.max(2000, (budget / (chosen.length - n)) * 1.5)));
      status.textContent = `Případ ${n + 1} z ${chosen.length} · hledám…`;
      const res = await attempt(x, limit, () => `Případ ${n + 1} z ${chosen.length} · celkem ${fmtTime(performance.now() - t0)}, zbývá nejvýš ${fmtTime(Math.max(0, budget))}`);
      budget = Math.max(0, budget - res.elapsed);
      if (!running) break;
      x.tried = true;
      if (res.found.size) applyResult(x, res);
      if (x.state) renderChoices(x); else x.out.replaceChildren(el('span', { className: 'ko', textContent: res.error ? failText(res.error) : 'nenalezeno' }));
      // hledání se vůbec nespustilo (chybí soubory bez internetu…): dál nemá smysl
      if (res.error && !res.found.size) { status.textContent = failText(res.error); break; }
      markSeg(x);
      updateSave();
      showTitle();
      saveJob();
    }

    // další kola (dlouhý běh): nedokázané případy znovu a déle, dokud nejsou dokázané nebo nevyprší čas
    for (let round = 1; running && longRun && Date.now() < deadline; round++) {
      const open = chosen.filter((x) => !x.state?.optimal);
      if (!open.length) break;
      const limit = Math.min(ROUND_CAP, per * 2 ** round, Math.max(2000, deadline - Date.now()));
      for (let n = 0; n < open.length && running && Date.now() < deadline; n++) {
        const x = open[n];
        status.textContent = `Kolo ${round + 1} · nedokázaný případ ${n + 1} z ${open.length} (č. ${x.i + 1})`;
        const res = await attempt(x, limit, () => `Kolo ${round + 1} · případ ${x.i + 1} · dokázáno ${tally(chosen).proven} z ${chosen.length} · běží ${fmtTime(performance.now() - t0)}${Number.isFinite(deadline) ? `, zbývá ${fmtTime(Math.max(0, deadline - Date.now()))}` : ''}`);
        if (!running) break;
        if (res.found.size) applyResult(x, res);
        if (x.state) renderChoices(x);
        markSeg(x);
        updateSave();
        showTitle();
        saveJob();
      }
    }

    const finished = running; // dokončeno (ne zastaveno)
    live.hidden = true;
    running = false;
    for (const b of dlg.querySelectorAll('.gen-more')) b.disabled = false;
    client.cancel();
    awake?.release();
    awake = null;
    stopBtn.hidden = true; countBtn.disabled = false;
    const t = tally(chosen);
    const all = chosen.length;
    const n0 = t.done < all ? `Zastaveno po ${t.done} z ${all} · ` : '';
    status.textContent = `${n0}Hotovo: ${t.ok} ověřených${t.proven ? ` (${t.proven} dokázaně nejpohodlnějších)` : ''}${t.warn ? `, ${t.warn} s upozorněním` : ''}${t.none ? `, ${t.none} bez řešení (zkus delší čas nebo víc tahů)` : ''} · vyber, co uložit`;
    if (longRun) {
      title.reset();
      // zastavený běh zůstane rozpracovaný (jde navázat), dokončený se uzavře
      if (finished) storage.set(JOB, { ...job, proven: t.proven, done: true });
      if (finished) notify('Generátor sady', `${t.proven} z ${all} případů dokázaně nejpohodlnějších${t.proven < all ? ' (zbytek s nejlepším nalezeným)' : ''}. Otevři generátor a vyber, co uložit.`);
    }
    showSave();
  };

  // rozpracovaný noční běh se stejným zadáním: nabídka navázat
  const banner = el('div', { className: 'gen-resume', hidden: true });
  {
    const job = storage.get(JOB);
    if (job && !job.done) {
      const same = job.key === jobKey();
      const when = new Date(job.started).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
      const resume = el('button', { type: 'button', className: 'primary small', textContent: 'Pokračovat', hidden: !same });
      const drop = el('button', { type: 'button', className: 'secondary small', textContent: 'Zahodit' });
      banner.replaceChildren(
        el('div', {}, el('b', { textContent: `Rozpracované generování „${job.name}“` }),
          el('small', { textContent: `${when} · dokázáno ${job.proven} z ${job.total}${same ? ' · navážeš tam, kde skončilo' : ' · otevři v Labu stejné zadání, tahy a nastavení, pak jde navázat'}` })),
        el('div', { className: 'row-btns' }, resume, drop));
      banner.hidden = false;
      drop.onclick = () => { storage.set(JOB, { ...job, done: true }); banner.hidden = true; };
      resume.onclick = () => {
        banner.hidden = true;
        if (MODES[job.mode]) mode.value = job.mode;
        countCases();
        if (!goBtn.hidden) goBtn.click();
      };
    }
  }
  dlg.querySelector('.gen-body').prepend(banner);

  /**
   * Nabídka u případu: nejlepší v každém pohledu (★ všestranné, ⚡ rychlost,
   * ◎ efektivita) a další podle zvoleného pohledu; ověřené mají přednost.
   */
  function pickChoices(ranked, members, opts) {
    const seen = new Set();
    const checked = [];
    for (const r of ranked) {
      // stejný algoritmus jen s jiným AUF/ADF v závorkách: stačí nejlépe hodnocený
      const core = r.display.replace(/^(\([^)]*\)\s*)+|(\s*\([^)]*\))+$/g, '');
      if (seen.has(core)) continue;
      seen.add(core);
      const modelAlg = [r.it.pre, r.it.alg, r.it.post].filter(Boolean).join(' ');
      checked.push({ ...r, v: verifyCase(P, result.goal, members, modelAlg, { auf: opts.auf, adf: opts.adf, rotations: opts.rotations }) });
      if (checked.length >= CHECK) break;
    }
    const good = checked.filter((r) => r.v.ok);
    const pool = good.length ? good : checked;
    const tops = new Map(); // položka → pohledy, ve kterých je první
    const order = [view.value, ...Object.keys(VIEWS).filter((v) => v !== view.value)];
    for (const id of order) {
      const top = rankResults(pool, id, { lambda: ctx.lambda })[0];
      if (!tops.has(top)) tops.set(top, []);
      tops.get(top).push(id);
    }
    const out = [...tops.keys()];
    // další nabídka: napřed jinak postavené algoritmy – varianty, které se liší jen
    // tahy U/D na začátku a konci (natočení vrstev), přijdou na řadu až nakonec
    const skeleton = (r) => r.display.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).join(' ').replace(/^((?:[UD][2']?\s+)+)/, '').replace(/((?:\s+[UD][2']?)+)$/, '');
    const used = new Set(out.map(skeleton));
    for (const r of pool) {
      if (out.length >= CHOICES) break;
      if (!out.includes(r) && !used.has(skeleton(r))) { out.push(r); used.add(skeleton(r)); }
    }
    for (const r of [...pool, ...checked]) {
      if (out.length >= CHOICES) break;
      if (!out.includes(r)) out.push(r);
    }
    return out.map((r) => ({ ...r, best: tops.get(r) ?? [] }));
  }

  /** Nalezené algoritmy u případu: vybraný se uloží do sady, kliknutím se vybere jiný. */
  function renderChoices(x) {
    const { choices, keep, optimal } = x.state;
    const n = x.c.members.length;
    const facts = (m) => `${m.length} tahů · ${m.regrips + m.rotations ? `${m.regrips + m.rotations}× přehmat` : 'bez přehmatů'} · náročnost ${m.total.toFixed(1)}`;
    // štítky jen ikonami (název v popisku), ať se vejdou na řádek
    const badges = (ch) => (ch.best.length ? el('span', { className: 'gen-badges' }, ...ch.best.map((v) => el('span', { className: `gen-badge view-${v}`, title: `Nejlepší: ${VIEWS[v].label}`, textContent: VIEWS[v].icon }))) : null);
    const kept = choices.filter((ch) => keep.has(ch.display));
    const top = choices[0];
    const status = el('div', { className: 'gen-status-row' },
      el('span', { className: top.v.ok ? 'ok' : 'ko', textContent: top.v.ok ? `✓ ${n}` : `⚠ ${top.v.failed}/${n}`, title: top.v.ok ? `Ověřeno na všech ${n} stavech případu` : `Neřeší ${top.v.failed} z ${n} stavů případu` }),
      optimal ? el('span', { className: 'gen-proof', title: `Prohledány všechny délky, do kterých by se pohodlnější algoritmus s povolenými tahy vešel${x.state.cached ? ' (z paměti)' : ''}`, textContent: '✓ nejpohodlnější' }) : null);
    // k uložení vybrané algoritmy; ostatní varianty až po rozbalení (jen u jednoho případu najednou)
    const chosen = kept.length
      ? el('div', { className: 'gen-kept' }, ...kept.map((ch) => el('div', { className: 'gen-chosen' },
        el('span', { className: 'gen-choice-head' }, el('code', { textContent: ch.display }), badges(ch)), el('small', { textContent: facts(ch.m) }))))
      : el('p', { className: 'gen-none', textContent: 'Nic k uložení – vyber ve variantách' });
    const more = el('button', { type: 'button', className: 'chip gen-more', textContent: 'Hledat déle (+30 s)', disabled: running, title: 'Naváže na nalezená řešení a hledá dál' });
    more.onclick = () => searchMore(x);
    const list = el('div', { className: 'gen-choices', role: 'group', ariaLabel: `Algoritmy pro případ ${x.i + 1}` },
      ...choices.map((ch) => {
        const on = keep.has(ch.display);
        const box = Object.assign(el('input', { type: 'checkbox', ariaLabel: `Uložit ${ch.display}` }), { checked: on });
        const row = el('label', {
          className: `gen-choice${on ? ' on' : ''}${ch.v.ok ? '' : ' bad'}`,
          title: ch.v.ok ? 'Zaškrtni, co chceš uložit (může jich být víc)' : `Neřeší ${ch.v.failed} z ${n} stavů případu`,
        }, box, el('span', { className: 'gen-choice-body' },
          el('span', { className: 'gen-choice-head' }, el('code', { textContent: ch.display }), badges(ch)), el('small', { textContent: facts(ch.m) })));
        box.onchange = () => {
          if (box.checked) {
            keep.add(ch.display);
            // tvoje volba proti nabídnutému: podle ní se dá doladit hodnocení (Tahy a váhy → Podle mých voleb)
            if (ch !== top) recordPreference(ctx.task.puzzle, ch.display, top.display);
          } else keep.delete(ch.display);
          renderChoices(x);
          updateSave();
        };
        return row;
      }),
      more);
    const summary = el('summary', { textContent: choices.length > 1 ? `Varianty (${choices.length})` : 'Varianty' });
    const alt = el('details', { className: 'gen-alt', open: !!x.open }, summary, list);
    alt.addEventListener('toggle', () => { x.open = alt.open; });
    // akordeon: rozbalený je jen jeden případ, ať se seznam neroztáhne
    summary.addEventListener('click', () => {
      if (alt.open) return; // zavírá se
      for (const o of cards) if (o !== x) { o.open = false; o.card.querySelector('.gen-alt')?.removeAttribute('open'); }
    });
    x.out.replaceChildren(status, chosen, alt);
  }

  /** Algoritmy k uložení: zaškrtnuté případy × vybrané varianty. */
  const toSave = () => cards.filter((x) => x.state && x.box.checked).flatMap((x) => x.state.choices.filter((ch) => x.state.keep.has(ch.display)).map((ch) => ({ x, ch })));

  function updateSave() {
    const count = toSave().length + (parity?.cases.length && parity.fix && !parity.bad && parityBox.checked ? 1 : 0);
    saveBtn.textContent = `Uložit vybrané (${count})`;
    saveBtn.disabled = !count || running;
  }

  /** Lišta uložení: nová sada (název z nastavení) nebo existující sada. */
  function showSave() {
    const fresh = name.value.trim() || 'Nová sada';
    target.replaceChildren(el('option', { value: '', textContent: `Do nové sady „${fresh}“` }),
      ...algSets.list().map((st) => el('option', { value: st.id, textContent: `Do sady „${st.name}“` })));
    if (setId) target.value = setId;
    const showParity = !!(parity?.cases.length && parity.fix && !parity.bad);
    parityRow.hidden = !showParity;
    parityRow.querySelector('.gen-parity-label').textContent = `Přidat opravu parity ${parity?.fix ?? ''}`;
    // po zapnutí výběru případů zase jde odškrtnout celý případ (neuloží se)
    for (const x of cards) if (x.state) { x.box.disabled = false; x.box.onchange = updateSave; }
    saveBar.hidden = false;
    updateSave();
  }

  saveBtn.onclick = () => {
    const items = toSave();
    const id = target.value || algSets.add(name.value.trim() || 'Nová sada');
    const base = name.value.trim() || 'Případ';
    const count = new Map();
    for (const { x, ch } of items) {
      const k = (count.get(x) ?? 0) + 1;
      count.set(x, k);
      algs.add({
        alg: ch.display, name: `${base} ${x.i + 1}${k > 1 ? ` (${k})` : ''}`, set: id, task: { ...ctx.task, colorsA: colorsOfState(P, x.c.rep, result.constraints) }, look: ctx.look?.(),
        // šance případu z výčtu (statistika sady): podoby případu / všechny podoby kroku
        ...(result.signatures ? { share: x.c.members.length / result.signatures } : {}),
      });
    }
    const withParity = !parityRow.hidden && parityBox.checked;
    if (withParity) addParityAlg(id);
    setId = id;
    showSave();
    openBtn.hidden = false;
    const total = items.length + (withParity ? 1 : 0);
    status.textContent = `Uloženo ${total} ${total === 1 ? 'algoritmus' : total < 5 ? 'algoritmy' : 'algoritmů'} do sady „${algSets.get(id).name}“`;
    toast(`Sada „${algSets.get(id).name}“: +${total}`);
  };
  parityBox.onchange = updateSave;
  name.addEventListener('input', () => { if (!saveBar.hidden && !target.value) target.options[0].textContent = `Do nové sady „${name.value.trim() || 'Nová sada'}“`; });

  /** Hledat u případu déle: naváže na nalezená řešení. */
  async function searchMore(x) {
    if (running) return;
    running = true;
    for (const b of dlg.querySelectorAll('.gen-more')) b.disabled = true;
    countBtn.disabled = true; stopBtn.hidden = false;
    updateSave();
    live.hidden = false;
    status.textContent = `Případ ${x.i + 1} · hledám déle…`;
    const before = x.state.choices[0].display;
    const res = await attempt(x, 30000, () => `Případ ${x.i + 1}: hledám déle`);
    live.hidden = true;
    running = false;
    stopBtn.hidden = true; countBtn.disabled = false;
    applyResult(x, res);
    status.textContent = `Případ ${x.i + 1}: ${x.state.choices[0].display === before ? 'nejlepší se nezměnil' : 'nabídka aktualizovaná'}${res.optimal ? ' · pohodlnější neexistuje' : ''}`;
    renderChoices(x);
    markSeg(x);
    updateSave();
    for (const b of dlg.querySelectorAll('.gen-more')) b.disabled = false;
  }

  /** Oprava parity jako samostatný algoritmus sady (s obrázkem prvního paritního případu). */
  function addParityAlg(set) {
    if (!parity?.cases.length || !parity.fix || parity.bad) return;
    algs.add({
      alg: parity.fix,
      name: `${name.value.trim() || 'Sada'} – parita`,
      set,
      task: { ...ctx.task, colorsA: colorsOfState(P, parity.cases[0].rep, result.constraints) },
    });
  }

  stopBtn.onclick = () => { running = false; client.cancel(); resolveCurrent?.(); };
  openBtn.onclick = () => { dlg.close(); if (setId) ctx.onOpenSet(setId); };

  syncFix();
  dlg.showModal();
  return dlg;
}
