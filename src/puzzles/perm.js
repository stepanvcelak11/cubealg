// Obecný model hlavolamu, jehož tahy jsou permutace nálepek (3×3, 2×2,
// Pyraminx, Skewb). Stav je „loc“ jako u 3×3: loc[k] = pozice nálepky k.
//
// Hlavolam = nálepky (barva = písmeno stěny), dílky (sloty: nálepky
// seřazené – referenční první, dál po směru hodinových ručiček zvenku)
// a tahy (permutace pro jedno otočení po směru hodinových ručiček).

const EPS = 1e-6;

/**
 * Doplní odvozené struktury a operace k definici hlavolamu.
 * @param {object} def
 * @param {string} def.id
 * @param {string} def.name
 * @param {string[]} def.stickerFace barva (stěna) každé nálepky ve složeném stavu
 * @param {{name:string, type:string, facelets:number[]}[]} def.slots
 * @param {Record<string, {perm: Uint8Array, order: number}>} def.moves základy tahů
 * @param {(text:string) => {base:string, amount:number}[]} [def.parse] vlastní parser
 */
export function makePuzzle(def) {
  const n = def.stickerFace.length;
  const slots = def.slots.map((s, id) => ({ ...s, id }));
  const SLOT_OF = new Uint8Array(n);
  const ORI_AT = new Uint8Array(n);
  for (const s of slots) s.facelets.forEach((f, i) => { SLOT_OF[f] = s.id; ORI_AT[f] = i; });
  const bases = Object.keys(def.moves);
  const baseIndex = Object.fromEntries(bases.map((b, i) => [b, i]));

  const orderOf = (base) => {
    const mv = def.moves[base];
    if (!mv) throw new Error(`Neznámý tah „${base}“ (${def.name})`);
    return mv.order;
  };
  // Otočení normalizované na 1, -1 (a 2 u tahů řádu 4).
  const normAmount = (base, k) => {
    const order = orderOf(base);
    const a = ((k % order) + order) % order;
    if (a === 0) return 0;
    return a === order - 1 ? -1 : a;
  };
  const amountsOf = (base) => (orderOf(base) === 4 ? [1, -1, 2] : orderOf(base) === 2 ? [1] : [1, -1]);

  const permCache = new Map();
  /** Permutace pozic pro tah: to[i] = kam se přesune nálepka z pozice i. */
  function perm(m) {
    const key = `${m.base}${m.amount}`;
    let to = permCache.get(key);
    if (to) return to;
    const one = def.moves[m.base].perm;
    const order = orderOf(m.base);
    const times = ((m.amount % order) + order) % order;
    to = Uint8Array.from({ length: n }, (_, i) => i);
    for (let t = 0; t < times; t++) to = Uint8Array.from(to, (p) => one[p]);
    permCache.set(key, to);
    return to;
  }

  const moveToString = (m) => {
    const order = orderOf(m.base);
    if (m.amount === -1) return `${m.base}'`;
    if (m.amount === 2 && order === 4) return `${m.base}2`;
    return m.base;
  };

  const tokenRe = new RegExp(`\\s*(${[...bases].sort((a, b) => b.length - a.length).map(escape).join('|')})(\\d*)(['’]?)`, 'y');
  function parseAlg(input) {
    if (Array.isArray(input)) return input.map((m) => ({ base: m.base, amount: normAmount(m.base, m.amount) }));
    if (def.parse) return def.parse(String(input));
    const src = String(input).replace(/[()[\],]/g, ' ');
    const moves = [];
    let pos = 0;
    while (pos < src.length) {
      if (/^\s*$/.test(src.slice(pos))) break;
      tokenRe.lastIndex = pos;
      const t = tokenRe.exec(src);
      if (!t) throw new Error(`Nerozpoznaný zápis u „${src.slice(pos).trim()}“`);
      const k = t[2] === '' ? 1 : Number(t[2]);
      const amount = normAmount(t[1], t[3] ? -k : k);
      if (amount !== 0) moves.push({ base: t[1], amount });
      pos = tokenRe.lastIndex;
    }
    return moves;
  }
  const algToString = (alg) => parseAlg(alg).map(moveToString).join(' ');
  const invertAlg = (alg) => parseAlg(alg).reverse().map((m) => ({ base: m.base, amount: m.amount === 2 ? 2 : -m.amount }));

  const solved = () => Uint8Array.from({ length: n }, (_, i) => i);
  function applyAlg(loc, alg) {
    const out = Uint8Array.from(loc);
    for (const m of parseAlg(alg)) {
      const to = perm(m);
      for (let k = 0; k < n; k++) out[k] = to[out[k]];
    }
    return out;
  }

  // Kanonické pořadí: stejný základ za sebou nikdy, komutující tahy jen
  // v jednom pořadí (podle pořadí základů).
  const commute = new Map();
  function commutes(a, b) {
    const key = `${a}|${b}`;
    if (!commute.has(key)) {
      const p = def.moves[a].perm, q = def.moves[b].perm;
      let same = true;
      for (let i = 0; i < n && same; i++) same = q[p[i]] === p[q[i]];
      commute.set(key, same);
    }
    return commute.get(key);
  }
  const redundant = def.redundant ?? ((prev, next) => {
    if (!prev) return false;
    if (prev.base === next.base) return true;
    return baseIndex[prev.base] > baseIndex[next.base] && commutes(prev.base, next.base);
  });

  const normName = (name) => [...name].sort().join('');
  const byName = new Map(slots.map((s) => [s.name, s]));
  const byNorm = new Map(slots.map((s) => [`${s.type}:${normName(s.name)}`, s]));
  function slotByName(name) {
    const s = byName.get(name) ?? slots.find((x) => normName(x.name) === normName(name));
    if (!s) throw new Error(`Neznámý dílek „${name}“`);
    return s;
  }

  return {
    kind: 'perm',
    ...def,
    size: n,
    slots, SLOT_OF, ORI_AT, bases, baseIndex,
    orderOf, normAmount, amountsOf,
    perm, moveToString, parseAlg, algToString, invertAlg,
    solved, applyAlg, redundant, slotByName, byNorm,
  };
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Geometrická konstrukce -----------------------------------------------------------

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };

/** Otočení vektoru v kolem osy (jednotkové) o úhel (rad, proti směru hodinových ručiček při pohledu z konce osy). */
export function rotateAround(v, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const k = axis, kv = cross(k, v), kd = dot(k, v);
  return [0, 1, 2].map((i) => v[i] * c + kv[i] * s + k[i] * kd * (1 - c));
}

/**
 * Z geometrie nálepek spočte sloty a permutace tahů.
 * @param {object} g
 * @param {{face:string, c:number[], n:number[]}[]} g.stickers střed a normála každé nálepky
 * @param {(i:number) => string} g.pieceOf klíč dílku, ke kterému nálepka patří
 * @param {(key:string, size:number) => string} g.typeOf typ dílku
 * @param {(faces:string[], type:string, key:string) => string} [g.nameOf] název slotu (podle barev nebo klíče)
 * @param {string[]} g.refPriority pořadí stěn pro volbu referenční nálepky
 * @param {Record<string, {axis:number[], order:number, select:(c:number[]) => boolean}>} g.moves
 */
export function fromGeometry({ stickers, pieceOf, typeOf, nameOf = (faces) => faces.join(''), refPriority, moves }) {
  const groups = new Map();
  stickers.forEach((_, i) => {
    const k = pieceOf(i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  });
  const slots = [];
  for (const [key, list] of groups) {
    const center = [0, 1, 2].map((d) => list.reduce((s, i) => s + stickers[i].c[d], 0) / list.length);
    const ordered = [...list].sort((a, b) => refPriority.indexOf(stickers[a].face) - refPriority.indexOf(stickers[b].face));
    if (ordered.length === 3) {
      const [a, b, c] = ordered;
      const clockwise = dot(cross(stickers[a].n, stickers[b].n), center) < 0;
      ordered.splice(0, 3, a, clockwise ? b : c, clockwise ? c : b);
    }
    const type = typeOf(key, ordered.length);
    slots.push({ name: nameOf(ordered.map((i) => stickers[i].face), type, key), type, facelets: ordered, center });
  }

  const find = (c, nrm) => stickers.findIndex((s) =>
    Math.abs(s.c[0] - c[0]) + Math.abs(s.c[1] - c[1]) + Math.abs(s.c[2] - c[2]) < EPS
    && Math.abs(s.n[0] - nrm[0]) + Math.abs(s.n[1] - nrm[1]) + Math.abs(s.n[2] - nrm[2]) < EPS);
  const out = {};
  for (const [base, mv] of Object.entries(moves)) {
    const axis = norm(mv.axis);
    const angle = -2 * Math.PI / mv.order; // po směru hodinových ručiček při pohledu z konce osy
    const perm = new Uint8Array(stickers.length);
    stickers.forEach((s, i) => {
      if (!mv.select(s.c)) { perm[i] = i; return; }
      const j = find(rotateAround(s.c, axis, angle), rotateAround(s.n, axis, angle));
      if (j < 0) throw new Error(`Tah ${base}: nálepka ${i} nemá kam jít`);
      perm[i] = j;
    });
    out[base] = { perm, order: mv.order };
  }
  return { stickerFace: stickers.map((s) => s.face), slots, moves: out };
}
