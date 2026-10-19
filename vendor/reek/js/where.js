// "Can you see it from where you are?" Map + line of sight to the summit, using the same
// elevation tiles as the precompute (fetched straight from AWS for a tapped point).
import { clamp, distBearing, destination, elevAngle, R_EFF, compass, compassWord, fmtInt, esc } from './sky.js';

const TOP = 764, H_TOP = 766, EYE = 1.7, D2R = Math.PI / 180;
const TILE = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const ML = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl';

function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  return new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = ML + '.css'; document.head.appendChild(l);
    const s = document.createElement('script'); s.src = ML + '.js'; s.onload = () => res(window.maplibregl); s.onerror = rej; document.head.appendChild(s);
  });
}

export class Where {
  constructor({ section, mapEl, card, list, geoBtn, places, peaks, viewshed, summit, now }) {
    Object.assign(this, { section, mapEl, card, list, geoBtn, places, viewshed, S: summit, now });
    this.peaks = peaks.peaks.map(([name, ga, h, lat, lon]) => ({ name, ga, h, lat, lon }));
    this.tiles = new Map();
    this.renderList();
    geoBtn.addEventListener('click', () => this.locate());
    new IntersectionObserver((es, ob) => { if (es[0].isIntersecting) { ob.disconnect(); this.initMap(); } }, { rootMargin: '700px' }).observe(section);
  }

