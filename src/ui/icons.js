// Vlastní sada SVG ikon (24 × 24, tah currentColor).

const P = {
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.6 2.2M9.5 2.5h5M12 2.5V6M18.4 6.6l1.5-1.5"/>',
  stats: '<path d="M3.5 20.5h17"/><rect x="5" y="11" width="3" height="7" rx="1"/><rect x="10.5" y="5" width="3" height="13" rx="1"/><rect x="16" y="8.5" width="3" height="9.5" rx="1"/>',
  trainer: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><path d="M18 6l3-3M18 3.5V6h2.5"/>',
  lab: '<path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z"/><path d="M4 7.4l8 4.6 8-4.6M12 12v9.2"/><path d="M8 5.1l8 4.6M16 5.1 8 9.7" opacity=".45"/>',
  task: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><path d="M17.25 13.5v7.5M13.5 17.25H21"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  resetView: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1l2.6 2.6"/><path d="M20.5 3.5v5h-5"/>',
  play: '<path d="M7.5 4.5v15l12-7.5z" fill="currentColor"/>',
  pause: '<rect x="6.5" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="13.5" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>',
  first: '<path d="M6 5v14"/><path d="M19 5 9.5 12 19 19z" fill="currentColor"/>',
  last: '<path d="M18 5v14"/><path d="M5 5l9.5 7L5 19z" fill="currentColor"/>',
  prev: '<path d="m15 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.9v.3"/><circle cx="12" cy="16.8" r=".9" fill="currentColor"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  bookmark: '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
  bookmarked: '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z" fill="currentColor"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  home: '<path d="M3.5 11 12 3.5l8.5 7.5"/><path d="M6 9v11h12V9"/>',
  eraser: '<path d="m14.5 4.5 5 5L10 19H5.5l-2-2a2 2 0 0 1 0-2.8z"/><path d="M8.5 10.5l5 5M9.5 20.5h11"/>',
  shuffle: '<path d="M3 7h3.5c4 0 6.5 10 11 10H21M3 17h3.5c1.6 0 2.8-1.6 3.9-3.6M13.6 9.6C14.7 8 15.9 7 17.5 7H21"/><path d="m18.5 4.5 2.5 2.5-2.5 2.5M18.5 14.5l2.5 2.5-2.5 2.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  inspect: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  flag: '<path d="M5.5 21V4M5.5 4h11l-2 4 2 4h-11"/>',
};

/** SVG ikona jako řetězec (pro innerHTML). */
export function icon(name, { size = 22, label } = {}) {
  const body = P[name];
  if (!body) throw new Error(`Neznámá ikona ${name}`);
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="ico" ${aria} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/** Doplní ikony do všech prvků s atributem data-icon. */
export function hydrateIcons(root = document) {
  for (const elm of root.querySelectorAll('[data-icon]')) {
    if (elm.querySelector(':scope > svg.ico')) continue;
    elm.insertAdjacentHTML('afterbegin', icon(elm.dataset.icon, { size: Number(elm.dataset.iconSize) || 22 }));
  }
}
