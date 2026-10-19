// Assemble a lab app for one place: vendored files, then the place's overlay files
// (places/<slug>/app/, same layout as the app), then the template's adapter, then minification.
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const walk = (dir, base = dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
};
const isText = (f) => /\.(html|js|css|json|svg)$/.test(f);

export function readApp(root, appName, slug) {
  const files = {}, from = {};
  const vend = path.join(root, 'vendor', appName), over = path.join(root, 'places', slug, 'app');
  if (!fs.existsSync(vend)) throw new Error(`vendor/${appName} is missing: run npm run sync`);
  for (const [dir, label] of [[vend, `vendor/${appName}`], [over, `places/${slug}/app`]]) {
    for (const f of walk(dir)) { files[f] = isText(f) ? fs.readFileSync(path.join(dir, f), 'utf8') : fs.readFileSync(path.join(dir, f)); from[f] = label; }
  }
  return { files, from };
}

export async function writeApp(files, outDir, { minify = true, skip = ['index.html'] } = {}) {
  for (const [f, body] of Object.entries(files)) {
    if (skip.includes(f)) continue;
    let out = body;
    if (minify && typeof body === 'string' && /\.(js|css)$/.test(f)) {
      out = (await esbuild.transform(body, { loader: f.endsWith('.css') ? 'css' : 'js', minify: true, format: f.endsWith('.js') ? 'esm' : undefined, target: 'es2022', legalComments: 'none' })).code;
    } else if (minify && typeof body === 'string' && f.endsWith('.json')) {
      out = JSON.stringify(JSON.parse(body));
    }
    fs.mkdirSync(path.dirname(path.join(outDir, f)), { recursive: true });
    fs.writeFileSync(path.join(outDir, f), out);
  }
}

// Static ES-module graph from an entry (for <link rel="modulepreload">).
export function moduleGraph(files, entry) {
  const seen = new Set(), order = [];
  const visit = (f) => {
    if (seen.has(f) || files[f] == null) return; seen.add(f); order.push(f);
    for (const m of files[f].matchAll(/(?:^|[;\n])\s*import\s[^'"]*?from\s*['"](\.\/[^'"]+)['"]/g)) visit(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
  };
  visit(entry);
  return order;
}

// JSON files the app fetches as soon as it starts (for <link rel="preload" as="fetch">).
export function startupData(files, entry = 'js/app.js') {
  const js = files[entry] || '';
  const list = new Set();
  const arr = /\[([^\]]*)\]\.map\(\(f\) => load\(`data\/\$\{f\}\.json`\)\)/.exec(js);
  if (arr) for (const m of arr[1].matchAll(/'([\w-]+)'/g)) list.add(`data/${m[1]}.json`);
  const arr2 = /\[((?:\s*'data\/[\w.-]+\.json',?)+)\]\.map\(getJSON\)/.exec(js);
  if (arr2) for (const m of arr2[1].matchAll(/'(data\/[\w.-]+\.json)'/g)) list.add(m[1]);
  return [...list].filter((f) => files[f] != null);
}

// The app's DOM contract: element ids its scripts look up, minus those its scripts create themselves.
// A place's own index.html must keep all of them (the build stops otherwise).
export function missingIds(files) {
  const js = Object.entries(files).filter(([f]) => f.startsWith('js/') && f.endsWith('.js')).map(([, t]) => t).join('\n');
  const used = new Set([...js.matchAll(/(?:\$|querySelector(?:All)?)\(\s*['"`]#([\w-]+)/g), ...js.matchAll(/getElementById\(\s*['"`]([\w-]+)['"`]/g)].map((m) => m[1]));
  const made = new Set([...js.matchAll(/\bid="([\w-]+)"/g), ...js.matchAll(/\.id = ['"`]([\w-]+)/g)].map((m) => m[1]));
  const html = files['index.html'] || '';
  return [...used].filter((id) => !made.has(id) && !new RegExp(`\\bid="${id}"`).test(html));
}
