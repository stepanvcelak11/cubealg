// Sdílení odkazem bez serveru: data (algoritmy i s případy, nebo zadání Labu) jsou
// zabalená přímo v odkazu – JSON, zkomprimovaný (deflate) a zakódovaný base64url
// za „#s=“. Kdo odkaz otevře, dostane nabídku data přidat (sada v trenažéru) nebo
// otevřít (případ v Labu).
//
//   { v: 1, kind: 'algs', name?: string, algs: [{ name, alg, task }] }
//   { v: 1, kind: 'task', task }

import { el } from './dom.js';

const PREFIX = '#s=';

// Vybarvení stran (pole jednoznakových barev) se do odkazu zapíše jako řetězec.
const packSide = (side) => (Array.isArray(side) && side.every((c) => typeof c === 'string' && c.length === 1) ? side.join('') : side);
const unpackSide = (side) => (typeof side === 'string' ? side.split('') : side);
export const packTask = (task) => task && { ...task, colorsA: packSide(task.colorsA), colorsB: packSide(task.colorsB) };
export const unpackTask = (task) => task && { ...task, colorsA: unpackSide(task.colorsA), colorsB: unpackSide(task.colorsB) };

const toB64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** Data → kód do odkazu („z“ = zkomprimované, „j“ = jen base64). */
export async function encodeShare(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === 'function') {
    try { return `z${toB64(await pipe(bytes, new CompressionStream('deflate-raw')))}`; } catch { /* bez komprese */ }
  }
  return `j${toB64(bytes)}`;
}

/** Kód z odkazu → data (nebo výjimka). */
export async function decodeShare(code) {
  const kind = code[0], bytes = fromB64(code.slice(1));
  if (kind === 'z') return JSON.parse(new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw'))));
  if (kind === 'j') return JSON.parse(new TextDecoder().decode(bytes));
  throw new Error('Neznámý formát odkazu');
}

export async function shareUrl(data) {
  return `${location.origin}${location.pathname}${PREFIX}${await encodeShare(data)}`;
}

/** Sdílení algoritmů (i s případy) – sada nebo jeden algoritmus. */
export const algsPayload = (list, name) => ({
  v: 1, kind: 'algs', ...(name ? { name } : {}),
  algs: list.map((a) => ({ name: a.name, alg: a.alg, task: packTask(a.task) })),
});

/**
 * Pošle odkaz: systémové sdílení (mobil), jinak zkopíruje do schránky.
 * @returns {Promise<'shared'|'copied'|'shown'>}
 */
export async function sendLink(data, title) {
  const url = await shareUrl(data);
  if (navigator.share) {
    try { await navigator.share({ title, url }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'shared'; }
  }
  try { await navigator.clipboard.writeText(url); toast('Odkaz zkopírován do schránky'); return 'copied'; } catch { /* bez schránky */ }
  // poslední možnost: ukázat odkaz k ručnímu zkopírování
  const input = el('input', { value: url, readOnly: true, ariaLabel: 'Odkaz' });
  const dlg = el('dialog', { className: 'help-dialog share-dialog' }, el('h2', { textContent: title }),
    el('p', { className: 'hint', textContent: 'Zkopíruj odkaz a pošli ho:' }), input,
    el('form', { method: 'dialog' }, el('button', { className: 'primary', textContent: 'Hotovo' })));
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  input.select();
  return 'shown';
}

/** Krátká zpráva dole na obrazovce. */
export function toast(text) {
  const t = el('div', { className: 'toast', role: 'status', textContent: text });
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2700);
}

/** Sdílená data z adresy (a adresu vyčistí), nebo null. */
export async function takeShared() {
  if (!location.hash.startsWith(PREFIX)) return null;
  const code = location.hash.slice(PREFIX.length);
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const data = await decodeShare(code);
    if (data?.v !== 1) throw new Error('Neznámá verze');
    return data;
  } catch {
    toast('Odkaz nejde přečíst (je celý?)');
    return null;
  }
}
