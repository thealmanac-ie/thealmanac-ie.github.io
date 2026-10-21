// Graceful degradation for the prerender. One slow API must not block a deploy, so when a place's
// prerender fails (or part of it does), the build falls back, in order, to:
//   1. the last good prerender of that place (tmp/prerender-cache/<slug>.json, kept between CI runs
//      by actions/cache), with anything time-sensitive (a weather verdict, an "as of" tide verdict)
//      stripped out by the template's cacheable(): stale words are worse than none;
//   2. the site's fallback share card and thumbnail (assets/og-fallback.png, assets/thumb-fallback.webp,
//      committed; redraw them with tools/fallback-card.mjs).
// Every fallback is recorded and reported (a warning, a GitHub Actions annotation and
// tmp/build-report.json). The build still fails if a share image is missing or the wrong size, if
// the browser cannot start at all, or if every place failed (that is a broken build, not a slow API).
import fs from 'node:fs';
import path from 'node:path';

export function makeFallbacks(ctx) {
  const dir = path.resolve(ctx.root, process.env.PRERENDER_CACHE || 'tmp/prerender-cache');
  fs.mkdirSync(dir, { recursive: true });
  const asset = (f, type) => `data:${type};base64,` + fs.readFileSync(path.join(ctx.root, 'assets', f)).toString('base64');
  const events = [];
  const file = (slug) => path.join(dir, `${slug}.json`);
  return {
    events,
    dir,
    save(slug, data) {
      try { fs.writeFileSync(file(slug), JSON.stringify({ savedAt: new Date(ctx.now).toISOString(), data })); } catch (e) { console.warn(`  cache: could not save ${slug}: ${e.message}`); }
    },
    load(slug) {
      try { const j = JSON.parse(fs.readFileSync(file(slug), 'utf8')); return { ...j.data, cachedAt: j.savedAt }; } catch { return null; }
    },
    card: () => asset('og-fallback.png', 'image/png'),
    thumb: () => asset('thumb-fallback.webp', 'image/webp'),
    note(slug, what, why) { events.push({ slug, what, why }); console.warn(`  ${slug}: ${what} (${why})`); },
  };
}

// Resolve a place's prerender result: live, else cached, else nothing; then make sure the share card
// and thumbnail exist (cached or the site fallback). Returns the result to build with.
export function resolve(fb, place, live, err, cacheable) {
  let pr = live;
  if (live && !err) {
    if (live.degraded?.length) for (const d of live.degraded) fb.note(place.slug, `live part skipped: ${d}`, 'built without it');
    fb.save(place.slug, cacheable ? cacheable(live) : live);
  } else {
    const c = fb.load(place.slug);
    if (c) { pr = c; fb.note(place.slug, `prerender failed, using the cached prerender from ${c.cachedAt}`, err?.message?.split('\n')[0] || 'no result'); }
    else { pr = {}; fb.note(place.slug, 'prerender failed and nothing cached: no snapshot', err?.message?.split('\n')[0] || 'no result'); }
  }
  if (!pr.og) { pr.og = fb.card(); pr.ogFallback = true; fb.note(place.slug, 'share card: the site fallback card', 'none drawn or cached'); }
  if (!pr.thumb) { pr.thumb = fb.thumb(); pr.thumbFallback = true; fb.note(place.slug, 'thumbnail: the site fallback', 'none drawn or cached'); }
  return pr;
}

export function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([promise, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${label}: gave up after ${ms / 1000} s`)), ms); })]).finally(() => clearTimeout(timer));
}

export function report(ctx, fb, { failedAll }) {
  const out = path.join(ctx.root, 'tmp', 'build-report.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ builtAt: new Date(ctx.now).toISOString(), degraded: fb.events }, null, 1) + '\n');
  if (!fb.events.length) return;
  console.warn(`  degraded build: ${fb.events.length} fallback(s), listed in tmp/build-report.json`);
  if (process.env.GITHUB_ACTIONS) for (const e of fb.events) console.log(`::warning title=Prerender fallback (${e.slug})::${e.what} (${e.why})`.replace(/\n/g, ' '));
  if (failedAll) throw new Error('every place failed to prerender: that is a broken build, not one slow API');
}

// A page built with the fallback card must not describe a picture it doesn't show.
export const FALLBACK_ALT = (site) => `${site.brand}: tides, sun, moon and weather, place by place (the site's share card)`;
export function fixFallbackAlt(ctx, pages, slug) {
  const alt = FALLBACK_ALT(ctx.site).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  for (const pg of pages) {
    if (pg.og?.path !== `og/${slug}.png`) continue;
    const f = path.join(ctx.dist, pg.path, 'index.html');
    if (!fs.existsSync(f)) continue;
    const h = fs.readFileSync(f, 'utf8').replace(/(<meta (?:property|name)="(?:og|twitter):image:alt" content=")[^"]*(")/g, `$1${alt}$2`);
    fs.writeFileSync(f, h);
  }
}
