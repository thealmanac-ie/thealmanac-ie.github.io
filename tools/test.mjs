// npm test: check the built site (dist/) in headless Chromium, with and without JavaScript, then
// build a second copy under a path prefix (/almanac/) and crawl it for broken links.
// Live forecast calls are allowed (a handful of small requests). Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { parseHTML } from 'linkedom';
import siteConfig from '../site.config.mjs';
import { serve } from '../lib/server.mjs';
import { normBase } from '../lib/paths.mjs';
import { scanTree } from '../lib/scrub.mjs';
import * as swimAdapter from '../templates/tide-swim/adapter.mjs';
import * as mountainAdapter from '../templates/mountain/adapter.mjs';
import { readApp } from '../lib/app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const BASE = normBase(siteConfig.baseUrl);
const fails = [], notes = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); return cond; };
const section = (t) => console.log(`\n== ${t}`);
const places = () => fs.readdirSync(path.join(ROOT, 'places')).filter((d) => fs.existsSync(path.join(ROOT, 'places', d, 'place.json')));

const browser = await chromium.launch();
const server = await serve(DIST);
const local = (u) => u.replace(BASE, server.url); // canonical URL -> local URL

// ---------------------------------------------------------------- sitemap, robots
section('sitemap.xml and robots.txt');
const sm = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
const { document: smDoc } = parseHTML(sm.replace(/^<\?xml[^>]*>/, ''));
const locs = [...smDoc.querySelectorAll('loc')].map((l) => l.textContent.trim());
ok(sm.startsWith('<?xml') && /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(sm), 'sitemap: not a sitemaps.org urlset');
ok(locs.length > 5 && locs.every((l) => l.startsWith(BASE)), `sitemap: ${locs.length} URLs, all must start with ${BASE}`);
ok([...smDoc.querySelectorAll('lastmod')].every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.textContent)), 'sitemap: lastmod must be YYYY-MM-DD');
const robots = fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8');
ok(/User-agent: \*\s+Allow: \//.test(robots) && robots.includes(`Sitemap: ${BASE}sitemap.xml`), 'robots.txt: must allow all and name the sitemap');
console.log(`  ${locs.length} URLs; robots.txt allows all`);

// ---------------------------------------------------------------- every page, JS on: clean console
section('every page with JavaScript: console, requests');
const ctxJs = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en-IE', timezoneId: 'Europe/Dublin' });
for (const loc of locs) {
  const page = await ctxJs.newPage(), problems = [];
  // (headless Chromium renders WebGL in software and reports "GPU stall due to ReadPixels" for the map:
  //  a message from this test machine's graphics driver, not from the page, so it is set aside)
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/GL Driver Message/.test(m.text())) problems.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { const e = r.failure()?.errorText; if (e !== 'net::ERR_ABORTED') problems.push(`requestfailed: ${r.url()} ${e}`); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.goto(local(loc), { waitUntil: 'load' });
  const heavy = /\/(westport|croagh-patrick)\/$/.test(loc);
  if (/\/swims\//.test(loc)) await page.waitForTimeout(2500); // the live sea-state estimate
  if (heavy) {
    await page.waitForTimeout(3500);
    if (loc.includes('croagh-patrick')) { await page.evaluate(() => document.querySelector('#where').scrollIntoView()); await page.waitForTimeout(4000); }
  }
  ok(!problems.length, `${loc}: ${problems.join(' | ')}`);
  if (heavy) {
    const live = await page.evaluate(() => ({ verdict: document.querySelector('#verdict, #answer')?.textContent, when: document.querySelector('#when')?.textContent, line: document.querySelector('#answerLine')?.textContent }));
    console.log(`  ${loc.replace(BASE, '/')}: live "${live.verdict}" ${live.when || ''}${live.line ? ' | ' + live.line.slice(0, 70) : ''}`);
    ok(!/^As of/.test(live.when || '') && !/^As of/.test(live.line || ''), `${loc}: the live app did not replace the "as of" snapshot`);
  }
  await page.close();
}
console.log(`  ${locs.length} pages loaded`);
await ctxJs.close();

// ---------------------------------------------------------------- "Tell us where the water was": save, export
section('sightings: save one, export the log');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-IE', timezoneId: 'Europe/Dublin', acceptDownloads: true });
  const page = await ctx.newPage();
  await page.route(/open-meteo\.com|erddap\.marine\.ie/, (r) => r.abort());
  await page.goto(server.url + 'westport/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#chkDate')?.value);
  await page.click('a.btn[href="#tell"]');
  await page.selectOption('#chkKind', 'step');
  await page.fill('#chkStep', '6');
  await page.click('#chkSave');
  const out = await page.textContent('#chkOut');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const file = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  ok(/water level of/.test(out), 'sightings: the check tool compares against the prediction');
  ok(keys.includes('swim:westport:dips') && !keys.some((k) => /^swim:(dips|cal|level)$/.test(k)), `sightings: storage is per place (${keys.join(', ')})`);
  ok(file.version === 1 && file.spot === 'westport/the-point' && /^Roonagh@\d{4}-\d\d-\d\d$/.test(file.model) && file.datum === 'm OD Malin', `sightings: export carries spot, model and datum (${JSON.stringify({ app: file.app, spot: file.spot, model: file.model, datum: file.datum })})`);
  ok(file.dips.length === 1 && file.dips[0].where?.kind === 'step' && file.dips[0].where?.n === 6 && Number.isFinite(file.dips[0].diff), 'sightings: the exported entry keeps the raw observation');
  console.log(`  saved a "step 6" sighting; export ${dl.suggestedFilename()}: ${file.app}, ${file.spot}, ${file.model}`);
  await ctx.close();
}

