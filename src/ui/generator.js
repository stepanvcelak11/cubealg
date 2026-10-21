// Generátor sady algoritmů pro krok metody: ze zadání Labu (Start = co je hotové
// před krokem, Cíl = po něm) spočítá všechny případy (core/cases.js), pro každý
// najde algoritmus stejným hledáním jako Lab, ověří ho na všech stavech případu
// a uloží výsledky jako novou sadu v trenažéru.

import { enumerateCases, verifyCase, colorsOfState } from '../core/cases.js';
import { SearchClient } from '../search/client.js';
import { styleMetrics, rankResults, VIEWS } from '../ergonomics/style.js';
import { $, el, storage } from './dom.js';
import { NetView } from './netview.js';
import { algs, algSets } from './store.js';
import { toast } from './share.js';

const OPTS = 'ergocube.lab.generator';

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
  const time = el('input', { type: 'number', min: '2', max: '600', value: String(saved.time ?? 10), ariaLabel: 'Čas na případ (s)' });
  const view = el('select', { ariaLabel: 'Vybírat podle' }, ...Object.entries(VIEWS).map(([id, v]) => el('option', { value: id, textContent: `${v.icon} ${v.label}` })));
  view.value = saved.view ?? 'balanced';
  const opts = el('div', { className: 'gen-opts' },
    cube ? check('gen-auf', 'Slučovat natočení horní vrstvy (AUF)', saved.auf ?? true, 'Případy, které se liší jen natočením U před nebo po algoritmu, jsou jeden') : null,
    cube ? check('gen-y', 'Stejný případ z jiné strany (otočení y)', saved.y ?? false, 'Případ viděný po otočení celé kostky kolem svislé osy je stejný') : null,
    cube ? check('gen-z2', 'I vzhůru nohama (z2)', saved.z2 ?? false, 'Případ viděný po převrácení kostky je stejný (metody, kde jsou horní a spodní vrstva rovnocenné)') : null,
    cube ? check('gen-wy', 'Bílá a žlutá jsou na Startu zaměnitelné', saved.wy ?? false, 'Bílá nálepka na Startu znamená „bílá nebo žlutá“') : null,
    el('div', { className: 'grid-fields' },
      el('label', { className: 'field' }, 'Název sady', name),
      el('label', { className: 'field' }, 'Čas na případ (s)', time),
      el('label', { className: 'field' }, 'Vybírat podle', view)));
  const status = el('p', { className: 'status gen-status' });
  const list = el('div', { className: 'gen-cases' });
  const countBtn = el('button', { type: 'button', className: 'secondary', textContent: 'Spočítat případy' });
  const goBtn = el('button', { type: 'button', className: 'primary', textContent: 'Generovat', hidden: true });
  const stopBtn = el('button', { type: 'button', className: 'secondary', textContent: 'Zastavit', hidden: true });
  const openBtn = el('button', { type: 'button', className: 'secondary', textContent: 'Otevřít sadu v Trenažéru', hidden: true });
  const close = el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít', textContent: '✕' });
  const dlg = el('dialog', { className: 'help-dialog gen-dialog' },
    el('div', { className: 'gen-head' }, el('h2', { textContent: 'Generátor sady' }), close),
    el('div', { className: 'gen-body' },
      el('p', { className: 'hint', textContent: 'Krok metody podle zadání: Start = co je hotové před krokem (nevybarvené dílky můžou být jakkoli, dílek jen s částí barev = „tahle barva tady“), Cíl = co má být hotové po kroku. Tahy a ergonomie podle „Tahy a váhy“. Aplikace projde všechny stavy, které Startu odpovídají, sloučí stejné případy, pro každý najde algoritmus a ověří ho na všech jeho stavech.' }),
      opts, el('div', { className: 'row-btns gen-actions' }, countBtn, goBtn, stopBtn, openBtn), status, list));
  document.body.append(dlg);

  const client = new SearchClient();
  let result = null; // výsledek výčtu
  let cards = [];
  let running = false;
  let setId = null;
  const val = (id) => dlg.querySelector(`#${id}`)?.checked ?? false;
  const settings = () => ({ auf: cube && val('gen-auf'), y: val('gen-y'), z2: val('gen-z2'), wy: val('gen-wy') });
  const enumOpts = () => {
    const s = settings();
    return { auf: s.auf, rotations: [s.y && 'y', s.z2 && 'z2'].filter(Boolean), interchange: s.wy ? [['U', 'D']] : [] };
  };
  const remember = () => storage.set(OPTS, { ...settings(), name: name.value, time: Number(time.value), view: view.value });

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
      const todo = result.cases.filter((c) => !c.solved);
      const solved = result.cases.length - todo.length;
      status.textContent = `${result.signatures} stavů → ${todo.length} případů${solved ? ` (+ ${solved} už splněný)` : ''}`
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
      const card = el('label', { className: 'gen-card' }, el('div', { className: 'gen-card-head' }, box, el('b', { textContent: `${i + 1}.` }),
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
  const solveOne = (c, timeLimit) => new Promise((resolve) => {
    const found = new Map();
    resolveCurrent = () => resolve(found);
    client.start(ctx.job(c.rep, result.target, result.constraints, timeLimit), {
      onSolutions: (items) => { for (const it of items) found.set(`${it.pre}|${it.alg}|${it.post}`, it); },
      onDone: () => resolve(found),
      onError: () => resolve(found),
    });
  });

  goBtn.onclick = async () => {
    if (!result || running) return;
    remember();
    running = true;
    goBtn.hidden = true; countBtn.disabled = true; stopBtn.hidden = false; openBtn.hidden = true;
    for (const x of cards) x.box.disabled = true;
    const chosen = cards.filter((x) => x.box.checked);
    const per = Math.max(2, Math.min(600, Number(time.value) || 10)) * 1000;
    setId = algSets.add(name.value.trim() || 'Nová sada');
    const opts = enumOpts();
    let ok = 0, warn = 0, none = 0;
    const n0 = (all, done) => (done < all ? `Zastaveno po ${done} z ${all} · ` : '');
    for (let n = 0; n < chosen.length && running; n++) {
      const x = chosen[n];
      x.card.classList.add('busy');
      status.textContent = `Případ ${n + 1} z ${chosen.length} · hledám (${per / 1000} s)…`;
      const found = await solveOne(x.c, per);
      x.card.classList.remove('busy');
      if (!running) break;
      if (!found.size) { none++; x.out.replaceChildren(el('span', { className: 'ko', textContent: 'nenalezeno' })); continue; }
      // nejlepší podle zvoleného pohledu (hodnocení v rámci držení)
      const ranked = rankResults([...found.values()].map((it) => {
        const display = ctx.join(ctx.toHeld(it.pre), ctx.toHeld(it.alg), ctx.toHeld(it.post));
        return { it, display, m: styleMetrics(ctx.score(display), cube) };
      }), view.value, { lambda: ctx.lambda });
      const best = ranked[0];
      const modelAlg = [best.it.pre, best.it.alg, best.it.post].filter(Boolean).join(' ');
      const v = verifyCase(P, result.goal, x.c.members, modelAlg, { auf: opts.auf, rotations: opts.rotations });
      if (v.ok) ok++; else warn++;
      x.out.replaceChildren(el('code', { textContent: best.display }),
        el('span', { className: v.ok ? 'ok' : 'ko', textContent: v.ok ? `✓ ověřeno na ${x.c.members.length}` : `⚠ neřeší ${v.failed} z ${x.c.members.length}` }));
      algs.add({
        alg: best.display,
        name: `${name.value.trim() || 'Případ'} ${x.i + 1}`,
        set: setId,
        task: { ...ctx.task, colorsA: colorsOfState(P, x.c.rep, result.constraints) },
      });
    }
    running = false;
    client.cancel();
    stopBtn.hidden = true; countBtn.disabled = false; openBtn.hidden = false;
    status.textContent = `${n0(chosen.length, ok + warn + none)}Hotovo: ${ok} ověřených${warn ? `, ${warn} s upozorněním` : ''}${none ? `, ${none} bez řešení (zkus delší čas nebo víc tahů)` : ''} · uloženo do sady „${algSets.get(setId).name}“`;
    toast(`Sada „${algSets.get(setId).name}“: ${ok + warn} algoritmů`);
  };
  stopBtn.onclick = () => { running = false; client.cancel(); resolveCurrent?.(); };
  openBtn.onclick = () => { dlg.close(); if (setId) ctx.onOpenSet(setId); };

  dlg.showModal();
  return dlg;
}
