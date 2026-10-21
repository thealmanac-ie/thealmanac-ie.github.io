// Template "swim-hub": every swim spot on one national map, with today's state of each: the notices
// and water quality (EPA, at build time), the tide, and (live, in the browser) the sea-state word for
// the deep-water spots or the depth story for the depth spots. Spots we left out are on the map too,
// hollow, each with the reason. First instance: /swims/.
import fs from 'node:fs';
import path from 'node:path';
import { esc, ldPage } from '../../lib/html.mjs';
import { rel } from '../../lib/paths.mjs';
import { crumbs, footer } from '../../lib/chrome.mjs';
import { open, composeCard, saveDataUrl } from '../../lib/prerender.mjs';
import { writeStandalone } from '../../lib/standalone.mjs';
import * as T from '../tide-swim/tides.mjs';
import { waterStatus } from '../swim/deep.mjs';

const pagePath = (place) => `${place.slug}/`;

export async function prepare(ctx, place) {
  const dir = path.join(ctx.root, 'places', place.slug);
  const map = JSON.parse(fs.readFileSync(path.join(dir, 'map.json'), 'utf8'));
  fs.mkdirSync(path.join(ctx.dist, pagePath(place)), { recursive: true });
  fs.copyFileSync(path.join(dir, 'map.webp'), path.join(ctx.dist, pagePath(place), 'map.webp'));
  for (const s of place.spots) if (!ctx.places.find((q) => q.slug === s)) throw new Error(`places/${place.slug}: spot "${s}" has no place`);
  return { map, report: [] };
}

function project(map, lat, lon) {
  const [W, S, E, N] = map.bounds, my = (la) => Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360));
  return [((lon - W) / (E - W)) * map.width, ((my(N) - my(lat)) / (my(N) - my(S))) * map.height];
}

const spotOf = (ctx, slug) => ctx.places.find((q) => q.slug === slug);
const where = (q) => (q.swim?.kind === 'deep' ? q.swim.entry : { lat: q.spot.lat, lon: q.spot.lon });
const label = (q) => (q.swim?.kind === 'deep' ? q.name : q.spot.name);

function mapFigure(ctx, place, info, p) {
  const m = info.map;
  const left = place.leftOut.map((s) => { const [x, y] = project(m, s.lat, s.lon); return `<a href="#left-out"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.5" fill="#fff" stroke="#5a6b76" stroke-width="2.2"><title>${esc(s.name)}: left out (below)</title></circle></a>`; }).join('');
  const built = place.spots.map((slug) => {
    const q = spotOf(ctx, slug), [x, y] = project(m, where(q).lat, where(q).lon), L = place.labels?.[slug] || { dx: 10, dy: 4 };
    const fill = q.swim.kind === 'deep' ? '#1d5f73' : '#b5652a';
    return `<a href="${rel(p, q.listing.href)}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${fill}" stroke="#fff" stroke-width="2.5" class="pin" data-slug="${esc(slug)}"/><text x="${(x + L.dx).toFixed(1)}" y="${(y + L.dy).toFixed(1)}"${L.dx < 0 ? ' text-anchor="end"' : ''} font-size="24" font-weight="700" fill="#0f1d26" stroke="#f4efe6" stroke-width="5" paint-order="stroke">${esc(L.text || label(q))}</text></a>`;
  }).join('');
  return `<figure class="fig hubmap"><div class="mapbox"><img src="map.webp" width="${m.width}" height="${m.height}" alt="Map of Ireland with the swim spots marked" decoding="async"><svg viewBox="0 0 ${m.width} ${m.height}" aria-label="Swim spots in Ireland">${left}${built}</svg></div>
<figcaption><span class="k k-deep"></span> deep water: the sea decides · <span class="k k-depth"></span> depth at the steps: the tide decides · <span class="k k-none"></span> left out, for now (below). Relief: EU-DEM via AWS Terrain Tiles.</figcaption></figure>`;
}

