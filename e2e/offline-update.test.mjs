// Bez internetu po nepovedené aktualizaci: verze A je uložená, vyjde verze B a při jejím
// stahování spadne připojení. Offline musí dál fungovat verze A (stará se nesmí smazat,
// dokud nová není uložená celá) – i generátor sady, který hledá ve workerech.
//   npm run e2e   (CHROMIUM=/cesta/k/chrome pro vlastní prohlížeč)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, devices } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const files = async (d) => (await Promise.all((await readdir(d, { withFileTypes: true })).map((e) => (e.isDirectory() ? files(join(d, e.name)) : [join(d, e.name)])))).flat();

test('bez internetu po nepovedené aktualizaci: stará verze zůstane a generátor hledá', async () => {
  const site = await mkdtemp(join(tmpdir(), 'ergocube-update-'));
  for (const f of ['index.html', 'styles.css', 'src', 'icons', 'fonts', 'manifest.webmanifest']) await cp(join(root, f), join(site, f), { recursive: true });
  const list = (await files(site)).map((f) => relative(site, f)).sort();
  await writeFile(join(site, 'precache.json'), JSON.stringify(['./', ...list]));
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  let version = 'aaaaaa111111', broken = false;
  // server: sw.js s aktuální verzí; „broken“ = spojení padá (kromě sw.js a seznamu)
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname.slice(1) || 'index.html';
    if (path === 'sw.js') { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); res.end(sw.replaceAll('__VERSION__', version)); return; }
    if (broken && path !== 'precache.json') { req.socket.destroy(); return; }
    try {
      const body = await readFile(join(site, path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, args: ['--headless=new'] } : {});
  try {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const p = await ctx.newPage();
    await p.goto(base);
    await p.evaluate(() => navigator.serviceWorker.ready);
    // verze A uložená celá (staré sw.js značku nemá – stačí počkat)
    for (let k = 0; k < 120 && !await p.evaluate(async () => !!(await caches.match('__complete__'))); k++) await p.waitForTimeout(500);
    // nová verze, připojení padá při jejím stahování
    version = 'bbbbbb222222';
    broken = true;
    await p.reload().catch(() => {});
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update())).catch(() => {});
    await p.waitForTimeout(6000);
    assert.ok((await p.evaluate(() => caches.keys())).includes('ergocube-aaaaaa111111'), 'uložená verze A zůstala');

    await ctx.setOffline(true);
    server.close();
    server.closeAllConnections();
    await p.reload();
    await p.evaluate(async () => {
      const { labModel } = await import('./src/ui/models.js');
      const m = labModel('333');
      const P = m.P;
      const ud = P.slots.filter((s) => s.facelets.length === 2 && /[UD]/.test(s.name)).map((s) => s.name);
      const A = m.home(P.slots.filter((s) => !ud.includes(s.name)).map((s) => s.name));
      for (const n of ud) for (const f of P.slotByName(n).facelets) if (P.stickerFace[f] === 'U' || P.stickerFace[f] === 'D') A[f] = P.stickerFace[f];
      localStorage.setItem('ergocube.v3', JSON.stringify({ constraints: Object.fromEntries(m.pieceNames.map((n) => [n, 'solved'])), colorsA: A, colorsB: m.home(m.pieceNames), bases: ['M', 'U', 'D'] }));
      localStorage.setItem('ergocube.lab.generator', JSON.stringify({ auf: true, adf: true, y: true, z2: true, wy: false, par: true, fix: 'M2 U2 M2', name: 'EPBL', time: 3, view: 'balanced' }));
      localStorage.setItem('ergocube.page', JSON.stringify('lab'));
    });
    await p.reload();
    await p.locator('#gen-set').tap();
    await p.locator('.gen-dialog button', { hasText: 'Spočítat případy' }).tap();
    await p.waitForFunction(() => /případů/.test(document.querySelector('.gen-status').textContent), null, { timeout: 20000 });
    const boxes = p.locator('.gen-card-head input');
    const n = await boxes.count();
    for (let i = 2; i < n; i++) await boxes.nth(i).uncheck();
    await p.locator('.gen-dialog button', { hasText: 'Generovat' }).tap();
    await p.waitForFunction(() => /Hotovo|nespustilo/.test(document.querySelector('.gen-status').textContent), null, { timeout: 90000 });
    const outs = (await p.locator('.gen-card .gen-out').allInnerTexts()).slice(0, 2);
    assert.equal(outs.filter((t) => /✓ \d/.test(t)).length, 2, `${outs.join(' | ')} · ${await p.locator('.gen-status').innerText()}`);
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
    await rm(site, { recursive: true, force: true });
  }
});
