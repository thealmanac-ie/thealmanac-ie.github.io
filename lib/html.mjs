// HTML helpers: parse/serialise with linkedom, and the SEO <head> every page gets.
import { parseHTML } from 'linkedom';
import { abs, rel } from './paths.mjs';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function parse(html) { return parseHTML(html).document; }
export function serialize(doc) { return '<!doctype html>\n' + doc.documentElement.outerHTML + '\n'; }

export function one(doc, sel) {
  const all = doc.querySelectorAll(sel);
  if (all.length !== 1) throw new Error(`expected exactly one element for "${sel}", found ${all.length}`);
  return all[0];
}
export function frag(doc, html) {
  const t = doc.createElement('template'); t.innerHTML = html.trim();
  return t.content ? t.content : (() => { const d = doc.createElement('div'); d.innerHTML = html; const f = doc.createDocumentFragment(); while (d.firstChild) f.appendChild(d.firstChild); return f; })();
}
export const insertAfter = (doc, el, html) => el.after(frag(doc, html));
export const insertBefore = (doc, el, html) => el.before(frag(doc, html));
export const append = (doc, el, html) => el.append(frag(doc, html));

// <head> tags for a page. page: { path, title, description, og: { path, width, height, alt }, type, jsonld[] }
export function headTags(site, page) {
  const url = abs(site.baseUrl, page.canonical || page.path); // a page may point search engines at another copy
  const img = page.og ? abs(site.baseUrl, page.og.path) : null;
  const m = (k, v, attr = 'property') => `<meta ${attr}="${k}" content="${esc(v)}">`;
  const tags = [
    `<link rel="canonical" href="${esc(url)}">`,
    m('og:type', page.type || 'website'), m('og:site_name', site.brand), m('og:title', page.ogTitle || page.title), m('og:description', page.description),
    m('og:url', url), m('og:locale', site.locale),
  ];
  if (img) tags.push(m('og:image', img), m('og:image:width', page.og.width), m('og:image:height', page.og.height), m('og:image:alt', page.og.alt));
  tags.push(m('twitter:card', img ? 'summary_large_image' : 'summary', 'name'), m('twitter:title', page.ogTitle || page.title, 'name'), m('twitter:description', page.description, 'name'));
  if (img) tags.push(m('twitter:image', img, 'name'), m('twitter:image:alt', page.og.alt, 'name'));
  tags.push(`<link rel="icon" href="${rel(page.path, 'assets/favicon.svg')}" type="image/svg+xml">`);
  for (const j of page.jsonld || []) tags.push(`<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`);
  return tags.join('\n');
}

// Put title, description and the SEO tags into an existing document's <head>.
export function applyHead(doc, site, page, { before = [], after = [] } = {}) {
  const head = doc.head;
  let t = head.querySelector('title'); if (!t) { t = doc.createElement('title'); head.append(t); }
  t.textContent = page.title;
  let d = head.querySelector('meta[name="description"]');
  if (!d) { d = doc.createElement('meta'); d.setAttribute('name', 'description'); t.after(d); }
  d.setAttribute('content', page.description);
  for (const r of head.querySelectorAll('meta[name="robots"]')) r.remove();
  if (before.length) insertAfter(doc, head.querySelector('meta[charset]') || t, before.join('\n'));
  insertAfter(doc, d, headTags(site, page));
  if (after.length) append(doc, head, after.join('\n'));
}

// JSON-LD building blocks
export const ldWebsite = (site) => ({ '@context': 'https://schema.org', '@type': 'WebSite', '@id': abs(site.baseUrl, '#website'), name: site.brand, url: site.baseUrl, inLanguage: site.lang, description: site.tagline });
export function ldPage(site, page, { about, crumbs, modified } = {}) {
  const u = abs(site.baseUrl, page.canonical || page.path);
  const out = [{ '@context': 'https://schema.org', '@type': 'WebPage', '@id': u + '#page', url: u, name: page.title, description: page.description,
    inLanguage: site.lang, isPartOf: { '@id': abs(site.baseUrl, '#website') }, ...(about ? { about } : {}), ...(modified ? { dateModified: modified } : {}),
    ...(page.og ? { primaryImageOfPage: { '@type': 'ImageObject', url: abs(site.baseUrl, page.og.path), width: page.og.width, height: page.og.height } } : {}) }];
  if (crumbs && crumbs.length > 1) out.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: abs(site.baseUrl, c.path) })) });
  return out;
}
