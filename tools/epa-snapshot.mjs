// Refresh the committed EPA snapshot (places/swims/epa-snapshot.json): the last resort the build uses
// when the EPA's API and the build cache are both unavailable. Pages built from it say so, with its date.
//   node tools/epa-snapshot.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchEpa } from '../lib/epa.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = fs.readdirSync(path.join(ROOT, 'places')).flatMap((d) => { const f = path.join(ROOT, 'places', d, 'place.json'); return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')).swim?.epa || []).map((e) => e.id) : []; });
const d = await fetchEpa([...new Set(ids)]);
if (!d.ok) { console.error('EPA API unavailable:', d.errors.join('; ')); process.exit(1); }
d.alertsFrom = d.alertsOk ? d.fetchedAt : null; d.measurementsFrom = d.measurementsOk ? d.fetchedAt : null;
fs.writeFileSync(path.join(ROOT, 'places', 'swims', 'epa-snapshot.json'), JSON.stringify({ about: 'Snapshot of the EPA Bathing Water Open Data API (data.epa.ie/bw, CC BY 4.0) for the swim spots; refreshed by tools/epa-snapshot.mjs; used only if the live API and the build cache both fail.', ...d }, null, 1) + '\n');
console.log(`snapshot: ${Object.keys(d.locations).length} of ${ids.length} bathing waters; alerts ${d.alertsOk ? d.alerts.length : 'unavailable'}; measurements ${d.measurementsOk ? 'ok' : 'unavailable'}${d.errors.length ? ' (' + d.errors.join('; ') + ')' : ''}`);
