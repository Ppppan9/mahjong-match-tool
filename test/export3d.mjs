// v20：3D 动画导出测试：3 层自动通关 → AE 记录 → “导出 3D 动画” → 解压 → gltf-validator 校验 scene.glb，
// 检查牌网格数、动画通道、时间范围与游戏时长一致；保存网页校验帧（snaps）供 Blender 渲染对比
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
import validator from 'gltf-validator';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.E3D_OUT || '/tmp/export3d'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const ZIP = path.join(root, 'samples/export3d_sample.zip');
let fails = 0; const check = (n, ok, info) => { console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(info)); if (!ok) fails++; };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript(() => {
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
  window.__vtOn = () => { V.t = Math.round(realNow() / V.step) * V.step; V.on = true; };
  window.__wait = (c, ms = 900000) => new Promise((res, rej) => { const t0 = Date.now(); const f = () => { if (c()) res(); else if (Date.now() - t0 > ms) rej(new Error('timeout')); else requestAnimationFrame(f); }; f(); });
});
await page.goto('file://' + path.join(root, 'index.html'));
await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(1500);
const btnText = await page.evaluate(() => document.getElementById('btn_export3d')?.textContent || [...document.querySelectorAll('button')].map(b => b.textContent).find(t => t.includes('3D')));
check('按钮存在：导出 3D 动画 (glTF/FBX/Blender)', btnText === '导出 3D 动画 (glTF/FBX/Blender)', btnText);
const def = await page.evaluate(() => ({ v: __app.S.settingsVersion, fps: __app.S.export3dFps, p: __app.S.export3dParticles, h: __app.S.export3dHand, theme: __app.S.theme, layers: __app.S.layers, hand: !!__app.S.handImage, avoid: __app.S.handAvoid, ech: __app.S.endCardHand }));
check('默认设置 v22 + 3D 导出默认 + 用户预设保留', def.v === 22 && def.fps === 30 && def.p === true && def.h === true && def.theme === 'mideast' && def.layers === 8 && def.hand && def.avoid === false && def.ech === false, def);
const SNAPS = []; for (let f = 45; f < 1500; f += 15) SNAPS.push(f);
const dl = page.waitForEvent('download', { timeout: 900000 });
const info = await page.evaluate(async ({ SNAPS }) => {
  const wait = window.__wait;
  __app.S.autoRec = false; __app.S.autoStop = false; __app.S.aeWithRec = false; __app.S.layers = 3;
  __vtOn(); __app.newGame(true);
  __app.AE.start({ snapAt: SNAPS });
  __app.autoSolve();
  await wait(() => __app.G.cleared);
  const t = performance.now(); await wait(() => performance.now() - t > __app.S.endDelay + 1800);
  const rec = __app.AE.stop();
  window.__rec3d = rec;
  const r = await __app.export3DZip(rec);
  return { r, lastT: rec.lastT, frames: rec.frames, tiles: rec.tiles.size, snaps: rec.snaps.length };
}, { SNAPS });
const d = await dl; await d.saveAs(ZIP);
console.log('export', JSON.stringify(info.r.stats), 'dur', info.r.duration, 'size', info.r.size);
// 选 4 个对比帧：开场压暗、中段、树叶最多、结束页
const pick = await page.evaluate(() => {
  const rec = window.__rec3d, sn = rec.snaps, endT0 = rec.end.length ? rec.end[0][0] : 1e9;
  const leaves = t => [...rec.parts.values()].filter(p => p.s[0][0] <= t && p.s[p.s.length - 1][0] >= t).length;
  const idx = new Set([0]);
  let best = -1, bi = 1; sn.forEach((s, i) => { const n = leaves(s.t); if (s.t < endT0 && n > best) { best = n; bi = i; } }); idx.add(bi);
  const mid = sn.findIndex(s => s.t > endT0 * 0.5); if (mid >= 0) idx.add(mid);
  const ec = sn.findIndex(s => s.t > endT0 + 1.2); idx.add(ec >= 0 ? ec : sn.length - 1);
  return [...idx].sort((a, b) => a - b).map(i => ({ i, t: sn[i].t, frame: sn[i].frame, leaves: leaves(sn[i].t) }));
});
const picked = [];
for (const [j, q] of pick.entries()) {
  const s = await page.evaluate(i => window.__rec3d.snaps[i].url, q.i);
  fs.writeFileSync(`${OUT}/web_${j}.png`, Buffer.from(s.split(',')[1], 'base64')); picked.push({ t: q.t, frame: q.frame, leaves: q.leaves });
}
fs.writeFileSync(`${OUT}/snaps.json`, JSON.stringify(picked));
console.log('compare frames', JSON.stringify(picked));
await browser.close();
// ---- 解压 + 校验 ----
execSync(`rm -rf ${OUT}/zip && mkdir -p ${OUT}/zip && cd ${OUT}/zip && python3 -c "import zipfile,sys; zipfile.ZipFile('${ZIP}').extractall('.')"`);
const names = execSync(`cd ${OUT}/zip && find . -type f | sort`).toString().trim().split('\n');
for (const f of ['./scene.glb', './scene3d.json', './timeline.json', './blender_import.py', './README_3D.md']) check('zip 含 ' + f, names.includes(f), names.slice(0, 8));
check('zip 含 audio/*.wav', names.some(n => /^\.\/audio\/sfx_.*\.wav$/.test(n)) && names.includes('./audio/mix.wav'), names.filter(n => n.includes('audio')));
const glb = fs.readFileSync(`${OUT}/zip/scene.glb`);
const rep = await validator.validateBytes(new Uint8Array(glb), { maxIssues: 50 });
console.log('validator', JSON.stringify({ errors: rep.issues.numErrors, warnings: rep.issues.numWarnings, info: rep.info && { meshes: rep.info.meshCount, nodes: rep.info.nodeCount, anims: rep.info.animationCount, mats: rep.info.materialCount, prims: rep.info.drawCallCount } }));
if (rep.issues.numErrors) console.log(rep.issues.messages.filter(m => m.severity === 0).slice(0, 10));
check('gltf-validator 无错误', rep.issues.numErrors === 0, rep.issues.messages.slice(0, 5));
// glb JSON
const jl = glb.readUInt32LE(12), J = JSON.parse(glb.subarray(20, 20 + jl).toString());
const M = JSON.parse(fs.readFileSync(`${OUT}/zip/scene3d.json`, 'utf8'));
const tileNodes = J.nodes.filter(n => /^tile_\d{3}_[^_]+$/.test(n.name || '') || /^tile_\d{3}_.+$/.test(n.name || '') && !/_(press|v_d\d+(_sel)?|body|face|shadow|contact)$/.test(n.name));
const faceNodes = J.nodes.filter(n => /_face$/.test(n.name || '') && n.mesh !== undefined);
check('每张牌一个 tile_### 节点（= 记录的牌数）', tileNodes.length === info.tiles, { tileNodes: tileNodes.length, rec: info.tiles });
check('每张牌至少一个牌面网格', faceNodes.length >= info.tiles && J.meshes.length > 0, { faces: faceNodes.length, meshes: J.meshes.length });
check('一个动画剪辑', J.animations.length === 1, J.animations.length);
const A = J.animations[0], chans = A.channels;
const byPath = {}; for (const c of chans) byPath[c.target.path] = (byPath[c.target.path] || 0) + 1;
console.log('channels', chans.length, JSON.stringify(byPath));
check('动画通道含 translation/rotation/scale', byPath.translation > 0 && byPath.rotation > 0 && byPath.scale > 0, byPath);
let tmin = 1e9, tmax = -1e9; for (const s of A.samplers) { const a = J.accessors[s.input]; tmin = Math.min(tmin, a.min[0]); tmax = Math.max(tmax, a.max[0]); }
const dur = info.r.duration;
check('动画时间范围 = 0..游戏时长', Math.abs(tmin) < 1e-6 && Math.abs(tmax - dur) < 1 / 30 + 1e-6 && dur >= info.lastT - 1e-6 && dur <= info.lastT + 2 / 30, { tmin, tmax, dur, lastT: info.lastT });
check('STEP 插值（显示/隐藏）存在', A.samplers.some(s => s.interpolation === 'STEP'), null);
check('正交相机', J.cameras && J.cameras[0].type === 'orthographic' && Math.abs(J.cameras[0].orthographic.ymag - M.height / 2 * 0.001) < 1e-6 && Math.abs(J.cameras[0].orthographic.xmag - M.width / 2 * 0.001) < 1e-6, J.cameras);
check('树叶粒子与手指平面', M.stats.leaves > 0 && M.stats.hand === 1, M.stats);
check('unlit 材质扩展', (J.extensionsUsed || []).includes('KHR_materials_unlit'), J.extensionsUsed);
check('音频事件带时间', M.audio.length > 3 && M.audio.every(a => a.t >= 0 && a.t <= dur && names.includes('./' + a.file)), M.audio.slice(0, 3));
check('scene3d 帧数 = 时长×fps+1', M.frames === Math.round(dur * 30) + 1, M.frames);
fs.copyFileSync(ZIP, '/workspace/mahjong_3d_sample.zip');
console.log('errors', errors);
if (errors.length) fails++;
console.log(fails ? `FAILED ${fails}` : 'ALL PASS', 'zip', ZIP);
process.exit(fails ? 1 : 0);
