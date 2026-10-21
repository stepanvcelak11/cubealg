// Výčet případů kroku metody: ze zadání (Start = co je hotové před krokem, Cíl =
// co má být hotové po něm) se odvodí všechny stavy hlavolamu, které Startu
// odpovídají, a sloučí se do případů, které řeší stejný algoritmus.
//
//   štítek dílku – co o dílku říká cíl: „-“ = nezáleží; název = dílek musí být
//                  na svém místě (solved / permutation); „O…“ = jen natočení,
//                  „A…“ = barva na místě (allow) – dílky se stejným štítkem jsou
//                  pro cíl zaměnitelné
//   podpis stavu – pro každý slot štítek dílku, který v něm leží, a natočení (jen
//                  když na něm cíli záleží). Výsledek algoritmu na cíl závisí jen
//                  na podpisu, takže stavy se stejným podpisem jsou jeden případ.
//   dosažitelnost – stav musí jít na skutečném hlavolamu složit: invarianty
//                  (parita permutací, součet natočení), které zachovávají všechny
//                  tahy hlavolamu; co podpis nevidí (prohození zaměnitelných dílků,
//                  natočení dílku, na jehož natočení nezáleží), se doladí
//   AUF          – stavy, které se liší natočením horní vrstvy před algoritmem
//                  (a po něm, když to cíl dovolí), jsou jeden případ
//
// Start: celý dílek = přesně tento dílek a natočení; část barev = libovolný dílek
// s těmito barvami (v tomto natočení); nevybarvené místo = cokoli (středy, které
// nejsou vybarvené, zůstávají na svých místech). Volitelně zaměnitelné barvy
// (např. bílá = žlutá): na Startu pak bílá nálepka znamená „bílá nebo žlutá“.

import { taskOps, EMPTY } from './task.js';
import { compileGoal } from './constraints.js';

const ROTATIONS = new Set(['x', 'y', 'z']);

/** Permutace jako pole → parita (0 sudá, 1 lichá). */
function parity(arr) {
  const seen = new Uint8Array(arr.length);
  let p = 0;
  for (let i = 0; i < arr.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = arr[j]) { seen[j] = 1; len++; }
    p ^= (len - 1) & 1;
  }
  return p;
}

/** Statická data hlavolamu pro výčet: typy, generátory a invarianty. */
function puzzleInfo(P) {
  const types = [...new Set(P.slots.map((s) => s.type))];
  const slotsOf = Object.fromEntries(types.map((t) => [t, P.slots.filter((s) => s.type === t)]));
  const slotIndex = new Map(P.slots.map((s, i) => [s.id, i]));
  /** Vlastnosti stavu: parita permutace a součet natočení pro každý typ. */
  const features = (loc) => {
    const par = [], ori = [];
    for (const t of types) {
      const list = slotsOf[t];
      const at = new Map(list.map((s, i) => [s.id, i]));
      const perm = list.map((piece) => at.get(P.SLOT_OF[loc[piece.facelets[0]]]));
      par.push(parity(perm));
      ori.push(list.reduce((sum, piece) => sum + P.ORI_AT[loc[piece.facelets[0]]], 0) % piece0n(list));
    }
    return { par, ori };
  };
  const piece0n = (list) => list[0].facelets.length;
  const solved = P.solved();
  const gens = P.bases.filter((b) => !ROTATIONS.has(b)).map((b) => P.applyAlg(solved, [{ base: b, amount: 1 }]));
  const deltas = gens.map(features);
  // natočení: invariant, když ho žádný tah nemění
  const oriInvariant = types.map((_, i) => deltas.every((d) => d.ori[i] === 0));
  // parity: kombinace typů (XOR), které žádný tah nemění
  const parInvariants = [];
  for (let mask = 1; mask < 1 << types.length; mask++) {
    const ok = deltas.every((d) => types.reduce((x, _, i) => x ^ (mask >> i & 1 ? d.par[i] : 0), 0) === 0);
    if (ok) parInvariants.push(mask);
  }
  return { types, slotsOf, slotIndex, features, oriInvariant, parInvariants };
}

