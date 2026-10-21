// The share card: the steps picture in miniature, the verdict, the next window, water temperature,
// chop and the date, as a PNG to send to whoever you're going with. 4:5 (1080x1350) or square (1080x1080).
// Shared with the Web Share API (files) where the phone supports it, otherwise downloaded.
const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
const SANS = "-apple-system, system-ui, 'Segoe UI', Roboto, Arial, sans-serif";

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function fitText(g, text, maxW, font, size, min = 20) {
  let s = size; g.font = font.replace('%', s);
  while (g.measureText(text).width > maxW && s > min) { s -= 2; g.font = font.replace('%', s); }
  return s;
}

// info: {word, line, next, water, chop, when, future}
// Layout is worked out bottom-up: the text block gets the room it needs, the picture gets the rest.
export function renderCard(hero, heroState, info, format = 'portrait') {
  const W = 1080, H = format === 'square' ? 1080 : 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const M = 56, inner = W - 2 * M;
  // measure the text block
  const wordSize = fitText(g, info.word, inner, `600 %px ${SERIF}`, format === 'square' ? 150 : 176, 80);
  g.font = `500 38px ${SANS}`;
  const first = (info.line.match(/^.+?\.(?=\s|$)/) || [info.line])[0]; // first sentence (not fooled by 0.6 m)
  const rows = []; let row = '';
  for (const w of first.split(' ')) { const t = row ? row + ' ' + w : w; if (g.measureText(t).width > inner) { rows.push(row); row = w; } else row = t; }
  rows.push(row);
  const lines = rows.slice(0, 2);
  const pillFont = fitText(g, info.next, inner - 56, `700 %px ${SANS}`, 40, 32);
  const pillTwo = g.measureText(info.next).width > inner - 56;
  const pillH = pillTwo ? 122 : 78;
  const chips = [info.water, info.chop].filter(Boolean);
  const textH = wordSize * 0.95 + lines.length * 50 + 30 + pillH + (chips.length ? 26 + 62 : 0) + 74;
  const sceneH = Math.round(H - textH);
  // the picture: same drawing as the page, framed so the steps, the person and the Reek all fit
  // the window reaches just below this moment's level (a still picture need not hold the whole range)
  hero.renderTo(g, W, sceneH + 60, heroState, { horizon: 0.5, metres: 7.0, bottom: 70, zLow: Math.min(hero.geom.bedBest - 0.6, heroState.level - 0.45, heroState.ghost ?? Infinity) });
  const fade = g.createLinearGradient(0, sceneH - 110, 0, sceneH + 10);
  fade.addColorStop(0, 'rgba(244,239,230,0)'); fade.addColorStop(1, 'rgba(244,239,230,1)');
  g.fillStyle = fade; g.fillRect(0, sceneH - 110, W, 120);
  g.fillStyle = '#f4efe6'; g.fillRect(0, sceneH + 10, W, H - sceneH - 10);
  // label on the picture
  const lightSky = heroState.sun.alt > 6;
  g.font = `700 30px ${SANS}`; g.fillStyle = lightSky ? 'rgba(15,29,38,.85)' : 'rgba(255,255,255,.92)';
  g.fillText('THE POINT · WESTPORT QUAY', M, 78);
  g.font = `500 30px ${SANS}`; g.fillText(info.when, M, 122);
  if (info.future) { g.font = `700 30px ${SANS}`; g.fillStyle = lightSky ? '#8a5a00' : '#ffd36b'; g.fillText(info.future, M, 166); }
  // verdict, line, pill, chips, footer
  let y = sceneH + wordSize * 0.62;
  g.fillStyle = '#0f1d26'; g.font = `600 ${wordSize}px ${SERIF}`; g.fillText(info.word, M - 4, y);
  y += wordSize * 0.18;
  g.font = `500 38px ${SANS}`; g.fillStyle = '#2c4150';
  for (const r of lines) { y += 50; g.fillText(r, M, y); }
  y += 30;
  g.font = `700 ${pillFont}px ${SANS}`;
  let pl = [info.next];
  if (pillTwo) { const ws2 = info.next.split(' '); let a = '', b = ''; for (const w of ws2) { const t = a ? a + ' ' + w : w; if (!b && g.measureText(t).width <= inner - 56) a = t; else b = b ? b + ' ' + w : w; } pl = [a, b]; }
  const pw = Math.min(inner, Math.max(...pl.map((l) => g.measureText(l).width)) + 56);
  roundRect(g, M - 4, y, pw, pillH, 39); g.fillStyle = '#0f1d26'; g.fill();
  g.fillStyle = '#fff'; pl.forEach((l, i) => g.fillText(l, M + 24, y + 52 + i * (pillFont + 8)));
  y += pillH;
  if (chips.length) {
    y += 26; let x = M - 4;
    const cols = ['#2a7fb8', '#3e9e8c'];
    chips.forEach((label, i) => {
      g.font = `700 32px ${SANS}`;
      const w = g.measureText(label).width + 44;
      if (x + w > W - M) return;
      roundRect(g, x, y, w, 62, 31); g.fillStyle = cols[i]; g.globalAlpha = 0.14; g.fill(); g.globalAlpha = 1;
      g.strokeStyle = cols[i]; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#0f1d26'; g.fillText(label, x + 22, y + 42);
      x += w + 14;
    });
    y += 62;
  }
  g.font = `500 25px ${SANS}`; g.fillStyle = '#5a6b76';
  g.fillText('Predicted from Marine Institute tides, not measured. No lifeguard.', M, Math.max(y + 52, H - 36));
  return c;
}

export async function shareCanvas(canvas, filename, text) {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'The Point', text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
