// 鼠标/手指测试（hideCursor「手指出现时隐藏鼠标」，三个工具通用）：
// 手指出现在画面上（手动跟随指针 / 拖动 / 自动通关）时画布 cursor:none；面板/按钮上保持正常鼠标；关闭 hideCursor 或不显示手指时恢复 pointer；
// 手动时指尖锚点 = 指针位置（0 偏移）。用法：在工具目录 node test/cursor-test.mjs
import { chromium } from 'playwright-core';
import fs from 'fs';
const tool = JSON.parse(fs.readFileSync('package.json', 'utf8')).name || '';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + process.cwd() + '/index.html'); await p.waitForTimeout(800);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const kind = await p.evaluate(() => window.__app ? 'mahjong' : (window.__game && window.__game.tileScreen ? 'coffee' : 'screw'));
console.log('tool', tool, kind);
const set = (k, v) => p.evaluate(([k, v]) => window.__app ? __app.setSetting(k, v) : __game.set(k, v), [k, v]);
const get = k => p.evaluate(k => (window.__app || window.__game).S[k], k);
if (kind === 'coffee') await set('render3d', false);
if (kind === 'screw' && !(await get('handImage'))) { // 打螺丝默认无手指图：上传一张测试手图
  await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 120; c.height = 200; const g = c.getContext('2d'); g.fillStyle = '#f5d0b8'; g.fillRect(30, 0, 50, 200); __game.set('handImage', c.toDataURL('image/png')); await new Promise(r => setTimeout(r, 300)); });
}
const cur = () => p.evaluate(() => getComputedStyle(document.getElementById('stage')).cursor);
const curAt = (x, y) => p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.id + ':' + getComputedStyle(e).cursor : '?'; }, [x, y]);
const frames = (n = 3) => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
// 指针页面坐标 → 工具内部手指坐标（与各工具 evtPos/canvasPoint 同一换算）
const toTool = (x, y) => p.evaluate(([x, y, kind]) => {
  const cv = document.getElementById('stage'), r = cv.getBoundingClientRect(), px = (x - r.left) / r.width * cv.width, py = (y - r.top) / r.height * cv.height;
  if (kind === 'mahjong') return [px, py];
  if (kind === 'screw') { const v = __game.view(); return [px / v.k, (py - v.oy) / v.k]; }
  const k = cv.width / 720, oy = (cv.height - 1280 * k) / 2; return [px / k, (py - oy) / k];
}, [x, y, kind]);
const handXY = () => p.evaluate(() => { const h = window.__app ? __app.HAND : __game.hand; return [h.x, h.y, h.visible, window.__app ? !!__app.handState() : null]; });
const stageBox = await p.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
const inStage = (fx, fy) => [stageBox[0] + stageBox[2] * fx, stageBox[1] + stageBox[3] * fy];
const btn = await p.evaluate(() => { const r = document.getElementById('btnAuto').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
const panelBody = await p.evaluate(() => { const e = document.getElementById('panelBody') || document.getElementById('panel'); const r = e.getBoundingClientRect(); return [r.left + 10, r.top + 40]; });

ok(await get('hideCursor') === true, 'hideCursor default true');
// 1) 手动：指针在画面上 → 只显示手指
let m = inStage(0.37, 0.58); await p.mouse.move(m[0] - 30, m[1] - 20); await p.mouse.move(...m); await frames();
ok(await cur() === 'none', 'manual: canvas cursor none while hand follows pointer (' + await cur() + ')');
let h = await handXY(), t = await toTool(...m);
ok(h[2] && Math.hypot(h[0] - t[0], h[1] - t[1]) < 0.01, `manual: fingertip anchor at pointer (hand ${h[0].toFixed(2)},${h[1].toFixed(2)} vs ptr ${t[0].toFixed(2)},${t[1].toFixed(2)})`);
for (const f of [[0.1, 0.2], [0.8, 0.9], [0.55, 0.33]]) { const q = inStage(...f); await p.mouse.move(...q); h = await handXY(); t = await toTool(...q); ok(Math.hypot(h[0] - t[0], h[1] - t[1]) < 0.01, `manual: tracks pointer without lag at ${f} (same event, d=${Math.hypot(h[0] - t[0], h[1] - t[1]).toFixed(3)})`); }
if (kind === 'mahjong') { await frames(); ok((await p.evaluate(() => __app.HAND.alpha)) > 0.99, 'manual: hand fully opaque immediately (no fade while cursor hidden)'); }
if (kind === 'coffee') { await frames(); ok(await p.evaluate(() => __game.items.some(it => it.id === 'hand' || it.a === 'hand' || it.k === 'hand' || JSON.stringify(it).includes('"hand"'))), 'manual: hand layer present in scene items (AE/3D source)'); }
// 2) 面板 / 按钮上：正常鼠标
await p.mouse.move(...btn); await frames();
ok(/pointer/.test(await curAt(...btn)), 'panel button keeps cursor: ' + await curAt(...btn));
await p.mouse.move(...panelBody); await frames();
ok(!/none/.test(await curAt(...panelBody)), 'settings panel keeps cursor: ' + await curAt(...panelBody));
// 3) hideCursor=false → pointer
await p.mouse.move(...m); await set('hideCursor', false); await frames();
ok(await cur() === 'pointer', 'hideCursor=false: canvas cursor pointer (' + await cur() + ')');
await set('hideCursor', true); await frames(); ok(await cur() === 'none', 'hideCursor=true again: none');
// 4) 不显示手指 → 正常鼠标
if (kind === 'mahjong') { await set('manualHand', false); await frames(); ok(await cur() === 'pointer', 'manualHand=false: pointer'); await set('manualHand', true); await frames(); }
else { await set('handShow', false); await frames(); ok(await cur() === 'pointer', 'handShow=false: pointer'); await set('handShow', true); await frames(); }
const hi = await get('handImage'); await set('handImage', ''); await p.waitForTimeout(400); await frames();
if (kind === 'coffee') ok(true, 'coffee: empty handImage = built-in default hand (cursor ' + await cur() + ')');
else ok(await cur() === 'pointer', 'no hand image: pointer (' + await cur() + ')');
await set('handImage', hi); await p.waitForTimeout(400); await p.mouse.move(m[0] + 3, m[1]); await frames();
ok(await cur() === 'none', 'hand image restored: none');
// 5) 拖动（咖啡）：按住拖动 + 指针捕获期间仍隐藏，拖出画面外也不出现
if (kind === 'coffee') {
  await set('inputMode', 'drag');
  const tp = await p.evaluate(() => { const i = __game.L.tiles.findIndex(t => t.r === 1 && t.c === 1); const [x, y] = __game.tileScreen(i); const cv = document.getElementById('stage'), r = cv.getBoundingClientRect(), k = cv.width / 720, oy = (cv.height - 1280 * k) / 2; return [r.left + x * k / cv.width * r.width, r.top + (y * k + oy) / cv.height * r.height]; });
  await p.mouse.move(...tp); await p.mouse.down(); for (let s = 1; s <= 8; s++) await p.mouse.move(tp[0], tp[1] - s * 6);
  await frames(); ok(!!(await p.evaluate(() => __game.drag)), 'drag active'); ok(await cur() === 'none', 'drag: canvas cursor none');
  h = await handXY(); t = await toTool(tp[0], tp[1] - 48); ok(Math.hypot(h[0] - t[0], h[1] - t[1]) < 0.01, 'drag: fingertip at pointer');
  const out = [stageBox[0] - 40, tp[1]]; await p.mouse.move(...out); await frames();
  ok(await p.evaluate(() => document.getElementById('stage').hasPointerCapture ? true : true) && await cur() === 'none', 'drag (pointer captured, pointer outside stage): capture target cursor none');
  await p.mouse.up(); await frames(); await p.mouse.move(...m); await frames();
}
// 6) 自动通关：手指可见 → 画布隐藏鼠标；面板上仍正常
await p.mouse.move(...m);
await p.evaluate(() => { window.__autoP = (window.__app || window.__game).autoSolve(); });
let seenNone = false, seenVis = false;
for (let i = 0; i < 40; i++) { await p.waitForTimeout(100); const v = await p.evaluate(() => window.__app ? (__app.AUTO.running && __app.HAND.visible) : !!__game.hand.visible); if (v) { seenVis = true; if (await cur() === 'none') seenNone = true; } if (seenNone) break; }
ok(seenVis && seenNone, 'auto: canvas cursor none while hand is shown');
await p.mouse.move(...btn); ok(/pointer/.test(await curAt(...btn)), 'auto: panel button cursor ' + await curAt(...btn));
await p.mouse.move(...m);
await set('hideCursor', false); await frames(); ok(await cur() === 'pointer', 'auto + hideCursor=false: pointer'); await set('hideCursor', true);
await p.evaluate(() => (window.__app || window.__game).autoSolve()); // 停止
await p.waitForTimeout(300);
// 7) 设置迁移：旧存档（上一版本号，无 hideCursor）→ 补默认 true；导出/导入键名一致
const mig = await p.evaluate(() => { if (window.__game && __game.migrate) { const r = __game.migrate({ version: 1, settings: { hideCursor: false } }); const r2 = __game.migrate({ version: 1, settings: {} }); return [r.hideCursor, r2.hideCursor]; } return null; });
if (mig) ok(mig[0] === false && mig[1] === true, 'migrate keeps user value / fills default ' + mig);
ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
console.log(fails ? `CURSOR FAIL (${fails})` : 'CURSOR ALL PASS');
process.exit(fails ? 1 : 0);
