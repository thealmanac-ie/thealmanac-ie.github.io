// The view from the top: a 360-degree view drawn from a precomputed depth image, with labels.
import { clamp, compass } from './sky.js';

const wrap = (d) => ((d % 360) + 540) % 360 - 180;
// Colour by distance (atmospheric perspective): [km, r, g, b]
const LAND = [[0.1, 60, 70, 56], [0.6, 70, 82, 63], [2, 82, 98, 73], [6, 95, 115, 84], [15, 110, 130, 104], [30, 128, 145, 138], [60, 152, 167, 178], [120, 180, 192, 205], [250, 205, 213, 223]];
const WATER = [[0.1, 50, 84, 108], [5, 66, 101, 125], [20, 97, 129, 150], [60, 140, 165, 183], [120, 173, 192, 207], [250, 197, 210, 221]];
function ramp(stops, km) {
  if (km <= stops[0][0]) return stops[0].slice(1);
  for (let k = 0; k < stops.length - 1; k++) {
    const a = stops[k], b = stops[k + 1];
    if (km <= b[0]) { const t = Math.log(km / a[0]) / Math.log(b[0] / a[0]); return [1, 2, 3].map((j) => a[j] + (b[j] - a[j]) * t); }
  }
  return stops[stops.length - 1].slice(1);
}
// The precomputed depth image -> a coloured strip (one-off).
function paint(depth, info) {
  const { w, h, v } = depth, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), im = g.createImageData(w, h), o = im.data;
  const pal = []; for (let k = 0; k < 128; k++) { const km = 0.1 * 10 ** (((k & 63) - 1) / 18); pal[k] = k === 0 ? null : ramp(k >= 64 ? WATER : LAND, km); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, k = v[i]; if (!k) continue;
    let [r, gg, b] = pal[k];
    const up = y > 0 ? v[i - w] : 0;
    if (k < 64 && (up === 0 || up >= 64 || (up & 63) >= (k & 63) + 3)) { r += (255 - r) * 0.28; gg += (255 - gg) * 0.28; b += (255 - b) * 0.28; } // ridge line
    else if (k < 64 && y > 1 && v[i - 2 * w] !== k && (v[i - 2 * w] === 0 || (v[i - 2 * w] & 63) >= (k & 63) + 3)) { r += (255 - r) * 0.1; gg += (255 - gg) * 0.1; b += (255 - b) * 0.1; }
    o[i * 4] = r; o[i * 4 + 1] = gg; o[i * 4 + 2] = b; o[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c;
}

export class Pano {
  constructor(canvas, data, depth, { onSelect, onMove, startAz = 283 } = {}) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.d = data;
    this.az = startAz; this.ppd = 9; this.ex = 3; this.sel = null; this.showHidden = false; this.marks = [];
    this.onSelect = onSelect; this.onMove = onMove;
    this.im = data.image; this.strip = paint(depth, data.image);
    this.sea = data.seaDip; this.n = data.n; this.step = data.step;
    this.features = data.features;
    this.boxes = [];
    this.bind();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }
  resize() {
    const r = this.c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!r.width) return;
    this.W = r.width; this.H = r.height; this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ppd = clamp(this.W / 44, 8, 22);
    this.vs = this.ppd * this.ex;
    this.hy = Math.round(this.H * 0.37);
    this.draw();
  }
  x(az) { return this.W / 2 + wrap(az - this.az) * this.ppd; }
  y(a) { return this.hy - a * this.vs; }
  setMarks(m) { this.marks = m; this.draw(); }
  look(az, animate = true) {
    if (!animate) { this.az = (az + 360) % 360; this.draw(); return; }
    const from = this.az, d = wrap(az - from), t0 = performance.now(), dur = 520;
    cancelAnimationFrame(this.anim);
    const tick = (t) => { const k = clamp((t - t0) / dur, 0, 1), e = 1 - (1 - k) ** 3; this.az = (from + d * e + 360) % 360; this.draw(); if (k < 1) this.anim = requestAnimationFrame(tick); };
    this.anim = requestAnimationFrame(tick);
  }
  select(f, pan = true) {
    this.sel = f; if (f && pan) this.look(f.az); else this.draw();
    if (this.onSelect) this.onSelect(f);
  }
  bind() {
    const c = this.c; let drag = null;
    c.addEventListener('pointerdown', (e) => {
      cancelAnimationFrame(this.anim);
      drag = { x: e.clientX, y: e.clientY, az: this.az, t: performance.now(), lx: e.clientX, lt: performance.now(), v: 0, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 5) drag.moved = true;
      if (!drag.moved) return;
      this.az = (drag.az - dx / this.ppd + 720) % 360;
      const t = performance.now(), dt = Math.max(1, t - drag.lt);
      drag.v = 0.8 * drag.v + 0.2 * (-(e.clientX - drag.lx) / this.ppd / dt * 1000);
      drag.lx = e.clientX; drag.lt = t; this.draw();
    });
    const end = (e) => {
      if (!drag) return;
      const r = c.getBoundingClientRect();
      if (!drag.moved && e.type === 'pointerup') this.tap(e.clientX - r.left, e.clientY - r.top);
      else if (drag.moved) this.coast(clamp(drag.v, -240, 240));
      drag = null;
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  }
  coast(v) {
    let last = performance.now();
    const tick = (t) => {
      const dt = (t - last) / 1000; last = t; v *= Math.pow(0.04, dt);
      this.az = (this.az + v * dt + 360) % 360; this.draw();
      if (Math.abs(v) > 2) this.anim = requestAnimationFrame(tick);
    };
    this.anim = requestAnimationFrame(tick);
  }
  tap(px, py) {
    let hit = null, best = 1e9;
    for (const b of this.boxes) {
      const inBox = px >= b.x0 - 6 && px <= b.x1 + 6 && py >= b.y0 - 8 && py <= b.y1 + 8;
      const dA = Math.hypot(px - b.ax, py - b.ay);
      if (inBox) { hit = b.f; break; }
      if (dA < 18 && dA < best) { best = dA; hit = b.f; }
    }
    this.select(hit, false);
  }
  draw() {
    const g = this.g, W = this.W, H = this.H; if (!W) return;
    // sky
    const sky = g.createLinearGradient(0, 0, 0, this.y(this.sea));
    sky.addColorStop(0, '#9fc2e0'); sky.addColorStop(1, '#eef4f7');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // the rendered view: strip columns are 0.1 deg, rows 1/30 deg from +1.5 deg down
    const im = this.im, cpd = im.cols / 360, half = W / 2 / this.ppd;
    const y0 = this.y(im.top), dh = im.rows * this.vs / im.perDeg;
    let a0 = this.az - half, sx = ((a0 % 360) + 360) % 360 * cpd, sw = 2 * half * cpd, dx = 0;
    g.imageSmoothingEnabled = true;
    while (sw > 0.01) {
      const take = Math.min(sw, im.cols - sx), dw = take / sw * (W - dx);
      g.drawImage(this.strip, sx, 0, take, im.rows, dx, y0, dw, dh);
      dx += dw; sw -= take; sx = 0;
    }
    if (y0 + dh < H) { g.fillStyle = '#3c4639'; g.fillRect(0, y0 + dh, W, H - y0 - dh); }
    // sun marks (today's sunrise / sunset as seen from the top)
    for (const m of this.marks) {
      const x = this.x(m.az); if (x < -30 || x > W + 30) continue;
      const y = this.y(m.ang);
      g.fillStyle = 'rgba(240,150,40,0.95)'; g.beginPath(); g.arc(x, y, 6, Math.PI, 0); g.fill();
      g.font = '600 11px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#9a5a0c';
      g.fillText(m.label, x, y - 10);
    }
    this.labels();
    // compass strip
    const half2 = W / 2 / this.ppd + 1;
    g.fillStyle = 'rgba(20,24,28,0.45)'; g.fillRect(0, H - 24, W, 24);
    g.font = '600 11px Inter, system-ui, sans-serif'; g.textAlign = 'center';
    for (let a = Math.floor((this.az - half2) / 5) * 5; a <= this.az + half2; a += 5) {
      const x = this.x(a), m = ((a % 360) + 360) % 360;
      g.fillStyle = 'rgba(255,255,255,0.7)';
      if (m % 45 === 0) { g.fillStyle = '#fff'; g.fillText(compass(m), x, H - 8); }
      else if (m % 15 === 0) { g.fillText(String(m), x, H - 8); }
      else g.fillRect(x - 0.5, H - 6, 1, 4);
    }
    if (this.onMove) this.onMove(this.az);
  }
  labels() {
    const g = this.g, W = this.W;
    const tiers = [16, 40, 64, 88], used = tiers.map(() => []);
    const fs = this.features.filter((f) => f.status !== 'hidden' || this.showHidden)
      .map((f) => ({ f, x: this.x(f.az) })).filter((o) => o.x > 6 && o.x < W - 6);
    const hid = (f) => (this.showHidden && f.status === 'hidden' ? 0 : 1);
    fs.sort((a, b) => (a.f === this.sel ? -1 : b.f === this.sel ? 1 : 0) || hid(a.f) - hid(b.f) || a.f.tier - b.f.tier || a.f.km - b.f.km);
    this.boxes = [];
    g.textAlign = 'left';
    for (const { f, x } of fs) {
      const hidden = f.status === 'hidden', far = f.kind === 'far' && f.km > 95;
      const name = f.name, km = `${f.km < 10 ? f.km.toFixed(1) : Math.round(f.km)} km`;
      g.font = '600 12.5px Inter, system-ui, sans-serif'; const w1 = g.measureText(name).width;
      g.font = '400 11px Inter, system-ui, sans-serif'; const w2 = g.measureText(km).width;
      const w = w1 + w2 + 22;
      let x0 = clamp(x - w / 2, 4, W - w - 4);
      let tier = -1;
      for (let t = tiers.length - 1; t >= 0; t--) if (!used[t].some(([a, b]) => x0 < b + 6 && x0 + w > a - 6)) { tier = t; break; }
      if (tier < 0) { if (f !== this.sel || f.tier > 2) continue; tier = 0; }
      if (f.tier === 3 && tier < 2 && f !== this.sel && !(this.showHidden && f.status === 'hidden')) continue; // minor names only when there's room
      used[tier].push([x0, x0 + w]);
      const ty = tiers[tier], ay = this.y(f.ang);
      // leader
      g.strokeStyle = hidden ? 'rgba(40,50,60,0.45)' : 'rgba(25,30,36,0.55)'; g.lineWidth = 1;
      g.setLineDash(hidden || f.status === 'tip' ? [2, 3] : []);
      g.beginPath(); g.moveTo(x, ty + 10); g.lineTo(x, ay - 2); g.stroke(); g.setLineDash([]);
      g.fillStyle = hidden ? 'rgba(70,80,90,0.9)' : '#161a1f'; g.beginPath(); g.arc(x, ay, hidden ? 2 : 2.4, 0, 6.3); g.fill();
      // pill
      const selected = f === this.sel;
      g.fillStyle = selected ? '#161a1f' : hidden ? 'rgba(255,255,255,0.55)' : far ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.88)';
      const r = 9; g.beginPath(); g.moveTo(x0 + r, ty - 9); g.arcTo(x0 + w, ty - 9, x0 + w, ty + 10, r); g.arcTo(x0 + w, ty + 10, x0, ty + 10, r); g.arcTo(x0, ty + 10, x0, ty - 9, r); g.arcTo(x0, ty - 9, x0 + w, ty - 9, r); g.fill();
      g.font = (hidden ? 'italic ' : '') + '600 12.5px Inter, system-ui, sans-serif'; g.fillStyle = selected ? '#fff' : hidden ? '#4f5964' : '#161a1f';
      g.fillText(name, x0 + 9, ty + 5);
      g.font = '400 11px Inter, system-ui, sans-serif'; g.fillStyle = selected ? '#e9c27a' : '#5d646d';
      g.fillText(km, x0 + 13 + w1, ty + 5);
      this.boxes.push({ f, x0, x1: x0 + w, y0: ty - 9, y1: ty + 10, ax: x, ay });
    }
  }
}
