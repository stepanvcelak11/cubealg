// Vizuální metronom (Timer → Metronom): telefon leží pod kostkou, celá obrazovka v tempu
// bliká a na každé bliknutí uděláš jeden tah – učí točit plynule bez zastavení. Tempo
// (tahů za sekundu) si nastavíš a může se samo zvyšovat; s chytrou kostkou ukáže, kolik
// tahů padlo na bliknutí, a v režimu „když stíhám“ podle toho tempo zvedá nebo snižuje.

import { el, storage } from './dom.js';
import { keepAwake } from './longrun.js';
import { smartCube } from '../smartcube/index.js';
import { makeMetronome, RAMPS, METRONOME_DEFAULTS } from '../timer/metronome.js';
import { DOUBLE_GAP } from '../smartcube/recon.js';

const KEY = 'ergocube.metronome';
const COLORS = { white: 'Bílá', yellow: 'Žlutá', green: 'Zelená', red: 'Červená' };
const fmt = (v, d = 2) => Number(v).toFixed(d).replace('.', ',');

export function openMetronome() {
  const opts = { ...METRONOME_DEFAULTS, ...(storage.get(KEY) ?? {}) };
  const save = () => storage.set(KEY, opts);
  const num = (key, min, max, step, label, unit) => {
    const i = el('input', { type: 'number', min: String(min), max: String(max), step: String(step), value: String(opts[key]), ariaLabel: label });
    i.onchange = () => { opts[key] = Math.min(max, Math.max(min, Number(i.value) || min)); i.value = String(opts[key]); save(); };
    return el('label', { className: 'field' }, label, el('span', { className: 'met-unit' }, i, unit ? ` ${unit}` : ''));
  };
  const select = (key, choices, label) => {
    const s = el('select', { ariaLabel: label }, ...Object.entries(choices).map(([v, t]) => el('option', { value: v, textContent: t })));
    s.value = opts[key];
    s.onchange = () => { opts[key] = s.value; save(); };
    return el('label', { className: 'field' }, label, s);
  };
  const sound = Object.assign(el('input', { type: 'checkbox' }), { checked: !!opts.sound, onchange: () => { opts.sound = sound.checked; save(); } });
  const start = el('button', { type: 'button', className: 'primary', textContent: 'Spustit' });
  const close = el('button', { type: 'button', className: 'icon-btn', ariaLabel: 'Zavřít', textContent: '✕' });
  const setup = el('div', { className: 'met-setup' },
    el('div', { className: 'gen-head' }, el('h2', { textContent: 'Metronom' }), close),
    el('p', { className: 'hint', textContent: 'Polož telefon pod kostku. Obrazovka bliká v tempu – na každé bliknutí udělej jeden tah, bez zastavení. Když to jde, tempo se postupně zvyšuje. Klepnutím na obrazovku pauza.' }),
    el('div', { className: 'grid-fields' },
      num('tps', 0.5, 12, 0.25, 'Tempo', 'tahů/s'),
      select('ramp', RAMPS, 'Zrychlování'),
      num('step', 0.05, 2, 0.05, 'Zrychlit o', 'tahů/s'),
      num('every', 5, 300, 5, 'Každých', 's'),
      num('max', 1, 15, 0.5, 'Nejvýš', 'tahů/s'),
      select('color', COLORS, 'Barva bliknutí')),
    el('label', { className: 'check-row' }, sound, ' Cvaknutí zvukem (i bez dívání)'),
    el('p', { className: 'hint', textContent: smartCube.connected ? 'Chytrá kostka je připojená: uvidíš, kolik tahů padlo na bliknutí.' : 'S chytrou kostkou (Nastavení → Chytrá kostka) uvidíš, kolik tahů padlo na bliknutí, a tempo se může zvyšovat jen, když stíháš.' }),
    el('div', { className: 'row-btns' }, start));

  const flash = el('div', { className: 'met-flash' });
  const big = el('b', { className: 'met-tps' });
  const info = el('small', { className: 'met-info' });
  const stopBtn = el('button', { type: 'button', className: 'secondary small met-stop', textContent: 'Konec' });
  const run = el('div', { className: 'met-run', hidden: true }, flash, el('div', { className: 'met-hud' }, big, info), stopBtn);
  const dlg = el('dialog', { className: 'met-dialog' }, setup, run);
  document.body.append(dlg);

  let m = null, raf = 0, paused = false, pausedAt = 0, lock = null, audio = null, offMove = null, lastMove = null;
  const click = () => {
    if (!opts.sound) return;
    try {
      audio ??= new AudioContext();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 1600; g.gain.value = 0.25;
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.05);
      o.connect(g).connect(audio.destination);
      o.start(); o.stop(audio.currentTime + 0.05);
    } catch { /* bez zvuku */ }
  };
  const hud = () => {
    const s = m.stats();
    big.textContent = `${fmt(m.tps)} tahů/s`;
    info.textContent = paused ? 'Pauza – klepni pro pokračování'
      : smartCube.connected && s.moves ? `na bliknutí ${Math.round(s.onBeat * 100)} % z ${s.moves} tahů` : `${s.beats} bliknutí`;
  };
  const loop = (now) => {
    if (!m || paused) return;
    if (m.tick(now)) {
      flash.classList.remove('on');
      void flash.offsetWidth; // znovu spustit animaci
      flash.classList.add('on');
      click();
      hud();
    }
    raf = requestAnimationFrame(loop);
  };
  function begin() {
    m = makeMetronome(opts, performance.now() + 600);
    setup.hidden = true;
    run.hidden = false;
    dlg.dataset.color = opts.color;
    lock = keepAwake();
    lastMove = null;
    offMove = smartCube.on('move', ({ move, t }) => {
      if (!m || paused) return;
      // dvojitý tah (U2) posílá kostka jako dva čtvrttahy – na bliknutí je to jeden tah
      const same = lastMove && lastMove.move[0] === move[0] && t - lastMove.t <= DOUBLE_GAP;
      lastMove = same ? null : { move, t };
      if (same) return;
      m.move(t);
      hud();
    });
    paused = false;
    hud();
    raf = requestAnimationFrame(loop);
  }
  function end() {
    cancelAnimationFrame(raf);
    lock?.release(); lock = null;
    offMove?.(); offMove = null;
    if (m) {
      const s = m.stats();
      // rychlejší tempo se samo zapamatuje jen ověřené chytrou kostkou (stíhal jsi), jinak
      // jde jedním klepnutím (bez kostky aplikace neví, jestli jsi stíhal)
      const tps = s.tps;
      const verified = smartCube.connected && s.moves >= 20 && (s.onBeat ?? 0) >= 0.7;
      if (opts.ramp !== 'fixed' && tps > opts.tps && verified) { opts.tps = tps; save(); }
      setup.querySelector('input').value = String(opts.tps);
      setup.querySelector('.met-last')?.remove();
      const keep = tps > opts.tps ? el('button', { type: 'button', className: 'secondary small', textContent: `Příště začít od ${fmt(tps)} tahů/s` }) : null;
      if (keep) keep.onclick = () => { opts.tps = tps; save(); setup.querySelector('input').value = String(tps); keep.remove(); };
      setup.append(el('div', { className: 'met-last hint' },
        `Naposledy: ${s.beats} bliknutí, tempo až ${fmt(tps)} tahů/s${s.moves ? `, na bliknutí ${Math.round(s.onBeat * 100)} % z ${s.moves} tahů` : ''}.`, keep ? ' ' : '', keep ?? ''));
    }
    m = null;
    run.hidden = true;
    setup.hidden = false;
  }
  start.onclick = begin;
  stopBtn.onclick = (e) => { e.stopPropagation(); end(); };
  run.onclick = () => {
    paused = !paused;
    if (paused) pausedAt = performance.now();
    else m?.resume(performance.now(), performance.now() - pausedAt);
    hud();
    if (!paused) raf = requestAnimationFrame(loop);
  };
  close.onclick = () => { end(); dlg.close(); dlg.remove(); };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); if (m) end(); else close.onclick(); });
  dlg.showModal();
  return dlg;
}
