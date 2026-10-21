// Template "mountain": can you see the summit today, the forecast for the top, the view from it.
// The interactive page is the Reek lab app (vendor/reek) for the place, with an SEO head, the
// verdict and forecast snapshotted into the HTML at build time (labelled "as of HH:MM"; the live
// app replaces them on load), the whole view from the top as crawlable text, self-hosted fonts.
import fs from 'node:fs';
import path from 'node:path';
import { readApp, writeApp, moduleGraph, startupData, missingIds } from '../../lib/app.mjs';
import { parse, serialize, one, insertAfter, insertBefore, append, applyHead, esc, ldPage } from '../../lib/html.mjs';
import { rel } from '../../lib/paths.mjs';
import { crumbs, footer } from '../../lib/chrome.mjs';
import { open, extract, composeCard, saveDataUrl } from '../../lib/prerender.mjs';
import * as adapter from './adapter.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WEATHER = ['answer', 'answerLine', 'nextWindow', 'glowLine', 'heroCaption', 'chart', 'chartReadout', 'bestWindows', 'climbCard', 'howNow'];
const SPEC = [
  { key: 'answer', sel: '#answer', html: true, attrs: ['data-long'] }, { key: 'answerLine', sel: '#answerLine', html: true }, { key: 'nextWindow', sel: '#nextWindow', html: true },
  { key: 'glowLine', sel: '#glowLine', html: true }, { key: 'heroCaption', sel: '#heroCaption', html: true }, { key: 'hero', sel: '#hero', attrs: ['data-verdict', 'data-tone'] },
  { key: 'chart', sel: '#chart', html: true, attrs: ['viewBox'] }, { key: 'chartReadout', sel: '#chartReadout', html: true }, { key: 'bestWindows', sel: '#bestWindows', html: true },
  { key: 'climbCard', sel: '#climbCard', html: true }, { key: 'howNow', sel: '#howNow', html: true },
  { key: 'sourceList', sel: '#sourceList', html: true }, { key: 'nextReek', sel: '#nextReek', html: true },
  { key: 'panoChips', sel: '#panoChips', html: true }, { key: 'panoSun', sel: '#panoSun', html: true }, { key: 'panoBearing', sel: '#panoBearing', html: true },
  { key: 'placeList', sel: '#placeList', html: true }, { key: 'refs', sel: 'a.ref', all: true },
];

export async function prepare(ctx, place) {
  const { files } = readApp(ctx.root, place.app, place.slug);
  const missing = missingIds(files);
  if (missing.length) throw new Error(`places/${place.slug}: index.html lacks element ids the app needs: ${missing.map((i) => '#' + i).join(', ')}`);
  const graph = moduleGraph(files, 'js/app.js'), data = startupData(files);
  const horizon = JSON.parse(files['data/horizon.json']);
  const report = adapter.apply(files, place);
  await writeApp(files, path.join(ctx.dist, place.slug), { minify: ctx.site.minify });
  const cssMin = fs.readFileSync(path.join(ctx.dist, place.slug, 'css', 'reek.css'), 'utf8');
  return { files, cssMin, graph, data, horizon, report };
}

const pageMeta = (ctx, place) => ({ path: `${place.slug}/`, title: ctx.fullTitle(place.seo.title), ogTitle: place.seo.title, description: place.seo.description,
  og: { path: `og/${place.slug}.png`, width: 1200, height: 630, alt: `${place.name} (${place.nameGa}), its real skyline seen from ${place.viewpoint.name}` } });

