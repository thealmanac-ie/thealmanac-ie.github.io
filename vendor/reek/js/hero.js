// The surface: the Reek's real skyline from Westport Quay, the sky for the time of day,
// and cloud drawn at the estimated cloud base.
import { clamp, lerp, rng, elevAngle, refraction } from './sky.js';

const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const SKY = [ // sun altitude, zenith colour, horizon colour
  [-18, [6, 9, 18], [20, 26, 46]], [-9, [10, 16, 36], [42, 52, 84]], [-4, [28, 44, 84], [190, 120, 98]],
  [0, [58, 86, 140], [236, 164, 112]], [5, [88, 132, 188], [244, 204, 150]], [12, [104, 154, 210], [214, 229, 240]],
  [60, [88, 146, 210], [200, 222, 238]],
];
function skyAt(alt) {
  if (alt <= SKY[0][0]) return [SKY[0][1], SKY[0][2]];
  for (let k = 0; k < SKY.length - 1; k++) {
    const A = SKY[k], B = SKY[k + 1];
    if (alt <= B[0]) { const t = (alt - A[0]) / (B[0] - A[0]); return [mixC(A[1], B[1], t), mixC(A[2], B[2], t)]; }
  }
  return [SKY[SKY.length - 1][1], SKY[SKY.length - 1][2]];
}

