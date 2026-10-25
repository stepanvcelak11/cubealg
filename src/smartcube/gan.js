// Chytré kostky GAN (a MoYu AI 2023) přes Web Bluetooth: protokoly Gen2, Gen3 a Gen4.
// Podle knihovny gan-web-bluetooth (Andy Fedotov, licence MIT) přepsané do čistého JS bez
// závislostí: zprávy jsou šifrované AES-128-CBC (klíč a IV „osolené“ MAC adresou kostky),
// kostka posílá tahy (s časem podle svých hodin), stav kostky, baterii a hardware.
// Gen3/Gen4 kostky si ztracené tahy dají znovu poslat (historie tahů).

import { cbcBlock } from './aes.js';

export const GEN2 = { service: '6e400001-b5a3-f393-e0a9-e50e24dc4179', command: '28be4a4a-cd67-11e9-a32f-2a2ae2dbcce4', state: '28be4cb6-cd67-11e9-a32f-2a2ae2dbcce4' };
export const GEN3 = { service: '8653000a-43e6-47b7-9cb0-5fc21d4ae340', command: '8653000c-43e6-47b7-9cb0-5fc21d4ae340', state: '8653000b-43e6-47b7-9cb0-5fc21d4ae340' };
export const GEN4 = { service: '00000010-0000-fff7-fff6-fff5fff4fff0', command: '0000fff5-0000-1000-8000-00805f9b34fb', state: '0000fff6-0000-1000-8000-00805f9b34fb' };
/** Identifikátory výrobce v reklamě kostky (z nich je MAC adresa) */
export const GAN_CIC = Array.from({ length: 256 }, (_, i) => (i << 8) | 0x01);
const KEYS = [
  { key: [0x01, 0x02, 0x42, 0x28, 0x31, 0x91, 0x16, 0x07, 0x20, 0x05, 0x18, 0x54, 0x42, 0x11, 0x12, 0x53], iv: [0x11, 0x03, 0x32, 0x28, 0x21, 0x01, 0x76, 0x27, 0x20, 0x95, 0x78, 0x14, 0x32, 0x12, 0x02, 0x43] },
  // MoYu AI 2023
  { key: [0x05, 0x12, 0x02, 0x45, 0x02, 0x01, 0x29, 0x56, 0x12, 0x78, 0x12, 0x76, 0x81, 0x01, 0x08, 0x03], iv: [0x01, 0x44, 0x28, 0x06, 0x86, 0x21, 0x22, 0x28, 0x51, 0x05, 0x08, 0x31, 0x82, 0x02, 0x21, 0x06] },
];
const FACES = 'URFDLB';

/** Šifrování zpráv: první a poslední 16bajtový blok, klíč a IV osolené MAC adresou (pozpátku). */
export function ganCipher(mac, moyu = false) {
  const salt = mac.split(/[:\-\s]+/).map((c) => parseInt(c, 16)).reverse();
  if (salt.length !== 6 || salt.some((x) => !(x >= 0 && x <= 255))) throw new Error('Neplatná MAC adresa kostky');
  const { key, iv } = KEYS[moyu ? 1 : 0];
  const k = key.slice(), v = iv.slice();
  for (let i = 0; i < 6; i++) { k[i] = (key[i] + salt[i]) % 0xff; v[i] = (iv[i] + salt[i]) % 0xff; }
  const c = cbcBlock(k, v);
  return {
    encrypt(data) {
      const out = Uint8Array.from(data);
      out.set(c.encrypt(out.subarray(0, 16)), 0);
      if (out.length > 16) out.set(c.encrypt(out.subarray(out.length - 16)), out.length - 16);
      return out;
    },
    decrypt(data) {
      const out = Uint8Array.from(data);
      if (out.length > 16) out.set(c.decrypt(out.subarray(out.length - 16)), out.length - 16);
      out.set(c.decrypt(out.subarray(0, 16)), 0);
      return out;
    },
  };
}

