// Učebnice metody: celá metoda v jednom HTML souboru k učení – úvod, držení, kroky
// s obrázkem dílků, nastavení kroků ze simulátoru (volnosti, tahy…), výsledky
// poslední simulace a všechny algoritmy sad s obrázkem případu, tvými časy
// a políčkem „umím“ k odškrtávání. Soubor jde vytisknout (PDF) a obsahuje i data
// metody, takže ho aplikace umí rovnou importovat (Metoda → Importovat metodu).

import { FACELETS, SLOTS, SLOT_OF } from '../core/geometry.js';
import { holdOf, holdFromFaces } from '../core/hold.js';
import { methods, guides, algSets, algs, exportMethod } from './store.js';
import { storage } from './dom.js';
import { labModel } from './models.js';
import { stepParts, partsBefore, describeParts, frameMap, validFrame, DEFAULT_FRAME, COLOR_NAME } from './parts.js';
import { FREEDOM, STEP_MOVES, ADJUST, COLORS } from '../sim/plan.js';
import { VIEWS } from '../ergonomics/style.js';
import { stepConfig, solveByOf } from './stepcfg.js';
import { describeRule } from '../core/rules.js';
import { ruleNetSvg } from './ruleeditor.js';
import { cellsNetSvg, cellLooks, cellsBefore, freshCells } from './celleditor.js';
import { netSvg } from './netsvg.js';
import { teachStep, notationOf, exampleSolve } from './teach.js';
import { KNOWN_SETS } from '../sim/knownsets.js';

const HEX = { U: '#fafaf7', R: '#e5383b', F: '#22b455', D: '#ffd60a', L: '#ff8a1f', B: '#2f6bff' };
const GREY = '#8a8f9c';
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '–');
/** Barva smíchaná s bílou (t = 0 beze změny, 1 bílá). */
const pale = (hex, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + 255 * t).toString(16).padStart(2, '0')).join('');
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Kostka v izometrickém pohledu (horní, přední a pravá stěna) jako SVG.
 * @param {{color: string, pale?: number}[]} stickers podle pozice nálepky (color = stěna nebo null = šedá, pale = zesvětlení)
 * @param {string} hold držení (pohled jako při skládání)
 */
export function cubeSvg(stickers, hold = '', size = 120) {
  const [c1, c2, c3] = holdOf(hold).linear();
  const view = (v) => { const css = [v[0], -v[1], v[2]]; return [dot(c1, css), dot(c2, css), dot(c3, css)]; };
  const proj = ([x, y, z]) => [(x - z) * 0.866, y + (x + z) * 0.5];
  const polys = [];
  for (const f of FACELETS) {
    const n = view(f.normal);
    if (!(n[1] < -0.5 || n[2] > 0.5 || n[0] > 0.5)) continue;
    const c = view(f.pos.map((p, i) => p + f.normal[i] * 0.5));
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].filter((a) => Math.abs(dot(a, n)) < 0.5);
    const corner = (s, t) => proj(c.map((v, i) => v + 0.46 * (s * axes[0][i] + t * axes[1][i])));
    const pts = [corner(1, 1), corner(1, -1), corner(-1, -1), corner(-1, 1)].map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' ');
    const st = stickers[f.index] ?? {};
    const fill = pale(st.color && HEX[st.color] ? HEX[st.color] : GREY, st.pale ?? 0);
    polys.push(`<polygon points="${pts}" fill="${fill}" stroke="#14151c" stroke-width="0.06" stroke-linejoin="round"/>`);
  }
  return `<svg viewBox="-2.75 -2.9 5.5 5.8" width="${size}" height="${Math.round(size * 1.05)}" role="img"><polygon points="0,-2.85 2.6,-1.35 2.6,1.65 0,3.15 -2.6,1.65 -2.6,-1.35" fill="#14151c"/>${polys.join('')}</svg>`;
}