function sprite(c) {
  const k = document.createElement('canvas'); k.width = k.height = 128;
  const g = k.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, css(c, 1)); gr.addColorStop(0.45, css(c, 0.78)); gr.addColorStop(1, css(c, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return k;
}

export class Hero {
  constructor(canvas, data) {
    this.c = canvas; this.d = data; this.g = canvas.getContext('2d'); this.state = null;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.visible = true; this.last = 0; this.time = 0;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; if (this.visible) this.loop(); }).observe(canvas);
    this.resize();
  }
  resize() {
    const r = this.c.parentElement.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = r.width; this.H = r.height; this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const span = Math.max(15, this.W / 55);
    this.ppd = this.W / span;
    this.vs = Math.min(this.ppd * 1.5, (0.4 * this.H) / this.d.summit.ang);
    this.hy = Math.min(this.H - 24, this.H * 0.57 + this.d.summit.ang * this.vs); // y of 0 deg
    if (this.state) { this.makeClouds(); this.draw(); }
  }
  ang(h) { return elevAngle(this.d.view.h, h, this.d.summit.km * 1000); }
  yOf(a) { return this.hy - a * this.vs; }
  xOf(az) { return this.W / 2 + (((az - this.d.summit.az + 540) % 360) - 180) * this.ppd; }
  layerAt(k, x) {
    const d = this.d, az = d.summit.az + (x - this.W / 2) / this.ppd, f = clamp((az - d.az0) / d.step, 0, d.n - 1), i = Math.floor(f), t = f - i;
    const L = d.layers[k], a = L[i], b = L[Math.min(i + 1, d.n - 1)];
    return (a + (b - a) * t) / 100;
  }
  set(state) {
    this.state = state; this.makeClouds(); this.draw();
    const tone = this.tone; this.c.closest('.hero').dataset.tone = tone;
    this.loop();
  }
  palette() {
    const s = this.state, alt = s.sunAlt ?? 30, light = clamp((alt + 8) / 16, 0, 1);
    const cov = clamp(Math.max(s.low ?? 0, (s.mid ?? 0) * 0.8) / 100, 0, 1);
    const grey = s.v === 0 ? 0.85 : clamp(cov * 0.8, 0, 0.8);
    const warm = clamp(1 - Math.abs(alt - 3) / 8, 0, 1) * (1 - grey);
    const cl = mixC([34, 38, 46], [222, 226, 230], light), shade = mixC([20, 22, 28], [150, 158, 168], light);
    return { alt, light, grey, warm, cl, shade, lit: mixC(cl, [255, 214, 170], warm * 0.5) };
  }
  makeClouds() {
    const s = this.state, R = rng(7), W = this.W;
    const pal = this.palette();
    this.spLit = sprite(pal.lit); this.spShade = sprite(mixC(pal.lit, pal.shade, 0.6));
    const baseA = this.ang(clamp(s.base ?? 3000, 0, 6000));
    this.yBase = this.yOf(baseA);
    this.puffs = [];
    const cover = clamp((s.low ?? 0) / 100, 0, 1);
    const deck = s.v === 0 && s.why !== 'scattered';
    if (deck) { // a ragged base with texture above it
      for (let k = 0; k < 70; k++) this.puffs.push({ x: R() * W * 1.3, y: this.yBase - R() * 60 + 8, r: 40 + R() * 90, a: 0.55 + R() * 0.4, sh: R() });
      for (let k = 0; k < 12; k++) this.puffs.push({ x: R() * W * 1.3, y: this.yBase + 10 + R() * 50, r: 18 + R() * 30, a: 0.18 + R() * 0.2, sh: 1 });
    } else if (s.v === 1) { // cap around the top, broken layer at the base
      const sx = this.W / 2, sy = this.yOf(this.d.summit.ang);
      for (let k = 0; k < 26; k++) this.puffs.push({ x: sx + (R() - 0.5) * 120, y: sy - 6 + (R() - 0.5) * 34, r: 22 + R() * 34, a: 0.35 + R() * 0.4, sh: R(), cap: true });
      const n = Math.round(10 + cover * 30);
      for (let k = 0; k < n; k++) this.puffs.push({ x: R() * W * 1.3, y: Math.max(this.yBase, this.yOf(this.d.summit.ang + 0.6)) - R() * 40, r: 26 + R() * 50, a: 0.25 + R() * 0.45, sh: R() });
    } else if (cover > 0.25 && (s.base ?? 9e9) < 3000) { // clear top, broken cloud above it
      const y0 = Math.max(70, this.yBase);
      const n = Math.round(cover * 40);
      for (let k = 0; k < n; k++) {
        const cx = R() * W * 1.3;
        for (let j = 0; j < 4; j++) this.puffs.push({ x: cx + (R() - 0.5) * 70, y: y0 - R() * 30, r: 18 + R() * 30, a: 0.4 + R() * 0.4, sh: R() });
      }
    }
    this.cirrus = [];
    const hi = clamp((s.high ?? 0) / 100, 0, 1);
    for (let k = 0; k < Math.round(hi * 14); k++) this.cirrus.push({ x: R() * W * 1.4, y: 20 + R() * this.H * 0.35, w: 80 + R() * 200, h: 3 + R() * 6, a: 0.12 + R() * 0.2 });
    this.stars = [];
    for (let k = 0; k < 120; k++) this.stars.push({ x: R() * W, y: R() * this.hy * 0.9, r: R() < 0.1 ? 1.3 : 0.7, a: 0.4 + R() * 0.6 });
    this.rain = clamp((s.precip ?? 0) / 2, 0, 1);
    // drift: wind blowing from dir, seen looking along the view azimuth
    const toward = ((s.dir ?? 250) + 180) % 360, right = (this.d.summit.az + 90) % 360;
    this.drift = Math.cos((toward - right) * Math.PI / 180) * clamp((s.wind ?? 15) / 6, 1.5, 9);
  }
  loop() {
    if (this.raf || this.reduced || !this.visible) return;
    const step = (ts) => {
      this.raf = 0;
      if (!this.visible) return;
      if (ts - this.last > 40) { this.time += (ts - this.last) / 1000; this.last = ts; this.draw(); }
      this.raf = requestAnimationFrame(step);
    };
    this.last = performance.now(); this.raf = requestAnimationFrame(step);
  }
  draw() {
    const g = this.g, W = this.W, H = this.H, s = this.state; if (!s) return;
    const { alt, light, grey, warm, cl, shade, lit } = this.palette();
    let [top, bot] = skyAt(alt);
    const gTop = mixC([16, 18, 22], [150, 160, 170], light), gBot = mixC([26, 29, 34], [200, 205, 209], light);
    top = mixC(top, gTop, grey); bot = mixC(bot, gBot, grey);
    this.tone = lum(mixC(top, bot, 0.35)) < 0.42 ? 'dark' : 'light';
    const sky = g.createLinearGradient(0, 0, 0, this.hy);
    sky.addColorStop(0, css(top)); sky.addColorStop(1, css(bot));
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    if (alt < -7 && grey < 0.5) for (const st of this.stars) { g.fillStyle = `rgba(255,255,255,${st.a * (1 - grey * 2) * clamp((-alt - 7) / 5, 0, 1)})`; g.fillRect(st.x, st.y, st.r, st.r); }

    // the sun, if it's in the frame and up (behind the mountain where it should be)
    const sx = this.xOf(s.sunAz ?? 0);
    if (alt > -1.5 && alt < 30 && sx > -60 && sx < W + 60 && grey < 0.75) {
      const sy = this.yOf(alt + refraction(alt)), rr = 0.27 * this.ppd;
      const gl = g.createRadialGradient(sx, sy, 0, sx, sy, rr * 9);
      gl.addColorStop(0, `rgba(255,236,190,${0.55 * (1 - grey)})`); gl.addColorStop(1, 'rgba(255,220,160,0)');
      g.fillStyle = gl; g.fillRect(sx - rr * 9, sy - rr * 9, rr * 18, rr * 18);
      g.fillStyle = `rgba(255,244,214,${0.95 * (1 - grey)})`; g.beginPath(); g.arc(sx, sy, rr, 0, Math.PI * 2); g.fill();
    }
    // cirrus
    for (const c of this.cirrus) {
      const x = ((c.x + this.time * this.drift * 0.6) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2;
      g.fillStyle = css(mixC([60, 64, 72], [255, 255, 255], light), c.a * (0.2 + 0.8 * light)); g.beginPath(); g.ellipse(x, c.y, c.w / 2, c.h / 2, -0.04, 0, Math.PI * 2); g.fill();
    }
    // mountain layers: background hills, the Reek, the foreground
    const cols = [
      mixC(mixC([3, 4, 7], [44, 54, 58], light), [62, 54, 52], warm * 0.3),
      mixC(mixC([6, 8, 13], [74, 88, 104], light), [92, 70, 72], warm * 0.35),
      mixC(mixC([11, 14, 23], [138, 154, 172], light), [196, 150, 136], warm * 0.45),
    ];
    for (let k = 2; k >= 0; k--) {
      const c = mixC(cols[k], mixC(cols[k], gBot, 0.5), grey * 0.6);
      g.fillStyle = css(c); g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W + 2; x += 2) g.lineTo(x, this.yOf(this.layerAt(k, x)));
      g.lineTo(W, H); g.closePath(); g.fill();
    }
    // ground below the foreground skyline (bay and fields)
    const fg = g.createLinearGradient(0, this.hy - 20, 0, H);
    fg.addColorStop(0, css(cols[0], 0)); fg.addColorStop(1, css(mixC(cols[0], [0, 0, 0], 0.3), 0.6));
    g.fillStyle = fg; g.fillRect(0, this.hy - 20, W, H - this.hy + 20);

    // cloud
    if (s.v === 0 && s.why !== 'scattered') {
      const yb = this.yBase;
      const gr = g.createLinearGradient(0, 0, 0, yb + 10);
      gr.addColorStop(0, css(mixC(lit, top, 0.15))); gr.addColorStop(1, css(mixC(lit, shade, 0.7), 0.97));
      g.fillStyle = gr; g.fillRect(0, 0, W, Math.max(0, yb - 22));
    }
    for (const p of this.puffs) {
      const span = W * 1.3, x = p.cap ? p.x + Math.sin(this.time * 0.15 + p.r) * 6 : ((p.x + this.time * this.drift) % span + span) % span - W * 0.15;
      g.globalAlpha = p.a * (0.6 + p.sh * 0.4); g.drawImage(this.spShade, x - p.r, p.y - p.r * 0.45, p.r * 2, p.r * 1.2);
      g.globalAlpha = p.a * (1 - p.sh * 0.35); g.drawImage(this.spLit, x - p.r * 0.85, p.y - p.r * 0.75, p.r * 1.7, p.r * 1.05);
    }
    g.globalAlpha = 1;
    // rain
    if (this.rain > 0.08) {
      g.strokeStyle = css(mixC([120, 130, 140], [230, 235, 240], light), 0.18 + this.rain * 0.2); g.lineWidth = 1;
      const R = rng(11), n = Math.round(60 + this.rain * 160), t = this.time;
      g.beginPath();
      for (let k = 0; k < n; k++) {
        const x = (R() * W + t * 40) % W, y = (R() * H + t * 260 * (0.8 + R() * 0.4)) % H;
        g.moveTo(x, y); g.lineTo(x - 4, y + 14);
      }
      g.stroke();
    }
    if (s.fog) {
      const fgg = g.createLinearGradient(0, this.hy - 90, 0, H);
      fgg.addColorStop(0, css(cl, 0)); fgg.addColorStop(0.5, css(cl, 0.8)); fgg.addColorStop(1, css(cl, 0.95));
      g.fillStyle = fgg; g.fillRect(0, this.hy - 90, W, H);
    }
  }
}
