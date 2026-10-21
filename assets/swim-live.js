// The Almanac: the live part of a deep-water swim page (templates/swim/deep.mjs). Reads the page's
// #swimConfig, works the tide out locally (the swim app's tide model, no network), fetches the
// Open-Meteo forecast and marine forecast for the spot (cached an hour), and estimates the sea state
// with assets/swim-sea.js. If the forecast fails, the tide still renders and the page says so.
const cfg = JSON.parse(document.getElementById('swimConfig').textContent);
const lib = new URL(cfg.lib, location.href).href;
const [sea, tide, util] = await Promise.all([import(new URL(cfg.sea, location.href).href), import(lib + 'tide.js'), import(lib + 'util.js')]);
const $ = (id) => document.getElementById(id);
const esc = util.esc, hm = util.hm, C = util.compassWord;
const F = cfg.fetch, predict = tide.makePredictor(cfg.model);
const params = new URLSearchParams(location.search), NOW = params.get('at') ? Date.parse(params.get('at')) : Date.now();

async function cached(key, url, ms = 10000) {
  const k = `swims:${cfg.slug}:${key}`;
  try { const c = JSON.parse(localStorage.getItem(k) || 'null'); if (c && Date.now() - c.at < 3600000 && c.url === url) return c.data; } catch { /* no storage */ }
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(`${key}: HTTP ${r.status}`);
    const data = await r.json(); try { localStorage.setItem(k, JSON.stringify({ at: Date.now(), url, data })); } catch { /* quota */ }
    return data;
  } finally { clearTimeout(timer); }
}
const q = (base, o) => { const u = new URL(base); for (const [a, b] of Object.entries(o)) u.searchParams.set(a, b); return u.toString(); };
const km = (a, b) => { const R = 6371, r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r; return R * Math.hypot(x, y); };
const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };
const day = (t) => new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', weekday: 'short' }).format(new Date(t));

// ---- the tide, now (no network needed)
const ex = tide.extremes(predict, NOW - 8 * 3600000, NOW + 30 * 3600000, 6);
const next = ex.find((e) => e.t > NOW), nextHW = ex.find((e) => e.t > NOW && e.high), nextLW = ex.find((e) => e.t > NOW && !e.high);
const tideLine = next ? `${next.high ? 'Rising' : 'Falling'}: ${next.high ? 'high' : 'low'} water at ${hm(next.t)} (in ${dur(next.t - NOW)}), then ${next.high ? 'low' : 'high'} water at ${hm((next.high ? nextLW : nextHW).t)}. ${cfg.station} predictions.` : '';
$('svTide').textContent = tideLine;

// ---- the forecast
let fc, mar;
try {
  [fc, mar] = await Promise.all([
    cached('fc', q('https://api.open-meteo.com/v1/forecast', { latitude: cfg.entry.lat, longitude: cfg.entry.lon, hourly: 'temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m', wind_speed_unit: 'kmh', timezone: 'Europe/Dublin', timeformat: 'unixtime', past_days: 2, forecast_days: 3 })),
    cached('marine', q('https://marine-api.open-meteo.com/v1/marine', { latitude: cfg.marine.lat, longitude: cfg.marine.lon, hourly: 'swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature', cell_selection: 'sea', timezone: 'Europe/Dublin', timeformat: 'unixtime', forecast_days: 3 })),
  ]);
} catch (e) {
  $('now').className = 'now tone-unknown';
  $('svWord').textContent = 'No forecast';
  $('svLine').textContent = "The forecast didn't load, so there is no sea-state estimate right now. The tide, the notices and the water quality on this page don't need it.";
  $('svAsof').innerHTML = `Tried at ${hm(Date.now())}. <a href="#how">How the estimate is made</a>.`;
  $('svBest').textContent = 'No forecast, so no calmest spell either.';
  throw e;
}
const mIdx = new Map(mar.hourly.time.map((t, i) => [t * 1000, i]));
const hours = fc.hourly.time.map((t, i) => {
  const T = t * 1000, j = mIdx.get(T);
  const h = { t: T, wind: fc.hourly.wind_speed_10m[i], windDir: fc.hourly.wind_direction_10m[i], gust: fc.hourly.wind_gusts_10m[i], air: fc.hourly.temperature_2m[i], rain: fc.hourly.precipitation[i],
    swell: j != null ? mar.hourly.swell_wave_height[j] : null, swellDir: j != null ? mar.hourly.swell_wave_direction[j] : null, swellPeriod: j != null ? mar.hourly.swell_wave_period[j] : null, sst: j != null ? mar.hourly.sea_surface_temperature[j] : null };
  return { ...h, s: sea.seaState(h, F), sun: util.sunPosition(T + 1800000, cfg.entry.lat, cfg.entry.lon).alt };
});
const iNow = Math.max(0, hours.findIndex((h) => h.t > NOW - 1800000));
const H = hours[iNow], S = H.s;
const cell = { lat: mar.latitude, lon: mar.longitude }, cellKm = km(cfg.entry, cell);
const rain48 = hours.filter((h) => h.t <= NOW && h.t > NOW - 48 * 3600000).reduce((s, h) => s + (h.rain || 0), 0);

