import { loadWeather, analyse, nowIndex, clearRuns, trimToDaylight, glowChance, pretend, TOP, SUMMIT } from './weather.js';
import { Hero } from './hero.js';
import { drawChart, bestWindows, climbCard, howTable } from './forecast.js';
import { Pano } from './pano.js';
import { Where } from './where.js';
import { renderSources, resolve } from './sources.js';
import { sunPosition, refraction, hm, dayName, compassWord, fmtInt, esc } from './sky.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const getJSON = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); });
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
let current = null, NUMS = new Map();
const numberRefs = () => document.querySelectorAll('a.ref').forEach((a) => { const id = a.getAttribute('href').slice(5); a.textContent = NUMS.get(id) ?? '?'; });

// ?hour=21 previews today's light at that Dublin hour (for checking the night/dusk drawings).
function clock() {
  const want = params.get('hour'); const now = new Date();
  if (want == null) return now;
  const f = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', hour: 'numeric', hour12: false, day: 'numeric' });
  const today = f.formatToParts(now).find((p) => p.type === 'day').value;
  for (let k = -30; k <= 30; k++) {
    const t = new Date(Math.floor(now / 3600e3) * 3600e3 + k * 3600e3), parts = f.formatToParts(t);
    if (+parts.find((p) => p.type === 'hour').value === +want && parts.find((p) => p.type === 'day').value === today) return t;
  }
  return now;
}

// When does the sun cross the skyline (seen from the summit) today? horizonAt(az) -> degrees.
function sunCrossings(date, lat, lon, horizonAt) {
  const d0 = new Date(date); d0.setUTCHours(0, 0, 0, 0);
  let prev = null; const out = [];
  for (let m = 0; m <= 1440; m++) {
    const t = new Date(d0.getTime() + m * 60000), p = sunPosition(t, lat, lon);
    const up = p.alt + refraction(p.alt) + 0.27 > horizonAt(p.az);
    if (prev !== null && up !== prev) out.push({ t, az: p.az, rise: up });
    prev = up;
  }
  return { rise: out.find((x) => x.rise), set: [...out].reverse().find((x) => !x.rise) };
}

function nextReekSunday(now = new Date()) {
  for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
    const d = new Date(Date.UTC(y, 6, 31)); d.setUTCDate(31 - d.getUTCDay());
    if (d.getTime() + 86400e3 > now.getTime()) return d;
  }
}

async function main() {
  const [heroD, horizon, places, peaks, vs] = await Promise.all(['data/hero.json', 'data/horizon.json', 'data/places.json', 'data/peaks.json', 'data/viewshed.json'].map(getJSON));
  const now = clock(), sunNow = sunPosition(now, SUMMIT.lat, SUMMIT.lon);
  const hero = new Hero($('#heroCanvas'), heroD);
  hero.set({ v: 2, why: 'loading', base: 4000, low: 0, mid: 0, high: 0, sunAlt: sunNow.alt, sunAz: sunNow.az });

  // sources + footnote numbers
  NUMS = renderSources($('#sourceList'));
  numberRefs();
  const rs = nextReekSunday(now);
  const fmtD = new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#nextReek').textContent = `The next one falls on ${fmtD.format(rs)}, with Garland Friday two days before.`;

  await setupPano(horizon, now);
  new Where({ section: $('#where'), mapEl: $('#map'), card: $('#whereCard'), list: $('#placeList'), geoBtn: $('#geoBtn'), places, peaks, viewshed: vs, summit: horizon.summit, now: () => current });

  const run = async () => {
    try {
      const an = analyse(await loadWeather());
      render(an, hero, clock());
    } catch (e) {
      console.warn('weather', e);
      $('#answer').textContent = '?';
      $('#answerLine').textContent = "Couldn't reach the forecast just now. The view from the top and the map below still work.";
      $('#hero').dataset.verdict = 'unknown';
    }
  };
  await run();
  let last = Date.now();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - last > 20 * 60e3) { last = Date.now(); run(); } });
}

