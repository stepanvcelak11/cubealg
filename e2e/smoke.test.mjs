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

/** Na úzkém displeji se upravuje jedna strana zadání – přepne na ni. */
async function showSide(p, side) {
  if (await p.locator('#side-switch').isVisible()) await p.locator(`#side-switch [data-side="${side.toUpperCase()}"]`).tap();
}

/** Výběr barvy na paletě strany a/b. */
async function paintColor(p, side, title) {
  await showSide(p, side);
  await p.locator(`#palette-${side} [title="${title}"]`).tap();
}

/** Klepnutí na nálepku 3D kostky (pozice podle indexu nálepky). */
async function tapSticker(p, cube, pos) {
  if (cube === 'cube-a' || cube === 'cube-b') await showSide(p, cube.slice(-1));
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
  await paintColor(p, 'b', 'Bílá');
  await tapSticker(p, 'cube-b', 8);
  await paintColor(p, 'b', 'Zelená');
  await tapSticker(p, 'cube-b', 20);
  // obarví se jen klepnuté nálepky (bez chytrého vybarvování se nic nedoplní)
  assert.doesNotMatch(await p.locator('#task-status').innerText(), /URF/);
  await paintColor(p, 'b', 'Červená');
  await tapSticker(p, 'cube-b', 9);
  assert.match(await p.locator('#task-status').innerText(), /URF/);
  // výchozí: roh natočený (U červená, R zelená, F bílá)
  await paintColor(p, 'a', 'Červená');
  await tapSticker(p, 'cube-a', 8);
  await paintColor(p, 'a', 'Zelená');
  await tapSticker(p, 'cube-a', 9);
  await paintColor(p, 'a', 'Bílá');
  await tapSticker(p, 'cube-a', 20);
  await p.locator('#go-search').tap();
  await p.waitForFunction(() => document.querySelectorAll('#results .result').length > 0, null, { timeout: 20000 });
  // pohledy na výsledky: všestranné / rychlost / efektivita
  await p.waitForSelector('#style-filter:not([hidden])');
  assert.match(await p.locator('#detail .style-note').innerText(), /Rychlost: \d+\. z \d+/);
  await p.locator('#style-filter .view-efficient').tap();
  assert.match(await p.locator('#view-hint').innerText(), /co nejméně tahů/);
  const lens = await p.locator('#results .result .meta').allInnerTexts();
  const nums = lens.map((t) => Number(t.match(/(\d+) tah/)[1]));
  assert.deepEqual(nums, [...nums].sort((a, b) => a - b), 'efektivita řadí podle počtu tahů');
  await p.locator('#style-filter .view-speed').tap();
  assert.match(await p.locator('#results .result .meta').first().innerText(), /\/tah/);
  await p.locator('#style-filter .view-balanced').tap();
  await p.locator('#results .result .save').first().tap();
  await p.locator('.tabbar [data-tab="trainer"]').tap();
  await p.waitForFunction(() => !document.querySelector('#tr-cube').hidden);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('lab: Pyraminx, Skewb, 2×2 a Square-1 – zadání, hledání a ovládání tvaru', async () => {
  const { p, ctx, errors } = await open('lab');
  const scrambles = { 222: "R U R' F", pyram: "R U' L", skewb: "R U' L", sq1: '(1,0)/ (-1,-1)/' };
  // zadání připravené přes modely: několik dílků, výchozí strana zamíchaná
  await p.evaluate(async (scr) => {
    const { labModel } = await import('./src/ui/models.js');
    for (const [id, alg] of Object.entries(scr)) {
      const m = labModel(id);
      const names = m.pieceNames.slice(0, 4);
      const home = m.home(names);
      const constraints = Object.fromEntries(m.pieceNames.map((n) => [n, names.includes(n) ? 'solved' : 'ignore']));
      localStorage.setItem(`ergocube.lab.${id}`, JSON.stringify({
        constraints, colorsA: m.serialize(m.applyMoves(home, alg)), colorsB: m.serialize(home),
      }));
    }
  }, scrambles);
  await p.reload();
  for (const id of Object.keys(scrambles)) {
    await p.selectOption('#lab-puzzle', id);
    assert.match(await p.locator('#task-status').innerText(), /✓/, id);
    await p.locator('#go-search').tap();
    await p.waitForFunction(() => !document.querySelector('#search').disabled, null, { timeout: 60000 });
    assert.match(await p.locator('#detail').innerText(), /řeší zadání/, `${id}: ${await p.locator('#status').innerText()}`);
    await p.locator('.segmented button[data-sub="task"]').tap();
  }
  // Square-1: tlačítka tvaru (U ↻ změní tvar výchozí strany)
  await p.locator('#sq1-pad-a button', { hasText: 'U ↻' }).tap();
  assert.equal(await p.locator('#sq1-pad-a button').count(), 5);
  // 3×3: tlačítko focení otevře dialog (bez kamery nabídne nahrání fotky)
  await p.selectOption('#lab-puzzle', '333');
  await p.locator('#a-scan').tap();
  await p.waitForSelector('.scan-dialog[open]');
  await p.locator('.scan-dialog .scan-head .icon-btn').tap();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('sady algoritmů: uložení do nové sady a trénink jen této sady', async () => {
  const { p, ctx, errors } = await open('lab');
  p.on('dialog', (d) => d.accept('OLL'));
  await p.evaluate(async () => {
    const { labModel } = await import('./src/ui/models.js');
    const m = labModel('333');
    const names = ['URF', 'U', 'F', 'R'];
    const home = m.home(names);
    const constraints = Object.fromEntries(m.pieceNames.map((n) => [n, names.includes(n) ? 'solved' : 'ignore']));
    localStorage.setItem('ergocube.v3', JSON.stringify({ constraints, colorsA: m.applyMoves(home, "R U R'"), colorsB: home }));
  });
  await p.reload();
  await p.locator('#go-search').tap();
  await p.waitForFunction(() => document.querySelectorAll('#results .result').length > 0, null, { timeout: 20000 });
  await p.selectOption('#save-set', '+new');
  assert.match(await p.locator('#save-set option:checked').innerText(), /OLL/);
  await p.locator('#results .result .save').first().tap();
  await p.locator('.tabbar [data-tab="trainer"]').tap();
  const oll = await p.locator('#tr-set option', { hasText: 'OLL' }).getAttribute('value');
  await p.selectOption('#tr-set', oll);
  await p.waitForFunction(() => !document.querySelector('#tr-cube').hidden);
  await p.selectOption('#tr-set', 'default');
  assert.equal(await p.locator('#tr-empty').isVisible(), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('trenažér: hodnocení pokusu, plán opakování a řazení nejslabších', async () => {
  const { p, ctx, errors } = await open('lab');
  await p.evaluate(async () => {
    const { labModel } = await import('./src/ui/models.js');
    const { algs } = await import('./src/ui/store.js');
    const m = labModel('333');
    const names = ['URF', 'U', 'F', 'R'];
    const home = m.home(names);
    const constraints = Object.fromEntries(m.pieceNames.map((n) => [n, names.includes(n) ? 'solved' : 'ignore']));
    const task = { puzzle: '333', constraints, colorsA: m.applyMoves(home, "R U R'"), colorsB: home };
    algs.add({ alg: "R U' R'", task, name: 'Nový' });
    const w = algs.add({ alg: "R U' R'", task, name: 'Slabý' });
    algs.update(w, { times: [{ t: 3000 }, { t: 3200 }], sr: { streak: 0, interval: 2, due: 0 } });
    const g = algs.add({ alg: "R U' R'", task, name: 'Dobrý' });
    algs.update(g, { times: [{ t: 900 }, { t: 1000 }, { t: 1100 }], sr: { streak: 4, interval: 40, due: 9999 } });
  });
  await p.reload();
  await p.locator('.tabbar [data-tab="trainer"]').tap();
  await p.locator('#tr-open').tap();
  await p.selectOption('#tr-sort', 'weakest');
  const names = await p.locator('#tr-list .alg-name').evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(names, ['Slabý', 'Nový', 'Dobrý']);
  assert.match(await p.locator('#tr-list .mastery').first().innerText(), /k procvičení/);
  await p.locator('#tr-close').tap();
  // jeden pokus: po zastavení se objeví hodnocení a plán se uloží
  await p.evaluate(() => document.querySelector('#tr-pad').focus());
  await p.keyboard.down(' '); await p.waitForTimeout(700); await p.keyboard.up(' ');
  await p.waitForTimeout(400);
  await p.keyboard.down(' '); await p.keyboard.up(' ');
  await p.waitForSelector('.reveal-verdict');
  const trained = await p.evaluate(() => JSON.parse(localStorage.getItem('ergocube.algs')).filter((a) => a.sr?.due > 0 && a.times.length > 0).length);
  assert.ok(trained >= 1);
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('ergocube.trainer.n'))), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('focení: Pyraminx a Skewb – obrys stěny a rozpoznání nahrané fotky', async () => {
  const { p, ctx, errors } = await open('lab');
  // tlačítko focení je u všech hlavolamů kromě Square-1
  for (const [id, cells] of [['pyram', 9], ['skewb', 5], ['222', 4]]) {
    await p.selectOption('#lab-puzzle', id);
    assert.equal(await p.locator('#a-scan').isVisible(), true, id);
    await p.locator('#a-scan').tap();
    await p.waitForSelector('.scan-dialog[open]');
    assert.equal(await p.locator('.scan-outline polygon').count(), cells, id);
    await p.locator('.scan-dialog .scan-head .icon-btn').tap();
  }
  await p.selectOption('#lab-puzzle', 'sq1');
  assert.equal(await p.locator('#a-scan').isVisible(), false);

  // fotka stěny F Pyraminxu: obrys 80 % obrazu, nálepky vybarvené podle indexu
  await p.selectOption('#lab-puzzle', 'pyram');
  await p.locator('#a-scan').tap();
  await p.waitForSelector('.scan-dialog[open]');
  const png = await p.evaluate(async () => {
    const { labModel } = await import('./src/ui/models.js');
    const rgb = { F: '#1ea050', L: '#c82828', R: '#1e5ad2', D: '#f0d214' };
    const letters = ['F', 'L', 'R', 'D', 'F', 'L', 'R', 'D', 'F'];
    const { polys } = labModel('pyram').scan.cells('F');
    const c = document.createElement('canvas');
    c.width = c.height = 500;
    const g = c.getContext('2d');
    g.fillStyle = '#222'; g.fillRect(0, 0, 500, 500);
    polys.forEach((poly, i) => {
      g.fillStyle = rgb[letters[i]];
      g.beginPath();
      poly.forEach(([x, y], k) => (k ? g.lineTo(50 + x * 400, 50 + y * 400) : g.moveTo(50 + x * 400, 50 + y * 400)));
      g.fill();
    });
    return c.toDataURL('image/png').split(',')[1];
  });
  await p.locator('.scan-dialog input[type=file]').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await p.waitForSelector('.scan-result:not([hidden]) polygon');
  const got = await p.locator('.scan-result polygon').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').slice(-1)));
  assert.deepEqual(got, ['F', 'L', 'R', 'D', 'F', 'L', 'R', 'D', 'F']);
  // uložení stěny F: nálepky F-stěny ve výchozí straně mají tyto barvy
  await p.locator('.scan-actions .primary').tap();
  const colors = await p.evaluate(async () => {
    const m = (await import('./src/ui/models.js')).labModel('pyram');
    const spec = m.scan;
    const st = JSON.parse(localStorage.getItem('ergocube.lab.pyram'));
    return spec.cells('F').indices.map((i) => st.colorsA[i]);
  });
  assert.deepEqual(colors, ['F', 'L', 'R', 'D', 'F', 'L', 'R', 'D', 'F']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('držení kostky: po otočení pohledu se algoritmy píšou podle něj a řeší zadání', async () => {
  const { p, ctx, errors } = await open('lab');
  await p.evaluate(async () => {
    const { labModel } = await import('./src/ui/models.js');
    const m = labModel('333');
    const names = ['URF', 'U', 'F', 'R'];
    const home = m.home(names);
    const constraints = Object.fromEntries(m.pieceNames.map((n) => [n, names.includes(n) ? 'solved' : 'ignore']));
    localStorage.setItem('ergocube.v3', JSON.stringify({ constraints, bases: ['R', 'L', 'U', 'D', 'F', 'B'], colorsA: m.applyMoves(home, "R U R'"), colorsB: home }));
  });
  await p.reload();
  // táhnutím otočit kostku (jinak než výchozí natočení)
  await p.evaluate(() => {
    const scene = document.querySelector('#cube-a .cube3d-scene');
    const r = scene.getBoundingClientRect();
    const fire = (type, x, y) => scene.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' }));
    scene.setPointerCapture = () => {};
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    fire('pointerdown', cx, cy);
    for (let i = 1; i <= 20; i++) fire('pointermove', cx, cy - i * 6);   // svisle nahoru
    fire('pointerup', cx, cy - 120);
  });
  await p.locator('#a-hold').tap();
  assert.equal(await p.locator('#hold-note').isVisible(), true);
  const note = await p.locator('#hold-select option:checked').innerText();
  assert.match(note, /nahoře/);
  assert.doesNotMatch(note, /bílá nahoře, zelená vpředu/);
  // hledání v držení: řešení zapsané podle držení musí v přehrávači splnit zadání
  // (bez AUF – „horní vrstva“ držení může případ vyřešit sama, podle toho, kam se kostka otočila)
  await p.evaluate(() => { document.querySelector('#opt-auf').checked = false; });
  await p.locator('#go-search').tap();
  await p.waitForFunction(() => document.querySelectorAll('#results .result').length > 0, null, { timeout: 20000 })
    .catch(async (e) => { throw new Error(`${e.message}: ${await p.locator('#status').innerText()}`); });
  await p.waitForSelector('#detail .verdict');
  const verdict = await p.locator('#detail .verdict').innerText();
  assert.match(verdict, /řeší zadání/);
  assert.doesNotMatch(verdict, /nepovolené/);
  // uložený algoritmus nese držení
  await p.locator('#p-save').tap();
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('ergocube.algs'))[0].task.hold);
  assert.ok(saved && saved.length > 0);
  // zrušení držení vrátí výchozí pohled i zápis
  await p.locator('.segmented button[data-sub="task"]').tap();
  await p.locator('#hold-reset').tap();
  assert.equal(await p.locator('#hold-note').isVisible(), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('timer: 4×4 se míchá z náhodného stavu (jen tahy U D L R F B a Uw Rw Fw)', async () => {
  const { p, ctx, errors } = await open('timer', { 'ergocube.timer': { event: '444' } });
  await p.waitForFunction(() => /[RUFDLB]/.test(document.querySelector('#t-scramble').textContent)
    && !document.querySelector('#t-scramble').classList.contains('loading'), null, { timeout: 40000 });
  const text = (await p.locator('#t-scramble').innerText()).trim();
  const moves = text.split(/\s+/);
  assert.ok(moves.length >= 35 && moves.length <= 80, `${moves.length} tahů`);
  for (const m of moves) assert.match(m, /^(?:[UDLRFB]|[URF]w)[2']?$/, m);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('držení: Pyraminx a Skewb – výběr držení přepíše algoritmy a řeší zadání', async () => {
  const { p, ctx, errors } = await open('lab');
  const scrambles = { pyram: "R U' L", skewb: "R U' L" };
  await p.evaluate(async (scr) => {
    const { labModel } = await import('./src/ui/models.js');
    for (const [id, alg] of Object.entries(scr)) {
      const m = labModel(id);
      const names = m.pieceNames.slice(0, 4);
      const home = m.home(names);
      const constraints = Object.fromEntries(m.pieceNames.map((n) => [n, names.includes(n) ? 'solved' : 'ignore']));
      localStorage.setItem(`ergocube.lab.${id}`, JSON.stringify({
        constraints, colorsA: m.serialize(m.applyMoves(home, alg)), colorsB: m.serialize(home),
      }));
    }
  }, scrambles);
  await p.reload();
  for (const id of ['pyram', 'skewb']) {
    await p.selectOption('#lab-puzzle', id);
    assert.equal(await p.locator('#hold-note').isVisible(), true, id);
    // druhé držení v nabídce (první je výchozí)
    const value = await p.locator('#hold-select option').nth(1).getAttribute('value');
    await p.selectOption('#hold-select', value);
    assert.equal(await p.locator('#hold-reset').isVisible(), true);
    await p.locator('#go-search').tap();
    await p.waitForFunction(() => !document.querySelector('#search').disabled, null, { timeout: 60000 });
    const verdict = await p.locator('#detail .verdict').innerText();
    assert.match(verdict, /řeší zadání/, `${id}: ${await p.locator('#status').innerText()}`);
    assert.doesNotMatch(verdict, /nepovolené/);
    await p.locator('.segmented button[data-sub="task"]').tap();
    await p.locator('#hold-reset').tap();
    assert.equal(await p.locator('#hold-select').inputValue(), '');
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('statistiky: osobní rekordy, porovnání skupin a export CSV', async () => {
  const mk = (times) => times.map((t, i) => ({ t, p: 0, s: `R U R' ${i}`, d: Date.UTC(2026, 0, 1 + i) }));
  const { p, ctx, errors } = await open('stats', {
    'ergocube.timer': { event: '333', inspection: false, groups: {} },
    'ergocube.groups': { 333: [{ id: 'g1', name: 'Moje kostka' }] },
    'ergocube.solves': {
      333: mk([12000, 11000, 13000, 10500, 12500, 11500, 9000, 12000]),
      '333/g1': mk([15000, 14000, 16000, 13500, 15500]),
    },
  });
  // rekordy: single se rozbalí s historií zlepšení
  await p.locator('.pb').first().locator('summary').tap();
  assert.ok(await p.locator('.pb').first().locator('.pb-history li').count() >= 3);
  assert.match(await p.locator('.pb').first().innerText(), /9\.00/);
  // porovnání se skupinou „Moje kostka“: single je u hlavní skupiny lepší
  const row = p.locator('.compare tbody tr', { hasText: 'nejlepší single' });
  assert.match(await row.locator('td').nth(1).innerText(), /9\.00/);
  assert.match(await row.locator('td').nth(2).innerText(), /13\.50/);
  assert.equal(await row.locator('td.win').count(), 1);
  // CSV
  const [download] = await Promise.all([p.waitForEvent('download'), p.locator('#s-csv').tap()]);
  const csv = Buffer.concat(await (await download.createReadStream()).toArray()).toString('utf8').replace(/^﻿/, '');
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 9);
  assert.match(lines[0], /^metoda,disciplína,skupina/);
  assert.match(lines[7], /,9000,,9000,/);
  const [all] = await Promise.all([p.waitForEvent('download'), p.locator('#s-csv-all').tap()]);
  const allCsv = Buffer.concat(await (await all.createReadStream()).toArray()).toString('utf8');
  assert.equal(allCsv.trim().split('\r\n').length, 14);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'bez vodorovného posouvání');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('metody: přepnutí metody odděluje složení i algoritmy a jde je porovnat', async () => {
  const { p, ctx, errors } = await open('timer');
  p.on('dialog', (d) => d.accept('Moje metoda'));
  const solve = async () => {
    await p.waitForFunction(() => !document.querySelector('#t-scramble').classList.contains('loading')
      && /[RUFDLB]/.test(document.querySelector('#t-scramble').textContent), null, { timeout: 15000 });
    await p.keyboard.down('Space'); await p.waitForTimeout(400); await p.keyboard.up('Space');
    await p.waitForTimeout(300);
    await p.keyboard.press('KeyA');
  };
  const count = () => p.locator('#t-mini > div').last().locator('b').innerText();
  await solve();
  await p.waitForFunction(() => document.querySelector('#t-mini > div:last-child b').textContent === '1');
  // nová metoda: timer začne od nuly
  await p.selectOption('#method', '+new');
  assert.equal(await p.locator('#method option:checked').innerText(), 'Moje metoda');
  // nová metoda se rovnou sestavuje (sekce Metoda), timer začne od nuly
  await p.waitForSelector('[data-page="method"]:not([hidden]) .bld-base');
  await p.locator('.tabbar [data-tab="timer"]').tap();
  assert.equal(await count(), '0');
  await solve();
  await solve();
  await p.waitForFunction(() => document.querySelector('#t-mini > div:last-child b').textContent === '2');
  // algoritmus uložený v této metodě patří do její výchozí sady
  await p.evaluate(async () => {
    const { algs } = await import('./src/ui/store.js');
    const { labModel } = await import('./src/ui/models.js');
    const m = labModel('333');
    const home = m.home(['URF']);
    const constraints = Object.fromEntries(m.pieceNames.map((n) => [n, n === 'URF' ? 'solved' : 'ignore']));
    algs.add({ alg: "R U R'", task: { constraints, colorsA: m.applyMoves(home, "R U' R'"), colorsB: home } });
  });
  await p.locator('.tabbar [data-tab="trainer"]').tap();
  await p.waitForFunction(() => !document.querySelector('#tr-cube').hidden);
  // zpět na výchozí metodu: její složení a žádný algoritmus
  const base = await p.locator('#method option').first().getAttribute('value');
  await p.selectOption('#method', base);
  assert.equal(await p.locator('#tr-empty').isVisible(), true);
  await p.locator('.tabbar [data-tab="timer"]').tap();
  assert.equal(await count(), '1');
  // statistiky: porovnání s druhou metodou
  await p.locator('.tabbar [data-tab="stats"]').tap();
  const row = p.locator('.compare tbody tr', { hasText: 'složení' }).first();
  assert.equal(await row.locator('td').nth(1).innerText(), '1');
  assert.equal(await row.locator('td').nth(2).innerText(), '2');
  assert.match(await p.locator('.compare thead').innerText(), /Moje metoda/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('průvodce metodou: kroky s textem a obrázkem z Labu, sdílení a import', async () => {
  const { p, ctx, errors } = await open('lab');
  await p.evaluate(async () => {
    const { labModel } = await import('./src/ui/models.js');
    const { algs } = await import('./src/ui/store.js');
    const m = labModel('333');
    const names = ['URF', 'U', 'F', 'R'];
    const home = m.home(names);
    const constraints = Object.fromEntries(m.pieceNames.map((n) => [n, names.includes(n) ? 'solved' : 'ignore']));
    const task = { constraints, colorsA: m.applyMoves(home, "R U R'"), colorsB: home };
    localStorage.setItem('ergocube.v3', JSON.stringify(task));
    algs.add({ alg: "R U' R'", task, name: 'Vložení' });
  });
  await p.reload();
  await p.selectOption('#method', '+guide');
  await p.waitForSelector('.guide-dialog[open]');
  assert.match(await p.locator('.guide-empty').innerText(), /popsat/);
  // „Upravit“ vede do sekce Metoda → Sestavit
  await p.locator('.guide-edit').tap();
  await p.waitForSelector('[data-page="method"]:not([hidden]) .bld-base');
  assert.equal(await p.locator('.guide-dialog[open]').count(), 0);
  await p.locator('.bld-base textarea').fill('Moje metoda: nejdřív roh, pak zbytek.');
  await p.locator('.bld-add').tap();
  await p.locator('input[aria-label="Název kroku 1"]').fill('Vložení rohu');
  await p.locator('.bld-more summary', { hasText: 'Pokročilé' }).tap();
  await p.locator('textarea[aria-label="Popis kroku 1"]').fill('Roh nad slotem vložíš trojicí tahů.\nDívej se na bílou nálepku.');
  await p.locator('.bld-step button', { hasText: 'Vzít z Labu' }).tap();
  assert.equal(await p.locator('.bld-step .guide-fig').count(), 2);
  await p.locator('.bld-step.open .rule-opt', { hasText: 'Algoritmy – moje sada' }).tap();
  await p.locator('select[aria-label="Sada algoritmů – krok 1"]').selectOption('default');
  assert.match(await p.locator('.bld-step').innerText(), /Když na případ nemám algoritmus/);
  await p.locator('.mp-head button', { hasText: 'Průvodce' }).tap();
  await p.waitForSelector('.guide-dialog[open]');
  assert.match(await p.locator('.guide-step h3').innerText(), /Vložení rohu/);
  assert.doesNotMatch(await p.locator('.guide-body').innerText(), /null|undefined/);
  assert.equal(await p.locator('.guide-step .guide-text br').count(), 1);
  assert.match(await p.locator('.guide-set', { hasText: 'Algoritmy' }).innerText(), /Moje algoritmy \(1\)/);
  await p.waitForFunction(() => document.querySelectorAll('.guide-step .sticker3d').length === 108);
  // sdílení: soubor s průvodcem a algoritmy
  const [download] = await Promise.all([p.waitForEvent('download'), p.locator('.guide-share').tap()]);
  const shared = Buffer.concat(await (await download.createReadStream()).toArray());
  const data = JSON.parse(shared.toString());
  assert.equal(data.format, 'ergocube-method');
  assert.equal(data.guide.steps[0].title, 'Vložení rohu');
  assert.equal(data.algs.length, 1);
  assert.equal(data.algs[0].times, undefined);
  await p.locator('.guide-close').tap();
  // import: vznikne nová metoda „Základní (2)“ s průvodcem i algoritmem
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.selectOption('#method', '+import')]);
  await chooser.setFiles({ name: 'metoda.json', mimeType: 'application/json', buffer: shared });
  await p.waitForSelector('.guide-dialog[open]');
  assert.equal(await p.locator('#method option:checked').innerText(), 'Základní (2)');
  assert.match(await p.locator('.guide-step h3').innerText(), /Vložení rohu/);
  // Trénovat → trenažér se sadou kroku
  await p.locator('.guide-set button', { hasText: 'Trénovat' }).tap();
  await p.waitForFunction(() => !document.querySelector('[data-page="trainer"]').hidden && !document.querySelector('#tr-cube').hidden);
  assert.match(await p.locator('#tr-count').innerText(), /1 z 1/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('metoda: nácvik kroku v timeru, ukázka algoritmu a tisk průvodce', async () => {
  const { p, ctx, errors } = await open('timer');
  await p.evaluate(async () => {
    const { labModel } = await import('./src/ui/models.js');
    const { guides } = await import('./src/ui/store.js');
    const m = labModel('333');
    const cross = ['DF', 'DR', 'DB', 'DL', 'U', 'D', 'F', 'B', 'R', 'L'];
    const home = m.home(cross);
    const constraints = Object.fromEntries(m.pieceNames.map((n) => [n, cross.includes(n) ? 'solved' : 'ignore']));
    const pair = ['URF', 'U', 'F', 'R'];
    const pairHome = m.home(pair);
    const pc = Object.fromEntries(m.pieceNames.map((n) => [n, pair.includes(n) ? 'solved' : 'ignore']));
    guides.set('default', { intro: 'Test', steps: [
      { id: 'k1', title: 'Kříž', text: 'Postav kříž.', task: { constraints, colorsA: m.applyMoves(home, 'F R'), colorsB: home } },
      { id: 'k2', title: 'Páry', text: 'Vlož páry.', task: { constraints: pc, colorsA: m.applyMoves(pairHome, "R U R'"), colorsB: pairHome, alg: "R U' R'" } },
    ] });
  });
  // nácvik 2. kroku: zamíchání nechá kříž hotový
  await p.waitForSelector('#t-step:not([hidden])');
  await p.selectOption('#t-step', 'k2');
  await p.waitForFunction(() => !document.querySelector('#t-scramble').classList.contains('loading')
    && /[RUFDLB]/.test(document.querySelector('#t-scramble').textContent), null, { timeout: 20000 });
  const crossKept = await p.evaluate(async () => {
    const { solved, applyAlg } = await import('./src/core/cube.js');
    const { SLOTS } = await import('./src/core/geometry.js');
    const loc = applyAlg(solved(), document.querySelector('#t-scramble').textContent);
    return SLOTS.filter((s) => ['DF', 'DR', 'DB', 'DL'].includes(s.name)).every((s) => s.facelets.every((k) => loc[k] === k));
  });
  assert.equal(crossKept, true);
  await p.keyboard.down('Space'); await p.waitForTimeout(400); await p.keyboard.up('Space');
  await p.waitForTimeout(300);
  await p.keyboard.press('KeyA');
  await p.waitForFunction(() => document.querySelector('#t-mini > div:last-child b').textContent === '1');
  const keys = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ergocube.solves'))));
  assert.deepEqual(keys, ['333~k2']);
  await p.locator('.tabbar [data-tab="stats"]').tap();
  assert.equal(await p.locator('#s-step').inputValue(), 'k2');
  assert.equal(await p.locator('#s-list li.solve').count(), 1);
  await p.selectOption('#s-step', '');
  assert.equal(await p.locator('#s-list li.solve').count(), 0);
  // průvodce: ukázka algoritmu se přehraje až do konce
  await p.selectOption('#method', '+guide');
  await p.waitForSelector('.guide-player');
  assert.equal(await p.locator('.guide-player .mv').count(), 3);
  await p.locator('.guide-player-head button', { hasText: 'Přehrát' }).tap();
  await p.waitForFunction(() => document.querySelector('.guide-player-head').textContent.includes('Přehrát znovu'), null, { timeout: 10000 });
  assert.equal(await p.locator('.guide-player .mv.current').innerText(), "R'");
  // tisk: zavolá se tisk s tiskovým režimem
  await p.evaluate(() => { window.print = () => { window.printed = document.body.classList.contains('printing-guide'); }; });
  await p.locator('.guide-print').tap();
  await p.waitForFunction(() => window.printed === true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('vlastní metoda: části bez Labu (předvolba), nácvik z průvodce a zastavení dotykem kdekoli', async () => {
  const { p, ctx, errors } = await open('timer', {
    'ergocube.methods': { active: 'mr', list: [{ id: 'mr', name: 'Roux' }] },
    'ergocube.guides': { mr: { intro: '', steps: [{ id: 'b1', title: 'První blok', text: '' }, { id: 'b2', title: 'Druhý blok', text: '' }] } },
  });
  await p.waitForSelector('#t-practice:not([hidden])');
  // z timeru (nastavit kroky) do sestavení metody
  await p.evaluate(async () => (await import('./src/ui/methods.js')).showGuide({ edit: true }));
  await p.waitForSelector('[data-page="method"]:not([hidden]) .bld-tl-item');
  // první krok: levý blok Roux (bílá dole, zelená vpředu)
  await p.locator('.bld-tl-item').first().tap();
  await p.locator('.bld-step.open select[aria-label="Přidat předvolbu"]').selectOption('roux1');
  assert.match(await p.locator('.bld-tl-item.active small').innerText(), /5 hotových dílků/);
  assert.match(await p.locator('.bld-step.open .cell-overview').textContent(), /2× roh jeho vlastní dílek, správně natočený[\s\S]*3× hrana jeho vlastní dílek/);
  // druhý krok: pravý blok na kterémkoli boku
  await p.locator('.bld-ed-arrows button[aria-label="Další krok"]').tap();
  await p.locator('.bld-step.open').last().locator('select[aria-label="Přidat předvolbu"]').selectOption('roux2');
  await p.locator('.bld-step.open').last().locator('select[aria-label="Kde smí být – krok 2"]').selectOption('side');
  assert.match(await p.locator('.bld-step.open').last().locator('.bld-places').innerText(), /možných míst \(4\)/);
  const sim = await p.evaluate(() => JSON.parse(localStorage.getItem('ergocube.guides')).mr.steps[1].sim);
  assert.equal(sim.free, 'side');
  await p.locator('.mp-head button', { hasText: 'Průvodce' }).tap();
  await p.waitForSelector('.guide-dialog[open]');
  await p.locator('.guide-practice').nth(1).tap();
  assert.equal(await p.locator('#t-step').inputValue(), 'b2');
  assert.match(await p.locator('#t-step-info').innerText(), /5 hotových/);
  await p.waitForFunction(() => !document.querySelector('#t-scramble').classList.contains('loading')
    && /[RUFDLB]/.test(document.querySelector('#t-scramble').textContent), null, { timeout: 20000 });
  const kept = await p.evaluate(async () => {
    const { solved, applyAlg } = await import('./src/core/cube.js');
    const { SLOTS } = await import('./src/core/geometry.js');
    const { presetParts } = await import('./src/ui/parts.js');
    const names = Object.keys(presetParts('roux1', { down: 'U', front: 'F' }));
    const loc = applyAlg(solved(), document.querySelector('#t-scramble').textContent);
    return names.length === 5 && SLOTS.filter((s) => names.includes(s.name)).every((s) => s.facelets.every((k) => loc[k] === k));
  });
  assert.equal(kept, true);
  // start mezerníkem, zastavení dotykem na místě výběru kroku (je schovaný)
  await p.keyboard.down('Space'); await p.waitForTimeout(400); await p.keyboard.up('Space');
  await p.waitForTimeout(300);
  const bb = await p.locator('#t-practice').boundingBox();
  await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.waitForFunction(() => document.querySelector('#t-mini > div:last-child b').textContent === '1');
  const keys = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ergocube.solves'))));
  assert.deepEqual(keys, ['333@mr~b2']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('lab: zadání šipkami (3-cyklus hran nahoře) najde a ověří řešení', async () => {
  const { p, ctx, errors } = await open('lab');
  await p.locator('#task-mode [data-mode="arrows"]').tap();
  const ref = await p.evaluate(async () => { const { CUBE3 } = await import('./src/puzzles/cube3.js'); return Object.fromEntries(['UF', 'UR', 'UL'].map((n) => [n, CUBE3.slotByName(n).facelets[0]])); });
  const tap = async (pos) => { const bb = await p.locator(`#cube-arrows [data-pos="${pos}"]`).boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
  await tap(ref.UF); await tap(ref.UR);
  assert.match(await p.locator('#task-status').innerText(), /přidej šipku i pro něj/);
  await tap(ref.UR); await tap(ref.UL);
  await tap(ref.UL); await tap(ref.UF);
  assert.equal(await p.locator('#arrow-list li').count(), 3);
  assert.match(await p.locator('#task-status').innerText(), /✓ 20 dílků/);
  await p.evaluate(() => { document.querySelector('#opt-time').value = '5'; });
  await p.locator('#go-search').tap();
  await p.waitForFunction(() => !document.querySelector('#search').disabled, null, { timeout: 60000 });
  assert.match(await p.locator('#detail .verdict').innerText(), /řeší zadání/);
  // zpět na barvy: původní zadání se obnoví
  await p.locator('.segmented button[data-sub="task"]').tap();
  await p.locator('#task-mode [data-mode="colors"]').tap();
  assert.ok(await p.locator('#arrows-panel').isHidden());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('lab: šipky – prohození dvou hran potřebuje volné rohy (parita)', async () => {
  const { p, ctx, errors } = await open('lab');
  await p.locator('#task-mode [data-mode="arrows"]').tap();
  const ref = await p.evaluate(async () => {
    const { CUBE3 } = await import('./src/puzzles/cube3.js');
    return Object.fromEntries(['UF', 'UR', 'URF', 'UBR'].map((n) => [n, CUBE3.slotByName(n).facelets[0]]));
  });
  const tap = async (pos) => { const bb = await p.locator(`#cube-arrows [data-pos="${pos}"]`).boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
  await tap(ref.UF); await tap(ref.UR);
  await tap(ref.UR); await tap(ref.UF);
  assert.match(await p.locator('#task-status').innerText(), /lichá permutace/);
  // dva rohy nahoře se smí hýbat ve vrstvě
  await p.locator('#arrow-tools button', { hasText: 'Ve vrstvě' }).tap();
  await tap(ref.URF); await tap(ref.UBR);
  assert.match(await p.locator('#task-status').innerText(), /✓/);
  assert.equal(await p.locator('#cube-arrows [data-pos="' + ref.URF + '"]').getAttribute('data-style'), 'dashed');
  // stránka se v režimu šipek smí posouvat
  assert.equal(await p.evaluate(() => document.body.classList.contains('lock')), false);
  await p.evaluate(() => { document.querySelector('#opt-time').value = '8'; });
  await p.locator('#go-search').tap();
  await p.waitForFunction(() => !document.querySelector('#search').disabled, null, { timeout: 60000 });
  assert.match(await p.locator('#detail .verdict').innerText(), /řeší zadání/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('lab: styl jen jedné nálepky a střed vždy plně', async () => {
  const { p, ctx, errors } = await open('lab');
  // hrana UF v cíli plně, pak jen přední nálepka tečkovaně
  await paintColor(p, 'b', 'Bílá');
  await tapSticker(p, 'cube-b', 7);
  await paintColor(p, 'b', 'Zelená');
  await tapSticker(p, 'cube-b', 19);
  await p.locator('#styles button', { hasText: 'Tečkovaná' }).tap();
  await tapSticker(p, 'cube-b', 19);
  assert.equal(await p.locator('#cube-b [data-pos="19"]').getAttribute('data-style'), 'dotted');
  assert.equal(await p.locator('#cube-b [data-pos="7"]').getAttribute('data-style'), 'solid');
  // střed se tečkovaným nástrojem neztečkuje
  await tapSticker(p, 'cube-b', 22);
  assert.notEqual(await p.locator('#cube-b [data-pos="22"]').getAttribute('data-style'), 'dotted');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('lab: úprava nalezeného algoritmu klepáním a přidání do výsledků', async () => {
  const { p, ctx, errors } = await open('lab');
  await paintColor(p, 'b', 'Bílá');
  await tapSticker(p, 'cube-b', 8);
  await paintColor(p, 'b', 'Zelená');
  await tapSticker(p, 'cube-b', 20);
  await paintColor(p, 'b', 'Červená');
  await tapSticker(p, 'cube-b', 9);
  await paintColor(p, 'a', 'Červená');
  await tapSticker(p, 'cube-a', 8);
  await paintColor(p, 'a', 'Zelená');
  await tapSticker(p, 'cube-a', 9);
  await paintColor(p, 'a', 'Bílá');
  await tapSticker(p, 'cube-a', 20);
  await p.evaluate(() => { document.querySelector('#opt-time').value = '3'; });
  await p.locator('#go-search').tap();
  await p.waitForFunction(() => !document.querySelector('#search').disabled, null, { timeout: 30000 });
  const original = await p.locator('#alg').inputValue();
  const total = async () => Number((await p.locator('#detail .view-ranks').innerText()).match(/z (\d+)/)[1]);
  const count = await total();
  await p.locator('#detail .edit-actions button', { hasText: 'Upravit' }).tap();
  // smazat první tah → neřeší
  await p.locator('#detail .moves button').first().tap();
  await p.locator('#detail .edit-tools [title="Smazat tah"]').tap();
  assert.match(await p.locator('#detail .verdict').innerText(), /neřeší/);
  await p.locator('#detail .edit-actions button', { hasText: 'Původní' }).tap();
  assert.equal(await p.locator('#alg').inputValue(), original);
  // vložit na začátek R a R' → pořád řeší, jde přidat do výsledků (úpravy zůstávají zapnuté)
  await p.locator('#detail .edit-tools.insert [title="Vložit R"]').tap();
  await p.locator('#detail .edit-tools.insert [title="Vložit R"]').tap();
  await p.locator('#detail .edit-tools [title="Opačný směr"]').tap();
  assert.match(await p.locator('#alg').inputValue(), /^R R' /);
  assert.match(await p.locator('#detail .verdict').innerText(), /✓ řeší/);
  await p.locator('#detail .edit-actions button', { hasText: 'Přidat do výsledků' }).tap();
  assert.equal(await total(), count + 1);
  assert.equal(await p.locator('#detail .edit-actions button', { hasText: 'Přidat' }).count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('trenažér: úprava uloženého algoritmu – smazání úvodního U posune případ', async () => {
  const { p, ctx, errors } = await open('lab');
  await p.evaluate(async () => {
    const { labModel } = await import('./src/ui/models.js');
    const { algs } = await import('./src/ui/store.js');
    const m = labModel('333');
    const home = m.home(m.pieceNames);
    const constraints = Object.fromEntries(m.pieceNames.map((n) => [n, 'solved']));
    // Sune s úvodním U: výchozí stav = inverze celého algoritmu
    const task = { puzzle: '333', constraints, colorsA: m.applyMoves(home, m.invertAlg("U R U R' U R U2 R'")), colorsB: home };
    algs.add({ alg: "U R U R' U R U2 R'", task, name: 'Sune s U' });
  });
  await p.reload();
  await p.locator('.tabbar [data-tab="trainer"]').tap();
  await p.locator('#tr-open').tap();
  await p.locator('#tr-list [aria-label="Upravit algoritmus"]').tap();
  assert.match(await p.locator('.alg-editor .hint').innerText(), /řeší uložený případ/);
  await p.locator('.alg-editor button', { hasText: 'Smazat úvodní U' }).tap();
  assert.equal(await p.locator('.alg-edit').inputValue(), "R U R' U R U2 R'");
  assert.match(await p.locator('.alg-editor .hint').innerText(), /natočí o U/);
  await p.locator('.alg-editor button', { hasText: 'Uložit' }).tap();
  const ok = await p.evaluate(async () => {
    const { retarget } = await import('./src/ui/algedit.js');
    const a = JSON.parse(localStorage.getItem('ergocube.algs'))[0];
    const r = retarget(a, a.alg);
    return [a.alg, r.ok, r.pre];
  });
  assert.deepEqual(ok, ["R U R' U R U2 R'", true, null]);
  assert.equal(await p.locator('.alg-editor').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('sdílení odkazem: sada algoritmů a případ v Labu', async () => {
  const { p, ctx, errors } = await open('trainer');
  const [algsUrl, taskUrl] = await p.evaluate(async () => {
    const { labModel } = await import('./src/ui/models.js');
    const { shareUrl, algsPayload, packTask } = await import('./src/ui/share.js');
    const m = labModel('333');
    const home = m.home(m.pieceNames);
    const constraints = Object.fromEntries(m.pieceNames.map((n) => [n, 'solved']));
    const task = (alg) => ({ puzzle: '333', constraints, colorsA: m.applyMoves(home, m.invertAlg(alg)), colorsB: home });
    const list = [['Sune', "R U R' U R U2 R'"], ['T-perm', "R U R' U' R' F R2 U' R' U' R U R' F'"]].map(([name, alg]) => ({ name, alg, task: task(alg) }));
    return [await shareUrl(algsPayload(list, 'Moje OLL')), await shareUrl({ v: 1, kind: 'task', task: packTask(task("R U R' U'")) })];
  });
  assert.ok(algsUrl.length < 1200, `odkaz je krátký (${algsUrl.length})`);
  await ctx.close();
  // příjemce: jiný prohlížeč bez dat
  const b = await open('timer');
  await b.p.goto(algsUrl);
  await b.p.waitForSelector('.share-dialog[open]');
  assert.match(await b.p.locator('.share-dialog').innerText(), /Moje OLL[\s\S]*Sune[\s\S]*T-perm/);
  await b.p.locator('.share-dialog button[value="add"]').tap();
  await b.p.waitForFunction(() => !document.querySelector('[data-page="trainer"]').hidden);
  const got = await b.p.evaluate(() => JSON.parse(localStorage.getItem('ergocube.algs')).map((a) => a.name));
  assert.deepEqual(got, ['Sune', 'T-perm']);
  assert.match(await b.p.locator('#tr-set option:checked').innerText(), /Moje OLL/);
  // případ: otevře se v Labu
  await b.p.goto(taskUrl);
  await b.p.waitForFunction(() => !document.querySelector('[data-page="lab"]').hidden);
  assert.match(await b.p.locator('#task-status').innerText(), /✓ 20 dílků/);
  assert.deepEqual([...errors, ...b.errors], []);
  await b.ctx.close();
});

test('simulace soutěže: kolo Ao5 s inspekcí, výsledek a přehled kol', async () => {
  const { p, ctx, errors } = await open('timer');
  await p.waitForFunction(() => !document.querySelector('#t-scramble').classList.contains('loading'), null, { timeout: 15000 });
  await p.locator('#t-comp').tap();
  await p.locator('.round-dialog input').last().fill('10');
  await p.locator('.round-dialog button[value="start"]').tap();
  await p.waitForFunction(() => !document.querySelector('.round-dialog'));
  assert.match(await p.locator('#t-round').innerText(), /Average of 5[\s\S]*Pokus 1 z 5/);
  for (let i = 0; i < 5; i++) {
    if (i === 4) assert.match(await p.locator('#t-round .round-extra').innerText(), /BPA .* WPA .* cíl 10\.00 máš jistý/);
    await p.keyboard.down('Space'); await p.keyboard.up('Space');             // inspekce
    await p.waitForFunction(() => document.querySelector('#t-pad').dataset.state === 'inspecting');
    await p.keyboard.down('Space'); await p.waitForTimeout(400); await p.keyboard.up('Space'); // start
    await p.waitForTimeout(150 + i * 40);
    await p.keyboard.press('KeyA');                                            // stop
    await p.waitForFunction(() => document.querySelector('#t-pad').dataset.state === 'idle');
    await p.waitForFunction(() => !document.querySelector('#t-scramble').classList.contains('loading'), null, { timeout: 15000 });
  }
  await p.waitForSelector('.round-result[open]');
  assert.match(await p.locator('.round-result').innerText(), /Průměr[\s\S]*Nejlepší kolo[\s\S]*Cíl 10\.00 splněn/);
  await p.locator('.round-result button[value="close"]').tap();
  assert.equal(await p.locator('#t-round').isVisible(), false);
  await p.locator('.tabbar [data-tab="stats"]').tap();
  assert.equal(await p.locator('#s-rounds .round-row').count(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('trenažér: rozpoznání případu – výběr z možností, správně/špatně a statistiky', async () => {
  const { p, ctx, errors } = await open('trainer');
  await p.evaluate(async () => {
    const { labModel } = await import('./src/ui/models.js');
    const { algs } = await import('./src/ui/store.js');
    const m = labModel('333');
    const home = m.home(m.pieceNames);
    const constraints = Object.fromEntries(m.pieceNames.map((n) => [n, 'solved']));
    for (const [name, alg] of [['Sune', "R U R' U R U2 R'"], ['Antisune', "R U2 R' U' R U' R'"], ['T-perm', "R U R' U' R' F R2 U' R' U' R U R' F'"]]) {
      algs.add({ alg, task: { puzzle: '333', constraints, colorsA: m.applyMoves(home, m.invertAlg(alg)), colorsB: home }, name });
    }
  });
  await p.reload();
  await p.locator('#tr-mode [data-mode="recog"]').tap();
  await p.waitForSelector('.recog-opt');
  assert.equal(await p.locator('.recog-opt').count(), 3);
  // první možnost: správná se zvýrazní zeleně, statistika se uloží (správně i špatně)
  await p.locator('.recog-opt').first().tap();
  await p.waitForFunction(() => document.querySelector('.recog-opt.right'));
  const ok = await p.locator('.recog-opt').first().evaluate((b) => b.classList.contains('right'));
  const stats = await p.evaluate(() => JSON.parse(localStorage.getItem('ergocube.algs')).map((a) => a.recog).filter(Boolean));
  assert.equal(stats.length, 1);
  assert.equal(stats[0].n, 1);
  assert.equal(stats[0].ok, ok ? 1 : 0);
  if (!ok) await p.locator('.recog > .primary').tap();
  await p.waitForFunction(() => document.querySelectorAll('.recog-opt:not(:disabled)').length === 3, null, { timeout: 5000 });
  // klávesnicí
  await p.keyboard.press('2');
  await p.waitForFunction(() => document.querySelector('.recog-opt.right'));
  assert.match(await p.locator('.recog .reveal-stats').innerText(), /celkem \d+ % správně/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('generátor sady: EPBL – 14 případů bez parity, výběr co uložit, ověření ⟨M, U, D⟩', async () => {
  const { p, ctx, errors } = await open('lab');
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
  assert.match(await p.locator('.gen-status').innerText(), /288 stavů → 14 případů .*· 15 paritních vynecháno \(opraví M2 U2 M2\)/);
  assert.equal(await p.locator('.gen-card').count(), 14);
  // jen první tři případy
  const boxes = p.locator('.gen-card-head input');
  for (let i = 3; i < 14; i++) await boxes.nth(i).uncheck();
  await p.locator('.gen-dialog button', { hasText: 'Generovat' }).tap();
  await p.waitForFunction(() => /Hotovo/.test(document.querySelector('.gen-status').textContent), null, { timeout: 90000 });
  const outs = await p.locator('.gen-card .gen-out').allInnerTexts();
  assert.equal(outs.slice(0, 3).filter((t) => /✓ \d/.test(t)).length, 3, outs.slice(0, 3).join(' | '));
  // nic se neukládá samo: vybíráš, co uložit
  assert.equal(await p.evaluate(() => (JSON.parse(localStorage.getItem('ergocube.algs') ?? '[]')).length), 0);
  assert.equal(await p.locator('.gen-seg.ok').count(), 3);
  const saveBtn = p.locator('.gen-save button', { hasText: 'Uložit vybrané' });
  assert.match(await saveBtn.innerText(), /\(4\)/); // 3 nabídnuté + oprava parity
  // varianty jsou sbalené; rozbalit jde vždy jen jeden případ
  await p.locator('.gen-card').nth(1).locator('.gen-alt summary').tap();
  await p.locator('.gen-card').first().locator('.gen-alt summary').tap();
  assert.equal(await p.locator('.gen-alt[open]').count(), 1);
  // u prvního případu přidat k uložení i druhou variantu
  const choices = p.locator('.gen-card').first().locator('.gen-choice');
  assert.ok(await choices.count() > 1);
  await choices.nth(1).locator('input').check();
  const other = await choices.nth(1).locator('code').innerText();
  assert.equal(await p.locator('.gen-card').first().locator('.gen-chosen').count(), 2);
  assert.match(await saveBtn.innerText(), /\(5\)/);
  // volba jiného než nabídnutého se zapíše (kalibrace „Podle mých voleb“)
  const prefs = await p.evaluate(() => JSON.parse(localStorage.getItem('ergocube.prefs')));
  assert.equal(prefs.length, 1);
  assert.equal(prefs[0].better, other);
  // třetí případ celý vynechat
  await p.locator('.gen-card').nth(2).locator('.gen-card-head input').uncheck();
  assert.match(await saveBtn.innerText(), /\(4\)/);
  await saveBtn.tap();
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('ergocube.algs')).map((a) => a.alg));
  assert.equal(saved.length, 4); // 1. případ 2×, 2. případ, oprava parity
  assert.ok(saved.includes(other));
  assert.equal(saved.at(-1), 'M2 U2 M2');
  assert.ok(saved.every((a) => /^[MUD2' ()]+$/.test(a)), saved.join(' | '));
  // hledat déle: naváže na nalezená řešení, vybrané zůstanou
  await p.locator('.gen-card').first().locator('.gen-more').tap();
  await p.waitForFunction(() => /Případ 1:/.test(document.querySelector('.gen-status').textContent), null, { timeout: 60000 });
  assert.ok(await p.locator('.gen-card').first().locator('.gen-chosen').count() >= 2);
  await p.locator('.gen-dialog button', { hasText: 'Otevřít sadu' }).tap();
  await p.waitForFunction(() => !document.querySelector('[data-page="trainer"]').hidden);
  assert.match(await p.locator('#tr-set option:checked').innerText(), /EPBL/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('generátor sady: noční běh do dokázání, uložený rozpracovaný běh a navázání', async () => {
  const { p, ctx, errors } = await open('lab');
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
    localStorage.setItem('ergocube.lab.generator', JSON.stringify({ auf: true, adf: true, y: true, z2: true, wy: false, par: true, fix: 'M2 U2 M2', name: 'EPBL', time: 2, view: 'balanced', mode: 'h1' }));
    // rozpracovaný běh s jiným zadáním: jen upozornění, navázat nejde
    localStorage.setItem('ergocube.gen.job', JSON.stringify({ key: 'jiné', name: 'Starý', mode: 'h1', started: Date.now() - 3600e3, total: 9, proven: 4, done: false }));
  });
  await p.reload();
  await p.locator('#gen-set').tap();
  const banner = p.locator('.gen-resume');
  assert.match(await banner.innerText(), /Rozpracované generování „Starý“[\s\S]*dokázáno 4 z 9[\s\S]*stejné zadání/);
  assert.equal(await banner.locator('button', { hasText: 'Pokračovat' }).isVisible(), false);
  await banner.locator('button', { hasText: 'Zahodit' }).tap();
  assert.equal(await banner.isVisible(), false);
  assert.equal(await p.locator('.gen-dialog select[aria-label="Délka běhu"]').inputValue(), 'h1');
  await p.locator('.gen-dialog button', { hasText: 'Spočítat případy' }).tap();
  await p.waitForFunction(() => /případů/.test(document.querySelector('.gen-status').textContent));
  const boxes = p.locator('.gen-card-head input');
  const n = await boxes.count();
  for (let i = 2; i < n; i++) await boxes.nth(i).uncheck();
  await p.locator('.gen-dialog button', { hasText: 'Generovat' }).tap();
  // rozpracovaný běh je uložený hned (po zavření jde navázat)
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('ergocube.gen.job'))?.name === 'EPBL');
  // další kola hledají nedokázané případy, dokud nejsou dokázané
  await p.waitForFunction(() => /Hotovo/.test(document.querySelector('.gen-status').textContent), null, { timeout: 150000 });
  assert.match(await p.locator('.gen-status').innerText(), /Hotovo: 2 ověřených \(2 dokázaně nejpohodlnějších\)/);
  assert.equal(await p.locator('.gen-seg.proof').count(), 2);
  const job = await p.evaluate(() => JSON.parse(localStorage.getItem('ergocube.gen.job')));
  assert.equal(job.done, true);
  assert.equal(job.proven, 2);
  assert.doesNotMatch(await p.title(), /^\(/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('simulátor metody: nastavení kroků, souběžné skládání, navázání a porovnání se vestavěnými metodami', async () => {
  const guides = { default: { intro: '', steps: [
    { id: 'k1', title: 'Hrana vpředu', text: '', parts: { DF: 'solved' } },
    { id: 'k2', title: 'Hrana vpravo', text: '', parts: { DR: 'solved' } },
  ] } };
  const opts = { length: 'c10', steps: { default: { k1: { time: 1 }, k2: { time: 1 } } } };
  const { p, ctx, errors } = await open('timer', { 'ergocube.guides': guides, 'ergocube.sim.options': opts });
  // z průvodce metodou tlačítko Otestovat přepne na sekci Metoda → Otestovat
  await p.selectOption('#method', '+guide');
  await p.waitForSelector('.guide-dialog[open]');
  await p.locator('.guide-sim').tap();
  await p.waitForSelector('[data-page="method"]:not([hidden]) .sim-setup');
  assert.equal(await p.locator('.guide-dialog[open]').count(), 0);
  await p.locator('.sim-steps-box summary').tap();
  assert.equal(await p.locator('.sim-step').count(), 2);
  assert.match(await p.locator('.sim-step').first().innerText(), /Hrana vpředu[\s\S]*1 hotov/);
  // nastavení kroků je v Sestavit: volnost „jen vybrané barvy“ (bílá nebo žlutá dole) a vlastní tahy
  await p.locator('.sim-steps-box button', { hasText: 'Upravit kroky' }).tap();
  await p.locator('.bld-tl-item').first().tap();
  await p.locator('.bld-step.open select[aria-label="Kde smí být – krok 1"]').selectOption('colors');
  assert.equal(await p.locator('.bld-step.open .sim-colors').first().locator('input:checked').count(), 2);
  assert.match(await p.locator('.bld-step.open .bld-places').innerText(), /možných míst \(8\)/);
  await p.locator('.bld-step.open select[aria-label="Tahy – krok 1"]').selectOption('custom');
  assert.ok(await p.locator('.sim-chips label').count() > 6);
  await p.locator('.mp-tabs button', { hasText: 'Otestovat' }).tap();
  assert.match(await p.locator('.sim-step').first().textContent(), /vybrané barvy \(8 míst\)/);
  // porovnání vestavěných metod je vidět hned
  assert.match(await p.locator('.sim-cmp-table').innerText(), /CFOP/);
  await p.locator('.sim-page button', { hasText: 'Spustit test' }).tap();
  await p.waitForFunction(() => /Hotovo: 10 zamíchání/.test(document.querySelector('.sim-status')?.textContent), null, { timeout: 120000 });
  assert.match(await p.locator('.sim-hero').innerText(), /Průměr na složení[\s\S]*\d+,\d tahů[\s\S]*Odhad času/i);
  assert.equal(await p.locator('.sim-res-row').count(), 2);
  assert.ok(await p.locator('.sim-res-row.worst').count() >= 1);
  const hist = await p.evaluate(() => JSON.parse(localStorage.getItem('ergocube.sim.history')));
  assert.equal(hist.length, 1);
  assert.equal(hist[0].n, 10);
  // vpravo tvoje simulace, vlevo vestavěná metoda
  assert.match(await p.locator('.sim-cmp-pick.mine select option:checked').innerText(), /Základní/);
  assert.match(await p.locator('.sim-cmp-total').innerText(), /[−+]\d+,\d+ s \([−+]\d+ %\)[\s\S]*tahy člověka/);
  assert.equal(await p.locator('.sim-cmp-col').count(), 2);
  await p.locator('.sim-example summary', { hasText: 'Ukázková složení' }).tap();
  assert.match(await p.locator('.sim-example').first().innerText(), /Zamíchání[\s\S]*Hrana vpravo:/);
  // jinam a zpět: poslední běh jde doplnit dalšími zamícháními (stejné semínko)
  await p.locator('.tabbar [data-tab="timer"]').tap();
  await p.locator('.tabbar [data-tab="method"]').tap();
  assert.match(await p.locator('.sim-page .gen-resume').innerText(), /Poslední simulace[\s\S]*10 zamíchání/);
  await p.locator('.sim-page .gen-resume button', { hasText: 'Přidat zamíchání' }).tap();
  await p.waitForFunction(() => /Hotovo: 20 zamíchání/.test(document.querySelector('.sim-status')?.textContent), null, { timeout: 120000 });
  // učebnice metody: HTML s kroky, nastavením a daty k importu
  const html = await p.evaluate(async () => (await import('./src/ui/learnexport.js')).learningHtml());
  assert.match(html, /Hrana vpředu[\s\S]*dole bílá \/ žlutá/);
  assert.match(html, /<svg[\s\S]*id="ergocube-method"/);
  const imported = await p.evaluate(async () => {
    const { learningHtml } = await import('./src/ui/learnexport.js');
    const { importMethod, guides } = await import('./src/ui/store.js');
    const doc = new DOMParser().parseFromString(learningHtml(), 'text/html');
    const id = importMethod(JSON.parse(doc.getElementById('ergocube-method').textContent));
    const steps = guides.get(id).steps;
    return { n: steps.length, free: steps[0].sim?.free };
  });
  assert.deepEqual(imported, { n: 2, free: 'colors' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('sestavení metody: šablona separační metody, pravidla pro skupiny dílků a test čte kroky', async () => {
  const { p, ctx, errors } = await open('timer');
  await p.locator('.tabbar [data-tab="method"]').tap();
  await p.locator('.mp-tabs button', { hasText: 'Sestavit' }).tap();
  await p.locator('.bld-tpl').selectOption('separation');
  await p.waitForFunction(() => document.querySelectorAll('.bld-tl-item').length === 10);
  assert.equal(await p.locator('#method option:checked').innerText(), 'Separační metoda');
  // kříž: nálepky dole na 4 hranách bílá nebo žlutá, boky šedé (na barvě nezáleží)
  await p.locator('.bld-tl-item').first().tap();
  const say = () => p.locator('.bld-step.open .cell-overview').textContent();
  assert.match(await say(), /4× hrana dole bílá nebo žlutá, jinde jakákoli barva/);
  // barvení nálepek: jen bílá na spodní nálepky 4 hran (kříž jen z bílých hran)
  const ks = await p.evaluate(async () => {
    const { FACELETS, SLOT_OF, SLOTS } = await import('./src/core/geometry.js');
    return ['UF', 'UR', 'UB', 'UL'].map((n) => FACELETS.find((f) => f.face === 'U' && SLOTS[SLOT_OF[f.index]].name === n).index);
  });
  await p.locator('.bld-step.open .cell-swatch[data-color="U"]').tap();
  for (const k of ks) await p.locator(`.bld-step.open .cell-net [data-k="${k}"]`).tap();
  assert.match(await say(), /4× hrana dole bílá, jinde jakákoli barva/);
  const cells = await p.evaluate(() => { const g = JSON.parse(localStorage.getItem('ergocube.guides')); return Object.values(g).at(-1).steps[0].cells; });
  assert.ok(Object.values(cells).every((c) => JSON.stringify(c) === '{"colors":{"U":["U"]}}'));
  // klepnutí znovu stejnou barvou = zpět (šedá)
  await p.locator(`.bld-step.open .cell-net [data-k="${ks[0]}"]`).tap();
  assert.match(await say(), /3× hrana dole bílá/);
  // víc barev na nálepce: bílá nebo žlutá
  await p.locator('.bld-step.open .cell-swatch[data-color="D"]').tap();
  for (const k of ks) await p.locator(`.bld-step.open .cell-net [data-k="${k}"]`).tap();
  assert.match(await say(), /4× hrana dole bílá nebo žlutá, jinde jakákoli barva/);
  // pokročilé: výběr míst, vlastní dílek a zpět na skupinu „tou barvou dolů“
  await p.locator('.bld-step.open .cell-adv', { hasText: 'Pokročilé' }).tap();
  await p.locator('.bld-step.open .cell-quick button', { hasText: 'Hrany dole' }).tap();
  assert.match(await p.locator('.bld-step.open .cell-panel-title').innerText(), /Vybráno: 4 místa/);
  await p.locator('.bld-step.open .rule-opt', { hasText: 'Jeho vlastní dílek' }).tap();
  assert.match(await say(), /4× hrana jeho vlastní dílek, správně natočený/);
  await p.locator('.bld-step.open .rule-opt', { hasText: 'Některý z vybraných dílků' }).tap();
  await p.locator('.bld-step.open .rule-opt', { hasText: 'na určitou stranu' }).tap();
  assert.match(await say(), /4× hrana kterákoli hrana s bílou nebo žlutou barvou, tou barvou dolů/);
  await p.locator('.bld-step.open .cell-adv', { hasText: 'Zpět' }).tap();
  assert.equal(await p.locator('.bld-step.open .cell-palette').count(), 1);
  // test metody vidí všech 10 kroků i s pravidly
  await p.locator('.mp-tabs button', { hasText: 'Otestovat' }).tap();
  assert.equal(await p.locator('.sim-step').count(), 10);
  assert.match(await p.locator('.sim-step').nth(5).textContent(), /OLL[\s\S]*16 dílků s barvami/);
  // nácvik kroku po kříži z pravidla: zamíchání vznikne složením kříže podle metody
  await p.evaluate(async () => {
    const { guides } = await import('./src/ui/store.js');
    const { practiceStep } = await import('./src/ui/timer.js');
    practiceStep(guides.get().steps[1].id);
  });
  await p.locator('.tabbar [data-tab="timer"]').tap();
  assert.match(await p.locator('#t-step-info').innerText(), /předem: kroky 1–1 složené podle metody/);
  await p.waitForFunction(() => !document.querySelector('#t-scramble').classList.contains('loading')
    && /[RUFDLB]/.test(document.querySelector('#t-scramble').textContent), null, { timeout: 90000 });
  const crossOk = await p.evaluate(async () => {
    const { solved, applyAlg } = await import('./src/core/cube.js');
    const { compileCells } = await import('./src/core/cells.js');
    const { compileGoal } = await import('./src/core/constraints.js');
    const { guides } = await import('./src/ui/store.js');
    const loc = applyAlg(solved(), document.querySelector('#t-scramble').textContent);
    return compileGoal(compileCells(guides.get().steps[0].cells)).test(loc);
  });
  assert.equal(crossOk, true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('algoritmy kroku z testu: „Vytvořit algoritmy pro tento krok“ spustí test a řešení uloží jako sadu kroku', async () => {
  const guides = { default: { intro: '', steps: [
    { id: 'k1', title: 'Hrana vpředu', text: '', cells: { DF: { own: 'solved' } } },
    { id: 'k2', title: 'Hrana vpravo', text: '', cells: { DR: { own: 'solved' } } },
  ] } };
  const opts = { length: 'c10', steps: { default: { k1: { time: 0.5 }, k2: { time: 0.5 } } } };
  const { p, ctx, errors } = await open('timer', { 'ergocube.guides': guides, 'ergocube.sim.options': opts, 'ergocube.method.sub': 'build' });
  await p.locator('.tabbar [data-tab="method"]').tap();
  await p.locator('.bld-tl-item').nth(1).tap();
  // barvení: celý dílek správnou barvou = hotový roh, klepnutí znovu = zpět
  const tap = () => p.locator('.bld-step.open .cell-net [data-slot="URF"]').first().tap();
  const say = () => p.locator('.bld-step.open .cell-overview').textContent();
  await p.locator('.bld-step.open .cell-kinds button', { hasText: 'celý dílek' }).tap();
  await tap();
  assert.match(await say(), /1× roh jeho vlastní dílek, správně natočený/);
  await tap();
  assert.doesNotMatch(await say(), /roh/);
  // bílá nebo žlutá na celou spodní stranu (klepnutí na střed), znovu = zpět
  await p.locator('.bld-step.open .cell-swatch[data-color="U"]').tap();
  await p.locator('.bld-step.open .cell-swatch[data-color="D"]').tap();
  await p.locator('.bld-step.open .cell-net [data-center="U"]').tap();
  assert.match(await say(), /4× roh dole bílá nebo žlutá, jinde jakákoli barva/);
  await p.locator('.bld-step.open .cell-net [data-center="U"]').tap();
  assert.doesNotMatch(await say(), /roh/);
  // okamžitá kontrola: krok vyzkoušený na náhodném zamíchání
  await p.locator('.bld-step.open button', { hasText: 'Vyzkoušet krok' }).tap();
  await p.waitForFunction(() => /Funguje: kroky 1–2/.test(document.querySelector('.bld-step.open .bld-check')?.textContent ?? ''), null, { timeout: 60000 });
  assert.match(await p.locator('.bld-step.open .bld-check').innerText(), /Zamíchání:[\s\S]*Hrana vpravo:/);
  await p.locator('.bld-step.open .rule-opt', { hasText: 'Algoritmy – vygenerovat' }).tap();
  assert.match(await p.locator('.bld-step.open .bld-algs').innerText(), /Algoritmy zatím nejsou/);
  await p.locator('.bld-step.open .bld-make-algs').tap();
  // test se sám spustí a na konci uloží řešení kroku 2 do nové sady
  await p.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('ergocube.guides'))).at(-1).steps[1].set, null, { timeout: 120000 });
  const saved = await p.evaluate(async () => {
    const { guides: g, algs } = await import('./src/ui/store.js');
    const st = g.get().steps[1];
    return { n: algs.inSet(st.set).length, mode: st.sim?.mode, alg: algs.inSet(st.set)[0] };
  });
  assert.ok(saved.n >= 1);
  assert.equal(saved.mode, 'auto');
  assert.equal(saved.alg.task.colorsA.length, 54);
  // v Sestavit je vidět sada kroku
  await p.locator('.mp-tabs button', { hasText: 'Sestavit' }).tap(); // krok 2 zůstal otevřený
  assert.match(await p.locator('.bld-step.open .bld-algs').innerText(), /Vygenerováno: \d+ algoritm/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('trenažér: hromadně kopírovat a přesouvat mezi sadami, kopírovat text, smazat', async () => {
  const { p, ctx, errors } = await open('trainer');
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const ids = await p.evaluate(async () => {
    const { algs, algSets } = await import('./src/ui/store.js');
    const { labModel } = await import('./src/ui/models.js');
    const m = labModel('333');
    const home = m.home(['URF', 'U', 'F', 'R']);
    const task = { puzzle: '333', constraints: {}, colorsA: home, colorsB: home };
    const a = algSets.add('Sada A');
    const b = algSets.add('Sada B');
    for (const [i, alg] of ["R U R'", "R U' R'", 'R U2 R\''].entries()) algs.add({ alg, task, name: `Alg ${i + 1}`, set: a });
    localStorage.setItem('ergocube.trainer.set', JSON.stringify(a));
    return { a, b };
  });
  await p.reload();
  await p.locator('.tabbar [data-tab="trainer"]').tap();
  await p.locator('#tr-open').tap();
  // jeden algoritmus do schránky
  await p.locator('#tr-list .alg-item').first().getByRole('button', { name: 'Kopírovat algoritmus' }).tap();
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), "R U R'");
  // výběr dvou: kopie do sady B
  await p.locator('#tr-select').tap();
  const boxes = p.locator('#tr-list .alg-item input[type="checkbox"]');
  await boxes.nth(0).check(); await boxes.nth(1).check();
  assert.match(await p.locator('#tr-bulk').innerText(), /Vybráno 2/);
  await p.locator('#tr-bulk select').selectOption(ids.b);
  await p.locator('#tr-bulk button', { hasText: /^Kopírovat$/ }).tap();
  const count = (set) => p.evaluate((s) => JSON.parse(localStorage.getItem('ergocube.algs')).filter((x) => x.set === s).length, set);
  assert.equal(await count(ids.a), 3);
  assert.equal(await count(ids.b), 2);
  // text vybraných
  await p.locator('#tr-bulk button', { hasText: 'Kopírovat text' }).tap();
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), "Alg 1: R U R'\nAlg 2: R U' R'");
  // přesun jednoho do sady B
  await boxes.nth(1).uncheck();
  await p.locator('#tr-bulk select').selectOption(ids.b);
  await p.locator('#tr-bulk button', { hasText: 'Přesunout' }).tap();
  assert.equal(await count(ids.a), 2);
  assert.equal(await count(ids.b), 3);
  // smazat zbylé dva v sadě A
  p.once('dialog', (d) => d.accept());
  await p.locator('#tr-bulk button', { hasText: 'Vybrat vše' }).tap();
  await p.locator('#tr-bulk button', { hasText: 'Smazat' }).tap();
  assert.equal(await count(ids.a), 0);
  assert.equal(await count(ids.b), 3);
  assert.deepEqual(errors, []);
  await ctx.close();
});
