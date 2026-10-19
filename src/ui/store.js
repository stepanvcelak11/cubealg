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

const algsData = storage.get('ergocube.algs') ?? [];
const algsEvents = emitter();

export const algs = {
  list() { return algsData; },
  get(id) { return algsData.find((a) => a.id === id); },
  find(alg, task) {
    return algsData.find((a) => a.alg === alg && JSON.stringify(a.task) === JSON.stringify(task));
  },
  /** @param {{alg:string, task:{colorsA:string[], constraints:Record<string,string>}}} entry */
  add({ alg, task, name }) {
    const id = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    algsData.push({ id, name: name ?? `Algoritmus ${algsData.length + 1}`, alg, task, enabled: true, times: [], created: Date.now() });
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
