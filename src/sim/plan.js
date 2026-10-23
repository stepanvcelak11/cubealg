// Plán simulace z metody: kroky průvodce (dílky hotové po kroku), držení metody,
// nastavení každého kroku (tahy, sada, natočení vrstev, pomocné algoritmy, pohled)
// a volnost kroku – kde smí být jeho dílky (kříž libovolnou barvou, pár v kterémkoli
// slotu, blok na kterémkoli boku). Volnost = orientace metody (která barva je dole
// a vpředu), ve kterých se krok smí složit; další kroky pak pokračují v té zvolené.
// Výsledek je čistě datový (viz stepsolver.js), aby šel poslat do workerů.

import { stepParts, partsBefore, mergeParts, frameMap, validFrame, DEFAULT_FRAME } from '../ui/parts.js';
import { slotByName, SLOTS } from '../core/geometry.js';
import { holdOf, holdFromFaces } from '../core/hold.js';
import { MOVESET_PRESETS } from '../core/moveset.js';
import { getPuzzle } from '../puzzles/index.js';
import { scoreFor } from '../ergonomics/puzzles.js';
import { compileRule, mergeConstraints, constraintsKey } from '../core/rules.js';
import { compileCells, remapCells, isGroupCell } from '../core/cells.js';
import { buildTriggers } from '../ergonomics/triggers.js';

const P = getPuzzle('333');
const OPPOSITE = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' };
const CENTERS = { U: 'solved', D: 'solved', F: 'solved', B: 'solved', R: 'solved', L: 'solved' };

/** Sady tahů kroku: předvolby Labu + pár typických pro metody (+ vlastní výběr). */
export const STEP_MOVES = {
  ...Object.fromEntries(Object.entries(MOVESET_PRESETS).map(([id, p]) => [id, { label: p.label, bases: p.bases }])),
  facesM: { label: 'Vnější + M', bases: ['R', 'L', 'U', 'D', 'F', 'B', 'M'] },
  MUD: { label: '<M, U, D>', bases: ['M', 'U', 'D'] },
  RUD2: { label: '<R, U, D> + M', bases: ['R', 'U', 'D', 'M'] },
};
/** Základy tahů kroku podle jeho nastavení (předvolba nebo vlastní výběr). */
export const stepBases = (cfg) => (cfg.moves === 'custom' && cfg.custom?.length ? cfg.custom : (STEP_MOVES[cfg.moves] ?? STEP_MOVES.faces).bases);
export const MOVE_BASES = ['R', 'L', 'U', 'D', 'F', 'B', 'M', 'E', 'S', 'r', 'l', 'u', 'd', 'f', 'b'];
export const ADJUST = { auto: 'Automaticky (podle kroku)', none: 'Žádné', U: 'Horní vrstva (AUF)', UD: 'Horní i spodní (AUF + ADF)' };
export const NEUTRAL = { fixed: 'Pevná (podle metody)', dual: 'Dvě barvy (protilehlé)', all: 'Libovolná barva' };
/** Volnost kroku: ve kterých orientacích (vůči té dosavadní) se smí krok složit. */
export const FREEDOM = {
  fixed: { label: 'Pevně (jak je v průvodci)', hint: 'Dílky kroku jen tam, kde je máš v průvodci' },
  side: { label: 'Kterýkoli bok (otočení y)', hint: 'Stejná barva dole, ale dílky kroku smí být vpředu, vpravo, vzadu i vlevo – pár do kteréhokoli slotu, blok na kterékoli straně' },
  dual: { label: 'Dvě barvy dole (protilehlé)', hint: 'Krok i na protilehlé barvě (např. bílá nebo žlutá dole)' },
  dualSide: { label: 'Dvě barvy + kterýkoli bok', hint: 'Protilehlé barvy dole a k tomu kterýkoli bok' },
  all: { label: 'Kterákoli strana a barva', hint: 'Plná barevná neutralita: krok na kterékoli straně kostky (kříž libovolnou barvou, skládaný klidně z boku)' },
  colors: { label: 'Vybrané barvy…', hint: 'Krok smí skončit jen s vybranými barvami dole (a vpředu) – např. kříž jen bílý nebo žlutý' },
};
/** Barvy stěn (písmeno stěny kostky = barva jejího středu). */
export const COLORS = { U: 'bílá', D: 'žlutá', F: 'zelená', B: 'modrá', R: 'červená', L: 'oranžová' };
/** Otočení kostky mezi kroky (změna orientace kvůli volnosti). */
export const ROTATION = { free: 'Nepočítat do tahů', move: 'Počítat jako tah' };
const NEUTRAL_FREE = { fixed: 'fixed', dual: 'dual', all: 'all' };