/**
 * Výčet případů.
 * @param {object} P hlavolam (permutační)
 * @param {object} task { colorsA, colorsB, constraints, marks }
 * @param {object} [opts]
 * @param {boolean} [opts.auf] slučovat natočení horní vrstvy (před i po algoritmu, když to cíl dovolí)
 * @param {string[]} [opts.rotations] slučovat stejné případy viděné z jiné strany: otočení celé
 *   kostky, která grupu generují (např. ['y'] nebo ['y', 'z2']); jen když to cíl dovolí
 * @param {string[][]} [opts.interchange] zaměnitelné barvy, např. [['U', 'D']]
 * @param {number} [opts.limit] nejvýš tolik různých podpisů (jinak `tooMany`)
 * @returns {{cases: {rep: Uint8Array, members: Uint8Array[], states: number}[], states: number, goal: object,
 *   target: Uint8Array, constraints: object, labels: string[], tooMany?: boolean, error?: string}}
 */
export function enumerateCases(P, task, { auf = true, rotations = [], interchange = [], limit = 20000, nodeLimit = 3_000_000 } = {}) {
  const ops = taskOps(P);
  const info = puzzleInfo(P);
  const FACE = P.stickerFace;
  // cíl: omezení a cílový stav ze strany B (stejně jako Lab)
  const built = ops.buildTask(task.colorsB, task.colorsB, task.constraints, task.marks ?? {});
  if (built.errors.length) return { cases: [], states: 0, error: built.errors[0] };
  const constraints = built.constraints;
  const target = built.target;
  const goal = compileGoal(constraints, target, P);

  // štítky dílků podle cíle
  const labelOf = new Map(); // název dílku → { label, ori: záleží na natočení? }
  for (const piece of P.slots) {
    let c = constraints[piece.name] ?? 'ignore';
    const single = piece.facelets.length === 1;
    let label = '-', ori = false;
    if (c && typeof c === 'object' && c.allow) { label = `A${piece.type}:${[...c.allow].sort((a, b) => a - b).join(',')}`; ori = true; }
    else if (c === 'solved') { label = piece.name; ori = !single; }
    else if (c === 'permutation') { label = piece.name; }
    else if (c === 'orientation' && !single) { label = `O${piece.type}:${P.ORI_AT[target[piece.facelets[0]]]}`; ori = true; }
    labelOf.set(piece.name, { label, ori });
  }

  // Start: povolené (slot, natočení) pro každý dílek
  const canon = new Map();
  for (const group of interchange) for (const c of group) canon.set(c, group[0]);
  const cn = (c) => canon.get(c) ?? c;
  const A = task.colorsA;
  const allowed = new Map(); // název dílku → [[slotIndex, twist], …]
  for (const piece of P.slots) {
    const n = piece.facelets.length;
    const list = [];
    for (const slot of info.slotsOf[piece.type]) {
      const cs = slot.facelets.map((f) => A[f]);
      const painted = cs.filter((c) => c !== EMPTY).length;
      // nevybarvený střed zůstává na svém místě
      if (n === 1 && painted === 0) { if (slot.id === piece.id) list.push([info.slotIndex.get(slot.id), 0]); continue; }
      for (let t = 0; t < n; t++) {
        let ok = true;
        for (let i = 0; i < n && ok; i++) {
          const c = cs[(i + t) % n];
          ok = c === EMPTY || cn(c) === cn(FACE[piece.facelets[i]]);
        }
        if (ok) list.push([info.slotIndex.get(slot.id), t]);
      }
    }
    if (!list.length) return { cases: [], states: 0, error: `Dílek ${piece.name} se podle Startu nikam nevejde (zkontroluj barvy)` };
    allowed.set(piece.name, list);
  }

  // třídy zaměnitelných dílků: stejný štítek a stejná povolená místa
  const classes = new Map();
  for (const piece of P.slots) {
    const { label, ori } = labelOf.get(piece.name);
    const key = `${piece.type}|${label}|${allowed.get(piece.name).map((x) => x.join(':')).join(',')}`;
    if (!classes.has(key)) classes.set(key, { type: piece.type, label, ori, pieces: [], allow: new Map() });
    const cl = classes.get(key);
    cl.pieces.push(piece);
    for (const [s, t] of allowed.get(piece.name)) {
      if (!cl.allow.has(s)) cl.allow.set(s, []);
      if (!cl.allow.get(s).includes(t)) cl.allow.get(s).push(t);
    }
  }
  const classList = [...classes.values()];
  const slots = P.slots;
  // pořadí slotů: nejméně možností první
  const options = slots.map((_, s) => classList.filter((c) => c.allow.has(s)).length);
  const order = slots.map((_, i) => i).sort((a, b) => options[a] - options[b]);

  const used = classList.map(() => 0);
  const assign = new Array(slots.length); // slot → [třída, natočení]
  const reps = new Map(); // podpis → reprezentant (loc)
  let nodes = 0, tooMany = false;

  const sigOf = (loc) => {
    const parts = new Array(slots.length);
    for (const piece of slots) {
      const pos = loc[piece.facelets[0]];
      const { label, ori } = labelOf.get(piece.name);
      parts[P.SLOT_OF[pos]] = ori ? `${label}@${P.ORI_AT[pos]}` : label;
    }
    return parts.join('|');
  };

  // konkrétní stav z přiřazení (dílky třídy v pořadí) + doladění invariantů
  const build = () => {
    const take = classList.map(() => 0);
    const pieceAt = new Array(slots.length);
    const twistAt = new Array(slots.length);
    for (let s = 0; s < slots.length; s++) {
      const [ci, t] = assign[s];
      pieceAt[s] = classList[ci].pieces[take[ci]++];
      twistAt[s] = t;
    }
    return fixUp(pieceAt, twistAt);
  };

  const locOf = (pieceAt, twistAt) => {
    const loc = new Uint8Array(P.size);
    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s], piece = pieceAt[s], n = slot.facelets.length;
      piece.facelets.forEach((k, i) => { loc[k] = slot.facelets[(i + twistAt[s]) % n]; });
    }
    return loc;
  };
  const okAt = (piece, s, t) => allowed.get(piece.name).some(([a, b]) => a === s && b === t);

  /** Doladí stav, aby byl dosažitelný (beze změny podpisu), nebo null. */
  function fixUp(pieceAt, twistAt) {
    const T = info.types;
    const check = () => {
      const f = info.features(locOf(pieceAt, twistAt));
      const ori = T.map((_, i) => !info.oriInvariant[i] || f.ori[i] === 0);
      const par = info.parInvariants.every((mask) => T.reduce((x, _, i) => x ^ (mask >> i & 1 ? f.par[i] : 0), 0) === 0);
      return { f, ori, par };
    };
    let st = check();
    // natočení: otočit dílek, na jehož natočení nezáleží
    for (let i = 0; i < T.length; i++) {
      if (st.ori[i]) continue;
      const n = info.slotsOf[T[i]][0].facelets.length;
      let fixed = false;
      for (let s = 0; s < slots.length && !fixed; s++) {
        if (slots[s].type !== T[i] || labelOf.get(pieceAt[s].name).ori) continue;
        for (let d = 1; d < n && !fixed; d++) {
          const t = (twistAt[s] + d) % n;
          if (!okAt(pieceAt[s], s, t)) continue;
          const old = twistAt[s];
          twistAt[s] = t;
          if (check().ori[i]) fixed = true; else twistAt[s] = old;
        }
      }
      if (!fixed) return null;
      st = check();
    }
    if (st.par) return locOf(pieceAt, twistAt);
    // parita: prohodit dva dílky se stejným štítkem (u typu, kde to pomůže)
    for (let a = 0; a < slots.length; a++) {
      for (let b = a + 1; b < slots.length; b++) {
        if (slots[a].type !== slots[b].type || slots[a].facelets.length < 2) continue;
        const pa = pieceAt[a], pb = pieceAt[b];
        if (labelOf.get(pa.name).label !== labelOf.get(pb.name).label) continue;
        if (!okAt(pa, b, twistAt[b]) || !okAt(pb, a, twistAt[a])) continue;
        pieceAt[a] = pb; pieceAt[b] = pa;
        const c = check();
        if (c.par && c.ori.every(Boolean)) return locOf(pieceAt, twistAt);
        pieceAt[a] = pa; pieceAt[b] = pb;
      }
    }
    return null;
  }

  let states = 0;
  const dfs = (k) => {
    if (tooMany) return;
    if (++nodes > nodeLimit) { tooMany = true; return; }
    if (k === order.length) {
      const loc = build();
      if (!loc) return;
      states++;
      const sig = sigOf(loc);
      if (!reps.has(sig)) {
        reps.set(sig, loc);
        if (reps.size > limit) tooMany = true;
      }
      return;
    }
    const s = order[k];
    for (let ci = 0; ci < classList.length; ci++) {
      const cl = classList[ci];
      if (used[ci] >= cl.pieces.length || !cl.allow.has(s)) continue;
      const twists = cl.allow.get(s);
      // natočení, na kterém nezáleží: stačí jedno (doladí se)
      for (const t of cl.ori ? twists : twists.slice(0, 1)) {
        used[ci]++;
        assign[s] = [ci, t];
        dfs(k + 1);
        used[ci]--;
        if (tooMany) return;
      }
    }
  };
  dfs(0);

  // slučování: U před algoritmem, a po něm, když to cíl dovolí (cíl natočený o U je zase cíl)
  const sigs = [...reps.keys()];
  const parent = new Map(sigs.map((s) => [s, s]));
  const find = (s) => { while (parent.get(s) !== s) { parent.set(s, parent.get(parent.get(s))); s = parent.get(s); } return s; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  const hasU = P.bases.includes('U');
  if (auf && hasU) {
    const solved = P.solved();
    const uPerm = [1, 2, 3].map((k) => P.applyAlg(solved, [{ base: 'U', amount: k === 3 ? -1 : k }]));
    // po algoritmu: povoleno, když cíl „natočený o U před ním“ (pravé násobení) je s AUF zase cíl
    const postOk = uPerm.every((u) => anyAuf(P, goal, Uint8Array.from(target, (_, i) => target[u[i]])));
    const pres = [null, ...uPerm];
    const posts = postOk ? [null, ...uPerm] : [null];
    for (const sig of sigs) {
      const loc = reps.get(sig);
      for (const pre of pres) for (const post of posts) {
        if (!pre && !post) continue;
        let x = loc;
        if (post) x = Uint8Array.from(x, (_, i) => x[post[i]]); // natočení U před stavem (pravé násobení)
        if (pre) x = Uint8Array.from(x, (v) => pre[v]);           // natočení U po stavu (= před algoritmem)
        const other = sigOf(x);
        if (parent.has(other)) union(sig, other);
      }
    }
  }
  // otočení celé kostky: stav r·X·r⁻¹ je stejný případ viděný z jiné strany (když se
  // cíl otočením nezmění – stejná omezení na otočených dílcích)
  const syms = rotationGroup(P, rotations).filter((g) => g.seq.length && goalSymmetric(P, constraints, g.perm));
  for (const g of syms) {
    const r = g.perm, inv = new Uint8Array(r.length);
    for (let i = 0; i < r.length; i++) inv[r[i]] = i;
    for (const sig of sigs) {
      const loc = reps.get(sig);
      const other = sigOf(Uint8Array.from(loc, (_, k) => r[loc[inv[k]]]));
      if (parent.has(other)) union(sig, other);
    }
  }
  const groups = new Map();
  for (const sig of sigs) {
    const r = find(sig);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(sig);
  }
  const cases = [...groups.values()].map((list) => ({
    rep: reps.get(list[0]),
    members: list.map((s) => reps.get(s)),
    solved: list.some((s) => anyAuf(P, goal, reps.get(s))),
  }));
  // složené (už splněné) případy na konec
  cases.sort((a, b) => Number(a.solved) - Number(b.solved));
  return { cases, states, signatures: sigs.length, goal, target, constraints, tooMany, auf: auf && hasU, rotations: syms.map((g) => g.seq) };
}

