// Vizuální metronom pro plynulé točení: každé bliknutí = jeden tah. Logika bez rozhraní:
// tempo a jeho zvyšování, a s chytrou kostkou vyhodnocení, jestli tahy padají na bliknutí.
//
// Zrychlování:
//   'fixed' – stálé tempo
//   'time'  – každých `every` sekund o `step` tahů/s (až do `max`)
//   'keep'  – jen když stíháš: po každých `every` sekundách, kdy aspoň 80 % tahů padlo na
//             bliknutí (chytrá kostka), o `step` výš; když nestíháš (pod 60 %), o `step` níž

export const RAMPS = { fixed: 'Stálé tempo', time: 'Postupně zrychlovat', keep: 'Zrychlovat, když stíhám (chytrá kostka)' };
export const METRONOME_DEFAULTS = { tps: 3, ramp: 'time', step: 0.25, every: 20, max: 12, sound: false, color: 'white' };

/**
 * Stav metronomu: tempo, časy úderů a hodnocení tahů.
 * @param {typeof METRONOME_DEFAULTS} opts
 * @param {number} t0 čas startu (ms)
 */
export function makeMetronome(opts, t0) {
  const o = { ...METRONOME_DEFAULTS, ...opts };
  let tps = o.tps, beatAt = t0, beats = 0, phaseStart = t0;
  const window = { hits: 0, moves: 0 }; // tahy v aktuálním úseku (pro „když stíhám“)
  const total = { hits: 0, moves: 0, beats: 0 };
  let lastBeat = t0;
  const clampT = (v) => Math.round(Math.min(o.max, Math.max(0.5, v)) * 100) / 100;
  return {
    get tps() { return tps; },
    get beats() { return beats; },
    stats: () => ({ ...total, onBeat: total.moves ? total.hits / total.moves : null, tps }),
    /** Další úder (ms) – volat, dokud now ≥ next(); vrací true, když teď nastal úder. */
    tick(now) {
      if (now < beatAt) return false;
      lastBeat = beatAt;
      beats++;
      total.beats++;
      beatAt += 1000 / tps;
      // zrychlování
      if (o.ramp !== 'fixed' && now - phaseStart >= o.every * 1000) {
        if (o.ramp === 'time') tps = clampT(tps + o.step);
        else if (window.moves >= 4) {
          const rate = window.hits / window.moves;
          if (rate >= 0.8) tps = clampT(tps + o.step);
          else if (rate < 0.6) tps = clampT(tps - o.step);
        }
        phaseStart = now;
        window.hits = 0; window.moves = 0;
      }
      if (now - beatAt > 1000) beatAt = now + 1000 / tps; // po pauze (skrytá karta) nenaskakovat
      return true;
    },
    /** Tah z chytré kostky v čase t: na bliknutí (do čtvrtiny periody od nejbližšího úderu)? */
    move(t) {
      const period = 1000 / tps;
      const off = Math.min(Math.abs(t - lastBeat), Math.abs(beatAt - t));
      const hit = off <= period / 4;
      window.moves++; total.moves++;
      if (hit) { window.hits++; total.hits++; }
      return hit;
    },
    /** Změna tempa ručně. */
    set(v) { tps = clampT(v); },
  };
}
