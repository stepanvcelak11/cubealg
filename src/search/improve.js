// Vylepšování nalezeného algoritmu: úsek (okno) algoritmu se nahradí jinou
// sekvencí povolených tahů, která s hlavolamem udělá přesně totéž – algoritmus
// tedy dál řeší zadání – ale je kratší nebo pohodlnější. Opakuje se, dokud
// to jde (lokální hledání, „hill climbing“).
//
// Náhradní sekvence se hledají setkáním uprostřed: tabulka všech kanonických
// sekvencí do délky D (podle stavu, který udělají z čisté kostky) a okno W se
// rozloží na A·B, kde A i B jsou z tabulky (B = A⁻¹·W). Okna tedy jdou nahradit
// sekvencemi do délky 2D.

const EMPTY = 0xffffffff;

/**
 * Tabulka krátkých sekvencí povolených tahů.
 * @param {object} puzzle hlavolam (perm, solved, slots, redundant)
 * @param {{base:string, amount:number}[]} moves povolené tahy
 * @param {{maxEntries?: number}} [opts]
 */
export function buildTable(puzzle, moves, { maxEntries = 60000 } = {}) {
  const n = puzzle.size;
  const perms = moves.map((m) => puzzle.perm(m));
  const refs = Uint16Array.from(puzzle.slots.map((s) => s.facelets[0]));
  const redundant = moves.map((a) => moves.map((b) => puzzle.redundant(a, b)));
  const entries = []; // { seq: number[], loc: Uint8Array, inv: Uint8Array }
  const byKey = new Map();
  const add = (seq, loc) => {
    const inv = new Uint8Array(n);
    for (let k = 0; k < n; k++) inv[loc[k]] = k;
    const e = { seq, loc, inv };
    entries.push(e);
    const key = keyOf(loc, refs);
    const list = byKey.get(key);
    if (!list) byKey.set(key, [e]);
    else if (list.length < 12) list.push(e);
  };
  add([], puzzle.solved());
  let frontier = [entries[0]];
  let depth = 0;
  for (;;) {
    // další vrstva jen celá (jinak by tabulka nebyla úplná do své hloubky)
    const estimate = frontier.length * moves.length;
    if (entries.length + estimate > maxEntries * 1.5 && depth >= 2) break;
    const next = [];
    for (const e of frontier) {
      const last = e.seq.length ? e.seq[e.seq.length - 1] : -1;
      for (let m = 0; m < moves.length; m++) {
        if (last >= 0 && redundant[last][m]) continue;
        const to = perms[m];
        const loc = new Uint8Array(n);
        for (let k = 0; k < n; k++) loc[k] = to[e.loc[k]];
        const before = entries.length;
        add([...e.seq, m], loc);
        next.push(entries[before]);
      }
    }
    if (!next.length) break;
    depth += 1;
    frontier = next;
    if (entries.length > maxEntries) break;
  }
  return { puzzle, moves, perms, refs, entries, byKey, depth, n };
}

/** Číselný klíč stavu (poloha referenční nálepky každého dílku). */
function keyOf(loc, refs) {
  let h1 = 2166136261, h2 = 5381;
  for (let i = 0; i < refs.length; i++) {
    const v = loc[refs[i]];
    h1 = Math.imul(h1 ^ v, 16777619);
    h2 = (Math.imul(h2, 33) + v) | 0;
  }
  return (h1 >>> 0) * 2097152 + ((h2 >>> 0) & 2097151);
}

/**
 * Sloučí tahy se stejným základem, i když jsou mezi nimi tahy, se kterými
 * komutují (R R → R2, L R' L' → R'). Vrací null, když vznikne nepovolený tah.
 */
