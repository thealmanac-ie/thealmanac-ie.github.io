// One day of tide at the Point: depth at the foot of the steps, the wade/dip/swim lines,
// the windows above the chosen line, high and low water, and night shading.
import { hm, clamp, sunPosition } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}, txt) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };

export function drawDay(svg, o) {
  // o: {t0, t1, pt, need, levels:{wade,dip,swim}, chosen, spot, now, onPick}
  const W = 380, H = 230, L = 34, R = 10, T = 14, B = 26;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const { t0, t1, pt } = o;
  const N = 288, pts = [];
  let dmax = 0;
  for (let i = 0; i <= N; i++) { const t = t0 + (t1 - t0) * i / N; const d = pt.depth(t); pts.push([t, d]); dmax = Math.max(dmax, d); }
  const yMax = Math.max(2.5, Math.ceil((dmax + 0.3) * 2) / 2), yMin = 0;
  const X = (t) => L + (W - L - R) * (t - t0) / (t1 - t0);
  const Y = (d) => T + (H - T - B) * (1 - (clamp(d, yMin, yMax) - yMin) / (yMax - yMin));
  // night shading: merge 10-minute samples into runs (darker in full dark than in twilight)
  let run = null;
  const flush = (tEnd) => { if (run) svg.append(el('rect', { x: X(run.t), y: T, width: Math.max(0.5, X(tEnd) - X(run.t)), height: H - T - B, fill: '#1b2a36', opacity: run.dark ? 0.13 : 0.07 })); run = null; };
  for (let t = t0; t < t1; t += 10 * 60000) {
    const alt = sunPosition(t + 5 * 60000, o.spot.lat, o.spot.lon).alt;
    const kind = alt < -6 ? 'dark' : alt < 0 ? 'twi' : null;
    if (!kind) { flush(t); continue; }
    if (run && (run.dark !== (kind === 'dark'))) flush(t);
    if (!run) run = { t, dark: kind === 'dark' };
  }
  flush(t1);
  // horizontal grid
  for (let d = 0; d <= yMax + 1e-6; d += 0.5) {
    svg.append(el('line', { x1: L, x2: W - R, y1: Y(d), y2: Y(d), stroke: '#e3dccf', 'stroke-width': d % 1 === 0 ? 1 : 0.6 }));
    if (d % 1 === 0) svg.append(el('text', { x: L - 6, y: Y(d) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#5a6b76' }, `${d} m`));
  }
  // windows above the chosen line
  const need = o.levels[o.chosen];
  let inWin = null;
  for (const [t, d] of pts) {
    if (d >= need && inWin == null) inWin = t;
    if ((d < need || t === pts[pts.length - 1][0]) && inWin != null) {
      svg.append(el('rect', { x: X(inWin), y: T, width: Math.max(1, X(t) - X(inWin)), height: H - T - B, fill: o.colors[o.chosen], opacity: 0.16 }));
      inWin = null;
    }
  }
  // threshold lines
  for (const k of ['wade', 'dip', 'swim']) {
    const y = Y(o.levels[k]);
    svg.append(el('line', { x1: L, x2: W - R, y1: y, y2: y, stroke: o.colors[k], 'stroke-width': k === o.chosen ? 1.6 : 1, 'stroke-dasharray': k === o.chosen ? '' : '4 3' }));
    svg.append(el('text', { x: W - R - 2, y: y - 3, 'text-anchor': 'end', 'font-size': 9.5, 'font-weight': 600, fill: o.colors[k] }, k));
  }
  // depth curve (area)
  let dPath = `M${X(pts[0][0])},${Y(0)}`;
  for (const [t, d] of pts) dPath += `L${X(t).toFixed(1)},${Y(d).toFixed(1)}`;
  dPath += `L${X(pts[pts.length - 1][0])},${Y(0)}Z`;
  svg.append(el('path', { d: dPath, fill: '#2a7fb8', opacity: 0.18 }));
  let line = '';
  pts.forEach(([t, d], i) => { line += `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(d).toFixed(1)}`; });
  svg.append(el('path', { d: line, fill: 'none', stroke: '#1d5f73', 'stroke-width': 2 }));
  // high and low water labels (on the level curve, so label with depth and time)
  for (const e of pt.extremes(t0, t1)) {
    const d = e.h - pt.params.bed.best;
    const x = X(e.t), y = Y(Math.max(0, d));
    svg.append(el('circle', { cx: x, cy: y, r: 2.6, fill: '#1d5f73' }));
    const lab = el('text', { x: clamp(x, L + 16, W - R - 16), y: e.high ? y - 7 : Math.min(H - B - 4, y + 13), 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 600, fill: '#0f1d26' }, `${e.high ? 'HW' : 'LW'} ${hm(e.t)}`);
    svg.append(lab);
  }
  // hour axis
  for (let h = 0; h <= 24; h += 3) {
    const t = t0 + h * 3600000; const x = X(t);
    svg.append(el('line', { x1: x, x2: x, y1: H - B, y2: H - B + 4, stroke: '#9aa7ae' }));
    if (h < 24) svg.append(el('text', { x, y: H - 8, 'text-anchor': 'middle', 'font-size': 10, fill: '#5a6b76' }, String(h).padStart(2, '0')));
  }
  // now / picked marker
  const mk = el('g'); svg.append(mk);
  const setMarker = (t) => {
    mk.replaceChildren();
    if (t < t0 || t > t1) return;
    const d = pt.depth(t);
    mk.append(el('line', { x1: X(t), x2: X(t), y1: T, y2: H - B, stroke: '#b5523b', 'stroke-width': 1.4 }));
    mk.append(el('circle', { cx: X(t), cy: Y(Math.max(0, d)), r: 4, fill: '#b5523b', stroke: '#fff', 'stroke-width': 1.5 }));
  };
  setMarker(o.now);
  // touch / pointer scrubbing
  const pick = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width * W;
    const t = t0 + (clamp(x, L, W - R) - L) / (W - L - R) * (t1 - t0);
    setMarker(t); o.onPick && o.onPick(t);
  };
  svg.onpointerdown = (ev) => { svg.setPointerCapture(ev.pointerId); pick(ev); };
  svg.onpointermove = (ev) => { if (ev.buttons || ev.pointerType === 'touch') pick(ev); };
  return { setMarker };
}

// A month of tides: how deep the top of each day's tide gets at the foot of the steps, with the
// moon, so springs and neaps show as a rhythm.
export function drawStrip(svg, o) {
  const W = 380, H = 150, L = 26, R = 6, T = 20, B = 24;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const days = o.days; // [{t, top (m at the steps), moon, today, label}]
  const yMax = Math.max(1.5, Math.ceil(Math.max(...days.map((d) => d.top)) * 2) / 2);
  const X = (i) => L + (W - L - R) * (i + 0.5) / days.length;
  const Y = (d) => T + (H - T - B) * (1 - Math.max(0, d) / yMax);
  for (let d = 0; d <= yMax + 1e-6; d += 0.5) {
    svg.append(el('line', { x1: L, x2: W - R, y1: Y(d), y2: Y(d), stroke: '#e3dccf', 'stroke-width': d % 1 === 0 ? 1 : 0.6 }));
    if (d % 1 === 0) svg.append(el('text', { x: L - 4, y: Y(d) + 3.5, 'text-anchor': 'end', 'font-size': 9, fill: '#5a6b76' }, `${d} m`));
  }
  for (const k of ['wade', 'dip', 'swim']) svg.append(el('line', { x1: L, x2: W - R, y1: Y(o.levels[k]), y2: Y(o.levels[k]), stroke: o.colors[k], 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
  const bw = (W - L - R) / days.length * 0.64;
  days.forEach((d, i) => {
    const h = Math.max(0, d.top);
    svg.append(el('rect', { x: X(i) - bw / 2, y: Y(h), width: bw, height: Math.max(1.2, Y(0) - Y(h)), rx: 1.5, fill: d.today ? '#b5523b' : h >= o.levels.swim ? o.colors.swim : h >= o.levels.dip ? o.colors.dip : h >= o.levels.wade ? o.colors.wade : '#b9b2a6', opacity: d.today ? 0.95 : 0.8 }));
    if (d.moon) svg.append(el('circle', { cx: X(i), cy: 9, r: 5, fill: d.moon === 'full' ? '#f2e6c2' : '#1c2a33', stroke: '#1c2a33', 'stroke-width': 1 }));
    if (d.label) svg.append(el('text', { x: X(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 9.5, fill: d.today ? '#b5523b' : '#5a6b76', 'font-weight': d.today ? 700 : 400 }, d.label));
  });
}

// Fetch rose: how far the wind can blow over open water before reaching the steps, by direction.
export function drawRose(svg, table, levelODM) {
  const W = 300, H = 300, cx = 150, cy = 150, R = 118;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const j = table.levels_odm.reduce((b, z, k) => (Math.abs(z - levelODM) < Math.abs(table.levels_odm[b] - levelODM) ? k : b), 0);
  const rOf = (f) => R * Math.min(1, Math.log10(1 + f / 10) / Math.log10(1 + 6000 / 10));
  for (const f of [100, 1000, 5000]) {
    svg.append(el('circle', { cx, cy, r: rOf(f), fill: 'none', stroke: '#e3dccf' }));
    svg.append(el('text', { x: cx + 3, y: cy - rOf(f) - 2, 'font-size': 9, fill: '#8a979e' }, f >= 1000 ? `${f / 1000} km` : `${f} m`));
  }
  let d = '';
  table.dirs.forEach((dir, i) => {
    const f = table.effective[i][j][0];
    const a = (dir - 90) * Math.PI / 180, r = rOf(f);
    d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  });
  svg.append(el('path', { d: d + 'Z', fill: '#2f8197', opacity: 0.35, stroke: '#1d5f73', 'stroke-width': 1.5 }));
  for (const [lab, dir] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
    const a = (dir - 90) * Math.PI / 180;
    svg.append(el('text', { x: cx + (R + 14) * Math.cos(a), y: cy + (R + 14) * Math.sin(a) + 4, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#0f1d26' }, lab));
  }
  svg.append(el('circle', { cx, cy, r: 3.5, fill: '#b5523b' }));
}

// Datum ladder: every level the page uses, on one vertical scale (m OD Malin).
export function drawDatums(svg, rows) {
  // rows: [{z, label, sub, kind}] kind: 'water' | 'land' | 'datum' | 'range'
  const W = 360, H = 420, T = 14, B = 14, X0 = 66;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const zs = rows.map((r) => r.z), zmax = Math.ceil(Math.max(...zs) + 0.3), zmin = Math.floor(Math.min(...zs) - 0.3);
  const Y = (z) => T + (H - T - B) * (zmax - z) / (zmax - zmin);
  for (let z = zmin; z <= zmax; z += 0.5) {
    svg.append(el('line', { x1: X0 - 6, x2: X0, y1: Y(z), y2: Y(z), stroke: '#9aa7ae' }));
    if (z % 1 === 0) svg.append(el('text', { x: X0 - 10, y: Y(z) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#5a6b76' }, `${z > 0 ? '+' : z < 0 ? '−' : ''}${Math.abs(z)} m`));
  }
  svg.append(el('line', { x1: X0, x2: X0, y1: T, y2: H - B, stroke: '#9aa7ae' }));
  svg.append(el('text', { x: 4, y: T - 2, 'font-size': 9.5, fill: '#5a6b76' }, 'm OD Malin'));
  // water band between the Point's MLWS and MHWS
  const hs = rows.find((r) => r.id === 'mhws'), ls = rows.find((r) => r.id === 'mlws');
  if (hs && ls) svg.append(el('rect', { x: X0 + 1, y: Y(hs.z), width: 34, height: Y(ls.z) - Y(hs.z), fill: '#2f8197', opacity: 0.18 }));
  // labels without overlaps: greedy push-down
  const sorted = [...rows].sort((a, b) => b.z - a.z);
  let lastY = -1e9;
  for (const r of sorted) {
    const y = Y(r.z);
    const ly = Math.max(y, lastY + 23); lastY = ly;
    const col = r.kind === 'water' ? '#1d5f73' : r.kind === 'land' ? '#6e5a45' : r.kind === 'alt' ? '#b5523b' : '#0f1d26';
    svg.append(el('line', { x1: X0, x2: X0 + 40, y1: y, y2: y, stroke: col, 'stroke-width': r.kind === 'land' ? 2.4 : 1.4, 'stroke-dasharray': r.kind === 'alt' ? '3 2' : '' }));
    svg.append(el('line', { x1: X0 + 40, x2: X0 + 50, y1: y, y2: ly - 3, stroke: col, 'stroke-width': 0.8 }));
    svg.append(el('text', { x: X0 + 54, y: ly, 'font-size': 11.5, 'font-weight': 700, fill: col }, `${r.z > 0 ? '+' : r.z < 0 ? '−' : ''}${Math.abs(r.z).toFixed(2)}  ${r.label}`));
    if (r.sub) svg.append(el('text', { x: X0 + 54, y: ly + 11, 'font-size': 9.5, fill: '#5a6b76' }, r.sub));
  }
}
