// Editor pravidla pro skupinu dílků (core/rules.js): popořadě
//   Jaké dílky (hrany / rohy, s barvou…, bez barvy…)
//   Kam (místa po vrstvách)
//   Jak (každé místo obsadí některý z nich / všechny musí být v místech)
//   Natočení (jakkoli / nálepkou barvy na stranu / správně)
// a pod tím věta, co pravidlo znamená. Barvy a místa jsou v pohledu metody (dole = D),
// popisky ukazují skutečné barvy podle držení.

import { el } from './dom.js';
import { icon } from './icons.js';
import { frameMap, COLOR_NAME } from './parts.js';
import { describeRule, groupPieces, PLACE_LAYERS, RULE_PRESETS } from '../core/rules.js';

const VIEW = ['D', 'U', 'F', 'B', 'R', 'L'];
const WHERE = { D: 'dole', U: 'nahoře', F: 'vpředu', B: 'vzadu', R: 'vpravo', L: 'vlevo' };
const SIDE = { D: 'dolů', U: 'nahoru', F: 'dopředu', B: 'dozadu', R: 'doprava', L: 'doleva' };
const LAYER_LABEL = { D: 'Dole', E: 'Uprostřed', U: 'Nahoře' };

/** Nové pravidlo (výchozí: kříž z kterýchkoli hran barvy dole i nahoře). */
export const newRule = () => structuredClone(RULE_PRESETS[0].rule);

/**
 * @param {object} rule pravidlo (mění se na místě)
 * @param {{down:string, front:string}} frame držení metody
 * @param {number} n pořadí (pro popisky)
 * @param {() => void} onChange uložit a překreslit
 * @param {() => void} onDelete
 */
