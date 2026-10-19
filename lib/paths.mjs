// URLs. Pages are addressed by a site-relative path: '' (home), 'about/', 'westport/',
// 'westport/tide-times/2026-10-25/'. Internal links are written RELATIVE (so the same build works
// at a domain root or under a path prefix such as https://example.github.io/repo/); canonical,
// Open Graph, sitemap and JSON-LD URLs are ABSOLUTE, from the configured base URL.
import { posix } from 'node:path';

export function normBase(u) {
  const url = new URL(u);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  url.search = ''; url.hash = '';
  return url.href;
}

export const abs = (base, p) => new URL(p, base).href;
export const basePath = (base) => new URL(base).pathname; // '/' or '/repo/'

// relative link from page `from` to path `to` (both site-relative; trailing slash = directory)
export function rel(from, to) {
  const [toPath, hash = ''] = to.split('#');
  const fromDir = from === '' || from.endsWith('/') ? from : posix.dirname(from) + '/';
  let r = posix.relative('/' + fromDir, '/' + toPath);
  if (toPath === '' || toPath.endsWith('/')) r = r ? r + '/' : './';
  if (!r) r = './';
  return r + (hash ? '#' + hash : '');
}

export const depthOf = (p) => (p.match(/\//g) || []).length;
