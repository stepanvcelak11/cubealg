// Model zadání pro Lab: jednotné rozhraní nad hlavolamy (vybarvení, rozpoznání
// dílků, sestavení stavu, vykreslení, cíl, přehrávání). „Strana“ zadání je
// u permutačních hlavolamů pole barev nálepek, u Square-1 { state, colors }.

import { taskOps, EMPTY } from '../core/task.js';
import { compileGoal } from '../core/constraints.js';
import { ROTATIONS } from '../core/rotations.js';
import { getPuzzle } from '../puzzles/index.js';
import {
  sq1Ops, applySq1, parseSq1, invertSq1, sq1AlgToString, sq1MoveToString, sq1Polygons,
  solvedState, PIECE_NAMES, PIECE_COLORS, SQ1_VIEWBOX,
} from '../puzzles/sq1.js';
import { SCAN as PYRAMINX_SCAN } from '../puzzles/pyraminx.js';
import { STYLE_OF } from './cubeview.js';

const CACHE = new Map();

/** Model pro hlavolam (podle id). */
export function labModel(id = '333') {
  if (!CACHE.has(id)) {
    const P = getPuzzle(id);
    CACHE.set(id, P.kind === 'sq1' ? sq1Model(P) : permModel(P));
  }
  return CACHE.get(id);
}

function permModel(P) {
  const ops = taskOps(P);
  const css = Object.fromEntries(P.colors.map((c) => [c.face, c.css]));
  const slotNames = P.slots.map((s) => s.name);
  const homeOf = (name) => P.slotByName(name).facelets;
  return {
    P, id: P.id, kind: 'perm', EMPTY,
    pieceNames: slotNames,
    centers: P.slots.filter((s) => s.facelets.length === 1 && s.type === 'center' && P.id === '333').map((s) => s.name),
    blank: () => ops.blankColors(),
    home: (names, side) => ops.homeColors(names, side),
    applyMoves: (side, alg) => ops.moveColors(side, alg),
    paint: (side, pos, color, last) => ops.paintSticker(side, pos, color, last),
    findPiece: (side, name) => ops.findPiece(side, name),
    removePiece: (side, name) => ops.removePiece(side, name),
    homeEmpty: (side, name) => homeOf(name).every((f) => side[f] === EMPTY),
    homeIs: (side, name) => homeOf(name).every((f) => side[f] === P.stickerFace[f]),
    placeHome: (side, name) => ops.placePiece(side, name, name),
    pieceAtSticker: (side, pos) => ops.pieceAt(side, P.slots[P.SLOT_OF[pos]].name),
    identify: (side) => ops.identifyPieces(side),
    build: (side, constraints, where) => ops.buildStart(side, constraints, where),
    /** Nálepky pro pohled podle vybarvení. */
    stickers(side, constraints) {
      const { pieces } = ops.identifyPieces(side);
      const nameAt = new Map([...pieces].map(([name, p]) => [p.slot, name]));
      return side.map((color, pos) => {
        if (color === EMPTY) return { color, style: 'none' };
        const name = nameAt.get(P.SLOT_OF[pos]);
        return { color, css: css[color], style: name ? STYLE_OF[constraints[name]] ?? 'faded' : 'solid' };
      });
    },
    /** Nálepky pro pohled podle stavu (přehrávač, trenažér). */
    stateStickers(loc, constraints) {
      const out = new Array(P.size);
      for (let k = 0; k < P.size; k++) {
        const name = P.slots[P.SLOT_OF[k]].name;
        out[loc[k]] = { color: P.stickerFace[k], css: css[P.stickerFace[k]], style: STYLE_OF[constraints[name]] ?? 'none' };
      }
      return out;
    },
    goal(constraints, target) {
      const g = compileGoal(constraints, target, P);
      const rotations = P.id === '333' ? ROTATIONS : [];
      return {
        test: g.test,
        violations: g.violations,
        /** Splněno po otočení celé kostky? */
        rotated: (loc) => rotations.some((r) => g.test(P.applyAlg(loc, r))),
      };
    },
    steps: (alg) => P.parseAlg(alg),
    stepToString: (m) => P.moveToString(m),
    applySteps: (loc, steps) => P.applyAlg(loc, steps),
    invertStep: (m) => ({ base: m.base, amount: m.amount === 2 ? 2 : -m.amount }),
    algToString: (alg) => P.algToString(alg),
    invertAlg: (alg) => P.algToString(P.invertAlg(alg)),
    allows: (moveSet, m) => moveSet.allowedNames.has(P.moveToString(m)),
    serialize: (side) => [...side],
    deserialize: (data) => (Array.isArray(data) && data.length === P.size ? [...data] : null),
    solved: () => P.solved(),
    view: P.view === 'cube3d'
      ? { type: 'cube3d', facelets: P.view3d.facelets, scale: P.view3d.scale }
      : { type: 'net', viewBox: P.net.viewBox, polys: P.net.polys },
    flatView: P.net ? { type: 'net', viewBox: P.net.viewBox, polys: P.net.polys } : null,
    scan: scanSpecOf(P),
  };
}

