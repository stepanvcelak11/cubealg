// Tři pohledy na nalezená řešení – každý řadí všechna řešení jinak:
//
//   rychlost    – příjemné skládání: nejdřív co nejméně přehmatů a rotací, pak
//                 co nejméně míst se špatnou návazností nebo změnou úchopu, pak
//                 celková nepohodlnost (váhy tahů, návaznost, triggery)
//   efektivita  – co nejméně tahů; pohodlí rozhoduje jen mezi stejně dlouhými
//   všestranné  – kombinace obou: (1 − λ) · délka + λ · hodnota rychlosti, λ volí
//                 posuvník „kratší ↔ pohodlnější“ (absolutní, takže se pořadí
//                 nemění podle toho, co se zrovna našlo)

export const VIEWS = {
  balanced: { label: 'Všestranné', icon: '★', text: 'kombinace obou: málo tahů i příjemné skládání (poměr nastavíš posuvníkem)' },
  speed: { label: 'Rychlost', icon: '⚡', text: 'příjemné skládání: co nejméně přehmatů a rotací, pak co nejméně nešikovných návazností a úchopů' },
  efficient: { label: 'Efektivita', icon: '◎', text: 'co nejméně tahů – pohodlí rozhoduje jen mezi stejně dlouhými' },
};

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
 * Hodnota pro rychlost (lexikograficky, nižší = lepší): přehmaty a rotace, pak
 * nepříjemná místa (špatná návaznost, změna úchopu), pak celková nepohodlnost.
 * Celková (ne na tah), aby se nevyplatilo algoritmus natahovat levnými tahy.
 */
export const speedKey = (m) => [m.regrips + m.rotations, m.rough, m.total];
/** Jedno číslo rychlosti pro kombinaci ve všestranném pohledu. */
export const speedValue = (m) => 2 * (m.regrips + m.rotations) + 0.5 * m.rough + m.total;

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