// ---------------------------------------------------------------- a stale build: the tide tables redo themselves
section('stale build: tide tables re-rendered in the browser');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-IE', timezoneId: 'Europe/Dublin' });
  const page = await ctx.newPage(), problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  await page.route(/open-meteo\.com|erddap\.marine\.ie/, (r) => r.abort());
  await page.clock.install({ time: Date.now() + 2 * 86400000 }); // two days after the build
  await page.goto(server.url + 'westport/', { waitUntil: 'load' });
  const want = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(Date.now() + 2 * 86400000)).replace(/,/g, '');
  await page.waitForFunction((w) => document.querySelector('#tideToday b')?.textContent === w + ':', want, { timeout: 20000 }).catch(() => {});
  const r = await page.evaluate(() => ({ first: document.querySelector('#tideToday b')?.textContent, built: JSON.parse(document.getElementById('tidesConfig').textContent).builtDay, rows: document.querySelectorAll('#tideWeek tbody tr').length }));
  ok(r.first === want + ':' && r.rows === 8, `stale build: tables should start ${want}, got "${r.first}" (${r.rows} rows)`);
  ok(!problems.filter((p) => !/Failed to load resource/.test(p)).length, 'stale build: ' + problems.join(' | '));
  console.log(`  built ${r.built}; two days later the page shows "${r.first}" with ${r.rows} rows`);
  await ctx.close();
}

