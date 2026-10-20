// Tři pohledy na nalezená řešení – každý řadí všechna řešení jinak:
//
//   rychlost    – příjemné skládání: nejdřív co nejméně přehmatů a rotací, pak
//                 co nejméně míst se špatnou návazností nebo změnou úchopu, pak
//                 celková nepohodlnost (váhy tahů, návaznost, triggery)
//   efektivita  – co nejméně tahů; pohodlí rozhoduje jen mezi stejně dlouhými
//   všestranné  – kombinace obou: součet percentilu délky a percentilu rychlosti

export const VIEWS = {
  balanced: { label: 'Všestranné', icon: '★', text: 'kombinace obou: málo tahů i příjemné skládání' },
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

const lex = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
const COMPARE = {
  speed: (a, b) => lex(speedKey(a.m), speedKey(b.m)) || a.m.length - b.m.length,
  efficient: (a, b) => a.m.length - b.m.length || a.m.total - b.m.total,
};

/**
 * Seřadí výsledky podle pohledu.
 * @param {{m: ReturnType<typeof styleMetrics>}[]} list
 * @param {'balanced'|'speed'|'efficient'} view
 */
export function rankResults(list, view) {
  if (view !== 'balanced') return [...list].sort(COMPARE[view] ?? COMPARE.speed);
  // normuje se pořadím (percentil se shodami), takže jeden extrém nerozhodí škálu
  const pct = (value) => {
    const sorted = list.map(value).sort((a, b) => a - b);
    const n = Math.max(1, sorted.length - 1);
    const at = new Map();
    sorted.forEach((v, i) => { const r = at.get(v); at.set(v, r ? { sum: r.sum + i, k: r.k + 1 } : { sum: i, k: 1 }); });
    return (x) => { const r = at.get(value(x)); return r.sum / r.k / n; };
  };
  const len = pct((x) => x.m.length), speed = pct((x) => speedValue(x.m));
  const key = new Map(list.map((x) => [x, len(x) + speed(x)]));
  return [...list].sort((a, b) => key.get(a) - key.get(b) || a.m.total - b.m.total);
}

/** Pořadí každého výsledku ve všech pohledech: Map(položka → {balanced, speed, efficient}) (od 1). */
export function ranksOf(list) {
  const out = new Map(list.map((x) => [x, {}]));
  for (const view of Object.keys(VIEWS)) rankResults(list, view).forEach((x, i) => { out.get(x)[view] = i + 1; });
  return out;
}
