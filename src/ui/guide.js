// Průvodce metodou (na čtení): slovní popis metody po krocích s obrázky kostky
// a odkazy na sady algoritmů. Slouží k učení i ke sdílení: metodu jde i s algoritmy
// poslat jako soubor a druhý ji naimportuje. Metoda se sestavuje v sekci Metoda
// (builder.js) – „Upravit“ vede tam.

import { el } from './dom.js';
import { icon } from './icons.js';
import { methods, guides, algSets, algs, exportMethod } from './store.js';
import { labModel } from './models.js';
import { Cube3D } from './cube3d.js';
import { NetView } from './netview.js';
import { holdFor } from './holds.js';
import { downloadLearning } from './learnexport.js';
import { stepParts, partsBefore, partsCube, describeParts } from './parts.js';

let dialog = null;
let deps = { labTask: () => null, train: () => {}, practice: null, simulate: null, build: null };

/** Text s odstavci (prázdný řádek) a zalomeními – bez HTML (data můžou být cizí). */
function richText(text) {
  return el('div', { className: 'guide-text' }, ...String(text).split(/\n\s*\n/).filter((p) => p.trim()).map((para) => {
    const p = el('p');
    para.split('\n').forEach((line, i) => { if (i) p.append(el('br')); p.append(line); });
    return p;
  }));
}

/** Obrázek strany zadání (A = před, B = po). */
function taskView(task, side, label) {
  const host = el('div', { className: 'guide-cube' });
  try {
    const model = labModel(task.puzzle ?? '333');
    const data = model.deserialize(side === 'A' ? task.colorsA : task.colorsB);
    if (!data) return null;
    const stickers = model.stickers(data, task.constraints ?? {}, side === 'B' ? task.marks : undefined);
    queueMicrotask(() => {
      const v = model.view;
      const view = v.type === 'cube3d'
        ? new Cube3D(host, { label, facelets: v.facelets, scale: v.scale })
        : new NetView(host, { label, viewBox: v.viewBox, polys: v.polys });
      view.setHold?.(task.hold ?? '');
      view.render(stickers);
    });
  } catch { return null; }
  return el('figure', { className: 'guide-fig' }, host, el('figcaption', { textContent: label }));
}

export function illustration(task) {
  if (!task) return null;
  const a = taskView(task, 'A', 'před'), b = taskView(task, 'B', 'po');
  return el('div', { className: 'guide-figs' }, a, el('span', { className: 'guide-arrow', textContent: '→' }), b);
}

/**
 * Ukázka algoritmu kroku: kostka ve stavu „před“ a přehrání tah po tahu.
 * Algoritmus je zapsaný v držení kroku (task.hold), pohled i tahy modelu se převedou.
 */
