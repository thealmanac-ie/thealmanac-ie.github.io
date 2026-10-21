// npm run build: vendor/ + places/ + templates/ -> dist/ (a static site).
//   BASE_URL=https://thealmanac.ie/ npm run build  # override the base URL from site.config.mjs
//   npm run build -- --no-browser                  # skip prerendering (no snapshots, no share cards)
//   DIST_DIR=tmp/other npm run build               # build somewhere else (the tests use this)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import siteConfig from '../site.config.mjs';
import { normBase } from './paths.mjs';
import { loadEpa } from './epa.mjs';
import { serve } from './server.mjs';
import { launch } from './prerender.mjs';
import { sitemap, robots, check } from './seo.mjs';
import { makeFallbacks, resolve, withTimeout, report, fixFallbackAlt, FALLBACK_ALT } from './fallback.mjs';
import * as sitePages from '../pages/site.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const site = { ...siteConfig, baseUrl: normBase(siteConfig.baseUrl) };
const TEMPLATES = { 'tide-swim': await import('../templates/tide-swim/index.mjs'), swim: await import('../templates/swim/index.mjs'), mountain: await import('../templates/mountain/index.mjs'),
  'tide-times': await import('../templates/tide-times/index.mjs'), 'tide-hub': await import('../templates/tide-hub/index.mjs'), 'swim-hub': await import('../templates/swim-hub/index.mjs') };
const HUBS = new Set(['tide-hub', 'swim-hub']); // pages built from other places' results: written last
const isPoint = (p) => p.template === 'tide-swim' || (p.template === 'swim' && p.swim?.kind === 'depth'); // the swim lab app

// ---- places
const places = fs.readdirSync(path.join(ROOT, 'places'), { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(ROOT, 'places', e.name, 'place.json')))
  .map((e) => JSON.parse(fs.readFileSync(path.join(ROOT, 'places', e.name, 'place.json'), 'utf8')));
for (const p of places) {
  for (const k of ['slug', 'template', 'name', 'listing', 'seo', 'jsonld']) if (!p[k]) throw new Error(`places/${p.slug || '?'}/place.json: missing "${k}"`);
  p.listing.href ||= `${p.slug}/`; p.listing.linkText ||= p.listing.title;
  if (!TEMPLATES[p.template]) throw new Error(`places/${p.slug}: unknown template "${p.template}"`);
  if (!/^[a-z0-9-]+$/.test(p.slug)) throw new Error(`places/${p.slug}: slug must be lower-case letters, digits and hyphens`);
}
places.sort((a, b) => a.listing.group.localeCompare(b.listing.group) || (a.listing.order ?? 99) - (b.listing.order ?? 99) || a.name.localeCompare(b.name));

