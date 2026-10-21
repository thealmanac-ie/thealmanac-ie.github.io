# The Almanac

The old almanac of tides, sun, moon and weather, made live and local, place by place. A small static site that answers everyday questions about places in Ireland from public data, with the workings shown. One national site, one path per place:

| Path | What it answers | Template |
|---|---|---|
| `/` | The list of places (grows with the site) | site page |
| `/westport/` | **Westport tide times**, and *Is there water at the Point?* (the depth at the swimming steps at Westport Quay) | `swim`, kind `depth` (the swim lab app, `templates/tide-swim`) |
| `/westport/tide-times/` | High and low tide for the next 30 days | `tide-swim` |
| `/westport/tide-times/tomorrow/` | **High tide Westport tomorrow**: tomorrow's tides, rebuilt daily | `tide-swim` |
| `/westport/tide-times/YYYY-MM-DD/` | One day (weekday in the title): tides, depth at the steps, a chart, light and moon | `tide-swim` |
| `/louisburgh/tide-times/` | **Louisburgh tide times**: the Marine Institute's own predictions for Roonagh Pier, 30 days | `tide-times` |
| `/clew-bay/tide-times/` | **Clew Bay tide times**: a map of the bay's tide spots, what backs each one's times, and honest notes for Murrisk, Newport, Mulranny and Achill Sound | `tide-hub` |
| `/croagh-patrick/` | **Can I see the Reek today?** Summit cloud, the forecast for the top, the view from it | `mountain` |
| `/swims/` | **Sea swims around Ireland**: every swim spot on a map with today's state of each (notices and water quality, tide, the sea-state word), and the well-known spots left out, with why | `swim-hub` |
| `/swims/forty-foot/`, `/swims/vico/`, `/swims/guillamene/`, `/swims/sandycove-island/` | *How is the sea at the Forty Foot today?* Notices first, then the estimated chop and swell, the calmest daylight spell, the EPA's water quality with dates, the tide, and what is measured, predicted and estimated | `swim`, kind `deep` |
| `/about/` | Sources, licences, privacy, safety | site page |

The brand, the address (`https://thealmanac-ie.github.io/` first, then `https://thealmanac.ie/`) and the custom domain are settings in `site.config.mjs`.

The interactive pages are the two lab apps (the swim app and the Reek app), copied in unchanged apart from a few injected values (see "How a template works"). The build adds what search engines and people without JavaScript need: real titles and descriptions, server-rendered tide tables, a snapshot of everything the apps render, share images, structured data and a sitemap. The live apps then run as before and refresh it all.

## Structure

```
site.config.mjs          brand, base URL, custom domain (CNAME), language, day pages, contact, verification tokens
places/<slug>/place.json one folder per place: names, SEO text, coordinates, the template it uses
places/<slug>/app/       optional: files that replace the template app's own (same layout as the app)
templates/tide-swim/     index.mjs (page builder), adapter.mjs (values injected into the app),
                         tides.mjs (tide tables; runs at build time and in the browser), tide.css
templates/mountain/      index.mjs, adapter.mjs, mountain.css
templates/tide-times/    a tide-times-only page (station mode: a Marine Institute station's own predictions)
templates/tide-hub/      an area's tide spots on one page with a map (index.mjs, hub.css)
templates/swim/          a swim spot, kind "depth" (delegates to tide-swim) or "deep" (deep.mjs: the sea decides);
                         sea.mjs, the sea-state estimate (runs in Node and, as assets/swim-sea.js, in the browser)
templates/swim-hub/      /swims/: every swim spot on a map of Ireland, today's state of each, the left-out spots
places/<slug>/fetch.json a deep spot's fetch rose (tools/swim-fetch.mjs); places/swims/map.* the Ireland map
                         (tools/ireland-map.mjs); places/swims/epa-snapshot.json (tools/epa-snapshot.mjs)
lib/fallback.mjs         graceful degradation of the prerender (cache, fallback card, report)
lib/epa.mjs              the EPA's bathing-water data at build time (live, else cached, else snapshot)
lib/                     build.mjs (npm run build), prerender.mjs (headless Chromium), html.mjs (head,
                         JSON-LD), seo.mjs (sitemap, robots, the checks), chrome.mjs (footer, sources),
                         app.mjs (copy + minify an app), server.mjs, paths.mjs, scrub.mjs
pages/site.mjs           home, about, 404
lib/standalone.mjs       the shell for pages without a lab app
assets/                  site.css (inlined), tide-client.js, favicon.svg
vendor/swim, vendor/reek the lab apps' runtime files (index.html, css, js, data), copied by npm run sync
vendor/fonts             Fraunces and Inter, self-hosted (SIL OFL 1.1), made by npm run fonts
schemas/                 dip-log.v1.schema.json: the sightings export format
tools/                   sync, fonts, serve, test, perf, shots; clew-bay-map.mjs (one-off: the hub's base map)
places/clew-bay/map.*    the hub's base map (relief: EU-DEM; water: OpenStreetMap), made by tools/clew-bay-map.mjs
.github/workflows/daily.yml   build and deploy to GitHub Pages
```

