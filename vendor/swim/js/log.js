// The dip log, kept on this phone (localStorage) and nowhere else.
// One tap "I'm in" logs a swim with the page's own numbers for that moment (predicted level and
// depth, water temperature, wind, chop). One optional question, "where was the water?", turns
// it into a sighting: the step it reached implies a water level, and the gap between that and
// the prediction is what the "check the model" correction is made of.
import { hm, dateLabel, localParts, fromLocal, localMidnight, esc, m1, sgn } from './util.js';

const KEY = 'swim:dips', OLD = 'swim:obs', CAL = 'swim:cal';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* private mode or full */ } };
export const readCal = () => { try { return JSON.parse(localStorage.getItem(CAL) || 'null'); } catch { return null; } };
export const writeCal = (c) => { try { if (c) localStorage.setItem(CAL, JSON.stringify(c)); else localStorage.removeItem(CAL); } catch { /* ignore */ } };
const newId = (t) => 'd' + Math.round(t / 1000).toString(36) + Math.random().toString(36).slice(2, 6);

// one-time move of round-1 "check the model" observations into the log
export function migrate() {
  try {
    const old = JSON.parse(localStorage.getItem(OLD) || 'null');
    if (!old || !old.length) return;
    const a = read();
    for (const o of old) a.push({ id: newId(o.t), t: o.t, src: 'check', level: o.pred, obs: o.level, diff: o.diff, where: { kind: 'text', text: o.what } });
    write(a.sort((x, y) => x.t - y.t)); localStorage.removeItem(OLD);
  } catch { /* ignore */ }
}

export const all = () => read().sort((a, b) => a.t - b.t);
export function add(entry) { const a = read(); const e = { id: newId(entry.t), ...entry }; a.push(e); write(a); return e; }
export function update(id, patch) { const a = read(); const i = a.findIndex((e) => e.id === id); if (i >= 0) { a[i] = { ...a[i], ...patch }; write(a); return a[i]; } return null; }
export function remove(id) { write(read().filter((e) => e.id !== id)); }
export function clear() { write([]); }

// water level implied by "where was the water?", from the page's picture of the steps (P0: uncorrected)
export function implied(where, P0) {
  if (!where) return null;
  const rise = (P0.top - P0.steps.bottom) / P0.steps.count;
  if (where.kind === 'platform') return P0.top;
  if (where.kind === 'step') return P0.top - Math.max(1, Math.min(P0.steps.count, where.n)) * rise;
  if (where.kind === 'foot') return P0.bed.best;
  if (where.kind === 'body') return P0.bed.best + where.frac * where.h;
  return null; // 'below' is a bound, not a level
}
export function describeWhere(w, P0) {
  if (!w) return '';
  if (w.kind === 'platform') return 'water at the platform edge';
  if (w.kind === 'step') return `water at step ${w.n} of ${P0.steps.count}`;
  if (w.kind === 'below') return 'water below the steps';
  if (w.kind === 'foot') return "water's edge at the foot of the steps";
  if (w.kind === 'body') return `${w.part}-deep at the foot (${Math.round(w.h * 100)} cm tall)`;
  if (w.kind === 'text') return w.text;
  return '';
}

// sightings: entries with an implied level; 'below the steps' kept separately as a bound
export function calibration(entries) {
  const s = entries.filter((e) => Number.isFinite(e.diff));
  const below = entries.filter((e) => e.where && e.where.kind === 'below');
  if (!s.length) return { n: 0, below: below.length };
  const mean = s.reduce((q, e) => q + e.diff, 0) / s.length;
  const sd = s.length > 1 ? Math.sqrt(s.reduce((q, e) => q + (e.diff - mean) ** 2, 0) / (s.length - 1)) : null;
  return { n: s.length, mean, sd, below: below.length };
}