export function examplePlayer(task) {
  if (!task?.alg) return null;
  let model, start, steps, shown;
  try {
    model = labModel(task.puzzle ?? '333');
    const side = model.deserialize(task.colorsA);
    const sideB = model.deserialize(task.colorsB);
    const built = side && sideB ? model.buildTask(side, sideB, task.constraints ?? {}, task.marks) : side ? model.build(side, task.constraints ?? {}) : null;
    start = built?.loc;
    if (built?.constraints) task = { ...task, constraints: built.constraints };
    if (!start) return null;
    shown = model.steps(task.alg);
    steps = task.hold ? holdFor(model, task.hold).toModel(shown) : shown;
  } catch { return null; }
  const host = el('div', { className: 'guide-cube guide-player-cube' });
  const moves = el('div', { className: 'moves guide-moves' });
  const play = el('button', { type: 'button', className: 'secondary small' });
  const reset = Object.assign(el('button', { type: 'button', className: 'icon-btn', title: 'Znovu od začátku', ariaLabel: 'Znovu od začátku' }),
    { innerHTML: icon('first', { size: 18 }) });
  let view, loc = start, at = 0, playing = false;
  const draw = () => {
    view.render(model.stateStickers(loc, task.constraints ?? {}));
    moves.replaceChildren(...shown.map((m, i) => el('span', { className: `mv${i === at - 1 ? ' current' : ''}`, textContent: model.stepToString(m) })));
    play.innerHTML = `${icon(playing ? 'pause' : 'play', { size: 16 })}<span>${playing ? 'Pauza' : at >= steps.length ? 'Přehrát znovu' : 'Přehrát'}</span>`;
  };
  const toStart = () => { loc = start; at = 0; draw(); };
  play.onclick = async () => {
    if (playing) { playing = false; draw(); return; }
    if (at >= steps.length) { toStart(); await new Promise((r) => setTimeout(r, 300)); }
    playing = true;
    while (playing && at < steps.length) {
      draw();
      await (view.animate ? view.animate(steps[at]) : Promise.resolve());
      loc = model.applySteps(loc, [steps[at]]);
      at += 1;
      draw();
      await new Promise((r) => setTimeout(r, 120));
    }
    playing = false;
    draw();
  };
  reset.onclick = () => { playing = false; toStart(); };
  queueMicrotask(() => {
    const v = model.view;
    view = v.type === 'cube3d'
      ? new Cube3D(host, { label: 'Ukázka algoritmu', facelets: v.facelets, scale: v.scale })
      : new NetView(host, { label: 'Ukázka algoritmu', viewBox: v.viewBox, polys: v.polys });
    view.setHold?.(task.hold ?? '');
    draw();
  });
  return el('div', { className: 'guide-player' },
    el('div', { className: 'guide-player-head' }, el('b', { textContent: 'Ukázka' }), reset, play),
    host, moves);
}

function render() {
  const body = dialog.querySelector('.guide-body');
  const top = body.scrollTop;
  draw();
  body.scrollTop = top;
}

function draw() {
  const method = methods.active();
  const name = methods.get(method).name;
  const guide = guides.get(method);
  const body = dialog.querySelector('.guide-body');
  dialog.querySelector('.guide-title').textContent = name;

  const empty = !guide.intro.trim() && !guide.steps.length;
  body.replaceChildren(...[
    empty ? el('div', { className: 'guide-empty' },
      el('p', { textContent: 'Tady můžeš popsat, jak metoda funguje: úvod a kroky, ke každému kroku obrázek kostky z Labu a sadu algoritmů.' }),
      el('p', { className: 'hint', textContent: 'Klepni na „Upravit“ – metodu sestavíš krok po kroku v sekci Metoda. Hotovou metodu pošleš i s algoritmy přes „Sdílet“ – druhý ji naimportuje ve výběru metody.' })) : null,
    guide.intro.trim() ? richText(guide.intro) : null,
    ...guide.steps.map((st, i) => {
      const set = st.set && algSets.list(method).find((x) => x.id === st.set);
      return el('section', { className: 'guide-step' },
        el('h3', {}, el('span', { className: 'guide-n', textContent: String(i + 1) }), st.title || `Krok ${i + 1}`),
        st.text?.trim() ? richText(st.text) : null,
        illustration(st.task),
        !st.task && Object.keys(stepParts(st)).length ? el('figure', { className: 'guide-fig guide-parts' },
          partsCube(partsBefore(guide.steps, st.id), stepParts(st), guide.frame, `Po kroku ${i + 1}`),
          el('figcaption', { textContent: `po kroku: ${describeParts(stepParts(st))}` })) : null,
        examplePlayer(st.task),
        deps.practice ? el('div', { className: 'guide-set guide-practice-row' },
          el('span', { textContent: i ? 'Nácvik v timeru – předchozí kroky budou složené' : 'Nácvik v timeru od zamíchané kostky' }),
          Object.assign(el('button', { type: 'button', className: 'secondary small guide-practice' }), {
            innerHTML: `${icon('timer', { size: 16 })}<span>Nacvičit</span>`,
            onclick: () => { dialog.close(); deps.practice(st.id); },
          })) : null,
        set ? el('div', { className: 'guide-set' },
          el('span', { textContent: `Algoritmy: ${set.name} (${algs.inSet(set.id).length})` }),
          Object.assign(el('button', { type: 'button', className: 'secondary small' }), {
            innerHTML: `${icon('trainer', { size: 16 })}<span>Trénovat</span>`,
            onclick: () => { dialog.close(); deps.train(set.id); },
          })) : null);
    })].filter(Boolean));
}