function normalize(seq, moves, indexOf, orderOf, commutes) {
  const out = [];
  for (const m of seq) {
    const cur = moves[m];
    // hledá stejný základ pozpátku přes komutující tahy
    let j = out.length - 1;
    while (j >= 0 && moves[out[j]].base !== cur.base && commutes(out[j], m)) j--;
    if (j >= 0 && moves[out[j]].base === cur.base) {
      const order = orderOf(cur.base);
      let amount = (((moves[out[j]].amount + cur.amount) % order) + order) % order;
      out.splice(j, 1);
      if (amount === 0) continue;
      if (order === 4 && amount === 3) amount = -1;
      if (order === 3 && amount === 2) amount = -1;
      const idx = indexOf.get(`${cur.base}${amount}`);
      if (idx === undefined) return null;
      out.splice(j, 0, idx);
    } else out.push(m);
  }
  return out;
}

/**
 * Zjednoduší algoritmus: sloučí tahy se stejným základem i přes komutující tahy
 * (R R2 → R', L2 R L2 → R). Vrací null, když vznikne nepovolený tah.
 * @param {object} puzzle
 * @param {{base:string, amount:number}[]} moves povolené tahy
 * @param {string} alg
 */
const SIMPLIFY = new WeakMap();
export function simplify(puzzle, moves, alg) {
  if (!alg) return '';
  const indexOf = new Map(moves.map((m, i) => [`${m.base}${m.amount}`, i]));
  const seq = puzzle.parseAlg(alg).map((m) => indexOf.get(`${m.base}${m.amount}`));
  if (seq.some((i) => i === undefined)) return null;
  let ctx = SIMPLIFY.get(moves);
  if (!ctx) {
    const perms = moves.map((m) => puzzle.perm(m));
    const n = puzzle.size;
    const memo = new Map();
    ctx = (a, b) => {
      const key = a * 1024 + b;
      if (!memo.has(key)) { const p = perms[a], q = perms[b]; let same = true; for (let k = 0; k < n && same; k++) same = q[p[k]] === p[q[k]]; memo.set(key, same); }
      return memo.get(key);
    };
    SIMPLIFY.set(moves, ctx);
  }
  const commutes = ctx;
  const out = normalize(seq, moves, indexOf, (base) => puzzle.orderOf(base), commutes);
  if (!out) return null;
  // komutující sousedy do kanonického pořadí (U2 D' i D' U2 je totéž)
  for (let swapped = true; swapped;) {
    swapped = false;
    for (let i = 0; i + 1 < out.length; i++) {
      const a = moves[out[i]], b = moves[out[i + 1]];
      if (a.base !== b.base && puzzle.redundant(a, b) && commutes(out[i], out[i + 1])) {
        [out[i], out[i + 1]] = [out[i + 1], out[i]];
        swapped = true;
      }
    }
  }
  return out.map((i) => puzzle.moveToString(moves[i])).join(' ');
}

/**
 * Vylepšování algoritmu podle cíle `value` (nižší = lepší; pole se porovnává
 * lexikograficky). Iterované lokální hledání: stoupá k lepším sousedům (výměna
 * úseku), a když se zasekne v lokálním optimu, algoritmus „postrčí“ náhodnou
 * výměnou úseku (smí být i o něco horší) a stoupá znovu. Po několika marných
 * postrčeních se vrací k nejlepšímu známému. Hlásí se jen zlepšení nejlepšího.
 * @param {ReturnType<typeof buildTable>} table
 * @param {string} alg výchozí algoritmus (platné řešení)
 * @param {(alg: string) => number[]} value hodnota algoritmu pro daný cíl
 * @param {{deadline: number, onImproved?: (alg:string) => void, maxWindow?: number, kicks?: boolean}} opts
 * @returns {{alg: string, value: number[], steps: number}}
 */
