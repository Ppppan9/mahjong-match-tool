// 中东风主题：全部程序化绘制的图案（牌面图标、花纹、剪影）。坐标多用“单位空间”：x∈[-50,50]，y∈[-60,60]
import { FONT_AR } from '../fonts.js';
import { DOTS } from '../faces.js';

export const P = {
  gold: '#d9a43a', goldL: '#f8dd8c', goldD: '#8f5f17', turq: '#139186', turqL: '#3cc2b2', turqD: '#0b5c57',
  lapis: '#1f3f8f', lapisL: '#3c64c0', ruby: '#ad2238', rubyL: '#e04a5c', emer: '#1d7a4c', emerL: '#3fae6c',
  terra: '#b95a32', wood: '#7a4a22', woodL: '#a8703a', ink: '#2b1a0e', sand: '#e0ac68', sandL: '#f3d29b', ivory: '#fbf3df', date: '#7a2d14', dateL: '#b34e25',
};
export function goldGrad(ctx, y0, y1, x0 = 0, x1 = 0) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#fff2bf'); g.addColorStop(0.35, '#f2c650'); g.addColorStop(0.7, '#d0921f'); g.addColorStop(1, '#8f5a12'); return g;
}
const unit = (ctx, w, h, fn, sc = 1) => { ctx.save(); ctx.translate(w / 2, h / 2); const k = Math.min(w / 100, h / 120) * sc; ctx.scale(k, k); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; fn(); ctx.restore(); };
// 先整体描深色外轮廓、再填色：多部件拼成的剪影外框干净
function outlined(ctx, parts, lw = 4.5, stroke = P.ink) {
  ctx.save(); ctx.strokeStyle = stroke; ctx.lineWidth = lw; for (const [path] of parts) { path(); ctx.stroke(); } ctx.restore();
  for (const [path, fill] of parts) { path(); ctx.fillStyle = fill; ctx.fill(); }
}
const E = (ctx, x, y, rx, ry, rot = 0) => () => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };
const Poly = (ctx, pts) => () => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); };
export function star(ctx, x, y, R, r, n = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? r : R; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath();
}
// 新月：大圆减去偏移小圆（直接算两圆交点，不用合成模式，避免擦掉牌面底色）
export function crescentPath(ctx, x1, y1, r1, x2, y2, r2) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const mx = x1 + a * dx / d, my = y1 + a * dy / d;
  const p1 = [mx + h * dy / d, my - h * dx / d], p2 = [mx - h * dy / d, my + h * dx / d];
  const ang = (c, p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const inside = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) < r;
  const a1 = ang([x1, y1], p1), a2 = ang([x1, y1], p2);
  let ccw = false; { let m = a1 + (((a2 - a1) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / 2; if (inside(x1 + Math.cos(m) * r1, y1 + Math.sin(m) * r1, x2, y2, r2)) ccw = true; }
  const b2 = ang([x2, y2], p2), b1 = ang([x2, y2], p1);
  let ccw2 = false; { let m = b2 + (((b1 - b2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / 2; if (!inside(x2 + Math.cos(m) * r2, y2 + Math.sin(m) * r2, x1, y1, r1 + 0.01)) ccw2 = true; }
  ctx.beginPath(); ctx.arc(x1, y1, r1, a1, a2, ccw); ctx.arc(x2, y2, r2, b2, b1, ccw2); ctx.closePath();
}
// 八角星（两个正方形叠加）
export function star8(ctx, x, y, R) { star(ctx, x, y, R, R * 0.7654, 8, -Math.PI / 2); }

// ---------------- 牌面图标 ----------------
function iconCrescent(ctx) {
  crescentPath(ctx, -4, 2, 36, 12, -8, 30);
  ctx.strokeStyle = P.ink; ctx.lineWidth = 5; ctx.stroke(); ctx.fillStyle = goldGrad(ctx, -34, 38); ctx.fill();
  star(ctx, 20, 6, 14, 5.6); ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = goldGrad(ctx, -8, 20); ctx.fill();
  ctx.strokeStyle = 'rgba(255,250,220,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-4, 2, 31, Math.PI * 0.62, Math.PI * 1.15); ctx.stroke();
}
function iconLantern(ctx) {
  ctx.strokeStyle = P.goldD; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, -55, 4, 0, 7); ctx.stroke();
  const body = Poly(ctx, [[-16, -32], [16, -32], [22, -6], [16, 21], [-16, 21], [-22, -6]]);
  outlined(ctx, [
    [() => { ctx.beginPath(); ctx.moveTo(-14, -37); ctx.quadraticCurveTo(-12, -52, 0, -53); ctx.quadraticCurveTo(12, -52, 14, -37); ctx.closePath(); }, goldGrad(ctx, -53, -37)],
    [Poly(ctx, [[-18, -38], [18, -38], [18, -32], [-18, -32]]), P.goldD],
    [body, (() => { const g = ctx.createRadialGradient(0, -6, 2, 0, -6, 26); g.addColorStop(0, '#fff6c2'); g.addColorStop(0.45, '#ffc44a'); g.addColorStop(1, '#d9661c'); return g; })()],
    [Poly(ctx, [[-18, 21], [18, 21], [18, 27], [-18, 27]]), P.goldD],
    [Poly(ctx, [[-14, 27], [14, 27], [0, 44]]), goldGrad(ctx, 27, 44)],
    [E(ctx, 0, 47, 3.5, 3.5), P.gold],
  ], 4);
  // 彩色玻璃 + 金色窗棂
  ctx.save(); body(); ctx.clip();
  ctx.globalAlpha = 0.55; ctx.fillStyle = P.turq; ctx.beginPath(); ctx.ellipse(-11, -6, 5, 13, 0, 0, 7); ctx.fill(); ctx.fillStyle = P.ruby; ctx.beginPath(); ctx.ellipse(11, -6, 5, 13, 0, 0, 7); ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = P.goldD; ctx.lineWidth = 2.6;
  for (const x of [-6, 6]) { ctx.beginPath(); ctx.moveTo(x, -32); ctx.lineTo(x * 1.25, -6); ctx.lineTo(x, 21); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(-22, -6); ctx.lineTo(22, -6); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.85; star8(ctx, 0, -6, 5); ctx.fill();
  ctx.restore();
}
function iconDallah(ctx) {
  const g = goldGrad(ctx, -48, 44, -30, 30);
  outlined(ctx, [
    [() => { ctx.beginPath(); ctx.moveTo(-9, 10); ctx.bezierCurveTo(-12, 2, -20, -2, -32, -14); ctx.quadraticCurveTo(-40, -22, -44, -26); ctx.lineTo(-38, -27); ctx.quadraticCurveTo(-28, -16, -20, -10); ctx.bezierCurveTo(-12, -4, -6, 0, -2, 6); ctx.closePath(); }, g],
    [() => { ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(16, -14); ctx.bezierCurveTo(14, 0, 12, 6, 20, 14); ctx.lineTo(-10, 14); ctx.bezierCurveTo(-2, 6, -4, 0, -6, -14); ctx.closePath(); }, g],
    [E(ctx, 5, 28, 23, 16), g],
    [Poly(ctx, [[-12, 42], [22, 42], [26, 47], [-16, 47]]), P.goldD],
    [() => { ctx.beginPath(); ctx.moveTo(-9, -14); ctx.quadraticCurveTo(-8, -30, 5, -32); ctx.quadraticCurveTo(18, -30, 19, -14); ctx.closePath(); }, g],
    [Poly(ctx, [[2, -32], [8, -32], [5, -50]]), g],
    [E(ctx, 5, -40, 3.6, 3), P.goldL],
  ], 4.5);
  ctx.strokeStyle = P.ink; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(17, -8); ctx.bezierCurveTo(34, -6, 34, 18, 24, 26); ctx.stroke();
  ctx.strokeStyle = P.gold; ctx.lineWidth = 2.2; ctx.stroke();
  ctx.strokeStyle = 'rgba(110,60,10,.7)'; ctx.lineWidth = 1.6;
  for (const y of [-8, 0, 20, 34]) { ctx.beginPath(); ctx.moveTo(-14, y); ctx.lineTo(24, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,250,220,.75)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(-6, 26, 6, 9, 0.3, 0, 7); ctx.stroke();
}
function iconFinjan(ctx) {
  const cup = (x, y, s) => {
    const body = () => { ctx.beginPath(); ctx.moveTo(x - 15 * s, y - 12 * s); ctx.lineTo(x + 15 * s, y - 12 * s); ctx.quadraticCurveTo(x + 13 * s, y + 12 * s, x + 6 * s, y + 14 * s); ctx.lineTo(x - 6 * s, y + 14 * s); ctx.quadraticCurveTo(x - 13 * s, y + 12 * s, x - 15 * s, y - 12 * s); ctx.closePath(); };
    outlined(ctx, [[body, '#fffaf0']], 4);
    ctx.save(); body(); ctx.clip();
    ctx.fillStyle = P.lapis; ctx.fillRect(x - 16 * s, y - 3 * s, 32 * s, 6 * s);
    ctx.fillStyle = P.gold; ctx.fillRect(x - 16 * s, y - 10 * s, 32 * s, 2.2 * s); ctx.fillRect(x - 16 * s, y + 5 * s, 32 * s, 2.2 * s);
    ctx.fillStyle = '#fff'; for (let i = -2; i <= 2; i++) { star(ctx, x + i * 6 * s, y, 2.4 * s, 1 * s, 4, 0); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = '#6b3b12'; ctx.beginPath(); ctx.ellipse(x, y - 12 * s, 13.5 * s, 2.6 * s, 0, 0, 7); ctx.fill();
  };
  outlined(ctx, [[E(ctx, 0, 36, 44, 9), goldGrad(ctx, 28, 44)]], 4);
  cup(-18, 16, 1.05); cup(18, 20, 0.95);
  ctx.strokeStyle = 'rgba(150,150,170,.8)'; ctx.lineWidth = 3;
  for (const x of [-18, 18]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x - 8, -12, x + 8, -20, x, -34); ctx.stroke(); }
}
function iconCamel(ctx) {
  const c = P.sand, legs = [[-14, 12], [-6, 14], [16, 12], [24, 12]];
  const parts = [
    [() => { ctx.beginPath(); ctx.moveTo(-22, 8); ctx.bezierCurveTo(-22, -6, -10, -6, -4, -14); ctx.bezierCurveTo(4, -34, 18, -32, 22, -12); ctx.bezierCurveTo(30, -10, 34, 0, 32, 10); ctx.bezierCurveTo(24, 22, -14, 22, -22, 8); ctx.closePath(); }, c],
    [() => { ctx.beginPath(); ctx.moveTo(-18, 0); ctx.bezierCurveTo(-28, -6, -30, -24, -34, -34); ctx.lineTo(-26, -38); ctx.bezierCurveTo(-24, -26, -18, -14, -10, -8); ctx.closePath(); }, c],
    [E(ctx, -36, -38, 10, 6, -0.2), c],
    ...legs.map(([x, y]) => [Poly(ctx, [[x - 3, y], [x + 3, y], [x + 2.4, 46], [x - 2.6, 46]]), c]),
  ];
  outlined(ctx, parts, 4.5);
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(-38, -40, 1.6, 0, 7); ctx.fill();
  // 鞍毯
  ctx.save(); parts[0][0](); ctx.clip();
  ctx.fillStyle = P.ruby; ctx.beginPath(); ctx.moveTo(-4, -26); ctx.bezierCurveTo(6, -38, 22, -36, 26, -18); ctx.lineTo(24, 6); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = P.gold; ctx.fillRect(-6, 2, 32, 3);
  ctx.fillStyle = P.lapis; for (let i = 0; i < 4; i++) { star(ctx, 3 + i * 6.5, -8, 2.4, 1, 4, 0); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = P.gold; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-4 + i * 5.6, 5); ctx.lineTo(-1.2 + i * 5.6, 11); ctx.lineTo(1.6 + i * 5.6, 5); ctx.fill(); }
  ctx.strokeStyle = P.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(32, 2); ctx.quadraticCurveTo(38, 10, 35, 20); ctx.stroke();
}
function iconPalm(ctx) {
  ctx.fillStyle = P.sandL; ctx.strokeStyle = P.ink; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.ellipse(4, 48, 32, 7, 0, Math.PI, 0); ctx.closePath(); ctx.stroke(); ctx.fill();
  // 树干：弯曲的叠瓦段
  for (let i = 0; i < 9; i++) {
    const t = i / 8, x = 6 - 10 * t * t + 4 * t, y = 44 - 64 * t, w = 8 - 2 * t;
    ctx.fillStyle = i % 2 ? P.woodL : P.wood; ctx.strokeStyle = P.ink; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x - w, y + 4); ctx.lineTo(x + w, y + 4); ctx.lineTo(x + w * 0.9, y - 5); ctx.quadraticCurveTo(x, y - 1, x - w * 0.9, y - 5); ctx.closePath(); ctx.stroke(); ctx.fill();
  }
  const cx = 0, cy = -22;
  const frond = (ang, len, bend) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    const leaf = () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -10 - bend, len, 6 + bend * 0.6); ctx.quadraticCurveTo(len * 0.5, 2 - bend * 0.3, 0, 0); ctx.closePath(); };
    leaf(); ctx.strokeStyle = P.ink; ctx.lineWidth = 3.5; ctx.stroke();
    const g = ctx.createLinearGradient(0, -10, len, 10); g.addColorStop(0, P.emerL); g.addColorStop(1, P.emer); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(10,50,25,.7)'; ctx.lineWidth = 1.2; for (let i = 1; i < 6; i++) { const x = len * i / 6; ctx.beginPath(); ctx.moveTo(x, -bend * 0.25 * Math.sin(Math.PI * i / 6) - 3); ctx.lineTo(x + 4, 4); ctx.stroke(); }
    ctx.restore();
  };
  frond(-2.9, 40, 6); frond(-2.2, 42, 8); frond(-1.4, 30, 4); frond(-0.9, 42, 8); frond(-0.2, 40, 6); frond(-3.6, 34, 4);
  ctx.fillStyle = P.dateL; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.6;
  for (const [x, y] of [[-6, -15], [-2, -12], [3, -14], [7, -11], [-4, -9], [1, -8], [5, -6]]) { ctx.beginPath(); ctx.ellipse(x, y, 2.8, 3.6, 0, 0, 7); ctx.fill(); ctx.stroke(); }
}
function iconRose(ctx) {
  ctx.strokeStyle = P.ink; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 6); ctx.bezierCurveTo(4, 24, -4, 36, 2, 54); ctx.stroke();
  ctx.strokeStyle = P.emer; ctx.lineWidth = 3.4; ctx.stroke();
  const leaf = (x, y, a) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); outlined(ctx, [[E(ctx, 9, 0, 11, 5.5), P.emerL]], 3.5); ctx.strokeStyle = P.emer; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 0); ctx.stroke(); ctx.restore(); };
  leaf(1, 30, -0.5); leaf(-1, 40, Math.PI + 0.5);
  const petals = (n, R, r, rot, c1, c2) => {
    for (let i = 0; i < n; i++) {
      const a = rot + i * Math.PI * 2 / n, x = Math.cos(a) * R, y = -12 + Math.sin(a) * R * 0.85;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.strokeStyle = 'rgba(70,0,15,.9)'; ctx.lineWidth = 2.6; ctx.stroke(); ctx.fillStyle = g; ctx.fill();
    }
  };
  petals(6, 16, 15, 0.3, '#d9334d', '#8d1028'); petals(5, 9, 11, 0.9, '#f0566b', '#b51d39');
  ctx.beginPath(); ctx.arc(0, -12, 8, 0, 7); ctx.fillStyle = '#c21f3b'; ctx.fill(); ctx.strokeStyle = 'rgba(70,0,15,.9)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = '#7c0a20'; ctx.lineWidth = 1.8; ctx.beginPath(); for (let a = 0; a < 9; a += 0.2) { const r = 1 + a * 0.75; ctx.lineTo(Math.cos(a) * r, -12 + Math.sin(a) * r); } ctx.stroke();
}
function iconFalcon(ctx) {
  // 金色栖木
  outlined(ctx, [[Poly(ctx, [[-36, 40], [36, 40], [36, 47], [-36, 47]]), goldGrad(ctx, 40, 47)]], 3.5);
  const body = () => { ctx.beginPath(); ctx.moveTo(4, -36); ctx.bezierCurveTo(22, -34, 24, -10, 20, 8); ctx.bezierCurveTo(16, 26, 8, 34, 2, 40); ctx.lineTo(-8, 52); ctx.lineTo(-14, 50); ctx.lineTo(-8, 34); ctx.bezierCurveTo(-18, 18, -16, -6, -10, -20); ctx.bezierCurveTo(-8, -30, -4, -36, 4, -36); ctx.closePath(); };
  outlined(ctx, [[body, '#8a5a32'], [E(ctx, 6, -32, 12, 11), '#9c6a3c']], 4.5);
  ctx.save(); body(); ctx.clip();
  ctx.fillStyle = '#f3e2c2'; ctx.beginPath(); ctx.ellipse(10, 4, 10, 26, -0.15, 0, 7); ctx.fill();
  ctx.fillStyle = '#7a4a24'; for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.ellipse(6 + (i % 3) * 5, -12 + Math.floor(i / 3) * 9, 1.6, 2.4, 0, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#5c3618'; ctx.beginPath(); ctx.moveTo(-12, -18); ctx.bezierCurveTo(-2, -10, 2, 16, -6, 40); ctx.bezierCurveTo(-16, 22, -18, 0, -12, -18); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#3a220e'; ctx.beginPath(); ctx.ellipse(4, -34, 10, 6, 0, Math.PI, 0); ctx.fill(); // 头顶深色
  ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = P.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(15, -36); ctx.quadraticCurveTo(26, -34, 24, -24); ctx.quadraticCurveTo(21, -27, 16, -28); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#ffcf3d'; ctx.beginPath(); ctx.arc(9, -33, 3.6, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(9.6, -33, 1.8, 0, 7); ctx.fill();
  ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, -29); ctx.lineTo(4, -22); ctx.stroke();
  ctx.strokeStyle = '#e8b52a'; ctx.lineWidth = 3; for (const x of [-2, 6]) { ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x, 41); ctx.stroke(); }
}
function iconOud(ctx) {
  ctx.save(); ctx.rotate(-0.55);
  outlined(ctx, [
    [Poly(ctx, [[-4, -60], [4, -60], [5, -18], [-5, -18]]), P.wood],
    [Poly(ctx, [[-5, -60], [5, -60], [9, -72], [-1, -72]]), '#5a3214'],
    [E(ctx, 0, 14, 24, 32), (() => { const g = ctx.createRadialGradient(-6, 4, 2, 0, 14, 34); g.addColorStop(0, '#d8995a'); g.addColorStop(1, '#7a4319'); return g; })()],
  ], 4.5);
  ctx.save(); E(ctx, 0, 14, 24, 32)(); ctx.clip();
  ctx.strokeStyle = 'rgba(60,30,8,.5)'; ctx.lineWidth = 1.3; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(0, 14, Math.abs(i) * 7 + 1, 33, 0, 0, 7); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = '#f2e3c4'; ctx.beginPath(); ctx.ellipse(0, 20, 12, 18, 0, 0.12 * Math.PI, 0.88 * Math.PI); ctx.fill();
  ctx.fillStyle = '#3a1d08'; ctx.beginPath(); ctx.arc(0, 4, 6.5, 0, 7); ctx.fill();
  ctx.strokeStyle = P.gold; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0, 4, 8.5, 0, 7); ctx.stroke(); star8(ctx, 0, 4, 4); ctx.fillStyle = P.gold; ctx.fill();
  ctx.fillStyle = P.ink; ctx.fillRect(-7, 32, 14, 3);
  ctx.strokeStyle = 'rgba(255,245,215,.9)'; ctx.lineWidth = 0.8; for (const x of [-3, -1, 1, 3]) { ctx.beginPath(); ctx.moveTo(x * 0.8, -60); ctx.lineTo(x, 33); ctx.stroke(); }
  ctx.fillStyle = P.goldL; for (const [x, y] of [[-6, -66], [7, -64], [-6, -58], [7, -56]]) { ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); }
  ctx.restore();
}
function iconLamp(ctx) {
  const g = goldGrad(ctx, -24, 30);
  outlined(ctx, [
    [() => { ctx.beginPath(); ctx.moveTo(-30, 8); ctx.bezierCurveTo(-30, -10, 22, -12, 24, 2); ctx.bezierCurveTo(32, 0, 40, -10, 46, -14); ctx.lineTo(48, -10); ctx.bezierCurveTo(40, 0, 32, 14, 20, 18); ctx.bezierCurveTo(4, 24, -26, 22, -30, 8); ctx.closePath(); }, g],
    [() => { ctx.beginPath(); ctx.moveTo(-10, -6); ctx.quadraticCurveTo(-8, -24, 2, -24); ctx.quadraticCurveTo(12, -24, 12, -6); ctx.closePath(); }, g],
    [E(ctx, 1, -28, 4, 4), P.goldL],
    [Poly(ctx, [[-12, 20], [12, 20], [16, 30], [-16, 30]]), P.goldD],
  ], 4.5);
  ctx.strokeStyle = P.ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-28, 0); ctx.bezierCurveTo(-46, -8, -46, 18, -28, 14); ctx.stroke();
  ctx.strokeStyle = P.gold; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,250,220,.8)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(-8, 6, 14, 5, -0.1, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
  ctx.fillStyle = P.lapis; star8(ctx, 2, 10, 4.5); ctx.fill();
  ctx.strokeStyle = 'rgba(120,150,210,.75)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(47, -14); ctx.bezierCurveTo(54, -26, 38, -32, 44, -42); ctx.bezierCurveTo(48, -50, 36, -54, 32, -50); ctx.stroke();
}
function iconDates(ctx) {
  const dates = [[-20, 10, -0.4], [-8, 8, 0.2], [6, 9, -0.2], [19, 10, 0.4], [-14, -2, 0.3], [0, -4, -0.1], [13, -2, 0.5], [-5, -14, 0.1], [8, -14, -0.4]];
  for (const [x, y, a] of dates) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 10, 0, 0, 7); ctx.strokeStyle = P.ink; ctx.lineWidth = 3; ctx.stroke();
    const g = ctx.createRadialGradient(-2, -3, 1, 0, 0, 11); g.addColorStop(0, '#c4642e'); g.addColorStop(1, '#5c1d0a'); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,180,.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(-1.8, -2, 2, 5, 0, Math.PI * 0.9, Math.PI * 1.6); ctx.stroke();
    ctx.restore();
  }
  // 碗
  const bowl = () => { ctx.beginPath(); ctx.moveTo(-40, 14); ctx.lineTo(40, 14); ctx.bezierCurveTo(38, 40, 20, 46, 0, 46); ctx.bezierCurveTo(-20, 46, -38, 40, -40, 14); ctx.closePath(); };
  outlined(ctx, [[bowl, (() => { const g = ctx.createLinearGradient(0, 14, 0, 46); g.addColorStop(0, P.turqL); g.addColorStop(1, P.turqD); return g; })()]], 4.5);
  ctx.fillStyle = goldGrad(ctx, 12, 18); ctx.fillRect(-40, 12, 80, 5);
  ctx.save(); bowl(); ctx.clip(); ctx.strokeStyle = P.goldL; ctx.lineWidth = 1.8;
  for (let i = -3; i <= 3; i++) { star8(ctx, i * 11, 29, 4); ctx.stroke(); }
  ctx.restore();
  outlined(ctx, [[Poly(ctx, [[-12, 46], [12, 46], [16, 52], [-16, 52]]), P.goldD]], 3);
}
function iconCarpet(ctx) {
  ctx.strokeStyle = '#f5ecd8'; ctx.lineWidth = 1.6;
  for (let i = -15; i <= 15; i++) { ctx.beginPath(); ctx.moveTo(i * 2.1, -50); ctx.lineTo(i * 2.1, -56); ctx.moveTo(i * 2.1, 50); ctx.lineTo(i * 2.1, 56); ctx.stroke(); }
  ctx.fillStyle = P.ruby; ctx.strokeStyle = P.ink; ctx.lineWidth = 3; ctx.fillRect(-34, -50, 68, 100); ctx.strokeRect(-34, -50, 68, 100);
  ctx.fillStyle = P.lapis; ctx.fillRect(-26, -42, 52, 84);
  ctx.strokeStyle = P.gold; ctx.lineWidth = 2; ctx.strokeRect(-30, -46, 60, 92); ctx.strokeRect(-26, -42, 52, 84);
  ctx.fillStyle = P.goldL; for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.arc(-27 + i * 6, -48, 1.2, 0, 7); ctx.arc(-27 + i * 6, 48, 1.2, 0, 7); ctx.fill(); }
  // 中心大菱形纹章
  ctx.fillStyle = P.ruby; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(20, 0); ctx.lineTo(0, 34); ctx.lineTo(-20, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = P.gold; ctx.lineWidth = 2.4; ctx.stroke();
  ctx.fillStyle = P.ivory; star8(ctx, 0, 0, 10); ctx.fill(); ctx.fillStyle = P.turq; star8(ctx, 0, 0, 6); ctx.fill(); ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, 7); ctx.fill();
  ctx.fillStyle = P.turq; for (const [x, y] of [[-26, -42], [26, -42], [-26, 42], [26, 42]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sign(-x) * 12, y); ctx.lineTo(x, y + Math.sign(-y) * 14); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = P.goldL; for (const y of [-22, 22]) { star(ctx, -15, y, 3, 1.2, 4, 0); ctx.fill(); star(ctx, 15, y, 3, 1.2, 4, 0); ctx.fill(); }
}
function iconMosaic(ctx) {
  ctx.lineWidth = 3;
  star8(ctx, 0, 0, 46); ctx.fillStyle = P.turq; ctx.fill(); ctx.strokeStyle = P.goldD; ctx.stroke();
  ctx.fillStyle = P.ivory; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2; ctx.save(); ctx.translate(Math.cos(a) * 30, Math.sin(a) * 30); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(0, -5); ctx.lineTo(9, 0); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill(); ctx.restore(); }
  star8(ctx, 0, 0, 26); ctx.fillStyle = P.lapis; ctx.fill(); ctx.strokeStyle = P.gold; ctx.lineWidth = 2.5; ctx.stroke();
  star(ctx, 0, 0, 14, 6, 8, -Math.PI / 2); ctx.fillStyle = goldGrad(ctx, -14, 14); ctx.fill();
  ctx.fillStyle = P.ruby; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 7); ctx.fill();
}
function iconDesertRose(ctx) {
  // 沙漠玫瑰石：一圈圈竖立的薄片晶体，粉沙色，边缘高光
  const blade = (x, y, a, r, c0, c1) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.34, 0, 0, 7);
    const g = ctx.createLinearGradient(0, -r * 0.34, 0, r * 0.34); g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#6a3420'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,225,.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, -r * 0.05, r * 0.82, r * 0.22, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.restore();
  };
  ctx.fillStyle = 'rgba(120,70,40,.25)'; ctx.beginPath(); ctx.ellipse(0, 40, 40, 8, 0, 0, 7); ctx.fill();
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; blade(Math.cos(a) * 26, 6 + Math.sin(a) * 22, a + Math.PI / 2, 18, '#f1c7a6', '#b56d4a'); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.4; blade(Math.cos(a) * 13, 2 + Math.sin(a) * 11, a + Math.PI / 2, 14, '#f8d9bd', '#c98261'); }
  blade(0, -2, 0.3, 10, '#ffe6cf', '#d9906c'); blade(0, 0, -1.2, 9, '#ffe6cf', '#d9906c');
  ctx.fillStyle = 'rgba(255,255,255,.95)'; for (const [x, y] of [[-30, -22], [30, -16], [8, 42]]) { star(ctx, x, y, 4, 1.4, 4, 0); ctx.fill(); }
}
function iconJasmine(ctx) {
  const fl = (x, y, s) => { for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5 - Math.PI / 2; ctx.save(); ctx.translate(x, y); ctx.rotate(a); outlined(ctx, [[E(ctx, 0, -9 * s, 5 * s, 9 * s), '#fffdf6']], 2.4, '#7a6a50'); ctx.restore(); } ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(x, y, 3.4 * s, 0, 7); ctx.fill(); };
  for (const [x, y, a] of [[-18, 30, -0.6], [16, 34, 0.7], [0, 6, 0.2]]) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); outlined(ctx, [[E(ctx, 0, 10, 6, 14), P.emerL]], 3); ctx.restore(); }
  fl(-14, -16, 1.1); fl(16, -6, 1); fl(-2, 22, 0.95);
}
function iconMabkhara(ctx) {
  ctx.strokeStyle = 'rgba(150,150,175,.8)'; ctx.lineWidth = 3; for (const x of [-6, 6]) { ctx.beginPath(); ctx.moveTo(x, -20); ctx.bezierCurveTo(x - 10, -32, x + 10, -42, x, -56); ctx.stroke(); }
  const g = goldGrad(ctx, -20, 48);
  outlined(ctx, [
    [() => { ctx.beginPath(); ctx.moveTo(-22, -18); ctx.quadraticCurveTo(0, -4, 22, -18); ctx.lineTo(16, -6); ctx.lineTo(-16, -6); ctx.closePath(); }, g],
    [Poly(ctx, [[-12, -6], [12, -6], [18, 34], [-18, 34]]), (() => { const q = ctx.createLinearGradient(-18, 0, 18, 0); q.addColorStop(0, '#5a2e12'); q.addColorStop(0.5, '#9a5a28'); q.addColorStop(1, '#5a2e12'); return q; })()],
    [Poly(ctx, [[-22, 34], [22, 34], [26, 46], [-26, 46]]), g],
  ], 4.5);
  ctx.fillStyle = P.gold; for (const y of [4, 18]) { star8(ctx, 0, y, 5); ctx.fill(); }
  ctx.strokeStyle = P.gold; ctx.lineWidth = 1.6; for (const x of [-9, 9]) { ctx.beginPath(); ctx.moveTo(x, -4); ctx.lineTo(x * 1.4, 32); ctx.stroke(); }
}
function iconTea(ctx) {
  outlined(ctx, [[E(ctx, 0, 40, 36, 9), goldGrad(ctx, 32, 48)]], 4);
  const glass = () => { ctx.beginPath(); ctx.moveTo(-16, -30); ctx.lineTo(16, -30); ctx.bezierCurveTo(8, -6, 8, 6, 14, 34); ctx.lineTo(-14, 34); ctx.bezierCurveTo(-8, 6, -8, -6, -16, -30); ctx.closePath(); };
  glass(); ctx.fillStyle = 'rgba(230,245,255,.5)'; ctx.fill();
  ctx.save(); glass(); ctx.clip(); const g = ctx.createLinearGradient(0, -20, 0, 34); g.addColorStop(0, '#d9741a'); g.addColorStop(1, '#8a2a08'); ctx.fillStyle = g; ctx.fillRect(-20, -20, 40, 56);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-10, -28, 4, 60); ctx.restore();
  glass(); ctx.strokeStyle = P.ink; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.fillStyle = P.gold; ctx.fillRect(-17, -32, 34, 3);
  ctx.save(); ctx.translate(14, -34); ctx.rotate(0.6); outlined(ctx, [[E(ctx, 0, -8, 5, 10), P.emerL]], 2.6); ctx.restore();
}
function iconDunes(ctx) {
  const g = ctx.createRadialGradient(10, -18, 2, 10, -18, 22); g.addColorStop(0, '#fff5c0'); g.addColorStop(1, '#f39c22');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(10, -18, 18, 0, 7); ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = 3; ctx.stroke();
  const dune = (y0, c, k) => { ctx.beginPath(); ctx.moveTo(-50, 50); ctx.lineTo(-50, y0 + 8); ctx.bezierCurveTo(-20, y0 - 16 * k, 10, y0 + 10, 50, y0 - 4); ctx.lineTo(50, 50); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = 3; ctx.stroke(); };
  dune(6, '#e8b26a', 1); dune(22, '#d08d47', -0.6); dune(36, '#b56a2e', 1);
}
const ICONS = {
  wE: iconCrescent, wS: iconLantern, wW: iconDallah, wN: iconFinjan,
  gR: iconRose, gG: iconPalm, gW: iconMabkhara,
  p1: iconCamel, p2: iconFalcon, p3: iconOud, p4: iconLamp, p5: iconDates, p6: iconTea, p7: iconDunes,
  f1: iconCarpet, f2: iconMosaic, f3: iconDesertRose, f4: iconJasmine,
};
export const ICON_NAMES = {
  wE: '新月与星', wS: '法努斯灯笼', wW: '阿拉伯咖啡壶 Dallah', wN: '咖啡杯 Finjan', gR: '大马士革玫瑰', gG: '椰枣树', gW: '香炉 Mabkhara',
  p1: '骆驼', p2: '猎隼', p3: '乌德琴', p4: '神灯', p5: '一碗椰枣', p6: '红茶杯', p7: '沙丘与太阳', f1: '地毯纹样', f2: '马赛克八角星', f3: '沙漠玫瑰石', f4: '茉莉花',
};