// ---------------------------------------------------------------- JS off: the HTML carries the content
section('JavaScript disabled: tables, text and verdicts are in the HTML');
const ctxNo = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false, locale: 'en-IE', timezoneId: 'Europe/Dublin' });
const noJs = async (p) => { const page = await ctxNo.newPage(); await page.goto(server.url + p); const r = await page.evaluate(() => ({ text: document.body.innerText, html: document.documentElement.outerHTML })); await page.close(); return r; };
{
  const { text, html } = await noJs('westport/');
  const { document: d } = parseHTML(html);
  const rows = [...d.querySelectorAll('#tideWeek tbody tr')];
  ok(rows.length === 8, `westport no-JS: ${rows.length} rows in the 8-day tide table`);
  ok(rows.every((r) => /\d\d:\d\d/.test(r.textContent) && /[+\u2212]\d\.\d/.test(r.textContent)), 'westport no-JS: every day row has times and heights');
  ok(/(springs|neaps|building|easing)/.test(rows.map((r) => r.textContent).join(' ')), 'westport no-JS: springs/neaps labels');
  ok(d.querySelectorAll('#tideTable tbody tr').length === 7, 'westport no-JS: the depth-at-the-steps table (7 days) is prerendered');
  ok(/^As of /.test(d.querySelector('#when').textContent) && d.querySelector('#verdict').textContent !== '…', 'westport no-JS: hero verdict snapshot labelled "As of"');
  ok(/±0\.\d m: an estimate/.test(text), 'westport no-JS: the uncertainty sits next to the verdict');
  ok(/Tell us where the water was/.test(text) && d.querySelector('#tell #chk'), 'westport no-JS: "Tell us where the water was" section with the form');
  ok(d.querySelectorAll('#sourceList li').length > 50, 'westport no-JS: sources list rendered');
  ok(/How deep is it at the steps, really\?/.test(html) && /Roonagh puzzle/.test(html) && /no lifeguard/i.test(text), 'westport no-JS: deep sections and the safety note present');
  ok(d.querySelectorAll('#dayChart path').length >= 2 && d.querySelectorAll('#stripChart rect').length > 20, 'westport no-JS: the day chart and month strip are prerendered SVG');
  ok(/\d+ tides, about \d+ hours/.test(d.querySelector('#yearText')?.textContent || ''), 'westport no-JS: the year sentence is prerendered');
  ok(d.querySelector('h1')?.textContent === 'Westport tide times', 'westport: h1');
  console.log(`  westport: ${rows.length}-day table, verdict "${d.querySelector('#verdict').textContent}", ${d.querySelectorAll('#sourceList li').length} sources`);
}
{
  const { text, html } = await noJs('croagh-patrick/');
  const { document: d } = parseHTML(html);
  const verdict = d.querySelector('#hero').getAttribute('data-verdict');
  ok(['yes', 'partly', 'no'].includes(verdict) ? /^As of /.test(d.querySelector('#answerLine').textContent) : true, 'croagh-patrick no-JS: verdict snapshot labelled "As of"');
  ok(d.querySelectorAll('.viewlist .vcard').length >= 40, 'croagh-patrick no-JS: the view from the top as text (all features)');
  ok(d.querySelectorAll('#deepContent article').length >= 6 && /Tírechán/.test(html), 'croagh-patrick no-JS: deep sections');
  ok(d.querySelectorAll('#sourceList li').length > 60, 'croagh-patrick no-JS: sources');
  ok(d.querySelector('h1')?.textContent === 'Can I see the Reek today?' && d.querySelectorAll('h1').length === 1, 'croagh-patrick: one h1, the question');
  ok(!/fonts\.googleapis|fonts\.gstatic/.test(html), 'croagh-patrick: no Google Fonts requests');
  console.log(`  croagh-patrick: verdict ${verdict} (${d.querySelector('#answer').textContent}), ${d.querySelectorAll('.viewlist .vcard').length} view cards, ${d.querySelectorAll('#bestWindows li').length} best spells`);
}
{
  const day = locs.find((l) => /tide-times\/\d{4}-\d\d-\d\d\/$/.test(l));
  const { html } = await noJs(day.replace(BASE, ''));
  const { document: d } = parseHTML(html);
  ok(d.querySelectorAll('table.tt.day tbody tr').length >= 3 && d.querySelector('figure svg path'), `${day}: day table and chart in the HTML`);
  const { html: h2 } = await noJs('westport/tide-times/');
  ok(parseHTML(h2).document.querySelectorAll('table.tt.week tbody tr').length === siteConfig.dayPages, 'tide-times overview: one row per day');
  // tomorrow has its own page; the dated copy of tomorrow points search engines at it
  const { html: h3 } = await noJs('westport/tide-times/tomorrow/');
  const dt = parseHTML(h3).document;
  ok(/^High tide Westport tomorrow \(\w+day \d+ \w+\)/.test(dt.querySelector('title').textContent) && dt.querySelectorAll('table.tt.day tbody tr').length >= 3, 'tomorrow page: title and table');
  const tomorrowKey = [...h2.matchAll(/href="(\d{4}-\d\d-\d\d)\/"/g)].map((m) => m[1])[0];
  const days = fs.readdirSync(path.join(DIST, 'westport/tide-times')).filter((d) => /^\d{4}-/.test(d)).sort();
  const { html: h4 } = await noJs(`westport/tide-times/${days[1]}/`);
  ok(parseHTML(h4).document.querySelector('link[rel="canonical"]').getAttribute('href') === BASE + 'westport/tide-times/tomorrow/', "tomorrow's dated page: canonical is the tomorrow page");
  ok(!locs.includes(BASE + `westport/tide-times/${days[1]}/`) && locs.includes(BASE + 'westport/tide-times/tomorrow/'), 'sitemap: tomorrow page in, its dated copy out');
  ok(/\w+day/.test(parseHTML(h4).document.querySelector('h1').textContent), 'day pages: weekday in the h1');
  void tomorrowKey;
  // Louisburgh: the station's own predictions, labelled as official, 8 + 30 days
  const { html: h5 } = await noJs('louisburgh/tide-times/');
  const dl = parseHTML(h5).document;
  ok(/Official\./.test(dl.querySelector('.note')?.textContent || '') && dl.querySelectorAll('table.tt.week').length === 2 && dl.querySelectorAll('table.tt.week')[1].querySelectorAll('tbody tr').length === 30 && dl.querySelector('figure svg path'), 'louisburgh: official label, week and 30-day tables, tide curve');
  // the Clew Bay hub: a map linking the spots, and a note for every spot without published times
  const { html: h6 } = await noJs('clew-bay/tide-times/');
  const dh = parseHTML(h6).document;
  ok(dh.querySelectorAll('.hubmap svg a').length >= 6 && ['murrisk', 'newport', 'mulranny', 'achill-sound'].every((id) => dh.querySelector(`#${id} .kind-none`)) && dh.querySelectorAll('table.tt.hub tbody tr').length >= 4, 'clew-bay: map links, spot notes, today/tomorrow table');
  console.log(`  tomorrow page ok; ${days[1]} canonical -> tomorrow; louisburgh ${dl.querySelectorAll('table.tt.week')[1].querySelectorAll('tbody tr').length} days; hub ${dh.querySelectorAll('.hubmap svg a').length} map links`);
}
// the swim spots: notices first, the water quality with dates, the tide, sources; never "safe"
{
  const spots = locs.filter((l) => /\/swims\/[a-z-]+\/$/.test(l));
  ok(spots.length >= 4, `swims: ${spots.length} spot pages in the sitemap`);
  for (const l of spots) {
    const { text, html } = await noJs(l.replace(BASE, ''));
    const { document: d } = parseHTML(html);
    const first = d.querySelector('main #notices');
    ok(first && first.compareDocumentPosition(d.querySelector('#now')) & 4, `${l}: the notices come before the sea-state block`);
    ok(/checked \w{3} \d+ \w{3} \d\d:\d\d/.test(first?.textContent || '') || d.querySelector('.notice-stop, .notice-warn'), `${l}: the notice line is timestamped`);
    ok(d.querySelectorAll('#water .wq').length >= 1 && /\d{4}/.test(d.querySelector('#water').textContent), `${l}: water quality with dates`);
    ok(d.querySelectorAll('#tide table.tt.week tbody tr').length === 3, `${l}: three days of tides in the HTML`);
    ok(/Measured/.test(text) && /Predicted/.test(text) && /Estimated/.test(text), `${l}: says what is measured, predicted and estimated`);
    ok(!/\bsafe\b/i.test(text.replace(/Nothing here says a swim is safe/g, '')), `${l}: never says "safe"`);
  }
  const { html: hh } = await noJs('swims/');
  const dh = parseHTML(hh).document;
  ok(dh.querySelectorAll('.hublist .hubrow').length >= 5 && dh.querySelectorAll('.hubmap svg a').length >= 10 && dh.querySelectorAll('#left-out ~ .spot').length >= 4, 'swims hub: rows for every spot, map pins, left-out spots with reasons');
  console.log(`  swims: ${spots.length} spot pages and the hub (${dh.querySelectorAll('.hublist .hubrow').length} rows, ${dh.querySelectorAll('#left-out ~ .spot').length} left out)`);
}
await ctxNo.close();

