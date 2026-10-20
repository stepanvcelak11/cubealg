// Uložená data: složení timeru a vlastní algoritmy (pro trenažér).

import { storage } from './dom.js';

function emitter() {
  const listeners = new Set();
  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit() { for (const fn of listeners) fn(); },
  };
}

// --- Metody -----------------------------------------------------------------------
// Metoda (např. CFOP nebo vlastní) je režim celé aplikace: složení v timeru i sady
// algoritmů patří k aktivní metodě, takže jdou metody mezi sebou porovnávat.
// Výchozí metoda má id 'default' (data bez přípony, jako před zavedením metod).

const solvesData = storage.get('ergocube.solves') ?? {};
const solvesEvents = emitter();
const methodsData = { active: 'default', defaultName: null, list: [], ...(storage.get('ergocube.methods') ?? {}) };
const methodEvents = emitter();

export const methods = {
  list() { return [{ id: 'default', name: methodsData.defaultName ?? 'Základní' }, ...methodsData.list]; },
  get(id) { return this.list().find((m) => m.id === id) ?? null; },
  active() { return this.get(methodsData.active) ? methodsData.active : 'default'; },
  setActive(id) {
    methodsData.active = this.get(id) ? id : 'default';
    this.save();
  },
  add(name) {
    const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    methodsData.list.push({ id, name });
    this.save();
    return id;
  },
  rename(id, name) {
    if (id === 'default') methodsData.defaultName = name;
    else { const m = methodsData.list.find((x) => x.id === id); if (m) m.name = name; }
    this.save();
  },
  /** Smaže metodu i s jejími složeními, sadami a algoritmy. */
  remove(id) {
    if (id === 'default') return;
    methodsData.list = methodsData.list.filter((m) => m.id !== id);
    for (const k of Object.keys(solvesData)) if (k.split('~')[0].endsWith(`@${id}`)) delete solvesData[k];
    const sets = new Set([defaultSetId(id), ...setsData.filter((x) => x.method === id).map((x) => x.id)]);
    for (let i = algsData.length - 1; i >= 0; i--) if (sets.has(algsData[i].set)) algsData.splice(i, 1);
    for (let i = setsData.length - 1; i >= 0; i--) if (setsData[i].method === id) setsData.splice(i, 1);
    if (methodsData.active === id) methodsData.active = 'default';
    delete guidesData[id];
    storage.set('ergocube.guides', guidesData);
    storage.set('ergocube.solves', solvesData);
    storage.set('ergocube.algsets', setsData);
    storage.set('ergocube.algs', algsData);
    this.save();
  },
  /** Kolik složení a algoritmů metoda má (pro potvrzení smazání). */
  usage(id) {
    const suffix = `@${id}`;
    const solveCount = Object.entries(solvesData)
      .filter(([k]) => (id === 'default' ? !k.includes('@') : k.split('~')[0].endsWith(suffix)))
      .reduce((n, [, list]) => n + list.length, 0);
    return { solves: solveCount, algs: algs.inMethod(id).length };
  },
  save() {
    storage.set('ergocube.methods', methodsData);
    methodEvents.emit();
    solvesEvents.emit();
    algsEvents.emit();
  },
  subscribe: (fn) => methodEvents.subscribe(fn),
};

// --- Složení ---------------------------------------------------------------------


// "event" je klíč skupiny z groups.key(disciplína, skupina[, metoda]).
export const solves = {
  list(event) { return solvesData[event] ?? []; },
  add(event, solve) {
    (solvesData[event] ??= []).push(solve);
    this.save();
  },
  update(event, index, patch) {
    Object.assign(solvesData[event][index], patch);
    this.save();
  },
  remove(event, index) {
    solvesData[event].splice(index, 1);
    this.save();
  },
  clear(event) {
    solvesData[event] = [];
    this.save();
  },
  save() {
    storage.set('ergocube.solves', solvesData);
    solvesEvents.emit();
  },
  subscribe: solvesEvents.subscribe,
};

// --- Skupiny složení ------------------------------------------------------------------
// Každá disciplína má hlavní skupinu (id 'main', data pod klíčem disciplíny)
// a libovolně vlastních (např. pro různé kostky); data pod klíčem 'disciplína/id'.

const groupsData = storage.get('ergocube.groups') ?? {};
const MAIN = { id: 'main', name: 'Hlavní' };

