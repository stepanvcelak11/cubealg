// Stopky ve stylu speedcubingu: podržet (mezerník nebo prst) → zelená → pustit
// = start, libovolná klávesa nebo dotyk kdekoli = stop. Volitelně inspekce 15 s
// (WCA: 15–17 s = +2, nad 17 s = DNF).

import { formatTime } from '../timer/stats.js';

const HOLD_MS = 300;

function say(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'cs-CZ';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* prohlížeč bez syntézy řeči */ }
}

export class Stopwatch {
  /**
   * @param {object} o
   * @param {HTMLElement} o.pad plocha pro dotyk
   * @param {HTMLElement} o.display prvek s časem
   * @param {() => boolean} o.isActive zda stopky reagují (viditelná stránka)
   * @param {() => boolean} [o.inspection] zda použít inspekci
   * @param {() => boolean} [o.voice] zda v inspekci hlásit 8 a 12 s (jako rozhodčí WCA)
   * @param {(ms:number, penalty:number) => void} o.onStop
   * @param {(state:string) => void} [o.onState] idle | holding | ready | inspecting | running
   */
  constructor({ pad, display, isActive, inspection = () => false, voice = () => false, onStop, onState }) {
    Object.assign(this, { pad, display, isActive, inspection, voice, onStop, onState });
    this.state = 'idle';
    this.holdTimer = null;
    this.raf = 0;
    this.inspectStart = 0;
    this.bind();
  }

  setState(s) {
    this.state = s;
    this.pad.dataset.state = s;
    document.body.classList.toggle('timing', s === 'running' || s === 'inspecting' || s === 'ready');
    this.onState?.(s);
  }

  bind() {
    const typing = () => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
    window.addEventListener('keydown', (e) => {
      if (!this.isActive() || typing()) return;
      if (this.state === 'running') { e.preventDefault(); this.stop(); return; }
      if (e.code === 'Escape' && this.state === 'inspecting') { this.cancel(); return; }
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (!e.repeat) this.press();
    });
    window.addEventListener('keyup', (e) => {
      if (!this.isActive() || e.code !== 'Space' || typing()) return;
      e.preventDefault();
      this.release();
    });
    // běžící stopky zastaví dotyk kdekoli na obrazovce (i na liště nebo výběru nad plochou)
    window.addEventListener('pointerdown', (e) => {
      if (this.state !== 'running' || !this.isActive()) return;
      e.preventDefault();
      e.stopPropagation();
      this.stoppedAt = performance.now();
      this.stop();
    }, { capture: true });
    window.addEventListener('click', (e) => {
      // klepnutí, které stopky zastavilo, nesmí nic otevřít
      if (performance.now() - (this.stoppedAt ?? -Infinity) < 400) { e.preventDefault(); e.stopPropagation(); }
    }, { capture: true });
    this.pad.addEventListener('pointerdown', (e) => {
      if (!this.isActive() || e.target.closest('button, input, select, form')) return;
      e.preventDefault();
      if (this.state === 'running') { this.stop(); return; }
      this.press();
    });
    window.addEventListener('pointerup', () => { if (this.isActive()) this.release(); });
    window.addEventListener('pointercancel', () => { if (this.state === 'holding' || this.state === 'ready') this.reset(); });
  }

  press() {
    if (this.state === 'running') return;
    if (this.state === 'idle' && this.inspection()) {
      this.pendingInspection = true;
      return;
    }
    if (this.state !== 'idle' && this.state !== 'inspecting') return;
    this.before = this.state;
    this.setState('holding');
    this.holdTimer = setTimeout(() => this.setState('ready'), HOLD_MS);
  }

  release() {
    clearTimeout(this.holdTimer);
    if (this.pendingInspection) {
      this.pendingInspection = false;
      this.startInspection();
      return;
    }
    if (this.state === 'ready') this.start();
    else if (this.state === 'holding') this.setState(this.before === 'inspecting' ? 'inspecting' : 'idle');
    if (this.state === 'idle') this.display.textContent = formatTime(this.last ?? 0);
  }

  startInspection() {
    this.inspectStart = performance.now();
    this.setState('inspecting');
    const calls = [[8, 'Osm sekund'], [12, 'Dvanáct sekund']];
    const tick = () => {
      if (this.state !== 'inspecting' && this.state !== 'holding' && this.state !== 'ready') return;
      const s = (performance.now() - this.inspectStart) / 1000;
      if (calls.length && s >= calls[0][0]) {
        const [, text] = calls.shift();
        if (this.voice()) say(text);
      }
      if (this.state === 'inspecting') this.display.textContent = s < 15 ? String(15 - Math.floor(s)) : s < 17 ? '+2' : 'DNF';
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  inspectionPenalty() {
    if (!this.inspectStart) return 0;
    const s = (performance.now() - this.inspectStart) / 1000;
    return s > 17 ? -1 : s > 15 ? 2000 : 0;
  }

  start() {
    this.penalty = this.inspectionPenalty();
    this.inspectStart = 0;
    cancelAnimationFrame(this.raf);
    this.t0 = performance.now();
    this.setState('running');
    const tick = () => {
      if (this.state !== 'running') return;
      this.display.textContent = formatTime(performance.now() - this.t0);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  stop() {
    const ms = Math.floor(performance.now() - this.t0);
    cancelAnimationFrame(this.raf);
    this.last = ms;
    this.display.textContent = formatTime(ms);
    this.setState('idle');
    this.onStop(ms, this.penalty ?? 0);
  }

  cancel() {
    cancelAnimationFrame(this.raf);
    this.inspectStart = 0;
    this.reset();
  }

  reset() {
    clearTimeout(this.holdTimer);
    this.pendingInspection = false;
    this.setState('idle');
    this.display.textContent = formatTime(this.last ?? 0);
  }

  /** Zobrazí čas (např. po smazání nebo změně disciplíny). */
  show(ms) {
    this.last = ms;
    if (this.state === 'idle') this.display.textContent = formatTime(ms);
  }
}
