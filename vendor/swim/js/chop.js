// Chop at the Point: a fetch- and depth-limited wind-wave estimate.
// Fetch comes from data/fetch.json (tools/build_fetch.mjs: OSM coastline + INFOMAR banks).
// Wave growth: US Army Corps of Engineers, Shore Protection Manual (1984), shallow-water
// forecasting equations (eqs. 3-39, 3-40), with the SPM wind-stress factor U_A = 0.71 U^1.23.
// It is an estimate for a steady wind; it ignores gusts, duration and the odd boat wake.

const G = 9.81;

export function spmWave(U10ms, fetchM, depthM) {
  if (!(U10ms > 0.5) || !(fetchM > 1)) return { Hs: 0, Tp: 0 };
  const UA = 0.71 * Math.pow(U10ms, 1.23);
  const F = (G * fetchM) / (UA * UA);
  const d = depthM && depthM > 0.05 ? (G * depthM) / (UA * UA) : 1e6;
  const a = Math.tanh(0.53 * Math.pow(d, 0.75));
  const b = Math.tanh(0.833 * Math.pow(d, 0.375));
  const Hs = (UA * UA / G) * 0.283 * a * Math.tanh((0.00565 * Math.sqrt(F)) / a);
  const Tp = (UA / G) * 7.54 * b * Math.tanh((0.0379 * Math.cbrt(F)) / b);
  return { Hs, Tp };
}

// Bilinear lookup in the fetch table: wind-from direction (deg) and water level (m OD Malin).
export function fetchAt(table, dirFrom, levelODM) {
  const { dirs, levels_odm: L, effective } = table;
  const step = dirs[1] - dirs[0];
  const f = ((((dirFrom % 360) + 360) % 360) / step), i0 = Math.floor(f) % dirs.length, i1 = (i0 + 1) % dirs.length, ti = f - Math.floor(f);
  const z = Math.max(L[0], Math.min(L[L.length - 1], levelODM));
  let j0 = 0; while (j0 < L.length - 2 && L[j0 + 1] < z) j0++;
  const tj = (z - L[j0]) / (L[j0 + 1] - L[j0]);
  const v = (i, j, k) => effective[i][j][k];
  const lerp2 = (k) => {
    const c = [v(i0, j0, k), v(i0, j0 + 1, k), v(i1, j0, k), v(i1, j0 + 1, k)];
    if (c.some((x) => x == null)) return null;
    const a = c[0] * (1 - tj) + c[1] * tj, b = c[2] * (1 - tj) + c[3] * tj;
    return a * (1 - ti) + b * ti;
  };
  return { fetch: lerp2(0) ?? 0, depth: lerp2(1) };
}

export const CHOP_SCALE = [
  [0.04, 'flat calm', 'Glassy, or near enough.'],
  [0.1, 'ripples', 'A ruffle on the surface; nothing in your face.'],
  [0.2, 'light chop', 'Small wavelets; you will notice them breathing to one side.'],
  [0.35, 'choppy', 'Short, steep little waves slapping the steps; a mouthful now and then.'],
  [0.55, 'rough', 'Proper chop for a sheltered bay; awkward getting in and out.'],
  [Infinity, 'very rough', 'Bigger than the bay usually manages; not a day for the steps.'],
];
export function chopLabel(Hs) { for (const [lim, word, line] of CHOP_SCALE) if (Hs < lim) return { word, line }; return { word: 'very rough', line: '' }; }

// Beaufort number from 10 m wind (km/h), WMO thresholds.
export function beaufort(kmh) {
  const lim = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  let b = 0; while (b < lim.length && kmh >= lim[b]) b++;
  return b;
}

export function chopEstimate(table, wind, levelODM, depthHere) {
  // wind: {speed (km/h), dir (from, deg), gust (km/h)}
  if (!wind || wind.speed == null) return null;
  const U = wind.speed / 3.6;
  const { fetch, depth } = fetchAt(table, wind.dir, levelODM);
  const d = depth ?? Math.max(0.3, depthHere ?? 1.5);
  const w = spmWave(U, fetch, d);
  // Waves cannot be taller than the water is deep at the steps (breaking limit ~0.78 d).
  if (depthHere != null) w.Hs = Math.min(w.Hs, 0.78 * Math.max(0, depthHere));
  return { ...w, fetch, depth: d, ...chopLabel(w.Hs), U, offshore: fetch < 60 };
}
