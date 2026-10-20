// Styl algoritmu: pro koho se spíš hodí.
//
//   rychlostní  – delší, ale pohodlné tahy (hodně R a U, málo přehmatů);
//                 sedí agresivnímu otáčení s vysokým TPS
//   efektivní   – krátký, ale s náročnějšími tahy; sedí přesnému, pomalejšímu otáčení
//   všestranný  – krátký i pohodlný
//
// Hodnotí se vůči ostatním nalezeným řešením téhož zadání: „krátký“ = nejvýš o tah
// delší než nejkratší nalezené, „pohodlný“ = průměrná náročnost tahu nejvýš medián.

export const STYLES = {
  speed: { label: 'Rychlostní', icon: '⚡', text: 'delší, ale pohodlné tahy – pro agresivní otáčení s vysokým TPS' },
  efficient: { label: 'Efektivní', icon: '◎', text: 'krátký, ale s náročnějšími tahy – pro přesné, pomalejší otáčení' },
  balanced: { label: 'Všestranný', icon: '★', text: 'krátký i pohodlný – sedne skoro každému' },
};

const HOME = new Set(['R', 'U', 'r']);

/** Ukazatele algoritmu ze skóre: délka, podíl tahů R/U (jen kostky), průměrná náročnost tahu. */
export function styleMetrics(score, cube = true) {
  const n = score.metrics?.htm || score.perMove?.length || 1;
  const turns = (score.perMove ?? []).filter((m) => m.move && m.move !== '/');
  const home = turns.filter((m) => HOME.has(m.move[0])).length;
  return {
    length: n,
    ru: cube && turns.length ? home / turns.length : null,
    ease: score.total / n,
  };
}

/** Kontext pro zařazení: nejkratší délka a medián náročnosti mezi výsledky. */
export function styleContext(metricsList) {
  if (!metricsList.length) return null;
  const eases = metricsList.map((m) => m.ease).sort((a, b) => a - b);
  return {
    minLength: Math.min(...metricsList.map((m) => m.length)),
    medianEase: eases[Math.floor((eases.length - 1) / 2)],
  };
}

/** Styl algoritmu ('speed' | 'efficient' | 'balanced' | null) vůči ostatním výsledkům. */
export function classify(m, ctx) {
  if (!ctx) return null;
  const short = m.length <= ctx.minLength + 1;
  const easy = m.ease <= ctx.medianEase + 1e-9 || (m.ru !== null && m.ru >= 0.75 && m.ease <= ctx.medianEase * 1.15);
  if (short && easy) return 'balanced';
  if (short) return 'efficient';
  if (easy) return 'speed';
  return null;
}