export const groups = {
  list(event) { return [MAIN, ...(groupsData[event] ?? [])]; },
  get(event, id) { return this.list(event).find((g) => g.id === id) ?? null; },
  /** Klíč složení: disciplína, skupina a metoda (výchozí = aktivní). */
  key(event, id, method = methods.active()) {
    const base = !id || id === 'main' ? event : `${event}/${id}`;
    return method === 'default' ? base : `${base}@${method}`;
  },
  add(event, name) {
    const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    (groupsData[event] ??= []).push({ id, name });
    this.save();
    return id;
  },
  rename(event, id, name) {
    const g = (groupsData[event] ?? []).find((x) => x.id === id);
    if (g) { g.name = name; this.save(); }
  },
  remove(event, id) {
    if (id === 'main') return;
    groupsData[event] = (groupsData[event] ?? []).filter((g) => g.id !== id);
    for (const m of methods.list()) {
      const k = this.key(event, id, m.id);
      for (const x of Object.keys(solvesData)) if (x === k || x.startsWith(`${k}~`)) delete solvesData[x];
    }
    storage.set('ergocube.solves', solvesData);
    this.save();
  },
  save() {
    storage.set('ergocube.groups', groupsData);
    solvesEvents.emit();
  },
};

// --- Vlastní algoritmy ---------------------------------------------------------------
// Každý algoritmus patří do sady (např. podle situace) a sada k metodě; trenažér
// trénuje vybranou sadu. Výchozí sada metody má id 'default' (výchozí metoda)
// nebo 'default@<metoda>'.

const algsData = storage.get('ergocube.algs') ?? [];
const algsEvents = emitter();
const setsData = storage.get('ergocube.algsets') ?? [];

/** Id výchozí sady metody. */
export const defaultSetId = (method = methods.active()) => (method === 'default' ? 'default' : `default@${method}`);
const defaultSet = (method) => ({ id: defaultSetId(method), name: 'Moje algoritmy', method });
const setMethod = (id) => {
  if (!id || id === 'default') return 'default';
  if (id.startsWith('default@')) return id.slice(8);
  return setsData.find((x) => x.id === id)?.method ?? 'default';
};

export const algSets = {
  /** Sady metody (výchozí = aktivní), výchozí sada první. */
  list(method = methods.active()) {
    return [defaultSet(method), ...setsData.filter((x) => (x.method ?? 'default') === method)];
  },
  get(id) {
    if (id === 'default' || id?.startsWith('default@')) return defaultSet(setMethod(id));
    return setsData.find((x) => x.id === id) ?? defaultSet(methods.active());
  },
  methodOf: setMethod,
  add(name) {
    const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    setsData.push({ id, name, method: methods.active() });
    this.save();
    return id;
  },
  rename(id, name) {
    const s = setsData.find((x) => x.id === id);
    if (s) { s.name = name; this.save(); }
  },
  /** Smaže sadu; její algoritmy se přesunou do výchozí sady. */
  remove(id) {
    const i = setsData.findIndex((x) => x.id === id);
    if (i < 0) return;
    const fallback = defaultSetId(setsData[i].method ?? 'default');
    setsData.splice(i, 1);
    for (const a of algsData) if (a.set === id) a.set = fallback;
    storage.set('ergocube.algs', algsData);
    this.save();
  },
  save() {
    storage.set('ergocube.algsets', setsData);
    algsEvents.emit();
  },
};

export const algs = {
  list() { return algsData; },
  get(id) { return algsData.find((a) => a.id === id); },
  /** Uložený algoritmus se stejným zadáním (volitelně jen v dané sadě). */
  find(alg, task, set) {
    return algsData.find((a) => a.alg === alg && JSON.stringify(a.task) === JSON.stringify(task)
      && (set === undefined || (a.set ?? 'default') === set));
  },
  /** Algoritmy v sadě (bez sady = výchozí). */
  inSet(set) { return algsData.filter((a) => (a.set ?? 'default') === set); },
  /** Algoritmy všech sad metody (výchozí = aktivní). */
  inMethod(method = methods.active()) { return algsData.filter((a) => setMethod(a.set) === method); },
  /** @param {{alg:string, task:object, name?:string, set?:string}} entry */
  add({ alg, task, name, set = defaultSetId() }) {
    const id = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const count = this.inSet(set).length;
    algsData.push({ id, name: name ?? `Algoritmus ${count + 1}`, alg, task, set, enabled: true, times: [], created: Date.now() });
    this.save();
    return id;
  },
  update(id, patch) {
    Object.assign(this.get(id), patch);
    this.save();
  },
  remove(id) {
    const i = algsData.findIndex((a) => a.id === id);
    if (i >= 0) algsData.splice(i, 1);
    this.save();
  },
  save() {
    storage.set('ergocube.algs', algsData);
    algsEvents.emit();
  },
  subscribe: algsEvents.subscribe,
};

