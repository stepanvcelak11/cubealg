// Originální metody (Metoda → Vymyslet): ne skládání známých kroků, ale nové kroky
// vymyšlené podle principů, jak skladači přemýšlejí:
//   bloky     – zárodek (čára, roh 2×2×2, čtverec 1×2×2, kříž, pár) roste po souvislých
//               kusech (roh + jeho hrany) až do prvních dvou vrstev
//   rohy napřed – rohy dole, rohy nahoře (CLL), pak hrany po skupinách tahy se středy
//   orientace napřed – natočit hrany (a rohy), pak už jen dávat dílky na místa
//   pás       – nejdřív střední vrstva, pak natočení a obě vrstvy
//   + natočení hran vložené do kteréhokoli kroku (jako ZZ), konce poslední vrstvy
//     i neobvyklé (CLL + ELL, nejdřív hrany…)
// Náhoda s pevným semínkem: každé „Vymyslet“ dá jiné nápady, stejné semínko stejné.
// Kroky jsou šablony v pohledu metody (dole D, vpředu F) jako v sim/templates.js; ke
// každému kroku odhad tahů a u kroků algoritmů odhad počtu případů (kombinatoricky).

import { CROSS, E, UE, DC, UC, own, oriented, custom } from './templates.js';

const EDGES = [...CROSS, ...E, ...UE], CORNERS = [...DC, ...UC];
const LOW = [...CROSS, ...E, ...DC]; // první dvě vrstvy
const ALL_MOVES = custom('R', 'L', 'U', 'D', 'F', 'B', 'M', 'E', 'S');
const EO_MOVES = custom('R', 'L', 'U', 'D');
const isCorner = (n) => n.length === 3;
// sousedé: roh ↔ jeho tři hrany (souvislý blok)
const touches = (a, b) => (isCorner(a) !== isCorner(b)) && [...(isCorner(a) ? b : a)].every((f) => (isCorner(a) ? a : b).includes(f));

function rng(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return { next, int: (n) => Math.floor(next() * n), pick: (a) => a[Math.floor(next() * a.length)], chance: (p) => next() < p };
}

/**
 * Odhad počtu případů kroku algoritmů: stavy nových dílků (umístění mezi volná místa ×
 * natočení) děleno natočením vrstvy před a po (AUF) a invarianty (parita, součet natočení).
 */
export function estimateCases(before, parts) {
  let states = 1, fullPerm = 0;
  for (const corner of [true, false]) {
    const all = [...(corner ? CORNERS : EDGES)];
    const freeSlots = all.filter((n) => before[n] !== 'solved');
    const solve = all.filter((n) => parts[n] === 'solved' && before[n] !== 'solved');
    const orient = all.filter((n) => parts[n] && before[n] !== 'orientation' && before[n] !== 'solved');
    const o = corner ? 3 : 2;
    let perm = 1;
    for (let k = 0; k < solve.length; k++) perm *= freeSlots.length - k;
    if (solve.length && solve.length === freeSlots.length) { fullPerm++; }
    let ori = o ** orient.length;
    const freeUnoriented = freeSlots.filter((n) => before[n] !== 'orientation');
    if (orient.length && orient.length === freeUnoriented.length) ori /= o;
    states *= perm * ori;
  }
  if (fullPerm === 2) states /= 2;
  // natočení vrstvy před algoritmem (×4); u permutací i po něm (×4)
  const permutes = [...CORNERS, ...EDGES].some((n) => parts[n] === 'solved' && before[n] !== 'solved');
  return Math.max(1, Math.round(states / (permutes ? 16 : 4)));
}

const merge = (a, b) => {
  const out = { ...a };
  for (const [n, s] of Object.entries(b)) out[n] = out[n] === 'solved' || s === 'solved' ? 'solved' : s;
  return out;
};
const partsOf = (cells) => Object.fromEntries(Object.entries(cells).map(([n, c]) => [n, c.own === 'solved' ? 'solved' : 'orientation']));

