// Tide tables for a tide-swim place, as HTML. Isomorphic: the build runs it in Node against the
// vendored app's own tide modules; in the browser, the page re-runs it if the built tables are from
// an earlier day (say the daily build failed). Same code, same numbers, both ways.
//
// All heights in metres OD Malin at the place (the app's datum); times in Irish time.

export async function loadModules(appJsBase) {
  const [point, util] = await Promise.all([import(appJsBase + 'point.js'), import(appJsBase + 'util.js')]);
  return { point, util };
}

const MINUS = '−';
const sgnH = (x) => `${x < -0.004 ? MINUS : '+'}${Math.abs(x).toFixed(1)}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Wall-clock offset from UTC in hours at instant t (Europe/Dublin: 0 in winter, 1 in summer).
function utcOffsetH(util, t) { const p = util.localParts(t); return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(t / 60000) * 60000) / 3600000); }

const MOON = [[0, 'new moon'], [90, 'first quarter'], [180, 'full moon'], [270, 'last quarter']];
function moonEvent(util, t0, t1) {
  // a quarter crossed during the day (moonPhase: elongation 0..360, rising)
  const step = 3 * 3600000;
  let a = util.moonPhase(t0);
  for (let t = t0 + step; t <= t1 + 1; t += step) {
    const b = util.moonPhase(Math.min(t, t1));
    for (const [deg, name] of MOON) {
      const crossed = deg === 0 ? b < a : a < deg && b >= deg;
      if (crossed) return name;
    }
    a = b;
  }
  return null;
}
function moonAge(util, t) { // days since new moon, roughly (synodic month 29.53 d)
  return (util.moonPhase(t) / 360) * 29.53;
}

// One day of tides: extremes, range, springs/neaps, the moon, light, and the depth windows at the spot.
export function computeDays(mods, o) {
  const { point, util } = mods;
  const pt = point.makePoint(o.model, o.P);
  const out = [];
  let d0 = util.localMidnight(o.from);
  for (let k = 0; k < o.n + 1; k++) {
    const t0 = d0, mid = t0 + 12 * 3600000, t1 = util.localMidnight(t0 + 36 * 3600000);
    const ext = pt.extremes(t0, t1 - 1).map((e) => ({ t: e.t, h: e.h, high: e.high, spring: e.spring, depth: e.h - o.P.bed.best }));
    const hws = ext.filter((e) => e.high), lws = ext.filter((e) => !e.high);
    const range = hws.length && lws.length ? Math.max(...hws.map((e) => e.h)) - Math.min(...lws.map((e) => e.h)) : null;
    const sw = hws.length ? hws.reduce((s, e) => s + e.spring, 0) / hws.length : 0.5;
    const sun = util.sunCrossings(t0, o.lat, o.lon, -0.833), civil = util.sunCrossings(t0, o.lat, o.lon, -6);
    const win = {};
    for (const [name, need] of Object.entries(o.levels)) {
      win[name] = point.windows(pt, t0, t1, need).map((w) => {
        const alt = util.sunPosition((w.start + w.end) / 2, o.lat, o.lon).alt;
        let peak = 0; for (let t = w.start; t <= w.end; t += 5 * 60000) peak = Math.max(peak, pt.depth(t));
        return { start: w.start, end: w.end, peak, light: alt >= 0 ? 'day' : alt >= -6 ? 'twilight' : 'dark' };
      });
    }
    const lp = util.localParts(mid);
    out.push({ key: `${lp.y}-${String(lp.mo).padStart(2, '0')}-${String(lp.d).padStart(2, '0')}`, t0, t1, mid, ext, range, sw, moon: moonEvent(util, t0, t1), moonAge: moonAge(util, mid), sun, civil,
      offset0: utcOffsetH(util, t0 + 60000), offset1: utcOffsetH(util, t1 - 60000), win });
    d0 = t1;
  }
  // springs and neaps: from the spring weight of each day's high waters, and which way it is heading
  out.forEach((d, i) => {
    const next = out[Math.min(i + 1, out.length - 1)], prev = out[Math.max(i - 1, 0)];
    const trend = (next.sw - prev.sw);
    d.tides = d.sw >= 0.8 ? 'springs' : d.sw <= 0.2 ? 'neaps' : trend > 0 ? 'building' : 'easing';
  });
  return out.slice(0, o.n);
}

export const TIDE_WORDS = {
  springs: ['springs', (r) => `Spring tides, with a range of ${r} m.`],
  neaps: ['neaps', (r) => `Neap tides, with a range of only ${r} m.`],
  building: ['building', (r) => `The tides are building towards springs (range ${r} m).`],
  easing: ['easing', (r) => `The tides are easing off towards neaps (range ${r} m).`],
};

const DF = (o, t) => new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', ...o }).format(new Date(t)).replace(/,/g, '');
export function fmt(util) {
  return {
    hm: util.hm,
    day: (t) => DF({ weekday: 'short', day: 'numeric', month: 'short' }, t),
    long: (t) => DF({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, t),
    longNoYear: (t) => DF({ weekday: 'long', day: 'numeric', month: 'long' }, t),
  };
}
const zone = (h) => (h === 1 ? 'IST' : 'GMT');
const dur = (ms) => { const m = Math.round(ms / 60000), h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };

// "High water at 02:10 (+0.6 m) and 14:42 (+0.8 m); low water at …"
function extremesSentence(F, d) {
  const part = (hi) => { const xs = d.ext.filter((e) => e.high === hi); return xs.length ? `${hi ? 'high' : 'low'} water at ${xs.map((e) => `${F.hm(e.t)} (${sgnH(e.h)} m)`).join(' and ')}` : ''; };
  return [part(true), part(false)].filter(Boolean).join(', ');
}

function clockNote(d) {
  if (d.offset0 === d.offset1) return '';
  return d.offset1 < d.offset0 ? ' The clocks go back an hour at 02:00; times after that are GMT.' : ' The clocks go forward an hour at 01:00; times after that are IST.';
}

// The spot, in a sentence: does high water reach the steps today, and when is there a swim?
export function spotSentence(F, d, o) {
  const best = (name) => d.win[name] || [];
  const s = best('swim'), dip = best('dip'), wade = best('wade');
  const where = o.spotShort;
  const light = (w) => (w.light === 'day' ? '' : w.light === 'twilight' ? ', in twilight' : ', in the dark');
  if (s.length) return `At ${where}, there is swimming depth (a metre or more at the foot of the steps) ${s.map((w) => `${F.hm(w.start)}–${F.hm(w.end)}${light(w)}`).join(' and ')}.`;
  if (dip.length) return `At ${where}, high water gives dipping depth (${o.levels.dip} m or more) ${dip.map((w) => `${F.hm(w.start)}–${F.hm(w.end)}${light(w)}`).join(' and ')}, but not a swim.`;
  if (wade.length) return `At ${where}, high water only gets to wading depth at the steps (${wade.map((w) => F.hm(w.start)).join(', ')}).`;
  const hwMax = Math.max(...d.ext.filter((e) => e.high).map((e) => e.depth));
  return hwMax > 0.02 ? `At ${where}, high water barely covers the foot of the steps.` : `At ${where}, high water doesn't reach the foot of the steps.`;
}

