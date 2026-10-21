// The Point, Westport Quay: how deep is it at the steps? Wiring for the page.
import { makePoint, windows, bodyWord } from './point.js';
import { Hero } from './hero.js';
import { drawDay, drawStrip, drawRose, drawDatums } from './chart.js';
import { chopEstimate, beaufort } from './chop.js';
import { getForecast, getSeaTempMI, getSeaTempOM, at, SPOT, NEATL_CELL } from './weather.js';
import { hm, dayName, dateLabel, localMidnight, fromLocal, localParts, sunPosition, sunCrossings, moonPhase, compass, compassWord, esc, m1, sgn, durHM } from './util.js';
import { initCheck } from './check.js';
import * as LOG from './log.js';
import { renderCard, shareCanvas } from './card.js';
import { makeFuture, drawFutureChart, drawFloodMap, SCEN } from './future.js';
import { renderSources } from './sources.js';

const $ = (s) => document.querySelector(s);
const LEVELS = { wade: 0.3, dip: 0.7, swim: 1.0 }; // m of water at the foot of the steps (see "What the words mean")
const COLORS = { wade: '#c49a3a', dip: '#3e9e8c', swim: '#2a7fb8' };
const PERSON_H = 1.72;

const load = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); });

function nowFromQuery() {
  const q = new URLSearchParams(location.search).get('at');
  if (!q) return { t: Date.now(), fixed: false };
  const m = q.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return { t: Date.now(), fixed: false };
  return { t: fromLocal(+m[1], +m[2], +m[3], +(m[4] || 12), +(m[5] || 0)), fixed: true };
}

function userCal() {
  try { return JSON.parse(localStorage.getItem('swim:cal') || 'null'); } catch { return null; }
}

