// Vysvětlení kroku metody pro nováčka: z toho, co je hotové před krokem a po něm
// (core/cells.js), slovy řekne, co se v kroku dělá (kříž, pár, natočení horní vrstvy,
// oddělení barev…), co se na kostce změní (po vrstvách), co musí zůstat hotové a jak
// na to (intuitivně / algoritmy / jen někdy). Všechno v pohledu metody (dole = barva
// dole podle držení) a skutečnými barvami.

import { slotByName } from '../core/geometry.js';
import { cellsBefore, cellStickers, remapCells, stickersSolved, describeCell } from '../core/cells.js';
import { frameMap, DEFAULT_FRAME, validFrame, COLOR_NAME } from '../ui/parts.js';

const INSTR = { U: 'bílou', D: 'žlutou', F: 'zelenou', B: 'modrou', R: 'červenou', L: 'oranžovou' };
const WHERE = { D: 'dole', U: 'nahoře', F: 'vpředu', B: 'vzadu', R: 'vpravo', L: 'vlevo' };
const TOWARD = { D: 'dolů', U: 'nahoru', F: 'dopředu', B: 'dozadu', R: 'doprava', L: 'doleva' };
const CROSS = ['DF', 'DR', 'DB', 'DL'], E = ['FR', 'BR', 'BL', 'FL'], UE = ['UF', 'UR', 'UB', 'UL'];
const DC = ['DFR', 'DRB', 'DBL', 'DLF'], UC = ['UFR', 'URB', 'UBL', 'ULF'];
const ALL = [...CROSS, ...E, ...UE, ...DC, ...UC];
const name = (n) => slotByName(n).name;
const typeOf = (n) => (n.length === 3 ? 'corner' : 'edge');
const layerOf = (n) => (n.includes('D') ? 'D' : n.includes('U') ? 'U' : 'E');
const LAYER = { D: 'spodní vrstvy', E: 'prostřední vrstvy', U: 'horní vrstvy' };
const count = (k, type) => (type === 'edge' ? `${k} ${k === 1 ? 'hrana' : k < 5 ? 'hrany' : 'hran'}` : `${k} ${k === 1 ? 'roh' : k < 5 ? 'rohy' : 'rohů'}`);
const place = (n) => [...n].map((f) => WHERE[f]).join(' ');
const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
/** „s“ / „se“ před slovem (se žlutou, se zelenou). */
const withS = (word) => (/^[szšž]/i.test(word) ? `se ${word}` : `s ${word}`);

/** Stav místa: none | solved | place (vlastní, natočený jakkoli) | colors {faces} | oriented | other. */
function stateOf(cell, n) {
  if (!cell) return { kind: 'none' };
  const slot = slotByName(n);
  if (cell.own === 'solved') return { kind: 'solved' };
  if (cell.own === 'any') return { kind: 'place' };
  if (cell.colors && stickersSolved(slot, cell.colors)) return { kind: 'solved' };
  const st = cellStickers(cell, slot);
  if (st && Object.values(st).some((cs) => cs?.length)) return { kind: 'colors', faces: Object.fromEntries(Object.entries(st).filter(([, cs]) => cs?.length)) };
  if (cell.ori === 'correct') return { kind: 'oriented' };
  return { kind: 'other', cell };
}

/** Změna místa mezi před a po (null = beze změny). */
function changeOf(b, a) {
  if (JSON.stringify(b) === JSON.stringify(a) || a.kind === 'none') return null;
  if (a.kind === 'solved') return { kind: b.kind === 'place' ? 'twist' : b.kind === 'colors' ? 'permute' : b.kind === 'oriented' ? 'permute-ori' : 'solved' };
  if (a.kind === 'place') return { kind: 'place' };
  if (a.kind === 'colors') {
    const faces = {};
    for (const [f, cs] of Object.entries(a.faces)) {
      const was = b.kind === 'colors' ? b.faces[f] : null;
      if (was && same(was, cs)) continue;
      faces[f] = { colors: cs, was: was ?? null };
    }
    return Object.keys(faces).length ? { kind: 'colors', faces } : null;
  }
  if (a.kind === 'oriented') return { kind: 'oriented' };
  return { kind: 'other', cell: a.cell };
}

