// npm run sync: copy the lab apps' runtime files into vendor/ so the repo builds on its own (CI has
// no lab folders). Only what the pages load is copied: index.html, css/, js/, data/ (minus the
// exclusions below). Text files are scrubbed (lib/scrub.mjs) and the copy fails if anything on the
// deny list survives. vendor/MANIFEST.json records a hash per file, so `git diff` shows what changed.
//
//   npm run sync                      # from ../swim and ../reek (the lab folders next to this repo)
//   SWIM_DIR=… REEK_DIR=… npm run sync
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scrubText, findDenied, TEXT_EXT, hasLocalList } from '../lib/scrub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = {
  swim: { dir: process.env.SWIM_DIR || '../swim', include: ['index.html', 'css', 'js', 'data'], exclude: ['data/seabed.json'] },
  reek: { dir: process.env.REEK_DIR || '../reek', include: ['index.html', 'css', 'js', 'data'], exclude: [] },
};

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const manifestFile = path.join(ROOT, 'vendor', 'MANIFEST.json');
const old = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { apps: {} };
const manifest = { about: 'Runtime files of the lab apps, copied and scrubbed by tools/sync.mjs. Do not edit by hand: change the lab app and re-sync.', synced: new Date().toISOString(), apps: {} };
const problems = [];
if (!hasLocalList()) console.warn('note: no .scrub.local.json here, so only the generic privacy patterns are checked');

for (const [name, app] of Object.entries(APPS)) {
  const src = path.resolve(ROOT, app.dir);
  if (!fs.existsSync(path.join(src, 'index.html'))) { console.error(`sync: ${name}: no index.html in ${app.dir} (set ${name.toUpperCase()}_DIR)`); process.exit(1); }
  const dst = path.join(ROOT, 'vendor', name);
  fs.rmSync(dst, { recursive: true, force: true });
  const files = {};
  const copy = (rel) => {
    const s = path.join(src, rel);
    if (!fs.existsSync(s) || app.exclude.includes(rel) || path.basename(rel).startsWith('.')) return;
    if (fs.statSync(s).isDirectory()) { for (const e of fs.readdirSync(s).sort()) copy(path.join(rel, e)); return; }
    let buf = fs.readFileSync(s);
    if (TEXT_EXT.test(rel)) {
      const text = scrubText(buf.toString('utf8'));
      for (const h of findDenied(text)) problems.push(`${name}/${rel}: ${h.label}: "${h.match}"`);
      buf = Buffer.from(text, 'utf8');
    }
    fs.mkdirSync(path.dirname(path.join(dst, rel)), { recursive: true });
    fs.writeFileSync(path.join(dst, rel), buf);
    files[rel.split(path.sep).join('/')] = sha(buf);
  };
  for (const inc of app.include) copy(inc);
  manifest.apps[name] = { from: `${path.basename(src)} (lab folder)`, files };
  const before = old.apps?.[name]?.files || {};
  const changed = Object.keys(files).filter((f) => before[f] !== files[f]);
  const gone = Object.keys(before).filter((f) => !(f in files));
  console.log(`sync: ${name}: ${Object.keys(files).length} files${changed.length ? `, changed: ${changed.join(', ')}` : ', no changes'}${gone.length ? `, removed: ${gone.join(', ')}` : ''}`);
}
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + '\n');
if (problems.length) { console.error('sync: denied strings left after scrubbing:\n  ' + problems.join('\n  ')); process.exit(1); }
