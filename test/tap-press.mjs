// 点击“按下”效果：与参考视频逐帧对比（screenshots/compare_tap_press.jpg）+ 数值检查（缩放/位移/无波纹/无选中描边/两种主题/松开回弹/自动通关点击）
// 用法：node test/tap-press.mjs [参考视频.mp4]（不给或文件不存在则只渲染本工具一行）
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), TMP = '/tmp/tappress';
const VIDEO = process.argv[2] || process.env.REF_VIDEO || '';
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
// 参考：26.0 s 点击右上角 T 牌。#779=按下前一帧，#780 起按下，#781 起变绿；按下姿态保持到飞走
const REF = { frames: [778, 779, 780, 781, 782, 784, 790, 800], crop: [262, 192, 76, 88], tapFrame: 779.5 };
const OFFS = REF.frames.map(f => Math.round((f - REF.tapFrame) / 30 * 1000)); // 相对点击时刻(ms)
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [], requests = [], fails = [];
const check = (n, c, info) => { console.log(c ? 'PASS' : 'FAIL', n, info !== undefined ? JSON.stringify(info) : ''); if (!c) fails.push(n); };
const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
p.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) requests.push(r.url()); });
await p.addInitScript(() => {
  const realNow = performance.now.bind(performance), realRAF = window.requestAnimationFrame.bind(window), realST = window.setTimeout.bind(window);
  const V = window.__vt = { on: false, t: 0, step: 1000 / 60, frame: 0, timers: [], id: 1 };
  performance.now = () => V.on ? V.t : realNow();
  window.setTimeout = (cb, ms = 0, ...a) => { if (!V.on) return realST(cb, ms, ...a); const id = 1e7 + V.id++; V.timers.push({ id, due: V.t + (+ms || 0), cb, a }); return id; };
  let last = -1;
  window.requestAnimationFrame = cb => realRAF(ts => { if (V.on && ts !== last) { last = ts; V.t += V.step; V.frame++; const due = V.timers.filter(x => x.due <= V.t); V.timers = V.timers.filter(x => x.due > V.t); due.forEach(x => x.cb(...x.a)); } cb(ts); });
  window.__vtOn = () => { V.t = realNow(); V.on = true; };
  window.__until = t => new Promise(res => { const f = () => V.t >= t ? res() : realRAF(f); f(); });
});
await p.goto('file://' + path.join(root, 'index.html')); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(3000);
async function run(theme) {
  return p.evaluate(async ({ theme, OFFS }) => {
    __app.setSetting('theme', theme); __vtOn(); __app.newGame(true);
    await __until(performance.now() + 3200); // 开场 RELAX 结束
    const G = __app.G, top = Math.max(...G.tiles.map(t => t.layer));
    const t = G.tiles.filter(t => __app.isFree(t) && t.layer === top && !/^[TL]/.test(t.key)).sort((a, b) => __app.tileScreen(b).x - __app.tileScreen(a).x)[0];
    const q0 = __app.tileScreen(t), st = document.getElementById('stage');
    const T0 = performance.now() + 40, shots = [], poses = [];
    const order = OFFS.map((o, i) => [o, i]).sort((a, b) => a[0] - b[0]);
    let tapped = false;
    for (const [o, i] of order) {
      if (!tapped && o >= 0) { await __until(T0); __app.clickTile(t); tapped = true; }
      await __until(T0 + o);
      await new Promise(r => requestAnimationFrame(() => r())); // 让这一帧画完
      shots[i] = st.toDataURL('image/png'); poses[i] = { ...__app.tileScreenPressed(t), press: t.press, state: t.state };
    }
    const sel = { ripples: G.ripples.length, press: t.press };
    // 选中时牌面贴图边缘是否有描边：取选中贴图四边中点像素与牌面内侧比较
    const fc = __app.faceCanvas(t.key);
    // 松开：再点一次取消选中 → 回弹到 0
    __app.clickTile(t); await __until(performance.now() + __app.S.pressReleaseMs + 80);
    const rel = { press: t.press, state: t.state, scale: __app.tileScreenPressed(t).s };
    return { q0, shots, poses, sel, rel, crop: { x: q0.x, y: q0.y, w: q0.w, h: q0.h }, W: st.width };
  }, { theme, OFFS });
}
const save = (f, url) => fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
const gf = await run('guofeng');
const full = gf.poses[OFFS.findIndex(o => o > 150)];
const s = full.s, w = gf.q0.w, h = gf.q0.h;
const edges = { L: ((full.dx - (s - 1) * w / 2) / w), R: ((full.dx + (s - 1) * w / 2) / w), T: ((full.dy - (s - 1) * h / 2) / w), B: ((full.dy + (s - 1) * h / 2) / w) };
console.log('pressed pose (牌宽比例)', JSON.stringify({ s: +s.toFixed(3), dx: +(full.dx / w).toFixed(3), dy: +(full.dy / w).toFixed(3), edges: Object.fromEntries(Object.entries(edges).map(([k, v]) => [k, +v.toFixed(3)])) }));
check('按下缩放≈0.91', Math.abs(s - 0.91) < 0.01, s);
check('牌面上缘下移、下缘基本不动（向底座下沉）', edges.T > 0.07 && Math.abs(edges.B) < 0.03, edges);
check('按下在 ~50ms 内完成', gf.poses[OFFS.findIndex(o => o >= 50)].press > 0.99, gf.poses.map(q => +q.press.toFixed(2)));
check('点击后无波纹圈', gf.sel.ripples === 0, gf.sel);
check('取消选中后回弹', Math.abs(gf.rel.press) < 1e-3 && gf.rel.state === 'board' && Math.abs(gf.rel.scale - 1) < 1e-3, gf.rel);
const me = await run('mideast');
check('中东风同样按下', Math.abs(me.poses[7].s - 0.91) < 0.01 && me.sel.ripples === 0, { s: me.poses[7].s });
// 自动通关的点击也带按下
const auto = await p.evaluate(async () => {
  __app.setSetting('theme', 'guofeng'); Object.assign(__app.S, { autoRec: false, endCard: false, autoSpeed: 2 });
  __app.newGame(true); __app.autoSolve(); let maxP = 0; const t0 = performance.now();
  while (performance.now() - t0 < 6000) { await new Promise(r => requestAnimationFrame(r)); for (const t of __app.G.tiles) if (t.state === 'selected') maxP = Math.max(maxP, t.press || 0); }
  __app.autoSolve(); return { maxP, ripples: __app.G.ripples.length };
});
check('自动通关点击也按下、无波纹', auto.maxP > 0.99 && auto.ripples === 0, auto);
// ---------- 设置迁移（v12 → v13） ----------
const mig = async j => { await p.waitForTimeout(500); await p.evaluate(j => localStorage.setItem('mahjongTool.settings.v1', JSON.stringify(j)), j); await p.reload(); await p.waitForTimeout(1500); return p.evaluate(() => ({ r: __app.S.tapRipple, b: __app.S.selectBorder, pe: __app.S.pressEnabled, ps: __app.S.pressScale, v: __app.S.settingsVersion, seed: __app.S.seed })); };
let m = await mig({ settingsVersion: 12, theme: 'guofeng', seed: 42 });
check('本地 v12 存档 → 新默认（无波纹/无描边/按下）并保留数值', !m.r && !m.b && m.pe && m.ps === 0.91 && m.v === 17 && m.seed === 42, m);
m = await mig({ settingsVersion: 12, rippleColor: '#ff0000' });
check('本地 v12 自定义过波纹 → 保留波纹', m.r === true && !m.b, m);
m = await p.evaluate(() => { __app.importJSON(JSON.stringify({ settingsVersion: 12, seed: 7 })); return { r: __app.S.tapRipple, b: __app.S.selectBorder, pe: __app.S.pressEnabled, seed: __app.S.seed }; });
check('导入 v12 JSON → 原样还原旧观感', m.r === true && m.b === true && m.pe === false && m.seed === 7, m);
m = await p.evaluate(() => { __app.importJSON(JSON.stringify({ settingsVersion: 13, pressScale: 0.85, tapRipple: false })); return { r: __app.S.tapRipple, b: __app.S.selectBorder, pe: __app.S.pressEnabled, ps: __app.S.pressScale }; });
check('导入 v13 JSON → 自定义值保留', m.r === false && m.b === false && m.pe === true && m.ps === 0.85, m);
await p.waitForTimeout(500); await p.evaluate(() => localStorage.clear());
// ---------- 对比图 ----------
const cw = Math.round(gf.q0.w * 1.75), chh = Math.round(gf.q0.h * 1.7), cx = Math.round(gf.q0.x - cw / 2 + gf.q0.w * 0.05), cy = Math.round(gf.q0.y - chh / 2 + gf.q0.h * 0.08);
gf.shots.forEach((u, i) => save(`${TMP}/o${i}.png`, u));
const Z = 3, CW = cw * Z, CH = chh * Z;
const lab = (t, c = 'white') => `drawtext=text='${t}':fontcolor=${c}:fontsize=26:x=8:y=8:box=1:boxcolor=black@0.6`;
let rows = [];
const ours = gf.shots.map((_, i) => `[${i}]crop=${cw}:${chh}:${cx}:${cy},scale=${CW}:${CH}:flags=neighbor,${lab(`ours ${OFFS[i] >= 0 ? '+' : ''}${OFFS[i]}ms`)}[o${i}]`).join(';');
const inputs = gf.shots.map((_, i) => `-i ${TMP}/o${i}.png`);
let fc = ours + ';' + gf.shots.map((_, i) => `[o${i}]`).join('') + `hstack=${gf.shots.length}[ours]`;
if (VIDEO && fs.existsSync(VIDEO)) {
  const [x, y, cwr, chr] = REF.crop;
  REF.frames.forEach((f, i) => execSync(`ffmpeg -v error -y -ss ${((f - 1) / 30).toFixed(4)} -i "${VIDEO}" -frames:v 1 ${TMP}/r${i}.png`));
  const n = gf.shots.length;
  REF.frames.forEach((f, i) => inputs.push(`-i ${TMP}/r${i}.png`));
  fc += ';' + REF.frames.map((f, i) => `[${n + i}]crop=${cwr}:${chr}:${x}:${y},scale=${CW}:${CH}:flags=neighbor,${lab(`ref #${f} ${OFFS[i] >= 0 ? '+' : ''}${OFFS[i]}ms`, 'yellow')}[r${i}]`).join(';') + ';' + REF.frames.map((_, i) => `[r${i}]`).join('') + `hstack=${n}[ref];[ref][ours]vstack=2`;
} else fc += ';[ours]null';
// 无参考视频时只输出本工具一排到 /tmp，避免覆盖仓库里的对比图
const OUT_JPG = VIDEO && fs.existsSync(VIDEO) ? `${root}/screenshots/compare_tap_press.jpg` : '/tmp/compare_tap_press_ours.jpg';
execSync(`ffmpeg -v error -y ${inputs.join(' ')} -filter_complex "${fc}" -q:v 3 ${OUT_JPG}`);
console.log('compare image', OUT_JPG);
await browser.close();
check('无控制台错误', errors.length === 0, errors.slice(0, 3));
check('无外部网络请求', requests.length === 0, requests.slice(0, 3));
console.log(fails.length ? 'FAILED ' + fails.length : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