export function html(ctx, place, info, pr) {
  const doc = parse(info.files['index.html']);
  const page = pageMeta(ctx, place);
  doc.documentElement.setAttribute('lang', ctx.site.lang);
  const snap = pr?.snap;

  // ---- head: no Google Fonts (self-hosted copies instead), preload what the hero needs
  for (const l of doc.head.querySelectorAll('link')) if (/fonts\.(googleapis|gstatic)\.com/.test(l.getAttribute('href') || '')) l.remove();
  const fontCss = ctx.css.fonts.replace(/url\(([\w.-]+\.woff2)\)/g, (m, f) => `url(${rel(page.path, 'assets/fonts/' + f)})`);
  const pngs = info.horizon?.image?.file ? [`data/${info.horizon.image.file}`] : [];
  const pre = [
    '<link rel="preconnect" href="https://api.open-meteo.com" crossorigin>',
    ...['fraunces-latin.woff2', 'inter-latin.woff2'].map((f) => `<link rel="preload" href="${rel(page.path, 'assets/fonts/' + f)}" as="font" type="font/woff2" crossorigin>`),
    ...info.graph.filter((f) => f !== 'js/app.js').map((f) => `<link rel="modulepreload" href="${f}">`),
    ...info.data.map((f) => `<link rel="preload" href="${f}" as="fetch" crossorigin>`),
    ...pngs.map((f) => `<link rel="preload" href="${f}" as="image">`),
  ];
  page.jsonld = ldPage(ctx.site, page, { about: place.jsonld, crumbs: [{ path: '', label: ctx.site.brand }, { path: page.path, label: place.name }], modified: ctx.isoDay });
  applyHead(doc, ctx.site, page, { before: pre, after: [`<style>${fontCss}${ctx.css.site}${ctx.css.mountain}</style>`, '<noscript><style>.hero{background:#9fb6c9 url(poster.webp) center bottom/cover no-repeat}</style></noscript>'] });

  // ---- the app's stylesheet, inlined (one render-blocking request fewer)
  const appCss = doc.head.querySelector('link[rel="stylesheet"][href="css/reek.css"]');
  if (appCss && info.cssMin) { const st = doc.createElement('style'); st.textContent = info.cssMin; appCss.replaceWith(st); }
  // ---- a group of buttons is not a list (the app's chips)
  const chips = doc.querySelector('#panoChips[role="list"]');
  if (chips) { chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Jump to a place in the view'); }
  // ---- credit the forecast where it is shown (Open-Meteo asks for a link next to its data)
  const fine = doc.querySelector('#days .fine');
  if (fine) append(doc, fine, '<span> Weather data by <a href="https://open-meteo.com/" rel="noopener">Open-Meteo.com</a> (CC BY 4.0).</span>');

  // ---- one h1: the question (the kicker), not the one-word answer; same classes, same look
  const kick = one(doc, '#hero .kicker'), ans = one(doc, '#answer');
  const h1 = doc.createElement('h1'); h1.className = kick.className; h1.innerHTML = esc(place.seo.h1); kick.replaceWith(h1);
  const p = doc.createElement('p'); for (const a of ans.attributes) p.setAttribute(a.name, a.value); p.innerHTML = ans.innerHTML; ans.replaceWith(p);

  // ---- breadcrumbs under the hero, the view from the top as text, the site footer
  const main = doc.querySelector('main');
  insertBefore(doc, main.firstElementChild, `<div class="sec sec-crumbs">${crumbs(page.path, [{ path: '', label: ctx.site.brand }, { path: page.path, label: place.name }])}</div>`);
  if (pr?.cards) insertAfter(doc, one(doc, '#view .fine'), viewList(info.horizon, pr.cards, place));
  const foot = doc.querySelector('body > footer') || (() => { const f = doc.createElement('footer'); main.after(f); return f; })();
  append(doc, foot, footer(page.path, ctx.site, { sources: place.attribution, places: ctx.places, safety: `<b>An estimate from forecasts, not an observation.</b> Mountain weather changes fast; this is not a safety forecast.` }));

  // ---- the snapshot
  if (snap) {
    const ok = ['yes', 'partly', 'no'].includes(snap.hero?.attrs?.['data-verdict']);
    const set = (sel, v) => { if (!v) return; const e = doc.querySelector(sel); if (!e) return; if (v.html != null) e.innerHTML = v.html; for (const [k, val] of Object.entries(v.attrs || {})) { if (val == null) e.removeAttribute(k); else e.setAttribute(k, val); } };
    for (const s of SPEC) { if (s.all || s.key === 'hero') continue; if (!ok && WEATHER.includes(s.key)) continue; set(s.sel, snap[s.key]); }
    if (ok) {
      const h = doc.querySelector('#hero'); for (const [k, v] of Object.entries(snap.hero.attrs)) if (v) h.setAttribute(k, v);
      const line = doc.querySelector('#answerLine');
      line.innerHTML = `<span class="asof">As of ${esc(pr.asOf)}:</span> ${line.innerHTML}`;
    } else {
      doc.querySelector('#answerLine').textContent = 'The verdict comes live from the forecast, which your browser fetches when the page opens.';
    }
    const refs = [...doc.querySelectorAll('a.ref')];
    if (snap.refs?.length === refs.length) refs.forEach((a, i) => { a.textContent = snap.refs[i]; }); else if (ok) console.warn('  snapshot: footnote links changed shape, left as built');
  }
  return { page, html: serialize(doc) };
}

// Every named thing in the view, as the app's own cards (one per feature), grouped by kind.
function viewList(horizon, cards, place) {
  const groups = [['peak', 'Mountains'], ['island', 'Islands'], ['area', 'The bay'], ['town', 'Towns'], ['far', 'Far off']];
  const feats = horizon.features.filter((f) => cards[f.id]);
  const body = groups.map(([k, title]) => {
    const fs_ = feats.filter((f) => f.kind === k).sort((a, b) => a.km - b.km);
    return fs_.length ? `<h3 class="vgroup">${title}</h3>` + fs_.map((f) => `<div class="card pano-card vcard" id="view-${esc(f.id)}">${cards[f.id]}</div>`).join('') : '';
  }).join('');
  return `<details class="places viewlist"><summary>Everything in the view from the top: ${feats.length} names, near and far</summary><p class="fine">What the panorama labels, worked out from elevation data: distance and bearing from the summit of ${esc(place.name)}, whether it is in sight, and the story behind the name where there is one.</p>${body}</details>`;
}

export async function prerender(ctx, place, info, browser) {
  const url = ctx.serverUrl + place.slug + '/';
  const degraded = [];
  // 1) the page with the live forecast. The static parts (sources, the view from the top) never need
  //    the network; the verdict does, and it gets a fixed budget: if the forecast is slow or down, the
  //    page is built without the verdict snapshot (it loads live in the visitor's browser), never blocked.
  const budget = +(process.env.LIVE_BUDGET_MS || 40000);
  const settle = (s, ms) => s.page.waitForFunction(() => { const v = document.querySelector('#hero')?.dataset.verdict; return v && v !== 'loading' && document.querySelectorAll('#sourceList li').length && document.querySelector('#panoSun')?.textContent && v; }, null, { timeout: ms }).then((h) => h.jsonValue(), () => 'timeout');
  let s, v;
  for (let attempt = 1; attempt <= 2; attempt++) {
    s = await open(browser, url, { allow: ['api.open-meteo.com'] });
    v = await settle(s, budget);
    if (v !== 'unknown') break;
    if (attempt === 1) { await s.close(); await new Promise((r) => setTimeout(r, 4000)); } // one retry for a failed (not slow) forecast
  }
  if (v === 'timeout' || v === 'unknown') {
    degraded.push(v === 'timeout' ? `the forecast did not answer within ${budget / 1000} s: no verdict snapshot` : 'the forecast did not load: no verdict snapshot');
    // the rest of the page doesn't need the forecast: load it again offline, where it settles at once
    await s.close();
    s = await open(browser, url);
    v = await settle(s, 30000);
    if (v === 'timeout') throw new Error('the page did not render even offline');
  }
  await s.page.waitForTimeout(300);
  const snap = await extract(s.page, SPEC);
  const asOf = await s.page.evaluate(() => new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).replace(/,/g, ''));
  const ids = info.horizon.features.map((f) => f.id);
  const cards = await s.page.evaluate((ids) => {
    const chips = document.querySelector('#panoChips'), card = document.querySelector('#panoCard'), out = {};
    for (const id of ids) { const b = document.createElement('button'); b.dataset.id = id; chips.append(b); b.click(); if (!card.hidden) out[id] = card.innerHTML; b.remove(); }
    return out;
  }, ids);
  const poster = await s.page.evaluate(() => document.querySelector('#heroCanvas').toDataURL('image/webp', 0.8));
  const problems = s.log.filter((l) => !/blockedbyclient|ERR_BLOCKED_BY_CLIENT|Failed to load resource/i.test(l));
  await s.close();
  // share card: the app's hero at a clear mid-afternoon (no forecast loaded: its "clear" default)
  const c = await open(browser, url + (place.card.query || ''), { viewport: { width: 1200, height: 716 }, mobile: false });
  await c.page.waitForFunction(() => document.querySelector('#hero')?.dataset.verdict === 'unknown', null, { timeout: 30000 });
  await c.page.waitForTimeout(200);
  const thumb = await c.page.evaluate(() => {
    const s = document.querySelector('#heroCanvas'), cv = document.createElement('canvas'); cv.width = 600; cv.height = 315;
    const sh = s.width * 315 / 600; cv.getContext('2d').drawImage(s, 0, s.height - sh, s.width, sh, 0, 0, 600, 315); return cv.toDataURL('image/webp', 0.84);
  });
  const og = await composeCard(c.page, { scene: '#heroCanvas', anchor: 1, brand: `${ctx.site.brand} · ${place.name}`, title: place.card.title, subtitle: place.card.subtitle, fontBase: ctx.serverUrl + 'assets/fonts/' });
  const ogHome = await composeCard(c.page, { scene: '#heroCanvas', anchor: 1, brand: 'Tides, sun, moon and weather', title: ctx.site.brand, subtitle: 'Live and local, place by place', fontBase: ctx.serverUrl + 'assets/fonts/' });
  await c.close();
  return { snap, asOf, cards, poster, og, ogHome, thumb, problems, degraded };
}