/** Obrázek kroku: nové dílky barevně, hotové z dřívějška bledě, ostatní šedě. */
function stepSvg(before, now, hold) {
  const stickers = FACELETS.map((f) => {
    const piece = SLOTS[SLOT_OF[f.index]];
    if (piece.type === 'center') return { color: f.face };
    const name = piece.name;
    if (now[name] && before[name] !== now[name]) return { color: now[name] === 'orientation' && f.face !== 'U' && f.face !== 'D' ? null : f.face };
    if (before[name]) return { color: f.face, style: 'faint' };
    return { color: null };
  });
  // rozložená kostka (všech 6 stran) – z pohledu na tři strany nejde případ poznat
  return netSvg(stickers, hold, 150);
}

/** Obrázek případu algoritmu (výchozí stav zadání z Labu). */
function caseSvg(task) {
  try {
    if ((task?.puzzle ?? '333') !== '333') return '';
    const model = labModel('333');
    const side = model.deserialize(task.colorsA);
    if (!side) return '';
    const st = model.stickers(side, task.constraints ?? {});
    return netSvg(st.map((x) => ({ color: x.style === 'none' || x.style === 'faded' ? null : x.color })), task.hold ?? '', 132);
  } catch { return ''; }
}

const freeText = (cfg) => {
  if (!cfg?.free || cfg.free === 'fixed') return 'pevně';
  if (cfg.free === 'colors') {
    const list = (xs) => xs.map((x) => COLORS[x]).join(' / ');
    return `dole ${cfg.downs?.length ? list(cfg.downs) : 'jako v průvodci'}${cfg.fronts?.length ? `, vpředu ${list(cfg.fronts)}` : ''}`;
  }
  return FREEDOM[cfg.free]?.label.toLowerCase() ?? cfg.free;
};

