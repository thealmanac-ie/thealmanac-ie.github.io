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
  // The cut is drawn at one scale both ways (S px per metre) so the person and the steps are true
  // to size. The scale is the largest that fits the whole tidal range between the top of the steps
  // and the window's low level (zLow, below the lowest astronomical tide), so every water level
  // the tide can reach is drawn at its true height, in the frame, against the steps and the person.
  layout(W, H, o = {}) {
    this.W = W; this.H = H;
    this.yH = Math.round(H * (o.horizon ?? 0.47));
    const g = this.geom;
    const yBot = H - (o.bottom ?? 128);
    this.yBot = yBot;
    this.yCut = this.yH + 18; // top of the section window, kept clear of the far-bay strip at the horizon
    this.zTop = g.top + 0.25;
    this.zLow = o.zLow ?? g.zLow;
    this.S = Math.min(W / (o.metres ?? 7.2), (yBot - this.yCut) / (this.zTop - this.zLow));
    this.yZ = (z) => yBot - (z - this.zLow) * this.S;
    this.zY = (y) => this.zLow + (yBot - y) / this.S;
    this.x0 = 0;
    this.xM = (m) => this.x0 + m * this.S;
    // the foreshore: the shelf runs out from the foot of the steps; a break line stands for the
    // ~30 m of shelf the screen can't hold; then the bed drops into the channel, below any tide
    const Wm = W / this.S;
    this.xBreak = g.footX + Math.max(1.6, (Wm - g.footX) * 0.55);
    this.xChan = this.xBreak + 0.35;
  }
  bedZ(xm) { // bed level (m OD Malin) at xm metres along the section
    const g = this.geom;
    if (xm <= g.footX) return g.bedBest;
    if (xm < this.xBreak) return g.bedBest - g.bedSlope * (xm - g.footX);
    const zShelf = g.bedBest - g.bedSlope * g.shelfLen;
    if (xm < this.xChan) return zShelf;
    const f = clamp((xm - this.xChan) / Math.max(0.5, this.W / this.S - this.xChan), 0, 1), e = f * f * (3 - 2 * f);
    return zShelf + (this.zLow - 0.35 - zShelf) * Math.sqrt(e);
  }
  waterLeftX(z) { // px where the water's surface meets the steps or the foreshore at level z
    const g = this.geom;
    if (z >= g.bedBest) return this.wallX(z);
    const Wm = (this.W - this.x0) / this.S;
    for (let xm = g.footX; xm <= Wm + 0.02; xm += 0.01) if (this.bedZ(xm) <= z) return this.xM(xm);
    return this.W + 1;
  }
  // Draw a state into another 2D context (the share card), leaving the live hero untouched.
  renderTo(ctx, W, H, state, o = {}) {
    const keep = ['g', 'W', 'H', 'yH', 'yBot', 'yCut', 'S', 'zTop', 'zLow', 'yZ', 'zY', 'x0', 'xM', 'xBreak', 'xChan', 'state', 'labelAt', 'tone', 'depthWord', 'lastDraw'].map((k) => [k, this[k]]);
    this.g = ctx; this.layout(W, H, o); this.state = state;
    this.draw();
    const out = { labelAt: this.labelAt, tone: this.tone, yH: this.yH, draw: this.lastDraw };
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
    // Below the horizon. Only the section (the cut) shows the water level. The far bay is a thin,
    // faded strip at the horizon itself, well clear of the top of the section, and behind the section
    // is haze (distant shore and air), never water, so nothing behind the steps reads as a level.
    const zw = s.level, yS = this.yZ(zw);
    const dark = s.sun.alt < -4;
    const yBand = yH + Math.max(5, Math.round((this.yCut - yH) * 0.45));
    const hz = g.createLinearGradient(0, yBand, 0, H);
    hz.addColorStop(0, css(mixC(hor, dark ? [26, 24, 22] : [150, 138, 106], dark ? 0.6 : 0.5)));
    hz.addColorStop(1, css(mixC(hor, dark ? [12, 12, 12] : [112, 100, 76], dark ? 0.85 : 0.72)));
    g.fillStyle = hz; g.fillRect(0, yBand, W, H - yBand);
    { // faint far-shore streaks in the haze
      const r = rng(13); g.fillStyle = dark ? 'rgba(255,255,255,.025)' : 'rgba(80,70,50,.07)';
      for (let k = 0; k < 26; k++) { const y = yBand + 3 + r() * (H - yBand) * 0.6; g.fillRect(r() * W, y, 20 + r() * 70, 1); }
    }
    const fb = g.createLinearGradient(0, yH, 0, yBand);
    fb.addColorStop(0, css(mixC(hor, [60, 90, 110], 0.25), 0.9)); fb.addColorStop(1, css(mixC(hor, [60, 90, 110], 0.25), 0.25));
    g.fillStyle = fb; g.fillRect(0, yH, W, yBand - yH);
    // in calm water the hills show upside down in the far bay
    const calm = !s.chop || s.chop.Hs < 0.06;
    if (calm) {
      g.save(); g.beginPath(); g.rect(0, yH, W, yBand - yH); g.clip();
      g.globalAlpha = s.sun.alt < -6 ? 0.08 : 0.18;
      for (const k of [1, 0]) {
        g.beginPath(); g.moveTo(0, yH);
        for (let x = 0; x <= W; x += 3) {
          const az = VIEW_AZ + (x - W / 2) / ppd;
          const f = clamp((az - sk.az0) / sk.step, 0, sk.n - 1), i = Math.floor(f), t = f - i;
          const L = sk.layers[k]; const a = (L[i] + (L[Math.min(i + 1, sk.n - 1)] - L[i]) * t) / 100;
          g.lineTo(x, yH + Math.max(0, a) * ppd * VEX * 0.25);
        }
        g.lineTo(W, yH); g.closePath(); g.fillStyle = css(layerCol[k]); g.fill();
      }
      g.restore();
    }
    // sun path on the far bay
    if (s.sun.alt > -2 && sx > -40 && sx < W + 40) {
      const a = clamp(0.4 - s.sun.alt / 60, 0.08, 0.4);
      g.fillStyle = `rgba(255,220,160,${a})`;
      for (let y = yH + 1; y < yBand; y += 2) { const w = 6 + (y - yH) * 1.2; g.fillRect(sx - w / 2 + Math.sin(y * 0.7 + this.phase * 3) * 2, y, w, 1); }
    }
    // low sun: a warm wash from the sun's side over the sky and the far bay
    if (s.sun.alt > -3 && s.sun.alt < 14) {
      const w = clamp(1 - Math.abs(s.sun.alt - 3) / 11, 0, 1) * 0.28;
      const gx = clamp(sx, -W * 0.3, W * 1.3);
      const wg2 = g.createRadialGradient(gx, yH, 0, gx, yH, W * 1.1);
      wg2.addColorStop(0, `rgba(255,170,90,${w})`); wg2.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = wg2; g.fillRect(0, 0, W, yBand);
    }
    // ground under the cut (mud and stones): the shelf, the break, the drop into the channel
    const gb = this.geom;
    const xFoot = this.xM(gb.footX), xB = this.xM(this.xBreak), xR = W + 3;
    const bedY = (xm) => this.yZ(this.bedZ(xm));
    const bedPts = [];
    for (let x = xFoot; x < xR; x += 3) {
      if (bedPts.length && bedPts[bedPts.length - 1][0] < xB && x >= xB) bedPts.push([xB, bedY(this.xBreak - 1e-6)], [xB, bedY(this.xBreak)]);
      bedPts.push([x, bedY((x - this.x0) / this.S)]);
    }
    bedPts.push([xR, bedY((xR - this.x0) / this.S)]);
    g.fillStyle = dark ? '#1f1a15' : '#5c4a37';
    g.beginPath(); g.moveTo(0, H); g.lineTo(0, this.yZ(gb.bedBest));
    for (const [x, y] of bedPts) g.lineTo(x, y);
    g.lineTo(xR, H); g.closePath(); g.fill();
    // stony crust on the bed
    const r2 = rng(5); g.fillStyle = dark ? 'rgba(80,70,60,.5)' : 'rgba(150,130,104,.6)';
    for (let k = 0; k < 70; k++) { const x = xFoot + r2() * (W - xFoot); const y = bedY((x - this.x0) / this.S) + r2() * 6; g.beginPath(); g.ellipse(x, y, 1.5 + r2() * 3, 1 + r2() * 1.6, 0, 0, Math.PI * 2); g.fill(); }
    // bare foreshore: weed and a wet sheen wherever the bed is out of the water
    {
      const r = rng(17);
      for (let k = 0; k < 60; k++) {
        const x = xFoot + 4 + r() * (W - xFoot - 4), xm = (x - this.x0) / this.S, zb = this.bedZ(xm);
        if (zb <= zw + 0.01 || Math.abs(x - xB) < 5) continue;
        const y = this.yZ(zb);
        g.fillStyle = dark ? 'rgba(40,46,30,.85)' : 'rgba(70,74,34,.85)';
        g.beginPath(); g.ellipse(x, y - 1, 3 + r() * 5, 1.4 + r() * 1.2, 0, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = dark ? 'rgba(170,190,200,.18)' : 'rgba(255,255,255,.35)'; g.lineWidth = 1;
      g.beginPath(); let on = false;
      for (const [x, y] of bedPts) { const dry = this.zY(y) > zw + 0.01; if (dry && !on) { g.moveTo(x, y - 0.5); on = true; } else if (dry) g.lineTo(x, y - 0.5); else on = false; }
      g.stroke();
    }
    // the break: the shelf runs on for ~30 m before it drops into the channel (not to scale)
    {
      const yb = bedY(this.xBreak - 1e-6);
      g.strokeStyle = dark ? 'rgba(220,225,230,.45)' : 'rgba(255,255,255,.7)'; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(xB, yb - 12);
      for (let k = 1; k <= 6; k++) g.lineTo(xB + (k % 2 ? 4 : -4), yb - 12 + k * 6);
      g.stroke();
      g.fillStyle = dark ? 'rgba(220,225,230,.55)' : 'rgba(255,255,255,.8)'; g.font = `600 ${Math.max(10, Math.round(this.S * 0.22))}px system-ui, sans-serif`;
      g.fillText('≈30 m', xB - 14, yb + 40);
    }
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
    const pxm = gb.footX + 0.8;
    const zPerson = this.bedZ(pxm);
    const dHere = Math.max(0, zw - zPerson);
    const px = this.xM(pxm), ph = s.personH * this.S, pyFeet = this.yZ(zPerson);
    const swimmer = dHere > 0.86 * s.personH;
    if (swimmer) this.drawSwimmer(px, yS, ph, dark); else this.drawPerson(px, pyFeet, ph, dark);
    // the water body in the cut, at the computed level: against the steps when it is up to them,
    // otherwise out over the foreshore wherever the bed is below it
    const amp = s.chop ? clamp(s.chop.Hs / 2, 0, 0.35) * this.S : 0;
    const wl = this.waveLen() * this.S;
    const surf = (x) => yS + amp * Math.sin((x / wl) * 2 * Math.PI - this.phase * 2 * Math.PI) * 0.9 + amp * 0.35 * Math.sin((x / (wl * 0.53)) * 2 * Math.PI + this.phase * 5.1);
    const xs = this.waterLeftX(zw);
    const atSteps = zw >= gb.bedBest;
    if (xs < W) {
      const wg = g.createLinearGradient(0, yS, 0, Math.max(yS + 1, this.yBot));
      wg.addColorStop(0, dark ? 'rgba(30,84,110,.84)' : 'rgba(40,120,140,.8)');
      wg.addColorStop(1, dark ? 'rgba(8,30,44,.88)' : 'rgba(14,62,80,.82)');
      g.fillStyle = wg;
      g.beginPath();
      g.moveTo(xs, yS);
      for (let x = xs; x <= W; x += 3) g.lineTo(x, surf(x));
      g.lineTo(xR, surf(xR));
      // down the right edge to the bed, back along the bed towards the steps
      for (let k = bedPts.length - 1; k >= 0; k--) { const [x, y] = bedPts[k]; if (x < xs) break; g.lineTo(x, y); }
      if (atSteps) {
        g.lineTo(xFoot, this.yZ(gb.bedBest));
        // follow the steps back up to the waterline
        for (let k = gb.steps.length - 1; k >= 0; k--) { const st = gb.steps[k]; if (st.z1 < zw) { g.lineTo(this.xM(st.x1), this.yZ(Math.max(st.z1, gb.bedBest))); g.lineTo(this.xM(st.x0), this.yZ(st.z1)); } }
      } else g.lineTo(xs, yS);
      g.closePath(); g.fill();
      // surface line
      g.strokeStyle = dark ? 'rgba(190,225,240,.8)' : 'rgba(235,250,255,.95)'; g.lineWidth = 1.8;
      g.beginPath();
      for (let x = xs; x <= W; x += 3) { const y = surf(x); x === xs ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.lineTo(xR, surf(xR));
      g.stroke();
    }
    // time travel: today's water level at this moment, dashed, for comparison
    if (s.ghost != null && Math.abs(s.ghost - zw) > 0.02) {
      const yG = this.yZ(s.ghost), xg = Math.min(W - 40, this.waterLeftX(s.ghost));
      g.save(); g.setLineDash([6, 5]); g.strokeStyle = dark ? 'rgba(255,255,255,.55)' : 'rgba(20,40,50,.6)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(xg, yG); g.lineTo(W, yG); g.stroke(); g.restore();
      g.fillStyle = dark ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.85)'; g.font = `600 ${Math.max(11, Math.round(this.S * 0.24))}px system-ui, sans-serif`;
      const gt = s.ghostLabel || 'today', gw = g.measureText(gt).width;
      g.fillText(gt, Math.max(xg + 4, W - gw - 8), yG + (s.ghost < zw ? 14 : -5));
    }
    // depth tape at the foot of the steps: up from the foot to the water, or, when the water is
    // short of the steps, down from the foot to the level, dashed out to where the water starts
    const dRaw = zw - gb.bedBest, d = Math.max(0, dRaw);
    const tx = xFoot + 6, ty0 = this.yZ(gb.bedBest);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
    if (dRaw >= 0) {
      g.beginPath(); g.moveTo(tx, ty0); g.lineTo(tx, ty0 - d * this.S); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.85)';
      for (let m = 0.5; m < d; m += 0.5) g.fillRect(tx - 4, ty0 - m * this.S - 0.5, 8, 1.5);
    } else {
      g.save(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,.6)'; g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(xFoot, yS); g.lineTo(Math.min(W, xs), yS); g.stroke(); g.restore();
      g.beginPath(); g.moveTo(tx, ty0); g.lineTo(tx, yS); g.moveTo(tx - 4, ty0); g.lineTo(tx + 4, ty0); g.moveTo(tx - 4, yS); g.lineTo(tx + 4, yS); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.9)'; g.font = `600 ${Math.max(11, Math.round(this.S * 0.24))}px system-ui, sans-serif`;
      const gap = -dRaw < 0.3 ? `${Math.round(-dRaw * 100)} cm` : `${(Math.round(-dRaw * 10) / 10).toFixed(1)} m`; // as the verdict line words it
      g.fillText(`${gap} below`, tx + 8, yS - ty0 < 30 ? yS + 14 : (ty0 + yS) / 2 + 4);
    }
    // label position for the HTML overlay
    this.labelAt = { x: clamp(px + 30, 84, W - 84), y: Math.min(yS - 8, pyFeet - ph - 6) };
    this.depthWord = bodyWord(d, s.personH);
    // what was drawn, in the drawing's own numbers (read by tools/hero_check.cjs)
    this.lastDraw = { level: zw, yS, zAtYS: this.zY(yS), S: this.S, yH, yBand, yCut: this.yCut, yTopOfSteps: this.yZ(gb.top), yBot: this.yBot, H, W,
      xWater: xs, xFoot, yFoot: ty0, atSteps, waterDrawn: xs < W, zPerson, dHere, personFeetY: pyFeet, personHeadY: swimmer ? yS - 0.17 * ph / 1.72 : pyFeet - ph, swimmer,
      bareFromFoot: atSteps ? 0 : (Math.min(W, xs) - xFoot) / this.S };
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