function answerLine(h, an, i0) {
  const b = Math.round((h.base ?? 0) / 50) * 50, above = Math.max(50, Math.round((h.base - TOP) / 50) * 50);
  const lines = {
    clear: h.base >= 2500 ? "The summit's clear. No low cloud about." : `The summit's clear: cloud base about ${fmtInt(b)} m, ${fmtInt(above)} m above the top.`,
    cap: h.base < TOP ? `Cloud on and off the top: base about ${fmtInt(b)} m, right at summit height.` : `Cloud skimming the top: base about ${fmtInt(b)} m, so a cap will come and go.`,
    scattered: `Patchy low cloud below the top, base about ${fmtInt(b)} m but broken. The summit will come and go.`,
    showers: 'Showers about: the top will come and go behind them.',
    cloud: `The top's in cloud: base about ${fmtInt(b)} m, so the upper ${fmtInt(Math.max(50, Math.round((TOP - h.base) / 50) * 50))} m or so is hidden.`,
    rain: 'Rain and low cloud. The Reek is hiding.',
    under: `Not from down here: there's a lid of cloud at about ${fmtInt(b)} m. The summit itself is probably out above it, in the clear.`,
    fog: "Fog at the foot of the mountain. You won't see much of anything.",
  };
  let s = lines[h.why] || lines.clear;
  if (!h.day && h.sunAlt < -6) {
    const rise = an.daily.map((d) => d.rise).find((t) => t > h.t);
    s += rise ? ` It's dark, mind; first light ${dayName(rise) === 'today' ? '' : dayName(rise) + ' '}${hm(rise - 1800)}.` : " It's dark, mind.";
  }
  if (!h.agree && h.models?.length > 1) s += ' The models don\'t all agree.';
  return s;
}

function render(an, hero, now) {
  const nowS = now.getTime() / 1000, i0 = nowIndex(an.hours, nowS);
  let h = an.hours[i0];
  if (h.v == null) throw new Error('no model data');
  const mode = params.get('pretend'); if (mode) h = pretend(h, mode);
  current = h;
  const sun = sunPosition(now, SUMMIT.lat, SUMMIT.lon);
  hero.set({ ...h, sunAlt: sun.alt, sunAz: sun.az });
  const ans = $('#answer');
  ans.textContent = ['No.', 'Partly.', 'Yes.'][h.v];
  if (h.v === 1) ans.dataset.long = ''; else delete ans.dataset.long;
  $('#hero').dataset.verdict = ['no', 'partly', 'yes'][h.v];
  $('#answerLine').textContent = answerLine(h, an, i0);
  document.title = `${['No', 'Partly', 'Yes'][h.v]}: can I see the Reek today?`;

  // next clear spell
  const runs = clearRuns(an.hours, i0, i0 + 72).map((r) => trimToDaylight(an, r));
  let nw;
  if (h.v === 2 && h.day && !mode) { const r = runs.find((x) => x.a === i0); nw = !r ? '<b>Clear now.</b>' : r.toDark ? `<b>Clear now</b>, and it should stay that way until dark (sunset ${hm(r.set)}).` : `<b>Clear now</b>, likely until about ${hm(r.end)}.`; }
  else {
    const r = runs.find((x) => x.start > nowS - 3600 && !(x.a === i0 && h.v !== 2));
    nw = r ? `<b>Next clear spell:</b> ${dayName(r.start)} ${hm(r.start)}&ndash;${hm(r.end)}${r.sure >= 0.99 ? ', all three models agree' : ''}.` : '<b>No clear daylight spell</b> in the next three days.';
  }
  $('#nextWindow').innerHTML = nw;
  const g = [glowChance(an, 'sunset', nowS), glowChance(an, 'sunrise', nowS)].filter(Boolean).sort((a, b) => a.t - b.t)[0];
  if (g) {
    const lv = { good: 'a good chance of colour', some: 'some chance of colour', little: 'not much chance of colour' }[g.level];
    $('#glowLine').innerHTML = `<b>${cap(g.kind)} ${dayName(g.t) === 'today' ? '' : dayName(g.t) + ' '}${hm(g.t)}:</b> ${lv}; ${esc(g.why)}.`;
  }
  const upd = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(an.fetched));
  $('#heroCaption').textContent = `Cruach Phádraig, 764 m, from Westport Quay (heights ×1.5). Forecast from three models, fetched ${upd}.`;

  const draw = () => drawChart($('#chart'), $('#chartReadout'), an, i0);
  draw(); let rt; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(draw, 150); }).observe($('#chartWrap'));
  bestWindows($('#bestWindows'), an, i0);
  climbCard($('#climbCard'), an, i0);
  howTable($('#howNow'), an, i0);
  numberRefs();
}

