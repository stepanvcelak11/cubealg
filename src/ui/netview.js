// Plošný pohled na hlavolam v SVG (Pyraminx, Skewb, Square-1, síť kostky).
// Stejné rozhraní jako Cube3D: render(stickers), onSticker(pos), layout(),
// resetView(), animate().

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

export class NetView {
  /**
   * @param {HTMLElement} container
   * @param {{viewBox: string, polys?: string[], onSticker?: (pos:number) => void, label?: string, fill?: boolean}} opts
   *   polys – body polygonu každé nálepky (u Square-1 se posílají v render)
   */
  constructor(container, { viewBox, polys = [], onSticker, label = 'Hlavolam', fill = false }) {
    this.container = container;
    this.onSticker = onSticker;
    this.polys = polys;
    const id = `nv${++uid}`;
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('viewBox', viewBox);
    this.svg.setAttribute('class', `netview${fill ? ' fill' : ''}${onSticker ? ' editable' : ''}`);
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', label);
    // vzory pro čárkovaný a tečkovaný styl (přes barvu nálepky)
    this.svg.innerHTML = `<defs>
      <pattern id="${id}-hatch" width="0.22" height="0.22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="0.09" height="0.22" fill="rgb(0 0 0 / 0.55)"/></pattern>
      <pattern id="${id}-dots" width="0.2" height="0.2" patternUnits="userSpaceOnUse">
        <circle cx="0.1" cy="0.1" r="0.045" fill="rgb(0 0 0 / 0.6)"/></pattern></defs><g class="nv-body"></g>`;
    this.hatch = `url(#${id}-hatch)`;
    this.dots = `url(#${id}-dots)`;
    this.body = this.svg.querySelector('.nv-body');
    container.replaceChildren(this.svg);
    this.svg.addEventListener('click', (e) => {
      const poly = e.target.closest?.('[data-pos]');
      if (poly && this.onSticker) this.onSticker(Number(poly.dataset.pos));
    });
  }

  /**
   * @param {{css?: string, color?: string, style: string, selected?: boolean, points?: string, pos?: number}[]} stickers
   *   points/pos – vlastní polygon a index (Square-1), jinak polys[i] a i
   */
  render(stickers) {
    const parts = [];
    stickers.forEach((st, i) => {
      if (!st) return;
      const pos = st.pos ?? i;
      const points = st.points ?? this.polys[pos];
      if (!points) return;
      const blank = st.color === 'X' || st.style === 'none';
      const fill = blank ? 'var(--c-gray)' : (st.css ?? `var(--c-${st.color})`);
      const cls = `nv-sticker${st.style === 'faded' ? ' faded' : ''}${st.selected ? ' selected' : ''}`;
      parts.push(`<polygon class="${cls}" data-pos="${pos}" data-style="${st.style}" points="${points}" style="fill:${fill}"/>`);
      if (!blank && st.style === 'dashed') parts.push(`<polygon class="nv-over" points="${points}" fill="${this.hatch}"/>`);
      if (!blank && st.style === 'dotted') parts.push(`<polygon class="nv-over" points="${points}" fill="${this.dots}"/>`);
    });
    this.body.innerHTML = parts.join('');
  }

  /** Doplňkový obsah (např. popisky vrstev Square-1). */
  setOverlay(svgText) {
    let g = this.svg.querySelector('.nv-overlay');
    if (!g) { g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'nv-overlay'); this.svg.append(g); }
    g.innerHTML = svgText;
  }

  layout() {}
  resetView() {}
  animate(move, ms = 120) { return new Promise((r) => setTimeout(r, ms)); }
}