/**
 * Grupa otočení celé kostky generovaná zadanými otočeními (včetně identity):
 * [{ seq: 'y z2', perm }], perm = kam se po otočení dostane každá pozice.
 */
export function rotationGroup(P, gens) {
  const solved = P.solved();
  const out = [{ seq: '', perm: solved }];
  if (!gens.length) return out;
  const seen = new Set([solved.join(',')]);
  for (let i = 0; i < out.length; i++) {
    for (const g of gens) {
      const seq = [out[i].seq, g].filter(Boolean).join(' ');
      const perm = P.applyAlg(solved, seq);
      const key = perm.join(',');
      if (!seen.has(key)) { seen.add(key); out.push({ seq, perm }); }
    }
  }
  return out;
}

/** Je cíl stejný i po otočení r (každý dílek má stejné omezení jako dílek, kam se otočí)? */
function goalSymmetric(P, constraints, r) {
  for (const piece of P.slots) {
    const c = constraints[piece.name] ?? 'ignore';
    const to = P.slots[P.SLOT_OF[r[piece.facelets[0]]]];
    const d = constraints[to.name] ?? 'ignore';
    if (typeof c === 'object' || typeof d === 'object') {
      if (!(c?.allow && d?.allow)) return false;
      const mapped = new Set(c.allow.map((p) => r[p]));
      if (mapped.size !== d.allow.length || !d.allow.every((p) => mapped.has(p))) return false;
    } else if (c !== d) return false;
  }
  return true;
}

