// Web Worker pro zamíchání (2×2 a 4×4 z náhodného stavu potřebují řešič).

import { scramble, bigOrientation } from './scramble.js';
import { scramble222 } from './random-state.js';

// 4×4 z náhodného stavu (tabulky se staví při prvním použití); při chybě náhodné tahy.
async function scramble444(event) {
  try {
    const { scramble444: random } = await import('./fourbyfour.js');
    const text = random();
    return event === '444bf' ? [text, bigOrientation()].filter(Boolean).join(' ') : text;
  } catch {
    return scramble(event);
  }
}

self.onmessage = async ({ data }) => {
  try {
    const text = data.event === '222' ? scramble222()
      : data.event === '444' || data.event === '444bf' ? await scramble444(data.event)
        : scramble(data.event, data.opts);
    self.postMessage({ id: data.id, scramble: text });
  } catch (e) {
    self.postMessage({ id: data.id, error: e.message });
  }
};
