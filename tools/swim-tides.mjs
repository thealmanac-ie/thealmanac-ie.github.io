// Fit harmonic constants to a Marine Institute tide-prediction station for a swim spot, so the page
// can work the tide out itself (at build time and in the browser, no network), the same way the
// Westport page does for Roonagh.
//   node tools/swim-tides.mjs <slug> <StationID>   -> places/<slug>/app/data/tide_model.json
//   node tools/swim-tides.mjs --compare A B         (mean HW/LW time and height difference, B minus A)
// Data: ERDDAP dataset imiTidePrediction (Marine Institute, CC BY 4.0), 5-minute values. One request
// per station for 2026 (the fit) and one for Jan-Feb 2027 (the check, unseen by the fit), cached in
// tmp/stations-swims/ with a pause between requests. The fit: least squares on 20-minute samples with
// the swim app's own 54 constituents and astronomy (vendor/swim/js/tide.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { CONSTITUENTS, astro, nodal, argV, makePredictor, extremes } = await import(pathToFileURL(path.join(ROOT, 'vendor/swim/js/tide.js')).href);
const CACHE = path.join(ROOT, 'tmp', 'stations-swims');
fs.mkdirSync(CACHE, { recursive: true });
const D2R = Math.PI / 180, NAMES = Object.keys(CONSTITUENTS);

async function series(station, from, to) {
  const f = path.join(CACHE, `${station}_${from}_${to}.csv`);
  if (!fs.existsSync(f)) {
    const u = `https://erddap.marine.ie/erddap/tabledap/imiTidePrediction.csv?time,Water_Level,Water_Level_ODM,latitude,longitude&stationID=%22${station}%22&time%3E=${from}T00:00:00Z&time%3C${to}T00:00:00Z`;
    console.log('GET', station, from, to);
    const r = await fetch(u, { headers: { 'user-agent': 'thealmanac-build (one request per station-year, cached)' } });
    if (!r.ok) throw new Error(`${station}: HTTP ${r.status}`);
    fs.writeFileSync(f, await r.text());
    await new Promise((res) => setTimeout(res, 3000));
  }
  const rows = fs.readFileSync(f, 'utf8').trim().split('\n').slice(2).map((l) => l.split(','));
  return { t: rows.map((r) => Date.parse(r[0])), h: rows.map((r) => +r[1]), odm: rows.map((r) => +r[2]), lat: +rows[0][3], lon: +rows[0][4] };
}

function fit({ t, h }, stepMin = 20) {
  const n = 1 + 2 * NAMES.length, A = new Float64Array(n * n), b = new Float64Array(n), row = new Float64Array(n);
  const stride = Math.round(stepMin / 5);
  let lastHour = NaN, nod = null;
  for (let i = 0; i < t.length; i += stride) {
    const hour = Math.floor(t[i] / 3600000);
    if (hour !== lastHour) { nod = nodal(astro(t[i])); lastHour = hour; }
    const a = astro(t[i]);
    row[0] = 1;
    NAMES.forEach((nm, k) => { const c = CONSTITUENTS[nm], [f, u] = nod[c[7]], ph = (argV(c, a) + u) * D2R; row[1 + 2 * k] = f * Math.cos(ph); row[2 + 2 * k] = f * Math.sin(ph); });
    for (let r = 0; r < n; r++) { const vr = row[r]; b[r] += vr * h[i]; for (let c2 = r; c2 < n; c2++) A[r * n + c2] += vr * row[c2]; }
  }
  for (let r = 0; r < n; r++) for (let c2 = 0; c2 < r; c2++) A[r * n + c2] = A[c2 * n + r];
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = A[i * n + j]; for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k]; L[i * n + j] = i === j ? Math.sqrt(s) : s / L[j * n + j]; }
  const y = new Float64Array(n), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return { Z0: x[0], cons: NAMES.map((nm, k) => [nm, Math.hypot(x[1 + 2 * k], x[2 + 2 * k]), ((Math.atan2(x[2 + 2 * k], x[1 + 2 * k]) / D2R) + 360) % 360]) };
}