/** Čtení bitových slov ze zprávy (bity od nejvyššího). */
function bitsOf(msg) {
  const bits = Array.from(msg, (b) => (b + 0x100).toString(2).slice(1)).join('');
  return (start, len, little = false) => {
    if (len <= 8) return parseInt(bits.slice(start, start + len), 2);
    const bytes = Array.from({ length: len / 8 }, (_, i) => parseInt(bits.slice(start + 8 * i, start + 8 * i + 8), 2));
    if (little) bytes.reverse();
    return bytes.reduce((a, b) => a * 256 + b, 0);
  };
}

const CORNERS = [[8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11], [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]];
const EDGES = [[5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25], [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14]];
const sum = (a) => a.reduce((x, y) => x + y, 0);

/** Stav kostky (permutace a natočení rohů a hran) → řetězec Kociemba (URFDLB). */
export function toKociemba(cp, co, ep, eo) {
  const f = Array.from({ length: 54 }, (_, i) => FACES[Math.floor(i / 9)]);
  for (let i = 0; i < 8; i++) for (let p = 0; p < 3; p++) f[CORNERS[i][(p + co[i]) % 3]] = FACES[Math.floor(CORNERS[cp[i]][p] / 9)];
  for (let i = 0; i < 12; i++) for (let p = 0; p < 2; p++) f[EDGES[i][(p + eo[i]) % 2]] = FACES[Math.floor(EDGES[ep[i]][p] / 9)];
  return f.join('');
}

/** Stav z bitů zprávy (rohy od bitu c, natočení od bitu o…), poslední dílek se dopočte. */
function stateAt(get, cpAt, coAt, epAt, eoAt) {
  const cp = [], co = [], ep = [], eo = [];
  for (let i = 0; i < 7; i++) { cp.push(get(cpAt + i * 3, 3)); co.push(get(coAt + i * 2, 2)); }
  cp.push(28 - sum(cp)); co.push((3 - (sum(co) % 3)) % 3);
  for (let i = 0; i < 11; i++) { ep.push(get(epAt + i * 4, 4)); eo.push(get(eoAt + i, 1)); }
  ep.push(66 - sum(ep)); eo.push((2 - (sum(eo) % 2)) % 2);
  return toKociemba(cp, co, ep, eo);
}

const moveOf = (face, dir) => FACES[face] + (dir ? "'" : '');

/**
 * Ovladač protokolu: command(type) → zpráva, handle(msg, send, now) → události
 * { type: 'move', move, cubeTime, time } | { type: 'facelets', facelets } | { type: 'battery', level }
 * | { type: 'hardware', name, version } | { type: 'disconnect' }.
 */
export function gen2Driver() {
  let lastSerial = -1, lastTime = 0, cubeTime = 0;
  return {
    command(type) {
      const m = new Uint8Array(20);
      if (type === 'facelets') m[0] = 0x04;
      else if (type === 'hardware') m[0] = 0x05;
      else if (type === 'battery') m[0] = 0x09;
      else if (type === 'reset') m.set([0x0a, 0x05, 0x39, 0x77, 0x00, 0x00, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab]);
      else return null;
      return m;
    },
    async handle(msg, send, now) {
      const get = bitsOf(msg);
      const type = get(0, 4);
      const out = [];
      if (type === 0x02 && lastSerial !== -1) {
        const serial = get(4, 8);
        const diff = Math.min((serial - lastSerial) & 0xff, 7);
        lastSerial = serial;
        for (let i = diff - 1; i >= 0; i--) {
          const face = get(12 + 5 * i, 4), dir = get(16 + 5 * i, 1);
          let elapsed = get(47 + 16 * i, 16);
          if (elapsed === 0) elapsed = now - lastTime;
          cubeTime += elapsed;
          if (face < 6) out.push({ type: 'move', move: moveOf(face, dir), cubeTime, time: i === 0 ? now : null });
        }
        if (diff > 0) lastTime = now;
      } else if (type === 0x04) {
        const serial = get(4, 8);
        if (lastSerial === -1) lastSerial = serial;
        out.push({ type: 'facelets', facelets: stateAt(get, 12, 33, 47, 91) });
      } else if (type === 0x05) {
        let name = '';
        for (let i = 0; i < 8; i++) name += String.fromCharCode(get(i * 8 + 40, 8));
        out.push({ type: 'hardware', name: name.replace(/\0/g, '').trim(), version: `${get(24, 8)}.${get(32, 8)}` });
      } else if (type === 0x09) out.push({ type: 'battery', level: Math.min(get(8, 8), 100) });
      else if (type === 0x0d) out.push({ type: 'disconnect' });
      return out;
    },
  };
}

