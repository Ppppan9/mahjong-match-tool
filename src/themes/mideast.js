// 中东风主题：调色、背景、顶栏、托盘、Logo、粒子、结束页
import { FONT_AR, FONT_LOGO } from '../fonts.js';
import { P, goldGrad, star, star8, crescentPath, drawFace, faceBg } from './mideast_art.js';
import * as ART from './mideast_art.js';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hex = h => { h = (h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => `rgba(${hex(h).join(',')},${a})`;

// 伊斯兰几何纹样：八角星格网 + 星尖连线 + 格心菱形（girih 风格的简化版）
function girih(ctx, x0, y0, w, h, s, col, alpha, lw) {
  ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = lw;
  const R = s * 0.34, r = R * 0.7654;
  for (let j = -1; j * s < h + s; j++) for (let i = -1; i * s < w + s; i++) {
    const x = x0 + i * s, y = y0 + j * s;
    star(ctx, x, y, R, r, 8, -Math.PI / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + R, y); ctx.lineTo(x + s - R, y); ctx.moveTo(x, y + R); ctx.lineTo(x, y + s - R); ctx.stroke();
    const cx = x + s / 2, cy = y + s / 2, d = s * 0.16;
    ctx.beginPath(); ctx.moveTo(cx, cy - d); ctx.lineTo(cx + d, cy); ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d, cy); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + R * 0.7, y + R * 0.7); ctx.lineTo(cx - d * 0.7, cy - d * 0.7); ctx.moveTo(x + s - R * 0.7, y + R * 0.7); ctx.lineTo(cx + d * 0.7, cy - d * 0.7); ctx.stroke();
  }
  ctx.restore();
}
function moon(ctx, x, y, r, glow = true) {
  if (glow) { const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3.2); g.addColorStop(0, 'rgba(255,236,170,.28)'); g.addColorStop(1, 'rgba(255,236,170,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, 7); ctx.fill(); }
  crescentPath(ctx, x, y, r, x + r * 0.42, y - r * 0.22, r * 0.84);
  const g2 = ctx.createLinearGradient(x - r, y - r, x + r, y + r); g2.addColorStop(0, '#fff8dc'); g2.addColorStop(1, '#f0c766'); ctx.fillStyle = g2; ctx.fill();
}
function stars(ctx, W, H, n, y1, seed, now = 0, U = 1) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H * y1, r = (0.5 + rnd() * 1.3) * U, ph = rnd() * 6.28;
    ctx.globalAlpha = (0.25 + rnd() * 0.6) * (now ? 0.65 + 0.35 * Math.sin(now / 600 + ph) : 1);
    ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    if (r > 1.5 * U) { ctx.fillRect(x - r * 2.5, y - 0.4 * U, r * 5, 0.8 * U); ctx.fillRect(x - 0.4 * U, y - r * 2.5, 0.8 * U, r * 5); }
  }
  ctx.globalAlpha = 1;
}
// 剪影：拱廊、圆顶、宣礼塔
function skyline(ctx, W, H, y0, col, rim, U) {
  ctx.save(); ctx.fillStyle = col;
  const dome = (x, r, base) => { ctx.moveTo(x - r, base); ctx.bezierCurveTo(x - r, base - r * 1.25, x - r * 0.15, base - r * 1.2, x, base - r * 1.5); ctx.bezierCurveTo(x + r * 0.15, base - r * 1.2, x + r, base - r * 1.25, x + r, base); ctx.closePath(); };
  const tower = (x, w, h, base) => { ctx.rect(x - w / 2, base - h, w, h); ctx.rect(x - w * 0.8, base - h * 0.78, w * 1.6, w * 0.35); ctx.moveTo(x - w * 0.55, base - h); ctx.lineTo(x, base - h - w * 2.2); ctx.lineTo(x + w * 0.55, base - h); ctx.closePath(); };
  ctx.beginPath();
  ctx.rect(0, y0, W, H - y0);
  ctx.rect(W * 0.28, y0 - H * 0.035, W * 0.44, H * 0.035);
  dome(W * 0.5, W * 0.11, y0 - H * 0.035); dome(W * 0.34, W * 0.05, y0 - H * 0.03); dome(W * 0.66, W * 0.05, y0 - H * 0.03);
  tower(W * 0.22, W * 0.022, H * 0.15, y0); tower(W * 0.78, W * 0.022, H * 0.15, y0);
  tower(W * 0.05, W * 0.018, H * 0.1, y0); dome(W * 0.12, W * 0.035, y0); dome(W * 0.9, W * 0.04, y0); tower(W * 0.96, W * 0.016, H * 0.08, y0);
  ctx.fill();
  // 拱廊窗：暖色灯光
  ctx.fillStyle = 'rgba(255,190,90,.35)';
  for (let i = 0; i < 9; i++) { const x = W * (0.3 + i * 0.05), w = W * 0.018, hh = H * 0.018, b = y0 - H * 0.006; ctx.beginPath(); ctx.moveTo(x - w / 2, b); ctx.lineTo(x - w / 2, b - hh); ctx.quadraticCurveTo(x - w / 2, b - hh - w * 0.6, x, b - hh - w); ctx.quadraticCurveTo(x + w / 2, b - hh - w * 0.6, x + w / 2, b - hh); ctx.lineTo(x + w / 2, b); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  if (rim) { ctx.save(); ctx.globalAlpha = 0.3; ctx.strokeStyle = rim; ctx.lineWidth = 1 * U; ctx.beginPath(); dome(W * 0.5, W * 0.11, y0 - H * 0.035); ctx.stroke(); ctx.restore(); }
}
function dunes(ctx, W, H, y0, cols, U) {
  cols.forEach((c, i) => {
    const y = y0 + i * H * 0.025, k = i % 2 ? -1 : 1;
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, y + H * 0.02 * k);
    ctx.bezierCurveTo(W * 0.3, y - H * 0.03 * k, W * 0.6, y + H * 0.035 * k, W, y - H * 0.01 * k); ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = c; ctx.fill();
    ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = '#e9b867'; ctx.lineWidth = 1.2 * U; ctx.beginPath(); ctx.moveTo(0, y + H * 0.02 * k); ctx.bezierCurveTo(W * 0.3, y - H * 0.03 * k, W * 0.6, y + H * 0.035 * k, W, y - H * 0.01 * k); ctx.stroke(); ctx.restore();
  });
}
// 悬挂的法努斯灯笼（含光晕）
function lantern(ctx, x, top, len, size, glowA = 1, U = 1) {
  ctx.save(); ctx.strokeStyle = 'rgba(232,190,100,.7)'; ctx.lineWidth = 1.3 * U; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + len); ctx.stroke(); ctx.restore();
  const cy = top + len + size * 0.55;
  const g = ctx.createRadialGradient(x, cy, 0, x, cy, size * 2.2); g.addColorStop(0, `rgba(255,200,90,${0.45 * glowA})`); g.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, cy, size * 2.2, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(x - size * 0.5, top + len); ART.drawFace(ctx, 'wS', size, size * 1.2); ctx.restore();
}
const tinted = new Map();
function silhouette(key, col, s) {
  const k = key + col + s; if (tinted.has(k)) return tinted.get(k);
  const c = document.createElement('canvas'); c.width = s; c.height = Math.round(s * 1.2); const g = c.getContext('2d');
  ART.drawFace(g, key, s, s * 1.2); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  tinted.set(k, c); return c;
}