function statusText(f) {
  const far = f.kind === 'far' && f.km > 95, b = f.blocker;
  const own = b && b.km < 2.5;
  if (f.status === 'hidden') {
    const by = own ? "the Reek's own slopes" : b?.name ? `${b.name}${b.km < f.km - 3 ? `, ${b.km < 10 ? b.km.toFixed(1) : Math.round(b.km)} km from the summit` : ''}` : 'higher ground in between';
    return `<b>Out of sight.</b> Hidden behind ${esc(by)}; it would need to be about ${fmtInt(Math.max(1, -f.visH))} m taller to show.`;
  }
  if (far) return `<b>On paper, yes.</b> The line of sight clears, with roughly the top ${fmtInt(Math.max(5, Math.min(f.h, f.visHExt)))} m standing over the horizon. You'd need the clearest air of the year.`;
  if (f.status === 'tip') return `<b>Only just.</b> ${f.visHExt <= 30 ? `About the top ${fmtInt(Math.max(1, f.visHExt))} m clears what's in front` : 'The line of sight clears by a whisker'}${own ? ", over the Reek's own shoulder" : b?.name ? `, over ${esc(b.name)}` : ''}.`;
  if (['town', 'area'].includes(f.kind)) return `<b>In view</b>, ${Math.abs(f.ang).toFixed(1)}° below level.`;
  return `<b>In view.</b> ${f.visHExt >= f.h - 10 ? 'All of it' : `The top ${fmtInt(f.visHExt)} m of it`} stands clear of anything in front.`;
}

function loadDepth(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data, v = new Uint8Array(img.width * img.height);
      for (let i = 0; i < v.length; i++) v[i] = d[i * 4];
      res({ w: img.width, h: img.height, v });
    };
    img.onerror = () => rej(new Error('panorama image')); img.src = url;
  });
}

