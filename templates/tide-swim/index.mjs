// Template "tide-swim": a town's tide times plus one swim spot's "is there water at the steps?".
// The interactive page is the swim lab app (vendor/swim) for the place, with:
//   - an SEO head, and the app's JS-rendered text prerendered into the HTML (lib/prerender.mjs);
//   - a server-rendered "tide times" section (today and the next 7 days) at the top;
//   - the depth's uncertainty next to the verdict, and "Tell us where the water was" made prominent;
//   - one static page per day (tide-times/YYYY-MM-DD/) and a 30-day overview (tide-times/).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readApp, writeApp, moduleGraph, startupData, missingIds } from '../../lib/app.mjs';
import { parse, serialize, one, insertAfter, insertBefore, append, applyHead, esc, ldPage } from '../../lib/html.mjs';
import { rel } from '../../lib/paths.mjs';
import { crumbs, footer } from '../../lib/chrome.mjs';
import { open, extract, composeCard, saveDataUrl } from '../../lib/prerender.mjs';
import * as adapter from './adapter.mjs';
import * as T from './tides.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);

// What the build copies out of the running app into the static HTML.
const SPEC = [
  { key: 'verdict', sel: '#verdict', html: true }, { key: 'verdictLine', sel: '#verdictLine', html: true }, { key: 'nextSwim', sel: '#nextSwim', html: true },
  { key: 'ticks', sel: '#ticks', html: true }, { key: 'scrubOut', sel: '#scrubOut', html: true }, { key: 'hero', sel: '#hero', attrs: ['data-tone'] },
  { key: 'pick', sel: '.pick', html: true }, { key: 'dayTabs', sel: '#dayTabs', html: true }, { key: 'dayChart', sel: '#dayChart', html: true, attrs: ['viewBox'] },
  { key: 'readout', sel: '#readout', html: true }, { key: 'winList', sel: '#winList', html: true },
  { key: 'stripChart', sel: '#stripChart', html: true, attrs: ['viewBox'] }, { key: 'stripText', sel: '#stripText', html: true }, { key: 'yearText', sel: '#yearText', html: true },
  { key: 'tideTable', sel: '#tideTable tbody', html: true },
  { key: 'datumFig', sel: '#datumFig', html: true, attrs: ['viewBox'] }, { key: 'roseFig', sel: '#roseFig', html: true, attrs: ['viewBox'] },
  { key: 'climFig', sel: '#climFig', html: true, attrs: ['viewBox'] }, { key: 'futureChart', sel: '#futureChart', html: true, attrs: ['viewBox'] },
  { key: 'slrTable', sel: '#slrTable', html: true }, { key: 'futureText', sel: '#futureText', html: true },
  { key: 'sourceList', sel: '#sourceList', html: true },
  { key: 'nums', sel: 'span[id^="n"]', all: true }, { key: 'cites', sel: 'a.cite', all: true },
];

const DAY_BASE = 'tide-times/';

export async function prepare(ctx, place) {
  const { files } = readApp(ctx.root, place.app, place.slug);
  const missing = missingIds(files);
  if (missing.length) throw new Error(`places/${place.slug}: index.html lacks element ids the app needs: ${missing.map((i) => '#' + i).join(', ')}`);
  const model = JSON.parse(files['data/tide_model.json']);
  const P = JSON.parse(files['data/point.json']);
  const modelId = `${model.station}@${model.fitted}`;
  const constants = adapter.appConstants(files);
  const graph = moduleGraph(files, 'js/app.js'), data = startupData(files);
  const report = adapter.apply(files, place, { modelId });
  adapter.withhold(files, place);
  const out = path.join(ctx.dist, place.slug);
  await writeApp(files, out, { minify: ctx.site.minify });
  const cssMin = fs.readFileSync(path.join(out, 'css', 'swim.css'), 'utf8');
  // the same modules, unminified, for the build's own tide sums
  const tmpJs = path.join(ctx.tmp, place.slug);
  await writeApp(Object.fromEntries(Object.entries(files).filter(([f]) => f.startsWith('js/'))), tmpJs, { minify: false });
  const mods = await T.loadModules(pathToFileURL(path.join(tmpJs, 'js') + '/').href);
  const opts = { lat: place.spot.forecastPoint.lat, lon: place.spot.forecastPoint.lon, levels: constants.levels, placeName: place.tide.place, spotShort: place.spot.short, days: 8 };
  const n = Math.max(8, ctx.site.dayPages || 0);
  const days = T.computeDays(mods, { ...opts, model, P, from: ctx.now, n });
  return { files, cssMin, model, P, modelId, constants, graph, data, report, mods, opts, days, dayKeys: (ctx.site.dayPages ? days.slice(0, ctx.site.dayPages) : []).map((d) => d.key) };
}

