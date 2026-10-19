// The Almanac: the tide tables at the top of a place page are built once a day. If this copy was
// built on an earlier day (say the daily build failed), redo them here with the same code.
const el = document.getElementById('tidesConfig');
if (el) {
  const c = JSON.parse(el.textContent);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(new Date());
  if (today !== c.builtDay) {
    try {
      const T = await import(new URL(c.module, location.href).href);
      const mods = await T.loadModules(new URL('js/', location.href).href);
      const get = (f) => fetch(f).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
      const [model, P] = await Promise.all([get('data/tide_model.json'), get('data/point.json')]);
      const r = T.placeTidesBlock(mods, { ...c.opts, model, P, from: Date.now(), dayHref: (d) => (c.dayKeys.includes(d.key) ? `${c.dayBase}${d.key}/` : null) });
      document.getElementById('tidesBlock').innerHTML = r.html;
    } catch (e) { console.info('tide tables: kept the built copy', e.message); }
  }
}
