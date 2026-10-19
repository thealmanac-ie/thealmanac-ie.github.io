// Small helpers: sun and moon, Irish time formatting, maths.
// Sun position adapted from the Croagh Patrick page (Astronomical Almanac low-precision formulae).
export const D2R = Math.PI / 180;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const TZ = 'Europe/Dublin';

export function sunPosition(tMs, lat, lon) {
  const n = tMs / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * D2R;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  const eps = (23.439 - 0.0000004 * n) * D2R;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const ha = (gmst * 15 + lon) * D2R - ra, la = lat * D2R;
  const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
  return { alt: alt / D2R, az: (az / D2R + 360) % 360 };
}

// Times when the sun crosses a given altitude (deg) on the local day containing tMs.
// Found numerically (2-minute scan + bisection), so it also works for -6 (civil dawn/dusk).
export function sunCrossings(dayStartMs, lat, lon, alt) {
  const out = { rise: null, set: null };
  const f = (t) => sunPosition(t, lat, lon).alt - alt;
  let t0 = dayStartMs, f0 = f(t0);
  for (let t = dayStartMs + 120000; t <= dayStartMs + 86400000; t += 120000) {
    const f1 = f(t);
    if ((f0 < 0) !== (f1 < 0)) {
      let a = t - 120000, b = t;
      for (let k = 0; k < 20; k++) { const m = (a + b) / 2; if ((f(a) < 0) === (f(m) < 0)) a = m; else b = m; }
      if (f0 < 0) out.rise = (a + b) / 2; else out.set = (a + b) / 2;
    }
    f0 = f1;
  }
  return out;
}

// Moon phase angle (0 = new, 180 = full) from Meeus' low-precision elongation; good to ~1 deg.
export function moonPhase(tMs) {
  const d = tMs / 86400000 + 2440587.5 - 2451545.0;
  const Lm = (218.316 + 13.176396 * d) % 360, Mm = (134.963 + 13.064993 * d) % 360, F = (93.272 + 13.22935 * d) % 360;
  const lonM = Lm + 6.289 * Math.sin(Mm * D2R);
  const Ls = 280.46 + 0.9856474 * d, gs = 357.528 + 0.9856003 * d;
  const lonS = Ls + 1.915 * Math.sin(gs * D2R) + 0.02 * Math.sin(2 * gs * D2R);
  void F;
  return (((lonM - lonS) % 360) + 360) % 360;
}

const fmt = (o) => new Intl.DateTimeFormat('en-IE', { timeZone: TZ, ...o });
const fHM = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
const fDay = fmt({ weekday: 'short' });
const fDayLong = fmt({ weekday: 'long' });
const fDate = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const fYMD = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
const fParts = fmt({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
export const hm = (t) => fHM.format(new Date(t)).replace('24:', '00:');
export const dayKey = (t) => fYMD.format(new Date(t));
export const dateLabel = (t) => fDate.format(new Date(t));
export function dayName(t, now, long = false) {
  const d = dayKey(t);
  if (d === dayKey(now)) return 'today';
  if (d === dayKey(now + 86400000)) return 'tomorrow';
  if (d === dayKey(now - 86400000)) return 'yesterday';
  return (long ? fDayLong : fDay).format(new Date(t));
}
// Irish local wall-clock parts of an instant.
export function localParts(t) {
  const p = Object.fromEntries(fParts.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
}
// Instant (ms) of a wall-clock time in Ireland (handles IST/GMT).
export function fromLocal(y, mo, d, h = 0, mi = 0) {
  let t = Date.UTC(y, mo - 1, d, h, mi);
  for (let k = 0; k < 2; k++) {
    const p = localParts(t);
    const diff = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Date.UTC(y, mo - 1, d, h, mi);
    t -= diff;
  }
  return t;
}
export const localMidnight = (t) => { const p = localParts(t); return fromLocal(p.y, p.mo, p.d, 0, 0); };

export const compass = (deg) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
export const compassWord = (deg) => ({ N: 'north', NNE: 'north-north-east', NE: 'north-east', ENE: 'east-north-east', E: 'east', ESE: 'east-south-east', SE: 'south-east', SSE: 'south-south-east', S: 'south', SSW: 'south-south-west', SW: 'south-west', WSW: 'west-south-west', W: 'west', WNW: 'west-north-west', NW: 'north-west', NNW: 'north-north-west' })[compass(deg)];
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const sgn = (x, d = 2) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d);
export const m1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export const durHM = (ms) => { const m = Math.round(ms / 60000); const h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };
