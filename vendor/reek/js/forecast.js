// Middle layer for the weather: 72-hour cloud-base chart, best spells this week, the climb card,
// and the model-by-model table in "How we work this out".
import { clamp, hm, dayName, dayKey, compass, fmtInt, esc } from './sky.js';
import { TOP, MODELS, clearRuns, trimToDaylight } from './weather.js';

const VWORD = ['No', 'Partly', 'Yes'];
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

export function baseText(h) {
  if (h.base == null) return 'no data';
  if (h.base >= 2500) return 'no low cloud';
  return `cloud base ~${fmtInt(Math.round(h.base / 50) * 50)} m`;
}

export function drawChart(svg, readout, an, i0, onPick) {
  const hours = an.hours.slice(i0, i0 + 72).filter((h) => h.v != null);
  if (!hours.length) { readout.textContent = 'No forecast data.'; return; }
  const W = svg.clientWidth || 360, H = 210, L = 30, R = 6, T = 8, B = 34;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = '';
  const n = hours.length, cw = (W - L - R) / n, MAXZ = 2000;
  const x = (k) => L + k * cw, y = (z) => T + (H - T - B) * (1 - clamp(z, 0, MAXZ) / MAXZ);
  // night
  hours.forEach((h, k) => { if (!h.day) el('rect', { x: x(k), y: T, width: cw + 0.6, height: H - T - B, fill: '#1d2733', opacity: 0.09 }, svg); });
  // cloud: from the estimated base up, shaded by how much low cloud the models carry
  hours.forEach((h, k) => {
    if (h.base == null || h.base >= MAXZ) return;
    const cover = clamp((h.low ?? 50) / 100, 0, 1);
    if (h.v === 2 && cover < 0.2) return;
    el('rect', { x: x(k), y: T, width: cw + 0.6, height: y(h.base) - T, fill: '#7d8893', opacity: (0.18 + 0.6 * Math.max(cover, h.v === 0 ? 0.7 : 0)).toFixed(2) }, svg);
  });
  // rain
  hours.forEach((h, k) => { const p = h.precip ?? 0; if (p >= 0.1) el('rect', { x: x(k) + cw * 0.15, y: H - B - Math.min(26, p * 10), width: cw * 0.7, height: Math.min(26, p * 10), fill: '#3c7fb8', opacity: 0.75 }, svg); });
  // axes: heights
  for (const z of [0, 500, 1000, 1500, 2000]) {
    el('line', { x1: L, x2: W - R, y1: y(z), y2: y(z), stroke: '#c9c2b5', 'stroke-width': 0.6 }, svg);
    const t = el('text', { x: L - 4, y: y(z) + 3.5, 'text-anchor': 'end', 'font-size': 9.5, fill: '#7a7f86' }, svg); t.textContent = z === 0 ? '0' : (z / 1000) + 'k';
  }
  // the summit
  el('line', { x1: L, x2: W - R, y1: y(TOP), y2: y(TOP), stroke: '#161a1f', 'stroke-width': 1.4, 'stroke-dasharray': '5 3' }, svg);
  const tl = el('text', { x: L + 4, y: y(TOP) - 4, 'font-size': 10, 'font-weight': 600, fill: '#161a1f' }, svg); tl.textContent = 'summit 764 m';
  // verdict band
  hours.forEach((h, k) => el('rect', { x: x(k), y: H - B + 4, width: cw + 0.6, height: 9, fill: ['#59636e', '#9fb2c4', '#e9a23b'][h.v], opacity: h.day ? 1 : 0.4 }, svg));
  // day labels at local midnight
  let prev = null;
  hours.forEach((h, k) => {
    const d = dayKey(h.t);
    if (d !== prev) {
      if (prev !== null) el('line', { x1: x(k), x2: x(k), y1: T, y2: H - B + 13, stroke: '#9a9488', 'stroke-width': 0.8 }, svg);
      const lbl = el('text', { x: x(k) + 3, y: H - 8, 'font-size': 11, 'font-weight': 600, fill: '#3b4047' }, svg);
      lbl.textContent = k === 0 ? 'Now' : dayName(h.t + 1).replace(/^./, (c) => c.toUpperCase());
      prev = d;
    }
  });
  const cursor = el('line', { x1: x(0), x2: x(0), y1: T, y2: H - B + 13, stroke: '#e9a23b', 'stroke-width': 2 }, svg);
  const pick = (k) => {
    k = clamp(k, 0, n - 1); const h = hours[k];
    cursor.setAttribute('x1', x(k) + cw / 2); cursor.setAttribute('x2', x(k) + cw / 2);
    readout.innerHTML = hourLine(h, k === 0);
    if (onPick) onPick(h);
  };
  const at = (ev) => { const r = svg.getBoundingClientRect(); return Math.floor(((ev.clientX - r.left) * (W / r.width) - L) / cw); };
  svg.onpointerdown = (ev) => { pick(at(ev)); svg.setPointerCapture?.(ev.pointerId); };
  svg.onpointermove = (ev) => { if (ev.buttons || ev.pointerType === 'mouse') pick(at(ev)); };
  pick(0);
}