async function main() {
  const [model, P0, fetchTable, skyline, clim, mapData, slr, fut, flood] = await Promise.all(['tide_model', 'point', 'fetch', 'skyline', 'seatemp_clim', 'map', 'slr', 'future', 'flood'].map((f) => load(`data/${f}.json`)));
  LOG.migrate();
  const cal = userCal();
  const P = structuredClone(P0);
  if (cal && cal.apply) { P.user_dh = cal.dh || 0; P.user_dt_min = cal.dt || 0; }
  const pt = makePoint(model, P);
  const pt0 = (P.user_dh || P.user_dt_min) ? makePoint(model, P0) : pt; // the uncorrected model, for logging sightings
  const NOW = nowFromQuery();
  const F = makeFuture(slr, fut, localParts(NOW.t).y);
  const state = { future: { year: 'now', scen: 'ssp126' }, clim, now: NOW.t, t: NOW.t, chosen: localStorage.getItem('swim:level') || 'swim', forecast: null, seaMI: null, seaOM: null, day: 0 };
  if (!LEVELS[state.chosen]) state.chosen = 'swim';

  // geometry of the cut for the hero (metres along the section, OD Malin)
  const geom = buildGeometry(P, model);
  const hero = new Hero($('#heroCanvas'), skyline, geom);

  // windows are computed once per depth threshold for the whole period the page can show
  const winCache = {};
  const winsFor = (need) => (winCache[need] ??= windows(pt, state.now - 86400000, state.now + 17 * 86400000, need));

  // ---------- hero ----------
  const scrub = $('#scrub');
  scrub.max = 24 * 60;
  function heroAt(t) {
    state.t = t;
    const fy = state.future.year, off = fy === 'now' ? 0 : F.offset(fy, state.future.scen, '50');
    const today = pt.level(t);
    const lev = today + off, dRaw = lev - P.bed.best, d = Math.max(0, dRaw);
    const sun = sunPosition(t, SPOT.lat, SPOT.lon);
    const wind = state.forecast ? at(state.forecast, t) : null;
    const chop = wind ? chopEstimate(fetchTable, wind, lev, d) : null;
    const heroState = { t, level: lev, sun, chop, personH: PERSON_H, ghost: off ? today : null, ghostLabel: `${localParts(state.now).y} level` };
    hero.set(heroState);
    $('#hero').dataset.tone = hero.tone;
    // words
    const slope = pt.level(t + 5 * 60000) - pt.level(t - 5 * 60000);
    const trend = Math.abs(slope) < 0.006 ? 'about at the turn' : slope > 0 ? 'rising' : 'falling';
    const ex = pt.extremes(t, t + 14 * 3600000)[0];
    const word = verdictWord(dRaw);
    $('#verdict').textContent = word;
    const live = Math.abs(t - state.now) < 4 * 60000;
    $('#when').textContent = NOW.fixed
      ? `${live ? 'Set to' : 'Scrubbed to'} ${dateLabel(t)} ${hm(t)}`
      : `${live ? 'Now, ' : ''}${cap(dayName(t, state.now, true))} ${hm(t)}${live ? '' : ' (scrubbed)'}`;
    let line;
    if (word === 'Water\u2019s edge') {
      line = `The tide is right around the foot of the steps (${dRaw >= 0 ? 'a few centimetres up' : `about ${Math.round(-dRaw * 100)} cm short`}), which is closer than this page can call it.`;
    } else if (word === 'Dry') {
      const back = (off ? windows({ depth: (u) => pt.depth(u) + off }, t, state.now + 17 * 86400000, EDGE_HI) : winsFor(EDGE_HI)).find((w) => w.start > t);
      const bd = back ? dayName(back.start, t) : null;
      line = `The water is ${m1(P.bed.best - lev)} m below the foot of the steps.`;
      if (back) line += back.start - t < 20 * 3600000 ? ` It's back at the steps around ${hm(back.start)}.` : ` The tide won't reach the steps again until ${bd === 'tomorrow' ? 'tomorrow' : bd} around ${hm(back.start)}.`;
    } else {
      line = `${cap(bodyWord(d, PERSON_H))} at the foot of the steps, about ${m1(d)} m, ${trend === 'about at the turn' ? 'and about at the turn' : 'and ' + trend}.`;
    }
    if (ex) line += ` ${ex.high ? 'High' : 'Low'} water ${hm(ex.t)}.`;
    if (chop) line += ` ${cap(chop.word)}${chop.offshore ? ' (wind off the land)' : ''}.`;
    $('#verdictLine').textContent = line;
    let next = nextLine(t);
    if (off) {
      const sc = SCEN[state.future.scen], lo = F.offset(fy, state.future.scen, '17'), hi = F.offset(fy, state.future.scen, '83');
      $('#when').textContent = `${fy} · ${sc.name} · same tide as ${dateLabel(t)} ${hm(t)}`;
      $('#futureNote').textContent = `Sea ${Math.round(off * 100)} cm higher than today (likely ${Math.round(lo * 100)}–${Math.round(hi * 100)} cm). Dashed line: today's level.`;
      next = `1 m+ at the steps: ${Math.round(F.now.swim / 10) * 10} h a year now, about ${(Math.round(F.hours(off) / 10) * 10).toLocaleString('en-IE')} in ${fy}`;
    } else $('#futureNote').textContent = '';
    $('#hero').classList.toggle('is-future', !!off);
    $('#nextSwim').textContent = next;
    const sstNow = state.seaMI ? at(state.seaMI, t, 'sst') : null, sstOM = state.seaOM ? at(state.seaOM.rows, t, 'sst') : null;
    const sst = sstNow ?? sstOM;
    const climT = state.clim ? state.clim.inishoo_1m.months[localParts(t).mo - 1] : null;
    state.heroInfo = { heroState, word, line, next, t, future: off ? `${fy} · ${SCEN[state.future.scen].name}: sea +${Math.round(off * 100)} cm` : '',
      water: sst != null ? `Water ${(Math.round(sst * 2) / 2).toFixed(1).replace('.0', '')}°` : climT != null ? `Water ~${Math.round(climT)}° (usual for ${new Date(t).toLocaleString('en-IE', { month: 'short', timeZone: 'Europe/Dublin' })})` : '', chop: chop ? cap(chop.word) : '',
      when: `${dateLabel(t)}, ${hm(t)}` };
    // label at the person
    const gl = $('#gaugeLabel');
    if (hero.labelAt) {
      gl.textContent = figureLabel(dRaw);
      const half = (gl.offsetWidth || 150) / 2, Wh = $('#hero').clientWidth;
      gl.style.left = Math.max(half + 6, Math.min(Wh - half - 6, hero.labelAt.x)) + 'px'; gl.style.top = hero.labelAt.y + 'px';
    }
    $('#scrubOut').textContent = hm(t);
    $('#nowBtn').hidden = live;
    // for tools/hero_check.cjs: the numbers behind this frame, and what the hero drew
    window.__swimHero = { t, today, off, lev, dRaw, d, word, line, label: gl.textContent, draw: hero.lastDraw };
  }
  function nextLine(t) {
    const need = LEVELS[state.chosen], name = state.chosen;
    const w = winsFor(need).find((x) => x.end > t);
    if (!w) return `No ${name} depth at the steps in the next fortnight`;
    if (w.start <= t + 60000) return `${cap(name)} depth until ${hm(w.end)}`;
    const dn = dayName(w.start, t);
    const far = w.start - t > 6 * 86400000;
    return `Next ${name}: ${dn === 'today' ? '' : far ? dateLabel(w.start) + ', ' : dn + ' '}${hm(w.start)}–${hm(w.end)}`;
  }
  function ticks() {
    const box = $('#ticks'); box.replaceChildren();
    const t0 = state.now;
    for (const e of pt.extremes(t0, t0 + 24 * 3600000)) {
      const s = document.createElement('span');
      const f = (e.t - t0) / (24 * 3600000);
      s.style.left = `${f * 100}%`;
      if (f < 0.09) s.style.transform = 'translateX(0)';
      if (f > 0.91) s.style.transform = 'translateX(-100%)';
      s.textContent = `${e.high ? 'HW' : 'LW'} ${hm(e.t)}`;
      box.append(s);
    }
  }
  scrub.addEventListener('input', () => heroAt(state.now + (+scrub.value) * 60000));
  $('#nowBtn').addEventListener('click', () => { scrub.value = 0; heroAt(state.now); });

  // ---------- level picker ----------
  function renderPick() {
    document.querySelectorAll('.pick button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === state.chosen)));
  }
  document.querySelectorAll('.pick button').forEach((b) => {
    b.querySelector('.sw').style.background = COLORS[b.dataset.level];
    b.querySelector('.need').textContent = `${LEVELS[b.dataset.level].toFixed(2).replace(/0$/, '')} m+`;
    b.addEventListener('click', () => { state.chosen = b.dataset.level; localStorage.setItem('swim:level', state.chosen); renderPick(); renderDays(); heroAt(state.t); });
  });

  // ---------- day chart + windows ----------
  const dayStart = (k) => localMidnight(localMidnight(state.now) + k * 86400000 + 12 * 3600000);
  const dayStarts = [0, 1, 2, 3].map(dayStart);
  function renderDays() {
    const tabs = $('#dayTabs'); tabs.replaceChildren();
    dayStarts.forEach((t0, k) => {
      const ws = windows(pt, t0, t0 + 86400000, LEVELS[state.chosen]);
      const b = document.createElement('button');
      b.setAttribute('aria-pressed', String(k === state.day));
      b.innerHTML = `<b>${esc(cap(dayName(t0 + 43200000, state.now)))}</b>${ws.length ? ws.map((w) => hm(w.start)).join(', ') : 'none'}`;
      b.addEventListener('click', () => { state.day = k; renderDays(); });
      tabs.append(b);
    });
    const t0 = dayStarts[state.day];
    const ch = drawDay($('#dayChart'), {
      t0, t1: t0 + 86400000, pt, levels: LEVELS, chosen: state.chosen, colors: COLORS, spot: SPOT, now: state.now,
      onPick: (t) => readout(t),
    });
    readout(state.day === 0 ? state.now : t0 + 12 * 3600000, ch);
    // windows list for 4 days
    const ul = $('#winList'); ul.replaceChildren();
    const all = windows(pt, state.now, state.now + 4 * 86400000, LEVELS[state.chosen]);
    if (!all.length) ul.innerHTML = `<li><span>No ${state.chosen} depth in the next four days.</span></li>`;
    for (const w of all.slice(0, 8)) {
      const peak = maxDepth(w.start, w.end);
      const sunA = sunPosition((w.start + w.end) / 2, SPOT.lat, SPOT.lon).alt;
      const li = document.createElement('li');
      li.innerHTML = `<span><span class="w">${esc(cap(dayName(w.start, state.now)))} ${hm(w.start)}–${hm(w.end)}</span><br><span class="small">${durHM(w.end - w.start)}${sunA < -6 ? ', in the dark' : sunA < 0 ? ', in twilight' : ''}</span></span><span class="meta">up to ${m1(peak)} m<br>${esc(bodyWord(peak, PERSON_H))}</span>`;
      ul.append(li);
    }
  }
  function maxDepth(a, b) { let m = 0; for (let t = a; t <= b; t += 5 * 60000) m = Math.max(m, pt.depth(t)); return m; }
  function readout(t) {
    const d = pt.depth(t), lev = pt.level(t);
    const w = verdictWord(d);
    $('#readout').innerHTML = `<b>${esc(cap(dayName(t, state.now)))} ${hm(t)}</b>: ${w === 'Dry' ? `dry, the water ${m1(-d)} m below the foot of the steps` : w === 'Water\u2019s edge' ? 'the water\u2019s edge, right around the foot of the steps' : `${m1(d)} m at the foot of the steps (${esc(bodyWord(d, PERSON_H))})`}. Water level ${lev >= 0 ? '+' : '−'}${Math.abs(lev).toFixed(2)} m OD Malin.`;
  }

  // ---------- springs and neaps strip ----------
  function renderStrip() {
    const days = [];
    const start = localMidnight(state.now) - 6 * 86400000;
    let prevPhase = null;
    for (let k = 0; k < 30; k++) {
      const t0 = start + k * 86400000;
      const hws = pt.extremes(t0, t0 + 86400000).filter((e) => e.high).map((e) => e.h);
      const ph = moonPhase(t0 + 43200000);
      let moon = null;
      if (prevPhase != null) { if (prevPhase > 300 && ph < 60) moon = 'new'; if (prevPhase < 180 && ph >= 180) moon = 'full'; }
      prevPhase = ph;
      const lab = k === 6 ? 'today' : (k % 4 === 2 ? String(new Date(t0 + 43200000).toLocaleDateString('en-IE', { timeZone: 'Europe/Dublin', day: 'numeric', month: 'short' })) : '');
      days.push({ t: t0, top: Math.max(...hws) - P.bed.best, moon, today: k === 6, label: lab });
    }
    drawStrip($('#stripChart'), { days, levels: LEVELS, colors: COLORS });
    const tops = days.map((d) => d.top);
    const rising = tops[7] > tops[6];
    let k = 6;
    if (rising) { while (k < 29 && tops[k + 1] >= tops[k]) k++; } else { while (k < 29 && tops[k + 1] <= tops[k]) k++; }
    const when = (i) => { const dn = dayName(days[i].t + 43200000, state.now, true); const dl = dateLabel(days[i].t + 43200000); return /day$/.test(dn) && !/^(today|tomorrow|yesterday)$/.test(dn) ? dl : `${dn} (${dl.replace(/^\w+,? /, '')})`; };
    const msg = rising
      ? `The tides are building: the next springs peak around ${when(k)}, when high water should give about ${m1(Math.max(0, tops[k]))} m at the foot of the steps.`
      : `The tides are falling off towards neaps around ${when(k)}, when high water ${tops[k] > 0.05 ? `only gives about ${m1(tops[k])} m at the foot of the steps` : 'may not reach the foot of the steps at all'}.`;
    $('#stripText').textContent = `${msg} Today's top of the tide: ${tops[6] > 0.05 ? m1(tops[6]) + ' m at the foot of the steps' : 'not quite up to the steps'}.`;
  }

  // ---------- tide table ----------
  function renderTable() {
    const tb = $('#tideTable tbody'); tb.replaceChildren();
    for (let k = 0; k < 7; k++) {
      const t0 = dayStart(k);
      const ex = pt.extremes(t0, t0 + 86400000);
      const tr = document.createElement('tr');
      const dep = (e) => (e.h - P.bed.best > 0.02 ? m1(e.h - P.bed.best) + ' m' : e.high ? 'short of the steps' : 'dry');
      const cell = (hi) => ex.filter((e) => e.high === hi).map((e) => `${hm(e.t)} <span class="small">${dep(e)}</span>`).join('<br>');
      tr.innerHTML = `<th>${esc(cap(dayName(t0 + 43200000, state.now)))}<br><span class="small">${esc(dateLabel(t0))}</span></th><td class="hl">${cell(true)}</td><td class="hl">${cell(false)}</td>`;
      tb.append(tr);
    }
  }

  // ---------- conditions ----------
  function renderCards() {
    const t = state.now;
    const lev = pt.level(t), d = Math.max(0, lev - P.bed.best);
    const f = state.forecast ? at(state.forecast, t) : null;
    if (f) {
      $('#cAir').textContent = `${Math.round(f.temp)}°`;
      $('#cAirS').textContent = `Feels like ${Math.round(f.feels)}°. ${f.rain > 0.1 ? `Rain ${f.rain.toFixed(1)} mm in the hour.` : 'Dry this hour.'} Cloud ${Math.round(f.cloud)}%.`;
      $('#cWind').innerHTML = `<span class="arrow" style="transform:rotate(${(f.dir + 180) % 360}deg)">↑</span> ${Math.round(f.speed)} <span class="small">km/h</span>`;
      $('#cWindS').textContent = `From the ${compassWord(f.dir)} (${compass(f.dir)}), gusts ${Math.round(f.gust)} km/h. Force ${beaufort(f.speed)}.`;
      const c = chopEstimate(fetchTable, f, lev, d);
      $('#cChop').textContent = cap(c.word);
      const fetchTxt = c.fetch >= 1000 ? (c.fetch / 1000).toFixed(1) + ' km' : Math.round(c.fetch) + ' m';
      $('#cChopS').textContent = `${c.line} ${c.Hs < 0.015 ? 'Next to no waves' : `Waves about ${Math.max(1, Math.round(c.Hs * 100))} cm`} over ${fetchTxt} of open water upwind.${c.offshore ? ' The wind is off the land here.' : ''}`;
    } else {
      for (const id of ['#cAir', '#cWind', '#cChop']) $(id).textContent = '–';
      $('#cAirS').textContent = $('#cWindS').textContent = $('#cChopS').textContent = state.fcError ? 'Forecast unavailable right now (Open-Meteo did not answer).' : state.forecast ? 'No forecast for this time (the forecast only runs a few days ahead).' : 'Loading the forecast…';
    }
    const mi = state.seaMI ? at(state.seaMI, t, 'sst') : null, om = state.seaOM ? at(state.seaOM.rows, t, 'sst') : null;
    if (mi != null || om != null) {
      const v = mi ?? om;
      $('#cSea').textContent = `${(Math.round(v * 2) / 2).toFixed(1)}°`;
      $('#cSeaS').textContent = mi != null
        ? `Marine Institute model, its nearest sea cell ${NEATL_CELL.km} km west.${om != null ? ` Météo-France: ${om.toFixed(1)}°, ${state.seaOM.km} km away.` : ''} The shallows at the steps can be a degree or two off either way.`
        : `Météo-France model (via Open-Meteo), its nearest cell ${state.seaOM.km} km away. The shallows at the steps can be a degree or two off either way.`;
    } else {
      $('#cSea').textContent = '–';
      const clim = state.clim ? state.clim.inishoo_1m.months[new Date(t).getUTCMonth()] : null;
      const why = state.seaError && state.seaOMError ? 'No sea temperature right now: neither the Marine Institute nor Météo-France answered.' : state.seaMI || state.seaOM ? 'No model value for this time (the models only run a few days ahead).' : 'Loading…';
      $('#cSeaS').textContent = `${why}${clim ? ` For this month, a logger 1 m down at Inishoo averaged ${clim.toFixed(1)}° (2005–09).` : ''}`;
    }
    // light
    const day0 = localMidnight(t);
    const sr = sunCrossings(day0, SPOT.lat, SPOT.lon, -0.833), cv = sunCrossings(day0, SPOT.lat, SPOT.lon, -6);
    $('#cLight').textContent = sr.rise ? `${hm(sr.rise)}–${hm(sr.set)}` : '–';
    $('#cLightS').textContent = cv.rise ? `First light ${hm(cv.rise)}, last light ${hm(cv.set)} (civil twilight).` : '';
    // tide range today
    const ex = pt.extremes(day0, day0 + 86400000);
    const hw = Math.max(...ex.filter((e) => e.high).map((e) => e.h)), lw = Math.min(...ex.filter((e) => !e.high).map((e) => e.h));
    $('#cRange').textContent = `${m1(hw - lw)} m`;
    const sp = ex.find((e) => e.high)?.spring ?? 0.5;
    $('#cRangeS').textContent = `Between today's highest and lowest water. ${sp > 0.75 ? 'Spring tides: big range.' : sp < 0.25 ? 'Neap tides: small range.' : sp > 0.5 ? 'Heading for, or just off, springs.' : 'Between springs and neaps.'}`;
  }

  // ---------- time travel ----------
  document.querySelectorAll('#future [data-year]').forEach((b) => b.addEventListener('click', () => {
    state.future.year = b.dataset.year === 'now' ? 'now' : +b.dataset.year;
    document.querySelectorAll('#future [data-year]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('#scenBtns').hidden = state.future.year === 'now';
    heroAt(state.t);
  }));
  document.querySelectorAll('#scenBtns [data-scen]').forEach((b) => b.addEventListener('click', () => {
    state.future.scen = b.dataset.scen;
    document.querySelectorAll('#scenBtns [data-scen]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    heroAt(state.t);
  }));

  // ---------- toast and sheets ----------
  let toastTimer = null;
  const toast = (msg) => { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3800); };
  const openSheet = (id) => { $(id).hidden = false; };
  const closeSheet = (id) => { $(id).hidden = true; };
  document.querySelectorAll('.sheet').forEach((sh) => {
    sh.addEventListener('click', (e) => { if (e.target === sh || e.target.closest('[data-close]')) closeSheet('#' + sh.id); });
  });

  // ---------- share card ----------
  let cardFormat = 'portrait', cardCanvas = null;
  const cardName = () => { const p = localParts(state.t); return `the-point-${p.y}${String(p.mo).padStart(2, '0')}${String(p.d).padStart(2, '0')}-${String(p.h).padStart(2, '0')}${String(p.mi).padStart(2, '0')}.png`; };
  function buildCard() {
    const i = state.heroInfo; if (!i) return;
    cardCanvas = renderCard(hero, i.heroState, i, cardFormat);
    $('#cardImg').src = cardCanvas.toDataURL('image/png');
  }
  $('#shareBtn').addEventListener('click', () => { buildCard(); openSheet('#cardSheet'); });
  document.querySelectorAll('#cardFormat button').forEach((b) => b.addEventListener('click', () => {
    cardFormat = b.dataset.f; document.querySelectorAll('#cardFormat button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); buildCard();
  }));
  $('#cardShare').addEventListener('click', async () => {
    if (!cardCanvas) buildCard();
    const r = await shareCanvas(cardCanvas, cardName(), `${state.heroInfo.word} at the Point, ${state.heroInfo.when}. ${state.heroInfo.next}`);
    if (r === 'downloaded') toast('Saved the picture (this browser can\'t share files directly).');
  });
  $('#cardSave').addEventListener('click', async () => {
    if (!cardCanvas) buildCard();
    const blob = await new Promise((res) => cardCanvas.toBlob(res, 'image/png'));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = cardName(); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  // ---------- I'm in: the dip log ----------
  let current = null;
  function snapshot(t) {
    const lev = pt0.level(t), d = lev - P0.bed.best;
    const f = state.forecast ? at(state.forecast, t) : null;
    const mi = state.seaMI ? at(state.seaMI, t, 'sst') : null, om = state.seaOM ? at(state.seaOM.rows, t, 'sst') : null;
    const ch = f ? chopEstimate(fetchTable, f, lev, Math.max(0, d)) : null;
    return { t, src: 'dip', level: +lev.toFixed(3), depth: +d.toFixed(3), sst: mi ?? om ?? null, sstSrc: mi != null ? 'MI' : om != null ? 'OM' : null,
      air: f ? f.temp : null, wind: f ? { speed: f.speed, dir: f.dir, gust: f.gust } : null, chop: ch ? ch.word : null, where: null, obs: null, diff: null };
  }
  function pickWhere(w) {
    if (!current) return;
    const obs = LOG.implied(w, P0);
    const diff = obs != null ? +(obs - current.level).toFixed(3) : null;
    current = LOG.update(current.id, { where: w, obs: obs != null ? +obs.toFixed(3) : null, diff });
    LOG.drawStepPicker($('#stepPick'), P0, w, pickWhere);
    let msg;
    if (w.kind === 'below') msg = current.depth > 0.05 ? `Below the steps, where the page had ${m1(current.depth)} m at the foot: the sea was at least ${m1(current.depth)} m lower than predicted.` : 'Below the steps, and the page agreed.';
    else msg = Math.abs(diff) < 0.1 ? `${cap(LOG.describeWhere(w, P0))}: about what the page predicted.` : `${cap(LOG.describeWhere(w, P0))}: by your eye the sea was ${Math.round(Math.abs(diff) * 100)} cm ${diff > 0 ? 'higher' : 'lower'} than the page said.`;
    $('#inPicked').textContent = msg;
    renderDips();
  }
  $('#inBtn').addEventListener('click', () => {
    const t = NOW.fixed ? state.now : Date.now();
    current = LOG.add(snapshot(t));
    $('#inTitle').textContent = `In you go, ${hm(t)}`;
    const bits = [`the page had ${current.depth > 0.02 ? `${m1(current.depth)} m at the foot of the steps (${bodyWord(current.depth, PERSON_H)})` : 'the water below the steps'}`];
    if (current.sst != null) bits.push(`water about ${(Math.round(current.sst * 2) / 2).toFixed(1)}°`);
    if (current.chop) bits.push(current.chop);
    $('#inSummary').textContent = `Logged. For ${dateLabel(t)} ${hm(t)} ${bits.join(', ')}.`;
    $('#inPicked').textContent = '';
    LOG.drawStepPicker($('#stepPick'), P0, null, pickWhere);
    openSheet('#inSheet');
    renderDips();
  });
  $('#inDone').addEventListener('click', () => { closeSheet('#inSheet'); toast(current && current.where ? 'Dip and sighting saved in this browser.' : 'Dip saved in this browser.'); });
  $('#inUndo').addEventListener('click', () => { if (current) LOG.remove(current.id); current = null; closeSheet('#inSheet'); renderDips(); toast('Removed.'); });

  function renderDips() {
    const entries = LOG.all(), st = LOG.stats(entries, state.now), cal = LOG.calibration(entries);
    const coldest = st.coldest ? `${(Math.round(st.coldest.sst * 2) / 2).toFixed(1)}°` : '–';
    $('#dipStats').innerHTML = `
      <div class="stat"><div class="k">Dips in ${st.yearN}</div><div class="v">${st.year}</div><div class="s">${st.total} in all</div></div>
      <div class="stat"><div class="k">Streak</div><div class="v">${st.streak} ${st.streak === 1 ? 'day' : 'days'}</div><div class="s">best ${st.best}</div></div>
      <div class="stat"><div class="k">Coldest</div><div class="v">${coldest}</div><div class="s">${st.coldest ? esc(dateLabel(st.coldest.t)) : 'no temperatures yet'}</div></div>`;
    LOG.drawCalendar($('#dipCal'), entries, state.now, (list) => toast(list.map((e) => `${hm(e.t)}: ${e.sst != null ? (Math.round(e.sst * 2) / 2).toFixed(1) + '°, ' : ''}${m1(Math.max(0, e.depth))} m at the steps`).join(' · ')));
    $('#calLegend').style.background = `linear-gradient(90deg, ${[5, 8, 11, 14, 16, 18].map((v) => LOG.tempColour(v)).join(',')})`;
    const ul = $('#dipList'); ul.replaceChildren();
    const recent = entries.slice(-8).reverse();
    if (!recent.length) ul.innerHTML = '<li><span>No dips yet. The first one goes here.</span></li>';
    for (const e of recent) {
      const li = document.createElement('li');
      const wh = e.where ? LOG.describeWhere(e.where, P0) + (Number.isFinite(e.diff) ? ` (${sgn(e.diff)} m)` : '') : 'no sighting';
      li.innerHTML = `<span>${esc(dateLabel(e.t))} ${hm(e.t)}${e.src === 'check' ? ' <span class="small">(check)</span>' : ''}<br><span class="small">${esc(wh)}${e.from ? ' · from ' + esc(e.from) : ''}</span></span><span class="m">${e.depth != null ? m1(Math.max(0, e.depth)) + ' m predicted' : ''}${e.sst != null ? '<br>' + (Math.round(e.sst * 2) / 2).toFixed(1) + '°' : ''} <button data-id="${esc(e.id)}" aria-label="Delete">✕</button></span>`;
      ul.append(li);
    }
    ul.querySelectorAll('button[data-id]').forEach((b) => b.addEventListener('click', () => { LOG.remove(b.dataset.id); renderDips(); }));
    const c = LOG.readCal();
    const applied = c && c.apply;
    $('#calib').innerHTML = cal.n
      ? `<b>Your sightings: ${cal.n}</b>${cal.below ? ` (and ${cal.below} "below the steps")` : ''}. On average the sea was <b>${sgn(cal.mean)} m</b> against the page's prediction${cal.sd != null ? `, give or take ${Math.max(1, Math.round(cal.sd * 100))} cm` : ''}. ${cal.n < 4 ? 'A few more at different states of the tide would say more.' : ''}
        <label><input type="checkbox" id="applyCal" ${applied ? 'checked' : ''}> Correct my predictions by ${sgn(cal.mean)} m (your sightings, in this browser only)</label>`
      : `<b>No sightings yet.</b> When you log a dip, say where the water was on the steps. Each one tells the page how far off its prediction was, and once you have a few you can let it correct itself. ${applied ? 'A correction from earlier is still applied.' : ''}`;
    const ap = $('#applyCal');
    if (ap) ap.addEventListener('change', () => { if (ap.checked) LOG.writeCal({ apply: true, dh: +cal.mean.toFixed(3), n: cal.n, at: Date.now() }); else LOG.writeCal(null); try { sessionStorage.setItem('swim:openDips', '1'); } catch { /* ignore */ } location.reload(); });
    $('#correctedNote').textContent = applied ? `Corrected by your ${c.n || ''} sightings: ${sgn(c.dh)} m` : '';
  }
  $('#exportBtn').addEventListener('click', () => { LOG.exportFile(LOG.all()); toast('Saved your log as a .json file.'); });
  $('#importFile').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try { const r = await LOG.importFile(f); renderDips(); toast(`Added ${r.added} entries (${r.sightings} sightings) from ${f.name}.`); } catch (e) { toast(`Couldn't read that file: ${e.message}`); }
    ev.target.value = '';
  });
  try { if (sessionStorage.getItem('swim:openDips')) { sessionStorage.removeItem('swim:openDips'); setTimeout(() => document.getElementById('dips').scrollIntoView({ block: 'start' }), 60); } } catch { /* ignore */ }

  // ---------- the future section ----------
  function renderFuture() {
    const rows = [];
    for (const y of [2050, 2100]) {
      const cm = (v) => Math.round(v * 100);
      const parts = ['ssp126', 'ssp585'].map((k) => `${SCEN[k].name} (${SCEN[k].code}) <b>+${cm(F.offset(y, k, '50'))} cm</b> <span class="small">likely ${cm(F.offset(y, k, '17'))}–${cm(F.offset(y, k, '83'))} cm</span>`);
      rows.push(`<dt>${y}</dt><dd>${parts.join('<br>')}</dd>`);
    }
    $('#slrTable').innerHTML = rows.join('');
    drawFutureChart($('#futureChart'), F);
    const h = (y, k, p = '50') => Math.round(F.hours(F.offset(y, k, p)) / 10) * 10;
    const top = (y, k, p = '50') => F.topTides(F.offset(y, k, p));
    const fmtTop = (v) => (v < 0.5 ? 'not once in most years' : v < 1.5 ? 'about once a year' : `about ${Math.round(v)} times a year`);
    $('#futureText').innerHTML = `Today the foot of the steps gets a metre of water or more for about <b>${Math.round(F.now.swim / 10) * 10} hours a year</b>. That figure is averaged over a full 18.6-year lunar cycle; ${localParts(state.now).y} itself is a lean year. By 2050 the figure is about ${h(2050, 'ssp126')} (low emissions) to ${h(2050, 'ssp585')} hours (high). By 2100 it is about <b>${h(2100, 'ssp126')}</b> (low, likely ${h(2100, 'ssp126', '17')}–${h(2100, 'ssp126', '83')}) or <b>${h(2100, 'ssp585')}</b> (high, likely ${h(2100, 'ssp585', '17')}–${h(2100, 'ssp585', '83')}). More water at the steps also means water further up them. On the tide alone, with no storm, the biggest springs reach the top of the steps ${fmtTop(top(2100, 'ssp126'))} in 2100 under low emissions, and ${fmtTop(top(2100, 'ssp585'))} under high. Today they don't reach it at all.`;
    drawFloodMap($('#floodSvg'), mapData, flood);
  }

  // ---------- go ----------
  ticks(); heroAt(state.now); renderPick(); renderDays(); renderStrip(); renderTable(); renderCards();
  setTimeout(() => renderYear(), 300);
  function renderYear() {
    // how often, and at what hours, the foot of the steps gets a swim's worth of water this year
    const y = new Date(state.now).getUTCFullYear();
    const ws = windows(pt, Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1), LEVELS.swim, 15);
    if (!ws.length) return;
    const hrs = ws.reduce((a, w) => a + (w.end - w.start), 0) / 3600000;
    const mids = ws.map((w) => { const p = new Date((w.start + w.end) / 2).toLocaleString('en-IE', { timeZone: 'Europe/Dublin', hour: '2-digit', hour12: false }); return +p % 24; });
    const am = mids.filter((h) => h < 12), pm = mids.filter((h) => h >= 12);
    const rng = (a) => (a.length ? `${Math.min(...a)}:00 and ${Math.max(...a) + 1}:00` : '');
    $('#yearText').textContent = `In ${y}, by this page's sums, the foot of the steps gets a metre of water or more on ${ws.length} tides, about ${Math.round(hrs)} hours in all${am.length && pm.length ? `, every one of them centred between ${rng(am)} in the morning or ${rng(pm)} in the evening (Irish time)` : ''}. That is a dawn or dusk swim, or nothing.`;
  }
  fillNumbers(model, P);
  drawFigures(model, P, pt, fetchTable, clim, state.now);
  drawMap(document.getElementById('mapSvg'), mapData);
  initCheck({ pt: pt0, P, P0, model, now: state.now, reload: () => location.reload(), onChange: () => renderDips() });
  renderDips(); renderFuture();
  renderSources($('#sourceList'));

  getForecast().then((f) => { state.forecast = f; renderCards(); heroAt(state.t); }).catch((e) => { console.info('forecast:', e.message); state.fcError = true; renderCards(); });
  getSeaTempMI().then((s) => { state.seaMI = s; renderCards(); }).catch((e) => { console.info('MI sea temperature:', e.message); state.seaError = true; renderCards(); });
  getSeaTempOM().then((s) => { s.km = distKm(SPOT, s.cell).toFixed(0); state.seaOM = s; renderCards(); }).catch((e) => { console.info('Open-Meteo marine:', e.message); state.seaOMError = true; renderCards(); });
  NEATL_CELL.km = distKm(SPOT, NEATL_CELL).toFixed(1);
}

function distKm(a, b) { const kx = 111.32 * Math.cos(a.lat * Math.PI / 180); return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 110.54); }
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// The verdict from the water level minus the foot of the steps (dRaw, m; negative = short of the steps).
// Dry below -0.3 m; Water's edge from -0.3 to +0.05 m (inside the +/-0.25 m the bed is known to);
// Paddle up to 0.3 m; Wade from 0.3 m; Dip from 0.7 m; Swim from 1.0 m. Each band starts where the last ends.
const EDGE_LO = -0.3, EDGE_HI = 0.05;
function verdictWord(dRaw) {
  if (dRaw >= LEVELS.swim) return 'Swim';
  if (dRaw >= LEVELS.dip) return 'Dip';
  if (dRaw >= LEVELS.wade) return 'Wade';
  if (dRaw > EDGE_HI) return 'Paddle';
  if (dRaw > EDGE_LO) return 'Water\u2019s edge';
  return 'Dry';
}
// the label on the figure: the same bands as the verdict, in body words
function figureLabel(dRaw) {
  const w = verdictWord(dRaw);
  if (w === 'Dry') return `dry · water ${m1(-dRaw)} m below`;
  if (w === 'Water\u2019s edge') return dRaw >= 0 ? 'water\u2019s edge · at the foot' : `water\u2019s edge · ${Math.round(-dRaw * 100)} cm short`;
  return `${bodyWord(dRaw, PERSON_H)} · ${m1(dRaw)} m`;
}

// metres along the section; steps from the promenade to the foot, then the foreshore
function buildGeometry(P, model) {
  const s = P.steps;
  const steps = [];
  let x = s.start_x, z = P.top;
  const n = s.count, rise = (P.top - s.bottom) / n;
  for (let k = 0; k < n; k++) { steps.push({ x0: x, x1: x + s.tread, z0: z, z1: z - rise }); x += s.tread; z -= rise; }
  // the hero's window reaches 0.1 m below the lowest astronomical tide at the Point (2026-44),
  // so every level the tide can reach is drawn in the frame
  const lat = model.levels.min_2026_2044 - model.Z0 + P.msl_odm + Math.min(0, P.diffs.mlws);
  return { top: P.top, steps, footX: x, bedBest: P.bed.best, bedSlope: P.bed.slope, shelfLen: 30, zLow: Math.floor((lat - 0.1) * 10) / 10, shelterX: -0.35 };
}

function fillNumbers(model, P) {
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const c = model.checks.find((k) => k.label.startsWith('fit 2026, test 2028'));
  if (c) { set('nRms', (c.rms_m * 100).toFixed(1)); set('nMax', (c.max_m * 100).toFixed(0)); set('nTime', c.hw_lw_time_rms_min.toFixed(0)); }
  set('nCons', model.cons.length);
  const lv = model.levels;
  set('nZ0', model.Z0.toFixed(2));
  set('nMHWS', lv.MHWS.toFixed(2)); set('nMLWS', lv.MLWS.toFixed(2)); set('nMHWN', lv.MHWN.toFixed(2)); set('nMLWN', lv.MLWN.toFixed(2));
  set('nHAT', lv.max_2026_2044.toFixed(2));
  set('nBed', P.bed.best.toFixed(1)); set('nBedLo', P.bed.lo.toFixed(1)); set('nBedHi', P.bed.hi.toFixed(1));
  set('nTop', P.top.toFixed(1)); set('nMSL', P.msl_odm.toFixed(2));
  // age of the tide from the S2-M2 phase lag
  const g = Object.fromEntries(model.cons.map(([n, , ph]) => [n, ph]));
  const age = (((g.S2 - g.M2) % 360) + 360) % 360 / (30 - 28.9841042);
  set('nAge', Math.round(age)); set('nAge2', Math.round(age));
  const pl = pointLevels(model, P);
  set('nPMHWS', pl.MHWS.toFixed(1)); set('nPMHWN', pl.MHWN.toFixed(1));
  set('nDtHW', P.diffs.hw_spring_min); set('nDtLW', P.diffs.lw_spring_min);
}

// The Point's mean tide levels (m OD Malin) from Roonagh's constants and the differences.
function pointLevels(model, P) {
  const z = (k, d) => model.levels[k] - model.Z0 + P.msl_odm + d;
  return { MHWS: z('MHWS', P.diffs.mhws), MHWN: z('MHWN', P.diffs.mhwn), MLWN: z('MLWN', P.diffs.mlwn), MLWS: z('MLWS', P.diffs.mlws) };
}

function drawFigures(model, P, pt, fetchTable, clim, now) {
  const pl = pointLevels(model, P);
  const df = document.getElementById('datumFig');
  if (df) drawDatums(df, [
    { z: P.top, label: 'promenade at the steps', sub: 'OPW LiDAR 2011', kind: 'land' },
    { z: 2.75, label: 'highest water on record, Dec 2012', sub: 'flood study (with surge)', kind: 'water' },
    { id: 'mhws', z: pl.MHWS, label: 'mean high water springs', sub: 'the Point, this page', kind: 'water' },
    { z: P.bed.best, label: 'foot of the steps (foreshore)', sub: `LiDAR; could be ${P.bed.lo}–${P.bed.hi}`, kind: 'land' },
    { z: pl.MHWN, label: 'mean high water neaps', kind: 'water' },
    { z: P.msl_odm, label: 'mean sea level', sub: 'MI gauges around Clew Bay', kind: 'water' },
    { z: pl.MLWN, label: 'mean low water neaps', kind: 'water' },
    { z: -1.14, label: 'chart drying height 1.4 m', sub: 'just west of the Point', kind: 'land' },
    { id: 'mlws', z: pl.MLWS, label: 'mean low water springs', kind: 'water' },
    { z: -1.955, label: 'Roonagh LAT (its own datum)', sub: 'not used, see below', kind: 'alt' },
    { z: P.msl_odm - 2.6, label: 'chart datum, approx.', sub: 'Admiralty, Inishgort gap', kind: 'alt' },
  ]);
  const rf = document.getElementById('roseFig');
  if (rf) drawRose(rf, fetchTable, 1.5);
  const cf = document.getElementById('climFig');
  if (cf && clim) drawClim(cf, clim.inishoo_1m.months, new Date(now).getUTCMonth());
  const nk = document.getElementById('nNeatlKm'); if (nk && clim) nk.textContent = clim.neatl_cell.km_from_point.toFixed(1);
}

function drawMap(svg, m) {
  if (!svg || !m) return;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, a = {}, t) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (t != null) e.textContent = t; return e; };
  const path = (pts, close) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('') + (close ? 'Z' : '');
  for (const b of m.ways.buildings) svg.append(el('path', { d: path(b, true), fill: '#b9b4a8', stroke: '#9c968a', 'stroke-width': 0.5 }));
  for (const r of m.ways.roads) svg.append(el('path', { d: path(r), fill: 'none', stroke: '#8f8a80', 'stroke-width': 3.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  for (const r of m.ways.roads) svg.append(el('path', { d: path(r), fill: 'none', stroke: '#fbf8f1', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  for (const sl of m.ways.slipways) svg.append(el('path', { d: path(sl), fill: 'none', stroke: '#5c5a54', 'stroke-width': 3 }));
  for (const l of m.labels) svg.append(el('text', { x: l.p[0], y: l.p[1], 'text-anchor': 'middle', 'font-size': 12, 'font-style': l.t.includes('Bay') || l.t.includes('River') ? 'italic' : 'normal', fill: l.t.includes('Bay') || l.t.includes('River') ? '#2f6f82' : '#3b3a35', transform: l.rot ? `rotate(${l.rot} ${l.p[0]} ${l.p[1]})` : '' }, l.t));
  const [sx, sy] = m.swim;
  svg.append(el('circle', { cx: sx, cy: sy, r: 9, fill: 'none', stroke: '#b5523b', 'stroke-width': 2 }));
  svg.append(el('circle', { cx: sx, cy: sy, r: 3.5, fill: '#b5523b' }));
  svg.append(el('text', { x: sx - 12, y: sy + 22, 'text-anchor': 'end', 'font-size': 12, 'font-weight': 700, fill: '#b5523b' }, 'the steps'));
  // 100 m scale bar and north arrow
  const px100 = 100 / m.metres_per_px;
  svg.append(el('rect', { x: 14, y: 306, width: px100, height: 4, fill: '#3b3a35' }));
  svg.append(el('text', { x: 14, y: 300, 'font-size': 11, fill: '#3b3a35' }, '100 m'));
  svg.append(el('path', { d: 'M418,14 L424,30 L418,26 L412,30 Z', fill: '#3b3a35' }));
  svg.append(el('text', { x: 418, y: 44, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#3b3a35' }, 'N'));
}

function drawClim(svg, months, cur) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, a = {}, t) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (t != null) e.textContent = t; return e; };
  const W = 360, H = 150, L = 22, B = 20, T = 14;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  const bw = (W - L - 6) / 12;
  const Y = (v) => T + (H - T - B) * (1 - v / 18);
  for (const v of [5, 10, 15]) { svg.append(el('line', { x1: L, x2: W - 4, y1: Y(v), y2: Y(v), stroke: '#e3dccf' })); svg.append(el('text', { x: L - 4, y: Y(v) + 3.5, 'text-anchor': 'end', 'font-size': 9, fill: '#5a6b76' }, `${v}°`)); }
  'JFMAMJJASOND'.split('').forEach((m, i) => {
    const x = L + i * bw + bw * 0.15, v = months[i];
    svg.append(el('rect', { x, y: Y(v), width: bw * 0.7, height: Y(0) - Y(v), rx: 2, fill: i === cur ? '#b5523b' : '#2f8197', opacity: i === cur ? 0.95 : 0.6 }));
    svg.append(el('text', { x: x + bw * 0.35, y: Y(v) - 3, 'text-anchor': 'middle', 'font-size': 8.5, fill: '#0f1d26' }, v.toFixed(1)));
    svg.append(el('text', { x: x + bw * 0.35, y: H - 6, 'text-anchor': 'middle', 'font-size': 9.5, fill: '#5a6b76' }, m));
  });
}

main().catch((e) => {
  console.error(e);
  const v = document.getElementById('verdict'); if (v) v.textContent = '…';
  const l = document.getElementById('verdictLine'); if (l) l.textContent = 'Something went wrong loading the tide data. Try reloading.';
});
