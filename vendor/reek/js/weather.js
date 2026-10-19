// Weather: fetch Open-Meteo, estimate the cloud base over the Reek, and turn it into a verdict.
// Everything here is explained in plain words in the "How we work this out" panel.
import { clamp, median, sunPosition } from './sky.js';

export const TOP = 764;                                   // summit height, m
export const SUMMIT = { lat: 53.7600, lon: -9.6601 };
const FOOT = { lat: 53.7790, lon: -9.6354 };             // Murrisk, at the foot
const WEST = { lat: 53.70, lon: -11.20 };                // ~100 km out to sea: where sunset light comes in
const EAST = { lat: 53.80, lon: -8.10 };                 // ~100 km inland: where sunrise light comes in
export const MODELS = [
  { id: 'ukmo_seamless', name: 'UK Met Office' },
  { id: 'icon_seamless', name: 'DWD ICON' },
  { id: 'ecmwf_ifs025', name: 'ECMWF' },
];
const LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700];
const WIND_LEVELS = [950, 925, 900, 850];
const API = 'https://api.open-meteo.com/v1/forecast';
const COMMON = 'forecast_days=7&timeformat=unixtime&timezone=Europe%2FDublin&wind_speed_unit=kmh';

export function columnURL() {
  const v = ['precipitation', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high'];
  for (const p of LEVELS) v.push(`temperature_${p}hPa`, `relative_humidity_${p}hPa`, `geopotential_height_${p}hPa`);
  for (const p of WIND_LEVELS) v.push(`wind_speed_${p}hPa`, `wind_direction_${p}hPa`);
  return `${API}?latitude=${SUMMIT.lat}&longitude=${SUMMIT.lon}&hourly=${v.join(',')}&models=${MODELS.map((m) => m.id).join(',')}&${COMMON}`;
}
export function pointsURL() {
  const pts = [FOOT, WEST, EAST];
  const v = ['temperature_2m', 'dew_point_2m', 'visibility', 'precipitation', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'wind_gusts_10m'];
  return `${API}?latitude=${pts.map((p) => p.lat).join(',')}&longitude=${pts.map((p) => p.lon).join(',')}&hourly=${v.join(',')}&daily=sunrise,sunset&${COMMON}`;
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(j.reason || 'Open-Meteo error');
  return j;
}
export async function loadWeather() {
  const KEY = 'reek-wx-v3', TTL = 20 * 60e3;
  try { const c = JSON.parse(localStorage.getItem(KEY)); if (c && Date.now() - c.t < TTL) return c.data; } catch { /* no cache */ }
  const [col, pts] = await Promise.all([getJSON(columnURL()), getJSON(pointsURL())]);
  const data = { col, pts: Array.isArray(pts) ? pts : [pts], fetched: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), data })); } catch { /* quota */ }
  return data;
}

// Magnus formula (Alduchov & Eskridge 1996 constants).
export const dewpoint = (t, rh) => { const a = 17.625, b = 243.04, g = Math.log(rh / 100) + a * t / (b + t); return b * g / (a - g); };

function columnOf(H, id, i) {
  const prof = [];
  for (const p of LEVELS) {
    const z = H[`geopotential_height_${p}hPa_${id}`]?.[i], t = H[`temperature_${p}hPa_${id}`]?.[i], rh = H[`relative_humidity_${p}hPa_${id}`]?.[i];
    if (z == null || t == null || rh == null) continue;
    prof.push({ z, t, rh: clamp(rh, 1, 100) });
  }
  prof.sort((a, b) => a.z - b.z);
  if (prof.length < 3 || prof[0].z > 600 || prof[prof.length - 1].z < 1200) return null;
  const at = (z) => { // linear in height, no extrapolation
    let k = 0; while (k < prof.length - 2 && prof[k + 1].z < z) k++;
    const A = prof[k], B = prof[k + 1], f = clamp((z - A.z) / (B.z - A.z), 0, 1);
    const t = A.t + (B.t - A.t) * f, rh = A.rh + (B.rh - A.rh) * f;
    return { t, rh, td: dewpoint(t, rh) };
  };
  const winds = [];
  for (const p of WIND_LEVELS) {
    const z = H[`geopotential_height_${p}hPa_${id}`]?.[i], s = H[`wind_speed_${p}hPa_${id}`]?.[i], d = H[`wind_direction_${p}hPa_${id}`]?.[i];
    if (z != null && s != null) winds.push({ z, s, d });
  }
  winds.sort((a, b) => a.z - b.z);
  return { prof, at, winds };
}