// --- Focení: tvar stěny a držení hlavolamu ----------------------------------------------
// Obrys každé stěny se odvodí z plošné sítě (mnohoúhelníky nálepek), případně
// otočené tak, aby byl nahoře zvolený vrchol (Pyraminx). Souřadnice 0…1.

const parsePoly = (s) => s.split(' ').map((p) => p.split(',').map(Number));
const CUBE_FACES = ['U', 'F', 'R', 'B', 'L', 'D'];
const FACE_NAME = { U: 'bílá', D: 'žlutá', F: 'zelená', B: 'modrá', R: 'červená', L: 'oranžová' };
// Jak držet kostku, aby nálepky odpovídaly síti (U nad F, D pod F).
const CUBE_HOLD = (face, center) => {
  const up = face === 'U' ? 'zelená stěna (F) je dole u tebe' : face === 'D' ? 'zelená stěna (F) je nahoře' : 'bílá stěna (U) je nahoře';
  return `Natoč ke kameře stěnu ${face} (${FACE_NAME[face]}${center ? ' střed' : ''}), ${up}.`;
};

function scanSpecOf(P) {
  const info = {
    333: { faces: CUBE_FACES, hold: (f) => CUBE_HOLD(f, true), detect: (grid) => grid[4] },
    222: {
      faces: CUBE_FACES, hold: (f) => CUBE_HOLD(f, false),
      note: '2×2 nemá středy – drž kostku pořád stejně (bílá nahoře, zelená vpředu) a jen ji otáčej.',
    },
    skewb: {
      faces: CUBE_FACES, hold: (f) => CUBE_HOLD(f, false),
      note: 'Středy se přesouvají: roh bílá–červená–zelená dej vpravo nahoře vpředu a pak otáčej celým Skewbem.',
    },
    pyram: {
      faces: ['F', 'L', 'R', 'D'], ...pyraminxInfo(),
    },
  }[P.id];
  if (!info || !P.net) return null;
  const polys = P.net.polys.map(parsePoly);
  const cache = new Map();
  function build(face) {
    const indices = P.stickerFace.map((f, i) => (f === face ? i : -1)).filter((i) => i >= 0);
    const all = indices.flatMap((i) => polys[i]);
    const cx = all.reduce((t, p) => t + p[0], 0) / all.length;
    const cy = all.reduce((t, p) => t + p[1], 0) / all.length;
    let turn = 0;
    const top = info.top?.[face];
    if (top) {
      const [vx, vy] = info.vertices[face][top];
      turn = -Math.PI / 2 - Math.atan2(vy - cy, vx - cx);
    }
    const rot = ([x, y]) => {
      const dx = x - cx, dy = y - cy;
      return [dx * Math.cos(turn) - dy * Math.sin(turn), dx * Math.sin(turn) + dy * Math.cos(turn)];
    };
    const rotated = indices.map((i) => polys[i].map(rot));
    const flat = rotated.flat();
    const xs = flat.map((p) => p[0]), ys = flat.map((p) => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const size = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
    const offX = (size - (Math.max(...xs) - minX)) / 2, offY = (size - (Math.max(...ys) - minY)) / 2;
    const norm = ([x, y]) => [(x - minX + offX) / size, (y - minY + offY) / size];
    const marks = top ? Object.entries(info.vertices[face]).map(([text, at]) => {
      // popisek kousek dovnitř od vrcholu
      const [x, y] = rot(at);
      const k = 0.78;
      return { text, at: norm([x * k, y * k]) };
    }) : [];
    return { indices, polys: rotated.map((poly) => poly.map(norm)), marks };
  }
  return {
    faces: info.faces,
    hold: info.hold,
    note: info.note,
    detect: info.detect,
    cells: (face) => { if (!cache.has(face)) cache.set(face, build(face)); return cache.get(face); },
  };
}

// Vrcholy, jejichž střed nemá nálepku dané barvy: U nemá žlutou (D), L modrou (R), R červenou (L), B zelenou (F).
const LACKS = { U: 'D', L: 'R', R: 'L', B: 'F' };
const PYR_NAME = { F: 'zelená', L: 'červená', R: 'modrá', D: 'žlutá' };
function pyraminxInfo() {
  return {
    top: PYRAMINX_SCAN.top,
    vertices: PYRAMINX_SCAN.vertices,
    hold: (face) => {
      const v = PYRAMINX_SCAN.top[face];
      return `Natoč ke kameře stěnu ${face} (${PYR_NAME[face]}), nahoře má být vrchol ${v} – jeho střed nemá ${PYR_NAME[LACKS[v]]} nálepku.`;
    },
    note: 'Písmena v obrysu ukazují vrcholy.',
  };
}

function sq1Model(P) {
  const ops = sq1Ops();
  const css = Object.fromEntries(P.colors.map((c) => [c.face, c.css]));
  const STYLE_NONE = (constraints, name) => STYLE_OF[constraints[name]];

  // nálepky (barvy pozic) pro stav: každý dílek svými barvami
  const stateColors = (state) => {
    const colors = new Array(48).fill(EMPTY);
    for (let i = 0; i < 24; i++) {
      const v = state[i], piece = v >> 1, half = v & 1;
      const layer = i < 12 ? 0 : 1, k = i % 12;
      colors[layer * 24 + k * 2] = PIECE_COLORS[piece].face;
      colors[layer * 24 + k * 2 + 1] = PIECE_COLORS[piece].sides[half];
    }
    return colors;
  };
  const nameAtPos = (state, pos) => {
    const layer = pos >= 24 ? 1 : 0, k = (pos % 24) >> 1;
    return PIECE_NAMES[state[layer * 12 + k] >> 1];
  };
  const overlay = (state) => {
    const mid = state[24] ? 'střed otočený' : 'střed rovně';
    return `<text class="nv-label" x="-3.1" y="-6.9">U</text><text class="nv-label" x="-2.6" y="7.45">D (shora)</text>
      <text class="nv-label" x="0" y="0.12">${mid} · F ↓</text>`;
  };

  return {
    P, id: 'sq1', kind: 'sq1', EMPTY,
    pieceNames: PIECE_NAMES,
    centers: [],
    blank: (side) => ops.blank(side?.state),
    home: (names) => ops.home(names),
    applyMoves: (side, alg) => ops.applyMoves(side, alg),
    paint: (side, pos, color, last) => ops.paint(side, pos, color, last),
    findPiece: (side, name) => ops.findPiece(side, name),
    removePiece: (side, name) => ops.removePiece(side, name),
    homeEmpty: (side, name) => ops.homeEmpty(side, name),
    homeIs: (side, name) => {
      const p = ops.findPiece(side, name);
      const home = ops.findPiece(ops.home([name]), name);
      return !!p && JSON.stringify(p.places) === JSON.stringify(home.places);
    },
    placeHome: (side, name) => ops.placeHome(side, name),
    pieceAtSticker: (side, pos) => ops.pieceAtSticker(side, pos),
    identify: (side) => ops.identify(side),
    build: (side, constraints, where) => ops.build(side, constraints, where),
    stickers(side, constraints) {
      const { pieces } = ops.identify(side);
      const known = new Map();
      for (const [name, p] of pieces) for (const [l, k] of p.places) known.set(l * 12 + k, name);
      return sq1Polygons(side.state).map(({ pos, points }) => {
        const color = side.colors[pos];
        if (color === EMPTY) return { pos, points, color, style: 'none' };
        const layer = pos >= 24 ? 1 : 0, k = (pos % 24) >> 1;
        const name = known.get(layer * 12 + k);
        return { pos, points, color, css: css[color], style: name ? STYLE_NONE(constraints, name) ?? 'faded' : 'solid' };
      });
    },
    stateStickers(state, constraints) {
      const colors = stateColors(state);
      return sq1Polygons(state).map(({ pos, points }) => ({
        pos, points, color: colors[pos], css: css[colors[pos]], style: STYLE_NONE(constraints, nameAtPos(state, pos)) ?? 'none',
      }));
    },
    overlay,
    goal(constraints, target, { shape = true } = {}) {
      const where = new Map();
      for (let i = 0; i < 24; i++) if ((target[i] & 1) === 0) where.set(target[i] >> 1, i);
      const tracked = Object.entries(constraints).filter(([, t]) => t && t !== 'ignore');
      const posOf = (s, piece) => Array.from(s).indexOf(piece * 2);
      const shapeKey = (s) => Array.from(s.slice(0, 24), (v) => ((v >> 1) >= 8 ? 1 + (v & 1) : 0)).join('') + s[24];
      const checks = (s) => tracked.map(([name, t]) => {
        const piece = PIECE_NAMES.indexOf(name), p = posOf(s, piece), g = where.get(piece);
        return t === 'orientation' ? (p < 12) === (g < 12) : p === g;
      });
      const shapeOk = (s) => !shape || shapeKey(s) === shapeKey(target);
      return {
        test: (s) => shapeOk(s) && checks(s).every(Boolean),
        violations: (s) => checks(s).filter((x) => !x).length + (shapeOk(s) ? 0 : 1),
        rotated: () => false,
      };
    },
    steps: (alg) => parseSq1(alg),
    stepToString: sq1MoveToString,
    applySteps: (state, steps) => applySq1(state, steps),
    invertStep: (m) => (m.t === 'slash' ? m : { t: 'turn', a: -m.a, b: -m.b }),
    algToString: (alg) => sq1AlgToString(alg),
    invertAlg: (alg) => sq1AlgToString(invertSq1(alg)),
    allows: (moveSet, m) => m.t === 'slash' || ((m.a === 0 || moveSet.top.includes(m.a)) && (m.b === 0 || moveSet.bottom.includes(m.b))),
    serialize: (side) => ({ state: Array.from(side.state), colors: [...side.colors] }),
    deserialize: (data) => (data?.state?.length === 25 && data.colors?.length === 48
      ? { state: Int8Array.from(data.state), colors: [...data.colors] } : null),
    solved: () => solvedState(),
    view: { type: 'net', viewBox: SQ1_VIEWBOX, polys: [] },
    flatView: null,
  };
}
