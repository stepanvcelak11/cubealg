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
  const close = el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít', textContent: '✕' });
  const dlg = el('dialog', { className: 'help-dialog gen-dialog' },
    el('div', { className: 'gen-head' }, el('h2', { textContent: 'Generátor sady' }), close),
    el('div', { className: 'gen-body' },
      el('p', { className: 'hint', textContent: 'Krok metody podle zadání: Start = co je hotové před krokem (nevybarvené dílky můžou být jakkoli, dílek jen s částí barev = „tahle barva tady“), Cíl = co má být hotové po kroku. Tahy a ergonomie podle „Tahy a váhy“. Aplikace projde všechny stavy, které Startu odpovídají, sloučí stejné případy, pro každý najde algoritmus a ověří ho na všech jeho stavech. Hledání zkouší i tvoje uložené algoritmy a ty, které už v tomto běhu našlo.' }),
      opts, el('div', { className: 'row-btns gen-actions' }, countBtn, goBtn, stopBtn, openBtn), el('div', { className: 'gen-progress' }, status, timeline, live), list));
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
  const solveOne = (c, timeLimit, onFound, { seeds = [], found = new Map() } = {}) => new Promise((resolve) => {
    resolveCurrent = () => resolve({ found, optimal: false });
    client.start(ctx.job(c.rep, result.target, result.constraints, timeLimit, { seeds, library: [...ctx.library(), ...learned] }), {
      onSolutions: (items) => { for (const it of items) found.set(`${it.pre}|${it.alg}|${it.post}`, it); onFound?.(found); },
      onDone: (d) => resolve({ found, optimal: !!d.speedOptimal }),
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
    goBtn.hidden = true; countBtn.disabled = true; stopBtn.hidden = false; openBtn.hidden = true;
    for (const x of cards) x.box.disabled = true;
    const chosen = cards.filter((x) => x.box.checked);
    // čas: zadaný čas na případ je průměr; případ, u kterého je nejpohodlnější
    // dokázané dřív, skončí a ušetřený čas dostanou těžší případy (nejvýš 3× průměr, max. minuta)
    const per = Math.max(2, Math.min(600, Number(time.value) || 10)) * 1000;
    const cap = Math.max(per, Math.min(60000, per * 3));
    let budget = per * chosen.length;
    setId = algSets.add(name.value.trim() || 'Nová sada');
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
      const { found, optimal } = await solveOne(x.c, limit, (f) => {
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
      const id = algs.add({
        alg: choices[0].display,
        name: `${name.value.trim() || 'Případ'} ${x.i + 1}`,
        set: setId,
        task: { ...ctx.task, colorsA: colorsOfState(P, x.c.rep, result.constraints) },
      });
      if (choices[0].v.ok) learned.push(modelAlg(choices[0].it));
      x.state = { found, choices, sel: 0, id, optimal };
      renderChoices(x);
    }
    addParityAlg();
    live.hidden = true;
    running = false;
    for (const b of dlg.querySelectorAll('.gen-more')) b.disabled = false;
    client.cancel();
    stopBtn.hidden = true; countBtn.disabled = false; openBtn.hidden = false;
    status.textContent = `${n0(chosen.length, ok + warn + none)}Hotovo: ${ok} ověřených${proven ? ` (${proven} dokázaně nejpohodlnějších)` : ''}${warn ? `, ${warn} s upozorněním` : ''}${none ? `, ${none} bez řešení (zkus delší čas nebo víc tahů)` : ''} · uloženo do sady „${algSets.get(setId).name}“`;
    toast(`Sada „${algSets.get(setId).name}“: ${ok + warn} algoritmů`);
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
    for (const r of [...pool, ...checked]) {
      if (out.length >= CHOICES) break;
      if (!out.includes(r)) out.push(r);
    }
    return out.map((r) => ({ ...r, best: tops.get(r) ?? [] }));
  }

  /** Nalezené algoritmy u případu: vybraný se uloží do sady, kliknutím se vybere jiný. */
  function renderChoices(x) {
    const { choices, sel, id, optimal } = x.state;
    const n = x.c.members.length;
    const c = choices[sel];
    const more = el('button', { type: 'button', className: 'chip gen-more', textContent: 'Hledat déle (+30 s)', disabled: running, title: 'Naváže na nalezená řešení a hledá dál' });
    more.onclick = () => searchMore(x);
    x.out.replaceChildren(
      el('span', { className: c.v.ok ? 'ok' : 'ko', textContent: c.v.ok ? `✓ ověřeno na ${n}` : `⚠ neřeší ${c.v.failed} z ${n}` }),
      optimal ? el('span', { className: 'gen-proof', title: 'Prohledány všechny délky, do kterých by se pohodlnější algoritmus s povolenými tahy vešel', textContent: '✓ pohodlnější neexistuje' }) : null,
      el('div', { className: 'gen-choices', role: 'radiogroup', ariaLabel: `Algoritmy pro případ ${x.i + 1}` },
        ...choices.map((ch, k) => {
          const m = ch.m;
          const grips = m.regrips + m.rotations;
          return Object.assign(el('button', {
            type: 'button', className: `gen-choice${k === sel ? ' on' : ''}${ch.v.ok ? '' : ' bad'}`,
            role: 'radio', ariaChecked: String(k === sel),
            title: ch.v.ok ? 'Kliknutím uložit tento algoritmus' : `Neřeší ${ch.v.failed} z ${n} stavů případu`,
          },
          ch.best.length ? el('span', { className: 'gen-badges' }, ...ch.best.map((v) => el('span', { className: `gen-badge view-${v}`, textContent: `${VIEWS[v].icon} ${VIEWS[v].label}` }))) : null,
          el('code', { textContent: ch.display }),
          el('small', { textContent: `${m.length} tahů · ${grips ? `${grips}× přehmat` : 'bez přehmatů'} · náročnost ${m.total.toFixed(1)}` })), {
            onclick: () => {
              if (k === x.state.sel) return;
              // tvoje volba proti nabídnutému: podle ní se dá doladit hodnocení (Tahy a váhy → Kalibrovat)
              recordPreference(ctx.task.puzzle, ch.display, choices[x.state.sel].display);
              algs.update(id, { alg: ch.display });
              x.state.sel = k;
              renderChoices(x);
            },
          });
        })),
      more);
  }

  /** Hledat u případu déle: naváže na nalezená řešení. */
  async function searchMore(x) {
    if (running) return;
    running = true;
    for (const b of dlg.querySelectorAll('.gen-more')) b.disabled = true;
    countBtn.disabled = true; stopBtn.hidden = false; openBtn.hidden = true;
    x.card.classList.add('busy');
    x.seg?.classList.add('busy');
    live.hidden = false;
    const limit = 30000, start = performance.now();
    const prev = x.state.choices[x.state.sel].display;
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
    stopBtn.hidden = true; countBtn.disabled = false; openBtn.hidden = false;
    const choices = choicesOf(x, found);
    // vybraný zůstane vybraný, když je pořád v nabídce
    const keep = choices.findIndex((ch) => ch.display === prev);
    x.state = { ...x.state, found, choices, optimal, sel: keep >= 0 && prev !== x.state.choices[0].display ? keep : 0 };
    algs.update(x.state.id, { alg: choices[x.state.sel].display });
    status.textContent = `Případ ${x.i + 1}: ${choices[0].display === x.state.choices[0]?.display && keep === 0 ? 'nejlepší se nezměnil' : 'nabídka aktualizovaná'}${optimal ? ' · pohodlnější neexistuje' : ''}`;
    renderChoices(x);
    for (const b of dlg.querySelectorAll('.gen-more')) b.disabled = false;
  }

  /** Oprava parity jako samostatný algoritmus sady (s obrázkem prvního paritního případu). */
  function addParityAlg() {
    if (!parity?.cases.length || !parity.fix || parity.bad) return;
    algs.add({
      alg: parity.fix,
      name: `${name.value.trim() || 'Sada'} – parita`,
      set: setId,
      task: { ...ctx.task, colorsA: colorsOfState(P, parity.cases[0].rep, result.constraints) },
    });
  }

  stopBtn.onclick = () => { running = false; client.cancel(); resolveCurrent?.(); };
  openBtn.onclick = () => { dlg.close(); if (setId) ctx.onOpenSet(setId); };

  syncFix();
  dlg.showModal();
  return dlg;
}
