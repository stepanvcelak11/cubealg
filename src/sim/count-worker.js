// Worker: odhad počtu případů kroků metody (sim/casecount.js) mimo hlavní vlákno.
// Vstup { id, plan, step } → výstup { id, result }.

import { countCases } from './casecount.js';

self.onmessage = ({ data }) => {
  let result = null;
  try { result = countCases(data.plan, data.step); } catch { result = null; }
  self.postMessage({ id: data.id, result });
};
