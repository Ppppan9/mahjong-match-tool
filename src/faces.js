// 程序化绘制牌面（全部 Canvas 绘制，无外部图片）
const CJK = '"Microsoft YaHei","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Source Han Sans SC","SimHei",sans-serif';
const LAT = '"Arial Black","Helvetica Neue",Arial,"Noto Sans",sans-serif';
const BLUE = '#1d4f9e', GREEN = '#1f8f3a', RED = '#d42a2a', NAVY = '#1c2a5e';

// 牌面目录：按类别返回 { keys, w }，w 为该类在棋盘中的占比权重（默认值按参考视频顶层牌面统计）
export function faceCatalog(S) {
  const sets = [];
  const range = (p, n) => Array.from({ length: n }, (_, i) => p + (i + 1));
  if (S.setPics) sets.push({ keys: ['p1', 'p2', 'p3', 'p4', 'p5', ...(S.setFlowers ? ['f1', 'f2'] : []), ...(S.setExtraPics ? ['p6', 'p7', 'f3', 'f4'] : [])], w: S.wPics ?? 0.29 });
  else if (S.setFlowers) sets.push({ keys: ['f1', 'f2', ...(S.setExtraPics ? ['f3', 'f4'] : [])], w: S.wPics ?? 0.29 });
  if (S.setChars) sets.push({ keys: range('c', 9), w: S.wChars ?? 0.18 });
  const hon = [...(S.setWinds ? ['wE', 'wS', 'wW', 'wN'] : []), ...(S.setDragons ? ['gR', 'gG', ...(S.setExtraPics ? ['gW'] : [])] : [])];
  if (hon.length) sets.push({ keys: hon, w: S.wHonors ?? 0.2 });
  if (S.setDots) sets.push({ keys: range('d', 9), w: S.wDots ?? 0.2 });
  if (S.setBamboo) sets.push({ keys: range('b', 9).filter(k => k !== 'b1' || S.setExtraPics), w: S.wBamboo ?? 0.12 });
  if (!sets.length) sets.push({ keys: range('d', 9), w: 1 });
  return sets;
}
export function decoyLetterKeys(S) {
  if (!S.setLetters) return [];
  return [...new Set((S.decoyLetters || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))].map(c => 'L' + c);
}

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export { rr as roundRect };

