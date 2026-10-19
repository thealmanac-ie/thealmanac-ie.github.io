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
import { serve } from './server.mjs';
import { launch } from './prerender.mjs';
import { sitemap, robots, check } from './seo.mjs';
import * as sitePages from '../pages/site.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const site = { ...siteConfig, baseUrl: normBase(siteConfig.baseUrl) };
const TEMPLATES = { 'tide-swim': await import('../templates/tide-swim/index.mjs'), mountain: await import('../templates/mountain/index.mjs'),
  'tide-times': await import('../templates/tide-times/index.mjs'), 'tide-hub': await import('../templates/tide-hub/index.mjs') };

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
ctx.css.fonts = fs.readFileSync(path.join(ROOT, 'vendor/fonts/fonts.css'), 'utf8').replace(/\/\*[^*]*\*\//g, '').trim();

fs.rmSync(ctx.dist, { recursive: true, force: true });
fs.rmSync(ctx.tmp, { recursive: true, force: true });
for (const d of ['assets/fonts', 'og']) fs.mkdirSync(path.join(ctx.dist, d), { recursive: true });

// ---- shared assets
const js = async (src, dst) => fs.writeFileSync(path.join(ctx.dist, dst), site.minify ? (await esbuild.transform(fs.readFileSync(path.join(ROOT, src), 'utf8'), { loader: 'js', format: 'esm', minify: true, target: 'es2022' })).code : fs.readFileSync(path.join(ROOT, src)));
await js('assets/tide-client.js', 'assets/tide-client.js');
await js('templates/tide-swim/tides.mjs', 'assets/tides.mjs');
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

// ---- prerender: snapshots, day charts, share cards
const pr = {};
if (!args.has('--no-browser')) {
  const server = await serve(ctx.dist);
  ctx.serverUrl = server.url;
  const browser = await launch();
  try {
    for (const p of places) {
      try {
        pr[p.slug] = await TEMPLATES[p.template].prerender(ctx, p, info[p.slug], browser);
        if (pr[p.slug].problems?.length) console.warn(`  ${p.slug}: page errors while prerendering:\n    ` + pr[p.slug].problems.join('\n    '));
        const v = pr[p.slug].snap?.hero?.attrs?.['data-verdict'] || pr[p.slug].snap?.verdict?.html;
        log(`${p.slug}: prerendered${v ? ` (snapshot: ${String(v).replace(/<[^>]+>/g, '')})` : ''}`);
      } catch (e) { console.warn(`  ${p.slug}: prerender failed, building without the snapshot: ${e.message.split('\n')[0]}`); }
    }
  } finally { await browser.close(); await server.close(); }
}

// ---- write pages
const pages = [];
const cards = [];
const thumbAlt = (p) => (p.template === 'tide-swim' ? `The swimming steps at ${p.spot.short}, ${p.name}, drawn at the predicted water level`
  : p.template === 'mountain' ? `${p.name}'s skyline seen from ${p.viewpoint.name}` : `Map of Clew Bay with ${p.name === 'Clew Bay' ? 'its tide spots' : p.tide?.place || p.name} marked`);
for (const p of [...places].sort((a, b) => (a.template === 'tide-hub') - (b.template === 'tide-hub'))) {
  const T = TEMPLATES[p.template];
  pages.push(...T.write(ctx, p, info[p.slug], pr[p.slug]));
  if (pr[p.slug]?.thumb) fs.writeFileSync(path.join(ctx.dist, 'og', `${p.slug}-thumb.webp`), Buffer.from(pr[p.slug].thumb.split(',')[1], 'base64'));
  cards.push({ place: p, question: p.template === 'tide-swim' ? `${p.seo.h1} · ${p.spot.question}` : p.seo.h1, now: T.teaser(ctx, p, info[p.slug], pr[p.slug]), alt: thumbAlt(p), thumb: !!pr[p.slug]?.thumb });
}
const homeOg = Object.values(pr).find((r) => r?.ogHome)?.ogHome || Object.values(pr).find((r) => r?.og)?.og;
if (homeOg) fs.writeFileSync(path.join(ctx.dist, 'og', 'home.png'), Buffer.from(homeOg.split(',')[1], 'base64'));
pages.unshift(sitePages.home(ctx, cards));
pages.push(sitePages.about(ctx, {}));
sitePages.notFound(ctx);
fs.writeFileSync(path.join(ctx.dist, 'sitemap.xml'), sitemap(site, pages));
fs.writeFileSync(path.join(ctx.dist, 'robots.txt'), robots(site));

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
