// Template "tide-hub": an area's tide spots on one page, each labelled for what backs its times:
// an official prediction, a published (sourced) difference, or nothing we could find. Places with
// their own tide pages are linked; spots without a sourced difference get a note and no times.
// First instance: Clew Bay (map from tools/clew-bay-map.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { esc, ldPage } from '../../lib/html.mjs';
import { rel } from '../../lib/paths.mjs';
import { crumbs, footer } from '../../lib/chrome.mjs';
import { open, composeCard, saveDataUrl } from '../../lib/prerender.mjs';
import { writeStandalone } from '../../lib/standalone.mjs';
import * as T from '../tide-swim/tides.mjs';

const pagePath = (place) => `${place.slug}/tide-times/`;
const KIND = { official: 'Official prediction', sourced: 'From a published difference', none: 'No published times' };

export async function prepare(ctx, place) {
  const dir = path.join(ctx.root, 'places', place.slug);
  const map = JSON.parse(fs.readFileSync(path.join(dir, 'map.json'), 'utf8'));
  fs.mkdirSync(path.join(ctx.dist, pagePath(place)), { recursive: true });
  fs.copyFileSync(path.join(dir, 'map.webp'), path.join(ctx.dist, pagePath(place), 'map.webp'));
  return { map, report: [] };
}

function project(map, lat, lon) {
  const [W, S, E, N] = map.bounds, my = (la) => Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360));
  return [((lon - W) / (E - W)) * map.width, ((my(N) - my(lat)) / (my(N) - my(S))) * map.height];
}

function mapFigure(ctx, place, info, p) {
  const m = info.map, hrefOf = (s) => (s.place ? rel(p, ctx.places.find((q) => q.slug === s.place).listing.href) : `#${s.id}`);
  const marks = place.spots.map((s) => {
    const [x, y] = project(m, s.lat, s.lon), right = x < m.width * 0.7;
    const dot = s.kind === 'official' ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#0f1d26" stroke="#fff" stroke-width="2"/>`
      : s.kind === 'sourced' ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#2a7fb8" stroke="#fff" stroke-width="2"/>`
        : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#fff" stroke="#5a6b76" stroke-width="2"/>`;
    const lx = right ? x + 11 : x - 11, anchor = right ? 'start' : 'end';
    return `<a href="${hrefOf(s)}">${dot}<text x="${lx.toFixed(1)}" y="${(y + 4.5).toFixed(1)}" text-anchor="${anchor}" font-size="15" font-weight="700" fill="#0f1d26" stroke="#f4efe6" stroke-width="4" paint-order="stroke">${esc(s.short || s.name)}</text></a>`;
  }).join('');
  const peak = place.peak ? (() => { const [x, y] = project(m, place.peak.lat, place.peak.lon); return `<a href="${rel(p, place.peak.href)}"><path d="M${x},${y - 9} l8,14 h-16z" fill="#6e5a45" stroke="#fff" stroke-width="1.5"/><text x="${x}" y="${y + 21}" text-anchor="middle" font-size="13" font-style="italic" fill="#3b3a35" stroke="#f4efe6" stroke-width="3" paint-order="stroke">${esc(place.peak.name)}</text></a>`; })() : '';
  return `<figure class="fig hubmap"><div class="mapbox"><img src="map.webp" width="${m.width}" height="${m.height}" alt="Map of ${esc(place.name)}, with its tide spots marked" decoding="async"><svg viewBox="0 0 ${m.width} ${m.height}" aria-label="Tide spots in ${esc(place.name)}">${peak}${marks}</svg></div>
<figcaption><span class="k k-official"></span> official prediction · <span class="k k-sourced"></span> from a published tidal difference · <span class="k k-none"></span> nothing published. Relief: EU-DEM via AWS Terrain Tiles; water: © OpenStreetMap contributors.</figcaption></figure>`;
}

function meta(ctx, place) {
  return { path: pagePath(place), title: ctx.fullTitle(place.seo.title), ogTitle: place.seo.title, description: place.seo.description,
    og: { path: `og/${place.slug}.png`, width: 1200, height: 630, alt: `${place.seo.h1}: a map of the bay with its tide spots` } };
}

