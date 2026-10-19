// npm run fonts: self-host the two web fonts the mountain page uses (Fraunces, Inter; SIL OFL 1.1),
// so pages make no request to Google. Run once; the files in vendor/fonts/ are committed.
// Keeps the latin and latin-ext subsets (enough for English and Irish), one variable file each.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'vendor', 'fonts');
const CSS = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,800;9..144,900&family=Inter:wght@400;500;600;700&display=swap';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const KEEP = ['latin', 'latin-ext'];
const WEIGHTS = { Fraunces: '400 900', Inter: '400 700' };
const LICENCES = { Fraunces: 'https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt', Inter: 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt' };

const get = async (u, type = 'text') => { const r = await fetch(u, { headers: { 'user-agent': UA } }); if (!r.ok) throw new Error(`${u}: ${r.status}`); return type === 'buf' ? Buffer.from(await r.arrayBuffer()) : r.text(); };

fs.mkdirSync(OUT, { recursive: true });
const css = await get(CSS);
const blocks = [...css.matchAll(/\/\* ([a-z-]+) \*\/\s*@font-face\s*\{([^}]*)\}/g)].map(([, subset, body]) => ({
  subset, family: /font-family:\s*'([^']+)'/.exec(body)[1], url: /url\(([^)]+)\)/.exec(body)[1], range: /unicode-range:\s*([^;]+);/.exec(body)[1],
}));
const seen = new Map();
for (const b of blocks) if (KEEP.includes(b.subset) && !seen.has(`${b.family}/${b.subset}`)) seen.set(`${b.family}/${b.subset}`, b);
let out = '/* Self-hosted copies of Google Fonts (SIL Open Font License 1.1, see OFL-*.txt). Made by tools/fonts.mjs. */\n';
for (const b of seen.values()) {
  const file = `${b.family.toLowerCase()}-${b.subset}.woff2`;
  fs.writeFileSync(path.join(OUT, file), await get(b.url, 'buf'));
  out += `@font-face { font-family: '${b.family}'; font-style: normal; font-weight: ${WEIGHTS[b.family]}; font-display: swap; src: url(${file}) format('woff2'); unicode-range: ${b.range}; }\n`;
  console.log('fonts:', file, fs.statSync(path.join(OUT, file)).size, 'bytes');
}
fs.writeFileSync(path.join(OUT, 'fonts.css'), out);
for (const [fam, u] of Object.entries(LICENCES)) fs.writeFileSync(path.join(OUT, `OFL-${fam}.txt`), await get(u));
