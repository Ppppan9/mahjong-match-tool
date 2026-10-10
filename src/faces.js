// 程序化绘制牌面（全部 Canvas 绘制，无外部图片）
const CJK = '"KaiTi","STKaiti","Kaiti SC","SimHei","Microsoft YaHei","PingFang SC","Noto Serif CJK SC","Noto Sans CJK SC",serif';
const LAT = '"Arial Black","Helvetica Neue",Arial,"Noto Sans",sans-serif';
const BLUE = '#1d4f9e', GREEN = '#1f8f3a', RED = '#d42a2a', NAVY = '#1c2a5e';

export function faceCatalog(S) {
  const sets = [];
  const range = (p, n) => Array.from({ length: n }, (_, i) => p + (i + 1));
  if (S.setDots) sets.push(range('d', 9));
  if (S.setBamboo) sets.push(range('b', 9));
  if (S.setChars) sets.push(range('c', 9));
  if (S.setWinds) sets.push(['wE', 'wS', 'wW', 'wN']);
  if (S.setDragons) sets.push(['gR', 'gG', 'gW']);
  if (S.setFlowers) sets.push(['f1', 'f2', 'f3', 'f4']);
  if (S.setPics) sets.push(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  if (S.setLetters) {
    const ls = [...new Set((S.decoyLetters || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))];
    if (ls.length) sets.push(ls.map(c => 'L' + c));
  }
  if (!sets.length) sets.push(range('d', 9));
  return sets;
}

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export { rr as roundRect };

function dot(ctx, x, y, r, col) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, 7); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, 7); ctx.fill();
}
const DOTS = {
  1: [[.5, .5]], 2: [[.5, .27], [.5, .73]], 3: [[.25, .2], [.5, .5], [.75, .8]],
  4: [[.29, .27], [.71, .27], [.29, .73], [.71, .73]],
  5: [[.27, .22], [.73, .22], [.5, .5], [.27, .78], [.73, .78]],
  6: [[.3, .2], [.7, .2], [.3, .5], [.7, .5], [.3, .8], [.7, .8]],
  7: [[.22, .13], [.5, .24], [.78, .35], [.3, .6], [.7, .6], [.3, .86], [.7, .86]],
  8: [[.3, .14], [.7, .14], [.3, .38], [.7, .38], [.3, .62], [.7, .62], [.3, .86], [.7, .86]],
  9: [[.2, .18], [.5, .18], [.8, .18], [.2, .5], [.5, .5], [.8, .5], [.2, .82], [.5, .82], [.8, .82]],
};
function drawDots(ctx, n, w, h) {
  const pts = DOTS[n];
  const r = n === 1 ? w * 0.36 : n <= 2 ? w * 0.19 : n <= 5 ? w * 0.15 : n <= 7 ? w * 0.12 : n === 8 ? w * 0.105 : w * 0.12;
  pts.forEach((p, i) => {
    let col = BLUE;
    if (n === 1) col = RED; else if (n === 3) col = [BLUE, RED, GREEN][i]; else if (n === 5 && i === 2) col = RED;
    else if (n === 6) col = i < 2 ? GREEN : RED; else if (n === 7) col = i < 3 ? GREEN : RED;
    else if (n === 9) col = [BLUE, RED, GREEN][Math.floor(i / 3)]; else if (n === 4) col = i % 3 === 0 ? BLUE : GREEN;
    else if (n === 2) col = i ? BLUE : GREEN;
    if (n === 1) { // 一筒：花纹大圆
      ctx.fillStyle = GREEN; ctx.beginPath(); ctx.arc(p[0] * w, p[1] * h, r, 0, 7); ctx.fill();
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; ctx.fillStyle = k % 2 ? '#fff' : RED; ctx.beginPath(); ctx.arc(p[0] * w + Math.cos(a) * r * .7, p[1] * h + Math.sin(a) * r * .7, r * .17, 0, 7); ctx.fill(); }
      dot(ctx, p[0] * w, p[1] * h, r * .45, BLUE); return;
    }
    dot(ctx, p[0] * w, p[1] * h, r, col);
  });
}
function stick(ctx, x, y, sw, sh, col) {
  ctx.fillStyle = col; rr(ctx, x - sw / 2, y - sh / 2, sw, sh, sw * 0.45); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x - sw * 0.12, y - sh / 2 + sw * 0.4, sw * 0.18, sh - sw * 0.8);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(x - sw / 2, y - sw * 0.12, sw, sw * 0.24);
}
function drawBamboo(ctx, n, w, h) {
  if (n === 1) return drawBird(ctx, w, h, '#2a9d4a', '#d42a2a');
  const layouts = {
    2: [[[.5, .27], [.5, .73]], 2], 3: [[[.5, .27], [.3, .73], [.7, .73]], 2],
    4: [[[.3, .27], [.7, .27], [.3, .73], [.7, .73]], 2],
    5: [[[.25, .27], [.75, .27], [.5, .5], [.25, .73], [.75, .73]], 2],
    6: [[[.22, .27], [.5, .27], [.78, .27], [.22, .73], [.5, .73], [.78, .73]], 2],
    7: [[[.5, .17], [.22, .5], [.5, .5], [.78, .5], [.22, .83], [.5, .83], [.78, .83]], 3],
    8: [[[.2, .27], [.4, .27], [.6, .27], [.8, .27], [.2, .73], [.4, .73], [.6, .73], [.8, .73]], 2],
    9: [[[.22, .17], [.5, .17], [.78, .17], [.22, .5], [.5, .5], [.78, .5], [.22, .83], [.5, .83], [.78, .83]], 3],
  };
  const [pts, rows] = layouts[n];
  const sh = h * (rows === 2 ? 0.4 : 0.28), sw = w * (n === 8 ? 0.13 : 0.16);
  pts.forEach((p, i) => {
    let col = GREEN;
    if ((n === 5 && i === 2) || (n === 7 && i === 0) || (n === 9 && i % 3 === 1)) col = RED;
    if (n === 3 && i === 0) col = BLUE;
    stick(ctx, p[0] * w, p[1] * h, sw, sh, col);
  });
}
const NUMS = ['一', '二', '三', '四', '伍', '六', '七', '八', '九'];
function drawText(ctx, txt, w, h, col, font, size, yy = 0.54) {
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${size}px ${font}`;
  ctx.fillText(txt, w / 2, h * yy);
}
function drawBird(ctx, w, h, body, accent) {
  const s = w / 100;
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(s, s);
  ctx.fillStyle = '#e8f4ff'; ctx.beginPath(); ctx.ellipse(0, 0, 44, 44, 0, 0, 7); ctx.fill();
  ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-30, 10); ctx.quadraticCurveTo(-8, -26, 22, -8); ctx.quadraticCurveTo(26, 18, -2, 22); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1d5fb0'; ctx.beginPath(); ctx.moveTo(-30, 10); ctx.lineTo(-44, 26); ctx.lineTo(-20, 20); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#244f8f'; ctx.beginPath(); ctx.arc(20, -16, 11, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffb31a'; ctx.beginPath(); ctx.moveTo(29, -18); ctx.lineTo(40, -14); ctx.lineTo(29, -11); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(22, -18, 3.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(23, -18, 1.8, 0, 7); ctx.fill();
  ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(4, -20, 12, 4); ctx.quadraticCurveTo(0, 8, -6, -2); ctx.fill();
  ctx.strokeStyle = '#7a4b1c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-40, 32); ctx.lineTo(36, 30); ctx.stroke();
  ctx.restore();
}
function flower(ctx, w, h, petal, center, n = 5) {
  const cx = w / 2, cy = h / 2, R = w * 0.3;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 - Math.PI / 2;
    ctx.fillStyle = petal; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, R * 0.52, 0, 7); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 - Math.PI / 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.75, cy + Math.sin(a) * R * 0.75, R * 0.14, 0, 7); ctx.fill(); }
  ctx.fillStyle = center; ctx.beginPath(); ctx.arc(cx, cy, R * 0.32, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffd23f'; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * .2, cy + Math.sin(a) * R * .2, R * .06, 0, 7); ctx.fill(); }
}
function drawFlower(ctx, n, w, h) {
  if (n === 1) return flower(ctx, w, h, '#d9232d', '#8a0f16', 5);
  if (n === 2) { // 兰：扇形叶
    ctx.save(); ctx.translate(w / 2, h * 0.62);
    for (let i = -3; i <= 3; i++) { ctx.save(); ctx.rotate(i * 0.32); ctx.fillStyle = i % 2 ? '#c8202a' : '#e14b3b'; ctx.beginPath(); ctx.ellipse(0, -h * 0.2, w * 0.08, h * 0.2, 0, 0, 7); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = '#2a8a3a'; ctx.beginPath(); ctx.arc(0, 0, w * 0.08, 0, 7); ctx.fill(); ctx.restore(); return;
  }
  if (n === 3) { // 菊：蓝红圆形
    const cx = w / 2, cy = h / 2, R = w * 0.36;
    for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; ctx.fillStyle = i % 2 ? '#1d5fb0' : '#2f7fd0'; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * R * .6, cy + Math.sin(a) * R * .6, R * .4, R * .14, a, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#d42a2a'; ctx.beginPath(); ctx.arc(cx, cy, R * .42, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffcf3f'; ctx.beginPath(); ctx.arc(cx, cy, R * .18, 0, 7); ctx.fill(); return;
  }
  return flower(ctx, w, h, '#f07aa8', '#b8326a', 6);
}
function face(ctx, w, h, skin, hair, extra) {
  const s = w / 100; ctx.save(); ctx.translate(w / 2, h / 2 + 4 * s); ctx.scale(s, s);
  extra && extra.back && extra.back(ctx);
  ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(0, 0, 30, 34, 0, 0, 7); ctx.fill();
  ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(0, -18, 32, 20, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-11, 2, 3.6, 0, 7); ctx.arc(11, 2, 3.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-10, 1, 1.2, 0, 7); ctx.arc(12, 1, 1.2, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(240,90,90,.45)'; ctx.beginPath(); ctx.arc(-18, 12, 5, 0, 7); ctx.arc(18, 12, 5, 0, 7); ctx.fill();
  ctx.strokeStyle = '#a3302a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 14, 7, 0.2, Math.PI - 0.2); ctx.stroke();
  extra && extra.front && extra.front(ctx);
  ctx.restore();
}
function drawPic(ctx, n, w, h) {
  const s = w / 100;
  if (n === 1) { // 奶牛
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(s, s);
    ctx.fillStyle = '#c8a27a'; ctx.beginPath(); ctx.ellipse(-30, -24, 12, 6, -0.5, 0, 7); ctx.ellipse(30, -24, 12, 6, 0.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, -4, 30, 32, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(-14, -18, 10, 8, 0.4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(18, -6, 7, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f4a6b0'; ctx.beginPath(); ctx.ellipse(0, 16, 22, 14, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#b5546a'; ctx.beginPath(); ctx.arc(-8, 16, 3, 0, 7); ctx.arc(8, 16, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-10, -4, 3.5, 0, 7); ctx.arc(10, -4, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-10, -34); ctx.lineTo(-4, -44); ctx.lineTo(0, -34); ctx.fill();
    ctx.restore(); return;
  }
  if (n === 2) return drawBird(ctx, w, h, '#3a7bd5', '#e94b3c');
  if (n === 3) return face(ctx, w, h, '#ffe0cc', '#1b1b1b', { // 戏曲女孩
    back: c => { c.fillStyle = '#c81e2a'; c.beginPath(); c.arc(0, -30, 26, Math.PI, 0); c.fill(); for (let i = -2; i <= 2; i++) { c.fillStyle = i % 2 ? '#ffcf3f' : '#2a7de1'; c.beginPath(); c.arc(i * 12, -44, 5, 0, 7); c.fill(); } c.fillStyle = '#c81e2a'; c.beginPath(); c.arc(-34, 6, 7, 0, 7); c.arc(34, 6, 7, 0, 7); c.fill(); },
    front: c => { c.fillStyle = '#e8577a'; c.beginPath(); c.ellipse(-12, -6, 9, 4, 0, 0, 7); c.ellipse(12, -6, 9, 4, 0, 0, 7); c.fill(); c.fillStyle = '#d42a2a'; c.beginPath(); c.arc(0, -24, 3, 0, 7); c.fill(); },
  });
  if (n === 4) return face(ctx, w, h, '#f2c9a5', '#3a2414', { // 男人戴帽
    back: () => {},
    front: c => { c.fillStyle = '#1d4f9e'; c.beginPath(); c.ellipse(0, -30, 36, 8, 0, 0, 7); c.fill(); c.fillRect(-22, -52, 44, 24); c.fillStyle = '#d42a2a'; c.fillRect(-22, -36, 44, 6); c.fillStyle = '#3a2414'; c.beginPath(); c.moveTo(-14, 20); c.quadraticCurveTo(0, 12, 14, 20); c.quadraticCurveTo(0, 26, -14, 20); c.fill(); },
  });
  if (n === 5) { // 熊猫
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(s, s);
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-24, -24, 11, 0, 7); ctx.arc(24, -24, 11, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 0, 32, 29, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(-12, -2, 8, 10, 0.5, 0, 7); ctx.ellipse(12, -2, 8, 10, -0.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-11, -3, 3, 0, 7); ctx.arc(11, -3, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(0, 10, 5, 3.5, 0, 0, 7); ctx.fill(); ctx.restore(); return;
  }
  // 金鱼
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(s, s);
  ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.ellipse(-4, 0, 26, 18, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff9f45'; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(40, -18); ctx.lineTo(34, 0); ctx.lineTo(40, 18); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-16, -4, 5, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-17, -4, 2.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a7de1'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-30 + i * 4, -26 - i * 8, 3 + i, 0, 7); ctx.fill(); }
  ctx.restore();
}

// 绘制一个牌面（含圆角底色）。info: {key, letter?, color?}
export function drawFaceCanvas(S, key, W, H, targetColor) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const rad = S.cornerRadius / 1 * W * 0.9;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(S.faceColor, 1.04)); g.addColorStop(1, shade(S.faceColor, 0.93));
  ctx.fillStyle = g; rr(ctx, 0, 0, W, H, rad); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = W * 0.012; rr(ctx, W * .01, H * .01, W * .98, H * .98, rad); ctx.stroke();
  // 图案区域
  const k = S.faceScale, iw = W * k, ih = H * k;
  ctx.save(); ctx.translate((W - iw) / 2, (H - ih) / 2);
  const t = key[0], rest = key.slice(1);
  if (t === 'd') drawDots(ctx, +rest, iw, ih);
  else if (t === 'b') drawBamboo(ctx, +rest, iw, ih);
  else if (t === 'c') drawText(ctx, NUMS[+rest - 1], iw, ih, NAVY, CJK, iw * 0.78);
  else if (t === 'w') drawText(ctx, { E: '東', S: '南', W: '西', N: '北' }[rest], iw, ih, '#151515', CJK, iw * 0.8);
  else if (t === 'g') {
    if (rest === 'R') drawText(ctx, '中', iw, ih, RED, CJK, iw * 0.82);
    else if (rest === 'G') drawText(ctx, '發', iw, ih, GREEN, CJK, iw * 0.8);
    else { ctx.strokeStyle = BLUE; ctx.lineWidth = iw * 0.07; rr(ctx, iw * .16, ih * .14, iw * .68, ih * .72, iw * .06); ctx.stroke(); ctx.lineWidth = iw * .025; rr(ctx, iw * .25, ih * .22, iw * .5, ih * .56, iw * .04); ctx.stroke(); }
  }
  else if (t === 'f') drawFlower(ctx, +rest, iw, ih);
  else if (t === 'p') drawPic(ctx, +rest, iw, ih);
  else if (t === 'L') letter(ctx, rest, iw, ih, S.letterColor);
  else if (t === 'T') letter(ctx, rest, iw, ih, targetColor || S.targetColor);
  ctx.restore();
  return cv;
}
function letter(ctx, ch, w, h, col) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${w * 0.86}px ${LAT}`;
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillText(ch, w / 2 + w * 0.025, h * 0.54 + w * 0.03);
  ctx.fillStyle = col; ctx.fillText(ch, w / 2, h * 0.54);
}
export function shade(hex, f) {
  const c = hexRgb(hex);
  return `rgb(${c.map(v => Math.max(0, Math.min(255, Math.round(v * f)))).join(',')})`;
}
export function hexRgb(hex) {
  hex = (hex || '#000').replace('#', ''); if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
