// Template "swim", kind "deep": a swim spot that is deep at every state of the tide, so what decides
// the swim is the sea (wind chop and swell, by the spot's own coastline), the water quality and any
// notice. One standalone page per spot at swims/<slug>/:
//   - notices first (a Do Not Swim notice or bathing restriction from the EPA, a council closure),
//     timestamped, with their source;
//   - the sea-state estimate, worked out live in the visitor's browser (assets/swim-live.js) from the
//     Open-Meteo forecast and the fetch rose, with the calmest daylight spell; no-JS readers get a note;
//   - the EPA's classification and latest samples, with dates; the tide (station predictions, as they
//     are, with the evidence that the station stands for the spot); the rose; what is measured,
//     predicted and estimated; sources.
// Nothing here needs a live API at build time except the EPA (lib/epa.mjs, which falls back).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { esc, ldPage } from '../../lib/html.mjs';
import { rel } from '../../lib/paths.mjs';
import { crumbs, footer } from '../../lib/chrome.mjs';
import { open, composeCard, saveDataUrl } from '../../lib/prerender.mjs';
import { writeStandalone } from '../../lib/standalone.mjs';
import { describeAlert } from '../../lib/epa.mjs';
import * as T from '../tide-swim/tides.mjs';

export const pagePath = (place) => `swims/${place.slug}/`;
const HUB = 'swims/';
const DF = (o, t) => new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', ...o }).format(new Date(t)).replace(/,/g, '');
const stamp = (t) => DF({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, t);
const dateLong = (t) => DF({ day: 'numeric', month: 'long', year: 'numeric' }, t);
const inSeason = (t) => { const d = DF({ month: 'numeric', day: 'numeric' }, t).split('/').map(Number); const [day, mo] = d; return (mo > 6 || (mo === 6 && day >= 1)) && (mo < 9 || (mo === 9 && day <= 15)); };

export async function prepare(ctx, place) {
  const dir = path.join(ctx.root, 'places', place.slug);
  const model = JSON.parse(fs.readFileSync(path.join(dir, 'app', 'data', 'tide_model.json'), 'utf8'));
  const fetchT = JSON.parse(fs.readFileSync(path.join(dir, 'fetch.json'), 'utf8'));
  if (model.station !== place.tide.station) throw new Error(`places/${place.slug}: tide_model.json is for ${model.station}, place.json says ${place.tide.station}`);
  const mods = await T.loadModules(pathToFileURL(path.join(ctx.root, 'vendor', place.app, 'js') + '/').href);
  const opts = { mode: 'station', lat: place.swim.entry.lat, lon: place.swim.entry.lon, placeName: place.tide.stationName };
  const days = T.computeDays(mods, { ...opts, model, from: ctx.now, n: 3 });
  const epa = await ctx.epa();
  fs.mkdirSync(path.join(ctx.dist, pagePath(place)), { recursive: true });
  return { model, fetch: fetchT, mods, opts, days, epa, report: [] };
}

// ---------------------------------------------------------------- the pieces
// The state of the water, for the page and the hub: notices first.
export function waterStatus(ctx, place, info) {
  const E = info.epa, ids = place.swim.epa.map((e) => e.id), out = { stop: [], warn: [], none: null, checked: null };
  const checkedAt = E.alertsFrom ? Date.parse(E.alertsFrom) : null;
  out.checked = checkedAt;
  for (const a of (E.alerts || [])) {
    const which = place.swim.epa.find((e) => JSON.stringify(a).includes(e.id));
    const d = describeAlert(a);
    out.stop.push({ title: 'Do Not Swim notice', text: d.text, where: which?.name, issued: d.issued, source: 'EPA bathing water alerts' });
  }
  for (const id of ids) {
    const L = E.locations?.[id];
    if (L?.has_all_season_bathing_restriction_in_place === 'Yes') out.stop.push({ title: 'Bathing restricted all season', text: L.reason_for_all_season_bathing_restriction || 'The EPA lists an all-season bathing restriction for this water.', where: L.beach_name, issued: L.last_updated ? Date.parse(L.last_updated) : null, source: 'EPA bathing water record' });
  }
  for (const n of place.swim.notices || []) out.warn.push({ title: n.level === 'closure' ? 'Closed for repairs?' : 'Notice', text: n.text, issued: Date.parse(n.date), source: n.source, href: n.href });
  if (!out.stop.length) out.none = E.alertsOk || E.alertsFrom ? 'none' : 'unknown';
  return out;
}

function noticesHtml(ctx, place, info, ws) {
  const src = info.epa.source === 'live' ? '' : info.epa.source === 'cached' ? ' (from the last good check; the EPA did not answer this morning)' : info.epa.source === 'snapshot' ? ' (from our stored copy; the EPA did not answer this morning)' : '';
  const blocks = [];
  for (const s of ws.stop) blocks.push(`<div class="notice notice-stop" role="alert"><b>${esc(s.title)}${s.where ? `: ${esc(s.where)}` : ''}.</b> ${esc(s.text)} <span class="when">${s.issued ? `Issued ${esc(stamp(s.issued))}. ` : ''}Source: ${esc(s.source)}, checked ${ws.checked ? esc(stamp(ws.checked)) : 'at build time'}${src}.</span></div>`);
  for (const w of ws.warn) blocks.push(`<div class="notice notice-warn"><b>${esc(w.title)}</b> ${esc(w.text)} <span class="when">${esc(w.source)}, ${esc(dateLong(w.issued))}${w.href ? ` · <a href="${esc(w.href)}" rel="noopener">the notice</a>` : ''}.</span></div>`);
  const names = place.swim.epa.map((e) => e.name).join(' and ');
  if (ws.none === 'none') blocks.push(`<div class="notice notice-none"><b>No Do Not Swim notice</b> in the EPA's feed for ${esc(names)} (checked ${esc(stamp(ws.checked))}${src}). ${inSeason(ctx.now) ? 'Councils put notices up at the water too: those are the ones that count.' : 'Outside the bathing season (1 June to 15 September) councils sample less often and notices are rarer: the sign at the water is the one that counts.'}</div>`);
  if (ws.none === 'unknown') blocks.push(`<div class="notice notice-warn"><b>We couldn't check for notices.</b> The EPA's notice feed didn't answer when this page was built. Look on <a href="https://www.beaches.ie/" rel="noopener">beaches.ie</a> and at the sign by the water before you swim.</div>`);
  return `<div class="notices" id="notices">${blocks.join('')}</div>`;
}

function qualityHtml(ctx, place, info) {
  const E = info.epa;
  const rows = place.swim.epa.map((e) => {
    const L = E.locations?.[e.id], M = E.measurements?.[e.id];
    const link = `<a href="https://www.beaches.ie/find-a-beach/#/beach/${encodeURIComponent(e.id)}" rel="noopener">${esc(e.name)} on beaches.ie</a>`;
    if (!L) return `<section class="wq"><h3>${esc(e.name)}</h3><p>No EPA record could be read for it when this page was built. ${link}.</p></section>`;
    const cls = L.current_annual_water_quality_classification;
    const years = [['current_annual_water_quality_classification', 'current_annual_classification_year'], ...[1, 2, 3].map((k) => [`year${k}_annual_water_quality_classification`, `year${k}_annual_classification_year`])].map(([c, y]) => L[c] && L[y] ? `${L[y]}: ${L[c].replace(/ Quality$/, '')}` : null).filter(Boolean);
    const head = cls ? `<p class="cls"><b>${esc(cls.replace(/ Quality$/, ''))}</b> water quality, the EPA's classification for ${esc(L.current_annual_classification_year)} (from four seasons of samples, ${esc(L.current_annual_classification_year - 3)} to ${esc(L.current_annual_classification_year)}). Earlier years: ${esc(years.slice(1).join(', ') || 'none')}.</p>`
      : `<p class="cls"><b>No annual classification.</b> ${esc(e.name)} is not an identified bathing water, so the EPA does not classify it; the council samples it in the bathing season, and those results are below.</p>`;
    const risk = L.short_term_pollution_risk === 'Yes' ? `<p>The EPA lists this water as at risk of short-term pollution, which usually follows heavy rain${L.previous_year_stp_closure_days ? `; last season it had ${esc(L.previous_year_stp_closure_days)} day${L.previous_year_stp_closure_days === 1 ? '' : 's'} of short-term closure` : ''}. The page counts the last two days' rain for you, above.</p>` : '';
    const samples = M?.length ? `<table class="tt wqt"><caption>Latest samples, ${esc(e.name)} (bacteria per 100 ml; the EPA's rating for each sample).${E.measurementsFrom && E.measurementsFrom !== E.fetchedAt ? ` From the copy of ${esc(stamp(Date.parse(E.measurementsFrom)))}.` : ''}</caption><thead><tr><th scope="col">Sampled</th><th scope="col">Result</th><th scope="col" class="r">E. coli</th><th scope="col" class="r">Enterococci</th></tr></thead><tbody>${M.map((m) => `<tr><th scope="row">${esc(dateLong(Date.parse(m.date)))}${m.inSeason ? '' : ' <span class="tw">out of season</span>'}</th><td>${esc(m.status || '–')}</td><td class="r">${esc(m.ecoli ?? '–')}</td><td class="r">${esc(m.enterococci ?? '–')}</td></tr>`).join('')}</tbody></table>`
      : `<p class="small">${E.measurementsOk ? 'No recent sample results are listed for it.' : "The EPA's sample results didn't load when this page was built."}</p>`;
    return `<section class="wq"><h3>${esc(e.name)} <span class="small">${esc(e.relation)}</span></h3>${head}${risk}${samples}<p class="small">${link}. A sample is one moment: water quality can change within hours, above all after heavy rain.</p></section>`;
  }).join('');
  return rows;
}

// The fetch rose: how far the open water runs in each direction (sqrt scale), land in sand.
export function rose(F, { size = 300, label = true, id = '' } = {}) {
  const c = size / 2, R0 = size * 0.05, R1 = size * 0.42, r = (km) => R0 + (R1 - R0) * Math.sqrt(Math.min(km, F.maxKm) / F.maxKm);
  const pt = (deg, rr) => [c + rr * Math.sin((deg * Math.PI) / 180), c - rr * Math.cos((deg * Math.PI) / 180)];
  const poly = F.dirs.map((d, i) => pt(d, r(F.km[i])).map((v) => v.toFixed(1)).join(',')).join(' ');
  const open = F.dirs.map((d, i) => (F.km[i] >= F.maxKm ? `<path d="M${c},${c} L${pt(d - 2.5, R1).join(',')} A${R1},${R1} 0 0 1 ${pt(d + 2.5, R1).join(',')} Z" fill="#1d5f73" opacity=".85"/>` : '')).join('');
  const rings = [1, 10, F.maxKm].map((km) => `<circle cx="${c}" cy="${c}" r="${r(km).toFixed(1)}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-dasharray="2 3"/>`).join('');
  const lab = label ? ['N', 'E', 'S', 'W'].map((t, i) => { const [x, y] = pt(i * 90, R1 + size * 0.055); return `<text x="${x.toFixed(1)}" y="${(y + size * 0.016).toFixed(1)}" text-anchor="middle" font-size="${(size * 0.045).toFixed(0)}" font-weight="700" fill="#2c4150">${t}</text>`; }).join('') : '';
  return `<svg viewBox="0 0 ${size} ${size}"${id ? ` id="${id}"` : ''} role="img" aria-label="How far the open water runs from the spot in each direction"><circle cx="${c}" cy="${c}" r="${R1}" fill="#e7dcc6"/>${open}<polygon points="${poly}" fill="#2a7fb8" fill-opacity=".55" stroke="#1d5f73" stroke-width="1"/>${rings}<circle cx="${c}" cy="${c}" r="${size * 0.012}" fill="#0f1d26"/>${lab}<g class="arrows"></g></svg>`;
}

function exposureWords(F) {
  const open = F.dirs.filter((d, i) => F.km[i] >= F.maxKm);
  if (!open.length) return 'Land all round within 60 km: no direction is open to the sea.';
  const C = (d) => ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east', 'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'][Math.round(d / 22.5) % 16];
  // the open arc (assumes one contiguous arc, true for these spots; else the first and last)
  const lee = F.dirs.filter((d, i) => F.km[i] < 1).length;
  return `Open sea (more than ${F.maxKm} km of water) from the ${C(open[0])} round to the ${C(open[open.length - 1])}: winds and swell from there come straight in. Land within a kilometre on ${Math.round((lee / F.dirs.length) * 100)}% of bearings: wind from there blows off the shore.`;
}

// ---------------------------------------------------------------- the page
function meta(ctx, place) {
  return { path: pagePath(place), title: ctx.fullTitle(place.seo.title), ogTitle: place.seo.title, description: place.seo.description,
    og: { path: `og/${place.slug}.png`, width: 1200, height: 630, alt: `${place.card.title}: how far the open water runs from ${place.swim.short} in each direction` } };
}

export function html(ctx, place, info) {
  const p = pagePath(place), m = meta(ctx, place), S = place.swim, F = T.fmt(info.mods.util), E = info.epa;
  const crumbItems = [{ path: '', label: ctx.site.brand }, { path: HUB, label: 'Swims' }, { path: p, label: place.name }];
  m.jsonld = ldPage(ctx.site, m, { about: place.jsonld, crumbs: crumbItems, modified: ctx.isoDay });
  const ws = waterStatus(ctx, place, info);
  const risk = S.epa.some((e) => E.locations?.[e.id]?.short_term_pollution_risk === 'Yes');
  const cfg = { slug: place.slug, short: S.short, name: place.name, entry: S.entry, marine: S.marine, model: info.model, fetch: info.fetch, station: place.tide.stationName, risk, stop: ws.stop.length > 0, closed: ws.warn.some((w) => /closed/i.test(w.title)), sea: rel(p, 'assets/swim-sea.js'), lib: rel(p, 'assets/swim/') };
  const d0 = info.days[0], d1 = info.days[1];
  const body = `<main>${crumbs(p, crumbItems)}
<p class="kicker">${esc(place.seo.kicker)}</p>
<h1>${esc(place.seo.h1)}</h1>
${noticesHtml(ctx, place, info, ws)}
<section id="now" class="now tone-unknown" aria-live="polite">
  <p class="sv-word" id="svWord">The sea, now</p>
  <p class="sv-line" id="svLine">Worked out in your browser from the live forecast when the page opens. ${esc(S.governs)}</p>
  <ul class="sv-facts" id="svFacts">
    <li><b>Tide</b> <span id="svTide">${esc(T.timesSentence(F, d0).replace(/^h/, 'H'))} (${esc(place.tide.stationName)}, Irish time).</span></li>
  </ul>
  <p class="small" id="svAsof">Estimated, not observed: <a href="#how">what that means</a>.</p>
  <noscript><p class="small">The sea-state estimate needs JavaScript. The tide, the notices and the water quality on this page don't.</p></noscript>
</section>
<section id="hours"><h2>The next day and a half</h2><div id="svChart" class="fig"></div><p id="svBest" class="lede">The calmest daylight spell is worked out from the forecast when the page opens.</p></section>
<section id="water"><h2>The water</h2>${qualityHtml(ctx, place, info)}</section>
<section id="tide"><h2>Tide</h2>
<p class="lede"><b>${esc(F.longNoYear(d0.mid))}:</b> ${esc(T.todaySentence(F, d0, { mode: 'station' }))}</p>
<p><b>Tomorrow:</b> ${esc(T.timesSentence(F, d1).replace(/^h/, 'H'))}.</p>
${T.weekTable(F, info.days, { caption: `${place.tide.stationName}: high and low tide, ${F.day(info.days[0].mid)} to ${F.day(info.days[info.days.length - 1].mid)}, Irish time. Heights in metres above the station's Lowest Astronomical Tide.`, markToday: true, mode: 'station' })}
<p class="small">${esc(S.tideNote)} ${esc(place.tide.basis)}</p></section>
<section id="exposure"><h2>Where the sea gets in</h2>
<figure class="fig rose">${rose(info.fetch)}<figcaption>How far the open water runs from ${esc(S.short)} in each direction, out to ${info.fetch.maxKm} km (blue; dark blue: open sea beyond). Sand: land. Rings at 1, 10 and ${info.fetch.maxKm} km. When the page is live, arrows show where the wind (orange) and swell (blue) are coming from.</figcaption></figure>
<p>${esc(exposureWords(info.fetch))}</p></section>
<section id="how"><h2>What's measured, predicted and estimated</h2>
<dl class="mpe">
<dt>Measured</dt><dd>The EPA's water samples (dated above) and its notices. Nothing on this page is measured at the water right now: no gauge, no buoy, no camera.</dd>
<dt>Predicted</dt><dd>The tide: the Marine Institute's predictions for ${esc(place.tide.stationName)} (${place.tide.kind === 'gauge' ? 'a tide gauge' : 'a station in its tide model'}, ${esc(place.tide.km)} km away), computed in your browser from constants fitted to them (within about 2 minutes and 2 cm). Wind, air temperature and rain: Open-Meteo's forecast for the spot. Swell, its direction and the sea temperature: Open-Meteo Marine, for the nearest offshore model cell (it says how far away when the page is live).</dd>
<dt>Estimated</dt><dd>The sea state at the spot. Wind chop from the forecast wind and the fetch, the distance of open water upwind measured on the OpenStreetMap coastline, with the Shore Protection Manual's wave-growth formulae for a steady wind; swell from the offshore forecast, cut down by how sheltered the spot is from the swell's direction. Gusts, how long the wind has blown, tidal streams and waves reflecting off the rocks are all left out. Nobody has yet checked these estimates against what the water was actually doing, so treat the word as a fair guess, not a reading.</dd>
</dl>
<p>${esc(S.deepBasis)}</p>
<p>${esc(S.lifeguard)}</p></section>
<section id="sources"><h2>Sources</h2><ol class="srcs">${place.sources.map((s) => `<li><a href="${esc(s.href)}" rel="noopener">${esc(s.label)}</a></li>`).join('')}
<li>Marine Institute, tide predictions for ${esc(place.tide.stationName)} and ${esc(place.tide.other.stationName)} (ERDDAP dataset imiTidePrediction, CC BY 4.0), fitted ${esc(info.model.fitted)}; checked against Jan–Feb 2027 predictions the fit never saw: ${esc(info.model.checks[1].hw_lw_time_rms_min)} min and ${esc(Math.round(info.model.checks[1].hw_lw_height_rms_m * 100))} cm RMS at high and low water.</li>
<li>EPA, Bathing Water Open Data API (data.epa.ie/bw, CC BY 4.0), read ${E.fetchedAt ? esc(stamp(Date.parse(E.fetchedAt))) : 'at build time'}${E.source === 'live' ? '' : `, ${esc(E.source)} copy`}.</li>
<li>US Army Corps of Engineers, Shore Protection Manual (1984), chapter 3: wave growth with fetch.</li></ol></section>
<p class="note">All the swim spots, with today's state of each: <a href="${rel(p, HUB)}">Sea swims around Ireland</a>.</p>
<script type="application/json" id="swimConfig">${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>
<script type="module" src="${rel(p, 'assets/swim-live.js')}"></script>
</main>
<footer>${footer(p, ctx.site, { sources: place.attribution, places: ctx.places, safety: `<b>Estimates and predictions, not observations.</b> Nothing here says a swim is safe. Look at the water yourself, swim within your limits, and heed any Do Not Swim notice and the council's signs.` })}</footer>`;
  return { page: m, body };
}

export async function prerender(ctx, place, info, browser) {
  // the share card: the fetch rose, drawn offline (no network): nothing here can hang
  const c = await open(browser, ctx.serverUrl, { viewport: { width: 1200, height: 700 }, mobile: false });
  const svg = rose(info.fetch, { size: 630 });
  const card = await c.page.evaluate(async (svg) => {
    const i = new Image(); i.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="630" height="630" ')))); await i.decode();
    const cv = document.createElement('canvas'); cv.width = 630; cv.height = 630; const g = cv.getContext('2d'); g.fillStyle = '#c4dae4'; g.fillRect(0, 0, 630, 630); g.drawImage(i, 0, 0);
    const t = document.createElement('canvas'); t.width = 600; t.height = 315; const h = t.getContext('2d'); h.fillStyle = '#c4dae4'; h.fillRect(0, 0, 600, 315); h.drawImage(i, 150, 7, 300, 300);
    return { card: cv.toDataURL('image/png'), thumb: t.toDataURL('image/webp', 0.84) };
  }, svg);
  const og = await composeCard(c.page, { panel: { card: card.card, title: place.card.title, subtitle: place.card.subtitle, line: 'Sea state, tide and water quality, worked out from public data. Estimates, not observations.' }, brand: `${ctx.site.brand} · Swims`, fontBase: ctx.serverUrl + 'assets/fonts/' });
  await c.close();
  return { og, thumb: card.thumb };
}

export function cacheable(pr) { return { og: pr.og, thumb: pr.thumb }; }

export function write(ctx, place, info, pr) {
  const { page, body } = html(ctx, place, info);
  writeStandalone(ctx, page, body, { css: ctx.css.tide + ctx.css.swim });
  if (pr?.og) saveDataUrl(pr.og, path.join(ctx.dist, 'og', `${place.slug}.png`));
  return [{ ...page, lastmod: ctx.isoDay, priority: 0.7 }];
}

export function teaser(ctx, place, info) {
  const F = T.fmt(info.mods.util);
  return `Today at ${place.tide.stationName}: ${T.timesSentence(F, info.days[0])}.`;
}