// ---------------- 序数牌：玫瑰花饰（筒）/ 椰枣叶（条）/ 阿拉伯-印度数字（万） ----------------
function rosette(ctx, x, y, r, col) {
  ctx.save(); ctx.translate(x, y);
  for (let i = 0; i < 8; i++) { ctx.save(); ctx.rotate(i * Math.PI / 4); ctx.beginPath(); ctx.ellipse(0, -r * 0.52, r * 0.3, r * 0.5, 0, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.restore(); }
  ctx.beginPath(); ctx.arc(0, 0, r * 0.98, 0, 7); ctx.strokeStyle = P.gold; ctx.lineWidth = r * 0.12; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, 7); ctx.fillStyle = '#fbf3df'; ctx.fill();
  star8(ctx, 0, 0, r * 0.32); ctx.fillStyle = P.gold; ctx.fill();
  ctx.restore();
}
const ROS_COL = {
  1: () => P.ruby, 2: i => [P.turq, P.lapis][i], 3: i => [P.lapis, P.ruby, P.turq][i], 4: i => [P.lapis, P.turq, P.turq, P.lapis][i],
  5: i => (i === 2 ? P.ruby : i % 3 ? P.turq : P.lapis), 6: i => (i < 2 ? P.turq : P.ruby), 7: i => (i < 3 ? P.turq : P.ruby), 8: () => P.lapis, 9: i => [P.turq, P.ruby, P.lapis][Math.floor(i / 3)],
};
function drawRosettes(ctx, n, w, h) {
  const r = (n === 1 ? 0.34 : n <= 2 ? 0.2 : n <= 4 ? 0.18 : n <= 6 ? 0.155 : n === 7 ? 0.135 : 0.125) * w;
  DOTS[n].forEach(([x, y], i) => rosette(ctx, x * w, y * h, r, ROS_COL[n](i)));
}
function frond(ctx, x, y, sw, sh) {
  ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round';
  ctx.strokeStyle = '#174d2a'; ctx.lineWidth = sw * 0.22; ctx.beginPath(); ctx.moveTo(0, sh / 2); ctx.lineTo(0, -sh / 2); ctx.stroke();
  ctx.strokeStyle = P.emer; ctx.lineWidth = sw * 0.2;
  for (let k = 0; k < 6; k++) { const yy = sh / 2 - sh * (k + 0.7) / 6.4, l = sw * (0.5 - k * 0.03); ctx.beginPath(); ctx.moveTo(-l, yy - l * 0.55); ctx.lineTo(0, yy); ctx.lineTo(l, yy - l * 0.55); ctx.stroke(); }
  ctx.strokeStyle = P.emerL; ctx.lineWidth = sw * 0.07; for (let k = 0; k < 6; k++) { const yy = sh / 2 - sh * (k + 0.7) / 6.4, l = sw * (0.42 - k * 0.03); ctx.beginPath(); ctx.moveTo(-l, yy - l * 0.55 - sw * 0.03); ctx.lineTo(0, yy - sw * 0.03); ctx.lineTo(l, yy - l * 0.55 - sw * 0.03); ctx.stroke(); }
  ctx.restore();
}
function dateStrand(ctx, x, y, sw, sh) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = P.gold; ctx.lineWidth = sw * 0.16; ctx.beginPath(); ctx.moveTo(0, -sh / 2); ctx.lineTo(0, sh / 2); ctx.stroke();
  for (let k = 0; k < 5; k++) { const yy = -sh / 2 + sh * (k + 0.6) / 5.2, xx = (k % 2 ? 1 : -1) * sw * 0.22; ctx.beginPath(); ctx.ellipse(xx, yy, sw * 0.26, sw * 0.36, 0, 0, 7); ctx.fillStyle = P.ruby; ctx.fill(); ctx.strokeStyle = '#5a0f18'; ctx.lineWidth = sw * 0.05; ctx.stroke(); }
  ctx.restore();
}
const BAMBOO = {
  2: [[[.5, .3], [.5, .7]], 2], 3: [[[.5, .3], [.3, .7], [.7, .7]], 2], 4: [[[.32, .3], [.68, .3], [.32, .7], [.68, .7]], 2],
  5: [[[.25, .27], [.75, .27], [.5, .5], [.25, .73], [.75, .73]], 2], 6: [[[.22, .27], [.5, .27], [.78, .27], [.22, .73], [.5, .73], [.78, .73]], 2],
  7: [[[.5, .17], [.22, .5], [.5, .5], [.78, .5], [.22, .83], [.5, .83], [.78, .83]], 3], 8: [[[.2, .27], [.4, .27], [.6, .27], [.8, .27], [.2, .73], [.4, .73], [.6, .73], [.8, .73]], 2],
  9: [[[.22, .17], [.5, .17], [.78, .17], [.22, .5], [.5, .5], [.78, .5], [.22, .83], [.5, .83], [.78, .83]], 3],
};
function drawPalms(ctx, n, w, h) {
  if (n === 1) { frond(ctx, w * 0.42, h * 0.5, w * 0.42, h * 0.86); dateStrand(ctx, w * 0.74, h * 0.56, w * 0.3, h * 0.6); return; }
  const [pts, rows] = BAMBOO[n];
  const sh = h * (rows === 2 ? 0.37 : 0.28), sw = w * (n === 8 ? 0.16 : 0.2);
  pts.forEach((p, i) => { const red = (n === 5 && i === 2) || (n === 7 && i === 0) || (n === 9 && i % 3 === 1); (red ? dateStrand : frond)(ctx, p[0] * w, p[1] * h, sw, sh); });
}
const AR_NUM = ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
function drawNumeral(ctx, n, w, h) {
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
  ctx.font = `700 ${w * 0.95}px ${FONT_AR}`;
  ctx.lineJoin = 'round'; ctx.strokeStyle = P.lapis; ctx.lineWidth = w * 0.035; ctx.fillStyle = P.lapis;
  ctx.fillText(AR_NUM[n - 1], w / 2, h * 0.47); ctx.strokeText(AR_NUM[n - 1], w / 2, h * 0.47);
  // 底部金色花饰线（区分花色）
  ctx.strokeStyle = P.gold; ctx.lineWidth = w * 0.025; ctx.beginPath(); ctx.moveTo(w * 0.2, h * 0.9); ctx.lineTo(w * 0.8, h * 0.9); ctx.stroke();
  ctx.fillStyle = P.ruby; ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.85); ctx.lineTo(w * 0.56, h * 0.9); ctx.lineTo(w * 0.5, h * 0.95); ctx.lineTo(w * 0.44, h * 0.9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = P.gold; for (const x of [0.17, 0.83]) { ctx.beginPath(); ctx.arc(w * x, h * 0.9, w * 0.025, 0, 7); ctx.fill(); }
  ctx.restore();
}
// 牌面（返回 true 表示已处理）
export function drawFace(ctx, key, w, h, S, targetColor, letter) {
  const t = key[0], rest = key.slice(1);
  if (t === 'd') { drawRosettes(ctx, +rest, w, h); return true; }
  if (t === 'b') { drawPalms(ctx, +rest, w, h); return true; }
  if (t === 'c') { drawNumeral(ctx, +rest, w, h); return true; }
  if (ICONS[key]) { unit(ctx, w, h, () => ICONS[key](ctx), 0.98); return true; }
  return false; // 字母沿用默认（颜色由主题设置控制）
}
export function faceBg(ctx, W, H, S, rad) {
  // 象牙白牌面 + 内圈金色细框 + 四角小八角星
  const i = W * 0.045;
  ctx.save();
  ctx.strokeStyle = 'rgba(201,150,52,.75)'; ctx.lineWidth = W * 0.016;
  const r = Math.max(0, rad - i), x = i, y = i, w = W - 2 * i, h = H - 2 * i;
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = 'rgba(201,150,52,.8)';
  for (const [cx, cy] of [[i * 2.2, i * 2.2], [W - i * 2.2, i * 2.2], [i * 2.2, H - i * 2.2], [W - i * 2.2, H - i * 2.2]]) { star8(ctx, cx, cy, W * 0.022); ctx.fill(); }
  ctx.restore();
}
export const ALL_ICON_KEYS = Object.keys(ICONS);
