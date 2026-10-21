// Hodiny hledání. Normálně skutečný čas; v opakovatelném režimu (měření kvality,
// testy) virtuální čas, který běží podle odvedené práce (prohledané stavy, ohodnocené
// varianty) – stejné zadání pak dá při každém spuštění stejný výsledek bez ohledu
// na rychlost počítače a zatížení. Náhoda (pořadí zkoušených úseků) je pak také
// pevná (semínko).

/** Kolik prohledaných stavů odpovídá jedné milisekundě virtuálního času. */
export const NODES_PER_MS = 3000;

let virtual = null; // { t: virtuální čas v ms }
let seed = 0x9e3779b9;

export const clock = {
  now: () => (virtual ? virtual.t : Date.now()),
  /** Odvedená práce (v ms virtuálního času). */
  tick(ms) { if (virtual) virtual.t += ms; },
  /** Prohledané stavy → virtuální čas. */
  nodes(count) { if (virtual) virtual.t += count / NODES_PER_MS; },
  get virtual() { return !!virtual; },
  /** Zapne/vypne opakovatelný režim (a nastaví semínko náhody). */
  setVirtual(on, s = 1) { virtual = on ? { t: 0 } : null; seed = (s * 0x9e3779b9) >>> 0 || 1; },
};

/** Náhodné číslo 0…1: v opakovatelném režimu ze semínka, jinak Math.random. */
export function random() {
  if (!virtual) return Math.random();
  // xorshift32
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 4294967296;
}
