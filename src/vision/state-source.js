// Zdroje stavu A. Rozhraní je připravené pro budoucí skenování kamerou:
// modul počítačového vidění (OpenCV/WASM) jen vrátí barevný řetězec
// ve formátu Kociemba a zbytek aplikace s ním pracuje stejně jako s ručním
// zadáním.
//
// @typedef {object} StateSource
// @property {string} id
// @property {string} label
// @property {() => Promise<Uint8Array>} read  vrátí stav (loc, viz core/cube.js)

import { fromFacelets, caseOf, applyAlg, solved } from '../core/cube.js';

/** Stav zadaný barvami (ručně nebo z kamery). */
export function faceletSource(getFacelets, label = 'Barvy') {
  return { id: 'facelets', label, read: async () => fromFacelets(await getFacelets()) };
}

/** Stav vzniklý zamícháním složené kostky. */
export function scrambleSource(scramble) {
  return { id: 'scramble', label: 'Zamíchání', read: async () => applyAlg(solved(), scramble) };
}

/** Stav, který řeší zadaný (např. komunitní) algoritmus. */
export function caseSource(alg) {
  return { id: 'case', label: 'Případ algoritmu', read: async () => caseOf(alg) };
}