/** Barva středu v 1. pádě rodu mužského (bílý, žlutý…). */
const centerName = (face) => COLOR_NAME[face].replace(/á$/, 'ý');
const KIND_LABEL = { intuitive: 'intuitivně', generate: 'algoritmy', own: 'algoritmy', known: 'známé algoritmy', fixed: 'jen někdy' };
const list = (items) => (items.length ? `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '');

/** HTML učebnice metody. */
export function learningHtml(method = methods.active()) {
  const name = methods.get(method).name;
  const guide = guides.get(method);
  const frame = validFrame(guide.frame) ? guide.frame : DEFAULT_FRAME;
  const map = frameMap(frame);
  const hold = holdFromFaces(map.U, map.F);
  const sim = Object.fromEntries(guide.steps.map((st) => [st.id, stepConfig(method, st)]));
  const last = (storage.get('ergocube.sim.history') ?? []).find((h) => h.method === method && h.steps?.length);
  const sets = new Map(algSets.list(method).map((s) => [s.id, s]));
  const setAlgs = (id) => algs.list().filter((a) => (a.set ?? 'default') === id);
  const time = (a) => {
    const ts = (a.times ?? []).map((t) => t.t).filter(Number.isFinite);
    if (!ts.length) return '';
    const recent = ts.slice(-5);
    return `nejlepší ${fmt(Math.min(...ts) / 1000, 2)} s · posledních ${recent.length}: ${fmt(recent.reduce((x, y) => x + y, 0) / recent.length / 1000, 2)} s`;
  };
  const teach = guide.steps.map((st, i) => teachStep(method, guide, i));
  const used = new Set();
  const steps = guide.steps.map((st, i) => {
    const t = teach[i];
    const before = partsBefore(guide.steps, st.id);
    const now = stepParts(st);
    const cfg = sim[st.id];
    const solveBy = solveByOf(cfg, st);
    const res = last?.steps.find((x) => x.id === st.id);
    // známá sada (OLL, PLL…): algoritmy se nevypisují, jen „použij OLL algoritmy“
    const known = solveBy === 'known' ? KNOWN_SETS[cfg.knownSet] : null;
    const set = !known && st.set ? sets.get(st.set) : null;
    if (set) used.add(set.id);
    const algList = set ? setAlgs(set.id) : [];
    const cellsPrev = cellsBefore(guide.steps, i);
    const hasCells = st.cells && Object.keys(st.cells).length;
    const pics = hasCells ? `<div class="nets"><figure>${cellsNetSvg(cellLooks({}, cellsPrev), frame, { size: 190 })}<figcaption>před krokem</figcaption></figure><span class="arrow">→</span><figure>${cellsNetSvg(cellLooks(freshCells(st.cells, cellsPrev), cellsPrev), frame, { size: 190 })}<figcaption>po kroku (nové s rámečkem)</figcaption></figure></div>`
      : Object.keys(now).length ? `<figure>${stepSvg(before, now, hold)}<figcaption>${esc(describeParts(now))}</figcaption></figure>` : '';
    const settings = cfg ? [
      ['Volnost', freeText(cfg)],
      ['Tahy', cfg.moves === 'custom' ? `<${(cfg.custom ?? []).join(', ')}>` : STEP_MOVES[cfg.moves]?.label],
      ['Vybírat podle', VIEWS[cfg.view]?.label],
      algList.length || known ? ['Natočení vrstev', ADJUST[cfg.adjust]] : null,
      cfg.helpers ? ['Pomocné algoritmy', cfg.helpers] : null,
    ].filter((x) => x && x[1]) : [];
    return `<section class="step" id="krok-${i + 1}">
  <div class="step-head"><span class="n">${i + 1}</span><h2>${esc(st.title || `Krok ${i + 1}`)}</h2><span class="chip">${esc(solveBy === 'fixed' ? t.title : `${t.title} · ${KIND_LABEL[solveBy] ?? ''}`)}</span>${res ? `<span class="pill">${fmt(res.moves)} tahů v průměru</span>` : ''}</div>
  <p class="lead">${esc(t.text)}</p>
  ${pics}
  <div class="cols">
    ${t.changes.length ? `<div><h3>Co se na kostce změní</h3>${list(t.changes)}</div>` : ''}
    <div><h3>Jak na to</h3>${list(t.how)}${t.keep ? `<p class="keep">${esc(t.keep)}</p>` : ''}</div>
  </div>
  ${st.text ? `<div class="note"><b>Poznámka autora</b>${String(st.text).split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>` : ''}
  ${st.task?.alg ? `<p>Ukázka: <code>${esc(st.task.alg)}</code></p>` : ''}
  ${st.rules?.length ? `<ul class="rules">${st.rules.map((r) => `<li>${ruleNetSvg(r, frame, 96)}<span>${esc(describeRule(r, map))}</span></li>`).join('')}</ul>` : ''}
  ${settings.length ? `<details class="tech"><summary>Nastavení kroku pro test</summary><dl>${settings.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details>` : ''}
  ${known ? `<p class="known"><b>Algoritmy:</b> ${esc(known.text)}</p>` : ''}
  ${algList.length ? algTable(set.name, algList, time) : ''}
</section>`;
  });
  // sady, které žádný krok nepoužívá
  const rest = [...sets.values()].filter((s) => !used.has(s.id) && setAlgs(s.id).length)
    .map((s) => `<section class="step">${algTable(s.name, setAlgs(s.id), time)}</section>`);
  const total = algs.list().filter((a) => sets.has(a.set ?? 'default')).length;
  const data = JSON.stringify(exportMethod(method)).replace(/</g, '\\u003c');
  const notation = notationOf(method, guide);
  const example = exampleSolve(method, guide);
  const algSteps = guide.steps.filter((st) => ['generate', 'own', 'known'].includes(solveByOf(sim[st.id], st)));
  const intuitive = guide.steps.filter((st) => solveByOf(sim[st.id], st) === 'intuitive');
  return `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} – učebnice metody</title>
