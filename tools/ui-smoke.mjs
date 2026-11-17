#!/usr/bin/env node
/**
 * UI smoke test: drives a whole run in headless Chromium against `vite preview`
 * and exits non-zero on a console error, a page error or a failed expectation.
 *
 *   npm run build:web && node tools/ui-smoke.mjs [--fast] [--url http://localhost:4173] [--shots DIR]
 *
 * Without --url it starts `vite preview` itself. `--fast` plays one match only (CI, about a minute).
 * Flow: first launch pick, draft, VS card, aim, match end, draft (3+ rounds),
 * a loss, the summary, resume after a reload, the settings, and (on a won run)
 * Continue (Endless) with the unlocked Ascension.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const fast = args.includes('--fast');
const shotsDir = arg('--shots', '/tmp/turfbreak-shots');
mkdirSync(shotsDir, { recursive: true });

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const roots = [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/opt/node-tools/node_modules', '/usr/local/lib/node_modules_global']
      .filter(Boolean)
      .flatMap((p) => p.split(':'));
    for (const r of roots) {
      try {
        return createRequire(join(r, 'x.js'))('playwright');
      } catch {
        // try the next root
      }
    }
    throw new Error('playwright is not installed');
  }
}

let server = null;
let url = arg('--url', null);
async function startServer() {
  if (url) return;
  const port = 4179;
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  url = `http://localhost:${port}/`;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('vite preview did not start');
}

const errors = [];
const failures = [];
const expect = (cond, what) => {
  if (!cond) {
    failures.push(what);
    console.error(`  FAIL ${what}`);
  } else console.log(`  ok   ${what}`);
};

const pw = await loadPlaywright();
await startServer();
const browser = await pw.chromium.launch();

async function newPage(viewport, storage) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: false });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.clock.install();
  if (storage) await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('turfbreak.save', s); sessionStorage.setItem('seeded', '1'); } }, storage);
  await page.goto(url);
  return { ctx, page };
}

const shot = (page, name) => page.screenshot({ path: join(shotsDir, `${name}.png`) });
const text = (page) => page.evaluate(() => document.body.innerText);
const has = async (page, s) => (await text(page)).toLowerCase().includes(s.toLowerCase());

/** Advance the (fake) clock in slices until `fn` is true. */
async function until(page, fn, label, slice = 2000, max = 60) {
  for (let i = 0; i < max; i++) {
    if (await fn()) return true;
    await page.clock.runFor(slice);
  }
  failures.push(`timed out: ${label}`);
  console.error(`  FAIL timed out: ${label}`);
  return false;
}

/** Aim, launch and play the current match to its result; returns 'won' | 'lost'. */
async function playMatch(page, tag, slice = 8000) {
  await page.waitForSelector('canvas.arena');
  await page.clock.runFor(100);
  await shot(page, `${tag}-aim`);
  const box = await page.locator('canvas.arena').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3);
  await page.mouse.up();
  await page.locator('.match-footer .row button').last().click(); // 2x speed
  await page.clock.runFor(slice);
  await shot(page, `${tag}-playing`);
  const ok = await until(page, async () => (await page.locator('.result').count()) > 0, 'match result', slice);
  if (!ok) return null;
  await page.clock.runFor(300);
  await shot(page, `${tag}-result`);
  const won = await has(page, 'YOU WIN');
  await page.locator('.result .primary').click();
  await page.clock.runFor(100);
  return won ? 'won' : 'lost';
}

async function passVs(page, tag) {
  await page.waitForSelector('.vs');
  await shot(page, `${tag}-vs`);
  await page.clock.runFor(2100); // auto-start after 2 s
}

const phone = { width: 390, height: 844 };