// the swim pages with JavaScript: the live estimate replaces the placeholder
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-IE', timezoneId: 'Europe/Dublin' });
  const page = await ctx.newPage();
  await page.goto(server.url + 'swims/forty-foot/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#svWord')?.textContent !== 'The sea, now', null, { timeout: 20000 }).catch(() => {});
  const w = await page.evaluate(() => ({ word: document.querySelector('#svWord').textContent, best: document.querySelector('#svBest').textContent, tide: document.querySelector('#svTide')?.textContent }));
  ok(w.word !== 'The sea, now' && /water at \d\d:\d\d/.test(w.tide || ''), `forty-foot live: verdict "${w.word}", tide "${w.tide}"`);
  // and with the forecast blocked: the tide still renders, the page says why there is no estimate
  const p2 = await ctx.newPage();
  await p2.route(/open-meteo\.com/, (r) => r.abort());
  await p2.addInitScript(() => localStorage.clear());
  await p2.goto(server.url + 'swims/vico/', { waitUntil: 'load' });
  await p2.waitForFunction(() => document.querySelector('#svWord')?.textContent === 'No forecast', null, { timeout: 20000 }).catch(() => {});
  const w2 = await p2.evaluate(() => ({ word: document.querySelector('#svWord').textContent, tide: document.querySelector('#svTide')?.textContent }));
  ok(w2.word === 'No forecast' && /water at \d\d:\d\d/.test(w2.tide || ''), `vico, forecast blocked: "${w2.word}", tide "${w2.tide}"`);
  console.log(`  forty-foot live: ${w.word}; ${w.best.slice(0, 80)}`);
  await ctx.close();
}