const pagePath = (place) => `${place.slug}/`;

// Where each day lives: tomorrow at tide-times/tomorrow/, other days at tide-times/YYYY-MM-DD/.
export const honesty = (place, info) => place.tide.honestyTpl.replace('{hw}', info.P.diffs.hw_spring_min).replace('{lw}', info.P.diffs.lw_spring_min);

export function dayLinks(place, info) {
  const base = `${place.slug}/${DAY_BASE}`, tomorrowKey = info.dayKeys[1];
  const target = (d) => (!info.dayKeys.includes(d.key) ? null : d.key === tomorrowKey ? `${base}tomorrow/` : `${base}${d.key}/`);
  return { base, tomorrowKey, target, rel: (from, d) => { const t = target(d); return t ? rel(from, t) : null; } };
}

function pageMeta(ctx, place) {
  return { path: pagePath(place), title: ctx.fullTitle(place.seo.title), ogTitle: place.seo.title, description: place.seo.description, og: { path: `og/${place.slug}.png`, width: 1200, height: 630, alt: `${place.card.title}: the swimming steps at ${place.spot.short} drawn at the predicted water level, with Croagh Patrick behind` } };
}

export function html(ctx, place, info, pr) {
  const snap = pr?.snap;
  const doc = parse(info.files['index.html']);
  const page = pageMeta(ctx, place);
  const S = place.spot, d0 = info.days[0], F = T.fmt(info.mods.util);
  doc.documentElement.setAttribute('lang', ctx.site.lang);

  // ---- head
  const pre = [
    ...['https://api.open-meteo.com', 'https://marine-api.open-meteo.com', 'https://erddap.marine.ie'].map((u) => `<link rel="preconnect" href="${u}" crossorigin>`),
    ...info.graph.map((f) => `<link rel="modulepreload" href="${f}">`),
    ...info.data.map((f) => `<link rel="preload" href="${f}" as="fetch" crossorigin>`),
  ];
  page.jsonld = ldPage(ctx.site, page, { about: place.jsonld, crumbs: [{ path: '', label: ctx.site.brand }, { path: page.path, label: place.name }], modified: ctx.isoDay });
  applyHead(doc, ctx.site, page, { before: pre, after: [`<style>${ctx.css.site}${ctx.css.tide}</style>`, '<noscript><style>.hero{background:#0b1622 url(poster.webp) center/cover no-repeat}.scrub,.heroActions{display:none}</style></noscript>'] });
  for (const j of doc.head.querySelectorAll('link[rel="modulepreload"]')) if (j.getAttribute('href') === 'js/app.js') j.remove(); // app.js is the entry script itself

  // ---- hero: time label, the estimate's honesty, then the snapshot (if any)
  one(doc, '#when').textContent = snap?.verdict ? `As of ${F.day(snap.when)}, ${F.hm(snap.when)}` : '\u00a0';
  insertAfter(doc, one(doc, '#correctedNote'), `<div class="est">Depth ±${S.uncertaintyM} m: an estimate, not a measurement. <a href="#tell">Tell us where the water was</a></div>`);
  insertAfter(doc, one(doc, 'header#hero'), `<aside class="tellBand" aria-label="Help calibrate this page"><p><b>Every depth here is worked out, not measured (±${S.uncertaintyM} m).</b> At the steps? Say where the water was and this page gets better.</p><a class="btn" href="#tell">Tell us where the water was</a></aside>`);

  // ---- tide times, server-rendered, first thing in <main>
  const L = dayLinks(place, info);
  const blk = T.placeTidesBlock(info.mods, { ...info.opts, model: info.model, P: info.P, from: ctx.now, dayHref: (d) => L.rel(page.path, d), nav: { day: (d) => L.rel(page.path, d), all: rel(page.path, L.base), allN: info.dayKeys.length } });
  const cdOff = (place.tide.chartDatumBelowMsl - info.P.msl_odm).toFixed(1);
  const dt = info.P.diffs;
  place.tide.honesty = honesty(place, info);
  const cfg = { builtDay: d0.key, module: rel(page.path, 'assets/tides.mjs'), opts: info.opts, dayKeys: info.dayKeys, dayBase: DAY_BASE };
  insertBefore(doc, doc.querySelector('main').firstElementChild, `<section id="tides">
  ${crumbs(page.path, [{ path: '', label: ctx.site.brand }, { path: page.path, label: place.name }])}
  <h1>${esc(place.seo.h1)}</h1>
  <div id="tidesBlock">${blk.html}</div>
  <p class="small">Irish time. Heights are metres above or below OD Malin, the Irish land-survey datum, which sits within a few centimetres of mean sea level here; for heights above chart datum, as on Admiralty charts, add about ${cdOff} m. ${esc(place.tide.honesty)} Weather can push the real tide tens of centimetres either way. <a href="#dOffset">From Roonagh to the Point</a> · <a href="${rel(page.path, 'clew-bay/tide-times/')}">Elsewhere in Clew Bay</a></p>
  <script type="application/json" id="tidesConfig">${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>
</section>`);

  // ---- "Tell us where the water was": the check tool, out of the deep section and up the page
  const chk = one(doc, 'details#dCheck');
  const body = chk.querySelector('div') || chk.lastElementChild;
  chk.remove();
  insertAfter(doc, one(doc, 'section#today'), `<section id="tell"><p class="kicker">Calibration, by the people who swim here</p><h2>Tell us where the water was</h2>
  <p class="lede">The depth on this page is a sum: predicted tide minus the height of the seabed from a 2011 survey. Nobody has measured it at the steps, and it could be out by ${S.uncertaintyM} m either way. Every sighting of where the water actually was, and when, pins it down.</p><div id="dCheck"></div>
  <p class="small">Saved in this browser only, for now; nothing is sent anywhere. Your own sightings can correct the page for you (the switch is under "Your dips"). To pool them, export your log there and pass the file on${ctx.site.contactEmail ? ` to <a href="mailto:${esc(ctx.site.contactEmail)}">${esc(ctx.site.contactEmail)}</a>` : ''}. A shared sightings store may follow, and the exported files are already in its format.</p></section>`);
  const holder = one(doc, '#dCheck');
  while (body.firstChild) holder.append(body.firstChild);

  // ---- the app's stylesheet, inlined (one render-blocking request fewer)
  const appCss = doc.head.querySelector('link[rel="stylesheet"][href="css/swim.css"]');
  if (appCss && info.cssMin) { const st = doc.createElement('style'); st.textContent = info.cssMin; appCss.replaceWith(st); }
  // ---- accessible names that start with the visible label (WCAG 2.5.3)
  for (const b of doc.querySelectorAll('button[aria-label]')) { const t = b.textContent.trim(), l = b.getAttribute('aria-label'); if (t.length > 1 && !l.toLowerCase().includes(t.toLowerCase())) b.setAttribute('aria-label', `${t}: ${l.charAt(0).toLowerCase()}${l.slice(1)}`); }
  // ---- withheld data: hide what depends on it, say why
  if (place.withhold?.flood) {
    const fig = doc.querySelector('#floodSvg')?.closest('figure');
    if (fig) { fig.setAttribute('hidden', ''); insertAfter(doc, fig, `<p class="note">The OPW's coastal flood maps for the Quay are on <a href="https://www.floodinfo.ie/" rel="noopener">floodinfo.ie</a>. Their licence (CC BY-NC-ND 4.0) does not allow a redrawn copy, so the map that goes here is left out for now.</p>`); }
  }
  // ---- credit the forecast where it is shown (Open-Meteo asks for a link next to its data)
  const cond = doc.querySelector('#conditions p.small');
  if (cond) insertAfter(doc, cond, '<p class="small">Weather data by <a href="https://open-meteo.com/" rel="noopener">Open-Meteo.com</a> (CC BY 4.0). Sea temperature: Marine Institute (CC BY 4.0) and Météo-France via Open-Meteo.</p>');
  if (pr?.webp) for (const img of doc.querySelectorAll('img[src]')) { const w = pr.webp[img.getAttribute('src')]; if (w) img.setAttribute('src', w); }

  // ---- small fixes: lazy images below the fold, a note for no-JS visitors
  for (const img of doc.querySelectorAll('main img')) { img.setAttribute('loading', 'lazy'); img.setAttribute('decoding', 'async'); }
  const cards = doc.querySelector('#conditions .cards');
  if (cards) insertAfter(doc, cards, '<noscript><p class="small">The live wind, air and water temperature need JavaScript; the tide tables above do not.</p></noscript>');

  // ---- footer: the app's own footer note, then the site's attribution footer
  const foot = doc.querySelector('body > footer') || (() => { const f = doc.createElement('footer'); doc.querySelector('main').after(f); return f; })();
  append(doc, foot, footer(page.path, ctx.site, { sources: place.attribution, places: ctx.places, safety: `<b>Predictions and estimates, not measurements.</b> There is no lifeguard at ${esc(S.short)}. Look before you go in, and heed any "Do Not Swim" notice.` }));
  append(doc, doc.body, `<script type="module" src="${rel(page.path, 'assets/tide-client.js')}"></script>`);

  // ---- the snapshot: the app's own rendering, copied in (the live app redoes it on load)
  if (snap) inject(doc, snap);
  return { page, html: serialize(doc) };
}