/** Krok: intuitivní (search) nebo algoritmy podle toho, kolik volného místa zbývá. */
function makeStep(title, cells, before, { moves, recog = 0.4, kind, why } = {}) {
  const parts = partsOf(cells);
  const after = merge(before, parts);
  const fresh = Object.keys(parts).filter((n) => before[n] !== 'solved' && before[n] !== parts[n]).length;
  const freeAfter = [...EDGES, ...CORNERS].filter((n) => after[n] !== 'solved').length;
  // málo volného místa (konec) a rozumně případů = algoritmy; jinak intuitivně
  const alg = kind ? kind === 'alg' : freeAfter <= 8 && estimateCases(before, parts) <= 600;
  const k = kind ?? (alg ? 'alg' : fresh >= 3 ? 'blocks' : 'intuitive');
  const est = alg ? Math.min(16, 8 + Math.ceil(fresh / 2)) : Math.round(2 + fresh * 1.7);
  const step = { title, cells, sim: { recog, kind: k, ...(moves ?? {}) }, est, why };
  if (alg) step.algs = estimateCases(before, parts);
  return { step, after };
}

/** Konce poslední vrstvy (originální i obvyklé) podle toho, zda jsou hrany natočené. */
function lastLayer(r, before, eo) {
  const opts = eo
    ? [
      [['COLL', own(UC)], ['EPLL', own(UE)]],
      [['OCLL', oriented(UC)], ['PLL', own([...UE, ...UC])]],
      [['ZBLL', own([...UE, ...UC])]],
      [['Hrany nahoře (EPLL napřed)', own(UE)], ['Rohy nahoře (L4C)', own(UC)]],
    ]
    : [
      [['CLL (rohy nahoře)', own(UC)], ['ELL (hrany nahoře)', own(UE)]],
      [['OLL', oriented([...UE, ...UC])], ['PLL', own([...UE, ...UC])]],
      [['Hrany nahoře (ELL napřed)', own(UE)], ['Rohy nahoře', own(UC)]],
      [['Natočit hrany nahoře', oriented(UE)], ['COLL', own(UC)], ['EPLL', own(UE)]],
      [['OLLCP', { ...oriented(UE), ...own(UC) }], ['EPLL', own(UE)]],
    ];
  const pick = r.pick(opts);
  const steps = [];
  let st = before;
  for (const [title, cells] of pick) {
    const { step, after } = makeStep(title, cells, st, { kind: 'alg', recog: 0.5 });
    steps.push(step);
    st = after;
  }
  return { steps, label: pick.map(([t]) => t.replace(/ \(.*\)/, '')).join(' + ') };
}

// --- principy -----------------------------------------------------------------------------

const SEEDS = [
  { label: 'čára', pieces: ['DF', 'DB'] },
  { label: 'roh 2×2×2', pieces: ['DBL', 'DB', 'DL', 'BL'] },
  { label: 'čtverec 1×2×2', pieces: ['DLF', 'DL', 'FL'] },
  { label: 'kříž', pieces: CROSS },
  { label: 'pár', pieces: ['DFR', 'FR'] },
  { label: 'hrany vlevo', pieces: ['DL', 'FL', 'BL'] },
];

const SIDE = { R: 'vpravo', L: 'vlevo', F: 'vpředu', B: 'vzadu' };
/** Lidský název kusu bloku: „Pár vpravo vpředu“, „Blok vlevo (3 dílky)“. */
function chunkTitle(chunk) {
  const count = {};
  for (const n of chunk) for (const f of n) if (SIDE[f]) count[f] = (count[f] ?? 0) + 1;
  const sides = Object.entries(count).sort((a, b) => b[1] - a[1]);
  const where = sides.length > 1 && sides[1][1] === sides[0][1] ? `${SIDE[sides[0][0]]} ${SIDE[sides[1][0]]}` : SIDE[sides[0]?.[0]] ?? 'dole';
  const isPair = chunk.length === 2 && chunk.some(isCorner) && touches(chunk[0], chunk[1]);
  return isPair ? `Pár ${where}` : `Blok ${where} (${chunk.length} dílky)`;
}