/**
 * Pohled metody: buňky přejmenované tak, že D = dole, F = vpředu (barvy taky – barva
 * „D“ = barva, která je podle držení dole).
 */
export function viewOf(frame) {
  const f = validFrame(frame) ? frame : DEFAULT_FRAME;
  const map = frameMap(f);
  const back = Object.fromEntries(Object.entries(map).map(([v, r]) => [r, v]));
  return {
    map, back,
    cells: (cells) => remapCells(cells ?? {}, back),
    /** Barva stěny pohledu slovy (1. a 7. pád). */
    color: (v) => COLOR_NAME[map[v]], colorWith: (v) => INSTR[map[v]],
  };
}

/** Změny kroku i (v pohledu metody): { name → změna } a stavy před/po. */
export function stepChanges(steps, i, frame) {
  const view = viewOf(frame);
  const before = view.cells(cellsBefore(steps, i));
  const after = view.cells(cellsBefore(steps, i + 1));
  const changes = {};
  const states = {};
  for (const n of ALL) {
    const b = stateOf(before[name(n)], n), a = stateOf(after[name(n)], n);
    states[n] = { b, a };
    const c = changeOf(b, a);
    if (c) changes[n] = c;
  }
  return { changes, states, view };
}

/** Co krok dělá – název vzoru a jedna věta. */
function patternOf(changes, states, view) {
  const names = Object.keys(changes);
  const kinds = new Set(names.map((n) => changes[n].kind));
  const solvedAfter = ALL.every((n) => states[n].a.kind === 'solved');
  const edges = names.filter((n) => typeOf(n) === 'edge'), corners = names.filter((n) => typeOf(n) === 'corner');
  const faceColors = (n) => Object.entries(changes[n].faces ?? {});
  const colorList = (cs) => cs.map((c) => view.color(c)).join(' nebo ');
  const colorWith = (cs) => cs.map((c) => view.colorWith(c)).join(' nebo ');
  if (!names.length) return null;
  const placing = [...kinds].every((k) => k === 'solved' || k === 'place' || k === 'twist');
  const building = [...kinds].every((k) => k === 'solved' || k === 'place' || k === 'twist' || k === 'permute-ori');
  const colorOnly = [...kinds].every((k) => k === 'colors');
  if (solvedAfter && names.length >= 4) {
    return { id: 'finish', title: 'Dokončení', text: `Dáš na svá místa poslední dílky (${[edges.length && count(edges.length, 'edge'), corners.length && count(corners.length, 'corner')].filter(Boolean).join(' a ')}) – po tomhle kroku je kostka složená.` };
  }
  if (same(names, CROSS)) {
    if (placing) return { id: 'cross', title: 'Kříž', text: `Na spodní straně postavíš kříž: 4 hrany spodní vrstvy dáš každou na její místo, ${view.colorWith('D')} barvou dolů.` };
    if (colorOnly) {
      const cs = faceColors('DF').find(([f]) => f === 'D')?.[1].colors ?? [];
      return { id: 'cross', title: 'Kříž', text: `Na spodní straně postavíš kříž ze 4 hran, které mají ${cs.map((c) => view.color(c).replace(/á$/, 'ou')).join(' nebo ')} barvu – tou barvou dolů.${cs.length > 1 ? ' Barvy kříže se smí míchat a nezáleží na tom, která hrana je kde – proto je to snazší než klasický kříž.' : ' Na tom, která hrana je kde, nezáleží.'}` };
    }
  }
  const pair = DC.find((c) => names.includes(c) && names.length === 2 && names.includes(name(c.slice(1))));
  if (pair) {
    const edge = name(pair.slice(1));
    const what = changes[pair].kind === 'colors'
      ? `do rohu kterýkoli roh ${withS(colorWith(changes[pair].faces.D?.colors ?? []))} barvou (tou barvou dolů) a nad něj hranu střední vrstvy, která tam patří` : 'roh i hranu, které tam patří';
    return { id: 'pair', title: 'Pár', text: `Vyplníš jeden „slot“ – roh spodní vrstvy a hranu nad ním. Dáš tam ${what}. Roh a hranu nejdřív spojíš v horní vrstvě do páru a pak je vložíš najednou.`, slot: { corner: pair, edge } };
  }
  if (placing && names.every((n) => layerOf(n) === 'U')) {
    return { id: 'last-layer', title: 'Horní vrstva', text: `Dílky horní vrstvy (${[edges.length && count(edges.length, 'edge'), corners.length && count(corners.length, 'corner')].filter(Boolean).join(' a ')}) dáš každý na jeho místo a správně natočíš.` };
  }
  if ([...kinds].every((k) => k === 'permute')) {
    return { id: 'permute', title: `Permutace ${corners.length && !edges.length ? 'rohů' : edges.length && !corners.length ? 'hran' : 'dílků'}`, text: `Barvy nahoře a dole už sedí; teď ${corners.length && !edges.length ? 'rohy' : edges.length && !corners.length ? 'hrany' : 'dílky'} jen přeskládáš – každý ${corners.length && !edges.length ? 'roh' : 'dílek'} na jeho vlastní místo (${count(names.length, corners.length && !edges.length ? 'corner' : 'edge')}).` };
  }
  if (colorOnly) {
    const narrowed = names.filter((n) => faceColors(n).some(([, x]) => x.was));
    if (narrowed.length && narrowed.length === names.length) {
      // oddělení: barvy, které byly promíchané, se rozdělí nahoru a dolů
      const down = [...new Set(names.filter((n) => layerOf(n) === 'D').flatMap((n) => changes[n].faces.D?.colors ?? []))];
      const up = [...new Set(names.filter((n) => layerOf(n) === 'U').flatMap((n) => changes[n].faces.U?.colors ?? []))];
      const what = corners.length && !edges.length ? 'rohy' : edges.length && !corners.length ? 'hrany' : 'dílky';
      return { id: 'separate', title: `Oddělení – ${what}`, text: `${what[0].toUpperCase()}${what.slice(1)} ${withS(colorWith(down))} barvou dáš dolů a ${what} ${withS(colorWith(up))} barvou nahoru (natočení zůstane – barva pořád míří nahoru nebo dolů). Na tom, který dílek je kde ve své vrstvě, zatím nezáleží.` };
    }
    const sides = new Set(names.flatMap((n) => faceColors(n).map(([f]) => f)));
    if ([...sides].every((f) => f === 'U' || f === 'D')) {
      const cs = [...new Set(names.flatMap((n) => faceColors(n).flatMap(([, x]) => x.colors)))];
      const where = sides.size === 2 ? 'na horní i spodní stranu' : sides.has('U') ? 'na horní stranu' : 'na spodní stranu';
      return { id: 'orient', title: 'Natočení', text: `Dílky natočíš tak, aby ${where} mířila jen ${colorList(cs)} barva${cs.length > 1 ? ' (smí být promíchané)' : ''}. Na místech dílků zatím nezáleží.` };
    }
  }
  if (kinds.has('oriented') && [...kinds].every((k) => k === 'oriented' || k === 'solved' || k === 'place')) {
    const ori = names.filter((n) => changes[n].kind === 'oriented'), fixed = names.filter((n) => changes[n].kind !== 'oriented');
    const oriE = ori.filter((n) => typeOf(n) === 'edge').length, oriC = ori.length - oriE;
    const extra = fixed.length ? ` K tomu dáš na místo: ${fixed.map((n) => `${typeOf(n) === 'edge' ? 'hranu' : 'roh'} ${place(n)}`).join(', ')}.` : '';
    if (ori.every((n) => layerOf(n) === 'U')) {
      return { id: 'orient', title: 'Natočení horní vrstvy', text: `Dílky horní vrstvy natočíš tak, aby nahoru mířila ${view.color('U')} barva – horní strana bude celá ${view.color('U')}. Na tom, který dílek je kde, zatím nezáleží.${extra}` };
    }
    if (oriE && !oriC) {
      return { id: 'eo', title: 'Natočení hran', text: `Všechny hrany (${oriE}) správně natočíš – „dobrá“ hrana jde na své místo bez tahů F a B, takže pak se dá skládat jen tahy R, U, L a D.${extra}` };
    }
    return { id: 'orient', title: 'Natočení', text: `Správně natočíš ${[oriE && count(oriE, 'edge'), oriC && count(oriC, 'corner')].filter(Boolean).join(' a ')} (na místech zatím nezáleží).${extra}` };
  }
  if (building && corners.length && edges.length) {
    return { id: 'block', title: 'Blok', text: `Postavíš blok: ${[edges.length && count(edges.length, 'edge'), corners.length && count(corners.length, 'corner')].filter(Boolean).join(' a ')} na svá místa tak, aby k sobě pasovaly.` };
  }
  return { id: 'other', title: 'Krok', text: `Krok přidá ${[edges.length && count(edges.length, 'edge'), corners.length && count(corners.length, 'corner')].filter(Boolean).join(' a ')}.` };
}

