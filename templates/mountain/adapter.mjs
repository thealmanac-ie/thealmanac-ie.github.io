// The mountain template is the Reek lab app with a place's own values injected into the few
// constants it hard-codes for Croagh Patrick (same contract as templates/tide-swim/adapter.mjs:
// each rule must match exactly as often as expected, or the build stops).
//
// Still Croagh Patrick-specific inside the app, NOT handled here (see README, "How to add a place"):
//   js/app.js nextReekSunday() and #nextReek (the pilgrimage date); js/app.js the panorama chips
//   (feature ids); the data/ files, which the lab's own build tools compute for one summit.

const num = (x) => { if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`adapter: expected a number, got ${x}`); return String(x); };
const lit = (s) => JSON.stringify(s).slice(1, -1).replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

export function rules(place) {
  const S = place.summit, V = place.viewpoint, F = place.foot, G = place.glow;
  return [
    { file: 'js/weather.js', find: /export const TOP = \d+;/, count: 1, to: `export const TOP = ${num(S.height)};` },
    { file: 'js/weather.js', find: /export const SUMMIT = \{[^}]*\};/, count: 1, to: `export const SUMMIT = { lat: ${num(S.lat)}, lon: ${num(S.lon)} };` },
    { file: 'js/weather.js', find: /const FOOT = \{[^}]*\};/, count: 1, to: `const FOOT = { lat: ${num(F.lat)}, lon: ${num(F.lon)} };` },
    { file: 'js/weather.js', find: /const WEST = \{[^}]*\};/, count: 1, to: `const WEST = { lat: ${num(G.west.lat)}, lon: ${num(G.west.lon)} };` },
    { file: 'js/weather.js', find: /const EAST = \{[^}]*\};/, count: 1, to: `const EAST = { lat: ${num(G.east.lat)}, lon: ${num(G.east.lon)} };` },
    // one origin, many mountains: each its own forecast cache
    { file: 'js/weather.js', find: /const KEY = 'reek-wx-v3'/, count: 1, to: `const KEY = 'reek-wx-v3:${place.slug}'` },
    { file: 'js/where.js', find: /const TOP = \d+, H_TOP = \d+,/, count: 1, to: `const TOP = ${num(S.height)}, H_TOP = ${num(S.height + 2)},` },
    { file: 'js/where.js', find: /the Reek, 764 m/, count: 1, to: `${lit(place.shortName)}, ${num(S.height)} m` },
    { file: 'js/forecast.js', find: /'summit 764 m'/, count: 1, to: `'summit ${num(S.height)} m'` },
    { file: 'js/app.js', find: /sunCrossings\(now, 53\.7979, -9\.5505, \(\) => 0\)/, count: 1, to: `sunCrossings(now, ${num(V.lat)}, ${num(V.lon)}, () => 0)` },
    { file: 'js/app.js', find: /later than at Westport Quay/, count: 1, to: `later than at ${lit(V.name)}` },
    { file: 'js/app.js', find: /`Cruach Phádraig, 764 m, from Westport Quay \(heights ×1\.5\)\./, count: 1, to: `\`${lit(place.nameGa || place.name)}, ${num(S.height)} m, from ${lit(V.name)} (heights ×1.5).` },
    // the tab title keeps the live verdict and gains the page's search words
    { file: 'js/app.js', find: /\]\}: can I see the Reek today\?`/, count: 1, to: `]}: ${lit(place.seo.runtimeTitle)}\`` },
  ];
}

export function apply(files, place) {
  const report = [];
  for (const r of rules(place)) {
    if (files[r.file] == null) throw new Error(`adapter: ${r.file} is missing from the app`);
    const g = new RegExp(r.find.source, 'g');
    const n = (files[r.file].match(g) || []).length;
    if (n !== r.count) throw new Error(`adapter (mountain): rule ${r.find} in ${r.file} matched ${n} times, expected ${r.count}. The lab app changed; update templates/mountain/adapter.mjs.`);
    files[r.file] = files[r.file].replace(g, () => r.to);
    report.push(`${r.file} ${r.find.source.slice(0, 40)} ×${n}`);
  }
  return report;
}
