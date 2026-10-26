// Objevitel metod: z tvé metody navrhne úpravy, které test metody pak ohodnotí na stejných
// zamícháních (odhad času, tahy, kolik algoritmů je potřeba). Návrhy jsou od drobných po
// „brutální“ přestavby (úroveň 1–3):
//   1 drobné   volnost (pár do kteréhokoli slotu, barevná neutralita), algoritmy místo
//              intuice a naopak
//   2 větší    spojit dva kroky, rozdělit krok na natočení a permutaci (2-look), nejdřív
//              hrany a pak rohy, prohodit pořadí dvou kroků
//   3 brutální spojit tři kroky, natočit všechny hrany hned v prvním kroku (jako EOLine
//              u ZZ), natočit zbylé hrany před koncem (jako ZBLS), přestavět celý konec
//              metody (natočení + permutace, hrany + rohy, všechno naráz)
// Návrh je buď změna nastavení kroků { stepId: patch } (st.sim), nebo nové kroky metody
// (`steps`) – ty se dají uložit jako nová metoda.

import { stepParts, mergeParts } from '../ui/parts.js';
import { slotByName } from '../core/geometry.js';
import { isGroupCell } from '../core/cells.js';

const FREE_NEXT = { fixed: ['side', 'dual'], side: ['dualSide'], dual: ['dualSide'], dualSide: ['all'] };
const FREE_TEXT = {
  side: 'smí skončit na kterémkoli boku (pár do kteréhokoli slotu)',
  dual: 'i s protilehlou barvou dole (barevná neutralita dvou barev)',
  dualSide: 'protilehlá barva dole i kterýkoli bok',
  all: 'na kterékoli straně (plná barevná neutralita)',
};
export const LEVEL_TEXT = { 1: 'drobná', 2: 'větší', 3: 'brutální' };

const typeOf = (n) => { try { return slotByName(n).type; } catch { return null; } };
const isPiece = (n) => ['edge', 'corner'].includes(typeOf(n));

/**
 * @param {{steps: object[]}} guide
 * @param {(st) => object} cfgOf nastavení kroku (stepConfig)
 * @param {(st) => boolean} hasParts krok něco skládá (ne jen „jen někdy“)
 * @param {{level?: 1|2|3, newId?: () => string}} [opts] nejvyšší úroveň návrhů; id nových kroků
 * @returns {{id, kind, level, label, why, patch, steps?}[]}
 */