// ---------------------------------------------------------------- JSON-LD and share images
section('JSON-LD and share images');
const types = new Set();
for (const loc of locs) {
  const f = path.join(DIST, loc.replace(BASE, ''), 'index.html');
  const { document: d } = parseHTML(fs.readFileSync(f, 'utf8'));
  for (const s of d.querySelectorAll('script[type="application/ld+json"]')) {
    let j; try { j = JSON.parse(s.textContent); } catch { ok(false, `${loc}: JSON-LD does not parse`); continue; }
    types.add(j['@type']); if (j.about) types.add(j.about['@type']);
    ok(j['@context'] === 'https://schema.org', `${loc}: JSON-LD @context`);
    if (j['@type'] === 'WebPage') ok(j.url === loc, `${loc}: WebPage url ${j.url}`);
    if (j['@type'] === 'BreadcrumbList') ok(j.itemListElement.every((it) => it.item.startsWith(BASE)), `${loc}: breadcrumb URLs`);
    ok(!/Review|AggregateRating|FAQPage/.test(JSON.stringify(j)), `${loc}: no review/FAQ markup`);
  }
  for (const k of ['og:image', 'twitter:image']) {
    const u = d.querySelector(`meta[property="${k}"], meta[name="${k}"]`)?.getAttribute('content');
    const file = u && path.join(DIST, u.replace(BASE, ''));
    if (!ok(file && fs.existsSync(file), `${loc}: ${k} ${u} missing`)) continue;
    const b = fs.readFileSync(file);
    ok(b.toString('ascii', 1, 4) === 'PNG' && b.readUInt32BE(16) === 1200 && b.readUInt32BE(20) === 630 && b.length < 600 * 1024, `${loc}: ${k} must be a 1200x630 PNG under 600 KB`);
  }
}
ok(['WebSite', 'WebPage', 'BreadcrumbList', 'Place', 'Mountain', 'BodyOfWater'].every((t) => types.has(t)), `JSON-LD types seen: ${[...types].join(', ')}`);
for (const f of fs.readdirSync(path.join(DIST, 'og'))) console.log(`  og/${f}: ${(fs.statSync(path.join(DIST, 'og', f)).size / 1024).toFixed(0)} KB`);
console.log(`  JSON-LD types: ${[...types].join(', ')}`);

