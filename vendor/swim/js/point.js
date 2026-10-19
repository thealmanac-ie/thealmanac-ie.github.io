// From Roonagh to the Point: the secondary-port method.
// The Marine Institute predicts Roonagh (the Clew Bay mouth). The Point is ~23 km further in,
// past Inishgort and up the Westport channel, so its tide comes later and its range differs.
// We take each Roonagh high and low water, shift it by a time difference and a height
// difference (interpolated between springs and neaps, as the Admiralty secondary-port method
// does), and fill the curve in between with Roonagh's own curve shape.
// All heights out of this module are metres above OD Malin (the land datum the LiDAR uses).

import { makePredictor, extremes } from './tide.js';

export function makePoint(model, P) {
  const roonagh = makePredictor(model);
  const Z0 = model.Z0; // Roonagh mean level, m above Roonagh LAT
  const lv = model.levels; // Roonagh MHWS etc. (m above Roonagh LAT)
  const toODM = (hR) => hR - Z0 + P.msl_odm; // Roonagh LAT -> OD Malin, via mean sea level
  // spring/neap weight from the Roonagh height of this high (or low) water: 1 = springs, 0 = neaps.
  // Clamped: we don't extrapolate the differences beyond mean springs or mean neaps.
  const wHW = (h) => Math.max(0, Math.min(1, (h - lv.MHWN) / (lv.MHWS - lv.MHWN)));
  const wLW = (h) => Math.max(0, Math.min(1, (lv.MLWN - h) / (lv.MLWN - lv.MLWS)));

  const cache = new Map(); // day index -> extremes covering it
  function roonaghExtremes(t) {
    const day = Math.floor(t / 86400000);
    if (!cache.has(day)) cache.set(day, extremes(roonagh, (day - 1) * 86400000, (day + 2) * 86400000, 6));
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return cache.get(day);
  }
  function mapExt(e) {
    const s = e.high ? wHW(e.h) : wLW(e.h);
    const d = P.diffs;
    const dt = e.high ? d.hw_neap_min + s * (d.hw_spring_min - d.hw_neap_min) : d.lw_neap_min + s * (d.lw_spring_min - d.lw_neap_min);
    const dh = e.high ? d.mhwn + s * (d.mhws - d.mhwn) : d.mlwn + s * (d.mlws - d.mlwn);
    return { t: e.t + dt * 60000 + (P.user_dt_min || 0) * 60000, h: toODM(e.h) + dh + (P.user_dh || 0), high: e.high, r: e, spring: s };
  }
  // Point extremes between t0 and t1
  function pointExtremes(t0, t1) {
    const out = [];
    for (let day = Math.floor(t0 / 86400000) - 1; day <= Math.floor(t1 / 86400000) + 1; day++) {
      for (const e of roonaghExtremes(day * 86400000 + 43200000)) {
        if (e.t < day * 86400000 || e.t >= (day + 1) * 86400000) continue;
        const m = mapExt(e);
        if (m.t >= t0 - 8 * 3600000 && m.t <= t1 + 8 * 3600000) out.push(m);
      }
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }
  function level(t) {
    const ex = pointExtremes(t - 9 * 3600000, t + 9 * 3600000);
    let k = ex.findIndex((e) => e.t > t);
    if (k <= 0) return toODM(roonagh(t)); // should not happen
    const a = ex[k - 1], b = ex[k];
    // map t into Roonagh time between the matching Roonagh extremes and use Roonagh's curve shape
    const f = (t - a.t) / (b.t - a.t);
    const tR = a.r.t + f * (b.r.t - a.r.t);
    let g = (roonagh(tR) - a.r.h) / (b.r.h - a.r.h);
    g = Math.max(0, Math.min(1, g));
    return a.h + g * (b.h - a.h);
  }
  return {
    level,
    levelRoonaghODM: (t) => toODM(roonagh(t)),
    roonaghLAT: roonagh,
    extremes: (t0, t1) => pointExtremes(t0, t1).filter((e) => e.t >= t0 && e.t <= t1),
    depth: (t) => level(t) - P.bed.best,
    params: P,
  };
}

// Windows where the depth at the foot of the steps is at least `need` metres.
export function windows(pt, t0, t1, need, stepMin = 5) {
  const out = [];
  let cur = null;
  const step = stepMin * 60000;
  for (let t = t0; t <= t1; t += step) {
    const ok = pt.depth(t) >= need;
    if (ok && !cur) {
      // refine the start
      let a = t - step, b = t;
      for (let k = 0; k < 10; k++) { const m = (a + b) / 2; if (pt.depth(m) >= need) b = m; else a = m; }
      cur = { start: t === t0 && pt.depth(t0) >= need ? t0 : b, open: t === t0 };
    } else if (!ok && cur) {
      let a = t - step, b = t;
      for (let k = 0; k < 10; k++) { const m = (a + b) / 2; if (pt.depth(m) >= need) a = m; else b = m; }
      cur.end = a; out.push(cur); cur = null;
    }
  }
  if (cur) { cur.end = t1; cur.openEnd = true; out.push(cur); }
  return out;
}

// Body landmarks as a fraction of standing height (Drillis & Contini 1966, as tabulated in
// Winter, "Biomechanics and Motor Control of Human Movement").
export const BODY = [
  [0.039, 'ankle'], [0.285, 'knee'], [0.53, 'hip'], [0.63, 'waist'], [0.72, 'chest'], [0.818, 'shoulder'], [0.87, 'chin'], [0.936, 'eyes'], [1.0, 'head'],
];
export function bodyWord(depth, height = 1.72) {
  // thresholds sit between the Drillis & Contini landmarks above
  if (depth <= 0.02) return 'dry';
  const f = depth / height;
  if (f < 0.06) return 'ankle-deep';
  if (f < 0.2) return 'shin-deep';
  if (f < 0.32) return 'knee-deep';
  if (f < 0.5) return 'thigh-deep';
  if (f < 0.6) return 'hip-deep';
  if (f < 0.68) return 'waist-deep';
  if (f < 0.77) return 'chest-deep';
  if (f < 0.85) return 'shoulder-deep';
  if (f < 0.93) return 'neck-deep';
  return 'out of your depth';
}
