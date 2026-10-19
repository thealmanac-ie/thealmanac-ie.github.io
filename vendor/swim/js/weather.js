// Live conditions. Everything here is optional: if a request fails, the tide parts of the page
// still work (they need no network at all).
//   Wind, air temperature, rain, cloud: Open-Meteo forecast API (best-match models), CC BY 4.0.
//   Sea temperature: Marine Institute NE Atlantic model (IMI_NEATL, ERDDAP), nearest wet cell,
//   with Open-Meteo Marine (Meteo-France SST, ~8 km) as a second opinion.
// Responses are cached in localStorage for an hour, so a regular reloading the page does not
// hammer anyone's server.

export const SPOT = { lat: 53.80224, lon: -9.56032 }; // 15 m off the swimming area node, OSM 9996872068
export const NEATL_CELL = { lat: 53.80625, lon: -9.63125 }; // nearest wet cell of IMI_NEATL to the Point (~4.7 km west)

const TTL = 60 * 60 * 1000;

async function cached(key, url, ttl = TTL, timeoutMs = 9000) {
  const k = 'swim:' + key;
  try {
    const c = JSON.parse(localStorage.getItem(k) || 'null');
    if (c && Date.now() - c.at < ttl && c.url === url) return c.data;
  } catch { /* storage unavailable */ }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${key}: HTTP ${r.status}`);
    const data = await r.json();
    try { localStorage.setItem(k, JSON.stringify({ at: Date.now(), url, data })); } catch { /* quota */ }
    return data;
  } finally { clearTimeout(timer); }
}

export async function getForecast() {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  Object.entries({
    latitude: SPOT.lat, longitude: SPOT.lon, timezone: 'Europe/Dublin', past_days: 1, forecast_days: 5,
    hourly: 'temperature_2m,apparent_temperature,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code',
    wind_speed_unit: 'kmh', timeformat: 'unixtime',
  }).forEach(([a, b]) => u.searchParams.set(a, b));
  const d = await cached('fc', u.toString());
  const h = d.hourly;
  return h.time.map((t, i) => ({
    t: t * 1000, temp: h.temperature_2m[i], feels: h.apparent_temperature[i], rain: h.precipitation[i], cloud: h.cloud_cover[i],
    speed: h.wind_speed_10m[i], dir: h.wind_direction_10m[i], gust: h.wind_gusts_10m[i], code: h.weather_code[i],
  }));
}

export async function getSeaTempMI() {
  // whole forecast window for one cell: ~240 hourly values, a few KB
  const url = `https://erddap.marine.ie/erddap/griddap/IMI_NEATL.json?sea_surface_temperature%5B0:1:last%5D%5B(${NEATL_CELL.lat})%5D%5B(${NEATL_CELL.lon})%5D`;
  const d = await cached('neatl', url, 3 * TTL, 12000);
  const rows = d.table.rows;
  return rows.filter((r) => r[3] != null).map((r) => ({ t: Date.parse(r[0]), sst: r[3] }));
}

export async function getSeaTempOM() {
  const u = new URL('https://marine-api.open-meteo.com/v1/marine');
  Object.entries({ latitude: SPOT.lat, longitude: SPOT.lon, hourly: 'sea_surface_temperature', timezone: 'Europe/Dublin', past_days: 1, forecast_days: 4, timeformat: 'unixtime' })
    .forEach(([a, b]) => u.searchParams.set(a, b));
  const d = await cached('om-marine', u.toString(), 3 * TTL);
  return { cell: { lat: d.latitude, lon: d.longitude }, rows: d.hourly.time.map((t, i) => ({ t: t * 1000, sst: d.hourly.sea_surface_temperature[i] })).filter((r) => r.sst != null) };
}

// value of a series nearest in time
export function at(series, t, key) {
  if (!series || !series.length) return null;
  let best = series[0];
  for (const r of series) if (Math.abs(r.t - t) < Math.abs(best.t - t)) best = r;
  if (Math.abs(best.t - t) > 3 * 3600000) return null;
  return key ? best[key] : best;
}