// ---- the verdict
$('now').className = `now tone-${cfg.stop ? 'stop' : S.tone}`;
$('svWord').textContent = cfg.stop ? 'Do Not Swim notice' : S.word;
const fk = sea.fetchKm(F, H.windDir);
const windBit = `wind ${Math.round(H.wind)} km/h from the ${C(H.windDir)}${H.gust > H.wind + 8 ? ` (gusts ${Math.round(H.gust)})` : ''}, ${fk.km >= F.maxKm ? 'blowing in off the open sea' : fk.km >= 1 ? `blowing in over ${fk.km < 10 ? fk.km.toFixed(1) : Math.round(fk.km)} km of water` : 'blowing off the land here'}`;
const swellBit = H.swell != null ? `swell ${H.swell.toFixed(1)} m from the ${C(H.swellDir)} offshore${H.swellPeriod ? ` (${Math.round(H.swellPeriod)} s)` : ''}, ${S.swellFactor < 0.2 ? 'mostly kept out by the land' : S.swellFactor < 0.7 ? 'partly sheltered from here' : 'coming straight in'}` : 'no swell forecast';
$('svLine').innerHTML = `${cfg.stop ? '<b>See the notice above.</b> As for the sea: ' : ''}${esc(S.line)} ${esc(sea.metres(S.total).replace(/^./, (c) => c.toUpperCase()))} of waves at ${esc(cfg.short)}: ${esc(windBit)}; ${esc(swellBit)}.${S.offshore ? ' An offshore wind flattens the water by the shore but carries anything floating, and anyone tiring, out to sea.' : ''}${cfg.closed ? ' <b>It may still be closed for repairs: see above.</b>' : ''}`;
const facts = [
  ['Tide', tideLine],
  ['Wind', `${Math.round(H.wind)} km/h from the ${C(H.windDir)}, gusts ${Math.round(H.gust)} km/h. Air ${Math.round(H.air)} °C.`],
  ['Swell', H.swell != null ? `${H.swell.toFixed(1)} m from the ${C(H.swellDir)} at the model cell ${Math.round(cellKm)} km away.` : 'Not available.'],
  ['Sea', H.sst != null ? `About ${(Math.round(H.sst * 2) / 2).toFixed(1)} °C at the surface, in the model cell ${Math.round(cellKm)} km away; the water by the rocks can differ by a degree or more.` : 'Not available.'],
  ['Rain', `${rain48.toFixed(0)} mm in the last 48 hours (modelled).${cfg.risk && rain48 >= 15 ? ' That is a lot: the EPA lists this water as at risk of short-term pollution, which usually follows heavy rain.' : ''}`],
];
$('svFacts').innerHTML = facts.map(([k, v]) => `<li><b>${k}</b> <span${k === 'Tide' ? ' id="svTide"' : ''}>${esc(v)}</span></li>`).join('');
$('svAsof').innerHTML = `As of ${hm(Date.now())}, for the hour from ${hm(H.t)}. Estimated, not observed: <a href="#how">what that means</a>.`;

