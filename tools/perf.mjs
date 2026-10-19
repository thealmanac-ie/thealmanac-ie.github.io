// npm run perf: load the main pages cold in headless Chromium at 390x844 with Lighthouse-like mobile
// throttling (150 ms RTT, 1.6 Mbps down, 750 kbps up, CPU 4x slower) and report FCP, LCP, CLS,
// long-task time and bytes transferred (gzip, as GitHub Pages serves). Writes tmp/perf.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { serve } from '../lib/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await serve(path.join(ROOT, 'dist'));
const browser = await chromium.launch();
const day = fs.readdirSync(path.join(ROOT, 'dist/westport/tide-times')).filter((d) => /^\d{4}-/.test(d))[1];
const PAGES = ['', 'westport/', 'croagh-patrick/', `westport/tide-times/${day}/`, 'westport/tide-times/'];
const RUNS = +(process.env.RUNS || 2);

const observe = () => {
  window.__perf = { lcp: null, lcpEl: '', cls: 0, shifts: [], longTasks: 0 };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__perf.lcp = e.startTime; const el = e.element; window.__perf.lcpEl = el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}` : (e.url || ''); } }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__perf.cls += e.value; window.__perf.shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), src: (e.sources || []).map((s) => s.node ? (s.node.id || s.node.className || s.node.nodeName) : '?').join(',') }); } }).observe({ type: 'layout-shift', buffered: true });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longTasks += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true }); } catch { /* not supported */ }
};

const results = [];
for (const p of PAGES) {
  for (let run = 0; run < RUNS; run++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-IE', timezoneId: 'Europe/Dublin' });
    const page = await ctx.newPage();
    await page.addInitScript(observe);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const reqs = new Map(); let bytes = 0, bytesOwn = 0, n = 0, nOwn = 0;
    cdp.on('Network.responseReceived', (e) => reqs.set(e.requestId, e.response.url));
    cdp.on('Network.loadingFinished', (e) => { const u = reqs.get(e.requestId) || ''; bytes += e.encodedDataLength; n++; if (u.startsWith(server.url)) { bytesOwn += e.encodedDataLength; nOwn++; } });
    const t0 = Date.now();
    await page.goto(server.url + p, { waitUntil: 'load', timeout: 120000 });
    const load = Date.now() - t0;
    await page.waitForTimeout(6000);
    const m = await page.evaluate(() => ({ ...window.__perf, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null }));
    results.push({ page: '/' + p, run, fcp: Math.round(m.fcp), lcp: Math.round(m.lcp), lcpEl: m.lcpEl, cls: +m.cls.toFixed(3), shifts: m.shifts, tbt: Math.round(m.longTasks), load, kb: Math.round(bytes / 1024), kbOwn: Math.round(bytesOwn / 1024), requests: n, requestsOwn: nOwn });
    await ctx.close();
  }
}
await browser.close(); await server.close();
fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tmp', 'perf.json'), JSON.stringify(results, null, 1));
console.log('page                              FCP    LCP  LCP element              CLS    TBT   load   KB (own)  requests (own)');
for (const r of results.filter((x) => x.run === RUNS - 1)) {
  console.log(`${r.page.padEnd(32)} ${String(r.fcp).padStart(5)} ${String(r.lcp).padStart(6)}  ${r.lcpEl.slice(0, 22).padEnd(22)} ${r.cls.toFixed(3).padStart(6)} ${String(r.tbt).padStart(6)} ${String(r.load).padStart(6)} ${String(r.kb).padStart(5)} (${String(r.kbOwn).padStart(4)}) ${String(r.requests).padStart(5)} (${r.requestsOwn})`);
  if (r.cls > 0.01) console.log('   shifts:', JSON.stringify(r.shifts));
}
console.log('(ms; slow-4G and 4x CPU throttling; cold cache; last of', RUNS, 'runs; details in tmp/perf.json)');
