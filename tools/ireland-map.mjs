// One-off: draw the national base map for /swims/: Ireland's relief and coastline from terrain tiles
// (AWS Terrain Tiles, Terrarium encoding; EU-DEM on land, GEBCO/ETOPO at sea), zoom 8, with the same
// hillshade as the Clew Bay map. Tiles are fetched once into tmp/terrain-ireland/. Writes
// places/swims/map.webp and map.json (bounds, size), which are committed; re-run only to change the map.
//   node tools/ireland-map.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TILES = path.join(ROOT, 'tmp', 'terrain-ireland');
const SEA = 0, Z = 8, W = -10.75, E = -5.3, S = 51.35, N = 55.45, OUT_W = 760;
const tx = (lon) => ((lon + 180) / 360) * 2 ** Z;
const ty = (lat) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z;
const x0 = Math.floor(tx(W)), x1 = Math.floor(tx(E)), y0 = Math.floor(ty(N)), y1 = Math.floor(ty(S));
const tiles = [];
fs.mkdirSync(TILES, { recursive: true });
for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
  const f = path.join(TILES, `${Z}_${x}_${y}.png`);
  if (!fs.existsSync(f)) {
    const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
    if (!r.ok) throw new Error(`tile ${Z}/${x}/${y}: HTTP ${r.status}`);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); await new Promise((res) => setTimeout(res, 300));
  }
  tiles.push({ x: x - x0, y: y - y0, src: 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') });
}
const water = [];
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
      const shade = Math.max(-1, Math.min(1, (-dzdx + dzdy) / 120)); // light from the north-west
      const t = Math.min(1, h / 600);
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
const dir = path.join(ROOT, 'places', 'swims');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'map.webp'), Buffer.from(url.split(',')[1], 'base64'));
const height = Math.round(OUT_W * crop.height / crop.width);
fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify({ about: 'Ireland base map for /swims/: relief and coastline from AWS Terrain Tiles (EU-DEM; GEBCO/ETOPO at sea), zoom 8, with our hillshade. Web Mercator; bounds are [west, south, east, north].', bounds: [W, S, E, N], width: OUT_W, height }, null, 1) + '\n');
console.log(`map: ${OUT_W}x${height}, ${fs.statSync(path.join(dir, 'map.webp')).size} bytes`);
