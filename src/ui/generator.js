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

const OPTS = 'ergocube.lab.generator';
// paměť hledání po případech: nejlepší algoritmy a prohledané délky (příště se navazuje,
// u dokázaně nejpohodlnějších se už nehledá)
const MEMORY = 'ergocube.gen.memory';
const MEMORY_MAX = 400;
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
      el('label', { className: 'field' }, 'Vybírat podle', view)));
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
  const remember = () => storage.set(OPTS, { ...settings(), fix: fix.value, name: name.value, time: Number(time.value), view: view.value });

  close.onclick = () => dlg.close();
  dlg.addEventListener('close', () => { running = false; client.cancel(); resolveCurrent?.(); dlg.remove(); });

  countBtn.onclick = () => {
    remember();
    saveBar.hidden = true; openBtn.hidden = true; setId = null;
    status.textContent = 'Počítám případy…';
    list.replaceChildren();
    goBtn.hidden = true;
    setTimeout(() => {
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
    }, 30);
  };

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
      onError: () => resolve({ found, optimal: false }),
    });
  });
  const learned = []; // algoritmy nalezené v tomto běhu – knihovna pro další případy
  const modelAlg = (it) => [it.pre, it.alg, it.post].filter(Boolean).join(' ');

  /** Nabídka u případu z nalezených řešení (seřazená podle zvoleného pohledu). */
  const choicesOf = (x, found) => pickChoices(rankResults([...found.values()].map((it) => {
    const display = ctx.join(ctx.toHeld(it.pre), ctx.toHeld(it.alg), ctx.toHeld(it.post));
    return { it, display, m: styleMetrics(ctx.score(display), cube) };
  }), view.value, { lambda: ctx.lambda }), x.c.members, enumOpts());

  goBtn.onclick = async () => {
    if (!result || running) return;
    remember();
    running = true;
    goBtn.hidden = true; countBtn.disabled = true; stopBtn.hidden = false; openBtn.hidden = true; saveBar.hidden = true;
    for (const x of cards) x.box.disabled = true;
    const chosen = cards.filter((x) => x.box.checked);
    // čas: zadaný čas na případ je průměr; případ, u kterého je nejpohodlnější
    // dokázané dřív, skončí a ušetřený čas dostanou těžší případy (nejvýš 3× průměr, max. minuta)
    const per = Math.max(2, Math.min(600, Number(time.value) || 10)) * 1000;
    const cap = Math.max(per, Math.min(60000, per * 3));
    let budget = per * chosen.length;
    setId = null;
    let ok = 0, warn = 0, none = 0, proven = 0;
    const n0 = (all, done) => (done < all ? `Zastaveno po ${done} z ${all} · ` : '');
    const segs = chosen.map((x) => Object.assign(el('button', { type: 'button', className: 'gen-seg', role: 'listitem', title: `Případ ${x.i + 1}`, ariaLabel: `Případ ${x.i + 1}` }), {
      onclick: () => x.card.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    }));
    timeline.replaceChildren(...segs);
    timeline.hidden = false;
    live.hidden = false;
    const t0 = performance.now();
    for (let n = 0; n < chosen.length && running; n++) {
      const x = chosen[n];
      x.seg = segs[n];
      const casesLeft = chosen.length - n;
      const limit = Math.round(Math.min(cap, Math.max(2000, (budget / casesLeft) * 1.5)));
      x.card.classList.add('busy');
      segs[n].classList.add('busy');
      x.card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      status.textContent = `Případ ${n + 1} z ${chosen.length} · hledám…`;
      const start = performance.now();
      let count = 0;
      const tick = () => {
        const el2 = performance.now() - start;
        bar.style.width = `${Math.min(100, (el2 / limit) * 100)}%`;
        const left = Math.max(0, budget - el2);
        live.lastChild.textContent = `${(el2 / 1000).toFixed(1)} / ${Math.round(limit / 1000)} s · nalezeno ${count} řešení · celkem ${fmtTime(performance.now() - t0)}, zbývá nejvýš ${fmtTime(left)}`;
      };
      tick();
      const timer = setInterval(tick, 200);
      const { found, optimal, cached } = await solveOne(x.c, limit, (f) => {
        count = f.size;
        x.out.replaceChildren(el('span', { className: 'gen-searching', textContent: `hledám… ${count} řešení` }));
      });
      clearInterval(timer);
      budget = Math.max(0, budget - (performance.now() - start));
      x.card.classList.remove('busy');
      segs[n].classList.remove('busy');
      if (!running) break;
      if (!found.size) { none++; segs[n].classList.add('none'); x.out.replaceChildren(el('span', { className: 'ko', textContent: 'nenalezeno' })); continue; }
      const choices = choicesOf(x, found);
      if (choices[0].v.ok) ok++; else warn++;
      if (optimal) proven++;
      segs[n].classList.add(choices[0].v.ok ? 'ok' : 'warn');
      if (choices[0].v.ok) learned.push(modelAlg(choices[0].it));
      // k uložení: nabídnutý (nejlepší), když řeší celý případ
      x.state = { found, choices, keep: new Set(choices[0].v.ok ? [choices[0].display] : []), optimal, cached };
      renderChoices(x);
      updateSave();
    }
    live.hidden = true;
    running = false;
    for (const b of dlg.querySelectorAll('.gen-more')) b.disabled = false;
    client.cancel();
    stopBtn.hidden = true; countBtn.disabled = false;
    status.textContent = `${n0(chosen.length, ok + warn + none)}Hotovo: ${ok} ověřených${proven ? ` (${proven} dokázaně nejpohodlnějších)` : ''}${warn ? `, ${warn} s upozorněním` : ''}${none ? `, ${none} bez řešení (zkus delší čas nebo víc tahů)` : ''} · vyber, co uložit`;
    showSave();
  };
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
      algs.add({ alg: ch.display, name: `${base} ${x.i + 1}${k > 1 ? ` (${k})` : ''}`, set: id, task: { ...ctx.task, colorsA: colorsOfState(P, x.c.rep, result.constraints) } });
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
    x.card.classList.add('busy');
    x.seg?.classList.add('busy');
    live.hidden = false;
    const limit = 30000, start = performance.now();
    const timer = setInterval(() => {
      const t = performance.now() - start;
      bar.style.width = `${Math.min(100, (t / limit) * 100)}%`;
      live.lastChild.textContent = `Případ ${x.i + 1}: hledám déle · ${(t / 1000).toFixed(1)} / 30 s · ${x.state.found.size} řešení`;
    }, 200);
    status.textContent = `Případ ${x.i + 1} · hledám déle…`;
    const seeds = x.state.choices.map((ch) => ({ alg: ch.it.alg, pre: ch.it.pre, post: ch.it.post }));
    const { found, optimal } = await solveOne(x.c, limit, null, { seeds, found: x.state.found });
    clearInterval(timer);
    x.card.classList.remove('busy');
    x.seg?.classList.remove('busy');
    live.hidden = true;
    running = false;
    stopBtn.hidden = true; countBtn.disabled = false;
    const choices = choicesOf(x, found);
    const before = x.state.choices[0].display;
    // vybrané zůstanou vybrané (i když z nabídky vypadly); nový nejlepší se přidá, jen když
    // byl k uložení vybraný dosavadní nejlepší
    const keep = new Set(x.state.keep);
    if (choices[0].display !== before && keep.has(before) && choices[0].v.ok) { keep.delete(before); keep.add(choices[0].display); }
    const lost = x.state.choices.filter((ch) => keep.has(ch.display) && !choices.some((c2) => c2.display === ch.display));
    x.state = { ...x.state, found, choices: [...choices, ...lost], keep, optimal, cached: false };
    status.textContent = `Případ ${x.i + 1}: ${choices[0].display === before ? 'nejlepší se nezměnil' : 'nabídka aktualizovaná'}${optimal ? ' · pohodlnější neexistuje' : ''}`;
    renderChoices(x);
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