/** Řádky „co se změní“ po vrstvách (stejné změny sloučené). */
function changeLines(changes, view) {
  const groups = new Map();
  const key0 = (n, c) => `${layerOf(n)}|${typeOf(n)}|${changeText(c, typeOf(n), view)}`;
  const sizes = new Map();
  for (const [n, c] of Object.entries(changes)) sizes.set(key0(n, c), (sizes.get(key0(n, c)) ?? 0) + 1);
  for (const [n, c] of Object.entries(changes)) {
    const what = changeText(c, typeOf(n), view, sizes.get(key0(n, c)));
    const key = `${layerOf(n)}|${typeOf(n)}|${what}`;
    const g = groups.get(key) ?? { names: [], what, type: typeOf(n), layer: layerOf(n) };
    g.names.push(n);
    groups.set(key, g);
  }
  const order = { D: 0, E: 1, U: 2 };
  return [...groups.values()].sort((a, b) => order[a.layer] - order[b.layer] || (a.type === 'edge' ? -1 : 1))
    .map((g) => {
      const who = g.names.length === 1 ? `${g.type === 'edge' ? 'Hrana' : 'Roh'} ${place(g.names[0])}`
        : g.names.length === 2 ? `${g.type === 'edge' ? 'Hrany' : 'Rohy'} ${g.names.map(place).join(' a ')}` : `${count(g.names.length, g.type)} ${LAYER[g.layer]}`;
      return `${who}: ${g.what}`;
    });
}

