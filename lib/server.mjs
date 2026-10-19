// A tiny static server for the build (prerendering) and for local testing. Binds to 127.0.0.1 only.
// Serves `root` under `prefix` (e.g. '/' or '/repo/'), gzips text like GitHub Pages does, and
// answers unknown paths with the site's 404.html and a 404 status.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const TEXT = /^(text\/|application\/(json|xml|manifest)|image\/svg)/;

export function serve(root, { prefix = '/', port = 0 } = {}) {
  if (!prefix.endsWith('/')) prefix += '/';
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    const send = (code, file) => {
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      let body = fs.readFileSync(file);
      const headers = { 'content-type': type, 'cache-control': 'no-cache' };
      if (TEXT.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { body = zlib.gzipSync(body, { level: 6 }); headers['content-encoding'] = 'gzip'; }
      headers['content-length'] = body.length;
      res.writeHead(code, headers); res.end(req.method === 'HEAD' ? undefined : body);
    };
    const notFound = () => { const f = path.join(root, '404.html'); if (fs.existsSync(f)) send(404, f); else { res.writeHead(404); res.end('not found'); } };
    if (!p.startsWith(prefix)) { if (p + '/' === prefix) { res.writeHead(301, { location: prefix }); res.end(); return; } return notFound(); }
    p = p.slice(prefix.length);
    let file = path.join(root, p);
    if (!file.startsWith(path.resolve(root))) return notFound();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!url.pathname.endsWith('/')) { res.writeHead(301, { location: url.pathname + '/' + url.search }); res.end(); return; }
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file)) return notFound();
    send(200, file);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const { port: actual } = server.address();
    resolve({ url: `http://127.0.0.1:${actual}${prefix}`, port: actual, close: () => new Promise((r) => server.close(r)) });
  }));
}
