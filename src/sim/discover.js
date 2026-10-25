// Objevitel metod: z tvé metody navrhne úpravy, které test metody pak ohodnotí na stejných
// zamícháních (odhad času, tahy, kolik algoritmů je potřeba). Úpravy:
//   spojit    – krok se složí naráz s dalším (méně pauz; víc případů / delší hledání)
//   volnost   – krok smí skončit i jinde: pár do kteréhokoli slotu, blok na kterémkoli boku,
//               první krok i s protilehlou barvou dole (barevná neutralita)
//   algoritmy – intuitivní krok dělat naučenými algoritmy (rychlejší tempo, víc učení)
//   intuitivně – krok s algoritmy dělat intuitivně (méně učení, pomalejší)
// Každý návrh = změny nastavení kroků { stepId: patch } (st.sim), nic jiného se nemění.

const FREE_NEXT = { fixed: ['side', 'dual'], side: ['dualSide'], dual: ['dualSide'], dualSide: ['all'] };
const FREE_TEXT = {
  side: 'smí skončit na kterémkoli boku (pár do kteréhokoli slotu)',
  dual: 'i s protilehlou barvou dole (barevná neutralita dvou barev)',
  dualSide: 'protilehlá barva dole i kterýkoli bok',
  all: 'na kterékoli straně (plná barevná neutralita)',
};

/**
 * @param {{steps: object[]}} guide
 * @param {(st) => object} cfgOf nastavení kroku (stepConfig)
 * @param {(st) => boolean} hasParts krok něco skládá (ne jen „jen někdy“)
 * @returns {{id: string, kind: string, label: string, why: string, patch: Record<string, object>}[]}
 */
export function proposals(guide, cfgOf, hasParts = () => true) {
  const steps = guide.steps.filter((st) => hasParts(st) || cfgOf(st).solveBy === 'fixed');
  const out = [];
  const name = (st, i) => `„${st.title || `Krok ${i + 1}`}“`;
  const real = steps.filter((st) => cfgOf(st).solveBy !== 'fixed' && cfgOf(st).on !== false);
  real.forEach((st, k) => {
    const cfg = cfgOf(st);
    const i = guide.steps.indexOf(st);
    // spojit s dalším krokem (poslední krok se spojit nedá)
    const next = real[k + 1];
    if (next) out.push({
      id: `merge:${st.id}`, kind: 'spojit', label: `Spojit ${name(st, i)} s ${name(next, guide.steps.indexOf(next))}`,
      why: 'Jeden krok místo dvou: méně pauz na rozpoznání, často méně tahů – ale víc případů (algoritmů) nebo delší přemýšlení.',
      patch: { [st.id]: { on: false } },
    });
    // volnost
    for (const f of FREE_NEXT[cfg.free ?? 'fixed'] ?? []) {
      if ((f === 'dual' || f === 'dualSide' || f === 'all') && k > 0) continue; // barevná neutralita jen u prvního kroku
      out.push({ id: `free:${st.id}:${f}`, kind: 'volnost', label: `${name(st, i)} ${FREE_TEXT[f]}`, why: 'Víc možností, kde krok skončí = kratší řešení; zvykat si na víc pohledů.', patch: { [st.id]: { free: f } } });
    }
    // algoritmy ↔ intuitivně
    const by = cfg.solveBy ?? (cfg.kind === 'alg' ? 'generate' : 'intuitive');
    if (by === 'intuitive' && k > 0) out.push({
      id: `alg:${st.id}`, kind: 'algoritmy', label: `${name(st, i)} naučenými algoritmy`,
      why: 'Algoritmy jdou rychleji než vymýšlení (vyšší tempo, kratší rozpoznání) – za cenu učení.',
      patch: { [st.id]: { solveBy: 'generate', kind: 'alg' } },
    });
    if ((by === 'generate' || by === 'own') && cfg.kind === 'alg') out.push({
      id: `intu:${st.id}`, kind: 'intuitivně', label: `${name(st, i)} intuitivně (bez algoritmů)`,
      why: 'Méně učení; pomalejší tempo a delší přemýšlení.',
      patch: { [st.id]: { solveBy: 'intuitive', kind: 'intuitive', mode: 'search' } },
    });
  });
  return out;
}

/** Použije změny návrhu na nastavení kroků (kopie). */
export function applyPatch(config, patch) {
  const out = { ...config };
  for (const [id, p] of Object.entries(patch)) out[id] = { ...(out[id] ?? {}), ...p };
  return out;
}

/** Spojí dva návrhy (různé kroky nebo různé vlastnosti) – pro druhé kolo. */
export function combine(a, b) {
  const patch = { ...a.patch };
  for (const [id, p] of Object.entries(b.patch)) {
    if (patch[id] && Object.keys(p).some((k) => k in patch[id])) return null;
    patch[id] = { ...(patch[id] ?? {}), ...p };
  }
  return { id: `${a.id}+${b.id}`, kind: 'kombinace', label: `${a.label} + ${b.label}`, why: 'Dvě nejlepší úpravy dohromady.', patch };
}
