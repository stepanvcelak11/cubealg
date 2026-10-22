// Pravidla kroku pro skupiny dílků – popis cíle „jako člověk“: které dílky, kam smí,
// jak musí být natočené a jestli musí místa zaplnit, nebo jen v nich být.
//
//   { type: 'edge' | 'corner',
//     colors: ['U', 'D'],          // dílky s nálepkou některé z těchto barev (v pohledu
//                                  //   metody: U = barva středu nahoře, D = dole, F, B, R, L)
//     without: [],                 // … a bez nálepky těchto barev (např. hrany bez bílé a žluté)
//     places: ['DF', 'DR', …],     // místa v pohledu metody (dole = D, vpředu = F)
//     mode: 'fill' | 'within',     // fill = každé místo obsadí některý dílek skupiny,
//                                  // within = všechny dílky skupiny musí být v místech
//     ori: 'any' | 'color' | 'solved',
//     oriColors: ['U', 'D'],       // ori = color: nálepka této barvy (výchozí = colors) …
//     oriFaces: ['D'] }            // … musí mířit na některou z těchto stran
//
// Pravidla jsou v pohledu metody, takže fungují i s barevnou neutralitou (převod
// přes frameMap orientace). Kompilace dá omezení pro hledání (core/constraints.js):
// within → { allow } pro každý dílek, fill → skupinové pravidlo „#classes“.

import { SLOTS, SLOT_OF, ORI_AT, FACELETS, slotByName } from './geometry.js';

const FACES = ['U', 'D', 'F', 'B', 'R', 'L'];
const pieceColors = (slot) => slot.facelets.map((f) => FACELETS[f].face);

/** Místo v pohledu metody → skutečné místo kostky (map: stěna pohledu → stěna kostky). */
const toCube = (name, map) => slotByName([...name].map((f) => map[f]).join('')).name;

/** Dílky skupiny (skutečné názvy) podle typu a barev. */
export function groupPieces(rule, map) {
  const want = new Set((rule.colors ?? []).map((c) => map[c]));
  const not = new Set((rule.without ?? []).map((c) => map[c]));
  return SLOTS.filter((s) => s.type === rule.type)
    .filter((s) => { const cs = pieceColors(s); return (!want.size || cs.some((c) => want.has(c))) && !cs.some((c) => not.has(c)); });
}

/** Které nálepky dílku pravidlo sleduje (pořadí v dílku). */
function trackedOffsets(rule, slot, map) {
  const cs = pieceColors(slot);
  if (rule.ori === 'color') {
    const oc = new Set((rule.oriColors?.length ? rule.oriColors : rule.colors ?? []).map((c) => map[c]));
    const offs = cs.map((c, i) => (oc.has(c) ? i : -1)).filter((i) => i >= 0);
    return offs.length ? offs : [0];
  }
  if (rule.ori === 'solved') return [0];
  return cs.map((_, i) => i);
}

/** Pozice místa, na kterých smí ležet sledovaná nálepka. */
function placePositions(rule, slot, map) {
  if (rule.ori === 'color') {
    const faces = new Set((rule.oriFaces?.length ? rule.oriFaces : FACES).map((f) => map[f]));
    return slot.facelets.filter((f) => faces.has(FACELETS[f].face));
  }
  if (rule.ori === 'solved') return slot.facelets.filter((f) => ORI_AT[f] === 0);
  return [...slot.facelets];
}

/**
 * Zkompiluje pravidlo pro orientaci metody.
 * @param {object} rule pravidlo (viz nahoře)
 * @param {Record<string,string>} map stěna pohledu metody → stěna kostky (frameMap)
 * @returns {Record<string, any>} omezení (dílek → { allow }, případně '#classes': [...])
 */
export function compileRule(rule, map) {
  const pieces = groupPieces(rule, map);
  const places = (rule.places ?? []).map((n) => slotByName(toCube(n, map))).filter((s) => s.type === rule.type);
  if (!pieces.length || !places.length) return {};
  if (rule.mode === 'within') {
    // každý dílek skupiny: referenční nálepka tam, kde je dílek v místě a správně natočený
    const placeSet = new Set(places.map((s) => s.name));
    const out = {};
    for (const p of pieces) {
      const offs = trackedOffsets(rule, p, map);
      const allow = [];
      for (const q of SLOTS.filter((s) => s.type === rule.type).flatMap((s) => s.facelets)) {
        const T = SLOTS[SLOT_OF[q]];
        if (!placeSet.has(T.name)) continue;
        const j = T.facelets.indexOf(q);
        const ok = offs.some((o) => placePositions(rule, T, map).includes(T.facelets[(j + o) % T.facelets.length]));
        if (ok) allow.push(q);
      }
      out[p.name] = { allow };
    }
    return out;
  }
  return { '#classes': [{
    pieces: pieces.map((p) => p.name),
    stickers: pieces.map((p) => trackedOffsets(rule, p, map)),
    places: places.map((s) => placePositions(rule, s, map)),
  }] };
}

