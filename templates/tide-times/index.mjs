// Template "tide-times": tide times only, for a place that is itself a Marine Institute station (or,
// later, one reached from a station by a published tidal difference). One page per place, with today,
// the next week, a three-day tide curve and 30 days in a table. First instance: Louisburgh, whose
// station is Roonagh Pier. No swim spot, no live app: everything is in the HTML.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { esc, ldPage } from '../../lib/html.mjs';
import { rel } from '../../lib/paths.mjs';
import { crumbs, footer } from '../../lib/chrome.mjs';
import { open, composeCard, saveDataUrl } from '../../lib/prerender.mjs';
import { writeStandalone } from '../../lib/standalone.mjs';
import * as T from '../tide-swim/tides.mjs';

const pagePath = (place) => `${place.slug}/tide-times/`;

export async function prepare(ctx, place) {
  const appDir = path.join(ctx.root, 'vendor', place.app), over = path.join(ctx.root, 'places', place.slug, 'app');
  const modelFile = [path.join(over, 'data', 'tide_model.json'), path.join(appDir, 'data', 'tide_model.json')].find((f) => fs.existsSync(f));
  const model = JSON.parse(fs.readFileSync(modelFile, 'utf8'));
  const mods = await T.loadModules(pathToFileURL(path.join(appDir, 'js') + '/').href);
  const opts = { mode: place.tide.mode, lat: place.location.lat, lon: place.location.lon, placeName: place.tide.place };
  const days = T.computeDays(mods, { ...opts, model, from: ctx.now, n: 30 });
  fs.mkdirSync(path.join(ctx.dist, pagePath(place)), { recursive: true });
  return { model, mods, opts, days, report: [] };
}

