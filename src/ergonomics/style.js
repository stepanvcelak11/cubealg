// Styl algoritmu: pro koho se spíš hodí. Hodnotí se vůči ostatním nalezeným
// řešením téhož zadání.
//
//   efektivní   – nejkratší nalezený (nejmíň tahů), i když tahy nejsou nejpohodlnější;
//                 pro přesné, pomalejší otáčení
//   všestranný  – nejkratší nebo o tah delší a zároveň plynulý
//   rychlostní  – delší, ale plynulý: bez přehmatů a rotací, s dobrou návazností
//                 tahů a celkově pohodlný; pro agresivní otáčení s vysokým TPS
//
// „Plynulý“ = bez přehmatů zápěstí a rotací a s nepohodlností na tah (včetně
// návaznosti tahů a bonusů za triggery) v lepší polovině výsledků bez přehmatů.

export const STYLES = {
  efficient: { label: 'Efektivní', icon: '◎', text: 'nejmíň tahů, tahy ale nejsou nejpohodlnější – pro přesné, pomalejší otáčení' },
  balanced: { label: 'Všestranný', icon: '★', text: 'krátký a zároveň plynulý – sedne skoro každému' },
  speed: { label: 'Rychlostní', icon: '⚡', text: 'víc tahů, ale plynulé bez přehmatů – pro agresivní otáčení s vysokým TPS' },
};

const HOME = new Set(['R', 'U', 'r']);

/**
 * Ukazatele algoritmu ze skóre: délka, podíl tahů R/U (jen kostky), počet přehmatů
 * a rotací a plynulost = nepohodlnost na tah (nižší = plynulejší).
 */
export function styleMetrics(score, cube = true) {
  const n = score.metrics?.htm || score.perMove?.length || 1;
  const turns = (score.perMove ?? []).filter((m) => m.move && m.move !== '/');
  const home = turns.filter((m) => HOME.has(m.move[0])).length;
  const b = score.breakdown ?? {};
  return {
    length: n,
    ru: cube && turns.length ? home / turns.length : null,
    regrips: (score.perMove ?? []).filter((m) => m.regrip > 0).length,
    rotations: (score.perMove ?? []).filter((m) => m.rotation > 0).length,
    fluency: score.total / n,
    flow: b.flow ?? 0,
    total: score.total,
  };
}

const quantile = (xs, q) => {
  if (!xs.length) return Infinity;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
};

/** Kontext pro zařazení: nejkratší délka, hranice plynulosti a medián celkového skóre. */
export function styleContext(metricsList) {
  if (!metricsList.length) return null;
  const clean = metricsList.filter((m) => !m.regrips && !m.rotations);
  return {
    minLength: Math.min(...metricsList.map((m) => m.length)),
    fluent: quantile((clean.length ? clean : metricsList).map((m) => m.fluency), 0.5),
    medianTotal: quantile(metricsList.map((m) => m.total), 0.5),
  };
}

/** Plynulý algoritmus: bez přehmatů a rotací, nepohodlnost na tah v lepší polovině. */
export const isFluent = (m, ctx) => !m.regrips && !m.rotations && m.fluency <= ctx.fluent + 1e-9;

/** Styl algoritmu ('efficient' | 'balanced' | 'speed' | null) vůči ostatním výsledkům. */
export function classify(m, ctx) {
  if (!ctx) return null;
  const fluent = isFluent(m, ctx);
  if (fluent && m.length <= ctx.minLength + 1) return 'balanced';
  if (m.length === ctx.minLength) return 'efficient';
  if (fluent && m.total <= ctx.medianTotal + 1e-9) return 'speed';
  return null;
}