// the source's own turning points (5-minute series, plateau-aware)
function sourceExtremes(set) {
  const out = [];
  for (let i = 1; i < set.h.length - 1; i++) {
    const b = set.h[i];
    if (!((b > set.h[i - 1] && b >= set.h[i + 1]) || (b < set.h[i - 1] && b <= set.h[i + 1]))) continue;
    let j = i; while (j + 1 < set.h.length && set.h[j + 1] === b) j++;
    const prev = set.h[i - 1], next = set.h[Math.min(set.h.length - 1, j + 1)];
    if ((b > prev && b > next) || (b < prev && b < next)) out.push({ t: set.t[Math.round((i + j) / 2)], h: b, high: b > prev });
    i = j;
  }
  return out;
}
const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
function pair(a, b) { // b's turning point nearest each of a's (same kind, within 3 h)
  const dt = [], dh = [];
  for (const e of a) { let best = null; for (const o of b) if (o.high === e.high && Math.abs(o.t - e.t) < 3 * 3600000 && (!best || Math.abs(o.t - e.t) < Math.abs(best.t - e.t))) best = o; if (best) { dt.push({ high: e.high, v: (best.t - e.t) / 60000 }); dh.push({ high: e.high, v: best.h - e.h }); } }
  return { dt, dh };
}
function score(model, set, label) {
  const p = makePredictor(model);
  let se = 0, mx = 0, n = 0;
  for (let i = 0; i < set.t.length; i += 2) { const e = p(set.t[i]) - set.h[i]; se += e * e; mx = Math.max(mx, Math.abs(e)); n++; }
  const { dt, dh } = pair(sourceExtremes(set), extremes(p, set.t[0] + 3600000, set.t[set.t.length - 1] - 3600000));
  return { label, rms_m: +Math.sqrt(se / n).toFixed(3), max_m: +mx.toFixed(3), hw_lw_time_rms_min: +rms(dt.map((d) => d.v)).toFixed(1), hw_lw_height_rms_m: +rms(dh.map((d) => d.v)).toFixed(3), n: dt.length };
}

const args = process.argv.slice(2);
if (args[0] === '--compare') {
  const [, A, B] = args, a = await series(A, '2026-01-01', '2027-01-01'), b = await series(B, '2026-01-01', '2027-01-01');
  const { dt, dh } = pair(sourceExtremes(a), sourceExtremes(b));
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  for (const hi of [true, false]) {
    const t = dt.filter((d) => d.high === hi).map((d) => d.v), h = dh.filter((d) => d.high === hi).map((d) => d.v);
    console.log(`${B} minus ${A}, ${hi ? 'high' : 'low'} water: time ${mean(t).toFixed(1)} min (sd ${Math.sqrt(mean(t.map((x) => (x - mean(t)) ** 2))).toFixed(1)}), height ${mean(h).toFixed(2)} m above each station's own LAT, n=${t.length}`);
  }
  const odm = (s) => mean(s.odm.map((v, i) => v - s.h[i]));
  console.log(`mean level, OD Malin: ${A} ${(mean(a.odm)).toFixed(3)} m, ${B} ${(mean(b.odm)).toFixed(3)} m; LAT below OD Malin: ${A} ${(-odm(a)).toFixed(2)}, ${B} ${(-odm(b)).toFixed(2)}`);
  process.exit(0);
}
const [slug, station] = args;
if (!slug || !station) { console.error('usage: node tools/swim-tides.mjs <slug> <StationID>'); process.exit(2); }
const y26 = await series(station, '2026-01-01', '2027-01-01'), y27 = await series(station, '2027-01-01', '2027-03-01');
const m = fit(y26);
const checks = [score(m, y26, 'fit 2026, test 2026 (in-sample)'), score(m, y27, 'fit 2026, test Jan-Feb 2027 (unseen)')];
const H = Object.fromEntries(m.cons.map(([n, h]) => [n, h]));
const pred = makePredictor(m);
let lo = 1e9, hi = -1e9; for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2045, 0, 1); t += 15 * 60000) { const v = pred(t); if (v < lo) lo = v; if (v > hi) hi = v; }
const levels = Object.fromEntries(Object.entries({ MSL: m.Z0, MHWS: m.Z0 + H.M2 + H.S2, MHWN: m.Z0 + H.M2 - H.S2, MLWN: m.Z0 - H.M2 + H.S2, MLWS: m.Z0 - H.M2 - H.S2, min_2026_2044: lo, max_2026_2044: hi }).map(([k, v]) => [k, +v.toFixed(3)]));
const offs = y26.odm.map((v, i) => v - y26.h[i]).sort((a, b) => a - b);
const out = {
  station, datum: `m above ${station.replace(/_/g, ' ')} LAT (Marine Institute Water_Level)`,
  source: `Fitted by tools/swim-tides.mjs to Marine Institute imiTidePrediction, ${station}, 2026 (5-min values, sampled every 20 min). CC BY 4.0.`,
  fitted: new Date().toISOString().slice(0, 10),
  location: { lat: y26.lat, lon: y26.lon },
  odm_minus_lat: +offs[Math.floor(offs.length / 2)].toFixed(3), // Water_Level_ODM - Water_Level: add to a LAT height for OD Malin
  Z0: +m.Z0.toFixed(4),
  cons: m.cons.filter(([, h]) => h >= 0.0005).map(([n, h, g]) => [n, +h.toFixed(4), +g.toFixed(2)]),
  checks, levels,
};
const dir = path.join(ROOT, 'places', slug, 'app', 'data');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'tide_model.json'), JSON.stringify(out));
console.log(`${slug}: ${station} at ${y26.lat}, ${y26.lon}; ${out.cons.length} constituents; LAT = OD Malin ${(-out.odm_minus_lat).toFixed(2)} m`);
for (const c of checks) console.log('  ', JSON.stringify(c));