// ---------------------------------------------------------------- a new place is cheap: adapters dry-run
section('adapters: a hypothetical second place');
{
  const fake = { slug: 'seapoint', spot: { id: 'seapoint', label: 'Seapoint · Dún Laoghaire', forecastPoint: { lat: 53.2985, lon: -6.1633 }, seaTempCell: { lat: 53.3, lon: -6.1 }, viewAzimuth: 60 } };
  const { files } = readApp(ROOT, 'swim', 'westport');
  const before = { ...files };
  const rep = swimAdapter.apply(files, fake, { modelId: 'DublinPort@2026-01-01' });
  ok(files['js/weather.js'].includes('lat: 53.2985') && files['js/hero.js'].includes('VIEW_AZ = 60') && files['js/log.js'].includes("'swim:seapoint:") && !files['js/app.js'].includes("'swim:cal'"), 'tide-swim adapter: values injected for a second spot');
  ok(rep.length === swimAdapter.rules(fake, {}).length && before['js/app.js'] !== files['js/app.js'], 'tide-swim adapter: every rule applied');
  const m = readApp(ROOT, 'reek', 'croagh-patrick').files;
  const mp = { slug: 'nephin', name: 'Nephin', nameGa: 'Néifinn', shortName: 'Nephin', summit: { lat: 54.0125, lon: -9.3706, height: 806 }, foot: { lat: 54.0, lon: -9.35 }, viewpoint: { name: 'Lahardane', lat: 54.03, lon: -9.32 }, glow: { west: { lat: 54, lon: -11 }, east: { lat: 54, lon: -8 } }, seo: { runtimeTitle: 'can I see Nephin today?' } };
  mountainAdapter.apply(m, mp);
  ok(m['js/weather.js'].includes('TOP = 806') && m['js/where.js'].includes('Nephin, 806 m') && m['js/app.js'].includes('can I see Nephin today?'), 'mountain adapter: values injected for a second mountain');
  console.log(`  tide-swim: ${rep.length} rules; mountain: ${mountainAdapter.rules(mp).length} rules; both apply cleanly`);
}