let bgCache = null, bgKey = '';
function background(ctx, e) {
  const { W, H, U, S, VP } = e;
  const key = [W, H, VP.x, VP.y, VP.w, VP.h, S.bgColor, S.bgColor2, S.bgPattern, S.bgSkyline, S.bgLanterns, S.bgBoardDim, S.topBarHeight].join('|');
  if (key !== bgKey) {
    bgKey = key; bgCache = document.createElement('canvas'); bgCache.width = W; bgCache.height = H;
    const c = bgCache.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, S.bgColor); g.addColorStop(0.55, S.bgColor2); g.addColorStop(1, S.bgColor2);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const rg = c.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, H * 0.6); rg.addColorStop(0, 'rgba(40,90,160,.25)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = rg; c.fillRect(0, 0, W, H);
    stars(c, W, H, 140, 0.85, 11, 0, U);
    if (S.bgPattern > 0) {
      const s = W * 0.16;
      girih(c, W / 2 - s * 3, H * S.topBarHeight, W, H, s, '#e8c070', S.bgPattern, 1.1 * U);
    }
    moon(c, W * 0.86, H * S.topBarHeight + H * 0.045, W * 0.032);
    if (S.bgSkyline) {
      skyline(c, W, H, H * 0.945, '#091231', '#e8c070', U);
      dunes(c, W, H, H * 0.955, ['#1b1834', '#2a1d36'], U);
    }
    // 棋盘后方压暗，保证牌面清晰
    if (S.bgBoardDim > 0) {
      const cx = VP.x + VP.w / 2, cy = VP.y + VP.h / 2, R = Math.max(VP.w, VP.h) * 0.62;
      const d = c.createRadialGradient(cx, cy, R * 0.2, cx, cy, R); d.addColorStop(0, `rgba(2,6,20,${S.bgBoardDim})`); d.addColorStop(0.7, `rgba(2,6,20,${S.bgBoardDim * 0.6})`); d.addColorStop(1, 'rgba(2,6,20,0)');
      c.fillStyle = d; c.fillRect(0, 0, W, H);
    }
    if (S.bgLanterns) {
      const th = H * S.topBarHeight;
      lantern(c, W * 0.035, th, H * 0.012, W * 0.045, 1, U); lantern(c, W * 0.965, th, H * 0.03, W * 0.045, 1, U);
    }
  }
  ctx.drawImage(bgCache, 0, 0);
}

