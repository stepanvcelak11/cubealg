// Držení hlavolamu = natočení celého hlavolamu (symetrie), při kterém zůstane sada
// tahů stejná (jen se přejmenují). Algoritmy ve „tvém“ rámci (held) se převádějí
// na tahy modelu a zpět. Obecný postup pro permutační hlavolamy z geometrie nálepek:
// z os otáčení (P.holdAxes) se vygeneruje grupa natočení, každé natočení je
// permutace nálepek a použitelné je jen tehdy, když každý tah převede na tah.

import { norm, rotateAround } from './perm.js';

const EPS = 1e-6;
const cache = new WeakMap();

const roundKey = (v) => v.map((x) => Math.round(x * 1e4) / 1e4 + 0).join(',');

/** Natočení (matice jako obrazy os) vygenerovaná osami; vrací funkce v → R·v. */
function rotationGroup(axes) {
  const unit = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const apply = (rot, v) => rot.reduce((acc, col, i) => acc.map((a, d) => a + col[d] * v[i]), [0, 0, 0]);
  const gens = axes.map(({ axis, order }) => {
    const a = norm(axis);
    return unit.map((e) => rotateAround(e, a, (2 * Math.PI) / order)); // sloupce = obrazy os
  });
  const key = (rot) => rot.map(roundKey).join('|');
  const id = unit.map((e) => [...e]);
  const seen = new Map([[key(id), id]]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    for (const g of gens) {
      const next = cur.map((col) => apply(g, col)); // g ∘ cur
      const k = key(next);
      if (!seen.has(k)) { seen.set(k, next); queue.push(next); }
    }
  }
  return [...seen.values()].map((rot) => (v) => apply(rot, v));
}

/** Seznam držení hlavolamu: první je výchozí (identita). */
export function holdsOf(P) {
  if (cache.has(P)) return cache.get(P);
  const list = P.holdAxes && P.stickers ? build(P) : [];
  cache.set(P, list);
  return list;
}

function build(P) {
  const { stickers } = P;
  const n = stickers.length;
  const close = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < EPS * 100;
  const findSticker = (c, nrm) => stickers.findIndex((s) => close(s.c, c) && close(s.n, nrm));
  // tabulka všech tahů podle permutace
  const table = new Map();
  for (const base of P.bases) for (const amount of P.amountsOf(base)) {
    table.set(P.perm({ base, amount }).join(), { base, amount });
  }
  const holds = [];
  for (const R of rotationGroup(P.holdAxes)) {
    const rho = new Uint8Array(n);
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const j = findSticker(R(stickers[i].c), R(stickers[i].n));
      if (j < 0) ok = false; else rho[i] = j;
    }
    if (!ok) continue;
    const rhoInv = new Uint8Array(n);
    rho.forEach((q, p) => { rhoInv[q] = p; });
    const toModel = new Map(), toHeld = new Map();
    for (const base of P.bases) for (const amount of P.amountsOf(base)) {
      const h = P.perm({ base, amount });
      const m = table.get(Uint8Array.from(rho, (q) => rhoInv[h[q]]).join());
      if (!m) { ok = false; break; }
      toModel.set(`${base}${amount}`, m);
      toHeld.set(`${m.base}${m.amount}`, { base, amount });
    }
    if (!ok) continue;
    holds.push(makeHold(P, rho, toModel, toHeld));
  }
  // identita první, ostatní podle popisu; id = pořadí
  holds.sort((a, b) => (b.identity - a.identity) || a.label.localeCompare(b.label, 'cs'));
  holds.forEach((h, i) => { h.id = h.identity ? '' : `h${i}`; });
  return holds;
}

function makeHold(P, rho, toModel, toHeld) {
  const identity = rho.every((q, i) => q === i);
  const faceMap = {};
  for (const f of new Set(P.stickerFace)) faceMap[f] = P.stickerFace[rho[P.stickerFace.indexOf(f)]];
  const slotMap = {};
  for (const s of P.slots) slotMap[s.name] = P.slots[P.SLOT_OF[rho[s.facelets[0]]]].name;
  const convert = (map) => (alg) => P.parseAlg(alg).map((m) => map.get(`${m.base}${m.amount}`));
  const str = (moves) => P.algToString(moves);
  const hold = {
    identity, rho, faceMap, slotMap,
    toModel: convert(toModel),
    toHeld: convert(toHeld),
    toModelString: (alg) => str(hold.toModel(alg)),
    toHeldString: (alg) => str(hold.toHeld(alg)),
    label: '',
    describe: () => hold.label,
  };
  if (P.describeHold) hold.label = P.describeHold({ slotMap, faceMap });
  else {
    // tahy ve tvém držení odpovídají tahům výchozí polohy
    hold.label = identity ? 'výchozí' : `tahy ${P.bases.join(' ')} odpovídají ${P.bases.map((b) => toModel.get(`${b}1`).base).join(' ')}`;
  }
  return hold;
}

