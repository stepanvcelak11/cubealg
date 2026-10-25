// Zadání úlohy dvěma vybarvenými hlavolamy (výchozí stav A a cíl B).
//
//   vybarvení   – barva (písmeno stěny) každé nálepky, 'X' = nevybarveno
//   omezení     – u každého dílku styl, co se má vyřešit
//                 (solved = plná, permutation = čárkovaná, orientation = tečkovaná)
//   styl nálepky – v cíli může mít jednotlivá nálepka vlastní styl (marks: pozice →
//                 styl), který přebije styl dílku: plná = tahle barva přesně tady,
//                 tečkovaná = tahle barva na této stěně (dílek kdekoli, kde to jde),
//                 čárkovaná = dílek v tomto slotu; dílek s různými styly nálepek
//                 dostane omezení { allow } (průnik povolených poloh)
//   částečně vybarvený dílek (jen některé nálepky) – v cíli znamená „tahle barva
//                 má být tady“ (zachovat orientaci barvy, na tom, který dílek to
//                 je, nezáleží); ve výchozí straně se za něj dosadí libovolný dílek
//                 s těmi barvami (buildTask)
//
// Z vybarvení se rozpoznají dílky a sestaví se úplný stav pro hledání;
// nesledované dílky se doplní libovolně (na výsledek nemají vliv).
//
// Funkce jsou obecné pro každý permutační hlavolam (taskOps(puzzle));
// samostatné exporty pracují s 3×3.

import { CUBE3 } from '../puzzles/cube3.js';

export const EMPTY = 'X';

const CACHE = new WeakMap();

/** Operace se zadáním pro daný hlavolam. */
export function taskOps(puzzle) {
  let ops = CACHE.get(puzzle);
  if (!ops) { ops = makeOps(puzzle); CACHE.set(puzzle, ops); }
  return ops;
}