function changeText(c, type, view, n = 1) {
  const many = n > 1;
  const ori = many ? 'natočené' : type === 'edge' ? 'natočená' : 'natočený';
  const home = !many ? 'na své místo' : type === 'edge' ? 'každá na své místo' : 'každý na své místo';
  switch (c.kind) {
    case 'solved': return `${home}, správně ${ori} (barvami ke středům stejných barev)`;
    case 'twist': return `${many ? 'už jsou' : 'už je'} na svém místě – teď jen správné natočení`;
    case 'permute': return `barva nahoře či dole už sedí – teď ${home}`;
    case 'permute-ori': return `${many ? 'už jsou' : 'už je'} správně ${ori} – teď ${home}`;
    case 'place': return `${home} (natočení zatím nevadí)`;
    case 'oriented': return `správně ${ori} (na tom, který dílek je kde, nezáleží)`;
    case 'colors': return Object.entries(c.faces).map(([f, x]) => {
      const cs = x.colors.map((k) => view.colorWith(k)).join(' nebo ');
      if (x.was) return `už jen ${cs} barvou ${TOWARD[f]} (dosud stačila ${x.was.map((k) => view.color(k)).join(' nebo ')})`;
      return `${cs} barvou ${TOWARD[f]}`;
    }).join(', ') + ' – na tom, který dílek je kde, nezáleží';
    default: return describeCell(c.cell, type);
  }
}

