// The site's own pages: home (the list of places), about (sources, licences, privacy), 404.
import fs from 'node:fs';
import path from 'node:path';
import { parse, serialize, applyHead, esc, ldWebsite, ldPage } from '../lib/html.mjs';
import { rel, basePath } from '../lib/paths.mjs';
import { SOURCES, footer } from '../lib/chrome.mjs';

function shell(ctx, page, body, { extraHead = [], noindex = false } = {}) {
  const doc = parse(`<!doctype html><html lang="${ctx.site.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title></title><meta name="theme-color" content="#f4efe6"></head><body class="site"><div class="wrap">${body}</div></body></html>`);
  if (noindex) {
    doc.querySelector('title').textContent = page.title;
    doc.head.insertAdjacentHTML('beforeend', `<meta name="robots" content="noindex"><link rel="icon" href="${page.iconHref}" type="image/svg+xml"><style>${ctx.css.site}</style>`);
  } else applyHead(doc, ctx.site, page, { after: [`<style>${ctx.css.site}</style>`, ...extraHead] });
  return serialize(doc);
}

const topBar = (ctx, p) => `<header class="top"><a class="brand" href="${rel(p, '')}">${esc(ctx.site.brand)}</a><nav aria-label="Site"><a href="${rel(p, 'about/')}">About</a></nav></header>`;

export function home(ctx, cards) {
  const p = '';
  const page = { path: p, title: `${ctx.site.brand}: tides, sun, moon and weather, place by place`, ogTitle: ctx.site.brand,
    description: 'The old almanac of tides, sun, moon and weather, made live and local, place by place: tide times, swim depths and mountain views, starting in Westport, Co. Mayo.',
    og: { path: 'og/home.png', width: 1200, height: 630, alt: `${ctx.site.brand}: Croagh Patrick's skyline from Westport Quay` } };
  page.jsonld = [ldWebsite(ctx.site), ...ldPage(ctx.site, page, { modified: ctx.isoDay })];
  const groups = [...new Set(cards.map((c) => c.place.listing.group))];
  const list = groups.map((g) => `<p class="group">${esc(g)}</p><ul class="places-list">${cards.filter((c) => c.place.listing.group === g).map((c) => `<li><a class="place" href="${rel(p, c.place.slug + '/')}"><img src="${rel(p, `og/${c.place.slug}-thumb.webp`)}" alt="${esc(c.alt)}" width="600" height="315" loading="lazy" decoding="async"><span class="txt"><b>${esc(c.place.listing.title)}</b><span class="q">${esc(c.question)}</span>${esc(c.place.listing.blurb)}${c.now ? `<span class="now">${esc(c.now)}</span>` : ''}</span></a></li>`).join('')}</ul>`).join('');
  const verify = [ctx.site.verification?.google && `<meta name="google-site-verification" content="${esc(ctx.site.verification.google)}">`, ctx.site.verification?.bing && `<meta name="msvalidate.01" content="${esc(ctx.site.verification.bing)}">`].filter(Boolean);
  const body = `${topBar(ctx, p)}
<main>
<h1>${esc(ctx.site.brand)}</h1>
<p class="lede">An almanac was the year's tides, sun, moon and weather in one small book. This is that, made live and local, place by place: is there water at the steps yet, is the top of the mountain in cloud.</p>
<p>Each answer is worked out from public data that usually sits in tables and archives (tide predictions, weather models, elevation surveys, old charts), with the arithmetic and the sources underneath for anyone who wants them.</p>
${list}
<p class="small">Westport first. More places as they're done properly, each at its own address on this site.</p>
</main>
<footer>${footer(p, ctx.site, { places: ctx.places })}</footer>`;
  fs.writeFileSync(path.join(ctx.dist, 'index.html'), shell(ctx, page, body, { extraHead: verify }));
  return { ...page, lastmod: ctx.isoDay, priority: 0.8 };
}