// The next three days as a tide curve: height above the station's datum, night shaded.
function curve(info, F) {
  const { tide, util } = info.mods, predict = tide.makePredictor(info.model);
  const t0 = info.days[0].t0, t1 = info.days[2].t1, W = 380, H = 170, L = 30, R = 8, Tp = 18, B = 24;
  const X = (t) => L + (W - L - R) * (t - t0) / (t1 - t0), Y = (h) => Tp + (H - Tp - B) * (1 - h / 5);
  let night = '';
  for (let t = t0; t < t1; t += 20 * 60000) { const alt = util.sunPosition(t + 10 * 60000, info.opts.lat, info.opts.lon).alt; if (alt < -0.833) night += `<rect x="${X(t).toFixed(1)}" y="${Tp}" width="${(X(t + 20 * 60000) - X(t) + 0.3).toFixed(1)}" height="${H - Tp - B}" fill="#1b2a36" opacity="${alt < -6 ? 0.12 : 0.06}"/>`; }
  let d = '';
  for (let t = t0, i = 0; t <= t1; t += 10 * 60000, i++) d += `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(predict(t)).toFixed(1)}`;
  const grid = [0, 1, 2, 3, 4, 5].map((h) => `<line x1="${L}" x2="${W - R}" y1="${Y(h)}" y2="${Y(h)}" stroke="#e3dccf"/><text x="${L - 5}" y="${Y(h) + 3.5}" text-anchor="end" font-size="9.5" fill="#5a6b76">${h} m</text>`).join('');
  const days = info.days.slice(0, 3).map((day) => `<line x1="${X(day.t0)}" x2="${X(day.t0)}" y1="${Tp}" y2="${H - B + 4}" stroke="#9aa7ae"/><text x="${X(day.t0) + 4}" y="${H - 7}" font-size="10.5" font-weight="600" fill="#2c4150">${esc(F.day(day.mid))}</text>`).join('');
  const marks = info.days.slice(0, 3).flatMap((day) => day.ext).map((e) => `<circle cx="${X(e.t).toFixed(1)}" cy="${Y(e.h).toFixed(1)}" r="2.4" fill="#1d5f73"/><text x="${X(e.t).toFixed(1)}" y="${(e.high ? Y(e.h) - 6 : Y(e.h) + 13).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="600" fill="#0f1d26">${F.hm(e.t)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tide height at ${esc(info.opts.placeName)} over the next three days">${night}${grid}<path d="${d}L${X(t1)},${Y(0)}L${X(t0)},${Y(0)}Z" fill="#2a7fb8" opacity=".14"/><path d="${d}" fill="none" stroke="#1d5f73" stroke-width="1.8"/>${days}${marks}</svg>`;
}

function meta(ctx, place) {
  return { path: pagePath(place), title: ctx.fullTitle(place.seo.title), ogTitle: place.seo.title, description: place.seo.description,
    og: { path: `og/${place.slug}.png`, width: 1200, height: 630, alt: `${place.seo.h1}: a map of Clew Bay with ${place.tide.place} marked` } };
}

export function html(ctx, place, info) {
  const F = T.fmt(info.mods.util), p = pagePath(place), m = meta(ctx, place), d = info.days[0], d1 = info.days[1];
  const crumbItems = [{ path: '', label: ctx.site.brand }, { path: p, label: place.name }];
  m.jsonld = ldPage(ctx.site, m, { about: place.jsonld, crumbs: crumbItems, modified: ctx.isoDay });
  const o = { mode: place.tide.mode };
  const body = `<main>${crumbs(p, crumbItems)}
<h1>${esc(place.seo.h1)}</h1>
<p class="note"><b>${esc(place.tide.label)}</b> ${esc(place.tide.honesty)}</p>
<p class="lede"><b>${esc(F.longNoYear(d.mid))}:</b> ${esc(T.todaySentence(F, d, o))}</p>
<p><b>Tomorrow, ${esc(F.longNoYear(d1.mid))}:</b> ${esc(T.timesSentence(F, d1).replace(/^h/, 'H'))}, ${esc(T.shiftSentence(F, d, d1))}.</p>
${T.weekTable(F, info.days.slice(0, 8), { caption: `${place.tide.place}: high and low tide, ${F.day(info.days[0].mid)} to ${F.day(info.days[7].mid)}. Heights in metres above Lowest Astronomical Tide.`, markToday: true, mode: place.tide.mode })}
<figure class="fig">${curve(info, F)}<figcaption>The tide at ${esc(place.tide.place)} over the next three days, in metres above Lowest Astronomical Tide. Grey bands: night.</figcaption></figure>
<p class="small">${esc(T.lightLine(F, d))} Times are Irish time.</p>
<h2>The next 30 days</h2>
${T.weekTable(F, info.days, { caption: `${place.tide.place}: high and low tide for 30 days from ${F.day(info.days[0].mid)}. Heights in metres above Lowest Astronomical Tide.`, mode: place.tide.mode })}
<p class="small">Predictions, not measurements: wind and air pressure can move the tide by tens of centimetres.</p>
<h2>Nearby</h2>
<p>${place.related.map((r) => { const q = ctx.places.find((x) => x.slug === r); return q ? `<a href="${rel(p, q.listing.href || q.slug + '/')}">${esc(q.listing.linkText || q.listing.title)}</a>` : ''; }).filter(Boolean).join(' · ')}</p></main>
<footer>${footer(p, ctx.site, { sources: place.attribution, places: ctx.places, safety: '<b>Predictions, not measurements.</b> Check the conditions before you set out.' })}</footer>`;
  return { page: m, body };
}

export async function prerender(ctx, place, info, browser) {
  const mapFile = path.join(ctx.root, 'places', place.mapFrom || 'clew-bay', 'map.webp');
  const map = 'data:image/webp;base64,' + fs.readFileSync(mapFile).toString('base64');
  const c = await open(browser, ctx.serverUrl, { viewport: { width: 1200, height: 700 }, mobile: false });
  const og = await composeCard(c.page, { scene: map, anchor: place.card.anchor ?? 0.5, ax: place.card.ax, brand: `${ctx.site.brand} · ${place.name}`, title: place.card.title, subtitle: place.card.subtitle, fontBase: ctx.serverUrl + 'assets/fonts/' });
  const thumb = await c.page.evaluate(async ({ map, ax }) => { const i = new Image(); i.src = map; await i.decode(); const cv = document.createElement('canvas'); cv.width = 600; cv.height = 315; const sw = i.width * 0.75, sh = sw * 315 / 600; cv.getContext('2d').drawImage(i, (i.width - sw) * (ax ?? 0.5), (i.height - sh) / 2, sw, sh, 0, 0, 600, 315); return cv.toDataURL('image/webp', 0.84); }, { map, ax: place.card.ax });
  await c.close();
  return { og, thumb };
}

export function write(ctx, place, info, pr) {
  const { page, body } = html(ctx, place, info);
  writeStandalone(ctx, page, body, { css: ctx.css.tide });
  if (pr?.og) saveDataUrl(pr.og, path.join(ctx.dist, 'og', `${place.slug}.png`));
  return [{ ...page, lastmod: ctx.isoDay, priority: 0.8 }];
}

export function teaser(ctx, place, info) {
  const F = T.fmt(info.mods.util), d = info.days[0];
  return `Today at ${place.tide.place}: ${T.timesSentence(F, d)}.`;
}

export const css = () => '';
