// v19：settingsVersion 19；手指避让默认关；测试显式开启。上传测试 PNG 手指（品红），输出 screenshots/hand_avoid_sequence.jpg
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const URL_ = 'file://' + path.join(root, 'index.html'), PNG = path.join(root, 'test/assets/test_hand.png'), TMP = '/tmp/handavoid';
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const fails = [], errors = [];
const check = (n, c, info) => { console.log(c ? 'PASS' : 'FAIL', n, info !== undefined ? JSON.stringify(info) : ''); if (!c) fails.push(n); };
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  // 虚拟时钟（同 ae-export）：每帧固定前进 1/30 s，测量不受无头浏览器低帧率影响
  await p.addInitScript(() => {
    const realNow = performance.now.bind(performance), realST = window.setTimeout.bind(window), realCT = window.clearTimeout.bind(window), realRAF = window.requestAnimationFrame.bind(window);
    const V = window.__vt = { on: false, t: 0, step: 1000 / 30, timers: [], id: 1 };
    performance.now = () => V.on ? V.t : realNow();
    window.setTimeout = (cb, ms = 0, ...a) => { if (!V.on) return realST(cb, ms, ...a); const id = 1e7 + V.id++; V.timers.push({ id, due: V.t + Math.max(0, +ms || 0), cb, a }); return id; };
    window.clearTimeout = id => { if (id >= 1e7) V.timers = V.timers.filter(x => x.id !== id); else realCT(id); };
    let lastTs = -1;
    window.requestAnimationFrame = cb => realRAF(ts => {
      if (V.on && ts !== lastTs) {
        lastTs = ts; V.t += V.step;
        const due = V.timers.filter(x => x.due <= V.t).sort((a, b) => a.due - b.due); V.timers = V.timers.filter(x => x.due > V.t);
        for (const x of due) { try { x.cb(...x.a); } catch (e) { console.error(e); } }
      }
      cb(ts);
    });
    window.__vtOn = () => { V.t = realNow(); V.on = true; };
    window.__wait = (c, ms = 900000) => new Promise((res, rej) => { const t0 = Date.now(); const f = () => { if (c()) res(); else if (Date.now() - t0 > ms) rej(new Error('timeout')); else requestAnimationFrame(f); }; f(); });
  });
  await p.goto(URL_); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => window.__app && __app.G && __app.G.tiles.length);
  await p.locator('.row', { hasText: '上传手指图片' }).locator('input[type=file]').setInputFiles(PNG); // 真实上传
  await p.waitForFunction(() => __app.S.handImage.startsWith('data:image/png'));
  await p.evaluate(() => { __app.setSetting('introWord', false); __app.setSetting('layers', 3); __app.setSetting('handAnchorX', 0.48); __app.setSetting('handAnchorY', 0.03); });
  await p.waitForTimeout(400);
  return { p, ctx };
}
const MAG = `(() => { const c = document.querySelector('#stage'), g = c.getContext('2d'), H = __app.HAND; const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i+1] < 40 && d[i+2] > 235) n++; return n; })()`;
const frames = [];
{ // A：自动通关（避让开）——记录一次配对全过程
  const { p, ctx } = await open();
  const s = await p.evaluate(() => ({ v: __app.S.settingsVersion, a: __app.S.handAvoid, r: __app.S.handAvoidRadius, d: __app.S.handAvoidDuration, l: __app.S.clearAnimLayer }));
  check('默认：v19、避让关、消除动画在手指之上', s.v === 19 && s.a === false && s.l === 'aboveHand', s);
  await p.evaluate(() => __app.setSetting('handAvoid', true));
  check('显式开启手避让', await p.evaluate(() => __app.S.handAvoid === true));
  // 页面内逐帧记录：从第一次配对（碰撞区出现）那一帧开始记录手指轨迹并在若干时刻截图
  const R = await p.evaluate(async () => {
    __vtOn(); __app.autoSolve();
    // 选一次“点第二张时手指就在碰撞区内”的配对（最能说明避让）；最多看 12 次配对
    let seen = null, n = 0;
    await new Promise(res => { const f = () => { const z = __app.G.clearZone; if (z && z !== seen) { seen = z; n++; if (__app.zoneIntrude(__app.HAND.x, __app.HAND.y, z) > 0 || n >= 12) return res(); } requestAnimationFrame(f); }; f(); });
    const z = __app.G.clearZone, H = __app.HAND, c = document.querySelector('#stage');
    const tr = [], shots = [], at = [0, 120, 250, 400, 650, 1000, 1400, 1900];
    await new Promise(res => { const f = () => { const t = performance.now() - z.t0; tr.push({ t, x: H.x, y: H.y, intr: __app.zoneIntrude(H.x, H.y, z) });
      if (at.length && t >= at[0]) { at.shift(); shots.push({ t: Math.round(t), url: c.toDataURL('image/jpeg', 0.85) }); }
      if (t < 2600) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    return { z: { ...z }, tr, shots, fly: __app.S.flyDuration, R: __app.avoidRadius() };
  });
  R.shots.forEach((sh, i) => { const f = `${TMP}/a${i}.jpg`; fs.writeFileSync(f, Buffer.from(sh.url.split(',')[1], 'base64')); frames.push({ f, t: sh.t }); });
  const tr = R.tr, p0 = tr[0]; if (process.env.DBG) console.log(JSON.stringify(tr.slice(0, 40).map(q => [Math.round(q.t), Math.round(q.x), Math.round(q.y), Math.round(q.intr)])));
  const moved = tr.find(q => Math.hypot(q.x - p0.x, q.y - p0.y) > R.R * 0.08);
  check('点下即开始顺势离开（抬指同时起步，无“停顿后突然移开”）', moved && moved.t < 260, { startMs: moved && Math.round(moved.t) });
  const out = tr.find(q => q.intr <= 0 && q.t > 0);
  const stayOut = out && tr.filter(q => q.t > out.t && q.t < R.fly + 400).every(q => q.intr <= 0);
  check('碰撞前已离开中央碰撞区，碰撞/爆开期间一直在区外', out && out.t < R.fly && stayOut, { leftAt: out && Math.round(out.t), fly: R.fly });
  // 平滑：逐帧速度无突变（加速度有限）
  const sp = tr.slice(1).map((q, i) => Math.hypot(q.x - tr[i].x, q.y - tr[i].y) / Math.max(1, q.t - tr[i].t));
  const maxSp = Math.max(...sp);
  check('离开动作平滑（最大速度合理、无瞬移）', maxSp < 3, { maxPxPerMs: +maxSp.toFixed(2) });
  await p.evaluate(() => __app.autoSolve()); // 停止
  await ctx.close();
}
async function layerRun(layer) { // B：避让关，手指固定停在汇合点上，比较爆开时手指可见像素
  const { p, ctx } = await open();
  await p.evaluate(l => { __app.setSetting('handAvoid', false); __app.setSetting('clearAnimLayer', l); __app.setSetting('impactShake', 0); }, layer);
  const r = await p.evaluate(async () => {
    __vtOn(); const G = __app.G, S = __app.S, VP = __app.VP, H = __app.HAND;
    const free = G.tiles.filter(t => t.state === 'board' && __app.isFree(t));
    let pair = null; for (const a of free) { const b = free.find(x => x !== a && x.key === a.key); if (b) { pair = [a, b]; break; } }
    H.visible = true; H.x = VP.x + VP.w * S.meetX; H.y = VP.y + VP.h * S.meetY - 20;
    await new Promise(r => setTimeout(r, 1500));
    const c = document.querySelector('#stage'), cnt = () => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i+1] < 40 && d[i+2] > 235) n++; return n; };
    const before = cnt();
    __app.clickTile(pair[0]); __app.clickTile(pair[1]);
    await new Promise(r => setTimeout(r, S.flyDuration + 120));
    const during = cnt(), shot = c.toDataURL('image/png');
    return { before, during, shot };
  });
  await ctx.close(); return r;
}
const up = await layerRun('aboveHand'), dn = await layerRun('belowHand');
fs.writeFileSync(`${TMP}/b0.png`, Buffer.from(up.shot.split(',')[1], 'base64')); fs.writeFileSync(`${TMP}/b1.png`, Buffer.from(dn.shot.split(',')[1], 'base64'));
check('默认顺序：碰撞牌/树叶盖住手指（可见手指像素明显减少）', up.during < up.before * 0.85, { before: up.before, during: up.during });
check('旧顺序：手指在消除动画之上（手指像素基本不变）', dn.during > dn.before * 0.95, { before: dn.before, during: dn.during });
// AE 导出：主合成里手指图层在飞行牌/接缝光/树叶之下（数组越靠后越在上）
for (const z of ['samples/ae_export_sample.zip', 'samples/ae_export_sample_mideast.zip']) {
  const tl = JSON.parse(execSync(`python3 -c "import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).read('timeline.json').decode())" ${z}`, { maxBuffer: 1 << 28 }).toString());
  const main = tl.comps.find(c => c.id === tl.mainComp), names = main.layers.map(l => l.name);
  const hi = names.findIndex(n => /^(手指|Hand)$/.test(n)), fx = names.map((n, i) => /飞行牌|Flying|接缝|Seam|树叶|Leaf/.test(n) ? i : -1).filter(i => i >= 0);
  check(`AE ${path.basename(z)}：手指图层在消除动画图层之下`, hi >= 0 && fx.length && fx.every(i => i > hi), { hand: hi, fxMin: Math.min(...fx) });
}
// 拼图：上排 = 一次配对中手指离开中央（8 帧），下排 = 避让关时爆开盖在手指之上 / 旧顺序对比
const lab = (f, t) => `-i ${f}`;
const A = frames.map(x => `-i ${x.f}`).join(' ');
execSync(`ffmpeg -v error -y ${A} -filter_complex "${frames.map((x, i) => `[${i}:v]scale=270:-2,drawtext=text='+${x.t}ms':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6[a${i}]`).join(';')};${frames.map((_, i) => `[a${i}]`).join('')}hstack=inputs=${frames.length}[top]" -map "[top]" ${TMP}/top.png`);
execSync(`ffmpeg -v error -y -i ${TMP}/b0.png -i ${TMP}/b1.png -filter_complex "[0:v]scale=540:-2,drawtext=text='clear anim ABOVE hand (default)':x=8:y=8:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.6[x];[1:v]scale=540:-2,drawtext=text='hand above (old order)':x=8:y=8:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.6[y];[x][y]hstack[b]" -map "[b]" ${TMP}/bot.png`);
execSync(`ffmpeg -v error -y -i ${TMP}/top.png -i ${TMP}/bot.png -filter_complex "[1:v]pad=iw*0+${frames.length * 270}:ih:(ow-iw)/2:0:color=0x222222[b];[0:v][b]vstack" -q:v 3 ${root}/screenshots/hand_avoid_sequence.jpg`);
check('无控制台错误', errors.length === 0, errors.slice(0, 3));
await browser.close();
console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