// --- Průvodce metodou ----------------------------------------------------------------
// Popis metody pro sebe i pro ostatní: úvod a kroky (text, obrázek zadání z Labu,
// odkaz na sadu algoritmů). Metodu jde i s průvodcem, sadami a algoritmy sdílet
// jako soubor.

const guidesData = storage.get('ergocube.guides') ?? {};
const guideEvents = emitter();
const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const guides = {
  /**
   * Průvodce metody: { intro, frame?, steps: [{ id, title, text, task?, set?, parts? }] }.
   * frame = držení metody {down, front}, parts = dílky hotové po kroku (viz parts.js).
   */
  get(method = methods.active()) {
    const g = guidesData[method] ?? {};
    return { intro: g.intro ?? '', frame: g.frame, steps: (g.steps ?? []).map((st) => ({ ...st })) };
  },
  set(method, guide) {
    guidesData[method] = { intro: guide.intro ?? '', frame: guide.frame, steps: guide.steps ?? [] };
    storage.set('ergocube.guides', guidesData);
    guideEvents.emit();
  },
  newStep: (title = '') => ({ id: newId('k'), title, text: '' }),
  subscribe: guideEvents.subscribe,
};

const SHARE_FORMAT = 'ergocube-method';

/** Metoda k sdílení: název, průvodce, sady a algoritmy (bez časů). */
export function exportMethod(method = methods.active()) {
  const sets = algSets.list(method);
  const ids = new Set(sets.map((x) => x.id));
  return {
    format: SHARE_FORMAT, version: 1, exported: new Date().toISOString(),
    method: { name: methods.get(method).name },
    guide: guides.get(method),
    sets: sets.map((x) => ({ id: x.id, name: x.name })),
    algs: algsData.filter((a) => ids.has(a.set ?? 'default'))
      .map(({ name, alg, task, set }) => ({ name, alg, task, set: set ?? 'default' })),
  };
}

/** Naimportuje sdílenou metodu jako novou metodu (nové id sad a algoritmů); vrací id metody. */
export function importMethod(data) {
  if (data?.format !== SHARE_FORMAT || !data.method?.name) throw new Error('Tohle není sdílená metoda ErgoCube Lab');
  const taken = new Set(methods.list().map((m) => m.name));
  let name = data.method.name;
  for (let i = 2; taken.has(name); i++) name = `${data.method.name} (${i})`;
  const id = newId('m');
  methodsData.list.push({ id, name });
  const setMap = new Map();
  for (const x of data.sets ?? []) {
    if (x.id === 'default' || x.id.startsWith('default@')) { setMap.set(x.id, defaultSetId(id)); continue; }
    const sid = newId('s');
    setsData.push({ id: sid, name: x.name, method: id });
    setMap.set(x.id, sid);
  }
  for (const a of data.algs ?? []) {
    if (typeof a.alg !== 'string' || !a.task) continue;
    algsData.push({
      id: newId('a'), name: a.name ?? 'Algoritmus', alg: a.alg, task: a.task,
      set: setMap.get(a.set) ?? defaultSetId(id), enabled: true, times: [], created: Date.now(),
    });
  }
  const guide = data.guide ?? {};
  guidesData[id] = {
    intro: String(guide.intro ?? ''),
    frame: guide.frame && typeof guide.frame.down === 'string' && typeof guide.frame.front === 'string'
      ? { down: guide.frame.down, front: guide.frame.front } : undefined,
    steps: (guide.steps ?? []).map((st) => ({ ...st, id: newId('k'), set: st.set ? setMap.get(st.set) : undefined })),
  };
  storage.set('ergocube.algsets', setsData);
  storage.set('ergocube.algs', algsData);
  storage.set('ergocube.guides', guidesData);
  methodsData.active = id;
  methods.save();
  guideEvents.emit();
  return id;
}
