// Small helpers: sun position, formatting, maths.
export const D2R = Math.PI / 180;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const median = (xs) => { const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Sun position (Astronomical Almanac low-precision formulae, ~0.01 deg). Returns degrees.
export function sunPosition(date, lat, lon) {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * D2R;
  const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
  const eps = (23.439 - 0.0000004 * n) * D2R;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const ha = (gmst * 15 + lon) * D2R - ra, la = lat * D2R;
  const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
  return { alt: alt / D2R, az: (az / D2R + 360) % 360 };
}
// Atmospheric refraction (Sæmundsson), degrees, for a true (airless) altitude h in degrees.
export const refraction = (h) => (h < -2 ? 0 : 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R) / 60);

const TZ = 'Europe/Dublin';
const fmt = (o) => new Intl.DateTimeFormat('en-IE', { timeZone: TZ, ...o });
const fHM = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
const fDay = fmt({ weekday: 'short' });
const fDayLong = fmt({ weekday: 'long' });
const fYMD = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
export const hm = (t) => fHM.format(new Date(t * 1000));
export const dayKey = (t) => fYMD.format(new Date(t * 1000));
export function dayName(t, now = Date.now() / 1000, long = false) {
  const d = dayKey(t), today = dayKey(now), tom = dayKey(now + 86400);
  if (d === today) return 'today';
  if (d === tom) return 'tomorrow';
  return (long ? fDayLong : fDay).format(new Date(t * 1000));
}
export const compass = (deg) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
export const compassWord = (deg) => ({ N: 'north', NNE: 'north-northeast', NE: 'northeast', ENE: 'east-northeast', E: 'east', ESE: 'east-southeast', SE: 'southeast', SSE: 'south-southeast', S: 'south', SSW: 'south-southwest', SW: 'southwest', WSW: 'west-southwest', W: 'west', WNW: 'west-northwest', NW: 'northwest', NNW: 'north-northwest' })[compass(deg)];
export const fmtInt = (x) => Math.round(x).toLocaleString('en-IE');
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Seeded PRNG for repeatable cloud/stars.
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Earth model shared with the precompute (tools/terrain.mjs).
export const R_EFF = 6371008.8 / (1 - 0.13);
export const elevAngle = (h0, h, d) => Math.atan2(h - h0 - d * d / (2 * R_EFF), d) / D2R;
export function distBearing(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const dist = 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return { dist, bearing: (Math.atan2(y, x) / D2R + 360) % 360 };
}
export function destination(lat, lon, bearingDeg, distM) {
  const d = distM / 6371008.8, b = bearingDeg * D2R, p1 = lat * D2R, l1 = lon * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 / D2R, l2 / D2R];
}
