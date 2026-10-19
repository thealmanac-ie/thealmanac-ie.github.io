// The surface: a side-on cut through the Point at the swimming spot, with the water drawn at
// the predicted level, a person standing at the foot of the steps, the surface calm or choppy
// from the wind estimate, the sky for the time of day and the Reek's real skyline behind
// (the skyline is the one the Croagh Patrick page computed from Westport Quay, EU-DEM).
import { clamp, lerp, rng, D2R } from './util.js';
import { bodyWord } from './point.js';

const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const SKY = [ // sun altitude, zenith, horizon (from the reek site's palette, warmed slightly)
  [-18, [5, 8, 17], [16, 22, 40]], [-10, [9, 15, 34], [38, 46, 78]], [-5, [26, 40, 80], [176, 112, 96]],
  [-1, [52, 78, 132], [236, 150, 104]], [4, [82, 126, 182], [246, 196, 142]], [12, [100, 150, 206], [212, 226, 236]],
  [60, [84, 140, 204], [196, 218, 234]],
];
function skyAt(alt) {
  if (alt <= SKY[0][0]) return [SKY[0][1], SKY[0][2]];
  for (let k = 0; k < SKY.length - 1; k++) {
    const A = SKY[k], B = SKY[k + 1];
    if (alt <= B[0]) { const t = (alt - A[0]) / (B[0] - A[0]); return [mixC(A[1], B[1], t), mixC(A[2], B[2], t)]; }
  }
  return [SKY[SKY.length - 1][1], SKY[SKY.length - 1][2]];
}
const VIEW_AZ = 236; // looking south-west from the steps, towards the Reek (at 239.8 deg)
const FOV = 34; // degrees across the screen

