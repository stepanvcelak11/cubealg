// Web Worker pro zamíchání (2×2 z náhodného stavu potřebuje řešič).

import { scramble } from './scramble.js';
import { scramble222 } from './random-state.js';

self.onmessage = ({ data }) => {
  try {
    const text = data.event === '222' ? scramble222() : scramble(data.event, data.opts);
    self.postMessage({ id: data.id, scramble: text });
  } catch (e) {
    self.postMessage({ id: data.id, error: e.message });
  }
};
