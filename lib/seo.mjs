// sitemap.xml, robots.txt, and the checks every build must pass (the SEO checklist, enforced).
import fs from 'node:fs';
import path from 'node:path';
import { parse } from './html.mjs';
import { abs } from './paths.mjs';
import { scanTree } from './scrub.mjs';

const xmlEsc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export function sitemap(site, pages) {
  const urls = pages.filter((p) => p.index !== false).map((p) => `  <url><loc>${xmlEsc(abs(site.baseUrl, p.path))}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
export const robots = (site) => `User-agent: *\nAllow: /\n\nSitemap: ${abs(site.baseUrl, 'sitemap.xml')}\n`;

const pngSize = (buf) => (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG' ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null);

// Map an absolute URL under the base to a file in dist (null if outside the site).
function fileFor(dist, site, url) {
  const u = new URL(url), b = new URL(site.baseUrl);
  if (u.origin !== b.origin || !u.pathname.startsWith(b.pathname)) return null;
  let p = decodeURIComponent(u.pathname.slice(b.pathname.length));
  if (p === '' || p.endsWith('/')) p += 'index.html';
  return path.join(dist, p);
}

export function check(dist, site, pages) {
  const errors = [], warn = [];
  const seen = { title: new Map(), desc: new Map() };
  const all = [...pages.map((p) => ({ ...p, file: path.join(dist, p.path, 'index.html') })), { path: '404.html', file: path.join(dist, '404.html'), index: false, is404: true }];
  for (const p of all) {
    const where = p.path || '(home)';
    if (!fs.existsSync(p.file)) { errors.push(`${where}: missing ${path.relative(dist, p.file)}`); continue; }
    const doc = parse(fs.readFileSync(p.file, 'utf8'));
    const pageUrl = abs(site.baseUrl, p.path);
    const meta = (k) => doc.querySelector(`meta[property="${k}"], meta[name="${k}"]`)?.getAttribute('content');
    if (doc.documentElement.getAttribute('lang') !== site.lang) errors.push(`${where}: <html lang> is not ${site.lang}`);
    const h1 = doc.querySelectorAll('h1').length; if (h1 !== 1) errors.push(`${where}: ${h1} <h1> elements`);
    const title = doc.querySelector('title')?.textContent?.trim();
    if (!title) errors.push(`${where}: no <title>`);
    const desc = meta('description');
    if (!p.is404) {
      if (!desc) errors.push(`${where}: no meta description`); else if (desc.length < 50 || desc.length > 170) warn.push(`${where}: description is ${desc.length} characters`);
      for (const [k, v] of [['title', title], ['desc', desc]]) { if (seen[k].has(v)) errors.push(`${where}: same ${k} as ${seen[k].get(v)}`); seen[k].set(v, where); }
      const canon = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
      if (canon !== pageUrl) errors.push(`${where}: canonical is ${canon}, expected ${pageUrl}`);
      if (meta('og:url') !== pageUrl) errors.push(`${where}: og:url is ${meta('og:url')}`);
      for (const k of ['og:title', 'og:description', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:image']) if (!meta(k)) errors.push(`${where}: no ${k}`);
      const img = meta('og:image');
      if (img) {
        const f = fileFor(dist, site, img);
        if (!f || !fs.existsSync(f)) errors.push(`${where}: og:image ${img} is not in the build`);
        else { const sz = pngSize(fs.readFileSync(f)); if (!sz || sz.w !== 1200 || sz.h !== 630) errors.push(`${where}: og:image is not a 1200x630 PNG`); }
      }
      if (/noindex/i.test(meta('robots') || '')) errors.push(`${where}: noindex`);
      const lds = [...doc.querySelectorAll('script[type="application/ld+json"]')];
      if (!lds.length) errors.push(`${where}: no JSON-LD`);
      for (const s of lds) { try { const j = JSON.parse(s.textContent); if (!j['@context'] || !j['@type']) errors.push(`${where}: JSON-LD without @context/@type`); } catch (e) { errors.push(`${where}: JSON-LD does not parse (${e.message})`); } }
    }
    for (const im of doc.querySelectorAll('img[src]')) {
      if (!im.hasAttribute('alt')) errors.push(`${where}: <img src="${im.getAttribute('src')}"> has no alt`);
      if (!im.getAttribute('width') || !im.getAttribute('height')) warn.push(`${where}: <img src="${im.getAttribute('src')}"> has no width/height`);
    }
    // every internal reference must exist in the build
    const refs = [...doc.querySelectorAll('a[href], link[href], script[src], img[src]')].map((e) => e.getAttribute('href') ?? e.getAttribute('src'));
    for (const r of refs) {
      if (!r || /^(mailto:|tel:|data:|javascript:|#)/.test(r)) continue;
      const u = new URL(r, p.is404 ? site.baseUrl : pageUrl);
      if (!/^https?:$/.test(u.protocol)) continue;
      const f = fileFor(dist, site, u.href);
      if (f === null) { if (u.origin === new URL(site.baseUrl).origin) errors.push(`${where}: link outside the site's base path: ${r}`); continue; }
      if (!fs.existsSync(f) && !fs.existsSync(path.join(f, 'index.html'))) errors.push(`${where}: broken link ${r}`);
    }
  }
  // the sitemap lists exactly the indexable pages, all present
  const sm = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  for (const l of locs) { const f = fileFor(dist, site, l); if (!f || !fs.existsSync(f)) errors.push(`sitemap: ${l} is not in the build`); }
  for (const p of pages) if (p.index !== false && !locs.includes(abs(site.baseUrl, p.path))) errors.push(`sitemap: ${p.path} missing`);
  for (const h of scanTree(dist)) errors.push(`privacy: ${h.file}:${h.line}: ${h.label} "${h.match}"`);
  return { errors, warn };
}
