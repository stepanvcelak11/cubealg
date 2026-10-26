// Originální metody (Metoda → Vymyslet): ne skládání známých kroků, ale nové kroky
// vymyšlené podle principů, jak skladači přemýšlejí:
//   bloky     – zárodek (čára, roh 2×2×2, čtverec 1×2×2, kříž, pár) roste po souvislých
//               kusech (roh + jeho hrany) až do prvních dvou vrstev
//   rohy napřed – rohy dole, rohy nahoře (CLL), pak hrany po skupinách tahy se středy
//   orientace napřed – natočit hrany (a rohy), pak už jen dávat dílky na místa
//   hrany napřed – hrany prvních dvou vrstev (pás, kříž, v různém pořadí), pak rohy dole
//   bloky do stran – dva bloky s volným středem a konec Roux (tahy M) v různých podobách
//   + natočení hran vložené do kteréhokoli kroku (jako ZZ), konce poslední vrstvy
//     i neobvyklé (CLL + ELL, nejdřív hrany…)
// Intuitivní kroky (kromě prvního, ten se plánuje v inspekci) skládají nejvýš ~5 nových
// dílků – víc člověk naráz neudrží v hlavě (test by je složil nadlidsky krátce).
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

/**
 * Odhad tahů kroku bez simulace (kalibrace na testech ~100 metod, odchylka ±0,9 tahu
 * u intuitivních, ±2 u algoritmů): víc nových dílků = víc tahů, a tím víc, čím méně je
 * na kostce volného místa (už složené dílky překážejí).
 */
export function stepMoves(before, parts, alg) {
  const fresh = Object.keys(parts).filter((n) => before[n] !== 'solved' && before[n] !== parts[n]);
  const fs = fresh.filter((n) => parts[n] === 'solved').length, fo = fresh.length - fs;
  const frac = new Set([...Object.keys(before).filter((n) => before[n] === 'solved'), ...Object.keys(parts).filter((n) => parts[n] === 'solved')]).size / 20;
  return +(alg ? 6.3 + 0.7 * fs + 0.35 * fo + 0.55 * fs * frac : 5.1 - 0.1 * fs + 0.15 * fo + 2.6 * fs * frac).toFixed(1);
}
export { partsOf as partsOfCells, merge as mergeParts };
const UPPER = new Set([...UE, ...UC]);
/** Krok: intuitivní (search), nebo algoritmy – jen kroky horní vrstvy s rozumně případy
 * (první dvě vrstvy skladači skládají intuitivně, i poslední kus). */
function makeStep(title, cells, before, { moves, recog = 0.4, kind, why } = {}) {
  const parts = partsOf(cells);
  const after = merge(before, parts);
  const freshPieces = Object.keys(parts).filter((n) => before[n] !== 'solved' && before[n] !== parts[n]);
  const fresh = freshPieces.length;
  const alg = kind ? kind === 'alg' : freshPieces.every((n) => UPPER.has(n)) && estimateCases(before, parts) <= 600;
  // víc nových dílků naráz = stavění bloku (pomalejší tempo, víc tahů než test); natočení ne
  const k = kind ?? (alg ? 'alg' : freshPieces.filter((n) => parts[n] === 'solved').length >= 3 ? 'blocks' : 'intuitive');
  const step = { title, cells, sim: { recog, kind: k, ...(moves ?? {}) }, est: stepMoves(before, parts, alg), why };
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
  return isPair ? `Pár ${where}` : `Blok ${where} (${chunk.length} ${chunk.length >= 5 ? 'dílků' : 'dílky'})`;
}