/** Bloky: zárodek roste po souvislých kusech až do prvních dvou vrstev; jinde natočení hran. */
function blocks(r) {
  const seed = r.pick(SEEDS);
  const eoAt = r.chance(0.45) ? r.int(3) : -1; // -1 = bez EO; 0 = se zárodkem; 1/2 = samostatný krok později
  const steps = [];
  let st = {};
  let eo = false;
  const add = (title, cells, opts) => { const x = makeStep(title, cells, st, opts); steps.push(x.step); st = x.after; };
  const eoCells = () => oriented(EDGES.filter((n) => st[n] !== 'solved'));
  add(`Zárodek: ${seed.label}${eoAt === 0 ? ' + natočit hrany' : ''}`, { ...own(seed.pieces), ...(eoAt === 0 ? eoCells() : {}) }, { recog: 0 });
  if (eoAt === 0) eo = true;
  let left = LOW.filter((n) => st[n] !== 'solved');
  let k = 0;
  while (left.length) {
    // kus: dílek sousedící s blokem (nebo kterýkoli), k němu jeho sousedé – 2 až 4 dílky
    let size = Math.min(left.length, 2 + r.int(3));
    if (left.length - size === 1) size++; // nenechat na konec jeden osamělý dílek
    const touching = left.filter((n) => Object.keys(st).some((m) => st[m] === 'solved' && touches(n, m)));
    const first = r.pick(touching.length ? touching : left);
    const chunk = [first];
    while (chunk.length < size) {
      const nb = left.filter((n) => !chunk.includes(n) && chunk.some((m) => touches(n, m)));
      const next = nb.length ? r.pick(nb) : r.pick(left.filter((n) => !chunk.includes(n)));
      if (!next) break;
      chunk.push(next);
    }
    k++;
    if (!eo && eoAt === k) { add('Natočit hrany', eoCells(), { recog: 0.4, moves: custom('R', 'L', 'U', 'D', 'F', 'B') }); eo = true; }
    add(chunkTitle(chunk), own(chunk), { recog: 0.4, moves: eo ? EO_MOVES : undefined });
    steps.at(-1).text = `Dílky: ${chunk.join(', ')}.`;
    left = LOW.filter((n) => st[n] !== 'solved');
  }
  const ll = lastLayer(r, st, eo);
  return {
    principle: 'bloky', eo, steps: [...steps, ...ll.steps],
    name: `Růst z: ${seed.label}${eo ? ' + EO' : ''} → ${ll.label}`,
    why: `Začíná se ${seed.label === 'kříž' ? 'křížem' : `zárodkem „${seed.label}“`} a blok roste po souvislých kusech (roh i se svými hranami), takže se pořád staví něco, co drží pohromadě – jako u Roux nebo Petruse, ale v jiném pořadí.${eo ? ' Hrany se po cestě natočí, takže další bloky jdou tahy R, L, U, D (bez F a B).' : ''} Konec: ${ll.label}.`,
  };
}

/** Rohy napřed: rohy dole, rohy nahoře, pak hrany po skupinách (tahy se středy). */
function cornersFirst(r) {
  const steps = [];
  let st = {};
  const add = (title, cells, opts) => { const x = makeStep(title, cells, st, opts); steps.push(x.step); st = x.after; };
  add('Rohy dole', own(DC), { recog: 0, kind: 'intuitive' });
  add('Rohy nahoře (CLL)', own(UC), { kind: 'alg', recog: 0.5 });
  const plans = [
    [['Natočit všechny hrany', oriented(EDGES)], ['Hrany dole', own(CROSS)], ['Pás', own(E)], ['Hrany nahoře', own(UE)]],
    [['Hrany dole', own(CROSS)], ['Pás', own(E)], ['Hrany nahoře', own(UE)]],
    [['Hrany vlevo a vpravo', own(['DL', 'DR', 'UL', 'UR'])], ['Zbylé hrany', own(EDGES)]],
    [['Pás', own(E)], ['Hrany dole', own(CROSS)], ['Hrany nahoře', own(UE)]],
  ];
  const plan = r.pick(plans);
  for (const [title, cells] of plan) add(title, cells, { moves: ALL_MOVES, recog: 0.4 });
  return {
    principle: 'rohy napřed', eo: false, steps,
    name: `Rohy napřed → ${plan.map(([t]) => t.toLowerCase()).join(' → ')}`,
    why: 'Nejdřív všech osm rohů (dole intuitivně, nahoře algoritmem CLL), pak hrany tahy se středy (M, E, S) – rohy pak už nepřekážejí. Podobně jako staré metody „corners first“, ale s tvým pořadím hran.',
  };
}