function makeOps(P) {
  const { slots, SLOT_OF, ORI_AT, stickerFace: FACE } = P;
  const N = P.size;
  const signature = (type, faces) => `${type}:${[...faces].sort().join('')}`;
  // podpis (typ + barvy) → dílky; víc dílků se stejnými barvami mají jen velké kostky
  // (dvě křídla hrany, středy stejné barvy)
  const SIGNATURES = new Map();
  for (const s of slots) {
    const key = signature(s.type, s.facelets.map((f) => FACE[f]));
    if (!SIGNATURES.has(key)) SIGNATURES.set(key, []);
    SIGNATURES.get(key).push(s);
  }
  const slotByName = (name) => P.slotByName(name);

  // kam se tahy může dostat referenční nálepka dílku (rozliší dílky se stejnými barvami,
  // např. dvě křídla hrany 4×4 – každé má jen „svou“ polovinu poloh)
  const REACH = new Map();
  function reachOf(piece) {
    if (!REACH.has(piece.id)) {
      const perms = Object.keys(P.moves ?? {}).length ? P.bases.map((b) => P.perm({ base: b, amount: 1 })) : [];
      const seen = new Set([piece.facelets[0]]);
      const queue = [piece.facelets[0]];
      while (queue.length) { const q = queue.pop(); for (const to of perms) if (!seen.has(to[q])) { seen.add(to[q]); queue.push(to[q]); } }
      REACH.set(piece.id, seen);
    }
    return REACH.get(piece.id);
  }

  /** Prázdné vybarvení (jen 'X'). */
  const blankColors = () => new Array(N).fill(EMPTY);

  /** Vybarvení, kde dané dílky leží složené na svých místech. */
  function homeColors(pieceNames, colors = blankColors()) {
    const out = [...colors];
    for (const name of pieceNames) for (const f of slotByName(name).facelets) out[f] = FACE[f];
    return out;
  }

  /** Posune vybarvení tahy (jako by se tahy provedly na skutečném hlavolamu). */
  function moveColors(colors, alg) {
    let cur = [...colors];
    for (const m of P.parseAlg(alg)) {
      const to = P.perm(m);
      const next = new Array(N);
      for (let p = 0; p < N; p++) next[to[p]] = cur[p];
      cur = next;
    }
    return cur;
  }

  /**
   * Rozpozná dílky ve vybarvení.
   * @returns {{pieces: Map<string, {slot: number, loc: number[]}>, errors: string[]}}
   *   pieces: název dílku → slot, kde leží, a pozice jeho nálepek (v pořadí slotu domova)
   */
  function identifyPieces(colors, { partial = false } = {}) {
    const pieces = new Map();
    const errors = [];
    const partials = []; // { slot, colors } – částečně vybarvené sloty (jen s partial)
    for (const slot of slots) {
      const cs = slot.facelets.map((f) => colors[f]);
      const painted = cs.filter((c) => c !== EMPTY).length;
      if (painted === 0) continue;
      const where = slot.name;
      if (painted < cs.length) {
        if (partial) partials.push({ slot, colors: cs });
        else errors.push(`Dílek na pozici ${where} není vybarvený celý`);
        continue;
      }
      const candidates = SIGNATURES.get(signature(slot.type, cs));
      if (!candidates) { errors.push(`Na pozici ${where} je dílek s barvami ${cs.join('')}, takový neexistuje`); continue; }
      // dílek, který sem pasuje natočením (ne zrcadlově), může se sem tahy dostat a ještě
      // není použitý
      let found = null, mirrored = null, taken = null;
      for (const piece of candidates) {
        if (candidates.length > 1) {
          const at = slot.facelets[cs.indexOf(FACE[piece.facelets[0]])];
          if (!reachOf(piece).has(at)) { mirrored ??= piece; continue; }
        }
        const n = piece.facelets.length;
        const shift = cs.indexOf(FACE[piece.facelets[0]]);
        const loc = piece.facelets.map((k) => slot.facelets[cs.indexOf(FACE[k])]);
        if (loc.some((at, i) => ORI_AT[at] !== (shift + i) % n)) { mirrored ??= piece; continue; }
        if (pieces.has(piece.name)) { taken ??= piece; continue; }
        found = { piece, loc };
        break;
      }
      if (!found) {
        errors.push(taken ? `Dílek ${taken.name} je vybarvený víckrát` : `Dílek ${mirrored.name} na pozici ${where} je natočený nemožně (zrcadlově)`);
        continue;
      }
      pieces.set(found.piece.name, { slot: slot.id, loc: found.loc });
    }
    return { pieces, errors, partials };
  }

  /** Poloha referenční nálepky dílku, když jeho nálepka j leží na pozici pos. */
  const refAt = (pos, j) => {
    const slot = slots[SLOT_OF[pos]];
    const n = slot.facelets.length;
    const q = slot.facelets.indexOf(pos);
    return slot.facelets[(((q - j) % n) + n) % n];
  };

  /**
   * Kde smí ležet nálepka, která je v cíli na pozici pos se stylem style:
   * plná – přesně tady, čárkovaná – kdekoli v tomto slotu, tečkovaná – na stejné
   * stěně (v kterémkoli slotu stejného typu).
   */
  const stickerPlaces = (pos, style) => {
    const slot = slots[SLOT_OF[pos]];
    if (style === 'permutation') return slot.facelets;
    if (style === 'orientation') {
      return slots.filter((s) => s.type === slot.type).flatMap((s) => s.facelets.filter((q) => FACE[q] === FACE[pos]));
    }
    return [pos];
  };

  /**
   * Úplné zadání z obou stran: výchozí stav, cíl a omezení. Celé dílky v cíli mají
   * styl z `constraints`; částečně vybarvené sloty v cíli jsou „barva na místě“:
   * všechny dílky s tou barvou (daného typu, které v cíli nejsou celé) ji musí mít
   * na některém z těch míst – omezení { allow: [povolené polohy referenční nálepky] }.
   * Částečně vybarvené sloty ve výchozí straně se obsadí dílky s těmi barvami.
   * @returns {{loc: Uint8Array|null, target: Uint8Array|null, constraints: object, errors: string[], tracked: string[], known?: Uint8Array}}
   *   known: nálepky dílků (podle pozice ve složeném stavu), jejichž barva je ve výchozí straně vybarvená
   */
  function buildTask(colorsA, colorsB, constraints, marks = {}) {
    const errors = [];
    const B = identifyPieces(colorsB, { partial: true });
    errors.push(...B.errors.map((e) => `Cíl: ${e}`));
    const out = Object.fromEntries(Object.entries(constraints).map(([k, v]) => [k, B.pieces.has(k) ? v : (v === 'ignore' ? v : 'ignore')]));
    // celé dílky s různými styly nálepek: průnik povolených poloh referenční nálepky
    for (const [name, p] of B.pieces) {
      const own = out[name];
      const styles = p.loc.map((pos) => marks[pos] ?? own);
      if (styles.every((st) => st === styles[0])) { out[name] = styles[0]; continue; }
      let set = null;
      p.loc.forEach((pos, j) => {
        if (!styles[j] || styles[j] === 'ignore' || typeof styles[j] === 'object') return;
        const refs = new Set(stickerPlaces(pos, styles[j]).map((q) => refAt(q, j)));
        set = set ? new Set([...set].filter((r) => refs.has(r))) : refs;
      });
      if (!set) { out[name] = 'ignore'; continue; }
      if (!set.size) errors.push(`Cíl: styly nálepek dílku ${name} si odporují`);
      out[name] = { allow: [...set] };
    }
    // barva na místě: skupiny (typ, barva) → povolené pozice nálepky té barvy
    const groups = new Map();
    for (const { slot, colors } of B.partials) {
      slot.facelets.forEach((f, i) => {
        if (colors[i] === EMPTY) return;
        const key = `${slot.type}:${colors[i]}`;
        if (!groups.has(key)) groups.set(key, { type: slot.type, color: colors[i], at: [], places: new Set() });
        const g = groups.get(key);
        g.at.push(f);
        for (const q of stickerPlaces(f, marks[f] ?? 'solved')) g.places.add(q);
      });
    }
    const allow = new Map(); // název dílku → Set povolených poloh ref
    for (const g of groups.values()) {
      const candidates = slots.filter((s) => s.type === g.type && !B.pieces.has(s.name) && s.facelets.some((k) => FACE[k] === g.color));
      if (candidates.length !== g.at.length) {
        errors.push(`Cíl: barva ${g.color} je vybarvená na ${g.at.length} ${g.at.length === 1 ? 'místě' : 'místech'} (jen část dílku), ale volných dílků s touto barvou je ${candidates.length} – vybarvi ji u všech, nebo dílky celé`);
        continue;
      }
      for (const piece of candidates) {
        const j = piece.facelets.findIndex((k) => FACE[k] === g.color);
        const set = new Set([...g.places].map((pos) => refAt(pos, j)));
        const prev = allow.get(piece.name);
        allow.set(piece.name, prev ? new Set([...prev].filter((r) => set.has(r))) : set);
      }
    }
    for (const [name, set] of allow) {
      if (!set.size) errors.push(`Cíl: dílek ${name} nemůže mít všechny vybarvené barvy na místech, kde jsou`);
      out[name] = { allow: [...set] };
    }
    const tracked = trackedPieces(out);

    // výchozí strana: celé dílky + částečné sloty obsazené dílky s těmi barvami
    const A = identifyPieces(colorsA, { partial: true });
    errors.push(...A.errors.map((e) => `Výchozí: ${e}`));
    const placed = new Map(A.pieces);
    const fits = (piece, slot, colors) => {
      if (piece.type !== slot.type) return -1;
      const n = slot.facelets.length;
      for (let t = 0; t < n; t++) if (pieceColorsIn(piece.name, slot.name, t).every((c, i) => colors[i] === EMPTY || colors[i] === c)) return t;
      return -1;
    };
    // přiřazení s návratem: nejdřív sledované dílky
    const order = A.partials;
    const free = slots.filter((s) => !placed.has(s.name)).sort((a, b) => Number(tracked.includes(b.name)) - Number(tracked.includes(a.name)));
    const used = new Set();
    const assign = (i) => {
      if (i === order.length) return true;
      const { slot, colors } = order[i];
      for (const piece of free) {
        if (used.has(piece.name)) continue;
        const t = fits(piece, slot, colors);
        if (t < 0) continue;
        used.add(piece.name);
        const n = slot.facelets.length;
        placed.set(piece.name, { slot: slot.id, loc: piece.facelets.map((_, k) => slot.facelets[(t + k) % n]), known: piece.facelets.map((_, k) => colors[(t + k) % n] !== EMPTY), partial: i });
        if (assign(i + 1)) return true;
        used.delete(piece.name);
        placed.delete(piece.name);
      }
      return false;
    };
    if (order.length && !assign(0)) errors.push('Výchozí: částečně vybarvené dílky nejde obsadit (barvy nesedí nebo se opakují)');
    for (const name of tracked) if (!placed.has(name)) errors.push(`Výchozí: dílek ${name} chybí`);
    if (errors.length) return { loc: null, target: null, constraints: out, errors, tracked };

    const fill = (pieces) => {
      const loc = new Uint8Array(N);
      const usedSlots = new Set();
      for (const [name, p] of pieces) {
        slotByName(name).facelets.forEach((k, i) => { loc[k] = p.loc[i]; });
        usedSlots.add(p.slot);
      }
      for (const type of new Set(slots.map((s) => s.type))) {
        const freeSlots = slots.filter((s) => s.type === type && !usedSlots.has(s.id));
        const freePieces = slots.filter((s) => s.type === type && !pieces.has(s.name));
        freePieces.forEach((piece, i) => piece.facelets.forEach((k, j) => { loc[k] = freeSlots[i].facelets[j]; }));
      }
      return loc;
    };
    let loc = fill(placed);
    let invalid = placed.size === slots.length && P.validate?.(loc);
    if (invalid) {
      // Dílky dosazené za částečně vybarvená místa jsou jen jedna z možností: prohozením
      // dvou zaměnitelných (každý sedí na místo druhého) se opraví parita, kterou by
      // jinak způsobila aplikace, ne zadání.
      const alt = swapPartials(placed, order, fits);
      const altLoc = alt && fill(alt);
      if (altLoc && !P.validate(altLoc)) { placed.clear(); for (const [k, v] of alt) placed.set(k, v); loc = altLoc; invalid = null; }
    }
    if (invalid) return { loc: null, target: null, constraints: out, errors: [`Výchozí: ${invalid}`], tracked };
    // které nálepky jsou známé z vybarvení (podle nálepek dílku ve složeném stavu);
    // ostatní dosadila aplikace a v náhledu se ukazují šedě
    const known = new Uint8Array(N);
    for (const [name, p] of placed) slotByName(name).facelets.forEach((k, i) => { known[k] = p.known ? Number(p.known[i]) : 1; });
    return { loc, target: fill(B.pieces), constraints: out, errors, tracked, known };
  }

  /** Prohodí dva dílky dosazené za částečná místa (každý musí sedět na místo druhého), nebo null. */
  function swapPartials(placed, order, fits) {
    const subs = [...placed].filter(([, p]) => p.partial !== undefined);
    for (let a = 0; a < subs.length; a++) for (let b = a + 1; b < subs.length; b++) {
      const [na, pa] = subs[a], [nb, pb] = subs[b];
      const sa = order[pa.partial], sb = order[pb.partial];
      const ta = fits(slotByName(nb), sa.slot, sa.colors), tb = fits(slotByName(na), sb.slot, sb.colors);
      if (ta < 0 || tb < 0) continue;
      const put = (name, { slot, colors }, t, i) => {
        const n = slot.facelets.length;
        return { slot: slot.id, loc: slotByName(name).facelets.map((_, k) => slot.facelets[(t + k) % n]), known: slotByName(name).facelets.map((_, k) => colors[(t + k) % n] !== EMPTY), partial: i };
      };
      const out = new Map(placed);
      out.set(nb, put(nb, sa, ta, pa.partial));
      out.set(na, put(na, sb, tb, pb.partial));
      return out;
    }
    return null;
  }

  /**
   * Sestaví stav pro hledání.
   * @param {string} [where] kde dílky chybí (do chybové zprávy)
   * @returns {{loc: Uint8Array | null, errors: string[], untracked: string[]}}
   */
  function buildStart(colors, constraints, where = 'výchozí kostce') {
    const { pieces, errors } = identifyPieces(colors);
    const tracked = trackedPieces(constraints);
    for (const name of tracked) {
      if (!pieces.has(name)) errors.push(`Dílek ${name} na ${where} chybí`);
    }
    const untracked = [...pieces.keys()].filter((n) => !tracked.includes(n));
    if (errors.length) return { loc: null, errors, untracked };

    const loc = new Uint8Array(N);
    const usedSlots = new Set();
    for (const [name, p] of pieces) {
      slotByName(name).facelets.forEach((k, i) => { loc[k] = p.loc[i]; });
      usedSlots.add(p.slot);
    }
    // Zbylé dílky do zbylých slotů stejného typu (na výsledek nemají vliv).
    for (const type of new Set(slots.map((s) => s.type))) {
      const freeSlots = slots.filter((s) => s.type === type && !usedSlots.has(s.id));
      const freePieces = slots.filter((s) => s.type === type && !pieces.has(s.name));
      freePieces.forEach((piece, i) => piece.facelets.forEach((k, j) => { loc[k] = freeSlots[i].facelets[j]; }));
    }
    // Je-li známý celý hlavolam, musí být fyzicky možný.
    const invalid = pieces.size === slots.length && P.validate?.(loc);
    if (invalid) return { loc: null, errors: [invalid], untracked };
    return { loc, errors, untracked };
  }

  /** Kde ve vybarvení leží dílek (slot), nebo null. */
  function findPiece(colors, name) {
    const p = identifyPieces(colors).pieces.get(slotByName(name).name);
    return p ? slots[p.slot] : null;
  }

  /** Odebere dílek z vybarvení. */
  function removePiece(colors, name) {
    const slot = findPiece(colors, name);
    const out = [...colors];
    if (slot) for (const f of slot.facelets) out[f] = EMPTY;
    return out;
  }

  /**
   * Položí dílek do slotu (stejného typu) s natočením twist; dílek se odebere
   * ze svého předchozího místa.
   */
  function placePiece(colors, name, slotName, twist = 0) {
    const piece = slotByName(name);
    const slot = slotByName(slotName);
    if (piece.type !== slot.type) throw new Error(`Dílek ${piece.name} do pozice ${slot.name} nepatří`);
    const out = removePiece(colors, name);
    const n = slot.facelets.length;
    piece.facelets.forEach((k, i) => { out[slot.facelets[(i + twist) % n]] = FACE[k]; });
    return out;
  }

  /** Natočí dílek ve slotu o jeden krok. */
  function twistAt(colors, slotName) {
    const slot = slotByName(slotName);
    const out = [...colors];
    const n = slot.facelets.length;
    slot.facelets.forEach((f, i) => { out[slot.facelets[(i + 1) % n]] = colors[f]; });
    return out;
  }

  /** Název dílku, který leží ve slotu (podle vybarvení), nebo null. */
  function pieceAt(colors, slotName) {
    const slot = slotByName(slotName);
    for (const [name, p] of identifyPieces(colors).pieces) if (p.slot === slot.id) return name;
    return null;
  }

  /** Barvy, které by měl dílek ve slotu při natočení twist (v pořadí nálepek slotu). */
  function pieceColorsIn(name, slotName, twist = 0) {
    const piece = slotByName(name);
    const slot = slotByName(slotName);
    const n = slot.facelets.length;
    const out = new Array(n);
    piece.facelets.forEach((k, i) => { out[(i + twist) % n] = FACE[k]; });
    return out;
  }

  /**
   * Do slotu dá dílek name s natočením twist (nebo slot vyprázdní, je-li name null).
   * Leží-li dílek jinde a slot je obsazený, dílky se prohodí.
   */
  function setSlot(colors, slotName, name, twist = 0) {
    const slot = slotByName(slotName);
    const out = [...colors];
    if (!name) {
      for (const f of slot.facelets) out[f] = EMPTY;
      return out;
    }
    const occupant = pieceAt(colors, slot.name);
    const from = findPiece(colors, name);
    const result = placePiece(out.map((c, i) => (slot.facelets.includes(i) ? EMPTY : c)), name, slot.name, twist);
    if (occupant && occupant !== slotByName(name).name && from) {
      const moved = slot.facelets.map((f) => colors[f]);
      from.facelets.forEach((f, j) => { result[f] = moved[j]; });
    }
    return result;
  }

  /**
   * Doplní dílek, kterému chybí jediná nálepka, je-li zbytek jednoznačný
   * (např. roh 3×3 ze dvou barev – pořadí barev rohu je pevné).
   */
  function completePiece(colors, slotName) {
    const slot = slotByName(slotName);
    const cs = slot.facelets.map((f) => colors[f]);
    if (cs.length < 3 || cs.filter((c) => c === EMPTY).length !== 1) return colors;
    let found = null;
    for (const piece of slots.filter((s) => s.type === slot.type)) {
      for (let t = 0; t < cs.length; t++) {
        const want = pieceColorsIn(piece.name, slot.name, t);
        if (want.every((c, i) => cs[i] === EMPTY || cs[i] === c)) {
          if (found) return colors; // víc možností
          found = want;
        }
      }
    }
    if (!found) return colors;
    const out = [...colors];
    slot.facelets.forEach((f, i) => { out[f] = found[i]; });
    return out;
  }

  /**
   * Vybarví jednu nálepku (stejná barva podruhé = smazat). Jen s `smart`: vznikne-li
   * přebarvením nemožný dílek, zbylé nálepky slotu se smažou (kromě nálepky lastPos,
   * vybarvené těsně předtím), aby šel dílek rovnou přebarvit; dílek s jednou
   * chybějící nálepkou se doplní, je-li to jednoznačné.
   */
  function paintSticker(colors, pos, color, lastPos = -1, smart = true) {
    const slot = slots[SLOT_OF[pos]];
    let out = [...colors];
    out[pos] = out[pos] === color ? EMPTY : color;
    if (out[pos] === EMPTY || !smart) return out;
    const complete = slot.facelets.every((f) => out[f] !== EMPTY);
    if (complete && slot.facelets.length > 1 && !pieceAt(out, slot.name)) {
      for (const f of slot.facelets) if (f !== pos && f !== lastPos) out[f] = EMPTY;
    }
    return completePiece(out, slot.name);
  }

  return {
    puzzle: P, EMPTY,
    blankColors, homeColors, moveColors, identifyPieces, trackedPieces, buildStart, buildTask,
    findPiece, removePiece, placePiece, twistAt, pieceAt, pieceColorsIn, setSlot,
    completePiece, completeCorner: completePiece, paintSticker,
  };
}

/** Sledované dílky (s jiným stylem než „nezáleží“; i „barva na místě“ { allow }). */
export function trackedPieces(constraints) {
  return Object.entries(constraints).filter(([, t]) => t && t !== 'ignore').map(([name]) => name);
}

export const {
  blankColors, homeColors, moveColors, identifyPieces, buildStart,
  findPiece, removePiece, placePiece, twistAt, pieceAt, pieceColorsIn, setSlot,
  completePiece, completeCorner, paintSticker,
} = taskOps(CUBE3);