async function fullRun() {
    console.log('First launch');
    let { ctx, page } = await newPage(phone);
    await page.waitForSelector('.first');
    expect(await has(page, 'WHO WINS?'), 'first launch shows WHO WINS?');
    expect((await page.locator('.core-card').count()) === 2, 'two Cores to pick from');
    await shot(page, '01-who-wins');
    await page.locator('.core-card').first().click();
    await page.waitForSelector('.draft-screen');
    expect(await has(page, 'Pick a Mod. It stays for the whole run.'), 'first draft hint');
    expect(await has(page, 'ROUND 1 / 10'), 'round label');
    expect((await page.locator('.mod-card').count()) >= 3, 'three or more Mod cards');
    await shot(page, '02-draft-first');
    const firstDraft = await page.evaluate(() => JSON.parse(localStorage.getItem('turfbreak.save')));

    console.log('Reroll and skip');
    const before = await page.locator('.mod-card').allInnerTexts();
    await page.locator('#reroll').click();
    const after = await page.locator('.mod-card').allInnerTexts();
    expect(JSON.stringify(before) !== JSON.stringify(after), 'reroll changes the offer');
    expect(await page.locator('#reroll').isDisabled(), 'reroll disabled at 0');

    console.log('Play up to three rounds');
    await page.locator('.mod-card').first().click();
    let rounds = 0;
    let early = false;
    for (let i = 0; i < 3; i++) {
      await passVs(page, `r${i + 1}`);
      const r = await playMatch(page, `r${i + 1}`);
      if (r === null) break;
      rounds++;
      await page.waitForSelector('.draft-screen, .summary');
      if (await page.locator('.summary').count()) {
        early = true; // three losses in a row end the run: that is the summary path
        break;
      }
      if (rounds === 2) await shot(page, '03-draft-after-match');
      if (i < 2) await page.locator('.mod-card').first().click();
    }
    expect(rounds === 3 || early, `played ${rounds} rounds`);
    console.log('Stats persisted');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('turfbreak.save')));
    expect(saved.stats.runsStarted === 1, 'runsStarted is 1');
    expect(saved.stats.matchesWon + saved.stats.matchesLost === rounds, 'match stats add up');
    expect(saved.run.history.length === rounds, 'history has one entry per match');
    if (early) await shot(page, '04-early-summary');
    else await shot(page, '04-draft-round-4');
    // A mid-run document for the seeded checks below: the first draft, moved on to round 4.
    const midDoc = { ...firstDraft, run: { ...firstDraft.run, round: 4 } };
    await ctx.close();

    console.log('Full build opens the replace chooser');
    const fullBuild = ['overclock', 'growth-spurt', 'chain-reaction', 'afterburner', 'shockwave', 'bulwark'].map((id) => ({ id, level: 1 }));
    const fullDoc = { ...midDoc, run: { ...midDoc.run, build: fullBuild, offer: ['magnet', 'encore', 'head-start'] } };
    ({ ctx, page } = await newPage(phone, JSON.stringify(fullDoc)));
    await page.waitForSelector('.home');
    await page.locator('#continue').click();
    await page.waitForSelector('.draft-screen');
    await page.locator('.mod-card').first().click();
    await page.waitForSelector('.overlay .slot-btn');
    expect((await page.locator('.overlay .slot-btn').count()) === 6, 'replace chooser shows six slots');
    await shot(page, '05-replace-chooser');
    await page.locator('.overlay .slot-btn').nth(2).click();
    await page.waitForSelector('.vs');
    const replaced = await page.evaluate(() => JSON.parse(localStorage.getItem('turfbreak.save')));
    expect(replaced.run.build.length === 6 && replaced.run.build[2].id === fullDoc.run.offer[0], 'the chosen slot was replaced');
    await ctx.close();

    console.log('A loss and the summary (Ascension 8, one heart, round 10)');
    const loseDoc = { ...midDoc, run: { ...midDoc.run, ascension: 8, round: 10, hearts: 1, build: [] } };
    ({ ctx, page } = await newPage(phone, JSON.stringify(loseDoc)));
    await page.waitForSelector('.home');
    await page.locator('#continue').click();
    await page.waitForSelector('.draft-screen');
    await page.locator('.mod-card').first().click();
    await passVs(page, 'lose');
    const lr = await playMatch(page, 'lose');
    await page.waitForSelector('.summary');
    await shot(page, '06-summary');
    expect(lr !== null, 'the final match finished');
    expect((await has(page, 'rounds won')) && (await has(page, 'Final build')), 'summary has rounds won and final build');
    expect(await has(page, lr === 'won' ? 'RUN WON' : 'RUN OVER'), 'summary title matches the result');
    await page.locator('#again').click();
    await page.waitForSelector('.draft-screen');
    expect(await has(page, 'ROUND 1 / 10'), 'Play again starts round 1');
    await ctx.close();

    console.log('Resume after reload, and back button');
    ({ ctx, page } = await newPage(phone));
    await page.waitForSelector('.first');
    await page.locator('.core-card').nth(1).click();
    await page.waitForSelector('.draft-screen');
    await page.locator('.mod-card').first().click();
    await page.waitForSelector('.vs');
    await page.clock.runFor(2100);
    await page.waitForSelector('canvas.arena');
    await page.keyboard.press('Escape'); // back from a match opens the pause overlay
    await page.waitForSelector('#resume');
    expect(true, 'back in a match opens pause');
    await shot(page, '07-pause');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#resume', { state: 'detached' });
    expect(true, 'back again resumes');
    await page.click('#pause');
    await page.click('#quit');
    await page.waitForSelector('.home');
    expect(!(await has(page, 'Continue')), 'quitting the run clears it');
    await shot(page, '08-home');
    await page.locator('#play').click();
    await page.waitForSelector('.draft-screen');
    await page.locator('.mod-card').first().click();
    await page.waitForSelector('.vs');
    await page.reload();
    await page.waitForSelector('.home');
    expect(await has(page, 'Continue'), 'Continue is offered after a reload');
    await shot(page, '09-home-continue');
    await page.locator('#continue').click();
    await page.waitForSelector('.vs');
    expect(await has(page, 'ROUND 1 / 10'), 'resumed at the saved round');
    await ctx.close();

    console.log('Settings persist');
    ({ ctx, page } = await newPage(phone));
    await page.waitForSelector('.first');
    await page.getByText('Settings').click();
    await page.waitForSelector('.settings');
    const switches = page.locator('.toggle-row input');
    await switches.nth(1).click(); // reduce motion
    await switches.nth(2).click(); // high contrast
    await page.locator('.slider-row input').first().fill('30');
    await shot(page, '10-settings');
    expect(await page.evaluate(() => document.documentElement.classList.contains('reduce-motion')), 'reduce motion applies at once');
    await page.reload();
    await page.getByText('Settings').click();
    await page.waitForSelector('.settings');
    expect(await switches.nth(1).isChecked(), 'reduce motion survives a reload');
    expect(await switches.nth(2).isChecked(), 'high contrast survives a reload');
    expect((await page.locator('.slider-row input').first().inputValue()) === '30', 'music volume survives a reload');
    expect(await has(page, 'v0.'), 'build version shown');
    await ctx.close();

    console.log('Corrupt save never crashes');
    ({ ctx, page } = await newPage(phone, '{"version":2,"run":{"phase":"match"},"settings":"x"'));
    await page.waitForSelector('.first, .home');
    expect(true, 'corrupt save falls back to defaults');
    await ctx.close();

    console.log('Desktop screens, then a boss final round');
    ({ ctx, page } = await newPage({ width: 1280, height: 720 }));
    await page.waitForSelector('.first');
    await shot(page, '10-desktop-first');
    await page.locator('.core-card').first().click();
    await page.waitForSelector('.draft-screen');
    await shot(page, '11-desktop-draft');
    const draftDoc = await page.evaluate(() => JSON.parse(localStorage.getItem('turfbreak.save')));
    expect(draftDoc.run.phase === 'draft', 'saved run is in a draft');
    await page.locator('.mod-card').first().click();
    await page.waitForSelector('.vs');
    await shot(page, '12-desktop-vs');
    await page.clock.runFor(2100);
    await page.waitForSelector('canvas.arena');
    await page.clock.runFor(100);
    await shot(page, '13-desktop-match');
    await ctx.close();

    // Round 10 is a boss and the last round: the result ends the run either way.
    const seeded = { ...draftDoc, run: { ...draftDoc.run, round: 10, hearts: 3 } };
    ({ ctx, page } = await newPage(phone, JSON.stringify(seeded)));
    await page.waitForSelector('.home');
    await page.locator('#continue').click();
    await page.waitForSelector('.draft-screen');
    expect(await has(page, 'ROUND 10 / 10'), 'seeded round 10 draft');
    await page.locator('.mod-card').first().click();
    await page.waitForSelector('.vs');
    expect((await page.locator('.boss-tag').count()) === 1, 'round 10 VS card shows the boss');
    await shot(page, 'final-vs');
    await page.clock.runFor(2100);
    const res = await playMatch(page, 'final');
    await page.waitForSelector('.summary');
    await shot(page, '14-final-summary');
    if (res === 'won') {
      expect(await has(page, 'Ascension 1 unlocked'), 'winning unlocks Ascension 1');
      await page.locator('#endless').click();
      await page.waitForSelector('.draft-screen');
      expect(await has(page, 'ENDLESS'), 'Endless draft is labelled');
      await shot(page, '15-endless-draft');
      await page.reload();
      await page.waitForSelector('.home');
      const s2 = await page.evaluate(() => JSON.parse(localStorage.getItem('turfbreak.save')));
      expect(Object.values(s2.bestAscension).includes(1), 'best Ascension saved');
      await shot(page, '16-home-after-win');
    } else {
      expect(await has(page, 'RUN OVER'), 'a lost final round ends the run');
    }
    await ctx.close();
}