// ---------------------------------------------------------------- path prefix: build again under /almanac/ and crawl it
section('path prefix: build under /almanac/ and crawl');
{
  const PDIR = path.join(ROOT, 'tmp', 'prefix-dist'), PBASE = 'https://example.github.io/almanac/';
  execFileSync(process.execPath, [path.join(ROOT, 'lib/build.mjs')], { env: { ...process.env, DIST_DIR: PDIR, BASE_URL: PBASE }, stdio: 'pipe' });
  const ps = await serve(PDIR, { prefix: '/almanac/' });
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const seen = new Set(), queue = [ps.url], bad = [];
  while (queue.length) {
    const u = queue.shift(); if (seen.has(u)) continue; seen.add(u);
    const res = await ctx.request.get(u);
    if (res.status() !== 200) { bad.push(`${res.status()} ${u}`); continue; }
    if (!(res.headers()['content-type'] || '').includes('text/html')) continue;
    const { document: d } = parseHTML(await res.text());
    const canon = d.querySelector('link[rel="canonical"]')?.getAttribute('href');
    if (canon && !canon.startsWith(PBASE)) bad.push(`canonical outside the prefix on ${u}: ${canon}`);
    for (const e of d.querySelectorAll('a[href], link[href], script[src], img[src]')) {
      const r = e.getAttribute('href') ?? e.getAttribute('src');
      if (!r || /^(mailto:|data:|#)/.test(r) || e.getAttribute('rel') === 'canonical') continue;
      const abs = new URL(r, u); abs.hash = '';
      if (abs.origin === new URL(ps.url).origin && !seen.has(abs.href)) queue.push(abs.href);
    }
  }
  const miss = await ctx.request.get(ps.url + 'westport/tide-times/1999-01-01/');
  const { document: d404 } = parseHTML(await miss.text());
  for (const a of d404.querySelectorAll('a[href]')) { const r = await ctx.request.get(new URL(a.getAttribute('href'), ps.url + 'westport/tide-times/1999-01-01/').href); if (r.status() !== 200) bad.push(`404 page link ${a.getAttribute('href')} -> ${r.status()}`); }
  ok(miss.status() === 404, 'prefix: a missing page answers 404 with the site 404 page');
  ok(!bad.length, `prefix crawl: ${bad.join(' | ')}`);
  console.log(`  crawled ${seen.size} URLs under /almanac/, ${bad.length} problems`);
  const smP = fs.readFileSync(path.join(PDIR, 'sitemap.xml'), 'utf8');
  ok([...smP.matchAll(/<loc>([^<]+)<\/loc>/g)].every((m) => m[1].startsWith(PBASE)), 'prefix: sitemap URLs carry the prefix');
  ok(fs.readFileSync(path.join(PDIR, 'robots.txt'), 'utf8').includes(`Sitemap: ${PBASE}sitemap.xml`), 'prefix: robots names the prefixed sitemap');
  await ctx.close(); await ps.close();
  fs.rmSync(PDIR, { recursive: true, force: true });
}

// ---------------------------------------------------------------- one slow API can't block a deploy
section('degraded builds: a hung forecast, failed prerenders, the EPA down');
{
  const FDIR = path.join(ROOT, 'tmp', 'fault-dist'), CACHE = path.join(ROOT, 'tmp', 'fault-cache');
  const run = (env) => { const r = spawnSync(process.execPath, [path.join(ROOT, 'lib/build.mjs')], { env: { ...process.env, DIST_DIR: FDIR, PRERENDER_CACHE: CACHE, ...env }, encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };
  const report = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tmp', 'build-report.json'), 'utf8')).degraded;
  fs.rmSync(CACHE, { recursive: true, force: true });
  // 1) the forecast API hangs: the Reek page is built without its verdict, with its own share card
  let r = run({ PRERENDER_HANG_HOSTS: 'api.open-meteo.com', LIVE_BUDGET_MS: '4000' });
  const cp = fs.readFileSync(path.join(FDIR, 'croagh-patrick/index.html'), 'utf8');
  ok(r.code === 0 && /verdict comes live/.test(cp) && !/class="asof"/.test(cp) && report().some((e) => e.slug === 'croagh-patrick' && /forecast did not answer/.test(e.what)), `hung forecast: build ${r.code}, Reek page without a stale verdict, reported`);
  ok(fs.statSync(path.join(FDIR, 'og/croagh-patrick.png')).size > 100000, 'hung forecast: the Reek share card is still its own');
  // 2) prerenders fail outright, with a warm cache: the last good cards are reused
  r = run({ PRERENDER_THROW: 'croagh-patrick,forty-foot', EPA_OFFLINE: '1' });
  ok(r.code === 0 && report().filter((e) => /cached prerender/.test(e.what)).length === 2 && !report().some((e) => /fallback card/.test(e.what)), `failed prerenders, warm cache: build ${r.code}, cached cards reused`);
  ok(/EPA bathing-water data: using the (cached|snapshot) copy/.test(r.out) && /from the last good check|from our stored copy/.test(fs.readFileSync(path.join(FDIR, 'swims/forty-foot/index.html'), 'utf8')), 'EPA down: the swim pages say which copy they show');
  // 3) the same with a cold cache: the site's fallback card, honestly labelled
  fs.rmSync(CACHE, { recursive: true, force: true });
  r = run({ PRERENDER_THROW: 'croagh-patrick', EPA_OFFLINE: '1' });
  ok(r.code === 0 && report().some((e) => e.slug === 'croagh-patrick' && /fallback card/.test(e.what)) && /the site's share card/.test(fs.readFileSync(path.join(FDIR, 'croagh-patrick/index.html'), 'utf8')), `failed prerender, cold cache: build ${r.code}, fallback card with matching alt text`);
  // 4) everything failing is a broken build, not a slow API: it must stop
  r = run({ PRERENDER_THROW: places().join(',') });
  ok(r.code !== 0 && /every place failed/.test(r.out), `every prerender failing stops the build (exit ${r.code})`);
  console.log('  hung forecast, failed prerenders (warm and cold cache), EPA down: deployable; total failure: stops');
  fs.rmSync(FDIR, { recursive: true, force: true }); fs.rmSync(CACHE, { recursive: true, force: true });
}

// ---------------------------------------------------------------- privacy
section('privacy: nothing personal or local in the repo or the build');
{
  const repoHits = scanTree(ROOT, { skip: ['node_modules', 'dist', 'tmp', 'shots', '.git', '.scrub.local.json'] });
  const distHits = scanTree(DIST);
  ok(!repoHits.length, 'repo: ' + repoHits.map((h) => `${h.file}:${h.line} ${h.label} "${h.match}"`).join(' | '));
  ok(!distHits.length, 'dist: ' + distHits.map((h) => `${h.file}:${h.line} ${h.label} "${h.match}"`).join(' | '));
  console.log(`  repo and dist scanned: ${repoHits.length + distHits.length} hits`);
}

await browser.close(); await server.close();
console.log(fails.length ? `\nFAILED (${fails.length}):\n  - ${fails.join('\n  - ')}` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