function inject(doc, snap) {
  const set = (sel, v) => { if (!v) return; const e = doc.querySelector(sel); if (!e) return; if (v.html != null) e.innerHTML = v.html; for (const [k, val] of Object.entries(v.attrs || {})) if (val != null) e.setAttribute(k, val); };
  for (const s of SPEC) if (!s.all && s.key !== 'hero') set(s.sel, snap[s.key]);
  if (snap.hero?.attrs?.['data-tone']) doc.querySelector('#hero').setAttribute('data-tone', snap.hero.attrs['data-tone']);
  const fill = (sel, list) => { const els = [...doc.querySelectorAll(sel)]; if (!list || list.length !== els.length) return false; els.forEach((e, i) => { e.textContent = list[i]; }); return true; };
  if (snap.nums && !fill('span[id^="n"]', snap.nums)) console.warn('  snapshot: number spans changed shape, left as built');
  if (snap.cites && !fill('a.cite', snap.cites)) console.warn('  snapshot: citation links changed shape, left as built');
}

export async function prerender(ctx, place, info, browser) {
  const url = ctx.serverUrl + place.slug + '/';
  // 1) the page as a visitor would get it, with no network beyond our own files: tide only, no
  //    weather, so nothing time-sensitive except the clearly labelled "as of" hero gets baked in
  const s = await open(browser, url);
  await s.page.waitForFunction(() => document.querySelector('#verdict')?.textContent !== '…' && document.querySelector('#yearText')?.textContent && document.querySelectorAll('#sourceList li').length, null, { timeout: 45000 });
  const snap = await extract(s.page, SPEC);
  snap.when = await s.page.evaluate(() => Date.now());
  const poster = await s.page.evaluate(() => document.querySelector('#heroCanvas').toDataURL('image/webp', 0.8));
  // PNGs in the page, re-encoded as WebP (same pixels, a fraction of the bytes)
  const pngs = [...new Set([...info.files['index.html'].matchAll(/<img[^>]+src="(data\/[\w-]+\.png)"/g)].map((m) => m[1]))];
  const webp = {};
  for (const src of pngs) {
    const url = await s.page.evaluate(async (src) => { const i = new Image(); i.src = src; await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); return c.toDataURL('image/webp', 0.9); }, src);
    const dst = src.replace(/\.png$/, '.webp'); saveDataUrl(url, path.join(ctx.dist, place.slug, dst)); webp[src] = dst;
  }
  // 2) the day charts, drawn by the app's own chart code
  const want = info.days.filter((d) => info.dayKeys.includes(d.key)).map((d) => ({ key: d.key, t0: d.t0, t1: d.t1 }));
  const charts = await s.page.evaluate(async ({ want, levels, colors, spot }) => {
    const { drawDay } = await import(new URL('js/chart.js', location.href).href);
    const { makePoint } = await import(new URL('js/point.js', location.href).href);
    const [model, P] = await Promise.all(['data/tide_model.json', 'data/point.json'].map((f) => fetch(f).then((r) => r.json())));
    const pt = makePoint(model, P), out = {};
    for (const d of want) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); drawDay(svg, { t0: d.t0, t1: d.t1, pt, levels, chosen: 'swim', colors, spot, now: 0 }); out[d.key] = svg.outerHTML; }
    return out;
  }, { want, levels: info.constants.levels, colors: info.constants.colors, spot: { lat: place.spot.forecastPoint.lat, lon: place.spot.forecastPoint.lon } });
  const problems = s.log.filter((l) => !/blockedbyclient|ERR_BLOCKED_BY_CLIENT|Failed to load resource/i.test(l));
  await s.close();
  // 3) the share card: the app's own card (its Share button) for the next good swim, framed 1200x630
  const at = info.cardAt || cardMoment(info);
  const c = await open(browser, `${url}?at=${at}`, { viewport: { width: 1200, height: 900 }, mobile: false });
  await c.page.waitForFunction(() => document.querySelector('#verdict')?.textContent !== '…', null, { timeout: 30000 });
  // headless Linux has neither Georgia nor Apple's UI font, which the card asks for: lend it the site's
  await c.page.evaluate(async (base) => {
    for (const [fam, file, w] of [['Georgia', 'fraunces-latin.woff2', '400 900'], ['-apple-system', 'inter-latin.woff2', '400 700']]) { const f = new FontFace(fam, `url(${base}${file})`, { weight: w }); await f.load(); document.fonts.add(f); }
  }, ctx.serverUrl + 'assets/fonts/');
  await c.page.click('#shareBtn');
  await c.page.click('#cardFormat [data-f="square"]');
  await c.page.waitForFunction(() => (document.querySelector('#cardImg')?.src || '').startsWith('data:image/png'), null, { timeout: 15000 });
  const cardSrc = await c.page.evaluate(() => document.querySelector('#cardImg').src);
  const thumb = await c.page.evaluate(async (src) => { // the card's picture, without its words, for the home page
    const i = new Image(); i.src = src; await i.decode(); const cv = document.createElement('canvas'); cv.width = 600; cv.height = 315;
    cv.getContext('2d').drawImage(i, 35, 0, 1010, 530, 0, 0, 600, 315); return cv.toDataURL('image/webp', 0.84);
  }, cardSrc);
  const og = await composeCard(c.page, { panel: { card: cardSrc, title: place.card.title, subtitle: place.card.subtitle, line: `High and low water for the week, and the depth at the steps. Rebuilt every morning.` }, brand: `${ctx.site.brand} · ${place.name}`, fontBase: ctx.serverUrl + 'assets/fonts/' });
  await c.close();
  return { snap, poster, charts, og, thumb, webp, ogAt: at, problems };
}