async function setupPano(horizon, now) {
  const card = $('#panoCard'), chips = $('#panoChips'), hud = $('#panoBearing');
  const show = (f) => {
    chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', f && b.dataset.id === f.id ? 'true' : 'false'));
    if (!f) { card.hidden = true; return; }
    const km = f.km < 10 ? f.km.toFixed(1) : Math.round(f.km);
    const srcs = (f.src || []).map(resolve).filter(Boolean).filter((s, k, a) => a.findIndex((x) => x.url === s.url) === k);
    card.innerHTML = `<h3>${esc(f.name)}${f.ga && f.ga !== f.name ? ` <span class="ga">${esc(f.ga)}</span>` : ''}</h3>
      <p class="meta">${km} km · bearing ${Math.round(f.az)}° (${compassWord(f.az)})${f.h && f.kind !== 'town' && f.kind !== 'area' ? ` · ${fmtInt(f.h)} m` : ''}${f.group ? ' · ' + esc(f.group) : ''}</p>
      <p class="status">${statusText(f)}</p>
      ${f.story ? `<p class="story">${f.folk ? '<b>Folklore.</b> ' : ''}${esc(f.story)}</p>` : ''}
      <p class="src">${srcs.length ? 'Sources: ' + srcs.map((s) => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)).join(' · ') : ''}${f.ga ? ` · Irish form: ${esc(f.gaSrc)}` : ''}</p>`;
    card.hidden = false;
  };
  const depth = await loadDepth('data/' + horizon.image.file);
  const pano = new Pano($('#pano'), horizon, depth, { startAz: 330, onSelect: show, onMove: (az) => { hud.textContent = `Looking ${compassWord(az)} · ${Math.round(az)}°`; } });
  const CH = [['Clew Bay', 'clewbay'], ['Clare Island', 'clare'], ['Achill', 'croaghaun'], ['Nephin', 'nephin'], ['Westport', 'westport'], ['Mweelrea', 'mweelrea'], ['Twelve Bens', 'benbaun'], ['Slieve League', 'slieveleague'], ['Furthest: Galtymore', 'galtymore']];
  chips.innerHTML = CH.map(([t, id]) => `<button data-id="${id}" aria-pressed="false">${esc(t)}</button>`).join('');
  chips.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; pano.select(horizon.features.find((x) => x.id === b.dataset.id)); });
  $('#panoLeft').onclick = () => pano.look(pano.az - 30);
  $('#panoRight').onclick = () => pano.look(pano.az + 30);
  $('#panoHidden').onchange = (e) => { pano.showHidden = e.target.checked; pano.draw(); };

  // where the sun rises and sets today, seen from the top
  const S = horizon.summit, sky = horizon.sky, n = horizon.n, step = horizon.step;
  const at = (az) => sky[Math.round(((az % 360) + 360) % 360 / step) % n] / 100;
  const top = sunCrossings(now, S.lat, S.lon, at), low = sunCrossings(now, 53.7979, -9.5505, () => 0);
  const marks = [];
  const behind = (az, rise) => {
    const i = Math.round(az / step) % n;
    if (horizon.skySea[i]) {
      const near = horizon.features.filter((x) => x.status !== 'hidden' && ['island', 'peak'].includes(x.kind) && Math.abs(((x.az - az + 540) % 360) - 180) < 4)
        .sort((a, b) => Math.abs(((a.az - az + 540) % 360) - 180) - Math.abs(((b.az - az + 540) % 360) - 180))[0];
      const side = near ? ` just ${((near.az - az + 540) % 360) - 180 > 0 ? 'left' : 'right'} of ${near.name}` : '';
      return (rise ? 'out of the sea' : 'into the sea') + side;
    }
    const f = horizon.features.filter((x) => x.status !== 'hidden' && Math.abs(((x.az - az + 540) % 360) - 180) < 2.2 && Math.abs(x.km - horizon.skyKm[i]) < Math.max(4, x.km * 0.25))
      .sort((a, b) => Math.abs(a.az - az) - Math.abs(b.az - az))[0];
    return f ? (rise ? `over ${f.name}` : `behind ${f.name}`) : (rise ? 'over the hills' : 'behind the hills');
  };
  if (top.rise) marks.push({ az: top.rise.az, ang: at(top.rise.az), label: `sunrise ${hm(top.rise.t / 1000)}` });
  if (top.set) marks.push({ az: top.set.az, ang: at(top.set.az), label: `sunset ${hm(top.set.t / 1000)}` });
  pano.setMarks(marks);
  if (top.set) {
    const lag = low.set ? Math.round((top.set.t - low.set.t) / 60000) : null;
    $('#panoSun').innerHTML = `Today, from the top, the sun sets at ${hm(top.set.t / 1000)} <b>${esc(behind(top.set.az, false))}</b>${lag != null && lag > 0 ? `, about ${lag} minutes later than at Westport Quay` : ''}. It rises ${esc(behind(top.rise?.az ?? 0, true))}${top.rise ? ' at ' + hm(top.rise.t / 1000) : ''}.`;
  }
}

main().catch((e) => {
  console.error(e);
  const l = document.querySelector('#answerLine'); if (l) l.textContent = 'Something went wrong loading the page data. ' + e.message;
});
