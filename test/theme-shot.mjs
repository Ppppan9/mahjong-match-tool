// 主题：截图 + 自动通关（两种主题）+ 中途切换 + 设置迁移/分主题保存 + 导入导出
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), SH = path.join(root, 'screenshots'), TMP = '/tmp/themeshot';
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [], requests = [];
async function newPage(vp = { width: 1280, height: 900 }) {
  const p = await browser.newPage({ viewport: vp });
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  p.on('request', r => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) requests.push(u); });
  await p.addInitScript(() => {
    const realNow = performance.now.bind(performance), realST = window.setTimeout.bind(window), realCT = window.clearTimeout.bind(window), realRAF = window.requestAnimationFrame.bind(window);
    const V = window.__vt = { on: false, t: 0, step: 1000 / 30, timers: [], id: 1, frame: 0 };
    performance.now = () => V.on ? V.t : realNow();
    window.setTimeout = (cb, ms = 0, ...a) => { if (!V.on) return realST(cb, ms, ...a); const id = 1e7 + V.id++; V.timers.push({ id, due: V.t + Math.max(0, +ms || 0), cb, a }); return id; };
    window.clearTimeout = id => { if (id >= 1e7) V.timers = V.timers.filter(x => x.id !== id); else realCT(id); };
    let lastTs = -1;
    window.requestAnimationFrame = cb => realRAF(ts => {
      if (V.on && ts !== lastTs) { lastTs = ts; V.t += V.step; V.frame++; const due = V.timers.filter(x => x.due <= V.t).sort((a, b) => a.due - b.due); V.timers = V.timers.filter(x => x.due > V.t); for (const x of due) { try { x.cb(...x.a); } catch (e) { console.error(e); } } }
      cb(ts);
    });
    window.__vtOn = () => { V.t = realNow(); V.on = true; };
    window.__wait = (c, ms = 900000) => new Promise((res, rej) => { const t0 = Date.now(); const f = () => { if (c()) res(); else if (Date.now() - t0 > ms) rej(new Error('timeout')); else requestAnimationFrame(f); }; f(); });
    window.__frames = n => { const f0 = window.__vt.frame; return window.__wait(() => window.__vt.frame >= f0 + n); };
  });
  await p.goto('file://' + path.join(root, 'index.html'));
  return p;
}
const save = (f, url) => fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
const grab = p => p.evaluate(() => document.getElementById('stage').toDataURL('image/png'));
const jpg = (src, dst, extra = '') => execSync(`ffmpeg -v error -y -i ${src} ${extra} -q:v 3 ${dst}`);

// ---------- 1. 默认（国风）与中东风初始画面 ----------
let p = await newPage();
await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(3500);
const t0 = await p.evaluate(() => ({ theme: __app.theme, v: __app.S.settingsVersion }));
console.log('fresh', t0);
save(`${TMP}/gf.png`, await grab(p)); jpg(`${TMP}/gf.png`, `${SH}/theme_guofeng.jpg`);
await p.evaluate(() => __app.setSetting('theme', 'mideast')); await p.waitForTimeout(600);
save(`${TMP}/me.png`, await grab(p)); jpg(`${TMP}/me.png`, `${SH}/theme_mideast.jpg`);
// 居中检查：顶层牌包围盒
const cen = await p.evaluate(() => { const G = __app.G, top = Math.max(...G.tiles.map(t => t.layer)); const xs = G.tiles.filter(t => t.layer === top).map(t => __app.tileScreen(t)); const l = Math.min(...xs.map(q => q.x - q.w / 2)), r = Math.max(...xs.map(q => q.x + q.w / 2)); return { W: __app.S && document.getElementById('stage').width, left: Math.round(l), right: Math.round(document.getElementById('stage').width - r) }; }).catch(e => ({ err: e.message }));
console.log('mideast top-layer margins', cen);