// ---- the next 36 hours: one bar an hour, the tide behind
const win = hours.slice(iNow, iNow + 36);
const W = 380, Hh = 150, L = 26, R = 6, Tp = 10, B = 22, bw = (W - L - R) / win.length, Y = (m) => Tp + (Hh - Tp - B) * (1 - Math.min(m, 1.5) / 1.5);
const COL = { calm: '#2a7fb8', lively: '#6aa84f', choppy: '#e0a030', rough: '#d0622b', big: '#a3333d' };
let svg = '';
win.forEach((h, i) => { const x = L + i * bw; if (h.sun < -0.833) svg += `<rect x="${x.toFixed(1)}" y="${Tp}" width="${(bw + 0.3).toFixed(1)}" height="${Hh - Tp - B}" fill="#1b2a36" opacity="${h.sun < -6 ? 0.12 : 0.06}"/>`; });
const lv = cfg.model.levels, tY = (t) => Tp + (Hh - Tp - B) * (1 - (predict(t) - lv.min_2026_2044) / (lv.max_2026_2044 - lv.min_2026_2044));
let path = ''; for (let t = win[0].t, k = 0; t <= win[win.length - 1].t + 3600000; t += 15 * 60000, k++) path += `${k ? 'L' : 'M'}${(L + ((t - win[0].t) / 3600000) * bw).toFixed(1)},${tY(t).toFixed(1)}`;
svg += `<path d="${path}" fill="none" stroke="#9aa7ae" stroke-width="1.4" stroke-dasharray="3 2"/>`;
win.forEach((h, i) => { const x = L + i * bw + 1, y = Y(h.s.total); svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(Hh - B - y).toFixed(1)}" fill="${COL[h.s.tone]}"><title>${hm(h.t)}: ${h.s.word}, ${sea.metres(h.s.total)}</title></rect>`; });
svg += [0, 0.5, 1, 1.5].map((m) => `<text x="${L - 4}" y="${(Y(m) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#5a6b76">${m} m</text>`).join('');
win.forEach((h, i) => { const p = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', hour: '2-digit', hourCycle: 'h23' }).format(new Date(h.t)); if (+p % 6 === 0) svg += `<text x="${(L + i * bw).toFixed(1)}" y="${Hh - 7}" font-size="9.5" fill="#2c4150">${+p === 0 ? day(h.t) : p + ':00'}</text>`; });
$('svChart').innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Estimated waves at ${esc(cfg.short)}, hour by hour for the next 36 hours">${svg}</svg><p class="small">Bars: our estimate of the waves at ${esc(cfg.short)}, hour by hour (blue calm, green a little lively, amber choppy, orange rough, red big). Dashed: the tide. Grey: night.</p>`;

// ---- the calmest daylight spell (three hours, in the light)
let best = null;
for (let i = 0; i + 3 <= win.length; i++) { const w = win.slice(i, i + 3); if (w.some((h) => h.sun < 0)) continue; const m = w.reduce((s, h) => s + h.s.total, 0) / 3; if (!best || m < best.m - 0.02) best = { i, m }; }
$('svBest').innerHTML = best ? `Calmest daylight spell in the next 36 hours: <b>${day(win[best.i].t)} ${hm(win[best.i].t)}–${hm(win[best.i].t + 3 * 3600000)}</b>, ${esc(sea.word(best.m).word.toLowerCase())}, ${esc(sea.metres(best.m))} (estimated).` : 'No three daylight hours in a row in the next 36 hours.';

// ---- the rose: where the wind and swell come from
const g = document.querySelector('#exposure svg .arrows');
if (g) {
  const vb = document.querySelector('#exposure svg').viewBox.baseVal, c = vb.width / 2, R0 = vb.width * 0.47, R1 = vb.width * 0.3;
  const arrow = (deg, col, lab) => { const a = (deg * Math.PI) / 180, x0 = c + R0 * Math.sin(a), y0 = c - R0 * Math.cos(a), x1 = c + R1 * Math.sin(a), y1 = c - R1 * Math.cos(a);
    return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${col}" stroke-width="4" stroke-linecap="round" marker-end="url(#ah-${lab})"/>`; };
  g.innerHTML = `<defs><marker id="ah-w" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5z" fill="#e07b1f"/></marker><marker id="ah-s" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5z" fill="#0f4c81"/></marker></defs>${arrow(H.windDir, '#e07b1f', 'w')}${H.swellDir != null ? arrow(H.swellDir, '#0f4c81', 's') : ''}`;
}
