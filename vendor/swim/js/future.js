// "The same steps in 2050 and 2100": IPCC AR6 sea-level projections for the grid cell off
// Westport (NASA Sea Level Projection Tool, 53N 10W), added to today's tide model.
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}, t) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (t != null) e.textContent = t; return e; };
export const SCEN = { ssp126: { key: 'ssp126_medium', name: 'low emissions', code: 'SSP1-2.6' }, ssp585: { key: 'ssp585_medium', name: 'high emissions', code: 'SSP5-8.5' } };

export function makeFuture(slr, fut, baseYear = 2026) {
  const yrs = slr.years;
  const at = (arr, y) => { const i = yrs.findIndex((v) => v >= y); if (i <= 0) return arr[0]; const f = (y - yrs[i - 1]) / (yrs[i] - yrs[i - 1]); return arr[i - 1] + f * (arr[i] - arr[i - 1]); };
  // metres of rise from today (baseYear) to `year`, for percentile p ('17', '50', '83')
  const offset = (year, scen, p = '50') => { const T = slr.total[SCEN[scen].key]; return at(T[p], year) - at(T[p], baseYear); };
  const hours = (off, level = 'swim') => {
    const x = Math.max(0, Math.min(1.5, off)) / 0.05, i = Math.floor(x), f = x - i, h = fut.hours[level];
    return h[i] + f * (h[Math.min(i + 1, h.length - 1)] - h[i]);
  };
  const topTides = (off) => { const x = Math.max(0, Math.min(1.5, off)) / 0.05, i = Math.floor(x), f = x - i, h = fut.top_tides; return h[i] + f * (h[Math.min(i + 1, h.length - 1)] - h[i]); };
  return { offset, hours, topTides, now: fut.now };
}

// swim hours a year: today, and 2050/2100 under the two scenarios (median, with the likely range)
export function drawFutureChart(svg, F) {
  const W = 360, H = 240, L = 46, R = 10, T = 28, B = 40;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  const cols = [
    { lab: 'now', sub: '2026', v: F.now.swim },
    { lab: '2050', sub: 'low', scen: 'ssp126', y: 2050 }, { lab: '2050', sub: 'high', scen: 'ssp585', y: 2050 },
    { lab: '2100', sub: 'low', scen: 'ssp126', y: 2100 }, { lab: '2100', sub: 'high', scen: 'ssp585', y: 2100 },
  ];
  for (const c of cols) if (c.scen) { c.v = F.hours(F.offset(c.y, c.scen, '50')); c.lo = F.hours(F.offset(c.y, c.scen, '17')); c.hi = F.hours(F.offset(c.y, c.scen, '83')); }
  const vmax = Math.ceil(Math.max(...cols.map((c) => c.hi ?? c.v)) / 250) * 250;
  const Y = (v) => T + (H - T - B) * (1 - v / vmax);
  for (let v = 0; v <= vmax; v += 250) {
    svg.append(el('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: '#e3dccf' }));
    svg.append(el('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#5a6b76' }, String(v)));
  }
  svg.append(el('text', { x: 4, y: 11, 'font-size': 9.5, fill: '#5a6b76' }, 'hours a year with 1 m+ at the steps'));
  const bw = (W - L - R) / cols.length;
  cols.forEach((c, i) => {
    const x = L + i * bw + bw * 0.2, w = bw * 0.6;
    const col = c.scen === 'ssp585' ? '#b5523b' : c.scen === 'ssp126' ? '#2f8197' : '#0f1d26';
    svg.append(el('rect', { x, y: Y(c.v), width: w, height: Y(0) - Y(c.v), rx: 3, fill: col, opacity: 0.8 }));
    if (c.lo != null) {
      const cx = x + w / 2;
      svg.append(el('line', { x1: cx, x2: cx, y1: Y(c.lo), y2: Y(c.hi), stroke: '#0f1d26', 'stroke-width': 1.4 }));
      svg.append(el('line', { x1: cx - 6, x2: cx + 6, y1: Y(c.hi), y2: Y(c.hi), stroke: '#0f1d26', 'stroke-width': 1.4 }));
      svg.append(el('line', { x1: cx - 6, x2: cx + 6, y1: Y(c.lo), y2: Y(c.lo), stroke: '#0f1d26', 'stroke-width': 1.4 }));
    }
    svg.append(el('text', { x: x + w / 2, y: Y(c.v) - 6 - (c.hi != null ? Math.max(0, Y(c.v) - Y(c.hi)) : 0), 'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 700, fill: '#0f1d26' }, String(Math.round(c.v / 10) * 10)));
    svg.append(el('text', { x: x + w / 2, y: H - 22, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#0f1d26' }, c.lab));
    svg.append(el('text', { x: x + w / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 10, fill: col }, c.sub));
  });
  return cols;
}

// OPW coastal flood extents on the LiDAR map of the Point
export function drawFloodMap(svg, map, flood) {
  svg.replaceChildren();
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('') + 'Z';
  const layer = (polys, attrs) => { if (!polys) return; const d = polys.map(path).join(''); svg.append(el('path', { d, 'fill-rule': 'evenodd', ...attrs })); };
  layer(flood.layers.hefs_0200, { fill: '#b5523b', 'fill-opacity': 0.18, stroke: '#b5523b', 'stroke-width': 1, 'stroke-dasharray': '3 2' });
  layer(flood.layers.current_0200, { fill: '#2a7fb8', 'fill-opacity': 0.32, stroke: '#1d5f73', 'stroke-width': 0.8 });
  layer(flood.layers.current_0010, { fill: '#1d5f73', 'fill-opacity': 0.35, stroke: 'none' });
  for (const r of map.ways.roads) svg.append(el('path', { d: r.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(''), fill: 'none', stroke: '#fbf8f1', 'stroke-width': 1.6, opacity: 0.9 }));
  const [sx, sy] = map.swim;
  svg.append(el('circle', { cx: sx, cy: sy, r: 4, fill: '#b5523b', stroke: '#fff', 'stroke-width': 1.5 }));
  svg.append(el('text', { x: sx - 10, y: sy - 8, 'text-anchor': 'end', 'font-size': 11, 'font-weight': 700, fill: '#b5523b' }, 'the steps'));
}
