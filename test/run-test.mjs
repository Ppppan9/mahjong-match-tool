import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const shots = path.join(root, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const mode = process.argv[2] || 'full';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') console.log('[warn]', m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
const requests = [];
page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url()); });
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForTimeout(600);
await page.locator('#stage').screenshot({ path: path.join(shots, '01_initial_board.jpg') });
const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
console.log('headless fps', fps);
const info = await page.evaluate(() => ({ tiles: __app.G.tiles.length, word: __app.G.word, free: __app.G.tiles.filter(t => __app.isFree(t)).length }));
console.log('board', info);
if (mode === 'quick') { console.log('errors', errors); await browser.close(); process.exit(0); }
// 加速自动通关并自动录制
await page.evaluate(() => { __app.setSetting('autoSpeed', 2.5); __app.setSetting('tailSec', 0.5); __app.setSetting('endDelay', 500); });
const dlP = page.waitForEvent('download', { timeout: 400000 });
await page.click('#btnAuto');
await page.waitForTimeout(6000);
await page.locator('#stage').screenshot({ path: path.join(shots, '02_mid_play_no_hand.jpg') });
await page.waitForTimeout(1700);
await page.locator('#stage').screenshot({ path: path.join(shots, '03_mid_play_2.jpg') });
await page.waitForFunction(() => __app.G.wordDoneT > 0, null, { timeout: 240000 });
await page.waitForTimeout(400);
await page.locator('#stage').screenshot({ path: path.join(shots, '04_word_complete_glow.jpg') });
await page.waitForFunction(() => __app.G.cleared, null, { timeout: 240000 });
const dl = await dlP;
const out = path.join(root, 'sample_recording' + path.extname(dl.suggestedFilename()));
await dl.saveAs(out);
console.log('recording', dl.suggestedFilename(), fs.statSync(out).size);
await page.locator('#stage').screenshot({ path: path.join(shots, '05_end_card.jpg') });
await page.screenshot({ path: path.join(shots, '06_full_ui_with_panel.jpg') });
await page.locator('#panel').screenshot({ path: path.join(shots, '07_control_panel.jpg') });
// 托盘模式 + 3 张消除 + 改间隙/错位/层数 的快速逻辑测试
const res = await page.evaluate(async () => {
  const out = [];
  for (const cfg of [{ trayMode: 'pair', matchCount: 2, winCondition: 'clear' }, { trayMode: 'pair', letterMode: 'single', winCondition: 'word' }, { trayMode: 'tray', matchCount: 2 }, { trayMode: 'pair', matchCount: 3, layers: 5, gapX: 0.2, offsetX: 0.25, offsetY: 0.5 }, { trayMode: 'tray', matchCount: 3, altOffset: true, shrinkCols: 0, shrinkRows: 0 }]) {
    for (const [k, v] of Object.entries(cfg)) __app.S[k] = v;
    __app.S.autoRec = false; __app.S.autoSpeed = 6; __app.S.flyDuration = 150; __app.S.moveMin = 60; __app.S.moveMax = 80; __app.S.delayMin = 0; __app.S.delayMax = 10; __app.S.thinkChance = 0; __app.S.endCard = false; if (!cfg.layers) __app.S.layers = 3; __app.S.baseCols = 6; __app.S.baseRows = 6;
    __app.newGame(true);
    const n = __app.G.tiles.length;
    const t0 = performance.now();
    __app.autoSolve();
    while (!__app.G.cleared && performance.now() - t0 < 120000) await new Promise(r => setTimeout(r, 200));
    out.push({ cfg, tiles: n, cleared: __app.G.cleared, left: __app.G.tiles.filter(t => t.state !== 'gone').length, letters: __app.G.letterCount + '/' + __app.G.word.length, sec: ((performance.now() - t0) / 1000).toFixed(1) });
  }
  return out;
});
console.log(JSON.stringify(res, null, 1));
// 上传手指 PNG：作为光标使用；清除后不再显示
const handRes = await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 120; c.height = 200; const g = c.getContext('2d');
  g.fillStyle = '#f5d0b8'; g.beginPath(); g.roundRect(40, 10, 40, 120, 20); g.fill(); g.fillRect(20, 110, 90, 90); g.fillStyle = '#d0142c'; g.beginPath(); g.roundRect(46, 14, 28, 30, 12); g.fill();
  __app.setSetting('handImage', c.toDataURL('image/png'));
  await new Promise(r => setTimeout(r, 300));
  const withHand = document.querySelector('#stage').style.cursor;
  document.querySelector('#btnClearHand').click();
  await new Promise(r => setTimeout(r, 200));
  return { cursorWithHand: withHand, afterClear: __app.S.handImage === '', cursorAfterClear: document.querySelector('#stage').style.cursor };
});
console.log('hand upload/clear', handRes);
await page.evaluate(() => { localStorage.clear(); });
// 旧版本 localStorage（v1，无 settingsVersion，handImage 为空或为 SVG 默认手）不应带回默认手指
await page.evaluate(() => localStorage.setItem('mahjongTool.settings.v1', JSON.stringify({ seed: 5, handImage: 'data:image/svg+xml;charset=utf-8,%3Csvg%3E', manualHand: true })));
await page.reload(); await page.waitForTimeout(800);
console.log('old settings migrated', await page.evaluate(() => ({ handImage: __app.S.handImage, seed: __app.S.seed, ver: __app.S.settingsVersion })));
// v2 设置：俯视倾角为旧默认 22 → 升级为 0（纯俯视）；用户自定义的 15 保留；导入 JSON 中的 22 原样保留
await page.evaluate(() => localStorage.setItem('mahjongTool.settings.v1', JSON.stringify({ settingsVersion: 2, cameraTilt: 22, baseRatio: 0.6, seed: 9 })));
await page.reload(); await page.waitForTimeout(800);
const m1 = await page.evaluate(() => ({ tilt: __app.S.cameraTilt, ortho: __app.S.cameraOrtho, baseRatio: __app.S.baseRatio, seed: __app.S.seed }));
await page.evaluate(() => localStorage.setItem('mahjongTool.settings.v1', JSON.stringify({ settingsVersion: 2, cameraTilt: 15 })));
await page.reload(); await page.waitForTimeout(800);
const m2 = await page.evaluate(() => __app.S.cameraTilt);
const m3 = await page.evaluate(() => { __app.importJSON(JSON.stringify({ settingsVersion: 2, cameraTilt: 22, cameraOrtho: false })); return [__app.S.cameraTilt, __app.S.cameraOrtho]; });
console.log('camera migration', { oldDefault22: m1, custom15: m2, imported: m3 });
await page.evaluate(() => localStorage.setItem('mahjongTool.settings.v1', JSON.stringify({ settingsVersion: 3, offsetX: 0.5, faceKinds: 20, boardScale: 0.9 })));
await page.reload(); await page.waitForTimeout(800);
console.log('v3->v4 migration', await page.evaluate(() => ({ offsetX: __app.S.offsetX, faceKinds: __app.S.faceKinds, customBoardScale: __app.S.boardScale, ver: __app.S.settingsVersion })));
await page.evaluate(() => { localStorage.clear(); });
await page.evaluate(() => { localStorage.clear(); });
console.log('external requests', requests);
console.log('errors', errors);
await browser.close();
