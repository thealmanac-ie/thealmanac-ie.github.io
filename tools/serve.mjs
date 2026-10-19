// npm run serve: serve dist/ on 127.0.0.1 (PORT, default 8080), optionally under a path prefix.
//   PREFIX=/almanac/ npm run serve
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../lib/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const s = await serve(path.join(ROOT, 'dist'), { prefix: process.env.PREFIX || '/', port: +(process.env.PORT || 8080) });
console.log(`serving dist/ at ${s.url} (Ctrl-C to stop)`);
