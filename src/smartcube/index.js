// Chytrá kostka v aplikaci: připojení přes Web Bluetooth (GAN Gen2/3/4, MoYu AI 2023),
// stav kostky a tahy s časem. Ostatní části aplikace (timer, trenažér, metronom, rozbor
// složení, ergonomie z měření) se přihlásí k událostem:
//   'move'   { move: "R'", t: ms (čas tahu – z hodin kostky, převedený na čas stránky), state }
//   'state'  { state }               stav kostky (po připojení, po „Kostka je složená“)
//   'status' { status, name, battery, error? }   'off' | 'connecting' | 'on'
// Bez Bluetooth (iPhone v Safari, testy) jde kostku napodobit: smartCube.simulate(),
// pak smartCube.feed("R U R'") – stejné události jako skutečná kostka.

import { applyAlg, solved, fromFacelets } from '../core/cube.js';
import { GAN_REQUEST, ganCipher, ganProtocolFor, macFromManufacturer } from './gan.js';

const MAC_KEY = 'ergocube.smartcube.mac';

/** Je Web Bluetooth k dispozici (Chrome na Androidu / počítači, Bluefy na iPhonu)? */
export const bluetoothAvailable = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

function createSmartCube() {
  const listeners = new Map();
  let status = 'off', name = '', battery = null, error = '';
  let state = solved();
  let conn = null; // { device, command, notify, driver, cipher }
  let base = Infinity; // čas stránky − čas kostky (nejmenší = nejmenší zpoždění Bluetooth)
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const emit = (type, data) => { for (const fn of listeners.get(type) ?? []) { try { fn(data); } catch (e) { console.error(e); } } };
  const setStatus = (s, extra = {}) => { status = s; Object.assign(info, extra); emit('status', api.info()); };
  const info = {};

  function onMove(move, cubeTime, local) {
    const tLocal = local ?? now();
    let t = tLocal;
    if (Number.isFinite(cubeTime)) {
      base = Math.min(base, tLocal - cubeTime);
      t = cubeTime + base;
    }
    state = applyAlg(state, move);
    emit('move', { move, t, state });
  }

  async function handleEvents(events) {
    for (const e of events) {
      if (e.type === 'move') onMove(e.move, e.cubeTime, e.time);
      else if (e.type === 'facelets') {
        try { state = fromFacelets(e.facelets); emit('state', { state }); } catch { /* neplatný stav */ }
      } else if (e.type === 'battery') { battery = e.level; emit('status', api.info()); }
      else if (e.type === 'hardware') { if (e.name) { name = e.name; emit('status', api.info()); } }
      else if (e.type === 'disconnect') api.disconnect();
    }
  }

  /** MAC adresa kostky (sůl šifrování): z reklamy, z paměti, nebo ji zadáš. */
  async function macOf(device, askMac) {
    const saved = JSON.parse(localStorage.getItem(MAC_KEY) ?? '{}');
    if (saved[device.id]) return saved[device.id];
    let mac = null;
    if (typeof device.watchAdvertisements === 'function') {
      mac = await new Promise((resolve) => {
        const ctl = new AbortController();
        const done = (v) => { device.removeEventListener('advertisementreceived', onAdv); ctl.abort(); resolve(v); };
        const onAdv = (ev) => done(macFromManufacturer(ev.manufacturerData));
        device.addEventListener('advertisementreceived', onAdv);
        device.watchAdvertisements({ signal: ctl.signal }).catch(() => done(null));
        setTimeout(() => done(null), 10000);
      });
    }
    if (!mac && askMac) mac = await askMac(device);
    if (mac) localStorage.setItem(MAC_KEY, JSON.stringify({ ...saved, [device.id]: mac }));
    return mac;
  }

  async function open(device, askMac) {
    const mac = await macOf(device, askMac);
    if (!mac) throw new Error('Bez MAC adresy se kostka připojit nedá (je napsaná v aplikaci výrobce nebo na krabičce)');
    const gatt = await device.gatt.connect();
    const services = await gatt.getPrimaryServices();
    const proto = ganProtocolFor(services.map((s) => s.uuid), device.name ?? '');
    if (!proto) throw new Error('Tuhle kostku zatím neumím (podporované: GAN Gen2/3/4, MoYu AI 2023)');
    const service = services.find((s) => s.uuid.toLowerCase() === proto.chars.service);
    const command = await service.getCharacteristic(proto.chars.command);
    const notify = await service.getCharacteristic(proto.chars.state);
    const cipher = ganCipher(mac, proto.moyu);
    const send = (msg) => command.writeValue(cipher.encrypt(msg));
    const onValue = async (ev) => {
      const v = ev.target.value;
      if (!v || v.byteLength < 16) return;
      await handleEvents(await proto.driver.handle(cipher.decrypt(new Uint8Array(v.buffer)), send, now()));
    };
    notify.addEventListener('characteristicvaluechanged', onValue);
    const onGone = () => api.disconnect(false);
    device.addEventListener('gattserverdisconnected', onGone);
    await notify.startNotifications();
    conn = { device, notify, onValue, onGone, gen: proto.gen, command: (type) => { const m = proto.driver.command(type); return m ? send(m) : Promise.resolve(); } };
    name = device.name ?? 'Chytrá kostka';
    base = Infinity;
    setStatus('on', {});
    for (const c of ['facelets', 'hardware', 'battery']) await conn.command(c).catch(() => {});
  }

  const api = {
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    info: () => ({ status, name, battery, error, simulated: conn?.simulated ?? false, gen: conn?.gen ?? null }),
    get state() { return state; },
    get connected() { return status === 'on'; },
    /** Připojí kostku (výběr zařízení prohlížečem). askMac(device) → MAC, když ji nejde zjistit. */
    async connect({ askMac } = {}) {
      if (!bluetoothAvailable()) throw new Error('Tenhle prohlížeč neumí Bluetooth – použij Chrome (Android, počítač), na iPhonu prohlížeč Bluefy');
      error = '';
      setStatus('connecting');
      try {
        const device = await navigator.bluetooth.requestDevice(GAN_REQUEST);
        await open(device, askMac);
      } catch (e) {
        error = e.name === 'NotFoundError' ? '' : e.message;
        setStatus('off');
        if (e.name !== 'NotFoundError') throw e;
      }
    },
    /** Znovu připojí naposledy použitou kostku bez výběru (Chrome s getDevices). */
    async reconnect() {
      if (!navigator.bluetooth?.getDevices) return false;
      const saved = JSON.parse(localStorage.getItem(MAC_KEY) ?? '{}');
      const device = (await navigator.bluetooth.getDevices()).find((d) => saved[d.id]);
      if (!device) return false;
      setStatus('connecting');
      try { await open(device); return true; } catch { setStatus('off'); return false; }
    },
    async disconnect(close = true) {
      if (conn && !conn.simulated) {
        conn.notify.removeEventListener('characteristicvaluechanged', conn.onValue);
        conn.device.removeEventListener('gattserverdisconnected', conn.onGone);
        await conn.notify.stopNotifications().catch(() => {});
        if (close && conn.device.gatt?.connected) conn.device.gatt.disconnect();
      }
      conn = null;
      setStatus('off');
    },
    /** Kostka je teď složená: stav v aplikaci i v kostce na složeno. */
    async markSolved() {
      state = solved();
      await conn?.command?.('reset').catch(() => {});
      emit('state', { state });
    },
    async refreshBattery() { await conn?.command?.('battery').catch(() => {}); },
    /** Napodobená kostka (bez Bluetooth): tahy přes feed(). */
    simulate(label = 'Napodobená kostka') {
      conn = { simulated: true };
      name = label;
      battery = 100;
      state = solved();
      setStatus('on');
    },
    /** Tahy napodobené kostky; times = časy tahů (ms) nebo rozestup. */
    feed(alg, gap = 120) {
      if (!conn?.simulated) return;
      const moves = String(alg).trim().split(/\s+/).filter(Boolean);
      let t = now();
      for (const m of moves) {
        // dvojitý tah posílá kostka jako dva čtvrttahy
        const quarters = m.endsWith('2') ? [m[0], m[0]] : [m];
        for (const q of quarters) { onMove(q, null, t); t += gap; }
      }
    },
  };
  return api;
}

export const smartCube = createSmartCube();
if (typeof window !== 'undefined') window.__smartCube = smartCube;