function row(ctx, place, slug, p) {
  const q = spotOf(ctx, slug), qi = ctx.info[slug], F = T.fmt(qi.mods.util), d = qi.days[0];
  const href = rel(p, q.listing.href);
  if (q.swim.kind === 'deep') {
    const ws = waterStatus(ctx, q, qi);
    const L = q.swim.epa.map((e) => qi.epa.locations?.[e.id]).find(Boolean), M = q.swim.epa.map((e) => qi.epa.measurements?.[e.id]?.[0]).find(Boolean);
    const water = ws.stop.length ? `<b class="bad">${esc(ws.stop[0].title)}</b>` : ws.warn.length ? `<b class="warn">${esc(ws.warn[0].title.replace(/\?$/, ''))}?</b> ${esc(ws.warn[0].source)}, ${esc(new Date(ws.warn[0].issued).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }))}`
      : ws.none === 'unknown' ? 'Notices not checked' : 'No Do Not Swim notice';
    const cls = L?.current_annual_water_quality_classification ? `${L.current_annual_water_quality_classification.replace(/ Quality$/, '')} (${L.current_annual_classification_year})` : 'not classified';
    const smp = M ? `; last sample ${new Date(Date.parse(M.date)).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}: ${M.status}` : '';
    return `<li class="hubrow deep" id="row-${esc(slug)}"><a class="nm" href="${href}">${esc(q.name)}</a><span class="area">${esc(q.area)} · deep water</span>
<span class="sea" data-slug="${esc(slug)}"><span class="w">Sea: worked out live</span></span>
<span class="wq">${water} · water quality ${esc(cls)}${esc(smp)}</span>
<span class="td">Tide at ${esc(q.tide.stationName)}: ${esc(T.timesSentence(F, d))}</span></li>`;
  }
  // depth (the Point): today's depth story, from the same sums as its own page
  const s = T.spotSentence(F, d, qi.opts);
  return `<li class="hubrow depth" id="row-${esc(slug)}"><a class="nm" href="${href}">${esc(q.spot.name)}, ${esc(q.name)}</a><span class="area">${esc(q.area)} · depth at the steps</span>
<span class="sea">${esc(s)}</span>
<span class="wq">Water quality: on its page (Westport Quay is not an EPA bathing water)</span>
<span class="td">Tide at ${esc(q.tide.place)}: ${esc(T.timesSentence(F, d))}</span></li>`;
}

function meta(ctx, place) {
  return { path: pagePath(place), title: ctx.fullTitle(place.seo.title), ogTitle: place.seo.title, description: place.seo.description,
    og: { path: `og/${place.slug}.png`, width: 1200, height: 630, alt: `${place.seo.h1}: a map of Ireland with the swim spots marked` } };
}

