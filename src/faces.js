// 程序化绘制牌面（全部 Canvas 绘制，无外部图片）
import { FONT_CJK as CJK, FONT_LAT as LAT } from './fonts.js';
// 颜色取自参考视频（逐牌取样，略提亮以抵消视频压缩变暗）
const BLUE = '#1f4a7c', GREEN = '#23805a', RED = '#ab2436', NAVY = '#2b3866', INK = '#1d1e1e';

// 牌面目录：按类别返回 { keys, w }，w 为该类在棋盘中的占比权重（默认值按参考视频顶层牌面统计）
export function faceCatalog(S) {
  const sets = [];
  const range = (p, n) => Array.from({ length: n }, (_, i) => p + (i + 1));
  if (S.setPics) sets.push({ keys: ['p1', 'p2', 'p3', 'p4', 'p5', ...(S.setFlowers ? ['f1', 'f2', 'f3'] : []), ...(S.setExtraPics ? ['p6', 'p7', 'f4'] : [])], w: S.wPics ?? 0.29 });
  else if (S.setFlowers) sets.push({ keys: ['f1', 'f2', 'f3', ...(S.setExtraPics ? ['f4'] : [])], w: S.wPics ?? 0.29 });
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

// 筒子：参考视频为双色粗圆环（外圈主色 + 内缘细圈副色，中间小白孔）
function dot(ctx, x, y, r, col, inner) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.fillStyle = inner || col; ctx.beginPath(); ctx.arc(x, y, r * 0.66, 0, 7); ctx.fill();
  ctx.fillStyle = '#fbfbf6'; ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, 7); ctx.fill();
}
export const DOTS = {
  1: [[.5, .5]], 2: [[.5, .27], [.5, .73]], 3: [[.26, .2], [.5, .5], [.74, .8]],
  4: [[.29, .27], [.71, .27], [.29, .73], [.71, .73]],
  5: [[.27, .22], [.73, .22], [.5, .5], [.27, .78], [.73, .78]],
  6: [[.3, .2], [.7, .2], [.3, .5], [.7, .5], [.3, .8], [.7, .8]],
  7: [[.22, .13], [.5, .24], [.78, .35], [.3, .6], [.7, .6], [.3, .86], [.7, .86]],
  8: [[.32, .14], [.68, .14], [.32, .38], [.68, .38], [.32, .62], [.68, .62], [.32, .86], [.68, .86]],
  9: [[.2, .18], [.5, .18], [.8, .18], [.2, .5], [.5, .5], [.8, .5], [.2, .82], [.5, .82], [.8, .82]],
};
const DG = '#2f8f6a', DR = '#b8263a', DN = '#26336a';
function drawDots(ctx, n, w, h) {
  const pts = DOTS[n];
  const r = n === 1 ? w * 0.36 : n <= 2 ? w * 0.19 : n === 3 ? w * 0.165 : n <= 5 ? w * 0.155 : n <= 7 ? w * 0.13 : n === 8 ? w * 0.145 : w * 0.13;
  pts.forEach((p, i) => {
    // [外圈, 内缘]
    let c = [DN, DG];
    if (n === 3) c = [[DN, DG], [DR, DN], [DN, DN]][i];
    else if (n === 4) c = [[DN, DG], [DN, DG], [DN, DN], [DN, DG]][i];
    else if (n === 8) c = (Math.floor(i / 2) % 2) ? [DN, DN] : [DN, DG];
    else if (n === 2) c = i ? [DN, DN] : [DN, DG];
    else if (n === 5) c = i === 2 ? [DR, DN] : [DN, DG];
    else if (n === 6) c = i < 2 ? [DN, DG] : [DR, DN];
    else if (n === 7) c = i < 3 ? [DN, DG] : [DR, DN];
    else if (n === 9) c = [[DN, DG], [DR, DN], [DN, DN]][Math.floor(i / 3)];
    if (n === 1) { // 一筒：花纹大圆
      ctx.fillStyle = DG; ctx.beginPath(); ctx.arc(p[0] * w, p[1] * h, r, 0, 7); ctx.fill();
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; ctx.fillStyle = k % 2 ? '#fff' : DR; ctx.beginPath(); ctx.arc(p[0] * w + Math.cos(a) * r * .7, p[1] * h + Math.sin(a) * r * .7, r * .17, 0, 7); ctx.fill(); }
      dot(ctx, p[0] * w, p[1] * h, r * .45, DN, DG); return;
    }
    dot(ctx, p[0] * w, p[1] * h, r, c[0], c[1]);
  });
}
// 条子：参考为“骨头形”竹节——两端与中间略宽的节，中间收腰，青绿色
function stick(ctx, x, y, sw, sh, col) {
  const hw = sw / 2, t = y - sh / 2, b = y + sh / 2, nk = sw * 0.32;
  ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(x - hw, t); ctx.lineTo(x + hw, t);
  ctx.quadraticCurveTo(x + hw * 0.55, t + sh * 0.25, x + hw, y); ctx.quadraticCurveTo(x + hw * 0.55, b - sh * 0.25, x + hw, b);
  ctx.lineTo(x - hw, b);
  ctx.quadraticCurveTo(x - hw * 0.55, b - sh * 0.25, x - hw, y); ctx.quadraticCurveTo(x - hw * 0.55, t + sh * 0.25, x - hw, t);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,40,20,.45)'; ctx.fillRect(x - hw, y - nk * 0.35, sw, nk * 0.7);
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x - sw * 0.08, t + nk, sw * 0.16, sh / 2 - nk * 1.5); ctx.fillRect(x - sw * 0.08, y + nk * 0.6, sw * 0.16, sh / 2 - nk * 1.5);
}
function drawBamboo(ctx, n, w, h) {
  if (n === 1) return drawBird(ctx, w, h, '#2a9d4a', '#d42a2a');
  const layouts = {
    2: [[[.5, .3], [.5, .7]], 2], 3: [[[.5, .3], [.3, .7], [.7, .7]], 2],
    4: [[[.32, .3], [.68, .3], [.32, .7], [.68, .7]], 2],
    5: [[[.25, .27], [.75, .27], [.5, .5], [.25, .73], [.75, .73]], 2],
    6: [[[.22, .27], [.5, .27], [.78, .27], [.22, .73], [.5, .73], [.78, .73]], 2],
    7: [[[.5, .17], [.22, .5], [.5, .5], [.78, .5], [.22, .83], [.5, .83], [.78, .83]], 3],
    8: [[[.2, .27], [.4, .27], [.6, .27], [.8, .27], [.2, .73], [.4, .73], [.6, .73], [.8, .73]], 2],
    9: [[[.22, .17], [.5, .17], [.78, .17], [.22, .5], [.5, .5], [.78, .5], [.22, .83], [.5, .83], [.78, .83]], 3],
  };
  const [pts, rows] = layouts[n];
  const sh = h * (rows === 2 ? 0.35 : 0.26), sw = w * (n === 8 ? 0.12 : 0.155);
  pts.forEach((p, i) => {
    let col = GREEN;
    if ((n === 5 && i === 2) || (n === 7 && i === 0) || (n === 9 && i % 3 === 1)) col = RED;
    stick(ctx, p[0] * w, p[1] * h, sw, sh, col);
  });
}
const NUMS = ['一', '二', '三', '四', '伍', '六', '七', '八', '九'];
// 汉字：内置 Noto Sans CJK Bold 子集 + 同色描边加粗（参考字重接近 Heavy）
function drawText(ctx, txt, w, h, col, font, size, yy = 0.52, bold = 0.045) {
  ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px ${font}`; ctx.lineJoin = 'round'; ctx.lineWidth = size * bold;
  ctx.fillText(txt, w / 2, h * yy); ctx.strokeText(txt, w / 2, h * yy);
  ctx.restore();
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
  const FR = '#c42a36';
  if (n === 1) { // 参考：五瓣红梅，白色分瓣细线，绿色花心+白圈
    const cx = w / 2, cy = h / 2, R = w * 0.38;
    ctx.fillStyle = FR;
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.52, cy + Math.sin(a) * R * 0.52, R * 0.47, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = w * 0.022; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2); ctx.lineTo(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.24, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a9a5a'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.16, 0, 7); ctx.fill();
    return;
  }
  if (n === 2) { // 参考：蝴蝶兰——上方圆瓣、两侧大翼瓣、下方带白边的唇瓣、底部绿色小托
    const s = w / 100 * 1.22; ctx.save(); ctx.translate(w / 2, h * 0.5); ctx.scale(s, s);
    ctx.fillStyle = FR;
    ctx.beginPath(); ctx.ellipse(0, -18, 14, 15, 0, 0, 7); ctx.fill(); // 上瓣
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -6); ctx.bezierCurveTo(sx * 12, -24, sx * 40, -20, sx * 38, -3); ctx.bezierCurveTo(sx * 36, 7, sx * 16, 8, 0, 4); ctx.closePath(); ctx.fill(); }
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 2); ctx.bezierCurveTo(sx * 18, 2, sx * 32, 10, sx * 27, 22); ctx.bezierCurveTo(sx * 20, 27, sx * 6, 18, 0, 10); ctx.closePath(); ctx.fill(); }
    // 唇瓣（白边）
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(-12, 6); ctx.quadraticCurveTo(0, -2, 12, 6); ctx.quadraticCurveTo(14, 18, 0, 20); ctx.quadraticCurveTo(-14, 18, -12, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.quadraticCurveTo(0, -4, 5, 0); ctx.stroke();
    ctx.fillStyle = '#239a5a'; ctx.beginPath(); ctx.ellipse(0, 26, 8, 4, 0, 0, 7); ctx.fill();
    ctx.restore(); return;
  }
  if (n === 3) { // 参考：红色菊花——8 片带缺口的大瓣 + 8 片小瓣，绿色花心白圈
    const s = w / 100; ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(s, s);
    const pet = (a, len, wid, col) => { ctx.save(); ctx.rotate(a); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(wid, -len * 0.5, wid * 0.7, -len); ctx.lineTo(0, -len * 0.86); ctx.lineTo(-wid * 0.7, -len); ctx.quadraticCurveTo(-wid, -len * 0.5, 0, 0); ctx.fill(); ctx.restore(); };
    for (let i = 0; i < 8; i++) pet((i + 0.5) / 8 * Math.PI * 2, 30, 10, '#b52230');
    for (let i = 0; i < 8; i++) pet(i / 8 * Math.PI * 2, 40, 13, FR);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a9a5a'; ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 7); ctx.fill();
    ctx.restore(); return;
  }
  if (n === 5) { // 兰：扇形叶
    ctx.save(); ctx.translate(w / 2, h * 0.62);
    for (let i = -3; i <= 3; i++) { ctx.save(); ctx.rotate(i * 0.32); ctx.fillStyle = i % 2 ? '#c8202a' : '#e14b3b'; ctx.beginPath(); ctx.ellipse(0, -h * 0.2, w * 0.08, h * 0.2, 0, 0, 7); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = '#2a8a3a'; ctx.beginPath(); ctx.arc(0, 0, w * 0.08, 0, 7); ctx.fill(); ctx.restore(); return;
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
  const s = w / 100 * 1.2;
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const circ = (x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
  const ell = (x, y, rx, ry, col, a = 0) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, a, 0, 7); ctx.fill(); };
  const path = (col, pts, close = true) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); if (close) ctx.closePath(); ctx.fill(); };
  if (n === 1) { // 参考：藏青圆框，浅蓝头盔（白色饰带+额前白牌、两侧粉花），粉色笑脸（^ ^），两侧浅蓝流苏伸出圆框
    circ(0, 0, 38, '#1e2a5c');
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 33, 0, 7); ctx.clip();
    circ(0, 0, 33, '#22336e');
    ell(0, -8, 30, 25, '#8fd3f0'); // 头盔
    ctx.strokeStyle = '#e8f7ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 4, 30, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.strokeStyle = '#5bb2df'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, -2, 24, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
    ctx.fillStyle = '#eef9ff'; rr(ctx, -9, -14, 18, 10, 3); ctx.fill();
    ctx.strokeStyle = '#7cc3e8'; ctx.lineWidth = 1.2; rr(ctx, -6, -11.5, 12, 5, 2); ctx.stroke();
    ell(0, 15, 25, 17, '#f6c9cf'); // 粉脸
    ctx.restore();
    // 两侧粉花
    for (const sx of [-1, 1]) { circ(sx * 26, -10, 5.2, '#e46fb0'); circ(sx * 26, -10, 2.2, '#ffd6ec'); }
    // 闭眼笑 ^ ^
    ctx.strokeStyle = '#2a1a22'; ctx.lineWidth = 2.6;
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 15, 10); ctx.quadraticCurveTo(sx * 9, 5, sx * 4, 10); ctx.stroke(); }
    // 浅蓝流苏（向两侧下方伸出圆框）
    for (const sx of [-1, 1]) {
      ctx.strokeStyle = '#bfe7fb'; ctx.lineWidth = 3.2;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(sx * 18, 10 + i * 2.5); ctx.quadraticCurveTo(sx * 34, 12 + i * 4, sx * (46 - i * 2), 20 + i * 5); ctx.stroke(); }
      ctx.strokeStyle = '#4a9fd6'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx * 20, 14); ctx.quadraticCurveTo(sx * 34, 18, sx * 44, 28); ctx.stroke();
    }
    ctx.restore(); return;
  }
  if (n === 2) { // 参考：左上红色鸟头弯钩、右上浅棕半圆（碗）、下方藏青月牙、底部绿色圆角条
    ctx.fillStyle = '#1f3a78'; ctx.beginPath(); ctx.arc(-2, -6, 32, 0.12 * Math.PI, 0.98 * Math.PI); ctx.quadraticCurveTo(-8, 20, 28, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8b56c'; ctx.beginPath(); ctx.moveTo(-6, -16); ctx.lineTo(42, -16); ctx.arc(18, -16, 24, 0, Math.PI * 0.62); ctx.quadraticCurveTo(0, 2, -6, -16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cf2a33'; ctx.beginPath(); ctx.moveTo(-34, -10); ctx.quadraticCurveTo(-28, -34, -2, -30); ctx.quadraticCurveTo(-14, -24, -18, -8); ctx.quadraticCurveTo(-26, -14, -34, -10); ctx.fill();
    ctx.fillStyle = '#239a52'; rr(ctx, -30, 30, 60, 9, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-26, 31, 52, 2.5);
    ctx.restore(); return;
  }
  if (n === 3) { // 参考：橙色圆环+浅桃底；黑色头冠（顶部灰蓝饰物、前额金冠）；粉脸大眼；两侧黑发垂到框外
    circ(0, 0, 38, '#ec9a3e'); circ(0, 0, 34, '#fbdcb4');
    // 头冠
    ctx.fillStyle = '#17171c'; ctx.beginPath(); ctx.moveTo(-28, -2); ctx.quadraticCurveTo(-32, -30, -10, -36); ctx.quadraticCurveTo(0, -42, 10, -36); ctx.quadraticCurveTo(32, -30, 28, -2); ctx.closePath(); ctx.fill();
    for (let i = -2; i <= 2; i++) { circ(i * 9, -30 + Math.abs(i) * 3, 4.2, '#5f7a99'); circ(i * 9, -30 + Math.abs(i) * 3, 1.8, '#c9d9ea'); }
    circ(-15, -20, 3.4, '#4c6585'); circ(15, -20, 3.4, '#4c6585');
    ctx.fillStyle = '#e8a131'; ctx.beginPath(); ctx.moveTo(-22, -10); ctx.quadraticCurveTo(0, -24, 22, -10); ctx.lineTo(19, -5); ctx.quadraticCurveTo(0, -16, -19, -5); ctx.closePath(); ctx.fill();
    for (let i = -2; i <= 2; i++) circ(i * 8, -12 - (2 - Math.abs(i)) * 1.6, 2, i % 2 ? '#d1342f' : '#fff1b0');
    circ(-27, 2, 4, '#d1342f'); circ(27, 2, 4, '#d1342f');
    // 脸
    ell(0, 8, 18, 17, '#fbe3e6');
    ell(-11, 14, 4, 2.6, '#f4a3b1'); ell(11, 14, 4, 2.6, '#f4a3b1');
    ell(-7, 6, 3.4, 4.2, '#2a1e2e'); ell(7, 6, 3.4, 4.2, '#2a1e2e');
    circ(-6, 4.6, 1.2, '#fff'); circ(8, 4.6, 1.2, '#fff');
    ell(0, 17, 2.4, 1.6, '#d42c3a');
    // 两侧垂发（白描边）
    for (const sx of [-1, 1]) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5.5; ctx.beginPath(); ctx.moveTo(sx * 14, 22); ctx.quadraticCurveTo(sx * 20, 34, sx * 12, 40); ctx.quadraticCurveTo(sx * 8, 44, sx * 14, 48); ctx.stroke();
      ctx.strokeStyle = '#1b1b1f'; ctx.lineWidth = 2.6; ctx.stroke();
    }
    ctx.restore(); return;
  }
  if (n === 4) { // 参考：红色白点圆框、绿色头带+橙黄绒球、白脸黑色眼纹、黑色大胡须垂出框外、两侧棕色挂须
    circ(0, 0, 38, '#b81d26');
    const rnd = (i) => (Math.sin(i * 12.9898) * 43758.5453) % 1;
    for (let i = 0; i < 26; i++) { const a = i * 2.39996, r = 10 + Math.abs(rnd(i)) * 26; if (r < 22 && Math.sin(a) > -0.3) continue; circ(Math.cos(a) * r, Math.sin(a) * r, 1.6 + Math.abs(rnd(i + 7)) * 1.4, 'rgba(255,225,225,.85)'); }
    for (const sx of [-1, 1]) { ctx.strokeStyle = '#c9a079'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(sx * 26, 4); ctx.lineTo(sx * 27, 46); ctx.stroke(); }
    // 头带
    ctx.fillStyle = '#7cc242'; ctx.beginPath(); ctx.moveTo(-30, -6); ctx.quadraticCurveTo(0, -26, 30, -6); ctx.lineTo(27, 0); ctx.quadraticCurveTo(0, -16, -27, 0); ctx.closePath(); ctx.fill();
    for (let i = -2; i <= 2; i++) circ(i * 12, -18 + Math.abs(i) * 3.2, 4.6, i % 2 ? '#f7c531' : '#f08c2a');
    // 白脸 + 眼纹
    ctx.fillStyle = '#fbfbfb'; ctx.beginPath(); ctx.moveTo(-20, -4); ctx.quadraticCurveTo(0, -12, 20, -4); ctx.quadraticCurveTo(24, 18, 14, 22); ctx.lineTo(-14, 22); ctx.quadraticCurveTo(-24, 18, -20, -4); ctx.fill();
    ctx.fillStyle = '#16161a';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 17, -1); ctx.quadraticCurveTo(sx * 8, -4, sx * 3, 5); ctx.quadraticCurveTo(sx * 10, 9, sx * 18, 6); ctx.closePath(); ctx.fill(); }
    circ(-9, 3, 1.6, '#fff'); circ(9, 3, 1.6, '#fff');
    ctx.fillStyle = '#16161a'; ctx.fillRect(-1.5, -6, 3, 9);
    ell(0, 13, 4, 2.2, '#d02a2f');
    // 黑胡须
    ctx.fillStyle = '#121214'; rr(ctx, -18, 17, 36, 26, 4); ctx.fill();
    ctx.restore(); return;
  }
  if (n === 5) { // 参考：断开的红色细圆环（两端绿色叶尖）+ 内部两簇红色竹叶
    ctx.strokeStyle = '#c42a36'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(0, 0, 36, -Math.PI * 0.82, Math.PI * 0.18); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 36, Math.PI * 0.3, Math.PI * 1.0); ctx.stroke();
    const leaf = (x, y, a, len, wid, col) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.42, -wid * 1.25, len, 0); ctx.quadraticCurveTo(len * 0.42, wid * 1.25, 0, 0); ctx.fill(); ctx.restore(); };
    leaf(-30, -22, -2.6, 9, 3, '#2f9a54'); leaf(30, 22, 0.5, 9, 3, '#2f9a54');
    // 两簇竹叶：沿细茎交替向两侧伸出的细长叶片（右上一簇、左下一簇）
    const spray = (x0, y0, ang, n, seed) => {
      const dx = Math.cos(ang), dy = Math.sin(ang);
      ctx.strokeStyle = '#b3242f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + dx * n * 5, y0 + dy * n * 5); ctx.stroke();
      for (let i = 0; i < n; i++) {
        const side = (i % 2 ? 1 : -1), px = x0 + dx * (i * 5 + 2), py = y0 + dy * (i * 5 + 2);
        leaf(px, py, ang + side * (0.55 + 0.12 * ((i + seed) % 3)), 17 + ((i * 7 + seed) % 4), 6.6, i % 2 ? '#c42a36' : '#d63845');
      }
      leaf(x0 + dx * n * 5, y0 + dy * n * 5, ang, 11, 5, "#c42a36");
    };
    spray(-1, 1, -0.9, 5, 0);
    spray(-3, 5, 2.25, 5, 1);
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
export function drawFaceCanvas(S, key, W, H, targetColor, theme) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const rad = S.cornerRadius / 1 * W * 0.9;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(S.faceColor, 1.04)); g.addColorStop(1, shade(S.faceColor, 0.93));
  ctx.fillStyle = g; rr(ctx, 0, 0, W, H, rad); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = W * 0.012; rr(ctx, W * .01, H * .01, W * .98, H * .98, rad); ctx.stroke();
  if (theme && theme.faceBg) theme.faceBg(ctx, W, H, S, rad);
  // 图案区域
  const k = S.faceScale, iw = W * k, ih = H * k;
  ctx.save(); ctx.translate((W - iw) / 2, (H - ih) / 2);
  const t = key[0], rest = key.slice(1);
  if (theme && theme.drawFace && theme.drawFace(ctx, key, iw, ih, S, targetColor)) { /* 主题自绘 */ }
  else if (t === 'd') drawDots(ctx, +rest, iw, ih);
  else if (t === 'b') drawBamboo(ctx, +rest, iw, ih);
  else if (t === 'c') drawText(ctx, NUMS[+rest - 1], iw, ih, NAVY, CJK, iw * 0.8, 0.52, 0.035);
  else if (t === 'w') drawText(ctx, { E: '東', S: '南', W: '西', N: '北' }[rest], iw, ih, INK, CJK, iw * 0.84);
  else if (t === 'g') {
    if (rest === 'R') drawText(ctx, '中', iw, ih, RED, CJK, iw * 0.84, 0.52, 0.012);
    else if (rest === 'G') drawText(ctx, '發', iw, ih, GREEN, CJK, iw * 0.84, 0.52, 0.03);
    else { ctx.strokeStyle = BLUE; ctx.lineWidth = iw * 0.07; rr(ctx, iw * .16, ih * .14, iw * .68, ih * .72, iw * .06); ctx.stroke(); ctx.lineWidth = iw * .025; rr(ctx, iw * .25, ih * .22, iw * .5, ih * .56, iw * .04); ctx.stroke(); }
  }
  else if (t === 'f') drawFlower(ctx, +rest, iw, ih);
  else if (t === 'p') drawPic(ctx, +rest, iw, ih);
  else if (t === 'L') letter(ctx, rest, iw, ih, S.letterColor);
  else if (t === 'T') letter(ctx, rest, iw, ih, targetColor || S.targetColor);
  ctx.restore();
  return cv;
}
export function letter(ctx, ch, w, h, col) {
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${w * 1.12}px ${LAT}`;
  ctx.translate(w / 2, h * 0.53); ctx.scale(1.02, 1);
  ctx.lineJoin = 'round'; ctx.lineWidth = w * 0.05; ctx.strokeStyle = col; ctx.fillStyle = col;
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