const sameGroup = (a, b) => a.pieces.join() === b.pieces.join() && JSON.stringify(a.stickers) === JSON.stringify(b.stickers);

/**
 * Sjednocení omezení: plná vyhrává, „jen místo“ + „jen natočení“ = hotový dílek,
 * povolené polohy se protnou, skupinová pravidla se stejnou skupinou se spojí (víc míst).
 */
export function mergeConstraints(a, b) {
  const out = { ...a };
  for (const [n, s] of Object.entries(b ?? {})) {
    if (n === '#classes') {
      const list = (out['#classes'] ?? []).map((c) => ({ ...c, places: [...c.places] }));
      for (const c of s) {
        const same = list.find((x) => sameGroup(x, c));
        if (!same) { list.push({ ...c, places: [...c.places] }); continue; }
        for (const pl of c.places) if (!same.places.some((x) => x.join() === pl.join())) same.places.push(pl);
      }
      out['#classes'] = list;
      continue;
    }
    if (!s || s === 'ignore') continue;
    const was = out[n];
    if (!was || was === 'ignore') out[n] = s;
    else if (typeof was === 'object' && typeof s === 'object') out[n] = { allow: was.allow.filter((q) => s.allow.includes(q)) };
    else if (typeof was === 'object') out[n] = s === 'orientation' ? was : s; // pevné místo vyhrává
    else if (typeof s === 'object') out[n] = was === 'orientation' ? s : was;
    else out[n] = was === s ? s : 'solved';
  }
  return out;
}

/** Stabilní klíč omezení (stejné cíle = stejný klíč). */
export function constraintsKey(c) {
  return Object.keys(c).sort().map((n) => `${n}:${typeof c[n] === 'string' ? c[n] : JSON.stringify(c[n])}`).join(';');
}

// --- popis slovy ------------------------------------------------------------------------------------
const COLOR_NAME = { U: 'bílá', D: 'žlutá', F: 'zelená', B: 'modrá', R: 'červená', L: 'oranžová' };
const COLOR_INSTR = { U: 'bílou', D: 'žlutou', F: 'zelenou', B: 'modrou', R: 'červenou', L: 'oranžovou' };
const SIDE = { U: 'nahoru', D: 'dolů', F: 'dopředu', B: 'dozadu', R: 'doprava', L: 'doleva' };

const PLACE_WORD = { D: 'dole', U: 'nahoře' };
/** Popis míst slovy podle vrstev („4 hrany dole“, „roh dole vpředu vpravo“). */
export function describePlaces(places, type) {
  const n = places.length;
  if (n === 1) {
    const word = type === 'edge' ? 'hrany' : 'rohu';
    const dir = { F: 'vpředu', B: 'vzadu', R: 'vpravo', L: 'vlevo', U: 'nahoře', D: 'dole' };
    return `${word} ${[...places[0]].map((f) => dir[f]).join(' ')}`; // „na místo rohu dole vpředu vpravo“
  }
  const D = places.filter((p) => p.includes('D')).length, U = places.filter((p) => p.includes('U')).length, E = n - D - U;
  const parts = [D && `${D} ${PLACE_WORD.D}`, E && `${E} uprostřed`, U && `${U} ${PLACE_WORD.U}`].filter(Boolean);
  return `${n} ${n < 5 ? 'místa' : 'míst'} (${type === 'edge' ? 'hrany' : 'rohy'}: ${parts.join(', ')})`;
}

const COLOR_GEN = { U: 'bílé', D: 'žluté', F: 'zelené', B: 'modré', R: 'červené', L: 'oranžové' };
const ORDER = ['D', 'U', 'F', 'B', 'R', 'L'];

/**
 * Pravidlo slovy (barvy podle orientace metody).
 * @param {object} rule
 * @param {Record<string,string>} map stěna pohledu → stěna kostky (barva středu)
 */