export const provisional = (ctx, place, info) => html(ctx, place, info, null).html;

// What may be reused from an earlier build if a later prerender fails: everything except the
// weather (a day-old verdict would be wrong, so the page says the verdict loads live instead).
export function cacheable(pr) {
  const snap = Object.fromEntries(Object.entries(pr.snap || {}).filter(([k]) => !WEATHER.includes(k) && k !== 'hero'));
  return { snap, cards: pr.cards, poster: pr.poster, og: pr.og, ogHome: pr.ogHome, thumb: pr.thumb };
}

export function write(ctx, place, info, pr) {
  const { page, html: out } = html(ctx, place, info, pr);
  const dir = path.join(ctx.dist, place.slug);
  fs.writeFileSync(path.join(dir, 'index.html'), out);
  if (pr?.poster) saveDataUrl(pr.poster, path.join(dir, 'poster.webp'));
  if (pr?.og) saveDataUrl(pr.og, path.join(ctx.dist, 'og', `${place.slug}.png`));
  return [{ ...page, lastmod: ctx.isoDay, priority: 1 }];
}

export function teaser(ctx, place, info, pr) {
  const v = pr?.snap?.hero?.attrs?.['data-verdict'];
  if (!['yes', 'partly', 'no'].includes(v)) return 'The verdict loads live from three weather models.';
  const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return `As of ${pr.asOf}: ${strip(pr.snap.answer.html)} ${strip(pr.snap.answerLine.html)}`;
}

export const css = () => fs.readFileSync(path.join(HERE, 'mountain.css'), 'utf8');
