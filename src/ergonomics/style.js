// Tři pohledy na nalezená řešení – každý řadí všechna řešení jinak:
//
//   nejrychlejší – odhad času provedení: každý tah stojí základní čas (MOVE_TIME) a k
//                  tomu jeho nepohodlnost (váhy tahů, přehmaty, rotace, změny úchopu,
//                  návaznost, triggery). Delší algoritmus tak vyhraje jen tehdy, když
//                  je opravdu o tolik plynulejší – ne jen proto, že má hodně R a U.
//   nejkratší    – co nejméně tahů; pohodlí rozhoduje jen mezi stejně dlouhými
//   vyvážené     – kombinace obou: (1 − λ) · délka + λ · čas provedení, λ volí
//                  posuvník „kratší ↔ pohodlnější“ (absolutní, takže se pořadí
//                  nemění podle toho, co se zrovna našlo)

export const VIEWS = {
  balanced: { label: 'Vyvážené', icon: '★', text: 'kompromis: krátké a zároveň rychle provedené (poměr nastavíš posuvníkem)' },
  speed: { label: 'Nejrychlejší', icon: '⚡', text: 'nejkratší čas provedení: každý tah stojí čas, nepohodlné tahy (F, B, D…), přehmaty a změny úchopu víc, plynulé triggery míň' },
  efficient: { label: 'Nejkratší', icon: '◎', text: 'co nejméně tahů – pohodlí rozhoduje jen mezi stejně dlouhými' },
};

/**
 * Základní čas tahu v jednotkách nepohodlnosti (tah R = 1): i ten nejpohodlnější tah
 * trvá. Bez něj vycházely jako „nejrychlejší“ dvakrát delší algoritmy z R a U obalené
 * tahy F (bonusy triggerů je srazily pod krátký algoritmus s půlotáčkami).
 */
export const MOVE_TIME = 0.6;

const HOME = new Set(['R', 'U', 'r']);

/**
 * Ukazatele algoritmu ze skóre: délka, podíl tahů R/U (jen kostky), počet přehmatů
 * a rotací a nepohodlnost na tah (fluency, nižší = příjemnější).
 */
export function styleMetrics(score, cube = true) {
  const n = score.metrics?.htm || score.perMove?.length || 1;
  const turns = (score.perMove ?? []).filter((m) => m.move && m.move !== '/');
  const home = turns.filter((m) => HOME.has(m.move[0])).length;
  return {
    length: n,
    ru: cube && turns.length ? home / turns.length : null,
    regrips: (score.perMove ?? []).filter((m) => m.regrip > 0).length,
    rotations: (score.perMove ?? []).filter((m) => m.rotation > 0).length,
    // nepříjemná místa: špatná návaznost tahů nebo změna úchopu
    rough: (score.perMove ?? []).filter((m) => m.flowReason || m.gripChange > 0).length,
    fluency: score.total / n,
    total: score.total,
  };
}

/**
 * Hodnota pro rychlost (nižší = lepší): odhad času provedení = nepohodlnost + základní
 * čas každého tahu; při shodě kratší.
 */
export const speedValue = (m) => m.total + MOVE_TIME * m.length;
export const speedKey = (m) => [speedValue(m), m.length];

/** Výchozí poměr všestranného pohledu (0 = jen délka, 1 = jen pohodlí). */
export const DEFAULT_LAMBDA = 0.5;
/** Hodnota všestranného pohledu (nižší = lepší). */
export const balancedValue = (m, lambda = DEFAULT_LAMBDA) => (1 - lambda) * m.length + lambda * speedValue(m);

const lex = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
const COMPARE = {
  speed: () => (a, b) => lex(speedKey(a.m), speedKey(b.m)) || a.m.length - b.m.length,
  efficient: () => (a, b) => a.m.length - b.m.length || a.m.total - b.m.total,
  balanced: (lambda) => (a, b) => balancedValue(a.m, lambda) - balancedValue(b.m, lambda) || a.m.total - b.m.total,
};

/**
 * Seřadí výsledky podle pohledu.
 * @param {{m: ReturnType<typeof styleMetrics>}[]} list
 * @param {'balanced'|'speed'|'efficient'} view
 * @param {{lambda?: number}} [opts]
 */
export function rankResults(list, view, { lambda = DEFAULT_LAMBDA } = {}) {
  return [...list].sort((COMPARE[view] ?? COMPARE.balanced)(lambda));
}

/** Pořadí každého výsledku ve všech pohledech: Map(položka → {balanced, speed, efficient}) (od 1). */
export function ranksOf(list, opts) {
  const out = new Map(list.map((x) => [x, {}]));
  for (const view of Object.keys(VIEWS)) rankResults(list, view, opts).forEach((x, i) => { out.get(x)[view] = i + 1; });
  return out;
}

/**
 * Paretova hranice délka × pohodlí: výsledky, které nejde zlepšit v jednom bez
 * zhoršení druhého (pro každou délku nejpohodlnější, pokud je pohodlnější než
 * všechny kratší). Seřazené od nejkratšího.
 */
export function paretoFront(list) {
  const sorted = [...list].sort((a, b) => a.m.length - b.m.length || speedValue(a.m) - speedValue(b.m));
  const out = [];
  let bestSpeed = Infinity;
  for (const x of sorted) {
    const v = speedValue(x.m);
    if (v < bestSpeed - 1e-9) { out.push(x); bestSpeed = v; }
  }
  return out;
}
