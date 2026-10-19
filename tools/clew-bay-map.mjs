// One-off: draw the Clew Bay base map for /clew-bay/tide-times/: land relief from terrain tiles (AWS
// Terrain Tiles, Terrarium encoding; EU-DEM around here) and the water from OpenStreetMap's Clew Bay
// polygon (EU-DEM fills the inner bay's shallows in as land). Writes places/clew-bay/map.webp and
// map.json (bounds, size), which are committed; re-run only to change the map.
//   TILES_DIR=../reek/tmp/tiles OSM_BAY=../islands/tmp/osm_clewbay.json node tools/clew-bay-map.mjs
// (the lab apps' caches: tiles as fetched by the Reek lab, the bay relation by the islands lab)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TILES = path.resolve(ROOT, process.env.TILES_DIR || '../reek/tmp/tiles');
const SEA = +(process.env.SEA || 0.5), Z = 11, W = -10.06, E = -9.44, S = 53.72, N = 53.98, OUT_W = 760;
const tx = (lon) => ((lon + 180) / 360) * 2 ** Z;
const ty = (lat) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z;
const x0 = Math.floor(tx(W)), x1 = Math.floor(tx(E)), y0 = Math.floor(ty(N)), y1 = Math.floor(ty(S));
const tiles = [];
for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
  const f = path.join(TILES, String(Z), String(x), `${y}.png`);
  if (!fs.existsSync(f)) throw new Error(`missing tile ${Z}/${x}/${y} in ${TILES}`);
  tiles.push({ x: x - x0, y: y - y0, src: 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') });
}
// OSM's Clew Bay (natural=bay) relation: join member ways into closed rings (outer: the bay, inner: islands)
const bay = JSON.parse(fs.readFileSync(path.resolve(ROOT, process.env.OSM_BAY || '../islands/tmp/osm_clewbay.json'), 'utf8')).elements[0];
const key = (p) => `${p.lat},${p.lon}`;
function rings(ways) {
  const left = ways.map((w) => w.slice()), out = [];
  while (left.length) {
    let ring = left.pop();
    for (let grew = true; grew && key(ring[0]) !== key(ring[ring.length - 1]);) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const w = left[i], a = key(ring[ring.length - 1]);
        if (key(w[0]) === a) ring = ring.concat(w.slice(1));
        else if (key(w[w.length - 1]) === a) ring = ring.concat(w.slice(0, -1).reverse());
        else continue;
        left.splice(i, 1); grew = true; break;
      }
    }
    out.push(ring);
  }
  return out;
}
const px = (p) => [((tx(p.lon) - x0) * 256), ((ty(p.lat) - y0) * 256)];
const water = ['outer', 'inner'].flatMap((role) => rings(bay.members.filter((m) => m.type === 'way' && m.role === role && m.geometry).map((m) => m.geometry)).map((r) => r.map(px)));
const crop = { left: (tx(W) - x0) * 256, top: (ty(N) - y0) * 256, width: (tx(E) - tx(W)) * 256, height: (ty(S) - ty(N)) * 256 };
const browser = await chromium.launch();
const page = await browser.newPage();
const url = await page.evaluate(async ({ tiles, nx, ny, crop, OUT_W, SEA, water }) => {
  const big = document.createElement('canvas'); big.width = nx * 256; big.height = ny * 256;
  const g = big.getContext('2d', { willReadFrequently: true });
  for (const t of tiles) { const i = new Image(); i.src = t.src; await i.decode(); g.drawImage(i, t.x * 256, t.y * 256); }
  const W = big.width, H = big.height, src = g.getImageData(0, 0, W, H).data, e = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) e[k] = src[k * 4] * 256 + src[k * 4 + 1] + src[k * 4 + 2] / 256 - 32768;
  const out = g.createImageData(W, H), o = out.data;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const k = y * W + x, h = e[k];
    let r, gg, b;
    if (h <= SEA) { r = 196; gg = 218; b = 228; } // sea (EU-DEM marks the inner bay's shallows a metre or two up)
    else {
      const dzdx = (e[k + 1] - e[k - 1]) / 2, dzdy = (e[k + W] - e[k - W]) / 2;
      const shade = Math.max(-1, Math.min(1, (-dzdx + dzdy) / 40)); // light from the north-west
      const t = Math.min(1, h / 700);
      r = 236 - 40 * t; gg = 230 - 32 * t; b = 214 - 30 * t;
      r += shade * 34; gg += shade * 34; b += shade * 30;
    }
    o[k * 4] = r; o[k * 4 + 1] = gg; o[k * 4 + 2] = b; o[k * 4 + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  // the bay itself, from OpenStreetMap: water inside the outer ring, islands (inner rings) left as land
  g.beginPath(); for (const r of water) { r.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
  g.fillStyle = 'rgb(196,218,228)'; g.fill('evenodd');
  const H2 = Math.round(OUT_W * crop.height / crop.width), c = document.createElement('canvas'); c.width = OUT_W; c.height = H2;
  const cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high';
  cg.drawImage(big, crop.left, crop.top, crop.width, crop.height, 0, 0, OUT_W, H2);
  return c.toDataURL('image/webp', 0.86);
}, { tiles, nx: x1 - x0 + 1, ny: y1 - y0 + 1, crop, OUT_W, SEA, water });
await browser.close();
const dir = path.join(ROOT, 'places', 'clew-bay');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'map.webp'), Buffer.from(url.split(',')[1], 'base64'));
const height = Math.round(OUT_W * crop.height / crop.width);
fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify({ about: 'Clew Bay base map: relief from AWS Terrain Tiles (EU-DEM), zoom 11, with our hillshade; water from OpenStreetMap (© OpenStreetMap contributors, ODbL). Web Mercator; bounds are [west, south, east, north].', bounds: [W, S, E, N], width: OUT_W, height }, null, 1) + '\n');
console.log(`map: ${OUT_W}x${height}, ${fs.statSync(path.join(dir, 'map.webp')).size} bytes`);
