// Chytrá kostka v rozhraní: Nastavení → Chytrá kostka (připojení, baterie, stav kostky
// naživo, „Kostka je složená“) a značka v hlavičce, když je připojená.

import { $, el } from './dom.js';
import { smartCube, bluetoothAvailable } from '../smartcube/index.js';
import { toFacelets } from '../core/cube.js';
import { netSvg } from './netsvg.js';
import { toast } from './share.js';

export function initSmartCubeUi() {
  const live = $('cube-live');
  const draw = (state) => { live.innerHTML = netSvg([...toFacelets(state)].map((c) => ({ color: c })), '', 150); };
  const render = (info = smartCube.info()) => {
    const on = info.status === 'on';
    $('cube-connect').hidden = on;
    $('cube-connect').disabled = info.status === 'connecting';
    $('cube-connect').textContent = info.status === 'connecting' ? 'Připojuji…' : 'Připojit kostku';
    $('cube-solved').hidden = !on;
    $('cube-disconnect').hidden = !on;
    live.hidden = !on;
    $('cube-status').textContent = on
      ? `Připojeno: ${info.name}${info.battery !== null ? ` · baterie ${info.battery} %` : ''}${info.simulated ? ' (napodobená)' : ''}`
      : info.error || (bluetoothAvailable() ? 'Nepřipojeno.' : 'Tenhle prohlížeč neumí Bluetooth – použij Chrome na Androidu nebo počítači, na iPhonu prohlížeč Bluefy.');
    const chip = $('cube-chip');
    chip.hidden = !on;
    chip.textContent = on ? `🔗 ${info.battery !== null ? `${info.battery} %` : 'kostka'}` : '';
    if (on) draw(smartCube.state);
  };
  smartCube.on('status', render);
  smartCube.on('state', ({ state }) => { if (!live.hidden) draw(state); });
  let pending = 0;
  smartCube.on('move', ({ state }) => {
    if (live.hidden || pending) return;
    pending = requestAnimationFrame(() => { pending = 0; draw(state); });
  });
  $('cube-connect').onclick = async () => {
    try {
      await smartCube.connect({
        askMac: async (device) => prompt(`MAC adresu kostky ${device.name ?? ''} se nepodařilo zjistit sama. Najdeš ji v aplikaci výrobce (např. GAN Cube Station) – ve tvaru AB:12:CD:34:EF:56:`)?.trim() || null,
      });
      if (smartCube.connected) toast('Kostka připojená – drž ji složenou, nebo klepni na „Kostka je složená“');
    } catch (e) { toast(e.message); }
    render();
  };
  $('cube-disconnect').onclick = () => smartCube.disconnect();
  $('cube-solved').onclick = () => smartCube.markSolved();
  $('cube-chip').onclick = () => $('settings-btn').click();
  render();
  // naposledy použitá kostka se zkusí připojit sama (jen kde to prohlížeč dovolí bez výběru)
  if (bluetoothAvailable()) smartCube.reconnect().catch(() => {});
}