/** Výchozí nastavení kroku. */
export const stepDefaults = (hasSet) => ({
  on: true, moves: 'faces', custom: null, mode: hasSet ? 'auto' : 'search', view: 'speed',
  adjust: 'auto', helpers: '', time: 3, recog: hasSet ? 0.6 : 0.3, free: 'fixed',
  // druh kroku pro odhad času: naučený algoritmus, nebo intuitivní (člověk tahy vymýšlí)
  kind: hasSet ? 'alg' : 'intuitive',
});

/**
 * Jak se krok řeší: 'intuitive' | 'generate' (algoritmy vytvoří test) | 'own' (moje sada)
 * | 'fixed' (pevný algoritmus jen někdy, např. parita). Bez volby: krok se sadou „moje sada“,
 * naučené algoritmy (OLL, PLL…) „vygenerovat“, jinak intuitivně.
 */
export function solveByOf(cfg, st) {
  return cfg.solveBy ?? (st.set && !cfg.genSet ? 'own' : cfg.kind === 'alg' ? 'generate' : 'intuitive');
}

/**
 * Natočení vrstev „automaticky“: vrstva (horní / spodní) se smí natočit před algoritmem
 * a po něm, když ji krok smí točit a před krokem ještě není celá hotová. I s hotovými
 * rohy (EPBL, EPLL): natočení před a vrácení po (U … U') je tentýž případ viděný z jiné
 * strany. Celá hotová vrstva (spodek CFOP u OLL a PLL) se netočí.
 * @param {string[]} bases tahy kroku (v držení)
 * @param {object} before hotové dílky před krokem (skutečné názvy)
 * @param {Record<string, string>} map stěny orientace (frameMap)
 * @returns {('U'|'D')[]} vrstvy v držení
 */
export function autoAdjust(bases, before, map) {
  const done = (L) => SLOTS.filter((s) => s.type !== 'center' && s.name.includes(map[L])).every((s) => before[s.name] === 'solved');
  return ['U', 'D'].filter((L) => bases.includes(L) && !done(L));
}

const FACES = ['U', 'D', 'F', 'B', 'R', 'L'];
const fid = (f) => `${f.down}${f.front}`;
const sides = (down) => FACES.filter((x) => x !== down && x !== OPPOSITE[down]);
/**
 * Orientace, do kterých smí krok s volností `free` přejít z orientace f (f první).
 * free = 'colors': jen vybrané barvy dole (cfg.downs) a vpředu (cfg.fronts, prázdné = kterákoli).
 */
export function freeFrames(f, free, cfg = {}) {
  if (free === 'colors') {
    const downs = (cfg.downs ?? []).filter((d) => FACES.includes(d));
    const out = [];
    for (const down of downs.length ? downs : [f.down]) {
      const allowed = sides(down).filter((x) => !cfg.fronts?.length || cfg.fronts.includes(x));
      const fronts = allowed.length ? allowed : sides(down);
      for (const front of fronts) out.push({ down, front });
    }
    // dosavadní orientace první (při shodě vyhraje bez otočení)
    out.sort((a, b) => (fid(b) === fid(f)) - (fid(a) === fid(f)));
    return out;
  }
  const downs = free === 'all' ? [f.down, ...FACES.filter((d) => d !== f.down)] : free === 'dual' || free === 'dualSide' ? [f.down, OPPOSITE[f.down]] : [f.down];
  const out = [];
  for (const down of downs) {
    const keep = down !== f.down && down !== OPPOSITE[f.down] ? sides(down)[0] : f.front;
    const fronts = free === 'side' || free === 'dualSide' || free === 'all' ? [keep, ...sides(down).filter((x) => x !== keep)] : [keep];
    for (const front of fronts) out.push({ down, front });
  }
  return out;
}