/** Konec Roux (volné hrany DF, DB a střední vrstva M): rohy nahoře, pak šest hran tahy M a U. */
function rouxLastSteps(r, before) {
  const SIX = [...UE, 'DF', 'DB'];
  const MU = custom('M', 'U');
  const opts = [
    [['CMLL (rohy nahoře)', own(UC), { kind: 'alg', recog: 0.6 }], ['LSE (šest hran ⟨M U⟩)', own(SIX), { moves: MU, recog: 0.4, kind: 'intuitive' }]],
    [['CMLL (rohy nahoře)', own(UC), { kind: 'alg', recog: 0.6 }], ['Natočit hrany ⟨M U⟩', oriented(SIX), { moves: MU, recog: 0.3, kind: 'intuitive' }],
      ['Hrany dole (DF, DB)', own(['DF', 'DB']), { moves: MU, recog: 0.3, kind: 'intuitive' }], ['Hrany nahoře (EPLL)', own(UE), { kind: 'alg', recog: 0.4 }]],
    [['Natočit hrany ⟨M U⟩', oriented(SIX), { moves: custom('M', 'U', 'R', 'r'), recog: 0.4, kind: 'intuitive' }], ['Hrany dole (DF, DB)', own(['DF', 'DB']), { moves: MU, recog: 0.3, kind: 'intuitive' }],
      ['ZBLL', own([...UE, ...UC]), { kind: 'alg', recog: 0.8 }]],
    [['Hrany dole (DF, DB) ⟨M U⟩', own(['DF', 'DB']), { moves: custom('M', 'U', 'R', 'r'), recog: 0.3, kind: 'intuitive' }],
      ['OLL', oriented([...UE, ...UC]), { kind: 'alg', recog: 0.5 }], ['PLL', own([...UE, ...UC]), { kind: 'alg', recog: 0.6 }]],
  ];
  const pick = r.pick(opts);
  const steps = [];
  let st = before;
  for (const [title, cells, o] of pick) { const x = makeStep(title, cells, st, o); steps.push(x.step); st = x.after; }
  return { steps, label: pick.map(([t]) => t.replace(/ \(.*\)| ⟨.*⟩/g, '')).join(' + '), eo: pick.some(([t]) => /Natočit hrany/.test(t)) };
}

/**
 * Bloky: zárodek roste po souvislých kusech (2–3 dílky, občas 4) až do prvních dvou vrstev;
 * jinde natočení hran (i s posledním kusem jako ZBLS); nebo dva bloky po stranách s volným
 * středem a koncem Roux (tahy M).
 */
function blocks(r) {
  const seed = r.pick(SEEDS);
  const roux = !seed.pieces.some((n) => n === 'DF' || n === 'DB') && r.chance(0.3);
  const target = roux ? LOW.filter((n) => n !== 'DF' && n !== 'DB') : LOW;
  // -1 = bez EO; 0 = se zárodkem; 1/2 = samostatný krok později; 9 = s posledním kusem (jako ZBLS)
  const eoAt = roux ? -1 : r.chance(0.5) ? r.pick([0, 1, 2, 9]) : -1;
  const steps = [];
  let st = {};
  let eo = false;
  const add = (title, cells, opts) => { const x = makeStep(title, cells, st, opts); steps.push(x.step); st = x.after; };
  const eoCells = () => oriented(EDGES.filter((n) => st[n] !== 'solved'));
  add(`Zárodek: ${seed.label}${eoAt === 0 ? ' + natočit hrany' : ''}`, { ...own(seed.pieces), ...(eoAt === 0 ? eoCells() : {}) }, { recog: 0 });
  if (eoAt === 0) eo = true;
  let left = target.filter((n) => st[n] !== 'solved');
  let k = 0;
  while (left.length) {
    // kus: dílek sousedící s blokem (nebo kterýkoli), k němu jeho sousedé
    let size = Math.min(left.length, 2 + (r.chance(0.4) ? 1 : 0) + (r.chance(0.12) ? 1 : 0));
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
    const last = chunk.length === left.length;
    const withEo = last && !eo && eoAt === 9;
    // bloky Roux: střed zůstává volný – tahy r a M pomáhají
    const moves = eo ? EO_MOVES : roux ? custom('R', 'r', 'U', 'M', 'L', 'F', 'B') : undefined;
    add(withEo ? `${chunkTitle(chunk)} + natočit hrany` : chunkTitle(chunk), { ...own(chunk), ...(withEo ? oriented(UE) : {}) }, { recog: withEo ? 0.6 : 0.4, moves });
    if (withEo) eo = true;
    steps.at(-1).text = `Dílky: ${chunk.join(', ')}.`;
    left = target.filter((n) => st[n] !== 'solved');
  }
  const ll = roux ? rouxLastSteps(r, st) : lastLayer(r, st, eo);
  const eoText = eoAt === 9 ? ' Hrany nahoře se natočí s posledním kusem (jako ZBLS), takže konec má natočené hrany.'
    : eo ? ' Hrany se po cestě natočí, takže další bloky jdou tahy R, L, U, D (bez F a B).' : '';
  return {
    principle: 'bloky', eo: eo || !!ll.eo, roux, steps: [...steps, ...ll.steps],
    name: `Růst z: ${seed.label}${roux ? ' do dvou bloků' : ''}${eo ? ' + EO' : ''} → ${ll.label}`,
    why: roux
      ? `Ze zárodku „${seed.label}“ rostou dva bloky po stranách (jako u Roux, ale jinak poskládané) a střed zůstává volný – tahy M a r pomáhají a konec dělá šest hran tahy M a U. Konec: ${ll.label}.`
      : `Začíná se ${seed.label === 'kříž' ? 'křížem' : `zárodkem „${seed.label}“`} a blok roste po souvislých kusech (roh i se svými hranami), takže se pořád staví něco, co drží pohromadě – jako u Roux nebo Petruse, ale v jiném pořadí.${eoText} Konec: ${ll.label}.`,
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
    [['Hrany vlevo a vpravo', own(['DL', 'DR', 'UL', 'UR'])], ['Pás', own(E)], ['Hrany vpředu a vzadu', own(EDGES)]],
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
    [['Levý blok', own(['DLF', 'DBL', 'DL', 'FL', 'BL'])], ['Pravý blok', own(['DFR', 'DRB', 'DR', 'FR', 'BR'])], ['Hrany dole', own(['DF', 'DB'])], ['Horní vrstva', own([...UE, ...UC])]],
    [['Rohy dole', own(DC)], ['Pás', own(E)], ['Hrany dole', own(CROSS)], ['Horní vrstva', own([...UE, ...UC])]],
  ]);
  for (const [title, cells] of order) if (!(belt && title === 'Pás')) add(title, cells, { moves: EO_MOVES, recog: 0.4 });
  return {
    principle: 'orientace napřed', eo: true, steps,
    name: `Orientace napřed${belt ? ' s pásem' : ''} → ${order.map(([t]) => t.toLowerCase()).filter((t) => !(belt && t === 'pás')).join(' → ')}`,
    why: 'Nejdřív se všechny dílky natočí (hrany, pak rohy) – od té chvíle stačí tahy R, L, U, D a skládá se jen „kam co patří“, bez otáčení dílků. Po vzoru počítačových metod (Thistlethwaite), přeloženo pro člověka.',
  };
}