export function hourLine(h, isNow) {
  const when = isNow ? 'Right now' : `${dayName(h.t).replace(/^./, (c) => c.toUpperCase())} ${hm(h.t)}`;
  const wind = h.wind != null ? `, wind on top ${Math.round(h.wind)} km/h${h.dir != null ? ' from the ' + compass(h.dir) : ''}` : '';
  const agree = h.agree ? 'all three models agree' : `the models split ${h.models.map((m) => VWORD[m.v].toLowerCase()).join(' / ')}`;
  return `<b>${when}</b> <span class="v v-${h.v}">${VWORD[h.v]}</span> ${baseText(h)}${wind}${(h.precip ?? 0) >= 0.1 ? `, rain ${h.precip.toFixed(1)} mm/h` : ''}.<br><span style="color:#5d646d">${h.day ? '' : 'Dark. '}${agree.replace(/^./, (c) => c.toUpperCase())}.</span>`;
}

export function bestWindows(ol, an, i0) {
  const runs = clearRuns(an.hours, i0, an.hours.length).filter((r) => r.len >= 2).map((r) => trimToDaylight(an, r));
  const top = runs.map((r) => ({ ...r, score: r.len * (0.5 + r.sure) })).sort((a, b) => b.score - a.score || a.start - b.start).slice(0, 3)
    .sort((a, b) => a.start - b.start);
  ol.innerHTML = top.length ? top.map((r) => `<li><span class="when">${esc(dayName(r.start, undefined, true).replace(/^./, (c) => c.toUpperCase()))} ${hm(r.start)}&ndash;${hm(r.end)}</span><span class="meta">${Math.max(1, Math.round((r.end - r.start) / 3600))} h${r.sure >= 0.99 ? ' · sure' : r.sure >= 0.5 ? ' · fairly sure' : ' · models split'}</span></li>`).join('')
    : '<li class="none">No clear daylight spell of two hours or more in the forecast. It happens.</li>';
}

const windSay = (w) => w == null ? '' :
  w < 15 ? 'Close to calm on top, which is rarer than you would think.'
    : w < 30 ? 'A breeze on top. You will want a layer at the chapel.'
      : w < 45 ? 'Windy on top: properly cold at the summit and you will feel it on the cone.'
        : w < 65 ? 'Very windy on top: hard going on the scree, and hard to stand still at the chapel.'
          : 'Gale-force on top. A day for looking at it from the Quay.';
const chill = (t, v) => (t <= 10 && v >= 5 ? 13.12 + 0.6215 * t - 11.37 * v ** 0.16 + 0.3965 * t * v ** 0.16 : t);

