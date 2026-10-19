// "Check the model": a regular says what the water was doing at the steps at a given time; the page
// shows what water level that implies against the prediction. Saved checks go into the same
// on-phone log as dips (src: 'check'), so every sighting feeds one correction. Nothing is sent anywhere.
import { hm, dateLabel, localParts, fromLocal, esc, m1, sgn } from './util.js';
import * as LOG from './log.js';

export function initCheck({ pt, P, P0, now, reload, onChange }) {
  const $ = (s) => document.querySelector(s);
  const f = $('#chk');
  if (!f) return;
  const p = localParts(now);
  f.date.value = `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  f.time.value = `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
  f.step.max = P0.steps.count;

  function kindChanged() {
    const k = f.kind.value;
    $('#chkStepRow').hidden = k !== 'step';
    $('#chkDepthRow').hidden = k !== 'depth';
  }
  f.kind.addEventListener('change', kindChanged); kindChanged();

  const FRAC = { ankle: 0.069, knee: 0.285, hip: 0.53, waist: 0.63, chest: 0.72, shoulder: 0.818 };
  function where() {
    const k = f.kind.value;
    if (k === 'top') return { kind: 'platform' };
    if (k === 'foot') return { kind: 'foot' };
    if (k === 'step') return { kind: 'step', n: Math.max(1, Math.min(P0.steps.count, +f.step.value || 1)) };
    return { kind: 'body', part: f.body.value, frac: FRAC[f.body.value], h: (+f.height.value || 172) / 100 };
  }
  function when() {
    const [y, mo, d] = f.date.value.split('-').map(Number), [hh, mi] = f.time.value.split(':').map(Number);
    return fromLocal(y, mo, d, hh, mi);
  }
  // how many minutes would the predicted curve have to shift to hit the observed level?
  function timeShift(t, level) {
    const rising = pt.level(t + 10 * 60000) > pt.level(t - 10 * 60000);
    let best = null;
    for (let m = -180; m <= 180; m += 2) {
      const tt = t - m * 60000;
      const r = pt.level(tt + 5 * 60000) > pt.level(tt - 5 * 60000);
      if (r !== rising) continue;
      const e = Math.abs(pt.level(tt) - level);
      if (!best || e < best.e) best = { m, e };
    }
    return best && best.e < 0.05 ? best.m : null;
  }
  function evaluate() {
    const t = when(), w = where(), level = LOG.implied(w, P0);
    const pred = pt.level(t); // pt is the uncorrected model
    return { t, w, what: LOG.describeWhere(w, P0), level, pred, diff: level - pred, shift: timeShift(t, level) };
  }
  function show(r) {
    const words = Math.abs(r.diff) < 0.1 ? 'about what the page predicts' : r.diff > 0 ? `${Math.round(r.diff * 100)} cm higher than the page predicts` : `${Math.round(-r.diff * 100)} cm lower than the page predicts`;
    $('#chkOut').innerHTML = `${esc(dateLabel(r.t))} ${hm(r.t)}: ${esc(r.what)} means a water level of <b>${sgn(r.level)} m</b> OD Malin. The page predicts <b>${sgn(r.pred)} m</b>, so the sea was ${words}.${r.shift != null && Math.abs(r.diff) >= 0.1 ? ` Put another way, the tide was running about ${Math.abs(r.shift)} minutes ${r.shift > 0 ? 'later' : 'earlier'} than predicted.` : ''}`;
  }
  f.addEventListener('submit', (ev) => { ev.preventDefault(); show(evaluate()); });
  $('#chkSave').addEventListener('click', () => {
    const r = evaluate(); show(r);
    LOG.add({ t: r.t, src: 'check', level: +r.pred.toFixed(3), depth: +(r.pred - P0.bed.best).toFixed(3), where: r.w, obs: +r.level.toFixed(3), diff: +r.diff.toFixed(3), shift: r.shift });
    list(); onChange && onChange();
  });
  function list() {
    const s = LOG.all().filter((e) => Number.isFinite(e.diff)), ul = $('#chkList');
    ul.replaceChildren();
    s.slice(-10).reverse().forEach((o) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${esc(dateLabel(o.t))} ${hm(o.t)} · ${esc(LOG.describeWhere(o.where, P0))}${o.src === 'dip' ? ' (dip)' : ''}</span><span>${sgn(o.diff)} m <button data-id="${esc(o.id)}" aria-label="Delete">✕</button></span>`;
      ul.append(li);
    });
    ul.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { LOG.remove(b.dataset.id); list(); onChange && onChange(); }));
    const c = LOG.calibration(LOG.all());
    const sm = $('#chkSum');
    if (!c.n) { sm.textContent = 'No sightings saved yet (from here or from "I\'m in").'; $('#chkApply').disabled = true; return; }
    sm.textContent = `${c.n} sighting${c.n > 1 ? 's' : ''} (checks and dips): on average the sea was ${sgn(c.mean)} m against the prediction${c.sd != null ? ` (spread ±${m1(c.sd)} m)` : ''}. ${c.n < 4 ? 'A few more, at different states of the tide, would say more.' : ''}`;
    $('#chkApply').disabled = false;
    $('#chkApply').dataset.mean = c.mean.toFixed(3); $('#chkApply').dataset.n = c.n;
  }
  list();
  const cal = LOG.readCal();
  $('#chkState').textContent = cal && cal.apply ? `Your correction (${sgn(cal.dh)} m) is applied to this page.` : 'The page is showing the uncorrected model.';
  const reopen = () => { try { sessionStorage.setItem('swim:openCheck', '1'); } catch { /* ignore */ } };
  $('#chkApply').addEventListener('click', () => { LOG.writeCal({ apply: true, dh: +$('#chkApply').dataset.mean || 0, n: +$('#chkApply').dataset.n || 0, at: Date.now() }); reopen(); reload(); });
  $('#chkReset').addEventListener('click', () => { LOG.writeCal(null); reopen(); reload(); });
  $('#chkClear').addEventListener('click', () => { if (confirm('Delete the sightings saved from this check tool? (Dips stay.)')) { for (const e of LOG.all()) if (e.src === 'check') LOG.remove(e.id); list(); onChange && onChange(); } });
  try {
    if (sessionStorage.getItem('swim:openCheck')) {
      sessionStorage.removeItem('swim:openCheck');
      const d = document.getElementById('dCheck'); d.open = true;
      setTimeout(() => d.scrollIntoView({ block: 'start' }), 50);
    }
  } catch { /* ignore */ }
}
