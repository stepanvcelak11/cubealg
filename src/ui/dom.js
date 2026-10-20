// Drobné pomocníky pro práci s DOM a úložištěm.

export const $ = (id) => document.getElementById(id);

export function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return e;
}

export const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bez úložiště */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* bez úložiště */ } },
};

/** Tlačítko s ikonou (a volitelným textem). */
export function iconButton(iconHtml, { label, text, className = 'icon-btn', onClick } = {}) {
  const b = el('button', { type: 'button', className, title: label ?? '' });
  if (label) b.setAttribute('aria-label', label);
  b.innerHTML = iconHtml;
  if (text) b.append(el('span', { textContent: text }));
  if (onClick) b.onclick = onClick;
  return b;
}
