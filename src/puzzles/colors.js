// Barvy nálepek: písmeno stěny → CSS proměnná a název (pro paletu).

export const CUBE_COLORS = [
  { face: 'U', label: 'Bílá', css: 'var(--c-U)' },
  { face: 'D', label: 'Žlutá', css: 'var(--c-D)' },
  { face: 'F', label: 'Zelená', css: 'var(--c-F)' },
  { face: 'B', label: 'Modrá', css: 'var(--c-B)' },
  { face: 'R', label: 'Červená', css: 'var(--c-R)' },
  { face: 'L', label: 'Oranžová', css: 'var(--c-L)' },
];

// Pyraminx (WCA): vpředu zelená, vlevo červená, vpravo modrá, dole žlutá.
export const PYRAMINX_COLORS = [
  { face: 'F', label: 'Zelená', css: 'var(--c-F)' },
  { face: 'L', label: 'Červená', css: 'var(--c-R)' },
  { face: 'R', label: 'Modrá', css: 'var(--c-B)' },
  { face: 'D', label: 'Žlutá', css: 'var(--c-D)' },
];
