// Sea state at a deep-water swim spot, estimated from the forecast and the coastline around it.
// Runs in the browser (copied to assets/swim-sea.js) and in Node (tests). No imports, no network.
//
//   Wind chop: the Shore Protection Manual's (US Army Corps of Engineers, 1984) fetch-limited wave
//     growth, deep-water form, U_A = 0.71 U^1.23, over the effective fetch towards the wind (fetch.json,
//     tools/swim-fetch.mjs). Steady wind assumed; gusts, duration and tidal streams ignored.
//   Swell: the forecast swell height for the nearest offshore cell of Open-Meteo Marine, times how
//     open the spot is towards the swell (the share of the bearings within ±20° of it that run 20 km
//     or more to land), with a small allowance for swell bending round headlands.
// Both are estimates. The words describe the water, never whether a swim is safe.

const G = 9.81;
export function spmWave(U10ms, fetchM, depthM = 20) {
  if (!(U10ms > 0.5) || !(fetchM > 1)) return 0;
  const UA = 0.71 * Math.pow(U10ms, 1.23), F = (G * fetchM) / (UA * UA), d = (G * depthM) / (UA * UA);
  const a = Math.tanh(0.53 * Math.pow(d, 0.75));
  return (UA * UA / G) * 0.283 * a * Math.tanh((0.00565 * Math.sqrt(F)) / a);
}

const idx = (F, dir) => Math.round((((dir % 360) + 360) % 360) / 5) % F.dirs.length;
export const fetchKm = (F, dir) => ({ km: F.km[idx(F, dir)], eff: F.eff[idx(F, dir)] });

export function swellFactor(F, dir) {
  const near = [], wide = [];
  for (let k = -12; k <= 12; k++) { const km = F.km[(idx(F, dir) + k + F.dirs.length) % F.dirs.length]; if (Math.abs(k) <= 4) near.push(km); wide.push(km); }
  const open = near.reduce((s, km) => s + Math.min(1, km / 20), 0) / near.length;
  const bend = wide.some((km) => km >= F.maxKm) ? 0.15 : 0; // swell wraps a little round a headland
  return Math.max(open, bend);
}

export const WORDS = [
  [0.15, 'Calm', 'calm', 'Small waves at most, by our estimate.'],
  [0.3, 'A little lively', 'lively', 'A small chop, by our estimate: fine for most regulars, a mouthful now and then.'],
  [0.6, 'Choppy', 'choppy', 'Proper chop, by our estimate: getting in and out on the steps and ladders takes care.'],
  [1.0, 'Rough', 'rough', 'Waves breaking on the rocks and steps, by our estimate: getting out again is the hard part.'],
  [Infinity, 'Big sea', 'big', 'Big waves, by our estimate: steps and ladders are where people get hurt in this.'],
];
export const word = (Hs) => { for (const [lim, w, tone, line] of WORDS) if (Hs < lim) return { word: w, tone, line }; return null; };

// h: { wind (km/h), windDir (from, deg), gust, swell (m), swellDir (from, deg), swellPeriod (s) }
export function seaState(h, F) {
  const wf = fetchKm(F, h.windDir ?? 0);
  const chop = h.wind != null ? spmWave(h.wind / 3.6, Math.min(wf.eff, F.maxKm) * 1000) : 0;
  const sf = h.swell != null && h.swellDir != null ? swellFactor(F, h.swellDir) : 0;
  const swell = (h.swell || 0) * sf;
  const total = Math.hypot(chop, swell);
  return { chop, swell, swellFactor: sf, total, offshore: wf.km < 1 && (h.wind || 0) >= 12, onshoreKm: wf.km, ...word(total) };
}

// to the nearest 0.1 m: the estimate is no better than that (and often worse)
export const metres = (Hs) => (Hs < 0.05 ? 'under 0.1 m' : `about ${Hs.toFixed(1)} m`);
