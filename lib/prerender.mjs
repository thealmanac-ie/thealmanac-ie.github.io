// Prerendering in headless Chromium (Playwright). The lab apps render most of their text with
// JavaScript; rather than re-implement any of it, the build loads each app page, lets its own code
// run, and copies the rendered fragments (by selector) into the static HTML. The live code then runs
// again in visitors' browsers and refreshes them. Also used for: the share-card images (drawn with
// each app's own hero renderer), the per-day tide charts (the app's own chart code) and posters.
import fs from 'node:fs';

let pw;
async function playwright() {
  if (!pw) {
    try { pw = await import('playwright-core'); } catch { throw new Error('playwright-core is not installed (npm ci)'); }
  }
  return pw;
}

export async function launch() {
  const { chromium } = await playwright();
  try { return await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb'] }); } catch (e) {
    throw new Error(`could not start headless Chromium (${e.message.split('\n')[0]}). Install it with: npx playwright-core install --only-shell chromium`);
  }
}

// Open a page with external requests limited to `allow` hosts (everything else is aborted).
export async function open(browser, url, { viewport = { width: 390, height: 844 }, allow = [], mobile = true } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'en-IE', timezoneId: 'Europe/Dublin', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const log = [];
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') log.push(`console: ${m.text()}`); });
  await page.route('**/*', (r) => {
    const h = new URL(r.request().url()).hostname;
    if (h === '127.0.0.1' || allow.includes(h)) r.continue(); else r.abort('blockedbyclient');
  });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  return { page, log, close: () => ctx.close() };
}

// Extract fragments. spec: [{ key, sel, html?, text?, all?, attrs? }]
export async function extract(page, spec) {
  return page.evaluate((spec) => {
    const out = {};
    for (const s of spec) {
      const els = [...document.querySelectorAll(s.sel)];
      if (s.all) { out[s.key] = els.map((e) => (s.html ? e.innerHTML : e.textContent)); continue; }
      if (els.length !== 1) { out[s.key] = null; continue; }
      const e = els[0], r = {};
      if (s.html) r.html = e.innerHTML;
      if (s.text) r.text = e.textContent;
      if (s.attrs) r.attrs = Object.fromEntries(s.attrs.map((a) => [a, e.getAttribute(a)]));
      out[s.key] = r;
    }
    return out;
  }, spec);
}

export const dataUrlToBuffer = (u) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64');
export const saveDataUrl = (u, file) => fs.writeFileSync(file, dataUrlToBuffer(u));

// Draw a 1200x630 share card with the site's own fonts. Returns a PNG data URL. Layouts:
//   { scene: '#canvas' or data URL, anchor }  full-bleed picture, words bottom-left
//   { panel: { card: data URL, title, subtitle, line } }  words on paper left, a square card right
export async function composeCard(page, o) {
  return page.evaluate(async (o) => {
    const load = async (fam, file, weight) => { const f = new FontFace(fam, `url(${o.fontBase}${file})`, { weight }); await f.load(); document.fonts.add(f); };
    await load('OT Serif', 'fraunces-latin.woff2', '400 900');
    await load('OT Sans', 'inter-latin.woff2', '400 700');
    const W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const cover = (im, x, y, w, h, fy = 0.5, fx = 0.5) => {
      const iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight, s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
      g.drawImage(im, (iw - sw) * fx, (ih - sh) * fy, sw, sh, x, y, w, h);
    };
    const wrap = (text, maxW) => { const out = []; let row = ''; for (const w of text.split(' ')) { const t = row ? row + ' ' + w : w; if (g.measureText(t).width > maxW && row) { out.push(row); row = w; } else row = t; } if (row) out.push(row); return out; };
    if (o.panel) {
      const P = o.panel, PW = W - H, M = 56, inner = PW - 2 * M;
      g.fillStyle = '#f4efe6'; g.fillRect(0, 0, W, H);
      cover(await img(P.card), PW, 0, H, H);
      g.fillStyle = 'rgba(15,29,38,.12)'; g.fillRect(PW - 1, 0, 2, H);
      g.fillStyle = '#2c4150'; g.font = '700 22px "OT Sans"'; g.letterSpacing = '4px'; g.fillText(o.brand.toUpperCase(), M, 82); g.letterSpacing = '0px';
      let size = 74; g.font = `800 ${size}px "OT Serif"`;
      let rows = wrap(P.title, inner);
      while ((rows.length > 3 || rows.some((r) => g.measureText(r).width > inner)) && size > 44) { size -= 4; g.font = `800 ${size}px "OT Serif"`; rows = wrap(P.title, inner); }
      let y = 150 + size * 0.8; g.fillStyle = '#0f1d26';
      for (const r of rows) { g.fillText(r, M - 2, y); y += size * 1.04; }
      g.font = '650 31px "OT Sans"'; g.fillStyle = '#1d5f73'; y += 8;
      for (const r of wrap(P.subtitle, inner)) { g.fillText(r, M, y); y += 40; }
      if (P.line) { g.font = '500 22px "OT Sans"'; g.fillStyle = '#2c4150'; const rs = wrap(P.line, inner); let yy = H - 56 - (rs.length - 1) * 31; for (const r of rs) { g.fillText(r, M, yy); yy += 31; } }
    } else {
      const src = typeof o.scene === 'string' && o.scene.startsWith('data:') ? await img(o.scene) : document.querySelector(o.scene);
      cover(src, 0, 0, W, H, o.anchor ?? 0.5, o.ax ?? 0.5);
      const gr = g.createLinearGradient(0, H * 0.45, 0, H);
      gr.addColorStop(0, 'rgba(6,12,18,0)'); gr.addColorStop(1, 'rgba(6,12,18,.7)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const M = 64; g.fillStyle = '#fff';
      g.font = '700 24px "OT Sans"'; g.letterSpacing = '4px'; g.fillText(o.brand.toUpperCase(), M, H - 64 - 52 - 98); g.letterSpacing = '0px';
      let size = 84; g.font = `800 ${size}px "OT Serif"`;
      while (g.measureText(o.title).width > W - 2 * M && size > 48) { size -= 4; g.font = `800 ${size}px "OT Serif"`; }
      g.fillText(o.title, M - 3, H - 64 - 52);
      g.font = '500 32px "OT Sans"'; g.fillStyle = 'rgba(255,255,255,.93)'; g.fillText(o.subtitle, M, H - 64);
    }
    return c.toDataURL('image/png');
  }, o);
}