const now = Date.now();
const ctx = {
  root: ROOT, dist: path.resolve(ROOT, process.env.DIST_DIR || 'dist'), tmp: path.join(ROOT, 'tmp', 'build'), site, places, now,
  isoDay: new Intl.DateTimeFormat('en-CA', { timeZone: site.timeZone }).format(now),
  fullTitle: (t) => (t.length + site.brand.length + 3 <= 66 ? `${t} · ${site.brand}` : t),
  css: {},
};
const minCss = async (f) => (await esbuild.transform(fs.readFileSync(f, 'utf8'), { loader: 'css', minify: true })).code.trim();
ctx.css.site = await minCss(path.join(ROOT, 'assets/site.css'));
ctx.css.tide = await minCss(path.join(ROOT, 'templates/tide-swim/tide.css'));
ctx.css.mountain = await minCss(path.join(ROOT, 'templates/mountain/mountain.css'));
ctx.css.hub = await minCss(path.join(ROOT, 'templates/tide-hub/hub.css'));
ctx.css.swim = await minCss(path.join(ROOT, 'templates/swim/swim.css'));
// the EPA's bathing-water data, read once for every swim spot (lib/epa.mjs: live, else cached, else snapshot)
let epaP = null;
ctx.epa = () => (epaP ||= loadEpa(ctx, [...new Set(places.flatMap((p) => (p.swim?.epa || []).map((e) => e.id)))]).then((e) => {
  if (e.source !== 'live') console.warn(`  EPA bathing-water data: using the ${e.source} copy from ${e.fetchedAt} (${(e.liveErrors || []).join('; ')})`);
  return e;
}));
ctx.css.fonts = fs.readFileSync(path.join(ROOT, 'vendor/fonts/fonts.css'), 'utf8').replace(/\/\*[^*]*\*\//g, '').trim();

fs.rmSync(ctx.dist, { recursive: true, force: true });
fs.rmSync(ctx.tmp, { recursive: true, force: true });
for (const d of ['assets/fonts', 'og']) fs.mkdirSync(path.join(ctx.dist, d), { recursive: true });

// ---- shared assets
const js = async (src, dst) => fs.writeFileSync(path.join(ctx.dist, dst), site.minify ? (await esbuild.transform(fs.readFileSync(path.join(ROOT, src), 'utf8'), { loader: 'js', format: 'esm', minify: true, target: 'es2022' })).code : fs.readFileSync(path.join(ROOT, src)));
await js('assets/tide-client.js', 'assets/tide-client.js');
await js('templates/tide-swim/tides.mjs', 'assets/tides.mjs');
// the swim pages' live code: the sea-state estimate, the page and hub clients, the swim app's tide maths
fs.mkdirSync(path.join(ctx.dist, 'assets/swim'), { recursive: true });
await js('templates/swim/sea.mjs', 'assets/swim-sea.js');
await js('assets/swim-live.js', 'assets/swim-live.js');
await js('assets/swim-hub.js', 'assets/swim-hub.js');
for (const f of ['tide.js', 'util.js']) await js(`vendor/swim/js/${f}`, `assets/swim/${f}`);
fs.copyFileSync(path.join(ROOT, 'assets/favicon.svg'), path.join(ctx.dist, 'assets/favicon.svg'));
for (const f of fs.readdirSync(path.join(ROOT, 'vendor/fonts'))) if (/\.(woff2|txt)$/.test(f)) fs.copyFileSync(path.join(ROOT, 'vendor/fonts', f), path.join(ctx.dist, 'assets/fonts', f));
fs.writeFileSync(path.join(ctx.dist, '.nojekyll'), '');
if (site.customDomain) fs.writeFileSync(path.join(ctx.dist, 'CNAME'), site.customDomain + '\n'); // GitHub ignores it for Actions deployments: set the domain in Settings > Pages too

// ---- assemble each place's app, with a provisional page for the prerender
const info = {};
ctx.info = info;
for (const p of places) {
  info[p.slug] = await TEMPLATES[p.template].prepare(ctx, p);
  const prov = TEMPLATES[p.template].provisional?.(ctx, p, info[p.slug]); // app pages need a first copy to prerender from
  if (prov) fs.writeFileSync(path.join(ctx.dist, p.slug, 'index.html'), prov);
  log(`${p.slug}: app assembled (${info[p.slug].report.length} adapter rules applied)`);
}

// ---- prerender: snapshots, day charts, share cards. Each place gets a time budget; a place whose
//      prerender fails falls back to its last good prerender, then to the site's fallback card
//      (lib/fallback.mjs), so one slow API can't block a deploy. Every fallback is reported.
const pr = {};
const fb = makeFallbacks(ctx);
const BUDGET = +(process.env.PRERENDER_BUDGET_S || 150) * 1000;
const inject = new Set((process.env.PRERENDER_THROW || '').split(',').filter(Boolean)); // fault injection (tests)
let failed = 0;
if (!args.has('--no-browser')) {
  const server = await serve(ctx.dist);
  ctx.serverUrl = server.url;
  const browser = await launch(); // no browser at all is a broken build: that still fails
  try {
    for (const p of places) {
      let live = null, err = null;
      try {
        if (inject.has(p.slug)) throw new Error('fault injected (PRERENDER_THROW)');
        live = await withTimeout(TEMPLATES[p.template].prerender(ctx, p, info[p.slug], browser), BUDGET, `${p.slug} prerender`);
        if (live.problems?.length) console.warn(`  ${p.slug}: page errors while prerendering:\n    ` + live.problems.join('\n    '));
        const v = live.snap?.hero?.attrs?.['data-verdict'] || live.snap?.verdict?.html;
        log(`${p.slug}: prerendered${v ? ` (snapshot: ${String(v).replace(/<[^>]+>/g, '')})` : ''}`);
      } catch (e) { err = e; failed++; }
      const T = TEMPLATES[p.template];
      pr[p.slug] = resolve(fb, p, live, err, T.cacheable ? (x) => T.cacheable(x, p) : null);
    }
  } finally { await browser.close(); await server.close(); }
} else for (const p of places) pr[p.slug] = resolve(fb, p, null, new Error('--no-browser'), null);

// ---- write pages
const pages = [];
const cards = [];
const thumbAlt = (p) => (isPoint(p) ? `The swimming steps at ${p.spot.short}, ${p.name}, drawn at the predicted water level`
  : p.template === 'mountain' ? `${p.name}'s skyline seen from ${p.viewpoint.name}`
    : p.template === 'swim' ? `How far the open water runs from ${p.swim.short} in each direction`
      : p.template === 'swim-hub' ? 'Map of Ireland with the swim spots marked' : `Map of Clew Bay with ${p.name === 'Clew Bay' ? 'its tide spots' : p.tide?.place || p.name} marked`);
for (const p of [...places].sort((a, b) => HUBS.has(a.template) - HUBS.has(b.template))) {
  const T = TEMPLATES[p.template];
  const written = T.write(ctx, p, info[p.slug], pr[p.slug]);
  if (pr[p.slug]?.ogFallback) fixFallbackAlt(ctx, written, p.slug);
  pages.push(...written);
  if (pr[p.slug]?.thumb) fs.writeFileSync(path.join(ctx.dist, 'og', `${p.slug}-thumb.webp`), Buffer.from(pr[p.slug].thumb.split(',')[1], 'base64'));
  if (p.listing.hidden) continue; // listed by its hub, not on the home page
  cards.push({ place: p, question: isPoint(p) ? `${p.seo.h1} · ${p.spot.question}` : p.seo.h1, now: T.teaser(ctx, p, info[p.slug], pr[p.slug]), alt: pr[p.slug]?.thumbFallback ? FALLBACK_ALT(site) : thumbAlt(p), thumb: !!pr[p.slug]?.thumb });
}
let homeOg = Object.values(pr).find((r) => r?.ogHome)?.ogHome;
if (!homeOg) { homeOg = fb.card(); fb.note('home', 'share card: the site fallback card', 'no place drew a home card'); }
fs.writeFileSync(path.join(ctx.dist, 'og', 'home.png'), Buffer.from(homeOg.split(',')[1], 'base64'));
pages.unshift(sitePages.home(ctx, cards));
pages.push(sitePages.about(ctx, {}));
sitePages.notFound(ctx);
fs.writeFileSync(path.join(ctx.dist, 'sitemap.xml'), sitemap(site, pages));
fs.writeFileSync(path.join(ctx.dist, 'robots.txt'), robots(site));

// ---- what fell back, and why (fails only if every place failed: a broken build, not a slow API)
try { report(ctx, fb, { failedAll: !args.has('--no-browser') && failed === places.length }); } catch (e) { console.error(e.message); process.exit(1); }

// ---- checks
const { errors, warn } = check(ctx.dist, site, pages);
for (const w of warn) console.warn('  warning:', w);
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
log(`built ${pages.length} pages for ${site.baseUrl} into ${path.relative(ROOT, ctx.dist)}/ (${(size(ctx.dist) / 1024).toFixed(0)} KB)`);
if (errors.length) {
  if (args.has('--no-browser')) console.warn('  (no-browser build: errors below are expected for share images)');
  console.error('build checks failed:\n  ' + errors.join('\n  '));
  if (!args.has('--no-browser') || errors.some((e) => !/og:image|twitter:image/.test(e))) process.exit(1);
}