export function ruleEditor(rule, frame, n, onChange, onDelete) {
  const map = frameMap(frame);
  const uid = `${n}-${Math.random().toString(36).slice(2, 8)}`; // skupiny přepínačů nesmí kolidovat mezi kroky
  const color = (v) => COLOR_NAME[map[v]];
  const set = (patch) => { Object.assign(rule, patch); onChange(); };
  const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const chip = (label, on, onClick, swatch, title) => el('button', { type: 'button', className: `rule-chip${on ? ' on' : ''}`, title: title ?? '', ariaPressed: String(on), onclick: onClick },
    swatch ? el('i', { style: `--c: var(--c-${swatch})` }) : null, label);
  const row = (label, ...items) => el('div', { className: 'rule-row' }, el('span', { className: 'rule-label', textContent: label }), el('div', { className: 'rule-chips' }, ...items));

  // jaké dílky
  const types = row('Jaké dílky',
    chip('Hrany', rule.type === 'edge', () => set({ type: 'edge', places: PLACE_LAYERS.edge.D })),
    chip('Rohy', rule.type === 'corner', () => set({ type: 'corner', places: PLACE_LAYERS.corner.D })));
  const colors = row('s barvou', ...VIEW.map((v) => chip(color(v), (rule.colors ?? []).includes(v), () => set({ colors: toggle(rule.colors ?? [], v) }), map[v], `${color(v)} (${WHERE[v]})`)));
  const without = rule.without?.length || rule.showWithout
    ? row('bez barvy', ...VIEW.map((v) => chip(color(v), (rule.without ?? []).includes(v), () => set({ without: toggle(rule.without ?? [], v) }), map[v])))
    : el('button', { type: 'button', className: 'link-btn rule-more', textContent: '+ vyloučit barvy (např. hrany bez bílé a žluté)', onclick: () => set({ showWithout: true }) });
  const count = groupPieces(rule, map).length;

  // kam
  const layers = PLACE_LAYERS[rule.type];
  const places = el('div', { className: 'rule-places' }, ...Object.entries(layers).map(([layer, names]) => {
    const all = names.every((x) => rule.places.includes(x));
    return el('div', { className: 'rule-layer' },
      chip(LAYER_LABEL[layer], all, () => set({ places: all ? rule.places.filter((x) => !names.includes(x)) : [...new Set([...rule.places, ...names])] }), null, 'Celá vrstva'),
      ...names.map((p) => chip([...p].map((f) => WHERE[f]).join(' ').replace(/^(dole|nahoře) /, ''), rule.places.includes(p), () => set({ places: toggle(rule.places, p) }), null, p)));
  }));

  // jak
  const radio = (name, value, label, hint) => {
    const r = Object.assign(el('input', { type: 'radio', name, value }), { checked: (name.startsWith('mode') ? rule.mode : rule.ori) === value });
    r.onchange = () => set(name.startsWith('mode') ? { mode: value } : { ori: value, ...(value === 'color' && !rule.oriFaces?.length ? { oriFaces: ['D'] } : {}) });
    return el('label', { className: `rule-opt${r.checked ? ' on' : ''}` }, r, el('span', {}, el('b', { textContent: label }), hint ? el('small', { textContent: hint }) : null));
  };
  const mode = el('div', { className: 'rule-opts' },
    radio(`mode-${uid}`, 'fill', 'Každé vybrané místo obsadí některý z nich', 'Např. kříž: na 4 místa dole patří kterékoli 4 hrany ze skupiny.'),
    radio(`mode-${uid}`, 'within', 'Všechny musí být v těchto místech', 'Např. separace: všechny hrany s barvou dole musí být dole.'));

  // natočení
  const ori = el('div', { className: 'rule-opts' },
    radio(`ori-${uid}`, 'any', 'Jakkoli', null),
    radio(`ori-${uid}`, 'color', 'Nálepkou barvy na stranu', 'Např. bílou nebo žlutou dolů.'),
    radio(`ori-${uid}`, 'solved', 'Správně (jako ve složené kostce)', 'Hrany podle EO, rohy barvou nahoře/dole nahoru či dolů.'));
  const oriColors = rule.oriColors?.length ? rule.oriColors : rule.colors ?? [];
  const oriMore = rule.ori === 'color' ? el('div', { className: 'rule-sub' },
    row('nálepka', ...VIEW.map((v) => chip(color(v), oriColors.includes(v), () => set({ oriColors: toggle(oriColors, v) }), map[v]))),
    row('míří', ...VIEW.map((v) => chip(SIDE[v], (rule.oriFaces ?? []).includes(v), () => set({ oriFaces: toggle(rule.oriFaces ?? [], v) }))))) : null;

  const problems = [
    !count ? 'Žádný dílek neodpovídá barvám.' : null,
    !rule.places.length ? 'Vyber aspoň jedno místo.' : null,
    rule.mode === 'fill' && rule.places.length > count ? `Míst (${rule.places.length}) je víc než dílků ve skupině (${count}).` : null,
    rule.mode === 'within' && count > rule.places.length ? `Dílků (${count}) je víc než míst (${rule.places.length}) – nevejdou se.` : null,
    rule.ori === 'color' && !(rule.oriFaces ?? []).length ? 'Vyber, kam má nálepka mířit.' : null,
  ].filter(Boolean);

  return el('div', { className: 'rule-card' },
    el('div', { className: 'rule-head' },
      el('b', { textContent: `Pravidlo ${n}` }),
      el('small', { textContent: `${count} ${count === 1 ? 'dílek' : count < 5 ? 'dílky' : 'dílků'} ve skupině` }),
      Object.assign(el('button', { type: 'button', className: 'icon-btn', title: 'Smazat pravidlo', ariaLabel: `Smazat pravidlo ${n}` }), { innerHTML: icon('trash', { size: 18 }), onclick: onDelete })),
    types, colors, without,
    el('span', { className: 'rule-label', textContent: 'Kam' }), places,
    el('span', { className: 'rule-label', textContent: 'Jak' }), mode,
    el('span', { className: 'rule-label', textContent: 'Natočení' }), ori, oriMore,
    el('p', { className: `rule-say${problems.length ? ' bad' : ''}`, textContent: problems.length ? problems.join(' ') : describeRule(rule, map) }));
}