`dist/` (the built site), `tmp/` and `shots/` are not committed.

## Build

Node 20 or later. The build drives headless Chromium (Playwright) to prerender the apps and draw the share images.

```
npm ci
npx playwright-core install --only-shell chromium   # once; or point PLAYWRIGHT_BROWSERS_PATH at an existing install
npm run build                                       # -> dist/, about 5 s
npm run serve                                       # http://127.0.0.1:8080/  (PREFIX=/almanac/ to test a path prefix)
npm test                                            # browser checks, with and without JavaScript, plus a prefix build
```

- `BASE_URL=https://thealmanac.ie/ npm run build` overrides the base URL. A path prefix works too (`https://example.github.io/almanac/`): every internal link is relative, and canonical, Open Graph, sitemap and JSON-LD URLs are absolute from the base URL. Only `404.html` uses root-relative links, built from the base path, because it is served at any depth.
- `npm run build -- --no-browser` skips prerendering (no snapshots, no share images); for quick checks only.
- The build fails if any page lacks a unique title or description, a single `h1`, a correct canonical, an Open Graph image, valid JSON-LD, image alt text, or has a broken internal link, or if anything private turns up (below).

### Keeping up with the lab apps

The lab apps are developed in their own folders next to this repo (`../swim`, `../reek`). `npm run sync` copies their runtime files into `vendor/` (index.html, css/, js/, data/; no tools, caches or screenshots), scrubs them, and records a hash per file in `vendor/MANIFEST.json`. Review `git diff vendor/` and commit: that is what CI builds. Never edit `vendor/` by hand. Set `SWIM_DIR` or `REEK_DIR` if the folders are elsewhere. `npm run fonts` re-downloads the two web fonts (a one-off).

### Privacy scrub

Everything published (this repo and the built site) is checked for e-mail addresses, absolute local paths and private network addresses. A private list of further words (names, handles, host names, other projects) lives in `.scrub.local.json`, which is git-ignored and never published; `npm run sync` uses it to rewrite the lab apps' internal references and refuses to vendor anything that still matches.

### When a live API is slow: the build degrades, it doesn't block

On 21 Oct 2026 a build failed because the Croagh Patrick prerender waited 60 s for the live forecast; with no prerender there was no share card and no thumbnail, so the og:image checks failed. Now (`lib/fallback.mjs`):

- **The live part has a budget.** The Reek page waits up to 40 s (`LIVE_BUDGET_MS`) for the forecast, then loads again offline and builds everything else (sources, the view from the top, the share card, which never needed the network). The page then says the verdict loads live. Each place's whole prerender has a budget too (`PRERENDER_BUDGET_S`, 150 s).
- **A failed prerender falls back** to that place's last good one (`tmp/prerender-cache/<slug>.json`, kept between CI runs by `actions/cache`), minus anything time-sensitive (each template's `cacheable()` drops the weather verdict and the tide "as of" verdict), and failing that to the site's fallback card and thumbnail (`assets/og-fallback.png`, `assets/thumb-fallback.webp`, drawn by `tools/fallback-card.mjs`), with alt text that describes the fallback rather than the missing picture.
- **The checks stay meaningful.** Every page still needs a 1200×630 PNG share image that exists. Every fallback is logged, written to `tmp/build-report.json` and raised as a GitHub Actions warning. The build still fails if Chromium can't start or if every place fails to prerender: that's a broken build, not a slow API. The EPA data falls back the same way (live, last good copy, committed snapshot), and the pages say which copy they show and when it was read.
- **Tested by fault injection** in `npm test`: a hung forecast API (`PRERENDER_HANG_HOSTS=api.open-meteo.com`), prerenders that throw (`PRERENDER_THROW=slug,…`) with a warm and a cold cache, the EPA offline (`EPA_OFFLINE=1`), and everything failing (must stop).