/** Orientace napřed: natočit hrany a rohy, pak už jen dílky na místa. */
function orientFirst(r) {
  const steps = [];
  let st = {};
  const add = (title, cells, opts) => { const x = makeStep(title, cells, st, opts); steps.push(x.step); st = x.after; };
  const belt = r.chance(0.5);
  if (belt) add('Pás (střední vrstva)', own(E), { recog: 0, kind: 'intuitive' });
  add('Natočit všechny hrany', oriented(EDGES), { recog: belt ? 0.4 : 0, kind: 'intuitive' });
  add('Natočit všechny rohy', oriented(CORNERS), { recog: 0.5, moves: EO_MOVES });
  const order = r.pick([
    [['Rohy dole', own(DC)], ['Hrany dole', own(CROSS)], ['Pás', own(E)], ['Horní vrstva', own([...UE, ...UC])]],
    [['Spodní vrstva', own([...DC, ...CROSS])], ['Pás', own(E)], ['Horní vrstva', own([...UE, ...UC])]],
    [['Rohy na místa', own(CORNERS)], ['Hrany dole a pás', own([...CROSS, ...E])], ['Hrany nahoře', own(UE)]],
  ]);
  for (const [title, cells] of order) if (!(belt && title === 'Pás')) add(title, cells, { moves: EO_MOVES, recog: 0.4 });
  return {
    principle: 'orientace napřed', eo: true, steps,
    name: `Orientace napřed${belt ? ' s pásem' : ''} → ${order.map(([t]) => t.toLowerCase()).filter((t) => !(belt && t === 'pás')).join(' → ')}`,
    why: 'Nejdřív se všechny dílky natočí (hrany, pak rohy) – od té chvíle stačí tahy R, L, U, D a skládá se jen „kam co patří“, bez otáčení dílků. Po vzoru počítačových metod (Thistlethwaite), přeloženo pro člověka.',
  };
}

/** Pás napřed: střední vrstva, kříž, rohy dole, pak poslední vrstva. */
function beltFirst(r) {
  const steps = [];
  let st = {};
  const add = (title, cells, opts) => { const x = makeStep(title, cells, st, opts); steps.push(x.step); st = x.after; };
  add('Pás (střední vrstva)', own(E), { recog: 0, kind: 'intuitive' });
  const eo = r.chance(0.5);
  add(eo ? 'Kříž + natočit hrany' : 'Kříž', { ...own(CROSS), ...(eo ? oriented(UE) : {}) }, { recog: 0.3, kind: 'intuitive' });
  add('Rohy dole', own(DC), { recog: 0.4, moves: eo ? EO_MOVES : undefined, kind: 'blocks' });
  const ll = lastLayer(r, st, eo);
  return {
    principle: 'pás napřed', eo, steps: [...steps, ...ll.steps],
    name: `Pás napřed → kříž${eo ? ' + EO' : ''} → rohy dole → ${ll.label}`,
    why: `Nejdřív střední vrstva, kdy je kostka ještě úplně volná – pak kříž a rohy dole s hotovým pásem.${eo ? ' Hrany se natočí už s křížem.' : ''} Konec: ${ll.label}.`,
  };
}

const PRINCIPLES = { bloky: blocks, 'rohy napřed': cornersFirst, 'orientace napřed': orientFirst, 'pás napřed': beltFirst };

/**
 * Originální metody (každá jiná): { key, name, why, steps, algs, eo, principle, tags, original: true }.
 * @param {number} seed semínko nápadů
 * @param {number} count kolik vymyslet
 */
export function originalMethods(seed = Date.now(), count = 24) {
  const r = rng(seed);
  const out = [];
  const seen = new Set();
  const names = Object.keys(PRINCIPLES);
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    // bloky častěji (nejvíc variant)
    const p = r.chance(0.5) ? 'bloky' : r.pick(names);
    const m = PRINCIPLES[p](r);
    const key = `orig|${m.steps.map((x) => `${x.title}:${Object.keys(x.cells).sort().join(',')}`).join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const algs = m.steps.reduce((a, x) => a + (x.algs ?? 0), 0);
    const tags = new Set();
    if (m.eo) tags.add('eo');
    if (m.principle === 'bloky' || m.steps.some((x) => x.sim.kind === 'blocks')) tags.add('blocks');
    if (m.steps.some((x) => /kříž/i.test(x.title))) tags.add('cross');
    if (m.steps.some((x) => x.sim.custom?.includes('M'))) tags.add('m');
    if (m.steps.some((x) => x.sim.custom && !x.sim.custom.includes('F'))) tags.add('rul');
    if (m.steps.some((x) => x.title.startsWith('ZBLL'))) tags.add('ll1');
    out.push({ ...m, key, algs, tags, original: true, known: null });
  }
  return out;
}