/** Hrany napřed: hrany prvních dvou vrstev (kříž, pás – v různém pořadí), pak rohy dole, pak konec. */
function edgesFirst(r) {
  const steps = [];
  let st = {};
  const add = (title, cells, opts) => { const x = makeStep(title, cells, st, opts); steps.push(x.step); st = x.after; };
  const eo = r.chance(0.5);
  const order = r.pick(['pás, kříž', 'kříž, pás']);
  const eoCells = eo ? oriented(UE) : {};
  if (order === 'pás, kříž') {
    add('Pás (střední vrstva)', own(E), { recog: 0, kind: 'intuitive' });
    add(eo ? 'Kříž + natočit hrany' : 'Kříž', { ...own(CROSS), ...eoCells }, { recog: 0.3 });
  } else {
    add('Kříž', own(CROSS), { recog: 0, kind: 'intuitive' });
    add(eo ? 'Hrany v pásu + natočit hrany' : 'Hrany v pásu', { ...own(E), ...eoCells }, { recog: 0.3 });
  }
  // rohy dole: s hotovými hranami jen „vložit roh“ (jako Keyhole) – po jednom nebo naráz po dvou
  const two = r.chance(0.5);
  if (two) {
    add('Rohy dole vpředu', own(['DLF', 'DFR']), { recog: 0.4, moves: eo ? EO_MOVES : undefined });
    add('Rohy dole vzadu', own(['DRB', 'DBL']), { recog: 0.4, moves: eo ? EO_MOVES : undefined });
  } else add('Rohy dole', own(DC), { recog: 0.4, moves: eo ? EO_MOVES : undefined, kind: 'blocks' });
  const ll = lastLayer(r, st, eo);
  const first = order === 'pás, kříž' ? 'Nejdřív střední vrstva, kdy je kostka ještě úplně volná – pak kříž'
    : 'Nejdřív kříž, pak hrany v pásu (s volnými rohy jdou snadno)';
  return {
    principle: 'hrany napřed', eo, steps: [...steps, ...ll.steps],
    name: `Hrany napřed (${order})${eo ? ' + EO' : ''} → rohy dole → ${ll.label}`,
    why: `${first}; rohy dole se pak jen vkládají do připravených míst.${eo ? ' Hrany nahoře se natočí cestou, takže konec má natočené hrany.' : ''} Konec: ${ll.label}.`,
  };
}

const PRINCIPLES = { bloky: blocks, 'rohy napřed': cornersFirst, 'orientace napřed': orientFirst, 'hrany napřed': edgesFirst };

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