/** Splňuje stav cíl, případně po natočení horní vrstvy? */
function anyAuf(P, goal, loc) {
  if (goal.test(loc)) return true;
  if (!P.bases.includes('U')) return false;
  return [1, 2, -1].some((amount) => goal.test(P.applyAlg(loc, [{ base: 'U', amount }])));
}

/**
 * Řeší algoritmus všechny stavy případu? Pro každý stav zkusí natočení U před
 * algoritmem a po něm (AUF).
 * @returns {{ok: boolean, failed: number}}
 */
export function verifyCase(P, goal, members, alg, { auf = true, rotations = [] } = {}) {
  const moves = P.parseAlg(alg);
  const us = auf && P.bases.includes('U') ? [[], ...[1, 2, -1].map((amount) => [{ base: 'U', amount }])] : [[]];
  // případ viděný z jiné strany: otočit kostku, algoritmus, otočit zpět
  const rots = rotationGroup(P, rotations).map((g) => {
    const seq = g.seq ? P.parseAlg(g.seq) : [];
    return [seq, P.invertAlg(seq)];
  });
  let failed = 0;
  for (const loc of members) {
    const ok = rots.some(([r, ri]) => us.some((pre) => us.some((post) =>
      goal.test(P.applyAlg(loc, [...r, ...pre, ...moves, ...post, ...ri])))));
    if (!ok) failed++;
  }
  return { ok: failed === 0, failed };
}

/** Vybarvení (strana zadání) ze stavu: jen dílky, na kterých cíli záleží (ostatní šedé). */
export function colorsOfState(P, loc, constraints) {
  const out = new Array(P.size).fill(EMPTY);
  for (const piece of P.slots) {
    const c = constraints[piece.name] ?? 'ignore';
    if (c === 'ignore') continue;
    for (const k of piece.facelets) out[loc[k]] = P.stickerFace[k];
  }
  return out;
}