// the next swim window with some light in it, else the next daytime high water (Irish local "YYYY-MM-DDTHH:MM")
function cardMoment(info) {
  const { util } = info.mods;
  for (const lvl of ['swim', 'dip', 'wade']) for (const d of info.days) for (const w of d.win[lvl] || []) if (w.light !== 'dark') return local(util, (w.start + w.end) / 2);
  const hw = info.days.flatMap((d) => d.ext.filter((e) => e.high)).find((e) => util.sunPosition(e.t, info.opts.lat, info.opts.lon).alt > 0);
  return local(util, hw ? hw.t : info.days[0].mid);
}
function local(util, t) { const p = util.localParts(t), z = (n) => String(n).padStart(2, '0'); return `${p.y}-${z(p.mo)}-${z(p.d)}T${z(p.h)}:${z(p.mi)}`; }

export const provisional = (ctx, place, info) => html(ctx, place, info, null).html;

// What may be reused from an earlier build if a later prerender fails: the share card, thumbnail,
// day charts (keyed by date) and the parts of the snapshot that don't move with the tide. The hero
// verdict, windows and tables are left to the live app (and the server-rendered tide tables).
const STATIC_SNAP = ['sourceList', 'datumFig', 'roseFig', 'climFig', 'futureChart', 'slrTable', 'futureText', 'yearText', 'cites'];
export function cacheable(pr) {
  return { snap: Object.fromEntries(STATIC_SNAP.filter((k) => pr.snap?.[k]).map((k) => [k, pr.snap[k]])), charts: pr.charts, og: pr.og, thumb: pr.thumb, poster: pr.poster };
}

