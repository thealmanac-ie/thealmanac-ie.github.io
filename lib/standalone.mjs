// A standalone page (no lab app): site chrome, SEO head, JSON-LD, inlined CSS.
import fs from 'node:fs';
import path from 'node:path';
import { parse, serialize, applyHead } from './html.mjs';

export function writeStandalone(ctx, meta, bodyHtml, { css = '', themeColor = '#0b1622' } = {}) {
  const doc = parse(`<!doctype html><html lang="${ctx.site.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title></title><meta name="theme-color" content="${themeColor}"></head><body class="site"><div class="wrap">${bodyHtml}</div></body></html>`);
  applyHead(doc, ctx.site, { ...meta, ogTitle: meta.ogTitle || meta.title }, { after: [`<style>${ctx.css.site}${css}</style>`] });
  fs.mkdirSync(path.join(ctx.dist, meta.path), { recursive: true });
  fs.writeFileSync(path.join(ctx.dist, meta.path, 'index.html'), serialize(doc));
}
