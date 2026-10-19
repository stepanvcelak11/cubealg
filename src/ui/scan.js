// Focení kostky (3×3, 2×2): stěna po stěně. Kamera (nebo nahraná fotka),
// mřížka pro zarovnání, rozpoznání barev v buňkách a ruční oprava klepnutím.

import { el } from './dom.js';
import { icon } from './icons.js';

const FACES = ['U', 'F', 'R', 'B', 'L', 'D'];
// Jak držet kostku, aby nálepky odpovídaly síti (U nad F, D pod F).
const HOLD = {
  U: 'zelený střed (F) dole u tebe',
  D: 'zelený střed (F) nahoře',
  F: 'bílý střed (U) nahoře', R: 'bílý střed (U) nahoře', B: 'bílý střed (U) nahoře', L: 'bílý střed (U) nahoře',
};
const CROP = 0.8; // mřížka zabírá 80 % kratší strany obrazu

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

/**
 * @param {{size: number, colors: {face:string, label:string, css:string}[],
 *   onFace: (face:string, grid:string[] & {size:number}) => void}} opts
 */
export function openScan({ size, colors, onFace }) {
  const cssOf = Object.fromEntries(colors.map((c) => [c.face, c.css]));
  const order = colors.map((c) => c.face);
  const done = new Set();
  let face = 'F';
  let grid = null;   // rozpoznané barvy (po vyfocení)
  let stream = null;

  const video = el('video', { playsInline: true, muted: true, autoplay: true });
  const img = el('img', { alt: '' });
  img.hidden = true;
  const overlay = el('div', { className: `scan-grid size-${size}` }, ...Array.from({ length: size * size }, () => el('i')));
  const stage = el('div', { className: 'scan-stage' }, video, img, overlay);
  const result = el('div', { className: `scan-result size-${size}` });
  result.hidden = true;
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
    const name = colors.find((c) => c.face === face)?.label.toLowerCase() ?? face;
    hint.textContent = `Natoč ke kameře stěnu ${face} (${name} střed), ${HOLD[face]}. Kostku zarovnej do mřížky.`;
  }

  function renderResult() {
    result.hidden = !grid;
    stage.hidden = !!grid;
    again.hidden = !grid;
    shoot.innerHTML = grid ? `${icon('check', { size: 18 })}<span>Uložit stěnu ${face}</span>` : `${icon('camera', { size: 18 })}<span>Vyfotit</span>`;
    if (!grid) return;
    result.replaceChildren(...grid.map((c, i) => {
      const b = el('button', { type: 'button', className: 'scan-cell', style: `--c:${cssOf[c]}`, ariaLabel: `Nálepka ${i + 1}: ${c}` });
      b.onclick = () => { grid[i] = order[(order.indexOf(grid[i]) + 1) % order.length]; renderResult(); };
      return b;
    }));
  }

  // Vzorek barev z obrázku (video nebo foto): čtverec uprostřed, buňky mřížky.
  function sample(source, w, h) {
    const side = Math.min(w, h) * CROP;
    const x0 = (w - side) / 2, y0 = (h - side) / 2;
    const canvas = document.createElement('canvas');
    const N = 240;
    canvas.width = canvas.height = N;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, x0, y0, side, side, 0, 0, N, N);
    const cell = N / size;
    const out = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      const d = ctx.getImageData(Math.round(c * cell + cell * 0.3), Math.round(r * cell + cell * 0.3), Math.round(cell * 0.4), Math.round(cell * 0.4)).data;
      let R = 0, G = 0, B = 0;
      for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
      const n = d.length / 4;
      out.push(classify(R / n, G / n, B / n));
    }
    out.size = size;
    // 3×3: stěnu poznáme podle středu
    if (size === 3) face = out[4];
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
      status.textContent = done.size === 6 ? 'Všech 6 stěn uloženo.' : `Stěna uložena (${done.size}/6). Další stěna: ${face}.`;
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
  dialog.addEventListener('close', () => { stopCamera(); dialog.remove(); });

  renderChips();
  renderResult();
  dialog.showModal();
  startCamera();
}