/** Tituly kroků zkrácené („Pár 1, Pár 2, Pár 3“ → „Pár 1–3“). */
export function joinTitles(titles) {
  const out = [];
  for (const t of titles) {
    const m = /^(.*\S)\s+(\d+)$/.exec(t);
    const last = out.at(-1);
    if (m && last?.stem === m[1] && Number(m[2]) === last.to + 1) { last.to += 1; continue; }
    out.push(m ? { stem: m[1], from: Number(m[2]), to: Number(m[2]) } : { text: t });
  }
  return out.map((x) => x.text ?? (x.from === x.to ? `${x.stem} ${x.from}` : `${x.stem} ${x.from}–${x.to}`)).join(', ');
}

const WHEN = {
  always: 'pokaždé',
  parity: 'jen když nahoře nebo dole vyjde parita – dva dílky ve vrstvě jsou prohozené tak, že to další krok neumí vyřešit (lichý počet výměn)',
  'parity-U': 'jen když vyjde parita v horní vrstvě (lichý počet výměn dílků nahoře)',
  'parity-D': 'jen když vyjde parita ve spodní vrstvě (lichý počet výměn dílků dole)',
};

/**
 * Vysvětlení kroku i.
 * @param {object} p
 * @param {object[]} p.steps kroky průvodce (buňky ve skutečných názvech)
 * @param {number} p.i
 * @param {object} [p.frame] držení metody
 * @param {object} [p.cfg] nastavení kroku (stepConfig)
 * @param {string} [p.solveBy] intuitive | generate | own | fixed
 * @param {number} [p.algCount] počet algoritmů v sadě kroku
 * @param {string[]} [p.moves] povolené tahy kroku
 * @returns {{title: string, text: string, changes: string[], keep: string, how: string[], pattern: string}}
 */