export function describeRule(rule, map) {
  const sorted = (cs) => [...cs].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const list = (cs, table) => sorted(cs).map((c) => table[map[c]]).join(' nebo ');
  const n = (rule.places ?? []).length;
  const edge = rule.type === 'edge';
  const one = edge ? 'hrana' : 'roh', many = edge ? 'hrany' : 'rohy';
  const colors = rule.colors ?? [];
  const oriColors = rule.oriColors?.length ? rule.oriColors : colors;
  const withWord = (t) => (/^[žšsz]/.test(t) ? `se ${t}` : `s ${t}`);
  const what = `${colors.length ? ` ${withWord(list(colors, COLOR_INSTR))} nálepkou` : ''}${rule.without?.length ? ` bez ${list(rule.without, COLOR_GEN)}` : ''}`;
  const sameColors = sorted(oriColors).join() === sorted(colors).join();
  const ori = rule.ori === 'color'
    ? `, ${sameColors && colors.length ? 'tou' : `${list(oriColors, COLOR_INSTR)}`} nálepkou ${sorted(rule.oriFaces ?? []).map((f) => SIDE[f]).join(' nebo ')}`
    : rule.ori === 'solved' ? ', správně natočen' + (n === 1 && rule.mode !== 'within' ? (edge ? 'á' : 'ý') : 'é') : '';
  const where = describePlaces(rule.places ?? [], rule.type);
  if (rule.mode === 'within') return `Všechny ${many}${what} musí být na místech: ${where}${ori}.`;
  if (n === 1) return `Na místo ${where} patří kter${edge ? 'ákoli' : 'ýkoli'} ${one}${what}${ori}.`;
  return `Na ${where} patří kterékoli ${many}${what}${ori}.`;
}

/** Místa v pohledu metody podle vrstev (pro výběr v editoru). */
export const PLACE_LAYERS = {
  edge: { D: ['DF', 'DR', 'DB', 'DL'], E: ['FR', 'BR', 'BL', 'FL'], U: ['UF', 'UR', 'UB', 'UL'] },
  corner: { D: ['DFR', 'DRB', 'DBL', 'DLF'], U: ['UFR', 'URB', 'UBL', 'ULF'] },
};

/** Předvolby pravidel (v pohledu metody). */
export const RULE_PRESETS = [
  { id: 'cross-any', label: 'Kříž z kterýchkoli bílých/žlutých hran (bílou/žlutou dolů)',
    rule: { type: 'edge', colors: ['U', 'D'], places: PLACE_LAYERS.edge.D, mode: 'fill', ori: 'color', oriFaces: ['D'] } },
  { id: 'corner-any', label: 'Roh vpředu vpravo dole: kterýkoli bílý/žlutý, bílou/žlutou dolů',
    rule: { type: 'corner', colors: ['U', 'D'], places: ['DFR'], mode: 'fill', ori: 'color', oriFaces: ['D'] } },
  { id: 'orient-edges', label: 'Natočit hrany: bílé/žluté nahoře a dole, bílou/žlutou nahoru či dolů',
    rule: { type: 'edge', colors: ['U', 'D'], places: [...PLACE_LAYERS.edge.D, ...PLACE_LAYERS.edge.U], mode: 'within', ori: 'color', oriFaces: ['U', 'D'] } },
  { id: 'orient-corners', label: 'Natočit rohy: bílou/žlutou nahoru či dolů',
    rule: { type: 'corner', colors: ['U', 'D'], places: [...PLACE_LAYERS.corner.D, ...PLACE_LAYERS.corner.U], mode: 'within', ori: 'color', oriFaces: ['U', 'D'] } },
  { id: 'sep-edges-d', label: 'Oddělit hrany: barva dole patří dolů',
    rule: { type: 'edge', colors: ['D'], places: PLACE_LAYERS.edge.D, mode: 'within', ori: 'color', oriFaces: ['D'] } },
  { id: 'sep-edges-u', label: 'Oddělit hrany: barva nahoře patří nahoru',
    rule: { type: 'edge', colors: ['U'], places: PLACE_LAYERS.edge.U, mode: 'within', ori: 'color', oriFaces: ['U'] } },
  { id: 'sep-corners-d', label: 'Oddělit rohy: barva dole patří dolů',
    rule: { type: 'corner', colors: ['D'], places: PLACE_LAYERS.corner.D, mode: 'within', ori: 'color', oriFaces: ['D'] } },
  { id: 'sep-corners-u', label: 'Oddělit rohy: barva nahoře patří nahoru',
    rule: { type: 'corner', colors: ['U'], places: PLACE_LAYERS.corner.U, mode: 'within', ori: 'color', oriFaces: ['U'] } },
  { id: 'eo', label: 'Hrany správně natočené (EO), kdekoli',
    rule: { type: 'edge', colors: [], places: [...PLACE_LAYERS.edge.D, ...PLACE_LAYERS.edge.E, ...PLACE_LAYERS.edge.U], mode: 'within', ori: 'solved' } },
];