// ---------- 2. 牌面总表 ----------
const sheet = await p.evaluate(() => {
  const names = { d: '花饰', b: '椰枣叶', c: '数字' };
  const keys = [...Array(9)].map((_, i) => 'd' + (i + 1)).concat([...Array(9)].map((_, i) => 'b' + (i + 1)), [...Array(9)].map((_, i) => 'c' + (i + 1)),
    ['wE', 'wS', 'wW', 'wN', 'gR', 'gG', 'gW', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'f1', 'f2', 'f3', 'f4'], ['TR:0', 'TE:1', 'TL:2', 'TA:3', 'TX:4', 'LT']);
  const label = { wE: '新月与星', wS: '法努斯灯笼', wW: '咖啡壶 Dallah', wN: '咖啡杯 Finjan', gR: '大马士革玫瑰', gG: '椰枣树', gW: '香炉*', p1: '骆驼', p2: '猎隼', p3: '乌德琴', p4: '神灯', p5: '椰枣', p6: '红茶杯*', p7: '沙丘*', f1: '地毯', f2: '马赛克星', f3: '沙漠玫瑰石', f4: '茉莉*' };
  const cols = 9, tw = 150, th = 200, pad = 16, top = 56;
  const c = document.createElement('canvas'); c.width = cols * (tw + pad) + pad; c.height = top + Math.ceil(keys.length / cols) * (th + pad + 20) + pad;
  const g = c.getContext('2d'); const bg = g.createLinearGradient(0, 0, 0, c.height); bg.addColorStop(0, '#173a78'); bg.addColorStop(1, '#050b1f'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#f6d77a'; g.font = '700 26px "MJ Arabic", sans-serif'; g.textAlign = 'center'; g.fillText('中东风主题 · 全部牌面（* 为“额外图案”开启时才出现）  دومينو الصحراء', c.width / 2, 36);
  keys.forEach((k, i) => {
    const x = pad + (i % cols) * (tw + pad), y = top + Math.floor(i / cols) * (th + pad + 20);
    __app.drawTile2DTo(g, k, x + tw / 2 - 6, y + th / 2 - 8, tw * 0.84, tw * 0.84 * __app.S.tileRatio, 1, 0);
    g.fillStyle = '#e8dcc0'; g.font = '14px "Noto Sans CJK SC", sans-serif'; g.fillText(label[k] || (names[k[0]] ? names[k[0]] + k.slice(1) : k.slice(1, 2)), x + tw / 2, y + th + 14);
  });
  return c.toDataURL('image/png');
});
save(`${TMP}/sheet.png`, sheet); jpg(`${TMP}/sheet.png`, `${SH}/theme_mideast_tiles.jpg`);

// ---------- 3. 碰撞爆开序列（虚拟时钟逐帧） ----------
const seq = await p.evaluate(async () => {
  __vtOn(); __app.newGame(true);
  await __frames(110); // 开场目标词结束
  const G = __app.G, free = G.tiles.filter(t => __app.isFree(t) && t.state === 'board');
  let pair = null; for (const a of free) { for (const b of free) if (a !== b && a.key === b.key && !/^[TL]/.test(a.key)) { pair = [a, b]; break; } if (pair) break; }
  const shots = [], g = () => shots.push(document.getElementById('stage').toDataURL('image/png'));
  __app.clickTile(pair[0]); await __frames(8); __app.clickTile(pair[1]); await __frames(14); g();
  await __wait(() => (__app.G.seams || []).length > 0); await __frames(1); g();
  await __frames(5); g(); await __frames(7); g();
  return shots;
});
seq.forEach((u, i) => save(`${TMP}/b${i}.png`, u));
execSync(`ffmpeg -v error -y ${seq.map((_, i) => `-i ${TMP}/b${i}.png`).join(' ')} -filter_complex "${seq.map((_, i) => `[${i}]crop=iw:ih*0.5:0:ih*0.25,scale=360:-1[v${i}]`).join(';')};${seq.map((_, i) => `[v${i}]`).join('')}hstack=inputs=${seq.length}" -q:v 3 ${SH}/theme_mideast_burst.jpg`);

// ---------- 4. 中东风自动通关 + 中途切换主题 + 结束页 ----------
const auto = await p.evaluate(async () => {
  __app.S.autoRec = false; __app.S.endDelay = 300; __app.S.autoSpeed = 3;
  __app.newGame(true); await __frames(10);
  __app.autoSolve();
  const matched = () => __app.G.tiles.filter(t => t.state === 'gone').length;
  await __wait(() => matched() >= 12); __app.setSetting('theme', 'guofeng'); const a = __app.theme;
  await __wait(() => matched() >= 24); __app.setSetting('theme', 'mideast'); const b = __app.theme;
  await __wait(() => __app.G.cleared);
  await __frames(80);
  return { a, b, cleared: __app.G.cleared, n: __app.G.tiles.length, shot: document.getElementById('stage').toDataURL('image/png') };
});
console.log('auto mideast + mid-session switch', { a: auto.a, b: auto.b, cleared: auto.cleared, n: auto.n });
save(`${TMP}/end.png`, auto.shot); jpg(`${TMP}/end.png`, `${SH}/theme_mideast_endcard.jpg`);
// 阿拉伯文排版放大检查（Logo / 按钮 / 声明）
const ar = await p.evaluate(() => {
  const st = document.getElementById('stage'), W = st.width, H = st.height;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const out = mk(W * 1.5, H * 0.5), g = out.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, out.width, out.height);
  g.drawImage(st, W * 0.15, H * 0.64, W * 0.7, H * 0.1, 0, 0, W * 1.5, H * 0.214);  // 结束页按钮
  return out.toDataURL('image/png');
});
save(`${TMP}/ar_btn.png`, ar);
await p.evaluate(() => { __app.newGame(true); }); await p.waitForTimeout(400);
save(`${TMP}/me2.png`, await grab(p));
execSync(`ffmpeg -v error -y -i ${TMP}/me2.png -i ${TMP}/ar_btn.png -filter_complex "[0]crop=iw*0.36:ih*0.11:0:0,scale=1080:-1[a];[0]crop=iw:ih*0.035:0:ih*0.965,scale=1080:-1[b];[1]crop=iw:ih*0.43:0:0,scale=1080:-1[c];[a][c][b]vstack=inputs=3" -q:v 3 ${SH}/theme_mideast_arabic.jpg`);

