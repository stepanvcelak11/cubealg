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
 * Lokální vylepšování algoritmu podle cíle `value` (nižší = lepší; pole se
 * porovnává lexikograficky).
 * @param {ReturnType<typeof buildTable>} table
 * @param {string} alg výchozí algoritmus (platné řešení)
 * @param {(alg: string) => number[]} value hodnota algoritmu pro daný cíl
 * @param {{deadline: number, onImproved?: (alg:string) => void, maxWindow?: number}} opts
 * @returns {{alg: string, value: number[], steps: number}}
 */
export function improve(table, alg, value, { deadline, onImproved, maxWindow }) {
  const { puzzle, moves, perms, entries, byKey, refs, n } = table;
  const indexOf = new Map(moves.map((m, i) => [`${m.base}${m.amount}`, i]));
  const toString = (seq) => seq.map((i) => puzzle.moveToString(moves[i])).join(' ');
  const less = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i]; } return false; };
  let cur = puzzle.parseAlg(alg).map((m) => indexOf.get(`${m.base}${m.amount}`));
  const orderOf = (base) => puzzle.orderOf(base);
  if (cur.some((i) => i === undefined)) return { alg, value: value(alg), steps: 0 };
  let curValue = value(alg);
  let steps = 0;
  const maxW = Math.min(maxWindow ?? 2 * table.depth + 2, 2 * table.depth + 2);
  const winLoc = new Uint8Array(n);
  const target = new Uint8Array(n);
  const tried = new Set([toString(cur)]);
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

  for (let improved = true; improved && Date.now() < deadline;) {
    improved = false;
    // okna od delších (větší změny) po kratší, v náhodném pořadí poloh
    outer:
    for (let len = Math.min(maxW, cur.length); len >= 1; len--) {
      const starts = Array.from({ length: cur.length - len + 1 }, (_, i) => i).sort(() => Math.random() - 0.5);
      for (const i of starts) {
        if (Date.now() > deadline) break outer;
        // stav, který okno udělá z čisté kostky
        for (let k = 0; k < n; k++) winLoc[k] = k;
        for (let j = i; j < i + len; j++) { const to = perms[cur[j]]; for (let k = 0; k < n; k++) winLoc[k] = to[winLoc[k]]; }
        const prefix = cur.slice(0, i), suffix = cur.slice(i + len);
        for (const a of entries) {
          // B = A⁻¹ · W
          for (let r = 0; r < refs.length; r++) target[refs[r]] = winLoc[a.inv[refs[r]]];
          const list = byKey.get(keyOf(target, refs));
          if (!list) continue;
          for (const b of list) {
            let same = true;
            for (let r = 0; r < refs.length && same; r++) same = b.loc[refs[r]] === target[refs[r]];
            if (!same) continue;
            const seq = normalize([...prefix, ...a.seq, ...b.seq, ...suffix], moves, indexOf, (base) => puzzle.orderOf(base), commutes);
            if (!seq || !seq.length) continue;
            const text = toString(seq);
            if (tried.has(text)) continue;
            tried.add(text);
            const v = value(text);
            if (less(v, curValue)) {
              cur = seq; curValue = v; steps++;
              onImproved?.(text);
              improved = true;
              break outer;
            }
          }
        }
      }
    }
  }
  return { alg: toString(cur), value: curValue, steps };
}
