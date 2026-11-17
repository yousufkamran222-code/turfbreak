#!/usr/bin/env node
/** Build with npm run build:playtest, then run this comparison/isolation smoke. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const shots = process.argv[2] ?? '/tmp/turfbreak-agency-shots';
mkdirSync(shots, { recursive: true });
const port = 20000 + Math.floor(Math.random() * 30000);
const url = `http://localhost:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, 'preview server started');
  browser = await chromium.launch();
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    // Accelerate visual simulation only; this is a functional test, never a performance benchmark.
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => raf((time) => callback(time * 12));
    });
    await page.goto(url);
    await page.locator('#agency-playtest').waitFor();
    const original = await page.evaluate(() => localStorage.getItem('turfbreak.save'));
    await page.locator('#agency-playtest').click();
    const offers = [];
    for (const variant of ['classic', 'recharge', 'tactical']) {
      await page.getByRole('button', { name: `Play ${variant}`, exact: true }).click();
      await page.locator('[data-mod]').first().waitFor();
      offers.push(await page.locator('[data-mod]').evaluateAll((els) => els.map((e) => e.getAttribute('data-mod'))));
      await page.locator('[data-mod]').first().click();
      await page.locator('canvas.arena').waitFor();
      if (variant === 'recharge') await page.getByRole('progressbar', { name: 'Ultimate charge' }).waitFor();
      if (variant === 'tactical') {
        const panel = page.getByRole('region', { name: 'Halftime tactical choice' });
        await panel.waitFor({ timeout: 45000 });
        const time = await page.locator('.time').innerText();
        await page.waitForTimeout(300);
        assert.equal(await page.locator('.time').innerText(), time, 'tactical time remains frozen');
        await page.locator('#pause').click();
        await page.locator('#resume').click();
        await panel.waitFor();
        await page.screenshot({ path: `${shots}/${viewport.width}-tactical.png` });
        console.log('Choosing shield');
        await page.getByRole('button', { name: 'Shield · 3s', exact: true }).click();
        console.log('Chose shield');
      }
      console.log(`Waiting for ${variant} result`);
      await page.getByRole('button', { name: 'Continue', exact: true }).waitFor({ timeout: 45000 });
      await page.screenshot({ path: `${shots}/${viewport.width}-${variant}-result.png` });
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.locator('[data-mod]').first().waitFor();
      await page.getByRole('button', { name: 'Exit playtest', exact: true }).click();
      await page.getByRole('button', { name: `Play ${variant}`, exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('turfbreak.save')), original, 'comparison cannot write normal save');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal clipping');
      console.log(`${viewport.width}: ${variant} result, next draft, isolation passed`);
    }
    assert.deepEqual(offers[0], offers[1], 'same-seed recharge draft matches classic');
    assert.deepEqual(offers[0], offers[2], 'same-seed tactical draft matches classic');
    assert.deepEqual(errors, [], 'no browser errors');
    await context.close();
  }
} catch (error) {
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) {
    console.error(await page.locator('body').innerText().catch(() => 'page unavailable'));
    await page.screenshot({ path: `${shots}/failure.png`, timeout: 5000 }).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
