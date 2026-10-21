// The Almanac: the live column of the swims hub. One Open-Meteo forecast request and one marine
// request for every deep-water spot at once (cached an hour), then each spot's sea-state word now.
const cfg = JSON.parse(document.getElementById('hubConfig').textContent);
const sea = await import(new URL(cfg.sea, location.href).href);
const q = (base, o) => { const u = new URL(base); for (const [a, b] of Object.entries(o)) u.searchParams.set(a, b); return u.toString(); };
async function cached(key, url, ms = 12000) {
  const k = `swims:hub:${key}`;
  try { const c = JSON.parse(localStorage.getItem(k) || 'null'); if (c && Date.now() - c.at < 3600000 && c.url === url) return c.data; } catch { /* no storage */ }
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); const d = await r.json(); try { localStorage.setItem(k, JSON.stringify({ at: Date.now(), url, data: d })); } catch { /* quota */ } return d; } finally { clearTimeout(timer); }
}
const cells = document.querySelectorAll('.hublist .sea[data-slug]');
const say = (slug, html, tone) => { for (const c of cells) if (c.dataset.slug === slug) { c.innerHTML = html; if (tone) c.classList.add(`tone-${tone}`); } };
const S = cfg.spots, list = (k) => S.map((s) => s[k]);
try {
  const [fc, mar] = await Promise.all([
    cached('fc', q('https://api.open-meteo.com/v1/forecast', { latitude: list('entry').map((p) => p.lat).join(','), longitude: list('entry').map((p) => p.lon).join(','), hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m', wind_speed_unit: 'kmh', timezone: 'Europe/Dublin', timeformat: 'unixtime', forecast_days: 2 })),
    cached('marine', q('https://marine-api.open-meteo.com/v1/marine', { latitude: list('marine').map((p) => p.lat).join(','), longitude: list('marine').map((p) => p.lon).join(','), hourly: 'swell_wave_height,swell_wave_direction,swell_wave_period', cell_selection: 'sea', timezone: 'Europe/Dublin', timeformat: 'unixtime', forecast_days: 2 })),
  ]);
  const F = Array.isArray(fc) ? fc : [fc], M = Array.isArray(mar) ? mar : [mar];
  S.forEach((s, k) => {
    const f = F[k].hourly, m = M[k].hourly, i = Math.max(0, f.time.findIndex((t) => t * 1000 > Date.now() - 1800000)), j = m.time.indexOf(f.time[i]);
    const st = sea.seaState({ wind: f.wind_speed_10m[i], windDir: f.wind_direction_10m[i], gust: f.wind_gusts_10m[i], swell: j >= 0 ? m.swell_wave_height[j] : null, swellDir: j >= 0 ? m.swell_wave_direction[j] : null }, s.fetch);
    say(s.slug, `<span class="w">Sea now: <b>${st.word}</b>, ${sea.metres(st.total)} (estimated)</span>`, st.tone);
  });
} catch {
  for (const s of S) say(s.slug, `<span class="w">Sea: the forecast didn't load</span>`);
}
