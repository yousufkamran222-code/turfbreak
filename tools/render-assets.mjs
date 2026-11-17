// Renders the SVG sources in assets/ to the PNGs that @capacitor/assets and the web build need.
// Usage: node tools/render-assets.mjs   (needs Playwright's Chromium; run in a cloud session or CI)
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const jobs = [
  ['assets/icon.svg', 'assets/icon-only.png', 1024, false],
  ['assets/foreground.svg', 'assets/icon-foreground.png', 1024, true],
  ['assets/splash.svg', 'assets/splash.png', 2732, false],
  ['assets/splash.svg', 'assets/splash-dark.png', 2732, false],
  ['assets/icon.svg', 'public/icon-192.png', 192, false],
  ['assets/icon.svg', 'public/icon-512.png', 512, false],
  ['assets/icon.svg', 'public/favicon.png', 64, false],
];
mkdirSync('public', { recursive: true });
const browser = await chromium.launch();
for (const [src, out, size, transparent] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = readFileSync(src, 'utf8');
  await page.setContent(`<style>html,body{margin:0;background:${transparent ? 'transparent' : '#0b0d12'}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: out, omitBackground: transparent });
  await page.close();
  console.log('wrote', out);
}
// Solid background layer for the adaptive icon.
const bg = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await bg.setContent('<style>html,body{margin:0;background:#0b0d12}</style>');
await bg.screenshot({ path: 'assets/icon-background.png' });
await browser.close();
