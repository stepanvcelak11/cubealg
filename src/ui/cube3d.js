// 3D kostka v CSS (bez knihoven): otáčení tažením, klepnutí na nálepku,
// animace tahů a styly nálepek (plná, čárkovaná, tečkovaná, šedá).

import { FACELETS } from '../core/geometry.js';
import { MOVE_DEFS } from '../core/notation.js';

// Otočení nálepky tak, aby mířila ve směru normály své stěny.
const FACE_ROT = {
  F: '', B: 'rotateY(180deg)', R: 'rotateY(90deg)', L: 'rotateY(-90deg)',
  U: 'rotateX(90deg)', D: 'rotateX(-90deg)',
};
// Otočení vrstvy v CSS pro q čtvrtotáček (kladně = po směru hodinových
// ručiček při pohledu z kladného konce osy x/y/z).
const AXIS_ROT = [(q) => `rotateX(${90 * q}deg)`, (q) => `rotateY(${-90 * q}deg)`, (q) => `rotateZ(${90 * q}deg)`];

const DEFAULT_VIEW = { rx: -28, ry: -38 };

export class Cube3D {
  /**
   * @param {HTMLElement} container
   * @param {{onSticker?: (pos:number) => void, label?: string}} [opts]
   */
  constructor(container, { onSticker, label = 'Kostka' } = {}) {
    this.onSticker = onSticker;
    this.view = { ...DEFAULT_VIEW };
    this.size = 40;
    this.scene = document.createElement('div');
    this.scene.className = 'cube3d-scene';
    this.scene.setAttribute('role', 'img');
    this.scene.setAttribute('aria-label', `${label} – táhni pro otočení`);
    this.cube = document.createElement('div');
    this.cube.className = 'cube3d';
    this.scene.append(this.cube);
    this.stickers = FACELETS.map((f) => {
      const s = document.createElement('div');
      s.className = 'sticker3d';
      s.dataset.pos = String(f.index);
      const face = document.createElement('div');
      face.className = 'face';
      s.append(face);
      this.cube.append(s);
      return s;
    });
    container.replaceChildren(this.scene);
    this.bindPointer();
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.scene);
    this.layout();
  }

  layout() {
    const w = this.scene.clientWidth || 240;
    this.size = Math.max(22, Math.min(64, Math.floor(w / 4.4)));
    this.scene.style.height = `${Math.round(this.size * 4.6)}px`;
    this.cube.style.setProperty('--s', `${this.size}px`);
    this.stickers.forEach((s, i) => { s.style.transform = this.baseTransform(i); });
    this.applyView();
  }

  baseTransform(i, prefix = '') {
    const { pos, normal, face } = FACELETS[i];
    const S = this.size;
    const x = (pos[0] + normal[0] / 2) * S;
    const y = -(pos[1] + normal[1] / 2) * S;
    const z = (pos[2] + normal[2] / 2) * S;
    return `${prefix} translate3d(${x}px, ${y}px, ${z}px) ${FACE_ROT[face]}`.trim();
  }

  applyView() {
    this.cube.style.transform = `rotateX(${this.view.rx}deg) rotateY(${this.view.ry}deg)`;
  }

  resetView() {
    this.view = { ...DEFAULT_VIEW };
    this.applyView();
  }

  bindPointer() {
    let start = null;
    this.scene.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY, rx: this.view.rx, ry: this.view.ry, target: e.target, moved: false };
      this.scene.setPointerCapture(e.pointerId);
    });
    this.scene.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < 6) return;
      start.moved = true;
      this.view.ry = start.ry + dx * 0.6;
      this.view.rx = Math.max(-89, Math.min(89, start.rx - dy * 0.6));
      this.applyView();
    });
    const end = () => {
      if (start && !start.moved && this.onSticker) {
        const st = start.target.closest?.('.sticker3d');
        if (st) this.onSticker(Number(st.dataset.pos));
      }
      start = null;
    };
    this.scene.addEventListener('pointerup', end);
    this.scene.addEventListener('pointercancel', () => { start = null; });
  }

  /**
   * @param {{color: string, style: 'solid'|'dashed'|'dotted'|'faded'|'none'}[]} stickers
   *   pro každou pozici 0–53; color je U R F D L B nebo X (nevybarveno)
   */
  render(stickers) {
    stickers.forEach(({ color, style }, i) => {
      const el = this.stickers[i];
      const blank = color === 'X' || style === 'none';
      el.dataset.style = blank ? 'none' : style;
      el.style.setProperty('--c', blank ? 'var(--c-gray)' : `var(--c-${color})`);
    });
    this.scene.classList.toggle('editable', !!this.onSticker);
  }

  /** Animuje jeden tah; po skončení je potřeba znovu zavolat render s novým stavem. */
  animate(move, ms = 260) {
    const def = MOVE_DEFS[move.base];
    const q = def.dir * move.amount;
    const layer = this.stickers.filter((_, i) => def.layers.includes(FACELETS[i].pos[def.axis]));
    const rot = AXIS_ROT[def.axis];
    for (const el of layer) {
      el.style.transition = 'none';
      el.style.transform = this.baseTransform(Number(el.dataset.pos), rot(0));
    }
    void this.cube.offsetWidth; // vynutí výchozí stav před přechodem
    return new Promise((resolve) => {
      for (const el of layer) {
        el.style.transition = `transform ${ms}ms ease-in-out`;
        el.style.transform = this.baseTransform(Number(el.dataset.pos), rot(q));
      }
      setTimeout(() => {
        for (const el of layer) {
          el.style.transition = 'none';
          el.style.transform = this.baseTransform(Number(el.dataset.pos));
        }
        resolve();
      }, ms + 20);
    });
  }
}