// 顶栏：深色雕花木 + 木格窗（mashrabiya）+ 上下金边 + 底部尖拱垂饰
function topBar(ctx, e) {
  const { W, U, S, th } = e;
  const g = ctx.createLinearGradient(0, 0, 0, th); g.addColorStop(0, ART_shade(S.topBarColor, 1.25)); g.addColorStop(0.5, S.topBarColor); g.addColorStop(1, ART_shade(S.topBarColor, 0.8));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, th);
  // 木格窗：斜向菱格 + 交点圆珠
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, th); ctx.clip();
  const s = 15 * U;
  ctx.lineWidth = 2.2 * U; ctx.strokeStyle = 'rgba(0,0,0,.35)';
  for (let x = -th; x < W + th; x += s) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + th, th); ctx.moveTo(x, 0); ctx.lineTo(x - th, th); ctx.stroke(); }
  ctx.lineWidth = 0.8 * U; ctx.strokeStyle = 'rgba(255,200,120,.10)';
  for (let x = -th; x < W + th; x += s) { ctx.beginPath(); ctx.moveTo(x + 1.2 * U, 0); ctx.lineTo(x + th + 1.2 * U, th); ctx.moveTo(x + 1.2 * U, 0); ctx.lineTo(x - th + 1.2 * U, th); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,205,130,.16)';
  for (let y = 0; y <= th + s; y += s / 2) for (let x = ((y / (s / 2)) % 2) * s / 2; x <= W; x += s) { ctx.beginPath(); ctx.arc(x, y, 1.6 * U, 0, 7); ctx.fill(); }
  ctx.restore();
  // 金边
  const gl = (y, h) => { ctx.fillStyle = goldGrad(ctx, y, y + h); ctx.fillRect(0, y, W, h); };
  gl(0, 2.5 * U); gl(th - 6 * U, 4 * U);
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, th - 2 * U, W, 2 * U);
  // 尖拱垂饰
  const aw = 20 * U, ah = 8 * U;
  ctx.save();
  for (let x = 0; x < W + aw; x += aw) {
    ctx.beginPath(); ctx.moveTo(x, th); ctx.quadraticCurveTo(x + aw * 0.1, th + ah * 0.9, x + aw / 2, th + ah); ctx.quadraticCurveTo(x + aw * 0.9, th + ah * 0.9, x + aw, th); ctx.closePath();
    ctx.fillStyle = ART_shade(S.topBarColor, 0.9); ctx.fill(); ctx.strokeStyle = 'rgba(232,180,80,.85)'; ctx.lineWidth = 1.2 * U; ctx.stroke();
    ctx.fillStyle = '#e8b450'; ctx.beginPath(); ctx.arc(x + aw / 2, th + ah * 0.55, 1.5 * U, 0, 7); ctx.fill();
  }
  ctx.restore();
  const sg = ctx.createLinearGradient(0, th + ah, 0, th + ah + 10 * U); sg.addColorStop(0, 'rgba(0,0,0,.45)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = sg; ctx.fillRect(0, th + ah * 0.6, W, 10 * U);
}
function ART_shade(h, f) { return `rgb(${hex(h).map(v => Math.max(0, Math.min(255, Math.round(v * f)))).join(',')})`; }
// 托盘格：尖拱形金框
function archPath(ctx, x, y, w, h, lift) {
  const sh = h * 0.3, b = h * 0.12;
  ctx.beginPath(); ctx.moveTo(x, y + h - b); ctx.lineTo(x, y + sh);
  ctx.bezierCurveTo(x, y + sh * 0.25, x + w * 0.36, y + h * 0.02 - lift * 0.4, x + w / 2, y - lift);
  ctx.bezierCurveTo(x + w * 0.64, y + h * 0.02 - lift * 0.4, x + w, y + sh * 0.25, x + w, y + sh);
  ctx.lineTo(x + w, y + h - b); ctx.quadraticCurveTo(x + w, y + h, x + w - b, y + h); ctx.lineTo(x + b, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - b); ctx.closePath();
}
function slot(ctx, r, e) {
  const { U, S } = e, lift = r.h * 0.07;
  ctx.save();
  archPath(ctx, r.x - 2 * U, r.y - 2 * U, r.w + 4 * U, r.h + 4 * U, lift); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3.5 * U; ctx.stroke();
  archPath(ctx, r.x, r.y, r.w, r.h, lift);
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h); g.addColorStop(0, ART_shade(S.slotColor, 0.7)); g.addColorStop(1, ART_shade(S.slotColor, 1.6)); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = goldGrad(ctx, r.y - lift, r.y + r.h); ctx.lineWidth = 2.6 * U; ctx.stroke();
  archPath(ctx, r.x + 4 * U, r.y + 4 * U, r.w - 8 * U, r.h - 8 * U, lift * 0.8); ctx.strokeStyle = 'rgba(232,180,80,.35)'; ctx.lineWidth = 1 * U; ctx.stroke();
  ctx.fillStyle = '#f2c860'; star8(ctx, r.x + r.w / 2, r.y - lift - 2.5 * U, 2.6 * U); ctx.fill();
  ctx.restore();
}
function goldWord(ctx, txt, x, y, size, maxW, font, opt = {}) {
  if (!txt) return;
  ctx.save();
  ctx.font = `${opt.weight || ''} ${opt.italic ? 'italic ' : ''}${size}px ${font}`.trim();
  if (opt.rtl) ctx.direction = 'rtl';
  const mw = ctx.measureText(txt).width, k = Math.min(1, maxW / mw);
  ctx.translate(x, y); if (opt.italic) ctx.transform(1, 0, -0.16, 1, 0, 0); ctx.scale(k * (opt.sx || 1), 1);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255,190,60,.45)'; ctx.shadowBlur = size * 0.3;
  ctx.strokeStyle = '#2a1204'; ctx.lineWidth = size * 0.2; ctx.strokeText(txt, 0, size * 0.04);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#7a4208'; ctx.lineWidth = size * 0.1; ctx.strokeText(txt, 0, size * 0.03);
  ctx.fillStyle = '#8a4a08'; ctx.fillText(txt, 0, size * 0.06);
  const g = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5); g.addColorStop(0, '#fff6cc'); g.addColorStop(0.4, '#f6cf55'); g.addColorStop(0.75, '#d9961c'); g.addColorStop(1, '#a8640c');
  ctx.fillStyle = g; ctx.fillText(txt, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(-mw, -size * 0.55, mw * 2, size * 0.25); ctx.clip(); ctx.fillStyle = 'rgba(255,255,240,.5)'; ctx.fillText(txt, 0, 0); ctx.restore();
  ctx.restore();
}
function logo(ctx, e) {
  const { U, S, ax, ay, aw, ah } = e, cx = ax + aw * 0.5;
  if (S.logoDeco) {
    // 背后的尖拱形深色徽框
    ctx.save(); archPath(ctx, ax + aw * 0.04, ay + ah * 0.1, aw * 0.92, ah * 0.86, ah * 0.08);
    const g = ctx.createLinearGradient(0, ay, 0, ay + ah); g.addColorStop(0, 'rgba(10,25,60,.85)'); g.addColorStop(1, 'rgba(5,12,30,.85)'); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = goldGrad(ctx, ay, ay + ah); ctx.lineWidth = 1.6 * U; ctx.stroke(); ctx.restore();
    // 新月与星
    ctx.save(); moon(ctx, ax + aw * 0.17, ay + ah * 0.24, ah * 0.1, false); ctx.fillStyle = '#ffe9a0'; star(ctx, ax + aw * 0.24, ay + ah * 0.2, ah * 0.04, ah * 0.016, 5); ctx.fill(); ctx.restore();
    ctx.save(); ctx.fillStyle = '#f2c860'; for (const xx of [0.1, 0.9]) { star8(ctx, ax + aw * xx, ay + ah * 0.8, ah * 0.035); ctx.fill(); } ctx.restore();
  }
  goldWord(ctx, S.logoLine1, cx + aw * 0.04, ay + ah * 0.25, ah * 0.2, aw * 0.5, FONT_AR, { weight: 700, italic: true });
  goldWord(ctx, S.logoLine2, cx, ay + ah * 0.5, ah * 0.36, aw * 0.84, FONT_LOGO, { sx: 0.95 });
  goldWord(ctx, S.logoLine3, cx, ay + ah * 0.79, ah * 0.25, aw * 0.68, FONT_AR, { weight: 700, rtl: true });
}
// 粒子（v15）：金色四芒星闪光（m<0.375，3/8）+ 玫瑰花瓣（5/8），与国风树叶同一运动模型（旋涡/翻转/上扬下坠）
function particleKind(m) { return m < 0.375 ? 'spark' : 'petal'; }
function particle(ctx, len, wid, col, m, S = {}) {
  const glow = S.particleGlow ?? 0.6, gold = S.particleColor3 || '#ffe08a';
  if (m < 0.375) { // 与 AE 导出的 8 档分桶边界一致
    const r = len * 0.5;
    if (glow > 0) { // 柔光晕
      const h = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.25); h.addColorStop(0, `rgba(255,236,170,${0.55 * Math.min(1, glow)})`); h.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = h; ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, 7); ctx.fill();
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, '#fffdf0'); g.addColorStop(0.3, gold); g.addColorStop(1, 'rgba(214,140,20,.95)');
    ctx.fillStyle = g; star(ctx, 0, 0, r, r * 0.16, 4, 0); ctx.fill();
    ctx.fillStyle = 'rgba(255,246,200,.75)'; star(ctx, 0, 0, r * 0.55, r * 0.1, 4, Math.PI / 4); ctx.fill();
    ctx.fillStyle = '#fffef6'; ctx.beginPath(); ctx.arc(0, 0, r * 0.12, 0, 7); ctx.fill();
    return;
  }
  // 玫瑰花瓣：宽圆、外缘略有凹口、基部收窄；基部深红 → 外缘粉，外缘一道浅色高光，基部一条浅色瓣脉
  const L = len / 2, w = len * 0.34, bend = (m - 0.7) * w * 0.6;
  const path = () => {
    ctx.beginPath(); ctx.moveTo(-L, bend * 0.2);
    ctx.bezierCurveTo(-L * 0.55, -w * 0.95, L * 0.55, -w * 1.25 + bend, L * 0.92, -w * 0.32 + bend);
    ctx.quadraticCurveTo(L * 0.78, bend * 0.6, L * 0.92, w * 0.32 + bend);
    ctx.bezierCurveTo(L * 0.55, w * 1.25 + bend, -L * 0.55, w * 0.95, -L, bend * 0.2); ctx.closePath();
  };
  const base = ART_shade(rgbHex(col), 0.72);
  const g = ctx.createRadialGradient(-L, 0, len * 0.05, -L * 0.2, 0, len * 1.05);
  g.addColorStop(0, base); g.addColorStop(0.55, col); g.addColorStop(1, ART_shade(rgbHex(col), 1.35));
  path(); ctx.fillStyle = g; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.strokeStyle = 'rgba(255,225,235,.55)'; ctx.lineWidth = Math.max(0.8, len * 0.035);
  ctx.beginPath(); ctx.moveTo(L * 0.1, -w * 0.95 + bend); ctx.quadraticCurveTo(L * 0.85, -w * 0.7 + bend, L * 0.9, w * 0.1 + bend); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,200,215,.35)'; ctx.lineWidth = Math.max(0.6, len * 0.02);
  ctx.beginPath(); ctx.moveTo(-L * 0.85, bend * 0.2); ctx.quadraticCurveTo(-L * 0.1, bend * 0.5, L * 0.45, bend * 0.8); ctx.stroke();
}
function rgbHex(c) { const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(c); return m ? '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('') : c; }

// 结束页：沙漠夜景、驼队剪影、挂灯
function endBg(ctx, e, animated, el) {
  const { W, H, U, S } = e;
  const g = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.4, H * 0.75); g.addColorStop(0, S.endBg1); g.addColorStop(1, S.endBg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); stars(ctx, W, H, 110, 0.7, 23, animated ? el + 1 : 0, U); ctx.restore();
  girih(ctx, W / 2 - W * 0.6, 0, W, H * 0.75, W * 0.2, '#e8c070', 0.05, 1 * U);
  moon(ctx, W * 0.8, H * 0.13, W * 0.055);
  // 远处沙丘 + 驼队
  dunes(ctx, W, H, H * 0.8, ['#2a2350'], U);
  const cam = silhouette('p1', '#120c26', 64);
  for (let i = 0; i < 4; i++) { const s = W * 0.06, x = W * (0.18 + i * 0.075), y = H * 0.792 - i * H * 0.004; ctx.drawImage(cam, x - s / 2, y - s * 1.2 + s * 0.12, s, s * 1.2); }
  const palm = silhouette('gG', '#0d0a20', 96);
  ctx.drawImage(palm, W * 0.74, H * 0.72, W * 0.16, W * 0.192); ctx.drawImage(palm, W * 0.84, H * 0.745, W * 0.12, W * 0.144);
  dunes(ctx, W, H, H * 0.86, ['#3a2a52', '#4a3050', '#5a3848'], U);
  // 顶部挂灯
  for (const [x, len, s] of [[0.08, 0.08, 0.075], [0.2, 0.03, 0.055], [0.8, 0.04, 0.055], [0.92, 0.09, 0.075]]) {
    const fl = animated ? 0.8 + 0.2 * Math.sin(el / 230 + x * 20) : 1;
    lantern(ctx, W * x, 0, H * len, W * s, fl, U);
  }
}
function endIcon(ctx, ix, iy, s, e) {
  const g = ctx.createLinearGradient(0, iy, 0, iy + s); g.addColorStop(0, P.turqL); g.addColorStop(1, '#073f3c'); ctx.fillStyle = g; ctx.fillRect(ix, iy, s, s);
  girih(ctx, ix, iy, s, s, s * 0.34, '#f6d77a', 0.25, s * 0.006);
  const domino = (x, y, ang, pips) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); const dw = s * 0.26, dh = s * 0.5, r = dw * 0.15;
    ctx.fillStyle = '#0b3a36'; ctx.beginPath(); ctx.roundRect(-dw / 2 + s * 0.012, -dh / 2 + s * 0.02, dw, dh, r); ctx.fill();
    ctx.fillStyle = '#fbf3df'; ctx.beginPath(); ctx.roundRect(-dw / 2, -dh / 2, dw, dh, r); ctx.fill();
    ctx.strokeStyle = '#d9a43a'; ctx.lineWidth = s * 0.012; ctx.beginPath(); ctx.roundRect(-dw / 2 + s * 0.012, -dh / 2 + s * 0.012, dw - s * 0.024, dh - s * 0.024, r * 0.8); ctx.stroke();
    ctx.fillStyle = '#d9a43a'; ctx.fillRect(-dw * 0.36, -s * 0.005, dw * 0.72, s * 0.01);
    pips.forEach(([px, py], i) => { ctx.fillStyle = i % 2 ? P.ruby : P.lapis; ctx.beginPath(); ctx.arc(px * dw, py * dh, dw * 0.09, 0, 7); ctx.fill(); });
    ctx.restore();
  };
  domino(ix + s * 0.38, iy + s * 0.46, -0.35, [[-.22, -.36], [.22, -.14], [0, -.25], [-.22, .14], [.22, .36]]);
  domino(ix + s * 0.63, iy + s * 0.44, 0.3, [[0, -.25], [-.22, .14], [.22, .36], [0, .25]]);
  moon(ctx, ix + s * 0.82, iy + s * 0.16, s * 0.08, false);
  ctx.fillStyle = goldGrad(ctx, iy + s * 0.82, iy + s * 1.05); ctx.beginPath(); ctx.ellipse(ix + s / 2, iy + s * 1.02, s * 0.62, s * 0.2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#3a1a04'; ctx.font = `700 ${s * 0.15}px ${FONT_AR}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.fillText('دومينو', ix + s / 2, iy + s * 0.9); ctx.direction = 'ltr';
}
function endButtonText(ctx, b, e) {
  const { S } = e, two = !!S.endButton2;
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.direction = 'rtl'; ctx.font = `700 ${b.h * (two ? 0.4 : 0.48)}px ${FONT_AR}`;
  const fit = (t, mw) => { const w = ctx.measureText(t).width; return Math.min(1, mw / w); };
  let k = fit(S.endButton, b.w * 0.8);
  ctx.save(); ctx.translate(0, two ? -b.h * 0.1 : 0); ctx.scale(k, 1);
  ctx.strokeStyle = 'rgba(80,35,0,.85)'; ctx.lineWidth = b.h * 0.07; ctx.strokeText(S.endButton, 0, 0); ctx.fillStyle = '#fff'; ctx.fillText(S.endButton, 0, 0); ctx.restore();
  if (two) {
    ctx.direction = 'ltr'; ctx.font = `700 ${b.h * 0.2}px ${FONT_AR}`; k = fit(S.endButton2, b.w * 0.7);
    ctx.save(); ctx.translate(0, b.h * 0.27); ctx.scale(k, 1); ctx.fillStyle = '#4a2200'; ctx.fillText(S.endButton2, 0, 0); ctx.restore();
  }
  ctx.restore();
}