export function climbCard(div, an, i0) {
  const h = an.hours[i0];
  const next = an.hours.slice(i0, i0 + 6).filter((x) => x.v != null);
  const rain6 = next.reduce((s, x) => s + (x.precip ?? 0), 0);
  const now = Date.now() / 1000, day = an.daily.find((d) => dayKey(d.t) === dayKey(now)), tom = an.daily.find((d) => d.rise > now);
  let light = 0, lightK = 'Daylight left', lightD = '';
  if (day && now < day.rise) { light = (day.set - day.rise) / 3600; lightK = 'Daylight today'; lightD = `sunrise ${hm(day.rise)}, sunset ${hm(day.set)}`; }
  else if (day && now < day.set) { light = (day.set - now) / 3600; lightD = `sunset ${hm(day.set)}`; }
  else if (tom) { lightK = 'Dark now'; lightD = `sunrise ${dayName(tom.rise)} ${hm(tom.rise)}`; }
  const lh = Math.floor(light), lm = Math.round((light - lh) * 60);
  const fz = h.freeze;
  div.innerHTML = `
    <div class="stat"><div class="k">Wind on top</div><div class="n">${h.wind != null ? Math.round(h.wind) : '–'} <small>km/h${h.dir != null ? ' ' + compass(h.dir) : ''}</small></div><div class="d">at summit height, before gusts</div></div>
    <div class="stat"><div class="k">On top it's about</div><div class="n">${h.tTop != null ? Math.round(h.tTop) : '–'}° <small>feels ${h.tTop != null && h.wind != null ? Math.round(chill(h.tTop, h.wind)) + '°' : '–'}</small></div><div class="d">${fz == null ? 'freezing level above 3 km' : fz <= TOP + 30 ? '<b>at or below freezing</b>: ice on the rocks is likely' : `freezing level ~${fmtInt(Math.round(fz / 100) * 100)} m`}</div></div>
    <div class="stat"><div class="k">Rain, next 6 hours</div><div class="n">${rain6 < 0.1 ? 'dry' : rain6.toFixed(1)} <small>${rain6 < 0.1 ? '' : 'mm'}</small></div><div class="d">${rain6 >= 3 ? 'the scree gets slippery' : rain6 >= 0.5 ? 'showery' : 'nothing much forecast'}</div></div>
    <div class="stat"><div class="k">${lightK}</div><div class="n">${light > 0 ? `${lh} h <small>${lm} min</small>` : '–'}</div><div class="d">${lightD}. Most people take 3 to 4 hours up and down<sup><a class="ref" href="#src-discover"></a></sup></div></div>
    <p class="say">${esc(windSay(h.wind))}</p>`;
}

export function howTable(div, an, i0) {
  const h = an.hours[i0];
  const row = (name, m) => `<tr><td>${name.replace('UK Met Office', 'Met Office').replace('DWD ICON', 'ICON')}</td><td><span class="v v-${m.v}">${VWORD[m.v]}</span></td><td>${m.base >= 2500 ? '&gt;2,500' : fmtInt(Math.round(m.base / 10) * 10)}</td><td>${Math.round(m.rhTop)}%</td><td>${m.wind != null ? Math.round(m.wind) : '–'}</td><td>${(m.precip ?? 0).toFixed(1)}</td></tr>`;
  div.innerHTML = `<table><thead><tr><th>This hour</th><th></th><th>Base, m</th><th>Humidity on top</th><th>Wind</th><th>Rain</th></tr></thead><tbody>
    ${h.models.map((m) => row(MODELS.find((x) => x.id === m.id).name, m)).join('')}
    <tr><td><b>Vote</b></td><td><span class="v v-${h.v}">${VWORD[h.v]}</span></td><td>${h.base >= 2500 ? '&gt;2,500' : fmtInt(Math.round(h.base / 10) * 10)}</td><td>${Math.round(h.rhTop)}%</td><td>${h.wind != null ? Math.round(h.wind) : '–'}</td><td>${(h.precip ?? 0).toFixed(1)}</td></tr>
    </tbody></table><p class="fine">Wind in km/h at summit height, rain in mm an hour. Base is where air lifted over the top would condense, or the lowest near-saturated layer if that is lower. Visibility at Murrisk: ${h.foot?.vis != null ? fmtInt(h.foot.vis / 1000) + ' km' : 'n/a'}.</p>`;
}