/** Otočení kostky (x, y, z…) z orientace a do orientace b – nejkratší zápis. */
const TURN = {
  y: (m) => ({ down: m.D, front: m.R }), "y'": (m) => ({ down: m.D, front: m.L }), y2: (m) => ({ down: m.D, front: m.B }),
  x: (m) => ({ down: m.B, front: m.D }), "x'": (m) => ({ down: m.F, front: m.U }), x2: (m) => ({ down: m.U, front: m.B }),
  z: (m) => ({ down: m.R, front: m.F }), "z'": (m) => ({ down: m.L, front: m.F }), z2: (m) => ({ down: m.U, front: m.F }),
};
export function rotationBetween(a, b) {
  if (fid(a) === fid(b)) return '';
  let level = [{ f: a, seq: [] }];
  for (let depth = 0; depth < 3; depth++) {
    const nextLevel = [];
    for (const { f, seq } of level) {
      for (const [t, go] of Object.entries(TURN)) {
        const g = go(frameMap(f));
        if (fid(g) === fid(b)) return [...seq, t].join(' ');
        nextLevel.push({ f: g, seq: [...seq, t] });
      }
    }
    level = nextLevel;
  }
  return '';
}
const LABEL = COLORS;

/**
 * Kolik různých míst volnost kroku nabízí (z držení metody): nové dílky kroku
 * (ty, které nebyly hotové dřív) přesunuté do každé povolené orientace.
 */
export function placesCount(frame, before, parts, cfg = {}, rules = [], cells = {}) {
  const f = validFrame(frame) ? frame : DEFAULT_FRAME;
  const fresh = Object.fromEntries(Object.entries(parts).filter(([n, st]) => before[n] !== st));
  const groups = Object.fromEntries(Object.entries(cells).filter(([, c]) => isGroupCell(c)));
  if (!Object.keys(fresh).length && !rules.length && !Object.keys(groups).length) return 1;
  const a = frameMap(f);
  return new Set(freeFrames(f, cfg.free ?? 'fixed', cfg).map((g) => {
    let c = remap(fresh, f, g);
    for (const rule of rules) c = mergeConstraints(c, compileRule(rule, frameMap(g)));
    const b = frameMap(g);
    if (Object.keys(groups).length) c = mergeConstraints(c, compileCells(remapCells(groups, Object.fromEntries(Object.entries(a).map(([r, x]) => [x, b[r]])))));
    return constraintsKey(c);
  })).size;
}