export const THEME = {
  id: 'mideast', name: '中东风',
  defaults: {
    faceColor: '#fbf3df', sideColor: '#efe3c4', sideShade: 0.74, baseColor: '#58bfb1', baseColorDark: '#0a514e',
    targetColor: '#ad2238', targetColorsCustom: '#1f3f8f,#ad2238,#1f3f8f,#0f8a80,#0f8a80', letterColor: '#ad2238', selectTint: '#f2c14e',
    bgColor: '#173a78', bgColor2: '#050b1f', topBarColor: '#3a1d0c', slotColor: '#1c0b03',
    logoLine1: 'Desert', logoLine2: 'DOMINO', logoLine3: 'دومينو الصحراء', logoRibbon: false, logoDeco: true,
    disclaimer: 'هذه اللعبة للترفيه فقط، ولا تتضمن أي مقامرة بأموال حقيقية أو جوائز، وقد يختلف محتوى اللعبة عن الإعلان.',
    disclaimerColor: '#f3e3b5', glowColor: '#ffd36b', seamColor: '#ffd36b', rippleColor: '#ffd36b',
    particleColor: '#a50f2d', particleColor2: '#ff7f99', particleColor3: '#ffe08a', particleCount: 36, particleGlow: 0.6, particleSizeMin: 0.2, particleSizeMax: 0.5,
    endTitle: 'Desert Domino', endButton: 'تحميل سريع', endButton2: 'DOWNLOAD NOW', endBg1: '#1d3f86', endBg2: '#060b22', endBtnColor: '#e0a22a', endTitleColor: '#ffd36b',
    sfxScale: 'hijaz', bgPattern: 0.12, bgSkyline: true, bgLanterns: true, bgBoardDim: 0.5,
  },
  fonts: { disclaimer: FONT_AR, title: FONT_AR, titleWeight: 700, rtl: true },
  flashColor: '#ffc94a',
  endGlow: ['rgba(255,225,140,.7)', 'rgba(255,190,80,.22)', 'rgba(255,190,80,0)'],
  drawFace, faceBg, background, topBar, slot, logo, particle, particleKind, endBg, endIcon, endButtonText,
};
export const ICON_NAMES = ART.ICON_NAMES;