/**
 * Gen3 a Gen4: tahy s číslem (serial) – když nějaký chybí, kostka pošle historii tahů
 * a události se pustí ve správném pořadí. Formáty se liší jen polohou polí.
 */
function bufferedDriver(gen) {
  const G = gen === 3
    ? { magic: true, type: [8, 8], len: [16, 8], move: 0x01, hist: 0x06, facelets: 0x02, battery: 0x10, disconnect: 0x11, hw: 0x07, cubeTime: 24, serial: 56, dir: 72, face: 74, histStart: 24, histMoves: 32, fSerial: 24, f: [40, 61, 77, 121] }
    : { magic: false, type: [0, 8], len: [8, 8], move: 0x01, hist: 0xd1, facelets: 0xed, battery: 0xef, disconnect: 0xea, hw: 0xfc, cubeTime: 16, serial: 48, dir: 64, face: 66, histStart: 16, histMoves: 24, fSerial: 16, f: [32, 53, 69, 113] };
  let serial = -1, lastSerial = -1, lastLocal = null;
  const buffer = [];
  const cmd = (bytes) => { const m = new Uint8Array(gen === 3 ? 16 : 20); m.set(bytes); return m; };
  const inRange = (start, end, s, closedEnd = false) => ((end - start) & 0xff) >= ((s - start) & 0xff) && ((start - s) & 0xff) > 0 && (closedEnd || ((end - s) & 0xff) > 0);
  async function history(send, from, count) {
    if (from % 2 === 0) from = (from - 1) & 0xff;
    if (count % 2 === 1) count++;
    count = Math.min(count, from + 1);
    await send(cmd(gen === 3 ? [0x68, 0x03, from, 0, count, 0] : [0xd1, 0x04, from, 0, count, 0])).catch(() => {});
  }
  async function evict(send) {
    const out = [];
    while (buffer.length) {
      const head = buffer[0];
      const diff = lastSerial === -1 ? 1 : (head.serial - lastSerial) & 0xff;
      if (diff > 1) { if (send) await history(send, head.serial, diff); break; }
      out.push(buffer.shift());
      lastSerial = head.serial;
    }
    return out.map(({ serial: _, ...e }) => e);
  }
  return {
    command(type) {
      if (gen === 3) {
        if (type === 'facelets') return cmd([0x68, 0x01]);
        if (type === 'hardware') return cmd([0x68, 0x04]);
        if (type === 'battery') return cmd([0x68, 0x07]);
        if (type === 'reset') return cmd([0x68, 0x05, 0x05, 0x39, 0x77, 0x00, 0x00, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0x00, 0x00, 0x00]);
      } else {
        if (type === 'facelets') return cmd([0xdd, 0x04, 0x00, 0xed, 0x00, 0x00]);
        if (type === 'hardware') return cmd([0xdf, 0x03, 0x00, 0x00, 0x00]);
        if (type === 'battery') return cmd([0xdd, 0x04, 0x00, 0xef, 0x00, 0x00]);
        if (type === 'reset') return cmd([0xd2, 0x0d, 0x05, 0x39, 0x77, 0x00, 0x00, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0x00, 0x00, 0x00]);
      }
      return null;
    },
    async handle(msg, send, now) {
      const get = bitsOf(msg);
      if (G.magic && get(0, 8) !== 0x55) return [];
      const type = get(...G.type), len = get(...G.len);
      if (G.magic && len === 0) return [];
      if (type === G.move) {
        if (lastSerial === -1) return [];
        lastLocal = now;
        const cubeTime = get(G.cubeTime, 32, true);
        serial = get(G.serial, 16, true) & 0xff;
        const face = [2, 32, 8, 1, 16, 4].indexOf(get(G.face, 6));
        if (face >= 0) buffer.push({ type: 'move', serial, move: moveOf(face, get(G.dir, 2)), cubeTime, time: now });
        return evict(send);
      }
      if (type === G.hist) {
        const start = get(G.histStart, 8);
        for (let i = 0; i < (len - 1) * 2; i++) {
          const face = [1, 5, 3, 0, 4, 2].indexOf(get(G.histMoves + 4 * i, 3));
          if (face < 0) continue;
          const s = (start - i) & 0xff;
          const ev = { type: 'move', serial: s, move: moveOf(face, get(G.histMoves + 3 + 4 * i, 1)), cubeTime: null, time: null };
          if (buffer.length) {
            if (buffer.some((e) => e.serial === s) || !inRange(lastSerial, buffer[0].serial, s)) continue;
            if (s === ((buffer[0].serial - 1) & 0xff)) buffer.unshift(ev);
          } else if (inRange(lastSerial, serial, s, true)) buffer.unshift(ev);
        }
        return evict();
      }
      if (type === G.facelets) {
        serial = get(G.fSerial, 16, true) & 0xff;
        if (lastSerial !== -1 && lastLocal !== null && now - lastLocal > 500) {
          const diff = (serial - lastSerial) & 0xff;
          if (diff > 0 && serial !== 0) await history(send, buffer[0] ? buffer[0].serial : (serial + 1) & 0xff, diff + 1);
        }
        if (lastSerial === -1) lastSerial = serial;
        return [{ type: 'facelets', facelets: stateAt(get, ...G.f) }];
      }
      if (type === G.battery) return [{ type: 'battery', level: Math.min(gen === 3 ? get(24, 8) : get(8 + len * 8, 8), 100) }];
      if (type === G.disconnect) return [{ type: 'disconnect' }];
      if (type === G.hw) {
        let name = '';
        const n = gen === 3 ? 5 : len - 1;
        for (let i = 0; i < n; i++) name += String.fromCharCode(get(i * 8 + (gen === 3 ? 32 : 24), 8));
        return [{ type: 'hardware', name: name.replace(/\0/g, '').trim() }];
      }
      return [];
    },
  };
}
export const gen3Driver = () => bufferedDriver(3);
export const gen4Driver = () => bufferedDriver(4);

