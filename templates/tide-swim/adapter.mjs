// The tide-swim template is the swim lab app, unchanged except for the handful of values that the
// app still hard-codes for its first spot. This adapter injects a place's own values into the copied
// files at build time. Every rule must match exactly as often as expected, or the build stops and
// names the rule: that is the signal that the lab code moved and this list needs a look.
//
// Upstream fix (in the lab app, then delete the matching rules here): read these from data/spot.json.
// Still Westport-specific inside the app, and NOT handled here (see README, "How to add a place"):
//   js/app.js drawFigures(): the datum-ladder reference levels (2.75 record, -1.14 chart drying
//   height, Roonagh LAT -1.955, the 2.6 m chart-datum gap) and their labels; js/app.js renderCards():
//   "a logger 1 m down at Inishoo" and data/seatemp_clim.json's "inishoo_1m" key; js/hero.js: the
//   precast shelter drawn on the promenade; js/app.js: "at the Point" in the share text.

const num = (x) => {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`adapter: expected a number, got ${x}`);
  return String(x);
};

export function rules(place, ctx) {
  const s = place.spot;
  const ns = `swim:${place.slug}:`;
  return [
    { file: 'js/weather.js', find: /export const SPOT = \{[^}]*\};/, count: 1, to: `export const SPOT = { lat: ${num(s.forecastPoint.lat)}, lon: ${num(s.forecastPoint.lon)} };` },
    { file: 'js/weather.js', find: /export const NEATL_CELL = \{[^}]*\};/, count: 1, to: `export const NEATL_CELL = { lat: ${num(s.seaTempCell.lat)}, lon: ${num(s.seaTempCell.lon)} };` },
    { file: 'js/hero.js', find: /const VIEW_AZ = [\d.]+;/, count: 1, to: `const VIEW_AZ = ${num(s.viewAzimuth)};` },
    { file: 'js/card.js', find: /'THE POINT · WESTPORT QUAY'/, count: 1, to: JSON.stringify(s.label.toUpperCase()) },
    // one origin will host many places: give each its own browser storage (dip log, calibration, caches)
    { file: '*.js', find: /'swim:/g, count: '>=5', to: `'${ns}` },
    // exported dip logs say which spot and which tide model they came from, ready for a shared store
    { file: 'js/log.js', find: /\{ app: 'the-point-westport-dips', version: 1,/, count: 1,
      to: `{ app: ${JSON.stringify(s.logApp || 'the-point-westport-dips')}, version: 1, spot: ${JSON.stringify(`${place.slug}/${s.id}`)}, model: ${JSON.stringify(ctx.modelId)}, datum: 'm OD Malin',` },
    { file: 'js/log.js', find: /the-point-dips-/, count: 1, to: `${s.id}-dips-` },
    { file: 'js/app.js', find: /`the-point-\$\{/, count: 1, to: `\`${s.id}-\${` },
  ];
}

// Data a place does not publish (place.json "withhold"), replaced by an empty stand-in the app accepts.
export function withhold(files, place) {
  const w = place.withhold || {};
  if (w.flood && files['data/flood.json'] != null) files['data/flood.json'] = JSON.stringify({ about: `Withheld on this site: ${w.flood}`, layers: {} });
}

export function apply(files, place, ctx) {
  const report = [];
  for (const r of rules(place, ctx)) {
    const targets = r.file === '*.js' ? Object.keys(files).filter((f) => f.startsWith('js/') && f.endsWith('.js')) : [r.file];
    let n = 0;
    for (const f of targets) {
      if (files[f] == null) throw new Error(`adapter: ${f} is missing from the app`);
      const g = new RegExp(r.find.source, 'g');
      const hits = (files[f].match(g) || []).length;
      n += hits;
      files[f] = files[f].replace(g, () => r.to);
    }
    const ok = r.count === '>=5' ? n >= 5 : n === r.count;
    if (!ok) throw new Error(`adapter (tide-swim): rule ${r.find} in ${r.file} matched ${n} times, expected ${r.count}. The lab app changed; update templates/tide-swim/adapter.mjs.`);
    report.push(`${r.file} ${r.find.source.slice(0, 40)} ×${n}`);
  }
  return report;
}

// Constants the launch pages need from the app itself, read rather than copied.
export function appConstants(files) {
  const js = files['js/app.js'];
  const obj = (name) => {
    const m = new RegExp(`const ${name} = \\{([^}]*)\\}`).exec(js);
    if (!m) throw new Error(`adapter: const ${name} not found in js/app.js`);
    return Object.fromEntries([...m[1].matchAll(/(\w+):\s*('([^']*)'|[\d.]+)/g)].map((x) => [x[1], x[3] ?? +x[2]]));
  };
  const h = /const PERSON_H = ([\d.]+);/.exec(js);
  return { levels: obj('LEVELS'), colors: obj('COLORS'), personH: h ? +h[1] : 1.72 };
}