/** Přejmenuje dílky z orientace `from` do orientace `to` (stejné místo vůči držení). */
function remap(parts, from, to) {
  const a = frameMap(from), b = frameMap(to);
  const back = Object.fromEntries(Object.entries(a).map(([r, f]) => [f, r]));
  return Object.fromEntries(Object.entries(parts).map(([n, s]) => [slotByName([...n].map((f) => b[back[f]]).join('')).name, s]));
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const clean = (alg) => String(alg ?? '').replace(/[()]/g, ' ').trim().split(/\s+/).filter(Boolean).join(' ');

/**
 * @param {object} p
 * @param {{frame?: object, steps: object[]}} p.guide průvodce metody
 * @param {Record<string, object>} p.config nastavení kroků podle id (viz stepDefaults)
 * @param {(setId: string) => {alg: string, name: string, task?: object, times?: {t:number}[]}[]} p.setAlgs
 * @param {'fixed'|'dual'|'all'} [p.neutral] stará volba: volnost prvního kroku (když ji krok nemá)
 * @param {'free'|'move'} [p.rotation] počítat otočení kostky do tahů
 * @param {object} [p.ergonomics] váhy hodnocení (Lab)
 * @param {number} [p.lambda]
 * @returns {{plan: object, steps: object[]}} steps = zapnuté kroky (st, index, parts, cfg)
 */
export function buildPlan({ guide, config = {}, setAlgs = () => [], neutral = 'fixed', rotation = 'free', ergonomics = {}, lambda = 0.5 }) {
  const frame = validFrame(guide.frame) ? guide.frame : DEFAULT_FRAME;
  const ergo = { ...ergonomics, triggers: buildTriggers() };
  // kroky s dílky; vypnutý krok se složí s dalším zapnutým (cíl je kumulativní)
  const all = [];
  guide.steps.forEach((st, index) => {
    const parts = stepParts(st);
    // krok „jen někdy“ (pevný algoritmus, např. parita) nic nového neskládá
    const fixed = config[st.id]?.solveBy === 'fixed' && !!clean(config[st.id]?.fixedAlg ?? '');
    if (!fixed && !Object.keys(parts).length && !st.rules?.length && !Object.keys(st.cells ?? {}).length) return;
    const algs = st.set && !fixed ? setAlgs(st.set) : [];
    const cfg = { ...stepDefaults(algs.length > 0), ...(config[st.id] ?? {}) };
    if (fixed) cfg.on = true;
    else if (cfg.solveBy === 'fixed') cfg.solveBy = 'intuitive';
    // algoritmy kroku vytvoří test: co najde, rovnou používá (sada roste během testu)
    cfg.learn = !fixed && solveByOf(cfg, st) === 'generate';
    if (cfg.learn && cfg.mode === 'search') cfg.mode = 'auto';
    all.push({ st, index, parts: fixed ? {} : parts, algs, cfg, fixed });
  });
  // poslední krok s dílky se simuluje vždy (jinak by se nic neskládalo)
  if (all.length && !all.some((x) => x.cfg.on)) all.at(-1).cfg.on = true;
  const steps = all.filter((x, i) => x.cfg.on || i === all.length - 1);
  // stará volba „barevná neutralita“ = volnost prvního kroku
  if (steps.length && neutral !== 'fixed' && !config[steps[0].st.id]?.free) steps[0].cfg.free = NEUTRAL_FREE[neutral] ?? 'fixed';
  const goals0 = steps.map((x) => ({ ...mergeParts(partsBefore(guide.steps, x.st.id), x.parts) }));
  // dílky a pravidla kroku: jeho vlastní + z vypnutých kroků před ním (složí se s ním).
  // Vlastní, ne rozdíl proti předchozím krokům – kroky se stejnými dílky (pár do
  // kteréhokoli slotu ×4) pak s volností každý přidá další místo.
  const fresh = [], rulesOf = [], groupsOf = [];
  let pend = {}, pendRules = [], pendCells = {};
  for (const x of all) {
    // krok „jen někdy“ nic neskládá – dílky vypnutých kroků před ním jdou do dalšího kroku
    if (x.fixed) { fresh.push({}); rulesOf.push([]); groupsOf.push({}); continue; }
    pend = mergeParts(pend, x.parts);
    pendRules.push(...(x.st.rules ?? []));
    // buňky „některý z dílků“ (vlastní dílky jsou už v parts)
    for (const [n, c] of Object.entries(x.st.cells ?? {})) if (isGroupCell(c)) pendCells[n] = c;
    if (steps.includes(x)) { fresh.push(pend); rulesOf.push(pendRules); groupsOf.push(pendCells); pend = {}; pendRules = []; pendCells = {}; }
  }
  // stěna v držení metody → stěna v orientaci f (buňky jsou ve skutečných názvech pro držení metody)
  const faceMove = (f) => { const a = frameMap(frame), b = frameMap(f); return Object.fromEntries(Object.entries(a).map(([r, x]) => [x, b[r]])); };
  // orientace, do kterých se simulace může dostat (postupně podle volností kroků)
  const frames = [frame];
  const index = new Map([[fid(frame), 0]]);
  const add = (f) => { if (!index.has(fid(f))) { index.set(fid(f), frames.length); frames.push(f); } return index.get(fid(f)); };
  let reach = [frame];
  const nextOf = []; // nextOf[i] = Map(id orientace → indexy orientací k vyzkoušení)
  steps.forEach((x) => {
    const map = new Map();
    const after = new Map();
    for (const f of reach) {
      const list = freeFrames(f, x.cfg.free ?? 'fixed', x.cfg).map((g) => { after.set(fid(g), g); return add(g); });
      map.set(index.get(fid(f)), list);
    }
    nextOf.push(map);
    reach = [...after.values()];
  });
  // držení orientací: algoritmus uložený v některém z nich se zapisuje vůči orientaci (y, x2… jen otočí kostku)
  const holds = new Set(frames.map((f) => { const m = frameMap(f); return holdFromFaces(m.U, m.F); }));
  const scores = new Map(); // náročnost algoritmu nezávisí na orientaci
  const scoreOnce = (display) => { if (!scores.has(display)) scores.set(display, scoreFor(P, display, ergo).total); return scores.get(display); };
  const variants = frames.map((f, v) => {
    const map = frameMap(f);
    const hold = holdOf(holdFromFaces(map.U, map.F));
    const toModel = (display) => hold.toModelString(display);
    const goals = goals0.map((g) => remap(g, frame, f));
    return {
      label: `${LABEL[f.down]} dole, ${LABEL[f.front]} vpředu`,
      frame: f,
      hold: holdFromFaces(map.U, map.F), // držení orientace (zápis algoritmů)
      // středy až v posledním kroku: tahy středem (M, r…) je smí cestou posunout (Roux),
      // dílky se do té doby počítají vůči pevným pozicím
      goals: goals.map((g, i) => ({ ...g, ...(i === goals.length - 1 ? CENTERS : {}) })),
      // orientace k vyzkoušení v každém kroku (z této) a otočení kostky do nich
      next: nextOf.map((m) => m.get(v) ?? [v]),
      rotation: frames.map((g) => rotationBetween(f, g)),
      steps: steps.map((x, i) => {
        const bases = stepBases(x.cfg);
        const held = bases.flatMap((base) => [1, -1, 2].map((amount) => ({ base, amount })));
        const moves = held.map((m) => hold.toModel(P.moveToString(m))[0]);
        const layer = (b, on) => (on ? ['', b, `${b}'`, `${b}2`] : ['']);
        const layers = x.cfg.adjust === 'auto' || !ADJUST[x.cfg.adjust] ? autoAdjust(bases, i ? goals[i - 1] : {}, map)
          : x.cfg.adjust === 'UD' ? ['U', 'D'] : x.cfg.adjust === 'U' ? ['U'] : [];
        const adj = layer('U', layers.includes('U')).flatMap((u) => layer('D', layers.includes('D')).map((d) => [u, d].filter(Boolean).join(' ')));
        const adjust = adj.map((d) => ({ display: d, model: d ? toModel(d) : '' }));
        const helpers = String(x.cfg.helpers ?? '').split(/[,;\n]/).map(clean).filter(Boolean).flatMap((d) => {
          try { return [{ display: d, model: toModel(d) }]; } catch { return []; }
        });
        const candidates = x.cfg.mode === 'search' ? [] : x.algs.flatMap((a) => {
          try {
            const display = clean(a.alg);
            if (!display) return [];
            // zápis vůči orientaci; jen algoritmus z Labu v jiném držení (ne některé z orientací metody)
            // se ve výchozí orientaci dělá v tom svém
            const own = a.task?.hold ?? '';
            const model = v === 0 && !holds.has(own) ? holdOf(own).toModelString(display) : toModel(display);
            const recent = (a.times ?? []).slice(-5).map((t) => t.t);
            return [{ model, display, name: a.name, score: scoreOnce(display), time: recent.length >= 3 ? median(recent) : undefined }];
          } catch { return []; }
        });
        // nové dílky kroku v této orientaci (cíl = dosud hotové + tyto; poslední krok i středy)
        // a pravidla pro skupiny dílků (core/rules.js) přeložená do této orientace
        let parts = { ...remap(fresh[i], frame, f), ...(i === steps.length - 1 ? CENTERS : {}) };
        for (const rule of rulesOf[i]) parts = mergeConstraints(parts, compileRule(rule, map));
        if (Object.keys(groupsOf[i]).length) parts = mergeConstraints(parts, compileCells(remapCells(groupsOf[i], faceMove(f))));
        // krok „jen někdy“: pevné algoritmy a kdy se dělají (vrstvy v této orientaci, skutečné názvy)
        const fixed = x.fixed ? {
          algs: String(x.cfg.fixedAlg).split(/[,;\n]/).map(clean).filter(Boolean).flatMap((d) => {
            try { return [{ display: d, model: toModel(d), score: scoreOnce(d) }]; } catch { return []; }
          }),
          when: x.cfg.when ?? 'parity',
          layers: Object.fromEntries(['U', 'D'].map((L) => [L, SLOTS.filter((s) => s.type !== 'center' && s.name.includes(map[L])).map((s) => s.name)])),
        } : undefined;
        return { moves, held, adjust: { pre: adjust, post: adjust, helpers }, candidates, parts, ...(fixed ? { fixed } : {}) };
      }),
    };
  });
  // kolik různých míst kroku volnost nabízí (z výchozí orientace) – pro odhad délky hledání
  const choices = steps.map((x, i) => new Set((nextOf[i].values().next().value ?? [0]).map((j) => constraintsKey(variants[j].steps[i].parts))).size);
  // learn = algoritmy vytvoří test; cases = krok algoritmů (nalezená řešení se slučují po případech)
  const stepOpts = steps.map((x) => ({ mode: x.cfg.mode, view: x.cfg.view, learn: x.cfg.learn || undefined, cases: x.cfg.learn || x.cfg.kind === 'alg' || x.algs.length > 0 || undefined, time: Math.max(500, Math.min(120000, (Number(x.cfg.time) || 3) * 1000)), recog: Number(x.cfg.recog) || 0, maxLen: Number(x.cfg.maxLen) || 0 }));
  return { plan: { lambda, ergonomics, variants, stepOpts, rotation, choices }, steps };
}
