// Geometrie kostky 3×3: 54 nálepek (facelets) a 26 pozic dílků (slotů).
//
// Souřadnice: x doprava (R), y nahoru (U), z dopředu (F); kostičky leží
// na mřížce {-1, 0, 1}³. Každá nálepka má polohu kostičky a normálu stěny.
// Pořadí nálepek odpovídá formátu Kociemba (U R F D L B, každá stěna 0–8
// po řádcích tak, jak se na ni běžně díváme).

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];

export const NORMALS = {
  U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1],
  D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1],
};

function faceletPosition(face, r, c) {
  switch (face) {
    case 'U': return [c - 1, 1, r - 1];
    case 'R': return [1, 1 - r, 1 - c];
    case 'F': return [c - 1, 1 - r, 1];
    case 'D': return [c - 1, -1, 1 - r];
    case 'L': return [-1, 1 - r, c - 1];
    case 'B': return [1 - c, 1 - r, -1];
  }
  throw new Error(`Neznámá stěna ${face}`);
}

/** @type {{index:number, face:string, pos:number[], normal:number[]}[]} */
export const FACELETS = [];
for (const face of FACES) {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    FACELETS.push({ index: FACELETS.length, face, pos: faceletPosition(face, r, c), normal: NORMALS[face] });
  }
}

const keyOf = (pos, normal) => `${pos}|${normal}`;
const FACELET_BY_KEY = new Map(FACELETS.map((f) => [keyOf(f.pos, f.normal), f.index]));

export function faceletAt(pos, normal) {
  const i = FACELET_BY_KEY.get(keyOf(pos, normal));
  if (i === undefined) throw new Error(`Na ${pos} s normálou ${normal} žádná nálepka není`);
  return i;
}

// Otočení vektoru o q čtvrtotáček ve směru hodinových ručiček při pohledu
// z kladného konce osy (osa 0 = x, 1 = y, 2 = z).
export function rotate(v, axis, q) {
  let [x, y, z] = v;
  for (let k = ((q % 4) + 4) % 4; k > 0; k--) {
    if (axis === 0) [x, y, z] = [x, z, -y];
    else if (axis === 1) [x, y, z] = [-z, y, x];
    else [x, y, z] = [y, -x, z];
  }
  return [x, y, z];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Referenční stěna slotu pro orientaci: U/D, jinak F/B (u středů jediná stěna).
// U hran to dává klasickou EO vůči ose F/B, u rohů běžnou CO vůči U/D.
const REF_PRIORITY = ['U', 'D', 'F', 'B', 'R', 'L'];

/**
 * Sloty (pozice dílků). Nálepky slotu jsou seřazené: referenční první,
 * u rohů dál po směru hodinových ručiček zvenku – vznikají tak názvy
 * URF, UFL, … a orientace rohů jsou srovnatelné mezi sloty.
 * @type {{id:number, name:string, type:'center'|'edge'|'corner', pos:number[], facelets:number[]}[]}
 */
export const SLOTS = [];
{
  const groups = new Map();
  for (const f of FACELETS) {
    const k = String(f.pos);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f.index);
  }
  for (const list of groups.values()) {
    const pos = FACELETS[list[0]].pos;
    const ordered = [...list].sort((a, b) =>
      REF_PRIORITY.indexOf(FACELETS[a].face) - REF_PRIORITY.indexOf(FACELETS[b].face));
    if (ordered.length === 3) {
      const [a, b, c] = ordered;
      const clockwise = dot(cross(FACELETS[a].normal, FACELETS[b].normal), pos) < 0;
      ordered.splice(0, 3, a, clockwise ? b : c, clockwise ? c : b);
    }
    const type = ['center', 'edge', 'corner'][ordered.length - 1];
    SLOTS.push({
      id: SLOTS.length, type, pos, facelets: ordered,
      name: ordered.map((i) => FACELETS[i].face).join(''),
    });
  }
}

/** Slot, do kterého patří nálepka na dané pozici. */
export const SLOT_OF = new Uint8Array(54);
/** Index nálepky uvnitř jejího slotu (0 = referenční). */
export const ORI_AT = new Uint8Array(54);
for (const s of SLOTS) s.facelets.forEach((f, i) => { SLOT_OF[f] = s.id; ORI_AT[f] = i; });

const normName = (name) => [...name.toUpperCase()].sort().join('');
const SLOT_BY_NAME = new Map(SLOTS.map((s) => [normName(s.name), s]));

/** Najde slot podle názvu v libovolném pořadí písmen („FR“ = „RF“, „UFR“ = „URF“). */
export function slotByName(name) {
  const s = SLOT_BY_NAME.get(normName(name));
  if (!s) throw new Error(`Neznámý dílek „${name}“`);
  return s;
}
