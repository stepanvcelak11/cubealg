// Focení hlavolamu (3×3, 2×2, Skewb, Pyraminx): stěna po stěně. Kamera (nebo
// nahraná fotka), obrys stěny pro zarovnání, rozpoznání barev v nálepkách
// a ruční oprava klepnutím. Tvar stěny (čtverce, trojúhelníky, kosočtverec)
// určuje `spec` z models.js.

import { el } from './dom.js';
import { icon } from './icons.js';

const CROP = 0.8; // obrys stěny zabírá 80 % kratší strany obrazu
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const pts = (poly, k = 1) => poly.map(([x, y]) => `${(x * k).toFixed(3)},${(y * k).toFixed(3)}`).join(' ');

/** Barva pixelu → písmeno stěny (U bílá, D žlutá, F zelená, B modrá, R červená, L oranžová). */
export function classify(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max / 255, s = max ? (max - min) / max : 0;
  if (s < 0.28 && v > 0.45) return 'U';
  let h = 0;
  if (max !== min) {
    if (max === r) h = ((g - b) / (max - min)) % 6;
    else if (max === g) h = (b - r) / (max - min) + 2;
    else h = (r - g) / (max - min) + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  if (h < 14 || h >= 325) return 'R';
  if (h < 38) return 'L';
  if (h < 72) return 'D';
  if (h < 170) return 'F';
  if (h < 265) return 'B';
  return 'R';
}

// Písmeno krychle (bílá U, žlutá D, zelená F, modrá B, červená R, oranžová L)
// → barva palety hlavolamu (Pyraminx nemá bílou ani oranžovou).
const FALLBACK = { U: 'D', L: 'R', R: 'L', D: 'U', F: 'B', B: 'F' };
// Délka strany čtverce o stejné ploše jako mnohoúhelník (Gaussův vzorec).
export function polyScale(poly) {
  let a = 0;
  poly.forEach(([x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; a += x * y2 - x2 * y; });
  return Math.sqrt(Math.abs(a) / 2);
}

export function toPalette(letter, colors) {
  const byCss = Object.fromEntries(colors.map((c) => [c.css, c.face]));
  return byCss[`var(--c-${letter})`] ?? byCss[`var(--c-${FALLBACK[letter]})`] ?? colors[0].face;
}

/**
 * @param {{spec: {faces: string[], cells: (face:string) => {indices:number[], polys:number[][][], marks:{text:string, at:number[]}[]},
 *     hold: (face:string) => string, note?: string, detect?: (grid:string[]) => string|null},
 *   colors: {face:string, label:string, css:string}[],
 *   onFace: (face:string, grid:string[]) => void}} opts
 */
export function openScan({ spec, colors, onFace, onDone }) {
  const cssOf = Object.fromEntries(colors.map((c) => [c.face, c.css]));
  const order = colors.map((c) => c.face);
  const FACES = spec.faces;
  const done = new Set();
  let face = FACES.includes('F') ? 'F' : FACES[0];
  let grid = null;   // rozpoznané barvy (po vyfocení)
  let stream = null;

  const video = el('video', { playsInline: true, muted: true, autoplay: true });
  const img = el('img', { alt: '' });
  img.hidden = true;
  const overlay = svg('svg', { class: 'scan-outline', viewBox: '0 0 100 100' });
  const stage = el('div', { className: 'scan-stage' }, video, img, overlay);
  const result = svg('svg', { class: 'scan-result', viewBox: '0 0 1 1' });
  result.setAttribute('hidden', '');
  const chips = el('div', { className: 'scan-faces', role: 'radiogroup', ariaLabel: 'Stěna' });
  const hint = el('p', { className: 'hint scan-hint' });
  const status = el('p', { className: 'hint', ariaLive: 'polite' });
  const camNote = el('p', { className: 'hint' });
  camNote.hidden = true;
  const file = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const shoot = el('button', { type: 'button', className: 'primary' });
  const again = el('button', { type: 'button', className: 'secondary', textContent: 'Znovu' });
  const upload = el('button', { type: 'button', className: 'secondary' });
  const close = el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít' });
  shoot.innerHTML = `${icon('camera', { size: 18 })}<span>Vyfotit</span>`;
  upload.innerHTML = `${icon('upload', { size: 18 })}<span>Nahrát fotku</span>`;
  close.innerHTML = icon('close', { size: 20 });

  const dialog = el('dialog', { className: 'help-dialog scan-dialog' },
    el('div', { className: 'scan-head' }, el('h2', { textContent: 'Nafotit kostku' }), close),
    chips, hint, stage, result, camNote, status,
    el('div', { className: 'row-btns scan-actions' }, upload, again, shoot), file);
  document.body.append(dialog);

  function renderChips() {
    chips.replaceChildren(...FACES.map((f) => {
      const b = el('button', { type: 'button', className: `chip scan-face${done.has(f) ? ' done' : ''}` },
        el('i', { className: 'swatch', style: `--c:${cssOf[f]}` }), el('span', { textContent: f }));
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(f === face));
      b.onclick = () => { face = f; renderChips(); };
      return b;
    }));
    hint.textContent = `${spec.hold(face)} Zarovnej ji do obrysu.${spec.note ? ` ${spec.note}` : ''}`;
    drawOutline();
  }

  // obrys stěny v hledáčku (po zvolení stěny)
  function drawOutline() {
    const { polys, marks } = spec.cells(face);
    overlay.replaceChildren(
      ...polys.map((p) => svg('polygon', { points: pts(p, 100) })),
      ...marks.map((m) => { const t = svg('text', { x: m.at[0] * 100, y: m.at[1] * 100 }); t.textContent = m.text; return t; }));
  }

  function renderResult() {
    result.toggleAttribute('hidden', !grid);
    stage.hidden = !!grid;
    again.hidden = !grid;
    shoot.innerHTML = grid ? `${icon('check', { size: 18 })}<span>Uložit stěnu ${face}</span>` : `${icon('camera', { size: 18 })}<span>Vyfotit</span>`;
    if (!grid) return;
    const { polys } = spec.cells(face);
    result.replaceChildren(...polys.map((poly, i) => {
      const b = svg('polygon', { points: pts(poly), class: 'scan-cell', tabindex: '0', role: 'button', 'aria-label': `Nálepka ${i + 1}: ${grid[i]}` });
      b.style.setProperty('fill', cssOf[grid[i]]);
      const next = () => { grid[i] = order[(order.indexOf(grid[i]) + 1) % order.length]; renderResult(); };
      b.onclick = next;
      b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } };
      return b;
    }));
  }

  // Vzorek barev z obrázku (video nebo foto): čtverec uprostřed, vzorek u středu každé nálepky.
  function sample(source, w, h) {
    const side = Math.min(w, h) * CROP;
    const x0 = (w - side) / 2, y0 = (h - side) / 2;
    const canvas = document.createElement('canvas');
    const N = 240;
    canvas.width = canvas.height = N;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, x0, y0, side, side, 0, 0, N, N);
    const out = spec.cells(face).polys.map((poly) => {
      const cx = poly.reduce((t, p) => t + p[0], 0) / poly.length;
      const cy = poly.reduce((t, p) => t + p[1], 0) / poly.length;
      const half = Math.max(2, polyScale(poly) * 0.18 * N);
      const d = ctx.getImageData(Math.round(cx * N - half), Math.round(cy * N - half), Math.round(half * 2), Math.round(half * 2)).data;
      let R = 0, G = 0, B = 0;
      for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
      const n = d.length / 4;
      return toPalette(classify(R / n, G / n, B / n), colors);
    });
    // 3×3: stěnu poznáme podle středu
    const found = spec.detect?.(out);
    if (found) face = found;
    return out;
  }

  async function startCamera() {
    img.hidden = true;
    video.hidden = false;
    if (stream) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      video.srcObject = stream;
      camNote.hidden = true;
    } catch {
      video.hidden = true;
      camNote.hidden = false;
      camNote.textContent = 'Kamera není dostupná (nebo nemá povolení). Použij „Nahrát fotku“ – na mobilu se otevře fotoaparát.';
    }
  }
  function stopCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  shoot.onclick = () => {
    if (grid) {
      onFace(face, grid);
      done.add(face);
      grid = null;
      face = FACES.find((f) => !done.has(f)) ?? face;
      status.textContent = done.size === FACES.length ? `Všech ${FACES.length} stěn uloženo.` : `Stěna uložena (${done.size}/${FACES.length}). Další stěna: ${face}.`;
      renderChips();
      renderResult();
      startCamera();
      return;
    }
    if (!stream || !video.videoWidth) { file.click(); return; }
    grid = sample(video, video.videoWidth, video.videoHeight);
    renderChips();
    renderResult();
  };
  again.onclick = () => { grid = null; renderResult(); startCamera(); };
  upload.onclick = () => file.click();
  file.onchange = () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    const url = URL.createObjectURL(f);
    img.onload = () => {
      video.hidden = true;
      img.hidden = false;
      grid = sample(img, img.naturalWidth, img.naturalHeight);
      renderChips();
      renderResult();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  close.onclick = () => dialog.close();
  dialog.addEventListener('close', () => { stopCamera(); dialog.remove(); onDone?.(); });

  renderChips();
  renderResult();
  dialog.showModal();
  startCamera();
}