/** MAC adresa z dat výrobce v reklamě kostky (posledních 6 bajtů, pozpátku). */
export function macFromManufacturer(data) {
  let view = null;
  if (data instanceof DataView) view = new DataView(data.buffer.slice(2, 11));
  else for (const id of GAN_CIC) if (data?.has?.(id)) { view = new DataView(data.get(id).buffer.slice(0, 9)); break; }
  if (!view || view.byteLength < 6) return null;
  const out = [];
  for (let i = 1; i <= 6; i++) out.push(view.getUint8(view.byteLength - i).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(':');
}

/** Bluetooth filtr pro výběr kostky (requestDevice). */
export const GAN_REQUEST = {
  filters: [{ namePrefix: 'GAN' }, { namePrefix: 'MG' }, { namePrefix: 'AiCube' }],
  optionalServices: [GEN2.service, GEN3.service, GEN4.service],
  optionalManufacturerData: GAN_CIC,
};

/** Podle služeb připojené kostky vybere protokol: { gen, chars, driver }. */
export function ganProtocolFor(serviceUuids, name = '') {
  const has = (u) => serviceUuids.map((s) => s.toLowerCase()).includes(u);
  if (has(GEN2.service)) return { gen: 2, chars: GEN2, driver: gen2Driver(), moyu: name.startsWith('AiCube') };
  if (has(GEN3.service)) return { gen: 3, chars: GEN3, driver: gen3Driver(), moyu: false };
  if (has(GEN4.service)) return { gen: 4, chars: GEN4, driver: gen4Driver(), moyu: false };
  return null;
}
