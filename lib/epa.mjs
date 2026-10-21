// The EPA's bathing-water data (Bathing Water Open Data API, data.epa.ie/bw, CC BY 4.0; the data
// behind beaches.ie), read at build time: the API sends no CORS headers, so visitors' browsers can't
// ask it themselves. What we use:
//   Locations: each bathing water's annual classification (and the years it covers), any all-season
//              bathing restriction, the short-term pollution risk flag, last season's closure days;
//   Alerts:    current incidents and bathing restrictions (the "Do Not Swim" notices), in season;
//   Measurements: the latest sample results (the newest pages only; the endpoint is slow and has
//              answered HTTP 500 at times, so a page without them says so rather than guess).
// Falls back to the last good copy (tmp/prerender-cache/epa.json), then to the committed snapshot
// (places/swims/epa-snapshot.json), and every page says which it is showing and when it was fetched.
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://data.epa.ie/bw/api/v1/';
const KEEP = ['beach_id', 'beach_name', 'local_authority_name', 'beach_type', 'current_annual_water_quality_classification', 'current_annual_classification_year',
  'year1_annual_water_quality_classification', 'year1_annual_classification_year', 'year2_annual_water_quality_classification', 'year2_annual_classification_year',
  'year3_annual_water_quality_classification', 'year3_annual_classification_year', 'annual_water_quality_assessment', 'has_all_season_bathing_restriction_in_place',
  'reason_for_all_season_bathing_restriction', 'previous_year_stp_closure_days', 'short_term_pollution_risk', 'has_lifeguard', 'lifeguard_availability', 'next_monitoring_date', 'last_updated'];

async function get(url, ms) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'thealmanac-build (daily, a few requests)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}
const list = (j) => (Array.isArray(j) ? j : Array.isArray(j?.list) ? j.list : []);

// Fetch what the swim pages need for these bathing-water ids. Never throws.
export async function fetchEpa(ids, { timeoutMs = 20000 } = {}) {
  const out = { fetchedAt: new Date().toISOString(), locations: {}, alerts: [], alertsOk: false, measurements: {}, measurementsOk: false, errors: [] };
  try {
    const locs = list(await get(`${API}Locations?page=1&per_page=1000`, timeoutMs));
    for (const b of locs) if (ids.includes(b.beach_id)) out.locations[b.beach_id] = Object.fromEntries(KEEP.map((k) => [k, b[k] ?? null]));
  } catch (e) { out.errors.push(`Locations: ${e.message}`); }
  try {
    const al = list(await get(`${API}Alerts?page=1&per_page=1000`, timeoutMs));
    out.alerts = al.filter((a) => ids.some((id) => JSON.stringify(a).includes(id)));
    out.alertsOk = true;
  } catch (e) { out.errors.push(`Alerts: ${e.message}`); }
  try {
    // records come oldest first, about 26,000 of them: read the newest few pages of each kind
    const ms = [];
    for (const season of ['true', 'false']) {
      const n = (await get(`${API}Measurements?page=1&per_page=1&in_season=${season}`, timeoutMs)).count || 0, last = Math.ceil(n / 1000);
      for (let pg = Math.max(1, last - (season === 'true' ? 2 : 1)); pg <= last; pg++) ms.push(...list(await get(`${API}Measurements?page=${pg}&per_page=1000&in_season=${season}`, timeoutMs)).map((m) => ({ ...m, in_season: season === 'true' })));
    }
    for (const id of ids) {
      const mine = ms.filter((m) => m.beach_id === id && m.result_date).sort((a, b) => b.result_date.localeCompare(a.result_date));
      if (mine.length) out.measurements[id] = mine.slice(0, 6).map((m) => ({ date: m.result_date, status: m.sample_water_quality_status, ecoli: m.e_coli_result, enterococci: m.intestinal_enterococci_result, inSeason: m.in_season }));
    }
    out.measurementsOk = true;
  } catch (e) { out.errors.push(`Measurements: ${e.message}`); }
  out.ok = Object.keys(out.locations).length > 0;
  return out;
}

// Build-time loader: live, else the last good copy, else the committed snapshot. Never throws.
export async function loadEpa(ctx, ids) {
  const cacheFile = path.resolve(ctx.root, process.env.PRERENDER_CACHE || 'tmp/prerender-cache', 'epa.json');
  const snapFile = path.join(ctx.root, 'places', 'swims', 'epa-snapshot.json');
  const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const live = process.env.EPA_OFFLINE ? { ok: false, errors: ['EPA_OFFLINE set'] } : await fetchEpa(ids);
  const have = (d) => d && ids.every((id) => d.locations?.[id]);
  if (live.ok) {
    // keep anything the live answer lacked (a timed-out Alerts call) from the last good copy, labelled
    const prev = read(cacheFile);
    if (!live.alertsOk && prev?.alertsOk) { live.alerts = prev.alerts; live.alertsFrom = prev.alertsFrom || prev.fetchedAt; } else if (live.alertsOk) live.alertsFrom = live.fetchedAt;
    if (!live.measurementsOk && prev?.measurementsOk) { live.measurements = prev.measurements; live.measurementsFrom = prev.measurementsFrom || prev.fetchedAt; live.measurementsOk = true; } else if (live.measurementsOk) live.measurementsFrom = live.fetchedAt;
    try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(live)); } catch { /* cache is optional */ }
    if (have(live)) return { ...live, source: 'live' };
  }
  for (const [d, source] of [[read(cacheFile), 'cached'], [read(snapFile), 'snapshot']]) if (have(d)) return { ...d, source, liveErrors: live.errors };
  return { source: 'none', locations: {}, alerts: [], alertsOk: false, measurements: {}, measurementsOk: false, liveErrors: live.errors, fetchedAt: null };
}

// One alert, in words: whatever text and dates it carries (the API publishes no schema).
export function describeAlert(a) {
  const text = Object.entries(a).filter(([k, v]) => typeof v === 'string' && v.length > 3 && /type|reason|desc|advice|message|text|title|status|restriction/i.test(k)).map(([, v]) => v);
  const dates = Object.entries(a).filter(([k, v]) => typeof v === 'string' && /date|time|issued|start|from/i.test(k) && !Number.isNaN(Date.parse(v))).map(([k, v]) => ({ k, t: Date.parse(v) })).sort((x, y) => y.t - x.t);
  return { text: [...new Set(text)].join(' · ') || 'A bathing-water incident or restriction is listed for this water.', issued: dates.length ? dates[dates.length - 1].t : null };
}