const dayKeyL = (t) => { const p = localParts(t); return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
export function stats(entries, now) {
  const dips = entries.filter((e) => e.src === 'dip');
  const y = localParts(now).y;
  const thisYear = dips.filter((e) => localParts(e.t).y === y);
  const days = new Set(dips.map((e) => dayKeyL(e.t)));
  // current streak: consecutive days ending today (or yesterday, so a morning check doesn't break it)
  let streak = 0, d = localMidnight(now) + 12 * 3600000;
  if (!days.has(dayKeyL(d))) d -= 86400000;
  while (days.has(dayKeyL(d))) { streak++; d -= 86400000; }
  // longest streak
  const sorted = [...days].sort(); let best = 0, run = 0, prev = null;
  for (const k of sorted) {
    const t = fromLocal(+k.slice(0, 4), +k.slice(5, 7), +k.slice(8, 10), 12);
    run = prev != null && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = t;
  }
  const withT = dips.filter((e) => Number.isFinite(e.sst));
  const coldest = withT.length ? withT.reduce((a, b) => (b.sst < a.sst ? b : a)) : null;
  return { total: dips.length, year: thisYear.length, yearN: y, streak, best, coldest, days: days.size };
}

// colour for a water temperature: cold blues to summer gold
export function tempColour(v) {
  if (!Number.isFinite(v)) return '#8fa3ad';
  const stops = [[5, [40, 70, 160]], [8, [52, 120, 190]], [11, [60, 165, 175]], [14, [120, 190, 120]], [16, [230, 190, 80]], [18, [230, 130, 60]]];
  if (v <= stops[0][0]) return `rgb(${stops[0][1]})`;
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], f = (v - a) / (b - a); return `rgb(${ca.map((c, k) => Math.round(c + f * (cb[k] - c))).join(',')})`; }
  return `rgb(${stops[stops.length - 1][1]})`;
}

// calendar of the year: 12 small months, each dip day filled with its (coldest) water temperature
export function drawCalendar(svg, entries, now, onPick) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, a = {}, t) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (t != null) e.textContent = t; return e; };
  const y = localParts(now).y, today = dayKeyL(now);
  const byDay = {};
  for (const e of entries.filter((x) => x.src === 'dip')) { const k = dayKeyL(e.t); (byDay[k] = byDay[k] || []).push(e); }
  const cell = 11, gap = 2, mw = 7 * (cell + gap), mh = 6 * (cell + gap) + 16, cols = 4, padX = 8;
  const W = cols * mw + (cols - 1) * 12 + 2 * padX, H = 3 * mh + 2 * 10 + 4;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  const names = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  for (let m = 0; m < 12; m++) {
    const ox = padX + (m % cols) * (mw + 12), oy = Math.floor(m / cols) * (mh + 10);
    svg.append(el('text', { x: ox, y: oy + 10, 'font-size': 10, 'font-weight': 700, fill: '#2c4150' }, names[m]));
    const first = new Date(Date.UTC(y, m, 1)), dow = (first.getUTCDay() + 6) % 7, nd = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    for (let d = 1; d <= nd; d++) {
      const i = dow + d - 1, cx = ox + (i % 7) * (cell + gap), cy = oy + 16 + Math.floor(i / 7) * (cell + gap);
      const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const list = byDay[k];
      const temp = list ? Math.min(...list.map((e) => (Number.isFinite(e.sst) ? e.sst : Infinity))) : null;
      const r = el('rect', { x: cx, y: cy, width: cell, height: cell, rx: 2.5, fill: list ? tempColour(Number.isFinite(temp) ? temp : NaN) : '#ece6da', stroke: k === today ? '#b5523b' : 'none', 'stroke-width': 1.6 });
      if (list) { r.style.cursor = 'pointer'; r.addEventListener('click', () => onPick && onPick(list)); }
      svg.append(r);
    }
  }
}