export function improve(table, alg, value, { deadline, onImproved, maxWindow, kicks = true }) {
  const { puzzle, moves, perms, entries, byKey, refs, n } = table;
  const indexOf = new Map(moves.map((m, i) => [`${m.base}${m.amount}`, i]));
  const toString = (seq) => seq.map((i) => puzzle.moveToString(moves[i])).join(' ');
  const less = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i]; } return false; };
  let cur = puzzle.parseAlg(alg).map((m) => indexOf.get(`${m.base}${m.amount}`));
  if (cur.some((i) => i === undefined)) return { alg, value: value(alg), steps: 0 };
  const cache = new Map();
  const evaluate = (text) => {
    let v = cache.get(text);
    if (!v) { v = value(text); if (cache.size < 200000) cache.set(text, v); }
    return v;
  };
  let curValue = evaluate(toString(cur));
  let best = cur, bestValue = curValue;
  let steps = 0;
  const maxW = Math.min(maxWindow ?? 2 * table.depth + 2, 2 * table.depth + 2);
  const winLoc = new Uint8Array(n);
  const target = new Uint8Array(n);
  const comm = new Map();
  const commutes = (a, b) => {
    const key = a * 1024 + b;
    if (!comm.has(key)) {
      const p = perms[a], q = perms[b];
      let same = true;
      for (let k = 0; k < n && same; k++) same = q[p[k]] === p[q[k]];
      comm.set(key, same);
    }
    return comm.get(key);
  };
  const orderOf = (base) => puzzle.orderOf(base);

  /** Projde náhrady okna cur[i … i+len) a pro každou zavolá visit(seq, text); true = konec. */
  const replacements = (i, len, visit, from = 0) => {
    for (let k = 0; k < n; k++) winLoc[k] = k;
    for (let j = i; j < i + len; j++) { const to = perms[cur[j]]; for (let k = 0; k < n; k++) winLoc[k] = to[winLoc[k]]; }
    const prefix = cur.slice(0, i), suffix = cur.slice(i + len);
    for (let e = 0; e < entries.length; e++) {
      const a = entries[(e + from) % entries.length];
      // B = A⁻¹ · W
      for (let r = 0; r < refs.length; r++) target[refs[r]] = winLoc[a.inv[refs[r]]];
      const list = byKey.get(keyOf(target, refs));
      if (!list) continue;
      for (const b of list) {
        let same = true;
        for (let r = 0; r < refs.length && same; r++) same = b.loc[refs[r]] === target[refs[r]];
        if (!same) continue;
        const seq = normalize([...prefix, ...a.seq, ...b.seq, ...suffix], moves, indexOf, orderOf, commutes);
        if (!seq || !seq.length) continue;
        if (visit(seq, toString(seq))) return true;
      }
    }
    return false;
  };

  /** Stoupání: první lepší soused, dokud nějaký je. */
  const climb = () => {
    for (let improved = true; improved && Date.now() < deadline;) {
      improved = false;
      // okna od delších (větší změny) po kratší, v náhodném pořadí poloh
      outer:
      for (let len = Math.min(maxW, cur.length); len >= 1; len--) {
        const starts = Array.from({ length: cur.length - len + 1 }, (_, i) => i).sort(() => Math.random() - 0.5);
        for (const i of starts) {
          if (Date.now() > deadline) break outer;
          const hit = replacements(i, len, (seq, text) => {
            const v = evaluate(text);
            if (!less(v, curValue)) return false;
            cur = seq; curValue = v; steps++;
            if (less(v, bestValue)) { best = seq; bestValue = v; onImproved?.(text); }
            return true;
          });
          if (hit) { improved = true; break outer; }
        }
      }
    }
  };

  /** Postrčení: náhodná jiná náhrada náhodného okna (nejvýš o 2 tahy delší). */
  const kick = () => {
    for (let tries = 0; tries < 8; tries++) {
      const len = Math.min(cur.length, 2 + Math.floor(Math.random() * (maxW - 1)));
      const i = Math.floor(Math.random() * (cur.length - len + 1));
      const before = toString(cur);
      const hit = replacements(i, len, (seq, text) => {
        if (text === before || seq.length > cur.length + 2) return false;
        cur = seq; curValue = evaluate(text);
        return true;
      }, Math.floor(Math.random() * entries.length));
      if (hit) return true;
    }
    return false;
  };

  climb();
  let fails = 0;
  while (kicks && Date.now() < deadline) {
    const was = bestValue;
    if (!kick()) break;
    climb();
    if (less(bestValue, was)) fails = 0;
    else if (++fails >= 4) { cur = best; curValue = bestValue; fails = 0; }
  }
  return { alg: toString(best), value: bestValue, steps };
}