<style>
:root { --ink: #14151c; --muted: #5d6170; --line: #e3e4ea; --soft: #f4f4f8; --accent: #4b4bff; }
* { box-sizing: border-box; }
body { margin: 0 auto; max-width: 900px; padding: 24px 16px 48px; font: 15px/1.55 system-ui, sans-serif; color: var(--ink); background: #fff; }
h1 { font-size: 2rem; margin: 0 0 4px; } h2 { font-size: 1.25rem; margin: 0; }
.meta { color: var(--muted); margin: 0 0 16px; }
.intro p { margin: 0 0 8px; }
.box { background: var(--soft); border-radius: 18px; padding: 14px 16px; margin: 0 0 16px; }
.box h2 { margin-bottom: 8px; }
.box h3 { margin: 12px 0 4px; }
.notation { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 4px 0 0; }
.notation dt { font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 800; }
.notation dd { margin: 0; }
.legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 0.88rem; }
.legend i { display: inline-block; width: 14px; height: 14px; border-radius: 4px; vertical-align: -2px; margin-right: 4px; }
.overview { width: 100%; border-collapse: collapse; margin: 0 0 24px; font-size: 0.9rem; }
.overview th, .overview td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
.overview a { color: inherit; }
.step { border: 1px solid var(--line); border-radius: 18px; padding: 14px 16px; margin: 0 0 16px; break-inside: avoid-page; }
.step-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.n { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 10px; background: var(--ink); color: #fff; font-weight: 800; }
.chip { background: #ececff; color: #2b2bb0; border-radius: 999px; padding: 2px 10px; font-size: 0.8rem; font-weight: 700; }
.pill { margin-left: auto; background: var(--soft); border-radius: 999px; padding: 2px 10px; font-size: 0.82rem; font-weight: 700; }
.lead { font-size: 1.02rem; margin: 10px 0; }
.nets { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 6px 0 10px; }
.arrow { font-size: 1.6rem; color: var(--muted); }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 4px 20px; }
.cols ul { margin: 0; padding-left: 18px; } .cols li { margin: 0 0 4px; }
.keep { color: var(--muted); font-size: 0.9rem; margin: 6px 0 0; }
.note { border-left: 4px solid var(--line); padding: 2px 0 2px 12px; margin: 10px 0; }
.note p { margin: 2px 0 0; }
.tech { font-size: 0.86rem; color: var(--muted); margin: 8px 0 0; }
figure { margin: 0; text-align: center; } figcaption { font-size: 0.78rem; color: var(--muted); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: 0.86rem; margin: 8px 0 0; }
dt { color: var(--muted); } dd { margin: 0; }
code { font-family: ui-monospace, Menlo, Consolas, monospace; }
h3 { font-size: 1rem; margin: 14px 0 8px; }
.algs { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; }
.known { background: #ececff; border-radius: 14px; padding: 10px 14px; margin: 10px 0 0; }
.alg { display: flex; gap: 8px; align-items: center; padding: 8px; border-radius: 14px; background: var(--soft); break-inside: avoid; }
.alg div { min-width: 0; flex: 1; } .alg b { display: block; font-size: 0.86rem; }
.alg code { display: block; font-size: 0.92rem; overflow-wrap: anywhere; }
.alg small { color: var(--muted); font-size: 0.74rem; }
.alg input { width: 20px; height: 20px; flex: none; }
.rules { margin: 6px 0; padding: 0; list-style: none; font-size: 0.9rem; display: grid; gap: 6px; }
.rules li { display: flex; gap: 10px; align-items: center; }
.rules svg { flex: none; }
.example ol { padding-left: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.example li { background: #fff; border-radius: 14px; padding: 8px 10px; }
.example li code { display: block; font-size: 0.95rem; overflow-wrap: anywhere; }
.example li small { color: var(--muted); }
.scramble { font-size: 1.05rem; overflow-wrap: anywhere; }
.import { margin-top: 28px; padding: 12px 14px; border-radius: 14px; background: var(--soft); font-size: 0.86rem; color: var(--muted); }
@media print { body { padding: 0; } .import { display: none; } .step, .box { border-color: #ccc; } details.tech { display: none; } }
</style></head><body>
<h1>${esc(name)}</h1>
<p class="meta">Učebnice metody · ${esc(new Date().toLocaleDateString('cs-CZ'))} · ${guide.steps.length} kroků · ${total} algoritmů</p>
${guide.intro ? `<div class="intro">${String(guide.intro).split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>` : ''}
${last ? `<p><b>Test metody (${esc(new Date(last.at).toLocaleDateString('cs-CZ'))}, ${last.n} zamíchání):</b> ${fmt(last.moves)} tahů na složení${last.time ? `, odhad ${fmt(last.time, 2)} s` : ''}</p>` : ''}
<section class="box">
  <h2>Než začneš</h2>
  <h3>Jak držet kostku</h3>
  <p>Celou dobu drž kostku tak, aby <b>${esc(centerName(frame.down))}</b> střed byl dole a <b>${esc(centerName(frame.front))}</b> vpředu (k tobě). Středy se nikdy nehýbou vůči sobě, takže podle nich vždycky poznáš, kam který dílek patří: dílek patří tam, kde jsou středy jeho barev.</p>
  <h3>Jak číst obrázky</h3>
  <p class="legend"><span><i style="background:${HEX.F}"></i>barva = tahle barva tu musí být</span><span><i style="background:linear-gradient(90deg,${HEX.U} 50%,${HEX.D} 50%);border:1px solid #ccc"></i>dvě barvy = může tu být kterákoli z nich</span><span><i style="background:#d6d8de"></i>šedá = na tomhle místě zatím nezáleží</span><span><i style="border:2px solid #e8467c"></i>rámeček = nové v tomto kroku</span></p>
  <p>Obrázek je kostka „rozložená“ do roviny: v prostředním řádku je zleva levá, přední, pravá a zadní strana, nad přední stranou horní a pod ní spodní.</p>
  ${notation.length ? `<h3>Zápis tahů</h3><p>Písmeno = otočit stranou o čtvrt otáčky po směru hodinových ručiček (jako bys se na tu stranu díval zpředu). Čárka (R') = proti směru, dvojka (R2) = půl otáčky.</p><dl class="notation">${notation.map(([m, t]) => `<dt>${esc(m)}</dt><dd>${esc(t)}</dd>`).join('')}</dl>` : ''}
  <h3>Jak se metodu učit</h3>
  <ol>
    <li>Přečti si přehled níž a projdi si ukázkové složení na skutečné kostce${example ? '' : ' (objeví se, až metodu otestuješ)'}.</li>
    ${intuitive.length ? `<li>Nejdřív si osvoj intuitivní kroky (${esc(intuitive.map((st) => st.title).filter(Boolean).slice(0, 4).join(', '))}${intuitive.length > 4 ? '…' : ''}) – v aplikaci je u každého kroku „Nacvičit“, který zamíchá kostku rovnou do situace před krokem.</li>` : ''}
    ${algSteps.length ? `<li>Algoritmy (${esc(algSteps.map((st) => st.title).filter(Boolean).join(', '))}) se uč postupně, pár denně. Dokud nějaký neumíš, pomoz si delší cestou. Políčka „umím“ u algoritmů si můžeš odškrtávat.</li>` : ''}
    <li>Pak skládej celé kostky a sleduj, který krok tě zdržuje nejvíc.</li>
  </ol>
</section>
<h2>Přehled metody</h2>
<table class="overview"><thead><tr><th>#</th><th>Krok</th><th>Co uděláš</th><th>Jak</th>${last ? '<th>Tahů</th>' : ''}</tr></thead><tbody>
${guide.steps.map((st, i) => {
    const res = last?.steps.find((x) => x.id === st.id);
    const solveBy = solveByOf(sim[st.id], st);
    const set = st.set ? sets.get(st.set) : null;
    const nAlgs = set ? setAlgs(set.id).length : 0;
    const known = solveBy === 'known' ? KNOWN_SETS[sim[st.id].knownSet] : null;
    const how = known ? `${known.short} algoritmy (${known.cases})` : solveBy === 'intuitive' ? 'intuitivně' : solveBy === 'fixed' ? 'jen někdy' : nAlgs ? `${nAlgs} ${nAlgs === 1 ? 'algoritmus' : nAlgs < 5 ? 'algoritmy' : 'algoritmů'}` : 'algoritmy (vytvoří test)';
    return `<tr><td>${i + 1}</td><td><a href="#krok-${i + 1}">${esc(st.title || `Krok ${i + 1}`)}</a></td><td>${esc(teach[i].title)}</td><td>${esc(how)}</td>${last ? `<td>${res ? fmt(res.moves) : '–'}</td>` : ''}</tr>`;
  }).join('')}
</tbody></table>
${steps.join('\n')}
${example ? exampleHtml(example) : ''}
${rest.join('\n')}
<p class="import">Tenhle soubor obsahuje celou metodu i s algoritmy. Do ErgoCube Lab ji nahraješ přes výběr metody → „Importovat metodu…“ a vybereš tento soubor.</p>
<script type="application/json" id="ergocube-method">${data}</script>
</body></html>`;
}

/** Ukázkové složení: zamíchání a každý krok s kostkou po něm. */
function exampleHtml(ex) {
  const net = (facelets, hold) => netSvg([...facelets].map((c) => ({ color: c })), hold, 150);
  return `<section class="box example" id="ukazka">
  <h2>Ukázkové složení</h2>
  <p>Jedno skutečné složení z testu metody. Zamíchej kostku (bílá nahoře, zelená vpředu) a pak jdi krok po kroku – po každém kroku má kostka vypadat jako na obrázku.</p>
  <p class="scramble">Zamíchání: <code>${esc(ex.scramble)}</code></p>
  <figure>${net(ex.start, ex.firstHold)}<figcaption>po zamíchání, otočená do držení metody (${esc(ex.firstLabel)})</figcaption></figure>
  <ol>${ex.steps.map((x, k) => `<li><b>${k + 1}. ${esc(x.title)}</b>
    ${x.skipped ? `<small>${x.fixed ? 'není potřeba – přeskočíš' : 'už hotové – přeskočíš'}</small>` : `<code>${x.rotation ? `(${esc(x.rotation)}) ` : ''}${esc(x.alg)}</code><small>${x.length} tahů${x.rotation ? ` · nejdřív otoč kostku (${esc(x.label)})` : ''}</small>`}
    ${x.skipped ? '' : net(x.facelets, x.hold)}</li>`).join('')}</ol>
</section>`;
}

function algTable(setName, list, time) {
  return `<h3>${esc(setName)} · ${list.length} ${list.length === 1 ? 'algoritmus' : list.length < 5 ? 'algoritmy' : 'algoritmů'}</h3>
<div class="algs">${list.map((a) => `<label class="alg"><input type="checkbox" aria-label="Umím">${caseSvg(a.task)}<div><b>${esc(a.name ?? '')}</b><code>${esc(a.alg)}</code>${time(a) ? `<small>${esc(time(a))}</small>` : ''}</div></label>`).join('')}</div>`;
}

/** Stáhne učebnici metody jako HTML soubor. */
export function downloadLearning(method = methods.active()) {
  const name = methods.get(method).name;
  const file = `ucebnice-${name.normalize('NFD').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase()}.html`;
  const url = URL.createObjectURL(new Blob([learningHtml(method)], { type: 'text/html' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: file });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