  // ------------------------------------------------------------------ map
  async initMap() {
    let maplibregl;
    try { maplibregl = await loadMapLibre(); } catch { return; }
    const S = this.S;
    let map;
    try {
      map = new maplibregl.Map({
        container: this.mapEl, style: 'https://tiles.openfreemap.org/styles/positron', center: [S.lon - 0.12, S.lat + 0.1], zoom: 8.3,
        minZoom: 5, maxZoom: 13, cooperativeGestures: true, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
      });
    } catch { return; } // no WebGL: the list still works
    this.map = map; this.mapEl.classList.add('ready');
    map.touchZoomRotate.disableRotation();
    map.on('load', () => {
      const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
      for (const r of [...this.viewshed.rasters].reverse()) {
        const [w, s, e, n] = r.bounds;
        map.addSource('vs' + r.km, { type: 'image', url: 'data/' + r.file, coordinates: [[w, n], [e, n], [e, s], [w, s]] });
        map.addLayer({ id: 'vs' + r.km, type: 'raster', source: 'vs' + r.km, paint: { 'raster-opacity': 0.42, 'raster-fade-duration': 0 } }, firstSymbol);
      }
      map.addSource('sight', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'sight', type: 'line', source: 'sight', paint: { 'line-color': ['get', 'c'], 'line-width': 2.5, 'line-dasharray': [2, 1.2] } });
      const tri = document.createElement('div'); tri.className = 'mk-summit'; tri.innerHTML = '<svg width="22" height="20" viewBox="0 0 22 20"><path d="M11 1 21 19H1z" fill="#161a1f" stroke="#fff" stroke-width="1.5"/></svg>';
      new maplibregl.Marker({ element: tri, anchor: 'bottom' }).setLngLat([S.lon, S.lat]).addTo(map);
      if (this.pending) { const p = this.pending; this.pending = null; this.show(p); }
    });
    map.on('click', (e) => this.check({ lat: e.lngLat.lat, lon: e.lngLat.lng, name: null }));
    this.Marker = maplibregl.Marker;
  }
  show(r) {
    if (!this.map || !this.map.isStyleLoaded()) { this.pending = r; return; }
    const S = this.S, c = r.visible ? '#c97f12' : '#59636e';
    this.map.getSource('sight').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { c }, geometry: { type: 'LineString', coordinates: [[r.lon, r.lat], [S.lon, S.lat]] } }] });
    if (!this.dot) { const d = document.createElement('div'); d.className = 'mk-you'; this.dot = new this.Marker({ element: d }).setLngLat([r.lon, r.lat]).addTo(this.map); }
    else this.dot.setLngLat([r.lon, r.lat]);
    const b = [[Math.min(r.lon, S.lon), Math.min(r.lat, S.lat)], [Math.max(r.lon, S.lon), Math.max(r.lat, S.lat)]];
    this.map.fitBounds(b, { padding: { top: 50, bottom: 50, left: 40, right: 40 }, maxZoom: 11, duration: 700 });
  }

  // ------------------------------------------------------------------ inputs
  locate() {
    if (!('geolocation' in navigator) || !window.isSecureContext) {
      this.message('Your location needs a secure (https) page and your permission. Tap the map instead, or pick a place below.'); return;
    }
    this.message('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (p) => this.check({ lat: p.coords.latitude, lon: p.coords.longitude, name: 'Where you are' }),
      () => this.message("Couldn't get your location. Tap the map instead, or pick a place below."),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  }
  message(t) { this.card.hidden = false; this.card.innerHTML = `<p>${esc(t)}</p>`; }
  renderList() {
    const groups = {};
    for (const p of this.places.places) (groups[p.group] ||= []).push(p);
    this.list.innerHTML = Object.entries(groups).map(([g, ps]) => `<h4>${esc(g)}</h4>` + ps.map((p, k) =>
      `<button data-name="${esc(p.name)}"><span>${esc(p.name)}</span><span>${p.visible ? `<span class="yes">yes</span> · top ${fmtInt(p.visH)} m` : `no${p.blocker?.name ? ' · behind ' + esc(p.blocker.name) : ''}`}</span></button>`).join('')).join('');
    this.list.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const p = this.places.places.find((x) => x.name === b.dataset.name);
      const r = this.fromPlace(p); this.render(r); this.show(r);
      this.card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
  fromPlace(p) {
    return { name: p.name, lat: p.lat, lon: p.lon, D: p.km * 1000, bearing: p.bearingToReek, ang: p.ang, visible: p.visible, margin: p.margin,
      visH: p.visH, taller: p.taller, blocker: p.blocker ? { ...p.blocker, d: p.blocker.km * 1000 } : null, eye: p.ground + EYE, prof: p.prof };
  }

  // ------------------------------------------------------------------ terrain
  tile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (!this.tiles.has(key)) this.tiles.set(key, new Promise((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, 256, 256).data, e = new Float32Array(65536);
        for (let i = 0; i < 65536; i++) e[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
        res(e);
      };
      img.onerror = () => rej(new Error('tile ' + key)); img.src = TILE(z, x, y);
    }));
    return this.tiles.get(key);
  }
  async sampler(z, pts) {
    const n = 2 ** z * 256, gx = (lon) => (lon + 180) / 360 * n - 0.5;
    const gy = (lat) => { const r = lat * D2R; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n - 0.5; };
    const need = new Set();
    for (const [la, lo] of pts) { const x = gx(lo), y = gy(la); for (const dx of [0, 1]) for (const dy of [0, 1]) need.add(`${Math.floor((x + dx) / 256)},${Math.floor((y + dy) / 256)}`); }
    const T = new Map();
    await Promise.all([...need].map(async (k) => { const [x, y] = k.split(',').map(Number); T.set(k, await this.tile(z, x, y)); }));
    const px = (x, y) => { const t = T.get(`${Math.floor(x / 256)},${Math.floor(y / 256)}`); return t ? t[(((y % 256) + 256) % 256) * 256 + (((x % 256) + 256) % 256)] : 0; };
    return (la, lo) => {
      const x = gx(lo), y = gy(la), ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      return (px(ix, iy) * (1 - fx) + px(ix + 1, iy) * fx) * (1 - fy) + (px(ix, iy + 1) * (1 - fx) + px(ix + 1, iy + 1) * fx) * fy;
    };
  }
  async compute(lat, lon, name) {
    const S = this.S, { dist: D, bearing } = distBearing(lat, lon, S.lat, S.lon);
    const out = { name, lat, lon, D, bearing: (bearing + 360) % 360 };
    if (D < 400) return { ...out, onTop: true };
    if (D > 320000) return { ...out, tooFar: true };
    const z = D < 60000 ? 11 : D < 160000 ? 10 : 9, stepM = { 11: 40, 10: 80, 9: 160 }[z];
    const N = Math.ceil(D / stepM), pts = [];
    for (let k = 0; k <= N; k++) { const d = D * k / N, [la, lo] = destination(lat, lon, bearing, d); pts.push([la, lo, d]); }
    const ring = []; for (let dy = -250; dy <= 250; dy += 25) for (let dx = -250; dx <= 250; dx += 25) { const [a, b] = destination(S.lat, S.lon, 0, dy); ring.push(destination(a, b, 90, dx)); }
    const elev = await this.sampler(z, pts.concat(ring));
    // nudge the summit back up to its surveyed 764 m, exactly as the precompute does
    let demTop = -1e9; for (const [a, b] of ring) demTop = Math.max(demTop, elev(a, b));
    const A = TOP - demTop, cosS = Math.cos(S.lat * D2R);
    const ground = (la, lo) => {
      let e = elev(la, lo); const dy = (la - S.lat) * 111195, dx = (lo - S.lon) * 111195 * cosS, q = Math.sqrt(dx * dx + dy * dy) / 400;
      if (q < 1) e += A * (1 - q) ** 1.6; return Math.max(0, e);
    };
    const es = pts.map(([la, lo]) => ground(la, lo));
    const eye = es[0] + EYE, aT = elevAngle(eye, H_TOP, D);
    let maxA = -90, at = null, maxExt = -90;
    for (let k = 1; k < pts.length; k++) {
      const d = pts[k][2]; if (d < 40 || d > D - 300) continue;
      const a = elevAngle(eye, es[k], d);
      if (a > maxA) { maxA = a; at = { d, e: es[k], lat: pts[k][0], lon: pts[k][1] }; }
      if (d < D - 3000 && a > maxExt) maxExt = a;
    }
    for (const p of this.peaks) { // surveyed summits close to the line
      const pa = distBearing(lat, lon, p.lat, p.lon);
      if (pa.dist < 240 || pa.dist > D - 500) continue;
      const dAz = ((pa.bearing - bearing + 540) % 360) - 180;
      if (Math.abs(dAz) > 60 || Math.abs(Math.sin(dAz * D2R) * pa.dist) > 250) continue;
      const a = elevAngle(eye, p.h, pa.dist);
      if (a > maxA) { maxA = a; at = { d: pa.dist, e: p.h, lat: p.lat, lon: p.lon }; }
      if (pa.dist < D - 3000 && a > maxExt) maxExt = a;
    }
    const line = (a) => (a > -90 ? eye + D * Math.tan(a * D2R) + D * D / (2 * R_EFF) : -Infinity);
    const visible = aT >= maxA, visH = Math.round(Math.min(TOP, TOP - line(maxExt)));
    let blocker = null;
    if (!visible && at) { const np = this.nearestPeak(at.lat, at.lon); blocker = { d: at.d, km: at.d / 1000, h: Math.round(at.e), name: np?.name || null }; }
    const prof = []; for (let k = 0; k <= 160; k++) prof.push(Math.round(es[Math.round(k / 160 * (es.length - 1))]));
    return { ...out, ang: aT, visible, margin: aT - maxA, visH, taller: visible ? 0 : Math.round(line(maxA) - H_TOP), blocker, eye, prof, zoom: z };
  }
  nearestPeak(lat, lon) {
    let best = null, bd = 2000;
    for (const p of this.peaks) { const { dist } = distBearing(lat, lon, p.lat, p.lon); if (dist < bd) { bd = dist; best = p; } }
    return best;
  }
  async check(pt) {
    this.card.hidden = false; this.card.innerHTML = '<p>Working out the line of sight…</p>';
    try {
      const r = await this.compute(pt.lat, pt.lon, pt.name);
      this.render(r); if (!r.onTop) this.show(r);
    } catch (e) {
      this.card.innerHTML = `<p>Couldn't fetch the elevation tiles for that spot (${esc(e.message)}). The list of places below still works.</p>`;
    }
  }

  // ------------------------------------------------------------------ output
  render(r) {
    const c = this.card; c.hidden = false;
    const where = r.name ? esc(r.name) : `${r.lat.toFixed(3)}, ${r.lon.toFixed(3)}`;
    if (r.onTop) { c.innerHTML = `<p class="big">You're on it.</p><p>That's the summit. Look around: the panorama above is your view.</p>`; return; }
    const km = r.D / 1000, kmT = km < 10 ? km.toFixed(1) : fmtInt(km);
    const dir = `${Math.round(r.bearing)}° (${compassWord(r.bearing)})`;
    if (r.tooFar) {
      c.innerHTML = `<p class="big">Too far.</p><p>${where} is ${kmT} km from the Reek. Even from a mountaintop the curve of the Earth puts it out of sight from that far away.</p>`; return;
    }
    const wx = this.now ? this.now() : null;
    const wxLine = wx == null ? '' : wx.v === 2 ? ' And right now the top should be clear.' : wx.v === 1 ? ' Right now the top is coming and going in cloud.' : ' Right now, though, the top is in cloud.';
    let big, body;
    if (r.visible && r.margin < 0.02) { big = 'Only just.'; body = `The line of sight to the summit clears by a whisker. Small errors in the elevation data or the air could tip this either way.`; }
    else if (r.visible) { big = 'Yes, it\'s in view.'; body = r.visH >= TOP - 5 ? `Nothing stands in the way: in clear air you'd see the whole mountain down to the shore.` : `In clear air you'd see the top ${fmtInt(r.visH)} m of it; the rest is behind the ground in between or below the curve of the Earth.`; }
    else {
      big = 'No, it\'s hidden.';
      const b = r.blocker;
      const by = b ? (b.name ? `${esc(b.name)}` : 'a ridge') + (b.d < 1500 ? `, right beside you (${fmtInt(b.d)} m away),` : `, ${b.d / 1000 < 10 ? (b.d / 1000).toFixed(1) : fmtInt(b.d / 1000)} km from you,`) : 'high ground';
      body = `${by.replace(/^./, (s) => s.toUpperCase())} is in the way.` + (r.taller > 0 ? ` The Reek would need to be about ${fmtInt(Math.max(1, r.taller))} m taller to show over it.` : '');
    }
    c.innerHTML = `<p class="big">${big}</p><p class="meta">${where} · the summit is ${kmT} km away, bearing ${dir}${r.ang != null ? `, ${r.ang >= 0 ? r.ang.toFixed(1) + '° up' : Math.abs(r.ang).toFixed(1) + '° down'}` : ''}</p><p>${body}${r.visible ? esc(wxLine) : ''}</p>${this.svg(r)}<p class="fine">Cross-section from you (left) to the summit (right), heights stretched; the ground is bent up by the curve of the Earth so the line of sight is straight. Eye height 1.7 m, standard refraction${r.zoom ? `, elevation tiles at ${['~45', '~90', '~180'][11 - r.zoom]} m` : ''}.</p>`;
  }
  svg(r) {
    const W = 340, H = 150, L = 6, R = 6, T = 14, B = 18, D = r.D, n = r.prof.length - 1;
    const bulge = (d) => d * (D - d) / (2 * R_EFF);
    const ys = r.prof.map((e, k) => e + bulge(D * k / n));
    const lo = Math.min(0, ...ys), hi = Math.max(H_TOP, r.eye, ...ys) * 1.06;
    const X = (d) => L + (W - L - R) * d / D, Y = (h) => T + (H - T - B) * (1 - (h - lo) / (hi - lo));
    const ground = ys.map((h, k) => `${X(D * k / n).toFixed(1)},${Y(h).toFixed(1)}`).join(' ');
    const sea = `M${X(0)},${Y(bulge(0))} ` + Array.from({ length: 41 }, (_, k) => `L${X(D * k / 40).toFixed(1)},${Y(bulge(D * k / 40)).toFixed(1)}`).join(' ');
    const c = r.visible ? '#c97f12' : '#59636e', b = r.blocker;
    const mid = bulge(D / 2);
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line of sight cross-section">
      <path d="${sea} L${X(D)},${H} L${X(0)},${H} Z" fill="#c9d8e2"/>
      <polygon points="${X(0)},${H} ${ground} ${X(D)},${H}" fill="#8b9a83"/>
      <line x1="${X(0)}" y1="${Y(r.eye)}" x2="${X(D)}" y2="${Y(H_TOP)}" stroke="${c}" stroke-width="2" ${r.visible ? '' : 'stroke-dasharray="5 3"'}/>
      ${b ? `<circle cx="${X(b.d)}" cy="${Y(b.h + bulge(b.d))}" r="4" fill="#b8402f"/>` : ''}
      <circle cx="${X(0)}" cy="${Y(r.eye)}" r="3.5" fill="#161a1f"/>
      <text x="${X(0) + 2}" y="${H - 5}" font-size="10" fill="#3b4047">you</text>
      <text x="${X(D) - 2}" y="${T - 3}" font-size="10" fill="#3b4047" text-anchor="end">the Reek, 764 m</text>
      ${mid > 3 ? `<text x="${X(D / 2)}" y="${H - 5}" font-size="9.5" fill="#5d646d" text-anchor="middle">Earth's curve: +${fmtInt(mid)} m mid-way</text>` : ''}
    </svg>`;
  }
}