## Swim spots around Ireland

The rule: more precise only where that changes someone's decision. A swimmer wants a clear verdict, the right time window and whether the water is clean. So there are two kinds of spot (`place.json` `"swim": { "kind": … }`, template `swim`):

- **depth**: the swim depends on how much water is at a fixed point (steps, a slip, a pool), so the answer is the Point-style verdict: predicted tide level minus the *measured* level of that point, with its uncertainty (Westport's Point, the swim lab app).
- **deep**: deep at every state of the tide, so the sea decides: tide state, wind chop and swell from the spot's own coastline (the fetch rose), sea temperature, the calmest daylight spell, and the EPA's water quality and any Do Not Swim notice, first on the page and timestamped. The pages never say "safe" (the tests check), and each says what is measured, predicted and estimated.

A deep spot is `places/<slug>/place.json` (`swim`: entry, a point just offshore for the fetch, the marine-forecast point, EPA ids, notices; `tide`: the station and the evidence for it; `sources`), `app/data/tide_model.json` (`node tools/swim-tides.mjs <slug> <StationID>`) and `fetch.json` (`node tools/swim-fetch.mjs <slug>`). Add its slug to `places/swims/place.json`.

### The shortlist (21 Oct 2026)

| Spot | Kind | Nearest Marine Institute tide station (imiTidePrediction) | EPA bathing water | Built? |
|---|---|---|---|---|
| The Forty Foot, Sandycove | deep (all tides: travelextra.ie; about 6 m at high water) | Bray Harbour (model), 8.0 km; the Dublin Port gauge, 9.5 km, agrees within 1 min (HW) and 6 min (LW) on average | Forty Foot Bathing Place, identified: Excellent 2025; samples to 12 Oct 2026 | yes |
| Vico Baths (Hawk Cliff), Dalkey | deep | Bray Harbour (model), 5.6 km | none of its own; White Rock Beach, 0.7 km: Excellent 2025 | yes, with the council's closure notice (works from March 2026, due end of June; no reopening notice found) |
| The Guillamene and Newtown Cove, Tramore | deep ("deep at all stages of the tide": the EPA) | Dunmore East gauge, 11.8 km; Dungarvan (model), 27.8 km, is 10–12 min earlier | both non-identified (no classification); council samples to 14 Sep 2026 | yes |
| Sandycove Island, Kinsale | deep (the 1.6 km loop; low-water walk-out) | Kinsale (model), 5.6 km; Crosshaven (model), 22.9 km, agrees within 3 min | Sandycove, non-identified; sampled to 1 Sep 2026 | yes |
| Seapoint, Monkstown | depth (slip and steps by the Martello tower) | Dublin Port gauge, 6.7 km | Seapoint, identified: Excellent 2025 | **no**: the 2011 OPW LiDAR caught the sea at the foot of the slip (−0.6 m OD Malin), so the bed where you'd swim is unmeasured |
| The Half Moon, South Wall | depth | Dublin Port gauge, 3.9 km | Half Moon, identified: Excellent 2025 | **no**: no LiDAR ground at the steps, and OpenStreetMap doesn't place them |
| The Bull Wall shelters | depth | Dublin Port gauge, 3.7 km | North Bull Wall, non-identified | **no**: the LiDAR shows water, not ground, at the foot of the steps |
| Blackrock diving tower, Salthill | depth (enough water under the boards?) | Galway gauge, 3.3 km | Salthill Beach, identified: Excellent 2025 | **no**: the LiDAR was flown with the tide in at the tower (flat water at about 1.25 m OD Malin), so there is no bed level, and a diving depth is not something to guess |
| The Pollock Holes, Kilkee | depth (rock pools on a reef that dries) | Carrigaholt (model), 9.8 km; Lahinch (model), 31 km, agrees within 7 min, so the tide basis is fine | Kilkee, identified: Excellent 2025 | **no**: the 2011 LiDAR doesn't cover the reef, so the tide (or swell) at which the sea washes in is unknown |

Every left-out spot is on the hub map, hollow, with its reason; one measured level (a surveyed height, or a tape and a known tide time at the steps) would put it in. The tide basis for every built spot is the station's own predictions, unshifted, with a neighbouring station as evidence that the difference is small (`node tools/swim-tides.mjs --compare A B`). A station with nothing to show it stands for the spot (a different coast, an estuary in between) would not do.

### The data, and the terms

- **Tide**: Marine Institute, ERDDAP `imiTidePrediction` (CC BY 4.0), 5-minute predictions for 2026, fitted with the swim app's constituents and checked on Jan–Feb 2027, which the fit never saw: about 2 min and 1–2 cm RMS at high and low water.
- **Water quality and notices**: EPA Bathing Water Open Data API (`https://data.epa.ie/bw/api/v1/`: Locations, Measurements, Alerts; listed on data.gov.ie as CC BY 4.0; the data behind beaches.ie). It sends no CORS headers, so it is read at build time, every morning, and the pages show when. Locations give the annual classification (four seasons of samples), any all-season restriction, the short-term pollution risk flag and last season's closure days. Measurements give dated samples (about 26,000 records, oldest first, so the build reads the newest pages; out-of-season samples are included and labelled). Alerts carry the in-season incidents and restrictions and publish no schema, so `lib/epa.mjs` matches them by bathing-water id and shows whatever text and dates they carry. Measurements answered HTTP 500 for part of 21 Oct 2026: the pages fall back and say so. beaches.ie itself is not scraped.
- **Sea state**: Open-Meteo forecast (wind, gusts, rain) and Open-Meteo Marine (swell height, direction and period; sea temperature), CC BY 4.0, fetched by the visitor's browser; the fetch rose from the OpenStreetMap coastline (ODbL); wave growth from the Shore Protection Manual (1984). The words (calm, a little lively, choppy, rough, big sea) are thresholds on the estimated wave height (0.15, 0.3, 0.6, 1.0 m): an ASSUMPTION, not yet checked against observations.
- **Map**: AWS Terrain Tiles (EU-DEM), `tools/ireland-map.mjs`.

## Deploy

### GitHub Pages (the plan)

The workflow `.github/workflows/daily.yml` builds and deploys with `actions/deploy-pages` on every push to `main`, on demand, and every morning at 02:17 UTC (03:17 Irish summer time, 02:17 in winter; GitHub's scheduler is UTC-only and often runs a little late). It installs Chromium, and takes the base URL from the Pages settings, so a custom domain needs no code change.

1. Create the organisation `thealmanac-ie` and a public repository `thealmanac-ie.github.io` (served at the root, `https://thealmanac-ie.github.io/`).
2. Push this repo to it, then Settings > Pages > Source: **GitHub Actions** (or `gh api -X POST repos/thealmanac-ie/thealmanac-ie.github.io/pages -f build_type=workflow`).
3. Run the workflow once (Actions > Build and deploy > Run workflow, or `gh workflow run daily.yml`).

Notes: GitHub pauses scheduled workflows in public repositories after 60 days without a commit; the push and manual triggers still work, and any commit (a lab sync) resets the clock. For the custom domain: set `customDomain: 'thealmanac.ie'` in `site.config.mjs` (the build then writes `dist/CNAME` and uses `https://thealmanac.ie/` as the base URL), set the same domain under Settings > Pages (GitHub ignores CNAME files for Actions deployments, so the setting is what counts), and add the DNS records GitHub lists. The github.io address then redirects to the domain. A second domain (say `outtoday.ie`) can redirect to it at the registrar or DNS host.

### Cloudflare Pages (alternative)

Cloudflare's own build image can't install Chromium's system libraries, so keep building in GitHub Actions and upload the result. Replace the `deploy` job with:

```yaml
      - run: npx wrangler@3 pages deploy dist --project-name=thealmanac --branch=main
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

(add it as a final step of the `build` job, drop `configure-pages`, `upload-pages-artifact` and the `deploy` job, and set `BASE_URL` to the Cloudflare address or the custom domain). Cloudflare serves `404.html` for missing paths, as GitHub does.

### Your own server

Build on the server and copy `dist/` to the web root once a day. Sample crontab (Irish time):

```
CRON_TZ=Europe/Dublin
17 3 * * * cd /srv/thealmanac && npm run build >> tmp/cron.log 2>&1 && rsync -a --delete dist/ /var/www/thealmanac/
```

and a Caddy site block:

```
thealmanac.ie {
	root * /var/www/thealmanac
	encode zstd gzip
	file_server
	handle_errors {
		rewrite * /404.html
		file_server
	}
}
```

## SEO checklist (done, and enforced by the build)

- Pages for what people search: "Westport tide times" (`/westport/`), "high tide Westport tomorrow" (`/westport/tide-times/tomorrow/`, titled with tomorrow's weekday and date), "high tide Westport Saturday" (each day page has its weekday in the title and `h1`), "low tide Westport" ("high and low tide" in every tide title and description), "tide times Louisburgh", "tide times Clew Bay", and Murrisk, Newport and Mulranny as sections of the Clew Bay page. Today, tomorrow and the next days are linked from every tide page.
- No duplicates: tomorrow's dated page carries `rel=canonical` to `/tomorrow/` and stays out of the sitemap; places without a sourced tidal difference get no page of their own.
- One topic per URL, each place a path; unique `<title>` (60 characters or so) and meta description per page; one `h1` per page (the swim page gains "Westport tide times"; on the Reek page the question is the `h1` and the one-word answer moved to a `p` with the same look).
- `<link rel="canonical">`, Open Graph and Twitter tags on every page, with a 1200×630 PNG share image drawn at build time by each app's own code (the swim app's share card, the Reek app's hero) and alt text.
- Real HTML at build time: the Westport tide tables (today plus 7 days, times, heights, springs and neaps; 30-day and per-day pages), the swim verdict ("As of HH:MM") and every JS-rendered chart, table and paragraph of the swim app; the Reek verdict and forecast ("As of HH:MM"), the 72-hour chart, best spells, the climb card, every one of the 44 names in the view from the top with its card text, and the numbered sources. The deep sections were already static. Checked with JavaScript off.
- JSON-LD: `WebSite` (home), `WebPage` with `about` a `Place` (Westport Quay, containing the Point) or a `Mountain` (Croagh Patrick, with `GeoCoordinates` and elevation), `BreadcrumbList` on sub-pages. No reviews, ratings or FAQ markup.
- `sitemap.xml` (all indexable pages, `lastmod`), `robots.txt` (allow all, names the sitemap), `404.html` (not indexed), `lang="en-IE"`, alt text on every image, favicon.
- Fast: static files, CSS inlined, JS modules and startup data preloaded, fonts self-hosted and preloaded (no Google request), below-the-fold images lazy, the location map served as WebP (91 KB PNG to 11 KB).
- One thing to know: `robots.txt` only counts at the root of a host. At `thealmanac-ie.github.io` and `thealmanac.ie` it is at the root; under a path prefix, submit the sitemap in Search Console instead.

## Performance (390×844, measured on this build)

Lighthouse 13, mobile, simulated slow 4G and 4× CPU (installed locally with npm, no system packages):

| Page | Perf | A11y | Best pr. | SEO | LCP | TBT | CLS | Bytes |
|---|---|---|---|---|---|---|---|---|
| `/westport/` | 71 | 100 | 100 | 100 | 1.8 s | 2.4 s | 0.007 | 119 KiB |
| `/croagh-patrick/` | 93 | 100 | 100 | 100 | 2.3 s | 270 ms | 0.004 | 296 KiB |
| `/`, `/about/`, tide-times pages | 100 | 100 | 100 | 100 | 0.6 s | 0 | 0 | 5–16 KiB |

`npm run perf` (Playwright, real throttling: 150 ms RTT, 1.6 Mbps, CPU 4×, cold cache): LCP 0.34 s on `/westport/` (the prerendered verdict line), 0.54 s on `/croagh-patrick/` (the answer), 0.26–0.29 s elsewhere; CLS under 0.01 everywhere.

The swim page's score is held down by its own JavaScript, not by loading: the hero animates every frame (the Reek hero throttles itself to 25 fps) and the app scans a whole year of tides at start-up. Suggested upstream changes in the swim app: cap the hero's frame rate, and precompute the year sentence's numbers.

## How a template works

A place's `place.json` names its `template` and `app`. The build:

1. reads the vendored app, then any files in `places/<slug>/app/` on top;
2. runs the template's **adapter**, which injects the place's values into the few constants the app still hard-codes (each rule must match exactly, or the build stops and says which rule: the signal that the lab code moved);
3. minifies and writes the app to `dist/<slug>/`;
4. loads it in headless Chromium, lets the app render, and copies the rendered fragments (a fixed list of selectors per template) into the HTML; draws the share image and, for tides, one chart per day with the app's own chart code;
5. adds the SEO head, the extra sections and the footer.

### tide-swim (a town's tides plus a swim spot)

Per-spot configuration (the swim app's own files): `data/point.json` (location, tide-station time and height differences, mean sea level on the datum, seabed level at the foot of the steps with its range, step geometry), `data/tide_model.json` (the station's harmonic constants, fitted from Marine Institute predictions) and `js/sources.js` (the numbered sources). Plus `place.json`: names, SEO text, forecast point, nearest sea-temperature model cell, hero view direction, depth uncertainty, card text, JSON-LD.

Injected by `templates/tide-swim/adapter.mjs`: forecast point, sea-temperature cell, hero view direction, the share card's place label, per-place browser storage (so two spots on one site keep separate dip logs and corrections), and `spot`, `model` and `datum` fields in exported dip logs.

### tide-times and tide-hub

`tide-times` (Louisburgh) shows a station's own predictions (`"mode": "station"`: heights above its LAT, as the Marine Institute gives them) from the same fitted constants the swim app uses, with an honesty label next to the times. `tide-hub` (Clew Bay) lists an area's spots from `place.json`, each marked official, sourced or "no published times", over a base map; spots with their own pages are linked and their times shown for today and tomorrow.

### mountain

`place.json`: summit (position and height), the foot (for fog), the viewpoint the hero skyline is drawn from, the two glow points, names. Injected by `templates/mountain/adapter.mjs`: summit height and position, foot, glow points, viewpoint, the labels that name the mountain, the tab title, per-place forecast cache.

## How to add a place

1. `mkdir places/<slug>` and copy a `place.json` from a place of the same template; change every value. The slug becomes the URL.
2. Give it its data in `places/<slug>/app/`, same layout as the app:
   - tide-swim: `data/tide_model.json` (fit the nearest Marine Institute station's predictions with the swim lab's `tools/fit_tides.mjs`; use the ERDDAP dataset `imiTidePrediction`, as `IMI-TidePrediction` is marked "to be replaced"), `data/point.json` (the spot's levels from the OPW/GSI LiDAR, offsets from the station), `data/skyline.json`, `data/fetch.json`, `data/map.json` + `map.png`, `data/seatemp_clim.json`, `data/slr.json`, `data/future.json`, `data/flood.json` (or withhold it), `js/sources.js`, and `index.html` with the spot's own text (keep every element `id` the app uses; the build fails if one is missing). The swim lab's tools make each data file.
   - mountain: the files the Reek lab's `tools/build.mjs` computes for a summit (`data/hero.json`, `horizon.json`, `pano.png`, `viewshed*.png`, `viewshed.json`, `places.json`, `peaks.json`) plus `js/sources.js` and `index.html`.
3. `npm run build && npm test`. The test suite already dry-runs both adapters with a made-up second place.

Still specific to the first instance inside the apps, to move into their data files upstream before a second place goes live:

- swim app: the datum-ladder reference levels and labels in `js/app.js` `drawFigures()` (the 2.75 m record, the 1.4 m chart drying height, Roonagh's LAT, the 2.6 m chart-datum gap); "a logger 1 m down at Inishoo" in `renderCards()` and the `inishoo_1m` key in `seatemp_clim.json`; the precast shelter drawn in `js/hero.js`; "at the Point" in the share text; the share card's footer names the Marine Institute (true for any Irish station).
- Reek app: `nextReekSunday()` and `#nextReek` (the pilgrimage date; another mountain's `index.html` without `#nextReek` would stop the app); the panorama chips' feature ids in `js/app.js`.
- Both: the export format name `the-point-westport-dips` (kept for the first spot so existing exports still import).
- A CSS bug worth fixing upstream: in the swim app `.tool .two { display: grid }` overrides `[hidden]`, so the check form showed the height field for every choice; the launch CSS patches it.

### A tide place for somewhere new

Copy `places/louisburgh/` for a Marine Institute station (any of its 38 prediction sites; fit the constants with the swim lab's `tools/fit_tides.mjs` and put `tide_model.json` in `places/<slug>/app/data/`). A place reached from a station needs a **citable** time and height difference (published tidal differences, sailing directions, a model that resolves the place); without one, add it to the hub as a "no published times" spot rather than give it times.

## Tidal differences: what is citable (19 Oct 2026)

- **Westport Quay.** No gauge has measured it. The Admiralty's 1868 *Sailing Directions for the West Coast of Ireland* give high water at full and change 4 h 57 m at Westport and 4 h 38 m at Clare Island (opposite Roonagh): +19 min. The UKHO's EasyTide predictions put Inishgort, at the mouth of Westport Bay, +22 min (high water) and +34 min (low water) behind Roonah Quay. The swim app had used +30/+45, adding an unsourced allowance for the Point lying further in; it now uses **+20/+35**, which moves Westport's times about 10 minutes earlier.
- **The big tide websites** put Westport's high tide earlier still (Tide Checker 12:36 on 19 Oct, about Roonagh +13 min) but are not evidence: Tide Checker's low tide comes before Roonagh's, at the mouth of the bay, which no source supports, and tide-forecast.com labels its datum "Mean Lower Low Water (Satellite)", a global satellite model.
- **The Marine Institute's NE Atlantic model** (1.4 km grid, sea-surface height on ERDDAP) shows only +2 to +4 min anywhere in Clew Bay, including Inishgort, where the Admiralty has +22: it doesn't resolve the bay, so it can't supply differences. Its Connemara model stops south of Clew Bay.
- **Murrisk, Newport, Mulranny, Achill Sound**: no published difference found (the 1868 directions give establishments for Clare Island and Westport only; Airy's 1842 Ordnance Survey tide station in the bay was at Old Head, near Louisburgh). They are on the Clew Bay page as "no published times".
- **Louisburgh**: Roonagh Pier is the Marine Institute's station, so its page is official.

## Calibration (ongoing, not a blocker)

The swim depth is a sum (predicted level minus the seabed at the foot of the steps) and nobody has measured it at the steps. The biggest single doubt is the datum: Roonagh's own gauge metadata puts its mean sea level about 0.3 m above every neighbouring Marine Institute gauge; the page sides with the neighbours, so if Roonagh is right every depth is about 0.3 m too small. Add the Roonagh-to-Point height differences (about ±0.2 m) and the seabed (about ±0.25 m): about ±0.4 m in all (root-sum-square), the figure the page shows.

Decision: publish with visible caution and let the public calibrate it. On the page:

- next to the verdict: "Depth ±0.4 m: an estimate, not a measurement. Tell us where the water was";
- a band under the hero and a section high on the page, **Tell us where the water was**: the app's check tool, moved up from the deep section. A sighting (time plus where the water was: a step, the platform edge, the foot of the steps, how deep on the body, or below the steps) is compared with the prediction and saved in the visitor's browser; their average offset can correct the page for them. The calibration code path is unchanged.
- Sightings stay on the phone for now and are exported as before ("Your dips" > Export). Exports now say which spot, tide model and datum they were made against (`schemas/dip-log.v1.schema.json`), so a small shared store can take them later: keep the raw observation (`t`, `where`) and recompute the implied level server-side, since calibration may move the step geometry.

## Data, licences and terms (checked 19 Oct 2026)

| Source | Licence and credit | High traffic | If the site carried ads or went commercial |
|---|---|---|---|
| Marine Institute (tide predictions, NE Atlantic model, coastal temperature), ERDDAP | CC BY 4.0 | No published limits; visitors' browsers call ERDDAP for sea temperature (cached 3 h per browser); ERDDAP's defaults throttle per IP | No change |
| Open-Meteo forecast and marine APIs | Data CC BY 4.0, "Weather data by Open-Meteo.com" with a link next to the data (added on both pages) | Free API: non-commercial, under 10,000 calls a day, 5,000 an hour, 600 a minute, limited per IP and per application; calls come from visitors' browsers and are cached 20–60 min | **Paid plan and API key required** (ads count as commercial). Then proxy the calls so the key isn't in browsers; a server-side cache would also cut calls at scale |
| OPW / GSI LiDAR, INFOMAR | CC BY 4.0, "Contains Irish Public Sector Data (…) licensed under CC BY 4.0" | n/a (data in files) | No change |
| OPW flood maps (CFRAM coastal extents) | **CC BY-NC-ND 4.0** (not CC BY, as the swim app first said) | n/a | Non-commercial only and no modified copies, so **removed at source**: the swim app now links to floodinfo.ie with a one-line description, its `data/flood.json` is empty and its source entry gives the right licence. Short, cited quotations of the flood study (JBA for the Council) and a planning file stay. `withhold` in `places/westport/place.json` keeps the layers out of the public build even if the lab tools regenerate them |
| IPCC AR6 projections (NASA tool, Zenodo) | CC BY 4.0; cite Fox-Kemper 2021, Garner 2021, Kopp 2023; their acknowledgement is on the About page | n/a | No change; never imply NASA endorsement |
| OpenStreetMap | ODbL, "© OpenStreetMap contributors" | n/a | No change. Our OSM-derived JSON files are databases: the About page offers them under the ODbL |
| OpenFreeMap tiles, MapLibre GL JS (unpkg, pinned 4.7.1) | OpenFreeMap © OpenMapTiles, data from OSM (MapLibre shows it); MapLibre BSD-3 | No limits stated, no SLA; unpkg has no SLA (consider self-hosting MapLibre) | No change |
| AWS Terrain Tiles / EU-DEM / SRTM / GMTED / ETOPO1 | The Tilezen attribution lines (in the footer) | n/a for the skyline data; the "from where you are" tool fetches tiles from the open-data bucket in the browser | No change |
| logainm.ie | Placenames: CC BY 4.0, "Irish-language placename data by Logainm © Government of Ireland" | n/a | Names: no change. Glosses and notes may not be reproduced, so **none are**: the Reek page's name paragraph now paraphrases P. W. Joyce (public domain) and quotes Tírechán's Latin, and two card notes quoted via logainm were dropped |
| MountainViews.ie | Their terms forbid using their data "to build another website" without written permission | n/a | **Nothing of theirs is used**: summit positions and heights come from OpenStreetMap (Inishturk's height from Wikipedia), Irish forms only from logainm or OSM `name:ga` (Barrclashcame has none), card notes they alone supplied were dropped or re-sourced to Wikipedia, and their credit lines are gone. The Reek data was rebuilt from the edited inputs |
| UK Hydrographic Office EasyTide | Crown copyright; reproduction or adaptation needs a licence | n/a | The swim page quotes time differences we derived by comparing EasyTide's Inishgort and Roonah Quay predictions; it doesn't republish predictions. Safer long-term: rely on public sightings (and the 1868 Admiralty figures) and drop the EasyTide comparison |
| Fraunces, Inter | SIL OFL 1.1 (licences shipped in `/assets/fonts/`) | n/a | No change |

## Launch to-dos (owner decisions)

- [ ] Domain: buy `thealmanac.ie`, then `customDomain` in `site.config.mjs`, Settings > Pages and DNS (see Deploy). Optionally point `outtoday.ie` at it as a redirect.
- [ ] Search Console and Bing Webmaster Tools: verify the property (HTML tag: put the tokens in `site.config.mjs` > `verification`, they go on the home page), then submit `sitemap.xml`.
- [ ] Optional: ask the OPW (via floodinfo.ie) whether the flood map may be shown redrawn; until then the page links to it.
- [ ] A public contact address (`contactEmail`) for corrections and pooled sightings, and the source link (`repoUrl`).
- [ ] Calibration continues after launch: watch for pooled sightings, then revisit the datum choice and the ±0.4 m. When sightings arrive in numbers, consider the small shared store (format ready).
- [ ] If traffic grows: Open-Meteo's free tier is per IP and non-commercial; a cached proxy (or snapshotting forecasts at build time) avoids limits and is needed anyway with a paid key.

## Testing (last run on this build)

`npm test`: every page in the sitemap loads with a clean console and no failed requests (live forecasts on); the live apps replace the "As of" snapshots; with JavaScript off the Westport page carries the 8-day tide table with times, heights and springs/neaps, the swim app's 7-day depth table, charts, year sentence, 62 sources and the deep sections, and the Reek page its verdict, forecast, 44 view cards, deep sections and sources; a sighting saved through "Tell us where the water was" exports with spot, model and datum; sitemap, robots and JSON-LD (WebSite, WebPage, Place, Mountain, BreadcrumbList) validate; share images are 1200×630 PNGs; both adapters apply to a made-up second place; a second build under `/almanac/` crawls with no broken links; nothing private in the repo or the build. In this headless setup the map's WebGL logs "GPU stall due to ReadPixels" warnings from software rendering; the test sets those aside.

`npm run shots` writes 390×844 screenshots (with and without JavaScript) to `shots/`.
