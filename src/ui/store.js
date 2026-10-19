// Uložená data: složení timeru a vlastní algoritmy (pro trenažér).

import { storage } from './dom.js';

function emitter() {
  const listeners = new Set();
  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit() { for (const fn of listeners) fn(); },
  };
}

// --- Složení ---------------------------------------------------------------------

const solvesData = storage.get('ergocube.solves') ?? {};
const solvesEvents = emitter();

// "event" je klíč skupiny z groups.key(disciplína, skupina).
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
  key(event, id) { return !id || id === 'main' ? event : `${event}/${id}`; },
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
    delete solvesData[this.key(event, id)];
    storage.set('ergocube.solves', solvesData);
    this.save();
  },
  save() {
    storage.set('ergocube.groups', groupsData);
    solvesEvents.emit();
  },
};

// --- Vlastní algoritmy ---------------------------------------------------------------
// Každý algoritmus patří do sady (např. podle situace nebo metody); trenažér
// trénuje vybranou sadu. Výchozí sada má id 'default'.

const algsData = storage.get('ergocube.algs') ?? [];
const algsEvents = emitter();
const setsData = storage.get('ergocube.algsets') ?? [];
const DEFAULT_SET = { id: 'default', name: 'Moje algoritmy' };

export const algSets = {
  list() { return [DEFAULT_SET, ...setsData]; },
  get(id) { return this.list().find((s) => s.id === id) ?? DEFAULT_SET; },
  add(name) {
    const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    setsData.push({ id, name });
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
    setsData.splice(i, 1);
    for (const a of algsData) if (a.set === id) a.set = 'default';
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
  /** @param {{alg:string, task:object, name?:string, set?:string}} entry */
  add({ alg, task, name, set = 'default' }) {
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