export function todaySentence(F, d, o) {
  return `${cap(extremesSentence(F, d))}.${clockNote(d)} ${d.range != null ? TIDE_WORDS[d.tides][1](d.range.toFixed(1)) : ''}`.trim();
}

// Next-n-days table: one row per day, high and low water with heights.
export function weekTable(F, days, o) {
  const cell = (d, hi) => d.ext.filter((e) => e.high === hi).map((e) => `<span class="t">${F.hm(e.t)}</span> <span class="h">${sgnH(e.h)}</span>`).join('<br>') || '–';
  const link = (d) => { const h = o.dayHref && o.dayHref(d); return h ? `<a href="${h}">${esc(F.day(d.mid))}</a>` : esc(F.day(d.mid)); };
  const rows = days.map((d, i) => `<tr${i === 0 && o.markToday ? ' class="today"' : ''}><th scope="row">${link(d)}<span class="tw">${TIDE_WORDS[d.tides][0]}${d.moon ? ` · ${d.moon}` : ''}</span></th><td>${cell(d, true)}</td><td>${cell(d, false)}</td><td class="r">${d.range != null ? d.range.toFixed(1) + ' m' : '–'}</td></tr>`).join('');
  return `<table class="tt week"${o.id ? ` id="${o.id}"` : ''}><caption>${esc(o.caption)}</caption><thead><tr><th scope="col">Day</th><th scope="col">High water</th><th scope="col">Low water</th><th scope="col" class="r">Range</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// One day in full: each high and low water with its height and the depth at the steps.
export function dayTable(F, d, o) {
  const rows = d.ext.map((e) => {
    const at = e.depth > 0.02 ? `${e.depth.toFixed(1)} m` : e.high ? 'short of the steps' : 'dry';
    return `<tr><th scope="row">${e.high ? 'High water' : 'Low water'}</th><td class="t">${F.hm(e.t)}</td><td class="h">${sgnH(e.h)} m</td><td>${at}</td></tr>`;
  }).join('');
  return `<table class="tt day"><caption>${esc(o.caption)}</caption><thead><tr><th scope="col">Tide</th><th scope="col">Time${d.offset0 === d.offset1 ? ` (${zone(d.offset0)})` : ''}</th><th scope="col">Height</th><th scope="col">At the steps</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function windowsList(F, d, o) {
  const rows = Object.entries(o.levels).map(([name, need]) => {
    const ws = d.win[name] || [];
    const txt = ws.length ? ws.map((w) => `${F.hm(w.start)}–${F.hm(w.end)} <span class="small">(${dur(w.end - w.start)}, up to ${w.peak.toFixed(1)} m${w.light === 'day' ? '' : w.light === 'twilight' ? ', twilight' : ', dark'})</span>`).join('<br>') : '<span class="small">not today</span>';
    return `<li><span><b>${cap(name)}</b> <span class="small">${need} m+</span></span><span class="meta">${txt}</span></li>`;
  }).join('');
  return `<ul class="windows lw">${rows}</ul>`;
}

export function lightLine(F, d) {
  const bits = [];
  if (d.sun.rise && d.sun.set) bits.push(`Sunrise ${F.hm(d.sun.rise)}, sunset ${F.hm(d.sun.set)}`);
  if (d.civil.rise && d.civil.set) bits.push(`first light ${F.hm(d.civil.rise)}, last light ${F.hm(d.civil.set)}`);
  const moon = d.moon ? cap(d.moon) + ' today' : `Moon about ${Math.round(d.moonAge)} days old`;
  return `${bits.join('; ')}. ${moon}.`;
}

// The block that goes at the top of the place page (and is re-rendered in the browser when stale).
export function placeTidesBlock(mods, o) {
  const F = fmt(mods.util);
  const days = computeDays(mods, { ...o, n: o.days });
  const d = days[0];
  const wk = weekTable(F, days, { caption: `${o.placeName}: high and low water, ${F.day(days[0].mid)} to ${F.day(days[days.length - 1].mid)}. Heights in metres above OD Malin.`, dayHref: o.dayHref, markToday: true, id: 'tideWeek' });
  return {
    days,
    html: `<p class="lede" id="tideToday"><b>${esc(cap(F.longNoYear(d.mid)))}:</b> ${esc(todaySentence(F, d, o))} ${esc(spotSentence(F, d, o))}</p>${wk}`,
  };
}
