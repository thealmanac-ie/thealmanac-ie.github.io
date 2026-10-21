// Template "swim": a swim spot, of one of two kinds (place.json "swim": { "kind": … }):
//   depth  the swim depends on how much water there is at a fixed point (steps, a slip, a pool), and the
//          answer is the Point-style verdict: predicted level minus the measured level of that point.
//          The full interactive page is the swim lab app (templates/tide-swim, Westport's Point).
//   deep   deep at every state of the tide, so the sea decides: tide state, wind and swell exposure from
//          the coastline's fetch, sea temperature, the EPA's water quality and any notice (./deep.mjs).
// The hub (/swims/, template swim-hub) lists both kinds side by side.
import * as depth from '../tide-swim/index.mjs';
import * as deep from './deep.mjs';

const K = (place) => {
  const k = place.swim?.kind;
  if (k === 'deep') return deep;
  if (k === 'depth') return depth;
  throw new Error(`places/${place.slug}: swim.kind must be "depth" or "deep", got ${JSON.stringify(k)}`);
};
export const kindOf = (place) => place.swim?.kind;
export const prepare = (ctx, p) => K(p).prepare(ctx, p);
export const provisional = (ctx, p, info) => K(p).provisional?.(ctx, p, info);
export const prerender = (ctx, p, info, browser) => K(p).prerender(ctx, p, info, browser);
export const cacheable = (pr, p) => (p ? K(p).cacheable?.(pr) : pr);
export const write = (ctx, p, info, pr) => K(p).write(ctx, p, info, pr);
export const teaser = (ctx, p, info, pr) => K(p).teaser(ctx, p, info, pr);
