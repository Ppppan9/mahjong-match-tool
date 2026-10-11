// 导出 AE 工程：完整自动通关 + 短手动游玩（同时测试“录制视频时同步记录”）+ 变体设置；虚拟时钟保证每帧正好落在 30fps 网格上
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.AE_OUT || '/tmp/aeexp'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
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
  window.__vtOn = () => { V.t = realNow(); V.on = true; };
  window.__wait = (c, ms = 900000) => new Promise((res, rej) => { const t0 = Date.now(); const f = () => { if (c()) res(); else if (Date.now() - t0 > ms) rej(new Error('timeout')); else requestAnimationFrame(f); }; f(); });
});
await page.goto('file://' + path.join(root, 'index.html'));
await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(1500);
// 手指 PNG（测试用：画一个简单的手指）
await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 120; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = '#f2c9a0'; g.strokeStyle = '#7a4a2a'; g.lineWidth = 4;
  g.beginPath(); g.roundRect(40, 6, 30, 90, 15); g.fill(); g.stroke(); g.beginPath(); g.roundRect(20, 70, 90, 80, 24); g.fill(); g.stroke();
  __app.setSetting('handImage', c.toDataURL()); __app.setSetting('handAnchorX', 0.45); __app.setSetting('handAnchorY', 0.05);
});
// 可选：AE_THEME=mideast 用中东风主题导出；AE_SUFFIX 区分输出文件名
const THEME = process.env.AE_THEME || '', SUF = process.env.AE_SUFFIX || '';
if (THEME) await page.evaluate(t => __app.setSetting('theme', t), THEME);
await page.waitForTimeout(500);
const wait = `const wait = (c, ms = 600000) => new Promise((res, rej) => { const t0 = Date.now(); const f = () => { if (c()) res(); else if (Date.now() - t0 > ms) rej(new Error('timeout')); else requestAnimationFrame(f); }; f(); });`;

// ---------- A. 完整自动通关 ----------
const SNAPS = []; for (let f = 6; f < 4000; f += 9) SNAPS.push(f);
let dl = page.waitForEvent('download', { timeout: 900000 });
const infoA = await page.evaluate(async ({ SNAPS }) => {
  const wait = window.__wait;
  __app.S.autoRec = false; __app.S.autoStop = false;
  __vtOn();
  __app.newGame(true);
  __app.aeStart({ snapAt: SNAPS });
  __app.autoSolve();
  await wait(() => __app.G.cleared);
  const t = performance.now(); await wait(() => performance.now() - t > __app.S.endDelay + 1800);
  const r = await __app.aeStopAndExport();
  return { stats: r.stats, size: r.size, frames: __app.aeLastRec.frames, snaps: __app.aeLastRec.snaps.length, events: __app.aeLastRec.events.length, sfx: __app.aeLastRec.sfx.length };
}, { SNAPS });
let d = await dl; await d.saveAs(path.join(root, `samples/ae_export_sample${SUF}.zip`));
console.log('A auto', JSON.stringify(infoA));
// 取回校验帧
const nS = infoA.snaps; fs.mkdirSync(`${OUT}/snapsA`, { recursive: true }); const tmap = {};
for (let i = 0; i < nS; i++) {
  const s = await page.evaluate(i => { const s = __app.aeLastRec.snaps[i]; return { t: s.t, frame: s.frame, url: s.url }; }, i);
  fs.writeFileSync(`${OUT}/snapsA/${String(s.frame).padStart(5, '0')}.png`, Buffer.from(s.url.split(',')[1], 'base64')); tmap[`${String(s.frame).padStart(5, '0')}.png`] = s.t;
}
fs.writeFileSync(`${OUT}/snapsA/snaps.json`, JSON.stringify(tmap));

// ---------- B. 短手动游玩 + 视频录制联动 ----------
const dls = []; page.on('download', x => dls.push(x));
const infoB = await page.evaluate(async () => {
  const wait = window.__wait;
  __app.S.aeWithRec = true;
  __app.newGame(true);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(3200);
  __app.startRecording(false);
  for (let n = 0; n < 3; n++) {
    const G = __app.G, free = G.tiles.filter(t => __app.isFree(t) && t.state === 'board');
    let pair = null; for (const a of free) { for (const b of free) if (a !== b && a.key === b.key && !/^[TL]/.test(a.key)) { pair = [a, b]; break; } if (pair) break; }
    if (!pair) break;
    __app.clickTile(pair[0]); await sleep(400); __app.clickTile(pair[1]); await sleep(1600);
  }
  // 再点一个字母（如果可点）
  const G = __app.G, lt = G.tiles.find(t => __app.isFree(t) && t.state === 'board' && /^T/.test(t.key));
  if (lt) { const pair = G.tiles.filter(t => t.key === lt.key && __app.isFree(t) && t.state === 'board'); if (pair.length >= 2) { __app.clickTile(pair[0]); await sleep(300); __app.clickTile(pair[1]); await sleep(1800); } }
  __app.stopRecording();
  await wait(() => window.__lastAEExport && !__app.AE.active() && __app.aeLastRec && __app.aeLastRec.frames < 2000);
  await sleep(1500);
  return { frames: __app.aeLastRec.frames, events: __app.aeLastRec.events.map(e => e[1]).join(','), stats: window.__lastAEExport.stats };
});
await page.waitForTimeout(3000);
for (const x of dls) { const n = x.suggestedFilename(); if (n.endsWith('.zip')) await x.saveAs(path.join(root, `samples/ae_export_manual${SUF}.zip`)); else await x.saveAs(`${OUT}/${n}`); }
console.log('B manual+rec', JSON.stringify(infoB), dls.map(x => x.suggestedFilename()));

// ---------- C. 变体设置（同一条手动记录重新导出） ----------
dl = page.waitForEvent('download', { timeout: 300000 });
const infoC = await page.evaluate(async () => {
  Object.assign(__app.S, { aeSampling: 'bake', aeSize: '1080x1920', aeLeaves: 'layers', aeNames: 'en', aeGroupLayers: false, aeAudio: 'mixed', aeFps: 30 });
  const r = await __app.aeExport(); return r.stats;
});
d = await dl; await d.saveAs(`${OUT}/variant.zip`);
console.log('C variant', JSON.stringify(infoC));
await browser.close();
console.log('errors', errors);
if (errors.length) process.exit(1);