export function about(ctx, licenceNotes) {
  const p = 'about/';
  const page = { path: p, title: `About ${ctx.site.brand}: sources, licences and privacy`, ogTitle: `About ${ctx.site.brand}`,
    description: `How ${ctx.site.brand} works: where the tide, weather and elevation data come from, their licences, what runs in your browser, and what we don't collect.`,
    og: { path: 'og/home.png', width: 1200, height: 630, alt: `${ctx.site.brand}` } };
  page.jsonld = ldPage(ctx.site, page, { crumbs: [{ path: '', label: ctx.site.brand }, { path: p, label: 'About' }] });
  const src = Object.entries(SOURCES).map(([k, s]) => `<li id="src-${k}"><b>${esc(s.label)}:</b> ${s.html}.${licenceNotes[k] ? ` <span class="small">${licenceNotes[k]}</span>` : ''}</li>`).join('');
  const body = `${topBar(ctx, p)}
<main>
<h1>About ${esc(ctx.site.brand)}</h1>
<p class="lede">An almanac, made live and local: a small site that takes a question people have about a place (is there water at the steps, can I see the mountain) and answers it from public data, with the workings shown. It is a static site, rebuilt every morning at about 03:00 Irish time; the live parts run in your browser.</p>
<h2>How it works</h2>
<p>Tide times are computed from harmonic constants fitted to the Marine Institute's published predictions, so your phone works the tide out itself and it keeps working with no signal. Weather, sea temperature and the mountain verdict are fetched by your browser from the services below when the page opens. The tables, verdict snapshots and text on each page are also written into the page when it is built, labelled with the time they were made.</p>
<p>Every number is an estimate with a method behind it, and each place page says how it is worked out, where it could be wrong, and how to tell us. Folklore is labelled as folklore.</p>
<h2 id="sources">Sources and licences</h2>
<ul class="attrib-full">${src}</ul>
<p class="small">Each page also carries its own numbered list of sources for the facts it states. Quotations are short and credited.</p>
<p class="small">Data files on this site that are derived from OpenStreetMap (the places, peaks and skyline features behind the Croagh Patrick page, and the map of the Point) are made available under the <a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="noopener">Open Database License</a>.</p>
<p class="small">Sea-level projections: we thank the projection authors for developing and making the sea-level rise projections available, multiple funding agencies for supporting the development of the projections, and the NASA Sea Level Change Team for developing and hosting the IPCC AR6 Sea Level Projection Tool.</p>
<p class="small">Fonts: Fraunces and Inter, SIL Open Font License 1.1 (<a href="../assets/fonts/OFL-Fraunces.txt">licence</a>, <a href="../assets/fonts/OFL-Inter.txt">licence</a>).</p>
<h2>Privacy</h2>
<p>No cookies, no analytics, no accounts, no ads. Your browser talks directly to Open-Meteo and the Marine Institute for forecasts; on the mountain page, the map loads tiles from OpenFreeMap, the map library from unpkg.com, and elevation tiles from Amazon's open-data bucket. Those services see your IP address, as any website you visit would. Anything you log on a page (dips, sightings, a correction) is kept in your browser's local storage on your device and is never sent anywhere; export and import are files you move yourself.</p>
<h2>Safety</h2>
<p>Depths, tides and cloud verdicts here are predictions and estimates, not measurements. There are no lifeguards at the swim spots unless the local council says so. Look for yourself before you go in or go up.</p>
<h2>Corrections</h2>
<p>If you know better (the year the steps were built, what your granny called the hill), that is exactly what these pages want to hear.${ctx.site.contactEmail ? ` Write to <a href="mailto:${esc(ctx.site.contactEmail)}">${esc(ctx.site.contactEmail)}</a>.` : ' A contact address is coming with the domain.'} On the swim pages, "Tell us where the water was" checks the model against what you saw.</p>
${ctx.site.repoUrl ? `<p class="small">Source code: <a href="${esc(ctx.site.repoUrl)}">${esc(ctx.site.repoUrl.replace(/^https:\/\//, ''))}</a>.</p>` : ''}
</main>
<footer>${footer(p, ctx.site, { places: ctx.places })}</footer>`;
  fs.mkdirSync(path.join(ctx.dist, p), { recursive: true });
  fs.writeFileSync(path.join(ctx.dist, p, 'index.html'), shell(ctx, page, body));
  return { ...page };
}

// 404.html is served for any missing path, at any depth, so its links are absolute (base path).
export function notFound(ctx) {
  const b = basePath(ctx.site.baseUrl);
  const links = ctx.places.map((pl) => `<li><a href="${b}${pl.slug}/">${esc(pl.listing.title)}</a></li>`).join('');
  const body = `<header class="top"><a class="brand" href="${b}">${esc(ctx.site.brand)}</a></header>
<main><h1>Not here</h1>
<p class="lede">That page doesn't exist, or no longer does. The day-by-day tide pages only run ${ctx.site.dayPages} days ahead, and each day's page is dropped once the day is over.</p>
<ul>${links}<li><a href="${b}">All places</a></li></ul></main>`;
  fs.writeFileSync(path.join(ctx.dist, '404.html'), shell(ctx, { title: `Not found | ${ctx.site.brand}`, iconHref: `${b}assets/favicon.svg` }, body, { noindex: true }));
}
