// Porovnání s komunitními algoritmy: které známé algoritmy řeší zadaný
// stav A (případně s AUF na začátku/konci a závěrečnou rotací celé kostky).

import { applyAlg } from '../core/cube.js';
import { ROTATIONS } from '../core/rotations.js';
import { algToString } from '../core/notation.js';
import { COMMUNITY_ALGS } from '../data/community.js';

const AUF = ['', 'U', "U'", 'U2'];

/**
 * @param {Uint8Array} start stav A
 * @param {{test:(loc:Uint8Array)=>boolean}} goal zkompilovaný cíl
 * @returns {{set:string, name:string, alg:string, base:string}[]}
 */
export function matchCommunity(start, goal, algs = COMMUNITY_ALGS) {
  const out = [];
  for (const entry of algs) {
    found: for (const pre of AUF) {
      const s1 = applyAlg(start, `${pre} ${entry.alg}`);
      for (const post of AUF) {
        const s2 = post ? applyAlg(s1, post) : s1;
        for (const rot of ROTATIONS) {
          if (goal.test(rot ? applyAlg(s2, rot) : s2)) {
            out.push({ ...entry, base: entry.alg, alg: algToString(`${pre} ${entry.alg} ${post}`) });
            break found;
          }
        }
      }
    }
  }
  return out;
}