export function explainStep({ steps, i, frame, cfg = {}, solveBy = 'intuitive', algCount = 0, moves = [] }) {
  const st = steps[i];
  if (solveBy === 'fixed') {
    const alg = String(cfg.fixedAlg ?? '').trim();
    return {
      pattern: 'fixed', title: 'Jen někdy', changes: [],
      text: `Tenhle krok neděláš pokaždé, ale ${WHEN[cfg.when ?? 'parity'] ?? WHEN.parity}. Pak provedeš ${alg ? `„${alg}“` : 'pevný algoritmus'}${alg.includes(',') ? ' (jeden z nich)' : ''}.`,
      keep: '', how: [
        'Když potřeba není, krok prostě přeskočíš.',
        cfg.when === 'always' ? '' : 'Jak to poznat: v dalším kroku se ti případ nebude dát najít mezi algoritmy (nebo zůstanou dva dílky prohozené). Pak se vrať, udělej tenhle algoritmus a pokračuj.',
      ].filter(Boolean),
    };
  }
  const { changes, states, view } = stepChanges(steps, i, frame);
  const pat = patternOf(changes, states, view) ?? { id: 'none', title: 'Krok', text: 'Krok nic nového nepřidává (zkontroluj, co má být po kroku hotové).' };
  const prior = steps.slice(0, i).filter((x) => Object.keys(x.cells ?? x.parts ?? {}).length);
  const keep = prior.length ? `Nerozbij, co už máš (${joinTitles(prior.map((x) => x.title || `Krok ${steps.indexOf(x) + 1}`))}) – cestou to smíš dočasně rozhodit, ale na konci kroku musí všechno zase sedět.` : '';
  const how = [];
  const side = cfg.free && cfg.free !== 'fixed';
  if (solveBy === 'intuitive') {
    how.push('Dělá se intuitivně – bez algoritmů. Přemýšlíš, kam který dílek dostat, a hledáš co nejkratší cestu.');
    if (pat.id === 'cross') how.push('Postup: najdi hrany, které do kříže patří. Každou dostaň nad místo, kam má jít, a otoč ji dolů (dvojitým tahem, např. F2), nebo ji vlož z boku tak, aby barva mířila dolů. Pokročilí si celý kříž naplánují během 15 s prohlídky před složením.');
    if (pat.id === 'pair') how.push(`Postup: najdi roh a hranu. Pokud jsou ve slotech, vytáhni je nahoru. V horní vrstvě je přisuň k sobě tak, aby barvy na boku navazovaly, a pak pár vlož do slotu (typicky R U R' nebo L' U' L a podobné).${side ? ' Slot si vyber kterýkoli volný – ten, kam se pár vkládá nejsnáz.' : ''}`);
    if (pat.id === 'block') how.push('Postup: stav blok po kouscích – nejdřív dva dílky k sobě, pak přidávej další. Hlídej, ať nerozbiješ, co už stojí.');
  } else {
    how.push(algCount ? `Dělá se algoritmy: ${algCount} ${algCount === 1 ? 'algoritmus' : algCount < 5 ? 'algoritmy' : 'algoritmů'} – na každý případ jeden.` : 'Dělá se algoritmy (vytvoří je test metody – spusť Otestovat).');
    const look = pat.id === 'separate' ? 'kde jsou nahoře dílky, které patří dolů (a naopak)'
      : pat.id === 'orient' ? 'které nálepky nahoře (a dole) míří jinam, než mají'
      : pat.id === 'permute' || pat.id === 'finish' || pat.id === 'last-layer' ? 'které dílky jsou prohozené (podívej se na barvy na bocích)' : 'jak jsou rozmístěné dílky kroku';
    how.push(`Postup: 1) poznej případ – podívej se, ${look}, a najdi ho mezi obrázky algoritmů; 2) ${cfg.adjust === 'UD' ? 'natoč horní (U) a spodní (D) vrstvu' : 'natoč horní vrstvu (U)'} tak, aby kostka vypadala jako na obrázku; 3) proveď algoritmus.`);
    if (algCount > 10) how.push('Neuč se všechny naráz: začni pár nejčastějšími, zbytek zatím dělej delší cestou (rozdělit na dva kratší kroky) a přidávej postupně. V trenažéru si je procvičíš.');
  }
  if (moves.length) how.push(`Tahy: ${moves.join(' ')}.`);
  return { pattern: pat.id, title: pat.title, text: pat.text, changes: changeLines(changes, view), keep, how };
}

/** Vysvětlení zápisu tahů (jen použité základy). */
export const MOVE_TEXT = {
  R: 'pravá strana', L: 'levá strana', U: 'horní strana', D: 'spodní strana', F: 'přední strana', B: 'zadní strana',
  M: 'prostřední vrstva mezi L a R (otáčí se jako L)', E: 'prostřední vrstva mezi U a D (jako D)', S: 'prostřední vrstva mezi F a B (jako F)',
  r: 'pravá strana i s prostřední vrstvou', l: 'levá strana i s prostřední vrstvou', u: 'horní strana i s vrstvou pod ní', d: 'spodní strana i s vrstvou nad ní',
  f: 'přední strana i s vrstvou za ní', b: 'zadní strana i s vrstvou před ní',
  x: 'celá kostka jako R', y: 'celá kostka jako U', z: 'celá kostka jako F',
};
