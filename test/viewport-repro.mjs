// 复现用户桌面 Chrome 环境：多种视口/DPR，面板可见，全新 localStorage 与旧版本存档
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const URL_ = process.env.URL || 'file://' + path.join(root, 'index.html');
const OUT = process.env.OUT || '/tmp/vp';
fs.mkdirSync(OUT, { recursive: true });
const OLD = {
  fresh: null,
  v3: { settingsVersion: 3, offsetX: 0.5, offsetY: 0, boardScale: 0.88, boardOffsetY: 0.05, cameraTilt: 0, sideRevealX: 0.035, sideRevealY: 0.09 },
  v5: { settingsVersion: 5, offsetX: 0.08, boardOffsetX: 0.005, boardScale: 0.86, boardOffsetY: 0.068, tileRatio: 1.18, gapY: 0.04, flyScale: 1.5 },
  v6: { settingsVersion: 6, stackMode: 'centered', insetX: 0.5, insetY: 0.5, boardScale: 0.86, boardOffsetY: 0.068, tileRatio: 1.18, gapY: 0.04 },
  stale: { settingsVersion: 6, stackMode: 'offset', offsetX: 0.3, offsetY: 0.1, layers: 4, boardOffsetX: 0.005, shadowDX: -0.15, meetX: 0.47, meetY: 0.588, flyScale: 1.25 },
  v7: { settingsVersion: 7, stackMode: 'centered', insetX: 0, insetY: 0, sideRevealX: 0.035, sideRevealY: 0.09, baseColor: '#3aa655' },
};
const vps = (process.env.VPS || '1440x900@1,1920x1080@1,1280x720@1,1440x900@2').split(',');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const res = [];
for (const v of vps) {
  const [wh, dpr] = v.split('@'); const [w, h] = wh.split('x').map(Number);
  for (const [name, old] of Object.entries(OLD)) {
    if (process.env.ONLY && !process.env.ONLY.split(',').includes(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: +dpr });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await page.goto(URL_); await page.evaluate(o => { localStorage.clear(); if (o) localStorage.setItem('mahjongTool.settings.v1', JSON.stringify(o)); }, old);
    await page.reload(); await page.waitForTimeout(1500);
    const info = await page.evaluate(async (mid) => {
      const S = __app.S, G = __app.G;
      // 中局：直接移除若干顶层可点击对，模拟用户玩了一会儿
      if (mid) { __app.autoSolve && 0; }
      const c = document.querySelector('#stage'); const r = c.getBoundingClientRect();
      const top = Math.max(...G.tiles.map(t => t.layer));
      const xs = G.tiles.filter(t => t.layer === top).map(t => __app.tileScreen(t));
      const minx = Math.min(...xs.map(s => s.x - s.w / 2)), maxx = Math.max(...xs.map(s => s.x + s.w / 2));
      return { stackMode: S.stackMode, insetX: S.insetX, offsetX: S.offsetX, nudge: [S.stackNudgeX, S.stackNudgeY], boardOffsetX: S.boardOffsetX, sideReveal: [S.sideRevealX, S.sideRevealY], leftShadow: S.leftShadow, ver: S.settingsVersion, css: [r.width, r.height], W: c.width, topLeft: minx, topRight: c.width - maxx };
    });
    info.banner = await page.evaluate(() => !!document.querySelector('#migrateBanner'));
    await page.screenshot({ path: `${OUT}/${w}x${h}@${dpr}_${name}.png` });
    // 中局截图：自动求解跑 6 秒
    await page.evaluate(() => { __app.S.autoSpeed = 3; __app.autoSolve(); });
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${OUT}/${w}x${h}@${dpr}_${name}_mid.png` });
    res.push({ vp: v, name, ...info, errors });
    await ctx.close();
  }
}
await browser.close();
for (const r of res) console.log(JSON.stringify(r));
