// Trénink rozpoznání: aplikace ukáže případ (u kostek s náhodným natočením horní
// vrstvy) a ty z několika možností vybereš, který algoritmus to je. Měří se
// správnost a čas rozpoznání; častěji se vrací případy, které poznáváš špatně
// nebo pomalu.

const KEEP = 20; // kolik posledních časů se pamatuje

/** Statistiky rozpoznání algoritmu: počet, správně, přesnost, průměrný čas. */
export function recogStats(a) {
  const r = a.recog ?? { n: 0, ok: 0, t: [] };
  const t = r.t ?? [];
  return { n: r.n, ok: r.ok, t, acc: r.n ? r.ok / r.n : null, avg: t.length ? t.reduce((x, y) => x + y, 0) / t.length : NaN };
}

/** Nový záznam po pokusu (čas se ukládá jen u správné odpovědi). */
export function recordRecog(recog, ok, ms) {
  const r = recog ?? { n: 0, ok: 0, t: [] };
  return { n: r.n + 1, ok: r.ok + (ok ? 1 : 0), t: ok ? [...(r.t ?? []), Math.round(ms)].slice(-KEEP) : (r.t ?? []) };
}

/** Váha pro výběr: nové a špatně či pomalu poznávané případy častěji. */
export function recogWeight(a) {
  const s = recogStats(a);
  if (!s.n) return 3;
  return 0.4 + (1 - s.acc) * 4 + (s.avg > 2000 ? 1 : s.avg > 1200 ? 0.5 : 0);
}

/** Další případ (ne stejný jako minule, je-li z čeho vybírat). */
export function pickRecog(list, prevId, rnd = Math.random) {
  const pool = list.length > 1 ? list.filter((a) => a.id !== prevId) : list;
  if (!pool.length) return null;
  const w = pool.map(recogWeight);
  let x = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x < 0) return pool[i]; }
  return pool[pool.length - 1];
}

/** Možnosti odpovědi: správný a až count−1 jiných (stejný hlavolam, jiný název), zamíchané. */
export function optionsFor(target, list, count = 4, rnd = Math.random) {
  const puzzle = (a) => a.task?.puzzle ?? '333';
  const others = list.filter((a) => a.id !== target.id && puzzle(a) === puzzle(target) && a.name !== target.name);
  const pick = [];
  const pool = [...others];
  while (pick.length < count - 1 && pool.length) pick.push(...pool.splice(Math.floor(rnd() * pool.length), 1));
  const out = [target, ...pick];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