export function html(ctx, place, info) {
  const p = pagePath(place), m = meta(ctx, place);
  const crumbItems = [{ path: '', label: ctx.site.brand }, { path: p, label: place.name }];
  m.jsonld = ldPage(ctx.site, m, { about: place.jsonld, crumbs: crumbItems, modified: ctx.isoDay });
  // today's and tomorrow's times for every spot that has them (two short sections: fits a phone)
  const have = place.spots.filter((s) => s.place && ctx.info[s.place]?.days);
  let table = '';
  if (have.length) {
    const F = T.fmt(ctx.info[have[0].place].mods.util);
    const cell = (d, hi) => d.ext.filter((e) => e.high === hi).map((e) => F.hm(e.t)).join('<br>') || '–';
    const section = (k, label) => `<tbody><tr class="sec"><th scope="colgroup" colspan="3">${label}, ${esc(F.longNoYear(ctx.info[have[0].place].days[k].mid))}</th></tr>${have.map((s) => {
      const d = ctx.info[s.place].days[k], href = rel(p, ctx.places.find((q) => q.slug === s.place).listing.href);
      return `<tr><th scope="row"><a href="${href}">${esc(s.short || s.name)}</a><span class="tw">${KIND[s.kind].toLowerCase()}</span></th><td>${cell(d, true)}</td><td>${cell(d, false)}</td></tr>`;
    }).join('')}</tbody>`;
    table = `<table class="tt week hub"><caption>High and low tide today and tomorrow, Irish time. The other spots have no published times (below).</caption><thead><tr><th scope="col">Where</th><th scope="col">High tide</th><th scope="col">Low tide</th></tr></thead>${section(0, 'Today')}${section(1, 'Tomorrow')}</table>`;
  }
  const spots = place.spots.map((s) => `<section class="spot" id="${s.id}"><h3>${esc(s.name)} <span class="kind kind-${s.kind}">${KIND[s.kind]}</span></h3><p>${s.note}</p>${s.place ? `<p><a href="${rel(p, ctx.places.find((q) => q.slug === s.place).listing.href)}">${esc(ctx.places.find((q) => q.slug === s.place).listing.linkText)} →</a></p>` : ''}</section>`).join('');
  const body = `<main>${crumbs(p, crumbItems)}
<h1>${esc(place.seo.h1)}</h1>
<p class="lede">${place.intro}</p>
${mapFigure(ctx, place, info, p)}
${table}
<h2>Spot by spot</h2>
${spots}
<p class="small">${place.footnote}</p></main>
<footer>${footer(p, ctx.site, { sources: place.attribution, places: ctx.places, safety: '<b>Predictions, not measurements.</b> Wind and air pressure can move the tide by tens of centimetres.' })}</footer>`;
  return { page: m, body };
}

export async function prerender(ctx, place, info, browser) {
  const map = 'data:image/webp;base64,' + fs.readFileSync(path.join(ctx.root, 'places', place.slug, 'map.webp')).toString('base64');
  const c = await open(browser, ctx.serverUrl, { viewport: { width: 1200, height: 700 }, mobile: false });
  const og = await composeCard(c.page, { scene: map, anchor: place.card.anchor ?? 0.5, ax: place.card.ax, brand: `${ctx.site.brand} · ${place.name}`, title: place.card.title, subtitle: place.card.subtitle, fontBase: ctx.serverUrl + 'assets/fonts/' });
  const thumb = await c.page.evaluate(async (map) => { const i = new Image(); i.src = map; await i.decode(); const cv = document.createElement('canvas'); cv.width = 600; cv.height = 315; const sh = i.width * 315 / 600; cv.getContext('2d').drawImage(i, 0, (i.height - sh) / 2, i.width, sh, 0, 0, 600, 315); return cv.toDataURL('image/webp', 0.84); }, map);
  await c.close();
  return { og, thumb };
}

export function write(ctx, place, info, pr) {
  const { page, body } = html(ctx, place, info);
  writeStandalone(ctx, page, body, { css: ctx.css.tide + ctx.css.hub });
  if (pr?.og) saveDataUrl(pr.og, path.join(ctx.dist, 'og', `${place.slug}.png`));
  return [{ ...page, lastmod: ctx.isoDay, priority: 0.8 }];
}

export function teaser(ctx, place) {
  return `${place.spots.filter((s) => s.kind !== 'none').length} spots with sourced times, ${place.spots.filter((s) => s.kind === 'none').length} where nobody publishes them.`;
}

export const css = () => fs.readFileSync(new URL('./hub.css', import.meta.url), 'utf8');
