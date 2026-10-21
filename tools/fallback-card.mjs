// One-off: draw the site's fallback share card (1200x630 PNG) and home-page thumbnail (600x315 WebP),
// used only when a place's own card could neither be drawn nor found in the prerender cache
// (lib/fallback.mjs). Committed as assets/og-fallback.png and assets/thumb-fallback.webp.
//   node tools/fallback-card.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../lib/prerender.mjs';
import siteConfig from '../site.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, 'vendor/fonts', f)).toString('base64');
const browser = await launch();
const page = await browser.newPage();
const out = await page.evaluate(async ({ serif, sans, brand, tagline, kicker }) => {
  for (const [fam, src, w] of [['OT Serif', serif, '400 900'], ['OT Sans', sans, '400 700']]) { const f = new FontFace(fam, `url(${src})`, { weight: w }); await f.load(); document.fonts.add(f); }
  const draw = (W, H, words) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#f4efe6'; g.fillRect(0, 0, W, H);
    // two days of a semidiurnal tide, springs easing, drawn across the lower half
    const y = (x) => H * 0.72 - H * 0.12 * Math.cos((x / W) * 4 * Math.PI * 2 + 0.6) * (1 - 0.25 * x / W);
    g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 4) g.lineTo(x, y(x)); g.lineTo(W, H); g.closePath();
    g.fillStyle = 'rgba(42,127,184,.16)'; g.fill();
    g.beginPath(); for (let x = 0; x <= W; x += 4) (x ? g.lineTo(x, y(x)) : g.moveTo(x, y(x))); g.strokeStyle = '#1d5f73'; g.lineWidth = W / 300; g.stroke();
    if (words) {
      g.fillStyle = '#2c4150'; g.font = '700 22px "OT Sans"'; g.letterSpacing = '4px'; g.fillText(kicker.toUpperCase(), 64, 92); g.letterSpacing = '0px';
      g.fillStyle = '#0f1d26'; g.font = '800 96px "OT Serif"'; g.fillText(brand, 60, 210);
      g.fillStyle = '#1d5f73'; g.font = '600 34px "OT Sans"'; g.fillText(tagline, 64, 268);
    }
    return c;
  };
  return { og: draw(1200, 630, true).toDataURL('image/png'), thumb: draw(600, 315, false).toDataURL('image/webp', 0.84) };
}, { serif: font('fraunces-latin.woff2'), sans: font('inter-latin.woff2'), brand: siteConfig.brand, kicker: siteConfig.customDomain || 'Live and local', tagline: 'Tides, sun, moon and weather, place by place' });
await browser.close();
fs.writeFileSync(path.join(ROOT, 'assets/og-fallback.png'), Buffer.from(out.og.split(',')[1], 'base64'));
fs.writeFileSync(path.join(ROOT, 'assets/thumb-fallback.webp'), Buffer.from(out.thumb.split(',')[1], 'base64'));
console.log('wrote assets/og-fallback.png and assets/thumb-fallback.webp');