/** Pošle (nebo stáhne) aktivní metodu i s algoritmy jako soubor. */
export async function shareMethod() {
  const data = exportMethod();
  const name = `metoda-${data.method.name.normalize('NFD').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase()}.json`;
  const file = new File([JSON.stringify(data, null, 1)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `Metoda ${data.method.name}` }); return; } catch { /* zrušeno */ }
  }
  const a = el('a', { href: URL.createObjectURL(file), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Otevře průvodce aktivní metodou (edit: rovnou v úpravách). */
export function openGuide(opts = {}) {
  const { edit = false, ...rest } = opts;
  deps = { ...deps, ...rest };
  if (edit && deps.build) { dialog?.close(); deps.build(); return; }
  if (!dialog) {
    const close = Object.assign(el('button', { type: 'button', className: 'icon-btn guide-close', ariaLabel: 'Zavřít' }), { innerHTML: icon('close', { size: 20 }) });
    const edit = Object.assign(el('button', { type: 'button', className: 'secondary small guide-edit', title: 'Metodu sestavuješ krok po kroku v sekci Metoda' }),
      { innerHTML: `${icon('edit', { size: 18 })}<span>Upravit</span>` });
    const shareBtn = Object.assign(el('button', { type: 'button', className: 'secondary small guide-share', title: 'Poslat metodu i s algoritmy jako soubor' }),
      { innerHTML: `${icon('share', { size: 16 })}<span>Sdílet</span>` });
    const simBtn = Object.assign(el('button', { type: 'button', className: 'secondary small guide-sim', title: 'Složit náhodná zamíchání krok po kroku podle metody a spočítat tahy a náročnost' }),
      { innerHTML: `${icon('stats', { size: 16 })}<span>Otestovat</span>` });
    const learnBtn = Object.assign(el('button', { type: 'button', className: 'secondary small guide-learn', title: 'Celá metoda v jednom souboru k učení: kroky s obrázky, algoritmy s případy a tvými časy, nastavení ze simulátoru (jde vytisknout i znovu importovat)' }),
      { innerHTML: `${icon('download', { size: 16 })}<span>Učebnice</span>`, onclick: () => downloadLearning() });
    const printBtn = Object.assign(el('button', { type: 'button', className: 'icon-btn guide-print', title: 'Vytisknout nebo uložit jako PDF', ariaLabel: 'Vytisknout nebo uložit jako PDF' }),
      { innerHTML: icon('print', { size: 20 }) });
    dialog = el('dialog', { className: 'help-dialog guide-dialog' },
      el('div', { className: 'guide-head' },
        el('div', {}, el('small', { className: 'hint', textContent: 'Průvodce metodou' }), el('h2', { className: 'guide-title' })),
        edit, simBtn, learnBtn, shareBtn, printBtn, close),
      el('div', { className: 'guide-body' }));
    close.onclick = () => dialog.close();
    edit.onclick = () => { dialog.close(); deps.build?.(); };
    shareBtn.onclick = shareMethod;
    simBtn.onclick = () => { dialog.close(); deps.simulate?.(); };
    printBtn.onclick = () => {
      document.body.classList.add('printing-guide');
      // 3D kostky potřebují chvilku na vykreslení
      setTimeout(() => { window.print(); document.body.classList.remove('printing-guide'); }, 150);
    };
    document.body.append(dialog);
  }
  render();
  dialog.showModal();
}