export class Hero {
  constructor(canvas, skyline, geom) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.sky = skyline; this.geom = geom;
    this.state = null; this.phase = 0; this.last = 0; this.visible = true;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.stars = (() => { const r = rng(7); return Array.from({ length: 90 }, () => [r(), r() * r(), 0.3 + r() * 0.7]); })();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; if (this.visible) this.loop(); }).observe(canvas);
    this.resize();
  }
  resize() {
    const r = this.c.parentElement.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout(r.width, r.height);
    if (this.state) this.draw();
  }
  // layout: sky and the Reek on top (the verdict text sits there), the cut below the horizon.
  // The cut is drawn at one scale both ways (S px per metre) so the person and the steps
  // are true to size; ~7 m of section fits across.
  layout(W, H, o = {}) {
    this.W = W; this.H = H;
    this.yH = Math.round(H * (o.horizon ?? 0.58));
    const g = this.geom;
    this.S = W / (o.metres ?? 7.2);
    const yBot = H - (o.bottom ?? 112);
    this.zTop = g.top + 0.5;
    this.zBot = this.zTop - (yBot - (this.yH + 16)) / this.S;
    this.yZ = (z) => yBot - (z - this.zBot) * this.S;
    this.x0 = 0;
    this.xM = (m) => this.x0 + m * this.S;
  }
  // Draw a state into another 2D context (the share card), leaving the live hero untouched.
  renderTo(ctx, W, H, state, o = {}) {
    const keep = ['g', 'W', 'H', 'yH', 'S', 'zTop', 'zBot', 'yZ', 'x0', 'xM', 'state', 'labelAt', 'tone', 'depthWord'].map((k) => [k, this[k]]);
    this.g = ctx; this.layout(W, H, o); this.state = state;
    this.draw();
    const out = { labelAt: this.labelAt, tone: this.tone, yH: this.yH };
    for (const [k, v] of keep) this[k] = v;
    return out;
  }
  set(state) { this.state = state; this.draw(); this.loop(); }
  loop() {
    if (this.raf || this.reduced || !this.visible || !this.state) return;
    const step = (ts) => {
      this.raf = null;
      if (!this.visible) return;
      const dt = this.last ? Math.min(0.1, (ts - this.last) / 1000) : 0; this.last = ts;
      const ch = this.state.chop;
      const speed = ch && ch.Tp > 0 ? 1.56 * ch.Tp : 0.6; // deep-water phase speed g T / 2 pi
      this.phase += dt * speed / Math.max(0.6, this.waveLen());
      this.draw();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  waveLen() { const ch = this.state.chop; return ch && ch.Tp > 0 ? Math.max(0.4, 1.56 * ch.Tp * ch.Tp) : 2.5; }

  draw() {
    const s = this.state; if (!s) return;
    const g = this.g, W = this.W, H = this.H, yH = this.yH;
    const [zen, hor] = skyAt(s.sun.alt);
    // sky
    const sg = g.createLinearGradient(0, 0, 0, yH);
    sg.addColorStop(0, css(zen)); sg.addColorStop(1, css(hor));
    g.fillStyle = sg; g.fillRect(0, 0, W, yH + 1);
    this.tone = s.sun.alt > 6 ? 'light' : 'dark';
    // stars
    if (s.sun.alt < -6) {
      const a = clamp((-6 - s.sun.alt) / 8, 0, 1);
      for (const [x, y, m] of this.stars) { g.fillStyle = `rgba(255,255,255,${0.75 * a * m})`; g.fillRect(x * W, y * yH * 0.9, m > 0.8 ? 1.6 : 1.1, m > 0.8 ? 1.6 : 1.1); }
    }
    // sun or its glow
    const ppd = W / FOV;
    const dAz = ((s.sun.az - VIEW_AZ + 540) % 360) - 180;
    const sx = W / 2 + dAz * ppd, sy = yH - s.sun.alt * ppd * 1.6;
    if (s.sun.alt > -8) {
      const glowA = clamp((s.sun.alt + 8) / 10, 0, 1) * (s.sun.alt < 15 ? 0.6 : 0.25);
      const gx = clamp(sx, -W * 0.2, W * 1.2);
      const rg = g.createRadialGradient(gx, Math.min(sy, yH), 0, gx, Math.min(sy, yH), W * 0.7);
      rg.addColorStop(0, `rgba(255,214,150,${glowA})`); rg.addColorStop(1, 'rgba(255,214,150,0)');
      g.fillStyle = rg; g.fillRect(0, 0, W, yH);
      if (s.sun.alt > -0.8 && sx > -20 && sx < W + 20) {
        g.fillStyle = s.sun.alt < 6 ? 'rgba(255,200,130,.95)' : 'rgba(255,248,225,.95)';
        g.beginPath(); g.arc(sx, sy, 9, 0, Math.PI * 2); g.fill();
      }
    }
    // the Reek and the hills (three distance layers, heights x2.2 for legibility)
    const sk = this.sky, VEX = 1.6;
    // atmospheric perspective: far hills fade into the horizon colour, the Reek a little darker, near hills darkest
    const layerCol = [mixC(hor, [34, 46, 52], 0.72), mixC(hor, [44, 58, 66], 0.5), mixC(hor, zen, 0.25)];
    for (const k of [2, 1, 0]) {
      g.beginPath(); g.moveTo(0, yH);
      for (let x = 0; x <= W; x += 2) {
        const az = VIEW_AZ + (x - W / 2) / ppd;
        const f = clamp((az - sk.az0) / sk.step, 0, sk.n - 1), i = Math.floor(f), t = f - i;
        const L = sk.layers[k]; const a = (L[i] + (L[Math.min(i + 1, sk.n - 1)] - L[i]) * t) / 100;
        g.lineTo(x, yH - Math.max(0, a) * ppd * VEX);
      }
      g.lineTo(W, yH); g.closePath();
      const lc = s.sun.alt < -6 ? mixC(layerCol[k], [8, 12, 20], 0.65) : layerCol[k];
      g.fillStyle = css(lc); g.fill();
    }
    // the bay between the cut and the horizon: water out to the horizon at high tide; as the tide
    // drops below the shelf in front of the Point, bare flats spread out from the near side until,
    // around the level of the banks further out (~-1.1 m OD, the charted drying height), the bay is drained
    const zw = s.level, yS = this.yZ(zw);
    const dark = s.sun.alt < -4;
    const g0 = this.geom;
    const dryFrac = clamp((g0.flats - zw) / (g0.flats - g0.bayBed), 0, 1);
    const yDry = yS - dryFrac * (yS - yH) * 0.97; // water above this line, bare flats below it
    const wgr = g.createLinearGradient(0, yH, 0, Math.max(yH + 1, yDry));
    wgr.addColorStop(0, css(mixC(hor, [60, 90, 110], 0.35))); wgr.addColorStop(1, css(mixC(zen, [14, 54, 70], dark ? 0.7 : 0.45)));
    g.fillStyle = wgr; g.fillRect(0, yH, W, Math.max(0, yDry - yH) + 1);
    // in calm water the hills show upside down in the bay
    const calm = !s.chop || s.chop.Hs < 0.06;
    if (calm && yDry - yH > 8) {
      g.save(); g.beginPath(); g.rect(0, yH, W, yDry - yH); g.clip();
      g.globalAlpha = s.sun.alt < -6 ? 0.1 : 0.22;
      for (const k of [1, 0]) {
        g.beginPath(); g.moveTo(0, yH);
        for (let x = 0; x <= W; x += 3) {
          const az = VIEW_AZ + (x - W / 2) / ppd;
          const f = clamp((az - sk.az0) / sk.step, 0, sk.n - 1), i = Math.floor(f), t = f - i;
          const L = sk.layers[k]; const a = (L[i] + (L[Math.min(i + 1, sk.n - 1)] - L[i]) * t) / 100;
          g.lineTo(x, yH + Math.max(0, a) * ppd * VEX * 0.7 + Math.sin(x * 0.9 + this.phase * 4) * 0.6);
        }
        g.lineTo(W, yH); g.closePath(); g.fillStyle = css(layerCol[k]); g.fill();
      }
      g.restore();
    }
    // sun path on whatever water there is
    if (s.sun.alt > -2 && sx > -40 && sx < W + 40) {
      const a = clamp(0.4 - s.sun.alt / 60, 0.08, 0.4);
      g.fillStyle = `rgba(255,220,160,${a})`;
      for (let y = yH + 2; y < yDry; y += 3) { const w = 4 + (y - yH) * 0.25; g.fillRect(sx - w / 2 + Math.sin(y * 0.7 + this.phase * 3) * 2, y, w, 1.2); }
    }
    // the bare flats, with a creek winding out to the water, weed and wet sheen
    if (dryFrac > 0) {
      const top = yDry, bandH = Math.max(1, yS - top);
      const fg = g.createLinearGradient(0, top, 0, yS);
      fg.addColorStop(0, css(mixC(hor, [70, 80, 70], 0.5))); fg.addColorStop(1, css(dark ? [30, 32, 28] : [104, 92, 70]));
      g.fillStyle = fg; g.fillRect(0, top, W, bandH + 1);
      const waterC = css(mixC(hor, [40, 70, 90], dark ? 0.7 : 0.35));
      g.fillStyle = waterC; g.beginPath();
      const cx = (f) => W * (0.62 + 0.18 * Math.sin(f * 5.2 + 0.6) * (1 - f * 0.4));
      for (let k = 0; k <= 30; k++) { const f = k / 30; g.lineTo(cx(f) - (1.5 + f * f * 22), top + bandH * f); }
      for (let k = 30; k >= 0; k--) { const f = k / 30; g.lineTo(cx(f) + (1.5 + f * f * 22), top + bandH * f); }
      g.closePath(); g.fill();
      const r = rng(11); g.fillStyle = dark ? 'rgba(20,24,18,.6)' : 'rgba(84,72,38,.55)';
      const nWeed = Math.round(46 * dryFrac) + 6;
      for (let k = 0; k < nWeed; k++) { const y = top + 3 + r() * Math.max(1, bandH - 5); const w = 6 + r() * 30 * (y - yH) / Math.max(1, yS - yH); g.fillRect(r() * W, y, w, 1.5); }
      if (!dark) { g.fillStyle = 'rgba(255,255,255,.18)'; for (let k = 0; k < 18; k++) { const y = top + 2 + r() * Math.max(1, bandH - 4); g.fillRect(r() * W, y, 10 + r() * 40 * (y - yH) / Math.max(1, yS - yH), 1); } }
    }
    // low sun: a warm wash from the sun's side over sky, water and flats
    if (s.sun.alt > -3 && s.sun.alt < 14) {
      const w = clamp(1 - Math.abs(s.sun.alt - 3) / 11, 0, 1) * 0.28;
      const gx = clamp(sx, -W * 0.3, W * 1.3);
      const wg2 = g.createRadialGradient(gx, yH, 0, gx, yH, W * 1.1);
      wg2.addColorStop(0, `rgba(255,170,90,${w})`); wg2.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = wg2; g.fillRect(0, 0, W, Math.max(yS, yH));
    }
    // ground under the cut (mud and stones)
    const gb = this.geom;
    const xFoot = this.xM(gb.footX), xR = W + 10;
    const bedY = (xm) => this.yZ(gb.bedBest - gb.bedSlope * Math.max(0, xm - gb.footX));
    g.fillStyle = dark ? '#1f1a15' : '#5c4a37';
    g.beginPath(); g.moveTo(0, H); g.lineTo(0, this.yZ(gb.bedBest));
    for (let x = xFoot; x <= xR; x += 6) g.lineTo(x, bedY((x - this.x0) / this.S));
    g.lineTo(xR, H); g.closePath(); g.fill();
    // stony crust on the bed
    const r2 = rng(5); g.fillStyle = dark ? 'rgba(80,70,60,.5)' : 'rgba(150,130,104,.6)';
    for (let k = 0; k < 70; k++) { const x = xFoot + r2() * (W - xFoot); const y = bedY((x - this.x0) / this.S) + r2() * 6; g.beginPath(); g.ellipse(x, y, 1.5 + r2() * 3, 1 + r2() * 1.6, 0, 0, Math.PI * 2); g.fill(); }
    // behind the section: the sloping apron of round boulders set in concrete that the steps cut through
    const st0 = gb.steps[0], stN = gb.steps[gb.steps.length - 1];
    const nose = (k) => [this.xM(gb.steps[k].x0), this.yZ(gb.steps[k].z0)];
    g.fillStyle = dark ? '#2f3437' : '#a7a49c';
    g.beginPath(); g.moveTo(...nose(0)); g.lineTo(xFoot, this.yZ(gb.bedBest)); g.lineTo(this.xM(st0.x0), this.yZ(gb.bedBest)); g.closePath(); g.fill();
    const r3 = rng(9); g.fillStyle = dark ? 'rgba(120,120,115,.35)' : 'rgba(225,222,212,.75)';
    for (let k = 0; k < 90; k++) {
      const f = r3(), q = r3();
      const x = lerp(this.xM(st0.x0), xFoot, f), yTopSlope = lerp(nose(0)[1], this.yZ(gb.bedBest), f);
      const y = yTopSlope + q * (this.yZ(gb.bedBest) - yTopSlope);
      g.beginPath(); g.ellipse(x, y, 2.5 + r3() * 3.5, 1.8 + r3() * 2, 0, 0, Math.PI * 2); g.fill();
    }
    // the cut: promenade slab and the concrete steps (hatched like a section drawing)
    g.fillStyle = dark ? '#3a3f42' : '#7f8484';
    g.beginPath();
    g.moveTo(-10, H); g.lineTo(-10, this.yZ(gb.top));
    for (const st of gb.steps) { g.lineTo(this.xM(st.x0), this.yZ(st.z0)); g.lineTo(this.xM(st.x0), this.yZ(st.z1)); g.lineTo(this.xM(st.x1), this.yZ(st.z1)); }
    g.lineTo(xFoot, this.yZ(gb.bedBest)); g.lineTo(xFoot, H); g.closePath(); g.fill();
    g.save(); g.clip();
    g.strokeStyle = dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.1)'; g.lineWidth = 1;
    for (let k = -H; k < W; k += 9) { g.beginPath(); g.moveTo(k, H); g.lineTo(k + H, 0); g.stroke(); }
    g.restore();
    // one of the curved precast shelters on the promenade (2.24 m tall, 1.4 m deep: Council art brief drawing)
    {
      const sx0 = this.xM(gb.shelterX), base = this.yZ(gb.top), u = this.S;
      g.fillStyle = dark ? '#4a5054' : '#d9d6cd';
      g.beginPath();
      g.moveTo(sx0, base); g.lineTo(sx0, base - 2.24 * u);
      g.quadraticCurveTo(sx0 + 1.35 * u, base - 2.3 * u, sx0 + 1.4 * u, base - 1.2 * u);
      g.lineTo(sx0 + 1.4 * u, base - 0.15 * u); g.lineTo(sx0 + 1.2 * u, base - 0.15 * u); g.lineTo(sx0 + 1.2 * u, base - 1.15 * u);
      g.quadraticCurveTo(sx0 + 1.1 * u, base - 2.02 * u, sx0 + 0.18 * u, base - 2.05 * u);
      g.lineTo(sx0 + 0.18 * u, base); g.closePath(); g.fill();
      g.fillStyle = dark ? '#2a2e31' : '#8b7f6c'; g.fillRect(sx0 + 0.2 * u, base - 0.47 * u, 1.0 * u, 0.05 * u); // bench
    }
    // twin stainless handrails with posts
    g.strokeStyle = dark ? 'rgba(200,210,215,.55)' : 'rgba(70,80,86,.9)'; g.lineWidth = 2;
    const railY = (st) => this.yZ(st.z0) - 0.9 * this.S;
    g.beginPath(); g.moveTo(this.xM(st0.x0) + 3, railY(st0)); g.lineTo(this.xM(stN.x0) + 3, railY(stN)); g.stroke();
    g.lineWidth = 1.4;
    for (const k of [0, Math.floor(gb.steps.length / 2), gb.steps.length - 1]) { const st = gb.steps[k]; g.beginPath(); g.moveTo(this.xM(st.x0) + 3, this.yZ(st.z0)); g.lineTo(this.xM(st.x0) + 3, railY(st) - 1); g.stroke(); }
    // person on the bed just past the foot of the steps (or swimming, when it's out of their depth)
    const dHere = Math.max(0, zw - gb.bedBest);
    const px = this.xM(gb.footX + 1.0), ph = s.personH * this.S, pyFeet = bedY(gb.footX + 1.0);
    if (dHere > 0.86 * s.personH) this.drawSwimmer(px, yS, ph, dark); else this.drawPerson(px, pyFeet, ph, dark);
    // the water body in the cut
    const amp = s.chop ? clamp(s.chop.Hs / 2, 0, 0.35) * this.S : 0;
    const wl = this.waveLen() * this.S;
    if (zw > gb.bedBest - 0.02) {
      const wg = g.createLinearGradient(0, yS, 0, this.yZ(gb.bedBest));
      wg.addColorStop(0, dark ? 'rgba(18,52,70,.72)' : 'rgba(40,120,140,.62)');
      wg.addColorStop(1, dark ? 'rgba(6,22,32,.85)' : 'rgba(14,62,80,.8)');
      g.fillStyle = wg;
      g.beginPath();
      const xs = this.wallX(zw);
      g.moveTo(xs, yS);
      for (let x = xs; x <= W; x += 3) g.lineTo(x, yS + amp * Math.sin((x / wl) * 2 * Math.PI - this.phase * 2 * Math.PI) * 0.9 + amp * 0.35 * Math.sin((x / (wl * 0.53)) * 2 * Math.PI + this.phase * 5.1));
      // down the right edge to the bed, back along the bed to the foot of the steps
      for (let x = W; x >= xFoot; x -= 6) g.lineTo(x, bedY((x - this.x0) / this.S));
      g.lineTo(xFoot, this.yZ(gb.bedBest));
      // follow the steps back up to the waterline
      for (let k = gb.steps.length - 1; k >= 0; k--) { const st = gb.steps[k]; if (st.z1 < zw) { g.lineTo(this.xM(st.x1), this.yZ(Math.max(st.z1, gb.bedBest))); g.lineTo(this.xM(st.x0), this.yZ(st.z1)); } }
      g.closePath(); g.fill();
      // surface line
      g.strokeStyle = dark ? 'rgba(170,210,230,.55)' : 'rgba(235,250,255,.9)'; g.lineWidth = 1.6;
      g.beginPath();
      for (let x = xs; x <= W; x += 3) { const y = yS + amp * Math.sin((x / wl) * 2 * Math.PI - this.phase * 2 * Math.PI) * 0.9 + amp * 0.35 * Math.sin((x / (wl * 0.53)) * 2 * Math.PI + this.phase * 5.1); x === xs ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
    // time travel: today's water level at this moment, dashed, for comparison
    if (s.ghost != null && Math.abs(s.ghost - zw) > 0.02) {
      const yG = this.yZ(s.ghost), xg = this.wallX(Math.max(s.ghost, gb.bedBest));
      g.save(); g.setLineDash([6, 5]); g.strokeStyle = dark ? 'rgba(255,255,255,.55)' : 'rgba(20,40,50,.6)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(xg, yG); g.lineTo(W, yG); g.stroke(); g.restore();
      g.fillStyle = dark ? 'rgba(255,255,255,.75)' : 'rgba(20,40,50,.8)'; g.font = '600 11px system-ui, sans-serif';
      g.fillText(s.ghostLabel || 'today', Math.min(W - 60, xg + 8), yG - 5);
    }
    // depth tape at the foot of the steps
    const d = Math.max(0, zw - gb.bedBest);
    const tx = xFoot + 6, ty0 = this.yZ(gb.bedBest);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(tx, ty0); g.lineTo(tx, ty0 - d * this.S); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let m = 0.5; m < d; m += 0.5) g.fillRect(tx - 4, ty0 - m * this.S - 0.5, 8, 1.5);
    // label position for the HTML overlay
    this.labelAt = { x: clamp(px + 30, 84, W - 84), y: Math.min(yS - 8, pyFeet - ph - 6) };
    this.depthWord = bodyWord(d, s.personH);
  }
  wallX(z) { // x where the water meets the steps at level z
    const gb = this.geom;
    if (z >= gb.top) return this.xM(gb.steps[0].x0) - 0.5;
    for (const st of gb.steps) if (z >= st.z1) return this.xM(st.x0);
    return this.xM(gb.footX);
  }
  drawSwimmer(x, surfY, h, dark) {
    const g = this.g, u = h / 1.72;
    g.save(); g.translate(x, surfY);
    g.fillStyle = dark ? '#cfd6da' : '#20262b'; g.strokeStyle = g.fillStyle; g.lineCap = 'round';
    g.beginPath(); g.arc(0, -0.06 * u, 0.11 * u, 0, Math.PI * 2); g.fill(); // head just above the surface
    g.lineWidth = 0.075 * u; g.beginPath(); g.moveTo(0.05 * u, 0.05 * u); g.quadraticCurveTo(0.35 * u, -0.08 * u, 0.55 * u, 0.02 * u); g.stroke(); // arm reaching forward
    g.globalAlpha = 0.45; g.lineWidth = 0.13 * u; g.beginPath(); g.moveTo(-0.05 * u, 0.12 * u); g.lineTo(-0.75 * u, 0.32 * u); g.stroke(); // body under the water
    g.lineWidth = 0.1 * u; g.beginPath(); g.moveTo(-0.75 * u, 0.32 * u); g.lineTo(-1.25 * u, 0.42 * u); g.stroke();
    g.restore();
  }
  drawPerson(x, feetY, h, dark) {
    const g = this.g, u = h / 1.72; // metres -> px for this body
    g.save(); g.translate(x, feetY);
    g.fillStyle = dark ? '#cfd6da' : '#20262b';
    g.beginPath(); g.arc(0, -1.62 * u, 0.11 * u, 0, Math.PI * 2); g.fill(); // head
    g.beginPath(); // torso
    g.moveTo(-0.19 * u, -1.43 * u); g.quadraticCurveTo(0, -1.49 * u, 0.19 * u, -1.43 * u);
    g.lineTo(0.15 * u, -0.92 * u); g.lineTo(-0.15 * u, -0.92 * u); g.closePath(); g.fill();
    g.lineCap = 'round'; g.strokeStyle = g.fillStyle;
    g.lineWidth = 0.11 * u; g.beginPath(); g.moveTo(-0.08 * u, -0.95 * u); g.lineTo(-0.1 * u, 0); g.moveTo(0.08 * u, -0.95 * u); g.lineTo(0.12 * u, 0); g.stroke(); // legs
    g.lineWidth = 0.075 * u; g.beginPath(); g.moveTo(-0.18 * u, -1.4 * u); g.lineTo(-0.3 * u, -1.0 * u); g.lineTo(-0.27 * u, -0.78 * u); g.moveTo(0.18 * u, -1.4 * u); g.lineTo(0.33 * u, -1.05 * u); g.lineTo(0.36 * u, -0.82 * u); g.stroke(); // arms
    g.restore();
  }
}
