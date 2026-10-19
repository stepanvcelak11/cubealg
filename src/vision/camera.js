// Skenování stavu A kamerou: postupně vyfotí 6 stěn, rozpozná barvy
// a vrátí barevný řetězec (Kociemba). Ověření stavu dělá volající.

import { FACES } from '../core/geometry.js';
import { sampleGrid, classifyFaces, SCAN_GUIDE } from './detect.js';

export class CubeScanner {
  /**
   * @param {HTMLElement} container kam vložit náhled
   * @param {(facelets: string) => void} onDone
   */
  constructor(container, onDone) {
    this.container = container;
    this.onDone = onDone;
    this.faces = {};
    this.stream = null;
  }

  static supported() {
    return !!navigator.mediaDevices?.getUserMedia;
  }

  async open() {
    this.faces = {};
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    });
    const wrap = document.createElement('div');
    wrap.className = 'scanner';
    this.video = Object.assign(document.createElement('video'), { playsInline: true, muted: true, autoplay: true });
    this.video.srcObject = this.stream;
    const overlay = document.createElement('div');
    overlay.className = 'scanner-grid';
    for (let i = 0; i < 9; i++) overlay.append(document.createElement('span'));
    const stage = document.createElement('div');
    stage.className = 'scanner-stage';
    stage.append(this.video, overlay);
    this.guide = document.createElement('p');
    this.button = Object.assign(document.createElement('button'), { type: 'button' });
    this.button.onclick = () => this.capture();
    const cancel = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Zrušit', className: 'secondary' });
    cancel.onclick = () => this.close();
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(this.button, cancel);
    wrap.append(stage, this.guide, actions);
    this.container.replaceChildren(wrap);
    await this.video.play().catch(() => {});
    this.updateGuide();
  }

  get nextFace() {
    return FACES.find((f) => !this.faces[f]);
  }

  updateGuide() {
    const f = this.nextFace;
    this.guide.textContent = `${Object.keys(this.faces).length + 1}/6 · ${SCAN_GUIDE[f]}. Vyplň mřížku stěnou.`;
    this.button.textContent = `Vyfotit ${f}`;
  }

  capture() {
    const v = this.video;
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) return;
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, w, h);
    // Mřížka v náhledu je čtverec 60 % kratší strany uprostřed.
    const size = Math.min(w, h) * 0.6;
    const square = { x: (w - size) / 2, y: (h - size) / 2, size };
    this.faces[this.nextFace] = sampleGrid(ctx.getImageData(0, 0, w, h), square);
    if (this.nextFace) {
      this.updateGuide();
      return;
    }
    const facelets = classifyFaces(this.faces);
    this.close();
    this.onDone(facelets);
  }

  close() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.container.replaceChildren();
  }
}
