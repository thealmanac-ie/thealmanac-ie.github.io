// One-off per swim spot: how far the open water runs from the spot in each direction (the fetch),
// which sets how big the wind can make the waves there and which way swell can get in.
//   node tools/swim-fetch.mjs <slug> [<slug> …]
// Reads places/<slug>/place.json (swim.seaStart: a point just off the entry, in the water) and writes
// places/<slug>/fetch.json (committed). Coastline: OpenStreetMap natural=coastline ways within about
// 65 km (one Overpass request per spot, cached in tmp/coast/<slug>.json). A ray stops at the first
// coastline it crosses; past 60 km we call it open sea. The effective fetch per direction is the
// Shore Protection Manual's (1984, eq. 3-36) radial average over ±15°: sum(F cos²a) / sum(cos a).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tmp', 'coast');
const MAXKM = 60;

async function coastline(slug, lat, lon) {
  const f = path.join(CACHE, `${slug}.json`);
  if (!fs.existsSync(f)) {
    fs.mkdirSync(CACHE, { recursive: true });
    const dLat = 0.6, dLon = 0.6 / Math.cos((lat * Math.PI) / 180);
    const q = `[out:json][timeout:120];way["natural"="coastline"](${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon});out geom;`;
    for (let wait = 10; ; wait *= 2) {
      const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'user-agent': 'thealmanac-build (coastline, once per spot)' } });
      const t = await r.text();
      if (r.ok && t.trimStart().startsWith('{')) { fs.writeFileSync(f, t); break; }
      if (wait > 160) throw new Error(`Overpass: HTTP ${r.status}`);
      console.log(`  Overpass busy (HTTP ${r.status}), retrying in ${wait} s`); await new Promise((res) => setTimeout(res, wait * 1000));
    }
  }
  return JSON.parse(fs.readFileSync(f, 'utf8')).elements.filter((e) => e.geometry);
}

for (const slug of process.argv.slice(2)) {
  const place = JSON.parse(fs.readFileSync(path.join(ROOT, 'places', slug, 'place.json'), 'utf8'));
  const { lat, lon } = place.swim.seaStart;
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.57; // km per degree, local
  const P = (p) => [(p.lon - lon) * kx, (p.lat - lat) * ky];
  const segs = [];
  for (const w of await coastline(slug, lat, lon)) for (let i = 1; i < w.geometry.length; i++) segs.push([...P(w.geometry[i - 1]), ...P(w.geometry[i])]);
  const ray = (deg) => { // distance to the first coastline crossing towards bearing deg
    const dx = Math.sin((deg * Math.PI) / 180), dy = Math.cos((deg * Math.PI) / 180);
    let best = MAXKM;
    for (const [ax, ay, bx, by] of segs) {
      const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (ax * ey - ay * ex) / den, u = (ax * dy - ay * dx) / den;
      if (t > 0 && t < best && u >= 0 && u <= 1) best = t;
    }
    return best;
  };
  const dirs = Array.from({ length: 72 }, (_, i) => i * 5), km = dirs.map((d) => +ray(d).toFixed(2));
  const eff = dirs.map((d, i) => { let s = 0, w = 0; for (let k = -3; k <= 3; k++) { const c = Math.cos((k * 5 * Math.PI) / 180); s += km[(i + k + 72) % 72] * c * c; w += c; } return +(s / w).toFixed(2); });
  if (km.filter((k) => k < 0.02).length > 36) throw new Error(`${slug}: swim.seaStart looks to be on land`);
  const out = { about: `Fetch from a point just off the entry at ${place.name}: km of open water towards each direction (where wind or swell would come FROM), to the first OpenStreetMap coastline crossed, capped at ${MAXKM} km (open sea). eff: the Shore Protection Manual's effective fetch (radials within ±15°). Made by tools/swim-fetch.mjs. Coastline © OpenStreetMap contributors, ODbL.`,
    start: { lat, lon }, maxKm: MAXKM, dirs, km, eff };
  fs.writeFileSync(path.join(ROOT, 'places', slug, 'fetch.json'), JSON.stringify(out) + '\n');
  const open = dirs.filter((d, i) => km[i] >= MAXKM);
  console.log(`${slug}: ${segs.length} coastline segments; open sea on ${open.length} of 72 bearings (${open.join(',')})`);
  console.log('  ' + dirs.filter((d) => d % 30 === 0).map((d) => `${d}°:${km[d / 5]}`).join(' '));
}