// 筒子：参考视频为粗圆环（中间留白），蓝/绿/红三色
function dot(ctx, x, y, r, col) {
  ctx.strokeStyle = col; ctx.lineWidth = r * 0.52;
  ctx.beginPath(); ctx.arc(x, y, r * 0.74, 0, 7); ctx.stroke();
}
const DOTS = {
  1: [[.5, .5]], 2: [[.5, .27], [.5, .73]], 3: [[.22, .2], [.5, .5], [.78, .8]],
  4: [[.29, .27], [.71, .27], [.29, .73], [.71, .73]],
  5: [[.27, .22], [.73, .22], [.5, .5], [.27, .78], [.73, .78]],
  6: [[.3, .2], [.7, .2], [.3, .5], [.7, .5], [.3, .8], [.7, .8]],
  7: [[.22, .13], [.5, .24], [.78, .35], [.3, .6], [.7, .6], [.3, .86], [.7, .86]],
  8: [[.33, .13], [.67, .13], [.33, .38], [.67, .38], [.33, .62], [.67, .62], [.33, .87], [.67, .87]],
  9: [[.2, .18], [.5, .18], [.8, .18], [.2, .5], [.5, .5], [.8, .5], [.2, .82], [.5, .82], [.8, .82]],
};
function drawDots(ctx, n, w, h) {
  const pts = DOTS[n];
  const r = n === 1 ? w * 0.36 : n <= 2 ? w * 0.2 : n === 3 ? w * 0.16 : n <= 5 ? w * 0.17 : n <= 7 ? w * 0.13 : n === 8 ? w * 0.125 : w * 0.13;
  pts.forEach((p, i) => {
    let col = BLUE;
    if (n === 1) col = RED; else if (n === 3) col = [GREEN, RED, NAVY][i]; else if (n === 5 && i === 2) col = RED;
    else if (n === 6) col = i < 2 ? GREEN : RED; else if (n === 7) col = i < 3 ? GREEN : RED;
    else if (n === 9) col = [NAVY, RED, GREEN][Math.floor(i / 3)]; else if (n === 4) col = i === 0 ? GREEN : NAVY;
    else if (n === 8) col = i >= 2 && i < 6 && (i % 2 === 1) ? RED : NAVY;
    else if (n === 2) col = i ? NAVY : GREEN;
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
  const sh = h * (rows === 2 ? 0.38 : 0.27), sw = w * (n === 8 ? 0.11 : 0.12);
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
  ctx.font = `900 ${size}px ${font}`;
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
  if (n === 1) { // 红梅：五瓣红花，白色花心
    const cx = w / 2, cy = h / 2, R = w * 0.36;
    ctx.fillStyle = '#d7262e';
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55, R * 0.48, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.26, 0, 7); ctx.fill();
    ctx.fillStyle = '#d7262e'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.12, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = w * 0.012;
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2 + Math.PI / 5; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3); ctx.lineTo(cx + Math.cos(a) * R * 0.75, cy + Math.sin(a) * R * 0.75); ctx.stroke(); }
    return;
  }
  if (n === 2) { // 红兰：三片大尖瓣 + 两片内瓣
    const cx = w / 2, cy = h * 0.48, s = w / 100;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
    const petal = (ang, len, wid, col) => { ctx.save(); ctx.rotate(ang); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(wid, -len * 0.55, 0, -len); ctx.quadraticCurveTo(-wid, -len * 0.55, 0, 0); ctx.fill(); ctx.restore(); };
    petal(0, 40, 20, '#d42a2a'); petal(-1.9, 42, 20, '#c81f28'); petal(1.9, 42, 20, '#c81f28');
    petal(-0.75, 30, 15, '#e5484d'); petal(0.75, 30, 15, '#e5484d');
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 4, 7, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#d42a2a'; ctx.beginPath(); ctx.ellipse(0, 6, 3, 4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2e9a3e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 14); ctx.quadraticCurveTo(3, 30, -2, 42); ctx.stroke();
    ctx.restore(); return;
  }
  if (n === 5) { // 兰：扇形叶
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
  const s = w / 100 * 1.12;
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(s, s);
  const circ = (x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
  const ell = (x, y, rx, ry, col, a = 0) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, a, 0, 7); ctx.fill(); };
  if (n === 1) { // 蓝色圆框里的“牛”脸：浅蓝头巾、粉色大鼻子、两侧浅蓝耳朵
    ell(-40, 10, 16, 8, '#9fd6ee', -0.35); ell(40, 10, 16, 8, '#9fd6ee', 0.35);
    ell(-40, 10, 16, 8, 'rgba(0,0,0,0)');
    ctx.strokeStyle = '#2b5f9e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(-40, 10, 16, 8, -0.35, 0, 7); ctx.ellipse(40, 10, 16, 8, 0.35, 0, 7); ctx.stroke();
    circ(0, 0, 40, '#1f3f7c');
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 34, 0, 7); ctx.clip();
    circ(0, 0, 34, '#cfeefa');
    ell(0, -16, 34, 22, '#7cc6ea'); // 头巾
    ctx.strokeStyle = '#3d86c6'; ctx.lineWidth = 2.5; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 9, -36); ctx.quadraticCurveTo(i * 11, -20, i * 7, -6); ctx.stroke(); }
    ell(0, 16, 26, 16, '#f7c3cc'); // 粉鼻
    ell(-9, 16, 3.5, 4.5, '#c0566c'); ell(9, 16, 3.5, 4.5, '#c0566c');
    ctx.restore();
    circ(-12, 0, 3.6, '#1b1b1b'); circ(12, 0, 3.6, '#1b1b1b');
    ctx.restore(); return;
  }
  if (n === 2) { // 鸟：藏青色月牙身体、红头橙嘴、浅橙翅膀、下方绿条
    ctx.fillStyle = '#1f3a78'; ctx.beginPath(); ctx.arc(-4, 6, 30, 0, 7); ctx.arc(10, -2, 24, 0, 7, true); ctx.fill('evenodd');
    ctx.fillStyle = '#d4262e'; ctx.beginPath(); ctx.moveTo(-36, -14); ctx.quadraticCurveTo(-30, -36, -6, -30); ctx.quadraticCurveTo(-16, -22, -20, -8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f08a1c'; ctx.beginPath(); ctx.moveTo(-36, -14); ctx.lineTo(-46, -8); ctx.lineTo(-33, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ecb873'; ctx.beginPath(); ctx.moveTo(-2, -22); ctx.lineTo(40, -22); ctx.quadraticCurveTo(36, 4, 16, 4); ctx.quadraticCurveTo(0, 2, -2, -22); ctx.fill();
    ctx.fillStyle = '#2e9a3e'; ctx.fillRect(-28, 34, 56, 6);
    ctx.restore(); return;
  }
  if (n === 3) { // 戏曲女孩：金色圆框、黑色头冠珠饰、白脸粉腮、两侧垂发
    circ(0, 0, 40, '#f0a646'); circ(0, 0, 35, '#fbe3b8');
    ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.ellipse(0, -14, 30, 22, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(-30, -14, 8, 34); ctx.fillRect(22, -14, 8, 34);
    for (let i = -3; i <= 3; i++) circ(i * 8, -30 + Math.abs(i) * 2.5, 3.2, ['#f5c518', '#2a7de1', '#e0333c'][(i + 3) % 3]);
    ctx.strokeStyle = '#f5c518'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, -14, 26, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ell(0, 6, 20, 22, '#fff6f0');
    ell(-9, 2, 6, 3.5, '#f39aa7'); ell(9, 2, 6, 3.5, '#f39aa7');
    circ(-9, 1, 2.2, '#1b1b1b'); circ(9, 1, 2.2, '#1b1b1b');
    ell(0, 16, 4, 2.5, '#d4262e');
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-24, 18); ctx.quadraticCurveTo(-20, 34, -26, 44); ctx.moveTo(24, 18); ctx.quadraticCurveTo(20, 34, 26, 44); ctx.stroke();
    ctx.restore(); return;
  }
  if (n === 4) { // 脸谱：红色圆框、绿色头盔金边、白脸黑纹、红嘴黑须
    circ(0, 0, 40, '#c8202a');
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; circ(Math.cos(a) * 36, Math.sin(a) * 36, 3, '#e8545b'); }
    ctx.fillStyle = '#2e9a3e'; ctx.beginPath(); ctx.ellipse(0, -12, 30, 20, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#f5c518'; ctx.fillRect(-30, -14, 60, 5);
    ell(0, 6, 22, 20, '#fbfbfb');
    ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.moveTo(-18, -2); ctx.quadraticCurveTo(-8, -8, -3, 4); ctx.quadraticCurveTo(-12, 8, -18, -2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(18, -2); ctx.quadraticCurveTo(8, -8, 3, 4); ctx.quadraticCurveTo(12, 8, 18, -2); ctx.fill();
    ctx.fillStyle = '#d4262e'; ctx.fillRect(-2, -8, 4, 14);
    ell(0, 15, 6, 3, '#d4262e');
    ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.moveTo(-16, 20); ctx.quadraticCurveTo(0, 46, 16, 20); ctx.quadraticCurveTo(0, 30, -16, 20); ctx.fill();
    ctx.restore(); return;
  }
  if (n === 5) { // 叶纹圆章：红色细圆框，内有红色竹叶放射
    ctx.strokeStyle = '#d0302a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 38, 0, 7); ctx.stroke();
    const leaf = (x, y, a, len, col) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.22, len, 0); ctx.quadraticCurveTo(len * 0.5, len * 0.22, 0, 0); ctx.fill(); ctx.restore(); };
    [[-6, 8, -2.4, 30], [-4, 6, -1.6, 32], [0, 6, -0.9, 30], [2, 8, -0.2, 28], [-2, 10, 0.6, 26], [-8, 12, 2.6, 24], [-10, 4, -3.0, 22]].forEach(([x, y, a, l], i) => leaf(x, y, a, l, i % 2 ? '#d0302a' : '#e5484d'));
    ctx.strokeStyle = '#a3201d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, 26); ctx.quadraticCurveTo(-6, 10, 0, 6); ctx.stroke();
    ctx.restore(); return;
  }
  ctx.restore();
  if (n === 6) { // 熊猫
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
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${w * 0.92}px ${LAT}`;
  ctx.translate(w / 2, h * 0.55); ctx.scale(1.08, 1);
  ctx.lineJoin = 'round'; ctx.lineWidth = w * 0.045; ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.fillText(ch, 0, 0); ctx.strokeText(ch, 0, 0);
  ctx.restore();
}
export function shade(hex, f) {
  const c = hexRgb(hex);
  return `rgb(${c.map(v => Math.max(0, Math.min(255, Math.round(v * f)))).join(',')})`;
}
export function hexRgb(hex) {
  hex = (hex || '#000').replace('#', ''); if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
