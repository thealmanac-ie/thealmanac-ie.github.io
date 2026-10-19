// npm run shots: 390x844 (@2x) screenshots of the built site into shots/, with and without JavaScript.
//   PREFIX=/almanac/ npm run shots     # serve dist/ under a path prefix
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { serve } from '../lib/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const server = await serve(path.join(ROOT, 'dist'), { prefix: process.env.PREFIX || '/' });
const browser = await chromium.launch();
const day = fs.readdirSync(path.join(ROOT, 'dist/westport/tide-times')).filter((d) => /^\d{4}-/.test(d))[6];

const SHOTS = [
  ['01-home', '', {}],
  ['02-westport-top', 'westport/', {}],
  ['03-westport-tide-times', 'westport/', { scrollTo: '#tides' }],
  ['04-westport-tell-us', 'westport/', { scrollTo: '#tell' }],
  ['05-westport-when-water', 'westport/', { scrollTo: '#today' }],
  ['06-westport-deep', 'westport/', { scrollTo: '#deep', open: '#dDepth' }],
  ['07-westport-footer', 'westport/', { scrollTo: 'body > footer' }],
  ['08-westport-day-page', `westport/tide-times/${day}/`, {}],
  ['09-westport-day-page-chart', `westport/tide-times/${day}/`, { scrollTo: 'figure' }],
  ['10-westport-30-days', 'westport/tide-times/', {}],
  ['11-croagh-patrick-top', 'croagh-patrick/', {}],
  ['12-croagh-patrick-days', 'croagh-patrick/', { scrollTo: '.sec-crumbs' }],
  ['13-croagh-patrick-view-list', 'croagh-patrick/', { scrollTo: '.viewlist', open: '.viewlist' }],
  ['14-croagh-patrick-deep', 'croagh-patrick/', { scrollTo: '#deep' }],
  ['15-about', 'about/', {}],
  ['17-westport-tomorrow', 'westport/tide-times/tomorrow/', {}],
  ['18-louisburgh', 'louisburgh/tide-times/', {}],
  ['19-louisburgh-curve', 'louisburgh/tide-times/', { scrollTo: 'figure' }],
  ['25-clew-bay', 'clew-bay/tide-times/', {}],
  ['26-clew-bay-spots', 'clew-bay/tide-times/', { scrollTo: '#murrisk' }],
  ['27-westport-share-sheet', 'westport/', { click: '#shareBtn' }],
  ['16-not-found', 'westport/tide-times/1999-01-01/', {}],
  ['20-nojs-westport-top', 'westport/', { js: false }],
  ['21-nojs-westport-tide-times', 'westport/', { js: false, scrollTo: '#tides' }],
  ['22-nojs-westport-springs', 'westport/', { js: false, scrollTo: '#springs' }],
  ['23-nojs-croagh-patrick-top', 'croagh-patrick/', { js: false }],
  ['24-nojs-croagh-patrick-days', 'croagh-patrick/', { js: false, scrollTo: '#days' }],
];

const problems = [];
for (const [name, p, o] of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-IE', timezoneId: 'Europe/Dublin', javaScriptEnabled: o.js !== false });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${name}: console: ${m.text()}`); });
  await page.goto(server.url + p, { waitUntil: 'load' });
  if (o.js !== false) await page.waitForTimeout(p.startsWith('croagh') ? 2500 : 1200);
  if (o.open) await page.evaluate((s) => { const d = document.querySelector(s); if (d) d.open = true; }, o.open);
  if (o.click) { await page.click(o.click); await page.waitForTimeout(600); }
  if (o.scrollTo) await page.evaluate((s) => { const e = document.querySelector(s); if (e) window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - 8, behavior: 'instant' }); }, o.scrollTo);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await ctx.close();
}
await browser.close(); await server.close();
console.log(`shots: ${SHOTS.length} screenshots in shots/`);
if (problems.length) console.log('page problems:\n  ' + problems.join('\n  '));