// ---------- 5. 国风自动通关 ----------
const gf = await p.evaluate(async () => {
  __app.setSetting('theme', 'guofeng'); __app.newGame(true); await __frames(10); __app.autoSolve();
  await __wait(() => __app.G.cleared); return { theme: __app.theme, cleared: __app.G.cleared };
});
console.log('auto guofeng', gf);
await p.close();

// ---------- 6. 1440x900 含面板 ----------
p = await newPage({ width: 1440, height: 900 });
await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(2500);
await p.evaluate(() => { const s = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'mideast')); s.value = 'mideast'; s.dispatchEvent(new Event('change')); }); // 通过面板下拉框切换
await p.evaluate(() => { __app.S.autoRec = false; __app.autoSolve(); }); await p.waitForTimeout(9000);
await p.screenshot({ path: `${SH}/theme_switch_1440x900.jpg`, quality: 85 });
const ui = await p.evaluate(() => ({ theme: __app.theme, sel: [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'mideast'))?.value }));
console.log('1440 ui', ui);
await p.close();

// ---------- 7. 迁移 / 分主题保存 / 导入导出 ----------
p = await newPage();
await p.evaluate(() => localStorage.setItem('mahjongTool.settings.v1', JSON.stringify({ settingsVersion: 11, topBarColor: '#123456', layers: 4, particleColor: '#00ff00', autoSpeed: 1.7 })));
await p.reload(); await p.waitForTimeout(1500);
const mig = await p.evaluate(async () => {
  const r = { theme: __app.theme, v: __app.S.settingsVersion, top: __app.S.topBarColor, layers: __app.S.layers, pc: __app.S.particleColor };
  __app.setSetting('theme', 'mideast'); r.meTop = __app.S.topBarColor; r.meLayers = __app.S.layers; r.meSpeed = __app.S.autoSpeed;
  __app.setSetting('particleColor', '#abcdef');
  __app.setSetting('theme', 'guofeng'); r.backTop = __app.S.topBarColor; r.backPc = __app.S.particleColor;
  __app.setSetting('theme', 'mideast'); r.mePcKept = __app.S.particleColor;
  r.exported = JSON.parse(JSON.stringify(__app.S)).theme; r.store = JSON.stringify(__app.S.themeStore);
  return r;
});
await p.waitForTimeout(600); await p.reload(); await p.waitForTimeout(1500);
mig.afterReload = await p.evaluate(() => ({ theme: __app.theme, pc: __app.S.particleColor, top: __app.S.topBarColor }));
console.log('migration', JSON.stringify(mig));
const ok = mig.theme === 'guofeng' && mig.v === 15 && mig.top === '#123456' && mig.layers === 4 && mig.pc === '#00ff00' && mig.meTop === '#3a1d0c' && mig.meLayers === 4 && mig.meSpeed === 1.7 && mig.backTop === '#123456' && mig.backPc === '#00ff00' && mig.mePcKept === '#abcdef' && mig.afterReload.theme === 'mideast' && mig.afterReload.pc === '#abcdef';
console.log('migration ok', ok);
await browser.close();
console.log('external requests', requests.length, 'errors', errors);
if (!ok || errors.length || requests.length || !auto.cleared || !gf.cleared) process.exit(1);
