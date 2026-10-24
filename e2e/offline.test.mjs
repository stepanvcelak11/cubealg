// Bez internetu: aplikace nasazená jako na GitHub Pages (service worker + precache.json,
// stejné kroky jako .github/workflows/pages.yml) se jednou načte online, pak se síť
// vypne – hledání algoritmů v Labu, test metody i timer musí fungovat stejně.
//   npm run e2e   (CHROMIUM=/cesta/k/chrome pro vlastní prohlížeč)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, devices } from 'playwright';
import { serve } from './server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
let site, server, browser, base;

async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await files(p)); else out.push(p);
  }
  return out;
}

before(async () => {
  // sestavení jako při nasazení: soubory, verze do sw.js, seznam do precache.json
  site = await mkdtemp(join(tmpdir(), 'ergocube-site-'));
  for (const f of ['index.html', 'styles.css', 'src', 'icons', 'fonts', 'manifest.webmanifest', 'sw.js']) await cp(join(root, f), join(site, f), { recursive: true });
  await writeFile(join(site, 'sw.js'), (await readFile(join(site, 'sw.js'), 'utf8')).replaceAll('__VERSION__', 'abcdef123456'));
  const list = (await files(site)).map((f) => relative(site, f)).filter((f) => f !== 'sw.js').sort();
  await writeFile(join(site, 'precache.json'), JSON.stringify(['./', ...list]));
  server = await serve(site);
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, args: ['--headless=new'] } : {});
});
after(async () => { await browser?.close(); server?.close(); if (site) await rm(site, { recursive: true, force: true }); });

test('bez internetu: hledání algoritmů, test metody a timer po jednom načtení online', async () => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base);
  await p.evaluate(() => navigator.serviceWorker.ready);
  // Nastavení: aplikace je uložená celá
  await p.locator('#settings-btn').tap();
  await p.waitForFunction(() => /Připraveno/.test(document.querySelector('#set-offline').textContent), null, { timeout: 60000 });
  await p.keyboard.press('Escape');
  // zadání pro Lab a jednoduchá metoda pro test
  await p.evaluate(async () => {
    const { labModel } = await import('./src/ui/models.js');
    const m = labModel('333');
    const names = ['URF', 'U', 'F', 'R'];
    const home = m.home(names);
    const constraints = Object.fromEntries(m.pieceNames.map((n) => [n, names.includes(n) ? 'solved' : 'ignore']));
    localStorage.setItem('ergocube.v3', JSON.stringify({ constraints, bases: ['R', 'U', 'F'], colorsA: m.applyMoves(home, "R U R' U'"), colorsB: home }));
    localStorage.setItem('ergocube.guides', JSON.stringify({ default: { intro: '', steps: [
      { id: 'k1', title: 'Hrana vpředu', text: '', parts: { DF: 'solved' } },
      { id: 'k2', title: 'Hrana vpravo', text: '', parts: { DR: 'solved' } },
    ] } }));
    localStorage.setItem('ergocube.sim.options', JSON.stringify({ length: 'c10', steps: { default: { k1: { time: 0.5 }, k2: { time: 0.5 } } } }));
    localStorage.setItem('ergocube.page', JSON.stringify('lab'));
  });

  // síť pryč (i server)
  await ctx.setOffline(true);
  server.close();
  server.closeAllConnections?.();
  await p.reload();
  await p.locator('#go-search').tap();
  await p.waitForFunction(() => document.querySelectorAll('#results .result').length > 0, null, { timeout: 30000 })
    .catch(async (e) => { throw new Error(`${e.message}: ${await p.locator('#status').innerText()}`); });
  // rychlé jádro (WebAssembly) se načetlo i offline
  assert.equal(await p.evaluate(async () => (await import('./src/search/kernel.js')).initKernel()), true);

  // generátor sady (EPBL, první tři případy)
  await p.evaluate(async () => {
    const { labModel } = await import('./src/ui/models.js');
    const m = labModel('333');
    const P = m.P;
    const ud = P.slots.filter((s) => s.facelets.length === 2 && /[UD]/.test(s.name)).map((s) => s.name);
    const A = m.home(P.slots.filter((s) => !ud.includes(s.name)).map((s) => s.name));
    for (const n of ud) for (const f of P.slotByName(n).facelets) if (P.stickerFace[f] === 'U' || P.stickerFace[f] === 'D') A[f] = P.stickerFace[f];
    localStorage.setItem('ergocube.v3', JSON.stringify({
      constraints: Object.fromEntries(m.pieceNames.map((n) => [n, 'solved'])), colorsA: A, colorsB: m.home(m.pieceNames), bases: ['M', 'U', 'D'],
    }));
    localStorage.setItem('ergocube.lab.generator', JSON.stringify({ auf: true, adf: true, y: true, z2: true, wy: false, par: true, fix: 'M2 U2 M2', name: 'EPBL', time: 3, view: 'balanced' }));
  });
  await p.reload();
  await p.locator('#gen-set').tap();
  await p.locator('.gen-dialog button', { hasText: 'Spočítat případy' }).tap();
  await p.waitForFunction(() => /případů/.test(document.querySelector('.gen-status').textContent));
  const boxes = p.locator('.gen-card-head input');
  const n = await boxes.count();
  for (let i = 3; i < n; i++) await boxes.nth(i).uncheck();
  await p.locator('.gen-dialog button', { hasText: 'Generovat' }).tap();
  await p.waitForFunction(() => /Hotovo/.test(document.querySelector('.gen-status').textContent), null, { timeout: 120000 });
  const outs = await p.locator('.gen-card .gen-out').allInnerTexts();
  assert.equal(outs.slice(0, 3).filter((t) => /✓ \d/.test(t)).length, 3, `${outs.slice(0, 3).join(' | ')} · ${await p.locator('.gen-status').innerText()}`);
  await p.keyboard.press('Escape');

  await p.locator('.tabbar [data-tab="method"]').tap();
  await p.locator('.mp-tabs button', { hasText: 'Otestovat' }).tap();
  await p.locator('.sim-page button', { hasText: 'Spustit test' }).tap();
  await p.waitForFunction(() => /Hotovo: 10 zamíchání/.test(document.querySelector('.sim-status')?.textContent), null, { timeout: 120000 });

  await p.locator('.tabbar [data-tab="timer"]').tap();
  await p.waitForFunction(() => /[RUFDLB]/.test(document.querySelector('#t-scramble').textContent)
    && !document.querySelector('#t-scramble').classList.contains('loading'), null, { timeout: 40000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});