export function html(ctx, place, info) {
  const p = pagePath(place), m = meta(ctx, place);
  const crumbItems = [{ path: '', label: ctx.site.brand }, { path: p, label: 'Swims' }];
  m.jsonld = ldPage(ctx.site, m, { about: place.jsonld, crumbs: crumbItems, modified: ctx.isoDay });
  const deep = place.spots.map((s) => spotOf(ctx, s)).filter((q) => q.swim.kind === 'deep');
  const cfg = { sea: rel(p, 'assets/swim-sea.js'), spots: deep.map((q) => ({ slug: q.slug, entry: q.swim.entry, marine: q.swim.marine, fetch: ctx.info[q.slug].fetch })) };
  const anyEpa = deep.map((q) => ctx.info[q.slug].epa).find(Boolean);
  const body = `<main>${crumbs(p, crumbItems)}
<h1>${esc(place.seo.h1)}</h1>
<p class="lede">${esc(place.intro)}</p>
${mapFigure(ctx, place, info, p)}
<h2>Today</h2>
<ul class="hublist">${place.spots.map((s) => row(ctx, place, s, p)).join('')}</ul>
<p class="small">Sea: our estimate of the chop and swell at each spot now, from the live forecast (<a href="${rel(p, ctx.places.find((q) => q.slug === place.spots[0]).listing.href)}#how">how</a>). Water: the EPA's classification and latest sample, and its notice feed, read ${anyEpa?.fetchedAt ? esc(new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(anyEpa.fetchedAt)).replace(/,/g, '')) : 'at build time'}${anyEpa && anyEpa.source !== 'live' ? ` (${esc(anyEpa.source)} copy)` : ''}. Tide: the Marine Institute's predictions for each spot's station. Irish time.</p>
<noscript><p class="small">The sea-state words need JavaScript; the notices, water quality and tides above don't.</p></noscript>
<h2 id="left-out">Left out, for now</h2>
<p>${esc(place.leftOutNote)}</p>
${place.leftOut.map((s) => `<section class="spot"><h3>${esc(s.name)} <span class="kind kind-none">${s.kind === 'depth' ? 'depth spot' : 'deep water'}</span></h3><p>${esc(s.why)}</p></section>`).join('')}
<script type="application/json" id="hubConfig">${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>
<script type="module" src="${rel(p, 'assets/swim-hub.js')}"></script></main>
<footer>${footer(p, ctx.site, { sources: place.attribution, places: ctx.places, safety: '<b>Estimates and predictions, not observations.</b> Nothing here says a swim is safe: look at the water, and heed any Do Not Swim notice.' })}</footer>`;
  return { page: m, body };
}

export async function prerender(ctx, place, info, browser) {
  const map = 'data:image/webp;base64,' + fs.readFileSync(path.join(ctx.root, 'places', place.slug, 'map.webp')).toString('base64');
  const pins = place.spots.map((slug) => { const q = spotOf(ctx, slug); return { ...where(q), deep: q.swim.kind === 'deep' }; }).map((s) => ({ xy: project(info.map, s.lat, s.lon), deep: s.deep }));
  const c = await open(browser, ctx.serverUrl, { viewport: { width: 1200, height: 700 }, mobile: false });
  const withPins = await c.page.evaluate(async ({ map, pins }) => {
    const i = new Image(); i.src = map; await i.decode(); const cv = document.createElement('canvas'); cv.width = i.width; cv.height = i.height; const g = cv.getContext('2d'); g.drawImage(i, 0, 0);
    for (const p of pins) { g.beginPath(); g.arc(p.xy[0], p.xy[1], 9, 0, 7); g.fillStyle = p.deep ? '#1d5f73' : '#b5652a'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); }
    const t = document.createElement('canvas'); t.width = 600; t.height = 315; const sh = i.width * 315 / 600; t.getContext('2d').drawImage(cv, 0, (i.height - sh) * 0.62, i.width, sh, 0, 0, 600, 315);
    return { card: cv.toDataURL('image/png'), thumb: t.toDataURL('image/webp', 0.84) };
  }, { map, pins });
  const og = await composeCard(c.page, { panel: { card: withPins.card, title: place.card.title, subtitle: place.card.subtitle, line: 'Notices and water quality first, then the tide and the sea. Rebuilt every morning.' }, brand: ctx.site.brand, fontBase: ctx.serverUrl + 'assets/fonts/' });
  await c.close();
  return { og, thumb: withPins.thumb };
}

export const cacheable = (pr) => ({ og: pr.og, thumb: pr.thumb });

export function write(ctx, place, info, pr) {
  const { page, body } = html(ctx, place, info);
  writeStandalone(ctx, page, body, { css: ctx.css.tide + ctx.css.hub + ctx.css.swim });
  if (pr?.og) saveDataUrl(pr.og, path.join(ctx.dist, 'og', `${place.slug}.png`));
  return [{ ...page, lastmod: ctx.isoDay, priority: 0.9 }];
}

export function teaser(ctx, place) {
  const n = place.spots.length;
  return `${n} spots, from the Forty Foot to the Point at Westport; ${place.leftOut.length} more on the map, waiting for a measured number.`;
}