/**
 * Fast mode (CI): one match, not a whole run. First launch, draft, VS card, aim,
 * then the in-game 2x speed and big clock slices finish the match; the next draft
 * appears; Settings and Collection open; no console errors. About a minute or two.
 */
async function fastRun() {
  console.log('Fast smoke: first launch, draft, VS card, aim, one match');
  const { ctx, page } = await newPage(phone);
  await page.waitForSelector('.first');
  expect(await has(page, 'WHO WINS?'), 'first launch shows WHO WINS?');
  await shot(page, 'fast-01-who-wins');
  await page.locator('.core-card').first().click();
  await page.waitForSelector('.draft-screen');
  expect((await page.locator('.mod-card').count()) >= 3, 'three or more Mod cards');
  expect((await page.locator('#ad-reroll').count()) === 0, 'no ad button on a web build');
  await shot(page, 'fast-02-draft');
  await page.locator('.mod-card').first().click();
  await passVs(page, 'fast');
  const r = await playMatch(page, 'fast', 15000);
  expect(r !== null, 'the match finished');
  await page.waitForSelector('.draft-screen, .summary');
  expect((await page.locator('.draft-screen, .summary').count()) === 1, 'the next draft (or the summary) appears');
  await shot(page, 'fast-03-next');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('turfbreak.save')));
  expect(saved.stats.matchesWon + saved.stats.matchesLost === 1, 'the match was counted once');

  console.log('Settings and Collection');
  await page.keyboard.press('Escape'); // back from the draft: home, run kept
  await page.waitForSelector('.home');
  await page.getByText('Settings').first().click();
  await page.waitForSelector('.settings');
  expect(await has(page, 'Auto-play'), 'settings list Auto-play');
  await shot(page, 'fast-04-settings');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.home');
  await page.locator('#collection').click();
  await page.waitForSelector('.collection');
  await shot(page, 'fast-05-collection');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.home');
  await page.locator('#continue').click();
  await page.waitForSelector('.draft-screen, .summary');
  expect(true, 'Continue returns to the run');
  await ctx.close();
}

try {
  await (fast ? fastRun() : fullRun());
} catch (e) {
  failures.push(`exception: ${e instanceof Error ? e.stack : e}`);
  console.error(e);
}

await browser.close();
server?.kill();
for (const e of errors) console.error(`  ERROR ${e}`);
if (errors.length || failures.length) {
  console.error(`\nUI smoke FAILED: ${failures.length} failed expectations, ${errors.length} console errors`);
  process.exit(1);
}
console.log(`\nUI smoke passed. Screenshots in ${shotsDir}`);
