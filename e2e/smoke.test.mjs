// Testy v prohlížeči (Playwright + Chromium): hlavní cesty aplikací na mobilu.
//   npm run e2e   (CHROMIUM=/cesta/k/chrome pro vlastní prohlížeč)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { serve } from './server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
let server, browser, base;

before(async () => {
  server = await serve(root);
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, args: ['--headless=new'] } : {});
});
after(async () => { await browser?.close(); server?.close(); });

async function open(page = 'timer', storage = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript(([pg, st]) => {
    if (sessionStorage.getItem('init')) return;
    sessionStorage.setItem('init', '1');
    localStorage.clear();
    localStorage.setItem('ergocube.page', JSON.stringify(pg));
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, JSON.stringify(v));
  }, [page, storage]);
  await p.goto(base);
  return { p, ctx, errors };
}

/** Klepnutí na nálepku 3D kostky (pozice podle indexu nálepky). */
async function tapSticker(p, cube, pos) {
  const bb = await p.locator(`#${cube} [data-pos="${pos}"]`).boundingBox();
  await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
}

test('timer: zamíchání z náhodného stavu, měření a statistiky', async () => {
  const { p, ctx, errors } = await open('timer');
  await p.waitForFunction(() => /[RUFDLB]/.test(document.querySelector('#t-scramble').textContent)
    && !document.querySelector('#t-scramble').classList.contains('loading'), null, { timeout: 15000 });
  await p.keyboard.down('Space');
  await p.waitForTimeout(400);
  await p.keyboard.up('Space');
  await p.waitForTimeout(300);
  await p.keyboard.press('KeyA');
  await p.waitForFunction(() => document.querySelector('#t-mini').textContent.includes('1'));
  await p.locator('.tabbar [data-tab="stats"]').tap();
  assert.equal(await p.locator('#s-list li.solve').count(), 1);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'bez vodorovného posouvání');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('timer: Multi-Blind se zadává formulářem', async () => {
  const { p, ctx, errors } = await open('timer', { 'ergocube.timer': { event: '333mbf' } });
  await p.waitForFunction(() => document.querySelector('#t-scramble').textContent.includes('3.'), null, { timeout: 20000 });
  await p.fill('#t-mbf-solved', '3');
  await p.fill('#t-mbf-time', '12:34');
  await p.locator('#t-mbf button[type="submit"]').tap();
  await p.waitForFunction(() => document.querySelector('#t-last').textContent.includes('3/3 12:34'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('nastavení: záloha jde stáhnout', async () => {
  const { p, ctx } = await open('timer', { 'ergocube.algs': [] });
  await p.locator('#settings-btn').tap();
  const [download] = await Promise.all([p.waitForEvent('download'), p.locator('#set-export').tap()]);
  const data = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
  assert.equal(data.format, 'ergocube-backup');
  assert.ok('ergocube.algs' in data.data);
  await ctx.close();
});

test('lab: vybarvení rohu v cíli, hledání a uložení do trenažéru', async () => {
  const { p, ctx, errors } = await open('lab');
  await p.locator('#palette-b [title="Bílá"]').tap();
  await tapSticker(p, 'cube-b', 8);
  await p.locator('#palette-b [title="Zelená"]').tap();
  await tapSticker(p, 'cube-b', 20);
  assert.match(await p.locator('#task-status').innerText(), /1 dílků: URF/);
  // výchozí: roh natočený (U červená, R zelená → třetí se doplní)
  await p.locator('#palette-a [title="Červená"]').tap();
  await tapSticker(p, 'cube-a', 8);
  await p.locator('#palette-a [title="Zelená"]').tap();
  await tapSticker(p, 'cube-a', 9);
  await p.locator('#go-search').tap();
  await p.waitForFunction(() => document.querySelectorAll('#results .result').length > 0, null, { timeout: 20000 });
  await p.locator('#results .result .save').first().tap();
  await p.locator('.tabbar [data-tab="trainer"]').tap();
  await p.waitForFunction(() => !document.querySelector('#tr-cube').hidden);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('lab: Pyraminx, Skewb, 2×2 a Square-1 – zadání stylem, zamíchání a hledání', async () => {
  const { p, ctx, errors } = await open('lab');
  const scrambles = { 222: "R U R' F", pyram: "R U' L", skewb: "R U' L", sq1: '(1,0)/ (-1,-1)/' };
  for (const [id, scr] of Object.entries(scrambles)) {
    await p.selectOption('#lab-puzzle', id);
    // nástroj styl (Plná) a klepnutí na několik míst cíle = dílky na svých místech
    await p.locator('#styles .style-btn', { hasText: 'Plná' }).tap();
    const positions = await p.locator('#cube-b [data-pos]').evaluateAll((els) => els.map((e) => Number(e.dataset.pos)));
    for (const pos of positions.filter((_, i) => i % 7 === 0).slice(0, 5)) {
      await p.locator(`#cube-b [data-pos="${pos}"]`).first().click({ force: true });
    }
    await p.fill('#a-moves', scr);
    await p.locator('#a-apply').tap();
    assert.match(await p.locator('#task-status').innerText(), /✓/, id);
    await p.locator('#go-search').tap();
    await p.waitForFunction(() => !document.querySelector('#search').disabled, null, { timeout: 60000 });
    assert.match(await p.locator('#detail').innerText(), /řeší zadání/, `${id}: ${await p.locator('#status').innerText()}`);
    await p.locator('.segmented button[data-sub="task"]').tap();
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});