// One model, one hour. v: 0 = no (top in cloud), 1 = partly, 2 = yes.
export function summitModel(H, id, i) {
  const c = columnOf(H, id, i);
  if (!c) return null;
  const top = c.at(TOP);
  let wind = null, dir = null;
  if (c.winds.length) {
    let k = 0; while (k < c.winds.length - 2 && c.winds[k + 1].z < TOP) k++;
    const A = c.winds[k], B = c.winds[Math.min(k + 1, c.winds.length - 1)];
    const f = B === A ? 0 : clamp((TOP - A.z) / (B.z - A.z), 0, 1);
    wind = A.s + (B.s - A.s) * f; dir = f < 0.5 ? A.d : B.d;
  }
  // Wind pushes air up the slopes: lift air from up to `lift` metres below the top.
  const lift = clamp(6 * (wind ?? 0), 0, 250);
  let baseOro = Infinity;
  for (let z0 = Math.max(c.prof[0].z, TOP - lift); z0 <= TOP + 0.1; z0 += 25) {
    const q = c.at(z0); baseOro = Math.min(baseOro, z0 + 125 * Math.max(0, q.t - q.td));
  }
  let zSat = null; // lowest level where the model's air is (nearly) saturated
  for (let z = Math.max(30, c.prof[0].z); z <= 3000; z += 25) if (c.at(z).rh >= 95) { zSat = z; break; }
  const precip = H[`precipitation_${id}`]?.[i] ?? 0;
  const low = H[`cloud_cover_low_${id}`]?.[i] ?? null, mid = H[`cloud_cover_mid_${id}`]?.[i] ?? null, high = H[`cloud_cover_high_${id}`]?.[i] ?? null;
  const base = Math.min(baseOro, zSat ?? Infinity);
  const scattered = zSat != null && zSat < baseOro && low != null && low < 40;   // a thin broken layer only
  const lowDeck = zSat != null && zSat < TOP - 150 && top.rh < 88 && baseOro > TOP + 50; // lid below the top
  let v, why;
  if (precip >= 1.5) { v = 0; why = 'rain'; }
  else if (base <= TOP - 40 && !scattered) { v = 0; why = lowDeck ? 'under' : 'cloud'; }
  else if (base <= TOP + 120 || precip >= 0.4 || scattered) { v = 1; why = precip >= 0.4 ? 'showers' : scattered ? 'scattered' : 'cap'; }
  else { v = 2; why = 'clear'; }
  let freeze = null;
  for (let z = Math.max(0, c.prof[0].z); z <= c.prof[c.prof.length - 1].z; z += 25) if (c.at(z).t <= 0) { freeze = z; break; }
  return { id, v, why, base, baseOro, zSat, lowDeck, rhTop: top.rh, tTop: top.t, tdTop: top.td, wind, dir, lift, precip, low, mid, high, freeze };
}

const majority = (xs) => { const c = {}; let best = null; for (const x of xs) { c[x] = (c[x] || 0) + 1; if (best === null || c[x] > c[best]) best = x; } return best; };

export function analyse(wx) {
  const H = wx.col.hourly, T = H.time;
  const [foot, west, east] = wx.pts;
  const idxOf = (loc) => { const m = new Map(); loc.hourly.time.forEach((t, k) => m.set(t, k)); return m; };
  const fI = idxOf(foot), wI = idxOf(west), eI = idxOf(east);
  const hours = T.map((t, i) => {
    const ms = MODELS.map((m) => summitModel(H, m.id, i)).filter(Boolean);
    const sun = sunPosition(new Date((t + 1800) * 1000), SUMMIT.lat, SUMMIT.lon);
    const fk = fI.get(t), F = fk != null ? {
      vis: foot.hourly.visibility?.[fk], t2: foot.hourly.temperature_2m?.[fk], td2: foot.hourly.dew_point_2m?.[fk],
      gust: foot.hourly.wind_gusts_10m?.[fk], precip: foot.hourly.precipitation?.[fk],
    } : {};
    const sideW = wI.get(t) != null ? west.hourly.cloud_cover_low[wI.get(t)] : null;
    const sideE = eI.get(t) != null ? east.hourly.cloud_cover_low[eI.get(t)] : null;
    const h = { t, i, day: sun.alt > -0.3, sunAlt: sun.alt, sunAz: sun.az, foot: F, sideW, sideE, models: ms };
    if (!ms.length) return { ...h, v: null };
    const score = ms.reduce((s, m) => s + m.v, 0) / ms.length;
    let v = score >= 1.5 ? 2 : score <= 0.5 ? 0 : 1;
    const fog = F.vis != null && F.vis < 1000;
    if (fog) v = 0;
    const agree = ms.every((m) => m.v === ms[0].v) && !fog;
    const whyPool = ms.filter((m) => m.v === v).map((m) => m.why);
    return {
      ...h, v, score, agree, fog, why: fog ? 'fog' : (majority(whyPool.length ? whyPool : ms.map((m) => m.why))),
      base: median(ms.map((m) => Math.min(m.base, 6000))), lowDeck: ms.filter((m) => m.lowDeck).length * 2 > ms.length,
      wind: median(ms.map((m) => m.wind)), dir: ms.find((m) => m.dir != null)?.dir ?? null,
      tTop: median(ms.map((m) => m.tTop)), rhTop: median(ms.map((m) => m.rhTop)), freeze: median(ms.map((m) => m.freeze)),
      low: median(ms.map((m) => m.low)), mid: median(ms.map((m) => m.mid)), high: median(ms.map((m) => m.high)),
      precip: median(ms.map((m) => m.precip)),
    };
  });
  const daily = foot.daily ? foot.daily.time.map((t, k) => ({ t, rise: foot.daily.sunrise[k], set: foot.daily.sunset[k] })) : [];
  return { hours, daily, fetched: wx.fetched };
}

