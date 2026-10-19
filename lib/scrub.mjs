// Hygiene for everything that ends up public: the vendored lab apps, the built site and this repo.
//
// Two layers:
//  - generic patterns, kept here: e-mail addresses, absolute local paths, private network addresses;
//  - a private list, kept OUT of the repo in .scrub.local.json (git-ignored): words that must never be
//    published (names, handles, host names, other projects) and rewrites for the few internal
//    references the lab apps carry. Format:
//      { "replace": [["regex source", "replacement"], ...], "deny": ["word or phrase", ...] }
// `npm run sync`, `npm run build` and `npm test` fail if anything denied turns up.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GENERIC = [
  [/[A-Z0-9._%+-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)*\.[A-Z]{2,}/i, 'an e-mail address'],
  [/(^|[\s"'`(=])\/(root|home|Users)\/[\w.-]/, 'an absolute local path'],
  [/\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/, 'a private network address'],
  [/\b(10\.\d{1,3}|192\.168)\.\d{1,3}\.\d{1,3}\b(?![\d.])/, 'a private network address'],
  [/\.ts\.net\b/i, 'a private network name'],
];
// e-mail-like strings that are fine to publish
const ALLOW = [/^noreply@github\.com$/i, /users\.noreply\.github\.com$/i, /^git@github\.com$/i];

function loadLocal() {
  const f = path.join(ROOT, '.scrub.local.json');
  if (!fs.existsSync(f)) return { replace: [], deny: [] };
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ -]/g, '[ -]?');
  return {
    replace: (j.replace || []).map(([a, b]) => [new RegExp(a, 'g'), b]),
    deny: (j.deny || []).map((w) => [new RegExp(`(?<![a-z])${esc(w)}(?![a-z])`, 'i'), 'a private word']),
  };
}
const LOCAL = loadLocal();
export const hasLocalList = () => LOCAL.deny.length > 0;

export const scrubText = (s) => LOCAL.replace.reduce((t, [a, b]) => t.replace(a, b), s);

export function findDenied(text) {
  const hits = [];
  for (const [re, label] of [...GENERIC, ...LOCAL.deny]) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of text.matchAll(g)) {
      const hit = m[0].trim().replace(/^["'`(=]/, '');
      if (ALLOW.some((a) => a.test(hit))) continue;
      hits.push({ label, match: hit, at: m.index });
    }
  }
  return hits;
}

export const TEXT_EXT = /\.(html?|m?js|cjs|css|json|txt|md|svg|xml|ya?ml|webmanifest)$/i;

// Walk files under dir (skipping some folders) and report denied strings: [{file, line, label, match}]
export function scanTree(dir, { skip = [] } = {}) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name), rel = path.relative(dir, p);
      if (skip.some((s) => rel === s || rel.startsWith(s + path.sep))) continue;
      if (e.isDirectory()) { walk(p); continue; }
      if (!TEXT_EXT.test(e.name)) continue;
      const text = fs.readFileSync(p, 'utf8');
      for (const h of findDenied(text)) out.push({ file: rel, line: text.slice(0, h.at).split('\n').length, label: h.label, match: h.match });
    }
  };
  walk(dir);
  return out;
}
