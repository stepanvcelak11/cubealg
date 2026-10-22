// Plán simulace z metody: kroky průvodce (dílky hotové po kroku), držení metody,
// nastavení každého kroku (tahy, sada, natočení vrstev, pomocné algoritmy, pohled)
// a barevná neutralita (další orientace metody). Výsledek je čistě datový
// (viz stepsolver.js), aby šel poslat do workerů.

import { stepParts, partsBefore, mergeParts, frameMap, validFrame, DEFAULT_FRAME } from '../ui/parts.js';
import { slotByName } from '../core/geometry.js';
import { holdOf, holdFromFaces } from '../core/hold.js';
import { MOVESET_PRESETS } from '../core/moveset.js';
import { getPuzzle } from '../puzzles/index.js';
import { scoreFor } from '../ergonomics/puzzles.js';
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
export const MOVE_BASES = ['R', 'L', 'U', 'D', 'F', 'B', 'M', 'E', 'S', 'r', 'l', 'u', 'd', 'f', 'b'];
export const ADJUST = { none: 'Žádné', U: 'Horní vrstva (AUF)', UD: 'Horní i spodní (AUF + ADF)' };
export const NEUTRAL = { fixed: 'Pevná (podle metody)', dual: 'Dvě barvy (protilehlé)', all: 'Libovolná barva' };

/** Výchozí nastavení kroku. */
export const stepDefaults = (hasSet) => ({
  on: true, moves: 'faces', custom: null, mode: hasSet ? 'auto' : 'search', view: 'speed',
  adjust: hasSet ? 'U' : 'none', helpers: '', time: 3, recog: hasSet ? 0.6 : 0.3,
});

/** Orientace metody k vyzkoušení (barevná neutralita). */
export function framesFor(frame, neutral) {
  if (neutral === 'dual') return [frame, { down: OPPOSITE[frame.down], front: frame.front }];
  if (neutral === 'all') {
    return ['U', 'D', 'F', 'B', 'R', 'L'].sort((a, b) => (a === frame.down ? -1 : b === frame.down ? 1 : 0)).map((down) => {
      const front = [frame.front, 'F', 'R', 'B', 'L', 'U', 'D'].find((f) => f !== down && f !== OPPOSITE[down]);
      return { down, front };
    });
  }
  return [frame];
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
 * @param {'fixed'|'dual'|'all'} [p.neutral]
 * @param {object} [p.ergonomics] váhy hodnocení (Lab)
 * @param {number} [p.lambda]
 * @returns {{plan: object, steps: object[]}} steps = zapnuté kroky (st, index, parts, cfg)
 */
export function buildPlan({ guide, config = {}, setAlgs = () => [], neutral = 'fixed', ergonomics = {}, lambda = 0.5 }) {
  const frame = validFrame(guide.frame) ? guide.frame : DEFAULT_FRAME;
  const ergo = { ...ergonomics, triggers: buildTriggers() };
  // kroky s dílky; vypnutý krok se složí s dalším zapnutým (cíl je kumulativní)
  const all = [];
  guide.steps.forEach((st, index) => {
    const parts = stepParts(st);
    if (!Object.keys(parts).length) return;
    const algs = st.set ? setAlgs(st.set) : [];
    all.push({ st, index, parts, algs, cfg: { ...stepDefaults(algs.length > 0), ...(config[st.id] ?? {}) } });
  });
  // poslední krok s dílky se simuluje vždy (jinak by se nic neskládalo)
  if (all.length && !all.some((x) => x.cfg.on)) all.at(-1).cfg.on = true;
  const steps = all.filter((x, i) => x.cfg.on || i === all.length - 1);
  const goals0 = steps.map((x) => ({ ...mergeParts(partsBefore(guide.steps, x.st.id), x.parts) }));
  const frames = framesFor(frame, neutral);
  const variants = frames.map((f, v) => {
    const map = frameMap(f);
    const hold = holdOf(holdFromFaces(map.U, map.F));
    const toModel = (display) => hold.toModelString(display);
    return {
      label: `${f.down} dole`,
      // středy až v posledním kroku: tahy středem (M, r…) je smí cestou posunout (Roux),
      // dílky se do té doby počítají vůči pevným pozicím
      goals: goals0.map((g, i) => ({ ...remap(g, frame, f), ...(i === goals0.length - 1 ? CENTERS : {}) })),
      steps: steps.map((x) => {
        const bases = x.cfg.moves === 'custom' && x.cfg.custom?.length ? x.cfg.custom : (STEP_MOVES[x.cfg.moves] ?? STEP_MOVES.faces).bases;
        const held = bases.flatMap((base) => [1, -1, 2].map((amount) => ({ base, amount })));
        const moves = held.map((m) => hold.toModel(P.moveToString(m))[0]);
        const layer = (b) => ['', b, `${b}'`, `${b}2`];
        const adj = x.cfg.adjust === 'UD' ? layer('U').flatMap((u) => layer('D').map((d) => [u, d].filter(Boolean).join(' ')))
          : x.cfg.adjust === 'U' ? layer('U') : [''];
        const adjust = adj.map((d) => ({ display: d, model: d ? toModel(d) : '' }));
        const helpers = String(x.cfg.helpers ?? '').split(/[,;\n]/).map(clean).filter(Boolean).flatMap((d) => {
          try { return [{ display: d, model: toModel(d) }]; } catch { return []; }
        });
        const candidates = x.cfg.mode === 'search' ? [] : x.algs.flatMap((a) => {
          try {
            const display = clean(a.alg);
            if (!display) return [];
            // výchozí orientace: zápis podle držení, ve kterém je algoritmus uložený; další orientace
            // berou zápis vůči držení metody
            const model = v === 0 ? holdOf(a.task?.hold ?? '').toModelString(display) : toModel(display);
            const recent = (a.times ?? []).slice(-5).map((t) => t.t);
            return [{ model, display, name: a.name, score: scoreFor(P, display, ergo).total, time: recent.length >= 3 ? median(recent) : undefined }];
          } catch { return []; }
        });
        return { moves, held, adjust: { pre: adjust, post: adjust, helpers }, candidates };
      }),
    };
  });
  const stepOpts = steps.map((x) => ({ mode: x.cfg.mode, view: x.cfg.view, time: Math.max(500, Math.min(120000, (Number(x.cfg.time) || 3) * 1000)), recog: Number(x.cfg.recog) || 0 }));
  return { plan: { lambda, ergonomics, variants, stepOpts }, steps };
}