export function proposals(guide, cfgOf, hasParts = () => true, { level = 3, newId } = {}) {
  let seq = 0;
  const makeId = newId ?? (() => `n${Date.now().toString(36)}${++seq}`);
  const steps = guide.steps.filter((st) => hasParts(st) || cfgOf(st).solveBy === 'fixed');
  const out = [];
  const add = (p) => { if (p.level <= level) out.push({ patch: {}, ...p }); };
  const name = (st) => `„${st.title || `Krok ${guide.steps.indexOf(st) + 1}`}“`;
  const real = steps.filter((st) => cfgOf(st).solveBy !== 'fixed' && cfgOf(st).on !== false);

  // --- 1–2: nastavení kroků -------------------------------------------------------------
  real.forEach((st, k) => {
    const cfg = cfgOf(st);
    const next = real[k + 1];
    if (next) add({
      id: `merge:${st.id}`, kind: 'spojit', level: 2, label: `Spojit ${name(st)} s ${name(next)}`,
      why: 'Jeden krok místo dvou: méně pauz na rozpoznání, často méně tahů – ale víc případů (algoritmů) nebo delší přemýšlení.',
      patch: { [st.id]: { on: false } },
    });
    const third = real[k + 2];
    if (next && third) add({
      id: `merge3:${st.id}`, kind: 'spojit', level: 3, label: `Spojit ${name(st)}, ${name(next)} a ${name(third)} do jednoho kroku`,
      why: 'Velký skok: tři kroky naráz. Méně zastavení, ale krok je mnohem složitější (hodně případů nebo dlouhé vymýšlení).',
      patch: { [st.id]: { on: false }, [next.id]: { on: false } },
    });
    for (const f of FREE_NEXT[cfg.free ?? 'fixed'] ?? []) {
      if ((f === 'dual' || f === 'dualSide' || f === 'all') && k > 0) continue; // barevná neutralita jen u prvního kroku
      add({ id: `free:${st.id}:${f}`, kind: 'volnost', level: 1, label: `${name(st)} ${FREE_TEXT[f]}`, why: 'Víc možností, kde krok skončí = kratší řešení; zvykat si na víc pohledů.', patch: { [st.id]: { free: f } } });
    }
    const by = cfg.solveBy ?? (cfg.kind === 'alg' ? 'generate' : 'intuitive');
    if (by === 'intuitive' && k > 0) add({
      id: `alg:${st.id}`, kind: 'algoritmy', level: 1, label: `${name(st)} naučenými algoritmy`,
      why: 'Algoritmy jdou rychleji než vymýšlení (vyšší tempo, kratší rozpoznání) – za cenu učení.',
      patch: { [st.id]: { solveBy: 'generate', kind: 'alg' } },
    });
    if ((by === 'generate' || by === 'own') && cfg.kind === 'alg') add({
      id: `intu:${st.id}`, kind: 'intuitivně', level: 1, label: `${name(st)} intuitivně (bez algoritmů)`,
      why: 'Méně učení; pomalejší tempo a delší přemýšlení.',
      patch: { [st.id]: { solveBy: 'intuitive', kind: 'intuitive', mode: 'search' } },
    });
  });

  // --- 2–3: přestavby (nové kroky) ------------------------------------------------------
  // krok jde přestavět, když je zadaný dílky (ne pravidly pro skupiny dílků); buňka
  // „některý z dílků, správně natočený“ (OLL: natočit horní vrstvu) = natočení
  const oriCell = (c) => c?.pieces && c.ori === 'correct';
  const simple = (st) => !st.rules?.length && Object.values(st.cells ?? {}).every((c) => !isGroupCell(c) || oriCell(c));
  const partsOf = (st) => mergeParts(stepParts(st), Object.fromEntries(Object.entries(st.cells ?? {}).filter(([n, c]) => oriCell(c) && isPiece(n)).map(([n]) => [n, 'orientation'])));
  const beforeOf = (st) => guide.steps.slice(0, guide.steps.indexOf(st)).reduce((acc, x) => mergeParts(acc, partsOf(x)), {});
  const own = (st) => {
    const before = beforeOf(st);
    return Object.fromEntries(Object.entries(partsOf(st)).filter(([n, s]) => isPiece(n) && before[n] !== 'solved' && before[n] !== s));
  };
  const step = (title, parts, sim, text = '') => ({ id: makeId(), title, text, parts, sim });
  // změněný krok: jeho vygenerované algoritmy už neplatí – sada se při testu vytvoří znovu
  const fresh = (st, extra = {}) => {
    const cfg = cfgOf(st);
    const sim = { ...(st.sim ?? {}), ...extra };
    delete sim.genSig;
    if (cfg.kind === 'alg' && cfg.solveBy !== 'fixed') sim.solveBy = 'generate';
    const { set: _, ...rest } = st;
    return { ...rest, sim };
  };
  // kroky metody s náhradou: map id → [nové kroky]
  const rebuild = (map) => guide.steps.flatMap((st) => map[st.id] ?? [st]);
  const algSim = (cfg) => ({ kind: 'alg', solveBy: 'generate', recog: cfg.recog ?? 0.5 });
  const sameSim = (cfg) => (cfg.kind === 'alg' ? algSim(cfg) : { kind: cfg.kind ?? 'intuitive', solveBy: 'intuitive', mode: 'search', recog: cfg.recog ?? 0.3 });
  const pick = (parts, f) => Object.fromEntries(Object.entries(parts).filter(([n, s]) => f(n, s)));

  real.forEach((st, k) => {
    if (!simple(st)) return;
    const cfg = cfgOf(st);
    const P = own(st);
    const before = beforeOf(st);
    // rozdělit na natočení a permutaci (2-look)
    const orient = Object.keys(pick(P, (n, s) => s === 'solved' && before[n] !== 'orientation'));
    if (orient.length >= 4) add({
      id: `split-op:${st.id}`, kind: 'rozdělit', level: 2, label: `Rozdělit ${name(st)} na natočení a permutaci`,
      why: 'Dva menší kroky (jako 2-look OLL/PLL): mnohem méně případů na naučení, ale krok a rozpoznání navíc.',
      steps: rebuild({ [st.id]: [step(`${st.title || 'Krok'} – natočení`, Object.fromEntries(orient.map((n) => [n, 'orientation'])), sameSim(cfg)), fresh(st)] }),
    });
    // nejdřív hrany, pak rohy (a naopak)
    const solved = pick(P, (n, s) => s === 'solved');
    const edges = Object.keys(solved).filter((n) => typeOf(n) === 'edge'), corners = Object.keys(solved).filter((n) => typeOf(n) === 'corner');
    if (edges.length >= 2 && corners.length >= 2) {
      for (const [first, label] of [[edges, 'hrany'], [corners, 'rohy']]) add({
        id: `split-${label}:${st.id}`, kind: 'rozdělit', level: 2, label: `${name(st)}: nejdřív ${label}, pak ${label === 'hrany' ? 'rohy' : 'hrany'}`,
        why: 'Krok na dva jednodušší: každý má méně případů a snáz se rozpoznává; tahů bývá víc.',
        steps: rebuild({ [st.id]: [step(`${st.title || 'Krok'} – ${label}`, Object.fromEntries(first.map((n) => [n, 'solved'])), sameSim(cfg)), fresh(st)] }),
      });
    }
    // prohodit pořadí s dalším krokem (nezávislé dílky)
    const next = real[k + 1];
    // mezi kroky nesmí být krok „jen někdy“ (parita) – ten patří přesně mezi ně
    const between = (a, b) => guide.steps.slice(guide.steps.indexOf(a) + 1, guide.steps.indexOf(b)).some((x) => cfgOf(x).solveBy === 'fixed');
    if (next && simple(next) && !between(st, next)) {
      const Q = own(next);
      if (Object.keys(P).length && Object.keys(Q).length && !Object.keys(Q).some((n) => n in P)) add({
        id: `swap:${st.id}`, kind: 'pořadí', level: 2, label: `Prohodit pořadí: ${name(next)} před ${name(st)}`,
        why: 'Jiné pořadí mění, co je volné k tahům: někdy se další krok skládá snáz (víc místa), jindy hůř.',
        steps: (() => { const s = guide.steps.slice(); const a = s.indexOf(st), b = s.indexOf(next); [s[a], s[b]] = [fresh(next), fresh(st)]; return s; })(),
      });
    }
  });

  // natočení hran: všechny hrany, které metoda složí, natočit už v kroku st
  const allEdges = Object.keys(guide.steps.reduce((acc, st) => mergeParts(acc, partsOf(st)), {})).filter((n) => typeOf(n) === 'edge');
  const eoAt = (st, label, why, id) => {
    if (!st || !simple(st)) return;
    const before = mergeParts(beforeOf(st), partsOf(st));
    const eo = allEdges.filter((n) => !before[n]);
    if (eo.length < 3) return;
    const parts = mergeParts(stepParts(st), Object.fromEntries(eo.map((n) => [n, 'orientation'])));
    add({ id, kind: 'hrany', level: 3, label, why, steps: rebuild({ [st.id]: [{ ...fresh(st), parts, cells: undefined }] }) });
  };
  eoAt(real[0], `Natočit všechny hrany už v ${name(real[0] ?? {})} (jako EOLine u ZZ)`,
    'Delší první krok, ale potom žádná otočená hrana: další kroky jdou bez F a B (plynulejší) a konec má méně případů.', 'eo-first');
  if (real.length >= 4) eoAt(real.at(-3), `Při ${name(real.at(-3))} natočit i zbylé hrany (jako ZBLS)`,
    'Poslední vrstva pak nemá otočené hrany: méně případů na konci, ale složitější krok před ním.', 'eo-late');

  // přestavba konce metody: poslední 2 nebo 3 kroky jinak
  for (const t of [2, 3]) {
    if (real.length <= t) continue;
    const tail = real.slice(-t);
    if (!tail.every(simple)) continue;
    if (guide.steps.slice(guide.steps.indexOf(tail[0])).some((x) => cfgOf(x).solveBy === 'fixed')) continue;
    const T = tail.reduce((acc, st) => mergeParts(acc, own(st)), {});
    const pieces = Object.keys(T).filter(isPiece);
    if (pieces.length < 4) continue;
    const cfg = cfgOf(tail.at(-1));
    const map = Object.fromEntries(tail.map((st) => [st.id, []]));
    const which = `${t === 2 ? 'poslední dva kroky' : 'poslední tři kroky'} (${tail.map(name).join(', ')})`;
    const all = Object.fromEntries(pieces.map((n) => [n, 'solved']));
    const ori = Object.fromEntries(pieces.map((n) => [n, 'orientation']));
    const e = pieces.filter((n) => typeOf(n) === 'edge'), c = pieces.filter((n) => typeOf(n) === 'corner');
    const at = (list) => { const m = { ...map }; m[tail[0].id] = list; return m; };
    add({ id: `tail-op:${t}`, kind: 'konec', level: 3, label: `Přestavět ${which}: natočit všechno, pak všechno složit`,
      why: 'Konec ve dvou algoritmických krocích (jako OLL + PLL) místo tvých kroků.',
      steps: rebuild(at([step('Natočení zbytku', ori, algSim(cfg)), step('Permutace zbytku', all, algSim(cfg))])) });
    if (e.length >= 2 && c.length >= 2) add({ id: `tail-ec:${t}`, kind: 'konec', level: 3, label: `Přestavět ${which}: nejdřív všechny hrany, pak rohy`,
      why: 'Konec jako u metod „nejdřív hrany“: každý krok má méně případů.',
      steps: rebuild(at([step('Hrany zbytku', Object.fromEntries(e.map((n) => [n, 'solved'])), algSim(cfg)), step('Rohy zbytku', all, algSim(cfg))])) });
    if (t === 3) add({ id: 'tail-one:3', kind: 'konec', level: 3, label: `Přestavět ${which}: všechno jedním algoritmem`,
      why: 'Nejbrutálnější varianta: jeden krok na celý zbytek – nejméně zastavení, ale obrovská sada algoritmů.',
      steps: rebuild(at([step('Zbytek naráz', all, algSim(cfg))])) });
  }
  // přestavba, která dá stejné kroky jako tvoje metoda (třeba konec „natočit, pak složit“
  // u CFOP), se vynechá
  const shape = (list) => JSON.stringify(list.filter((st) => cfgOf(st).solveBy !== 'fixed' && cfgOf(st).on !== false).map((st) => {
    const before = list.slice(0, list.indexOf(st)).reduce((acc, x) => mergeParts(acc, partsOf(x)), {});
    return Object.entries(partsOf(st)).filter(([n, v]) => isPiece(n) && before[n] !== 'solved' && before[n] !== v).sort().join(',');
  }));
  const mine = shape(guide.steps);
  return out.filter((p) => !p.steps || shape(p.steps) !== mine);
}

/** Použije změny návrhu na nastavení kroků (kopie). */
export function applyPatch(config, patch) {
  const out = { ...config };
  for (const [id, p] of Object.entries(patch)) out[id] = { ...(out[id] ?? {}), ...p };
  return out;
}

/** Spojí dva návrhy (různé kroky nebo různé vlastnosti) – pro druhé kolo; přestavby se nespojují. */
export function combine(a, b) {
  if (a.steps || b.steps) return null;
  const patch = { ...a.patch };
  for (const [id, p] of Object.entries(b.patch)) {
    if (patch[id] && Object.keys(p).some((k) => k in patch[id])) return null;
    patch[id] = { ...(patch[id] ?? {}), ...p };
  }
  return { id: `${a.id}+${b.id}`, kind: 'kombinace', level: Math.max(a.level ?? 1, b.level ?? 1), label: `${a.label} + ${b.label}`, why: 'Dvě nejlepší úpravy dohromady.', patch };
}