export function nowIndex(hours, now = Date.now() / 1000) {
  let k = hours.findIndex((h) => h.t <= now && now < h.t + 3600);
  if (k < 0) k = now < hours[0].t ? 0 : hours.length - 1;
  return k;
}

// Runs of clear daylight hours.
export function clearRuns(hours, from, to) {
  const runs = []; let cur = null;
  for (let k = from; k < Math.min(to, hours.length); k++) {
    const h = hours[k], ok = h.v === 2 && h.day;
    if (ok) { if (!cur) cur = { a: k, b: k, agree: 0 }; cur.b = k; if (h.agree) cur.agree++; }
    else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs.map((r) => ({ ...r, len: r.b - r.a + 1, start: hours[r.a].t, end: hours[r.b].t + 3600, sure: r.agree / (r.b - r.a + 1) }));
}
// Trim an hourly window to the day's real sunrise/sunset.
export function trimToDaylight(an, r) {
  const d = an.daily.find((x) => x.rise - 4 * 3600 <= r.start && r.start < x.set + 2 * 3600);
  if (!d) return { ...r, toDark: false };
  return { ...r, start: Math.max(r.start, d.rise), end: Math.min(r.end, d.set), toDark: r.end >= d.set - 600, set: d.set };
}

// Sunrise/sunset colour: a rough, well-worn rule of thumb. Some mid/high cloud to catch the light,
// little low cloud overhead, and a clear run for the light coming in from the sun's side.
export function glowChance(an, kind, now = Date.now() / 1000) {
  const ev = an.daily.map((d) => (kind === 'sunset' ? d.set : d.rise)).find((t) => t > now - 600);
  if (!ev) return null;
  const k = an.hours.findIndex((h) => h.t <= ev && ev < h.t + 3600);
  const h = an.hours[k]; if (!h || h.v == null) return null;
  const canvas = Math.max(h.mid ?? 0, h.high ?? 0), low = h.low ?? 0, side = (kind === 'sunset' ? h.sideW : h.sideE) ?? 0;
  let s = 0;
  s += canvas >= 25 && canvas <= 85 ? 1 : canvas >= 10 && canvas <= 95 ? 0.5 : 0;
  s += low < 40 ? 1 : low < 70 ? 0.5 : 0;
  s += side < 50 ? 1 : side < 75 ? 0.5 : 0;
  const level = s >= 2.5 ? 'good' : s >= 1.5 ? 'some' : 'little';
  let why;
  if (low >= 70) why = 'low cloud overhead will likely smother it';
  else if (side >= 75) why = kind === 'sunset' ? 'there is low cloud out to the west, in the way of the light' : 'there is low cloud inland, in the way of the light';
  else if (canvas < 10) why = `clear sky, so a clean ${kind} rather than a fiery one`;
  else if (canvas > 95) why = 'the high cloud is too thick to light up well';
  else why = 'some high cloud to catch the light, and a way in for it';
  return { t: ev, kind, level, why, canvas, low, side };
}

// Debug/preview: ?pretend=yes|partly|no overrides the current hour (used for screenshots).
export function pretend(h, mode) {
  const p = { ...h, models: h.models };
  if (mode === 'no') Object.assign(p, { v: 0, why: 'cloud', base: 520, low: 95, mid: 70, high: 40, precip: 0.3, agree: true });
  if (mode === 'partly') Object.assign(p, { v: 1, why: 'cap', base: 800, low: 55, mid: 20, high: 30, precip: 0, agree: false });
  if (mode === 'yes') Object.assign(p, { v: 2, why: 'clear', base: 1450, low: 25, mid: 10, high: 35, precip: 0, agree: true });
  if (mode === 'under') Object.assign(p, { v: 0, why: 'under', lowDeck: true, base: 380, low: 95, mid: 0, high: 0, precip: 0, agree: true });
  return p;
}
