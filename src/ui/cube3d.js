// 3D kostka v CSS (bez knihoven): otáčení tažením, klepnutí na nálepku,
// animace tahů a styly nálepek (plná, čárkovaná, tečkovaná, šedá).

import { FACELETS } from '../core/geometry.js';
import { MOVE_DEFS } from '../core/notation.js';
import { holdOf, holdFromFaces } from '../core/hold.js';

// Otočení nálepky tak, aby mířila ve směru normály své stěny.
const FACE_ROT = {
  F: '', B: 'rotateY(180deg)', R: 'rotateY(90deg)', L: 'rotateY(-90deg)',
  U: 'rotateX(90deg)', D: 'rotateX(-90deg)',
};
// Otočení vrstvy v CSS pro q čtvrtotáček (kladně = po směru hodinových
// ručiček při pohledu z kladného konce osy x/y/z).
const AXIS_ROT = [(q) => `rotateX(${90 * q}deg)`, (q) => `rotateY(${-90 * q}deg)`, (q) => `rotateZ(${90 * q}deg)`];

const DEFAULT_VIEW = { rx: -28, ry: -38 };
const defaultMatrix = () => new DOMMatrix().rotateSelf(DEFAULT_VIEW.rx, 0, 0).rotateSelf(0, DEFAULT_VIEW.ry, 0);
// Normály stěn modelu v souřadnicích CSS (x doprava, y dolů, z k divákovi).
const CSS_NORMAL = { U: [0, -1, 0], D: [0, 1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
const dotv = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const apply = (m, v) => { const p = m.transformPoint(new DOMPoint(v[0], v[1], v[2], 1)); return [p.x, p.y, p.z]; };

export class Cube3D {
  /**
   * @param {HTMLElement} container
   * @param {{onSticker?: (pos:number) => void, label?: string, fill?: boolean,
   *   facelets?: {pos:number[], normal:number[], face:string}[], scale?: number}} [opts]
   *   facelets – nálepky v souřadnicích 3×3 (výchozí 3×3), scale – velikost nálepky vůči 3×3 (2×2 = 1.5)
   */
  constructor(container, { onSticker, label = 'Kostka', fill = false, facelets = FACELETS, scale = 1 } = {}) {
    this.facelets = facelets;
    this.scale = scale;
    this.onSticker = onSticker;
    // fill: kostka se přizpůsobí výšce i šířce kontejneru (stránka bez posouvání)
    this.fill = fill;
    this.container = container;
    // Natočení kostky jako matice: tažení otáčí kolem os obrazovky (trackball),
    // takže jde kostku volně otočit do libovolné polohy.
    this.hold = '';              // držení (viz core/hold.js): výchozí pohled je kostka tak, jak ji držíš
    this.view = this.homeMatrix();
    this.size = 40;
    this.scene = document.createElement('div');
    this.scene.className = 'cube3d-scene';
    this.scene.setAttribute('role', 'img');
    this.scene.setAttribute('aria-label', `${label} – táhni pro otočení`);
    this.cube = document.createElement('div');
    this.cube.className = 'cube3d';
    this.scene.append(this.cube);
    this.stickers = facelets.map((f, i) => {
      const s = document.createElement('div');
      s.className = 'sticker3d';
      s.dataset.pos = String(i);
      const face = document.createElement('div');
      face.className = 'face';
      s.append(face);
      this.cube.append(s);
      return s;
    });
    container.replaceChildren(this.scene);
    this.bindPointer();
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(fill ? container : this.scene);
    this.layout();
  }

  layout() {
    const w = this.scene.clientWidth || 240;
    const h = this.fill ? this.container.clientHeight : Infinity;
    if (this.fill && !h) return;
    this.size = Math.max(16, Math.min(72, Math.floor(Math.min(w / 4, h / 4.5))));
    this.scene.style.height = this.fill ? '100%' : `${Math.round(this.size * 4.6)}px`;
    this.cube.style.setProperty('--s', `${this.size * this.scale}px`);
    this.stickers.forEach((s, i) => { s.style.transform = this.baseTransform(i); });
    this.applyView();
  }

  baseTransform(i, prefix = '') {
    const { pos, normal, face } = this.facelets[i];
    // Kostka má vždy poloviční velikost 1,5 S; nálepka (velikost scale·S) leží
    // na stěně, její střed je od středu stěny posunutý o (1,5 − scale/2)·S.
    const S = this.size, step = (1.5 - this.scale / 2) * S, half = (this.scale / 2) * S;
    const x = pos[0] * step + normal[0] * half;
    const y = -(pos[1] * step + normal[1] * half);
    const z = pos[2] * step + normal[2] * half;
    return `${prefix} translate3d(${x}px, ${y}px, ${z}px) ${FACE_ROT[face]}`.trim();
  }

  applyView() {
    this.cube.style.transform = this.view.toString();
  }

  /** Výchozí pohled: obvyklé natočení + držení (sloupce = obrazy os x, y, z). */
  homeMatrix() {
    const [c1, c2, c3] = holdOf(this.hold).linear();
    const M = new DOMMatrix([...c1, 0, ...c2, 0, ...c3, 0, 0, 0, 0, 1]);
    return defaultMatrix().multiply(M);
  }

  /** Nastaví držení a vrátí pohled do něj. */
  setHold(rot) {
    this.hold = rot;
    this.resetView();
  }

  /** Držení nejblíže současnému natočení: která stěna je nahoře a která vpředu. */
  nearestHold() {
    const D = defaultMatrix();
    const up = apply(D, CSS_NORMAL.U), front = apply(D, CSS_NORMAL.F);
    const best = (target, skip) => Object.keys(CSS_NORMAL).filter((f) => !skip?.includes(f))
      .reduce((a, b) => (dotv(apply(this.view, CSS_NORMAL[b]), target) > dotv(apply(this.view, CSS_NORMAL[a]), target) ? b : a));
    const upFace = best(up);
    const axis = ['UD', 'RL', 'FB'].find((p) => p.includes(upFace));
    return holdFromFaces(upFace, best(front, [...axis]));
  }

  /** Pohled natočený jako držení `rot` (jen pohled – zápis tahů a držení se nemění). */
  setLook(rot) {
    const [c1, c2, c3] = holdOf(rot).linear();
    this.view = defaultMatrix().multiply(new DOMMatrix([...c1, 0, ...c2, 0, ...c3, 0, 0, 0, 0, 1]));
    this.applyView();
  }

  resetView() {
    this.view = this.homeMatrix();
    this.cube.style.transition = 'transform 250ms ease-out';
    this.applyView();
    setTimeout(() => { this.cube.style.transition = ''; }, 260);
  }

  bindPointer() {
    let start = null;
    this.scene.addEventListener('pointerdown', (e) => {
      if (start) return; // druhý prst ignorujeme
      start = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, id: e.pointerId, target: e.target, moved: false, slop: e.pointerType === 'touch' ? 10 : 5 };
      this.scene.setPointerCapture(e.pointerId);
    });
    this.scene.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (!start.moved) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < start.slop) return;
        start.moved = true;
      }
      const dx = e.clientX - start.lastX, dy = e.clientY - start.lastY;
      start.lastX = e.clientX;
      start.lastY = e.clientY;
      // citlivost podle velikosti: tažení přes celou kostku ≈ půl otáčky
      const k = Math.max(0.45, 200 / Math.max(1, this.size * 4.6));
      const angle = Math.hypot(dx, dy) * k;
      if (!angle) return;
      // otočení kolem osy kolmé ke směru tažení (v rovině obrazovky)
      this.view = new DOMMatrix().rotateAxisAngleSelf(-dy, dx, 0, angle).multiply(this.view);
      this.applyView();
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (!start.moved && this.onSticker) {
        const st = start.target.closest?.('.sticker3d');
        if (st) this.onSticker(Number(st.dataset.pos));
      }
      start = null;
    };
    this.scene.addEventListener('pointerup', end);
    this.scene.addEventListener('pointercancel', (e) => { if (start && e.pointerId === start.id) start = null; });
  }

  /**
   * @param {{color: string, style: 'solid'|'dashed'|'dotted'|'faded'|'none', selected?: boolean}[]} stickers
   *   pro každou pozici 0–53; color je U R F D L B nebo X (nevybarveno)
   */
  render(stickers) {
    stickers.forEach(({ color, css, style, selected }, i) => {
      const el = this.stickers[i];
      const blank = color === 'X' || style === 'none';
      el.dataset.style = blank ? 'none' : style;
      el.classList.toggle('selected', !!selected);
      el.style.setProperty('--c', blank ? 'var(--c-gray)' : (css ?? `var(--c-${color})`));
    });
    this.scene.classList.toggle('editable', !!this.onSticker);
  }

  /** Animuje jeden tah; po skončení je potřeba znovu zavolat render s novým stavem. */
  animate(move, ms = 260) {
    const def = MOVE_DEFS[move.base];
    const q = def.dir * move.amount;
    const layer = this.stickers.filter((_, i) => def.layers.includes(this.facelets[i].pos[def.axis]));
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