// "where was the water?" picker: the steps in profile, each one tappable, plus the platform edge and "below"
export function drawStepPicker(svg, P0, selected, onPick) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, a = {}, t) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (t != null) e.textContent = t; return e; };
  const n = P0.steps.count, W = 360, H = 280, x0 = 48, top = 30, base = H - 74, stepW = (W - x0 - 16) / n, stepH = (base - top) / n;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  const sel = (w) => selected && w.kind === selected.kind && (w.kind !== 'step' || w.n === selected.n);
  const opt = (w, shape, label, lx, ly, anchor = 'start') => {
    const g = el('g', { class: 'opt', role: 'button', 'aria-label': label }); g.append(shape);
    if (label) g.append(el('text', { x: lx, y: ly, 'text-anchor': anchor, 'font-size': 13, 'font-weight': 700, fill: sel(w) ? '#fff' : '#0f1d26', 'pointer-events': 'none' }, label));
    g.addEventListener('click', () => onPick(w)); svg.append(g);
  };
  opt({ kind: 'platform' }, el('rect', { x: 6, y: top - 26, width: 118, height: 24, rx: 5, fill: sel({ kind: 'platform' }) ? '#2a7fb8' : '#c9c4b8' }), 'platform edge', 14, top - 9);
  for (let k = 1; k <= n; k++) {
    const x = x0 + (k - 1) * stepW, yv = top + (k - 1) * stepH, w = { kind: 'step', n: k };
    opt(w, el('rect', { x, y: yv, width: stepW + 0.5, height: base - yv, fill: sel(w) ? '#2a7fb8' : k % 2 ? '#a9a59b' : '#b8b4aa' }), String(k), x + stepW / 2, yv + 16, 'middle');
  }
  opt({ kind: 'below' }, el('rect', { x: 6, y: base + 8, width: W - 12, height: 34, rx: 7, fill: sel({ kind: 'below' }) ? '#2a7fb8' : '#6e5a45' }), 'below the bottom step', W / 2, base + 30, 'middle');
  const t = svg.lastChild.querySelector('text'); if (t && !sel({ kind: 'below' })) t.setAttribute('fill', '#fff');
  svg.append(el('text', { x: 8, y: H - 10, 'font-size': 11.5, fill: '#5a6b76' }, 'Tap where the water reached. Step 1 is the top step.'));
}

export function exportFile(entries) {
  const blob = new Blob([JSON.stringify({ app: 'the-point-westport-dips', version: 1, exported: new Date().toISOString(), dips: entries }, null, 1)], { type: 'application/json' });
  const p = localParts(Date.now());
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `the-point-dips-${p.y}${String(p.mo).padStart(2, '0')}${String(p.d).padStart(2, '0')}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export async function importFile(file) {
  const data = JSON.parse(await file.text());
  const list = Array.isArray(data) ? data : data.dips;
  if (!Array.isArray(list)) throw new Error('not a dip-log file');
  const a = read(), have = new Set(a.map((e) => e.id));
  let added = 0, sightings = 0;
  for (const e of list) {
    if (!e || !Number.isFinite(e.t) || have.has(e.id)) continue;
    const clean = { id: String(e.id || newId(e.t)), t: e.t, src: e.src === 'check' ? 'check' : 'dip', level: num(e.level), depth: num(e.depth), sst: num(e.sst), air: num(e.air),
      wind: e.wind && { speed: num(e.wind.speed), dir: num(e.wind.dir), gust: num(e.wind.gust) }, chop: typeof e.chop === 'string' ? e.chop.slice(0, 20) : null,
      where: e.where && typeof e.where === 'object' ? { kind: String(e.where.kind).slice(0, 10), n: num(e.where.n), part: e.where.part && String(e.where.part).slice(0, 10), frac: num(e.where.frac), h: num(e.where.h), text: e.where.text && String(e.where.text).slice(0, 80) } : null,
      obs: num(e.obs), diff: num(e.diff), from: e.from ? String(e.from).slice(0, 40) : (data.from || 'imported') };
    a.push(clean); have.add(clean.id); added++; if (Number.isFinite(clean.diff)) sightings++;
  }
  write(a);
  return { added, sightings };
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const fmtEntry = (e, P0) => `${dateLabel(e.t)} ${hm(e.t)}`;
export { esc, m1, sgn };