export function write(ctx, place, info, pr) {
  const { page, html: out } = html(ctx, place, info, pr);
  const dir = path.join(ctx.dist, place.slug);
  fs.writeFileSync(path.join(dir, 'index.html'), out);
  if (pr?.poster) saveDataUrl(pr.poster, path.join(dir, 'poster.webp'));
  if (pr?.og) saveDataUrl(pr.og, path.join(ctx.dist, 'og', `${place.slug}.png`));
  const pages = [{ ...page, lastmod: ctx.isoDay, priority: 1 }];
  if (ctx.site.dayPages) pages.push(...dayPages(ctx, place, info, pr));
  return pages;
}

// ------------------------------------------------------------------ the day pages
function dayPages(ctx, place, info, pr) {
  const F = T.fmt(info.mods.util), S = place.spot, P = info.P, L = dayLinks(place, info);
  const days = info.days.filter((d) => info.dayKeys.includes(d.key));
  const og = pageMeta(ctx, place).og;
  const base = L.base;
  const out = [];
  const shell = (meta, bodyHtml, ld) => {
    const doc = parse(`<!doctype html><html lang="${ctx.site.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title></title><meta name="theme-color" content="#0b1622"></head><body class="site"><div class="wrap">${bodyHtml}</div></body></html>`);
    applyHead(doc, ctx.site, { ...meta, og, ogTitle: meta.ogTitle || meta.title, jsonld: ld }, { after: [`<style>${ctx.css.site}${ctx.css.tide}</style>`] });
    return serialize(doc);
  };
  const writePage = (meta, body, ld) => { fs.mkdirSync(path.join(ctx.dist, meta.path), { recursive: true }); fs.writeFileSync(path.join(ctx.dist, meta.path, 'index.html'), shell(meta, body, ld)); };
  const crumbsFor = (p, label) => [{ path: '', label: ctx.site.brand }, { path: `${place.slug}/`, label: place.name }, { path: base, label: 'Tide times' }, ...(label ? [{ path: p, label }] : [])];
  const foot = (p) => `<footer>${footer(p, ctx.site, { sources: ['mi-tides', 'osm'], places: ctx.places, safety: `<b>Predictions, not measurements.</b> Weather can move the tide by tens of centimetres. There is no lifeguard at ${esc(S.short)}.` })}</footer>`;
  const cdOff = (place.tide.chartDatumBelowMsl - P.msl_odm).toFixed(1);
  place.tide.honesty = honesty(place, info);
  const clip = (t, n = 160) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t);
  const nav = (p) => T.dayNav(F, days, { day: (d) => L.rel(p, d), all: rel(p, base), allN: days.length });

  // the body of one day (used by the dated page and by "tomorrow")
  const dayBody = (p, d, h1, lede, crumbItems) => {
    const nice = F.long(d.mid), i = days.indexOf(d), prev = days[i - 1], next = days[i + 1];
    const chart = pr?.charts?.[d.key] ? pr.charts[d.key].replace('<svg', `<svg role="img" aria-label="Depth of water at the foot of the steps at ${esc(S.short)} through ${esc(nice)}"`) : '';
    return `<main>${crumbs(p, crumbItems)}
<h1>${esc(h1)}</h1>
<p class="lede">${esc(lede)}</p>
${T.dayTable(F, d, { caption: `${place.tide.place}, ${nice}. Heights in metres above OD Malin; "at the steps" is the depth at the foot of the swimming steps at ${S.short}.` })}
<p class="small">Heights are metres above or below OD Malin (about mean sea level); add about ${cdOff} m for heights above chart datum. Times are Irish time. ${esc(place.tide.honesty)}</p>
${nav(p)}
<h2>Water at the steps at ${esc(S.short)}</h2>
<p>${esc(T.spotSentence(F, d, { ...info.opts }))} Depths are estimates, good to about ±${S.uncertaintyM} m.</p>
${chart ? `<figure class="fig">${chart}<figcaption>Depth of water at the foot of the steps through the day (midnight to midnight). Shaded: a metre or more, enough to swim. Grey bands: night and twilight. Dashed lines: wade (${info.constants.levels.wade} m), dip (${info.constants.levels.dip} m) and swim (${info.constants.levels.swim} m).</figcaption></figure>` : ''}
${T.windowsList(F, d, { levels: info.constants.levels })}
<h2>Light and moon</h2>
<p>${esc(T.lightLine(F, d))}</p>
<p class="note">For the live picture (the depth right now, wind, chop and water temperature), and how all of this is worked out, see <a href="${rel(p, place.slug + '/')}">${esc(S.question)}</a>. Elsewhere in the bay: <a href="${rel(p, 'clew-bay/tide-times/')}">Clew Bay tide times</a>.</p>
<nav class="pager" aria-label="Other days">${prev ? `<a href="${L.rel(p, prev)}" rel="prev">← ${esc(F.day(prev.mid))}</a>` : '<span></span>'}<a href="${rel(p, base)}">All ${days.length} days</a>${next ? `<a href="${L.rel(p, next)}" rel="next">${esc(F.day(next.mid))} →</a>` : '<span></span>'}</nav></main>
${foot(p)}`;
  };

  days.forEach((d) => {
    const p = `${base}${d.key}/`, nice = F.long(d.mid), times = T.timesSentence(F, d);
    const isTomorrow = d.key === L.tomorrowKey;
    const meta = { path: p, title: ctx.fullTitle(`${place.name} tide times ${F.longNoYear(d.mid)}: high and low tide`),
      description: T.fitDesc([`High tide at ${place.tide.place} on ${nice}: ${times.replace(/^high tide /, '')} (Irish time).`, T.TIDE_SHORT[d.tides], `With the depth at the swimming steps at ${S.short}.`]),
      // tomorrow's date has its own page, tide-times/tomorrow/: this copy points there
      ...(isTomorrow ? { canonical: `${base}tomorrow/`, index: false } : {}) };
    const crumbItems = crumbsFor(p, F.day(d.mid));
    writePage(meta, dayBody(p, d, `${place.name} tide times, ${nice}`, T.todaySentence(F, d, info.opts), crumbItems), ldPage(ctx.site, meta, { about: place.jsonld, crumbs: crumbItems, modified: ctx.isoDay }));
    out.push({ ...meta, og, lastmod: ctx.isoDay, priority: 0.6 });
  });

  // tomorrow: its own address, for "high tide Westport tomorrow"
  if (days[1]) {
    const d = days[1], p = `${base}tomorrow/`, ln = F.longNoYear(d.mid);
    const shift = T.shiftSentence(F, days[0], d);
    const meta = { path: p, title: ctx.fullTitle(`High tide ${place.name} tomorrow (${ln}): high and low water`), ogTitle: `High tide ${place.name} tomorrow`,
      description: T.fitDesc([`Tomorrow, ${ln}, high tide at ${place.tide.place} is at ${d.ext.filter((e) => e.high).map((e) => F.hm(e.t)).join(' and ')} and low tide at ${d.ext.filter((e) => !e.high).map((e) => F.hm(e.t)).join(' and ')} (Irish time).`, T.TIDE_SHORT[d.tides], `About ${shift.replace(/^about /, '')}.`]) };
    const crumbItems = crumbsFor(p, 'Tomorrow');
    writePage(meta, dayBody(p, d, `High tide at ${place.name} tomorrow, ${ln}`, `Tomorrow: ${T.todaySentence(F, d, info.opts).replace(/^High/, 'high')} Tomorrow's tides come ${shift}.`, crumbItems), ldPage(ctx.site, meta, { about: place.jsonld, crumbs: crumbItems, modified: ctx.isoDay }));
    out.push({ ...meta, og, lastmod: ctx.isoDay, priority: 0.8 });
  }

  // the overview: the next N days in one table
  const p = base, title = `${place.name} tide times: high and low tide for the next ${days.length} days`;
  const meta = { path: p, title: ctx.fullTitle(title), description: `High and low tide at ${place.tide.place} for the next ${days.length} days, with heights, springs and neaps, and a page for each day with the depth at ${S.short}.` };
  const crumbItems = crumbsFor(p);
  const body = `<main>${crumbs(p, crumbItems)}
<h1>${esc(title)}</h1>
<p class="lede">Every high and low tide at ${esc(place.tide.place)} from ${esc(F.longNoYear(days[0].mid))} to ${esc(F.longNoYear(days[days.length - 1].mid))}, in Irish time. Tap a day for its chart and the depth at the swimming steps.</p>
${nav(p)}
${T.weekTable(F, days, { caption: `${place.tide.place}: high and low tide, next ${days.length} days. Heights in metres above OD Malin.`, dayHref: (d) => L.rel(p, d) })}
<p class="small">Heights are metres above or below OD Malin (about mean sea level); add about ${cdOff} m for heights above chart datum. ${esc(place.tide.honesty)} Predictions, not measurements: weather can move the tide by tens of centimetres.</p>
<p><a href="${rel(p, place.slug + '/')}">${esc(S.question)} The live page →</a> · <a href="${rel(p, 'clew-bay/tide-times/')}">Clew Bay tide times</a></p></main>
${foot(p)}`;
  writePage(meta, body, ldPage(ctx.site, meta, { about: place.jsonld, crumbs: crumbItems, modified: ctx.isoDay }));
  out.push({ ...meta, og, lastmod: ctx.isoDay, priority: 0.7 });
  return out;
}

// a one-line "now" for the home page
export function teaser(ctx, place, info) {
  const F = T.fmt(info.mods.util), d = info.days[0];
  const hws = d.ext.filter((e) => e.high).map((e) => F.hm(e.t));
  return `Today: high tide ${hws.join(' and ')}. ${T.spotSentence(F, d, info.opts)}`;
}

export const css = () => fs.readFileSync(path.join(HERE, 'tide.css'), 'utf8');
