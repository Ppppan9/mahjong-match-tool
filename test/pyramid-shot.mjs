// 金字塔堆叠：默认 / 4 层 / 5 层截图 + 左右边距 + 每层露出边圈宽度（px，720×1280 画布）
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto('file://' + path.join(root, 'index.html'));
await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(800);
const CFG = JSON.parse(process.env.CFG || '[["pyramid_default",{}],["pyramid_4layers",{"layers":4}],["pyramid_5layers",{"layers":5}]]');
const out = [];
for (const [name, set] of CFG) {
  const r = await page.evaluate(async set => {
    __app.setSetting('introWord', false); __app.setSetting('layers', 3);
    for (const [k, v] of Object.entries(set)) __app.setSetting(k, v);
    __app.newGame(true); await new Promise(r => setTimeout(r, 900));
    const S = __app.S, G = __app.G, c = document.querySelector('#stage'), W = c.width, H = c.height;
    const by = {};
    for (const t of G.tiles) { const s = __app.tileScreen(t); const b = by[t.layer] ||= { l: 1e9, r: -1e9, t: 1e9, b: -1e9, n: 0, w: s.w, h: s.h }; b.l = Math.min(b.l, s.x - s.w / 2); b.r = Math.max(b.r, s.x + s.w / 2); b.t = Math.min(b.t, s.y - s.h / 2); b.b = Math.max(b.b, s.y + s.h / 2); b.n++; }
    const Ls = Object.keys(by).map(Number).sort((a, b) => a - b), f = v => +v.toFixed(2);
    const rings = Ls.slice(0, -1).map(L => { const lo = by[L], up = by[L + 1]; return { L, left: f(up.l - lo.l), right: f(lo.r - up.r), top: f(up.t - lo.t), bottom: f(lo.b - up.b) }; });
    const strip = S.sideRevealX * by[0].w;
    // 像素：非黑像素包围盒（含侧面/底座）
    const g = c.getContext('2d'), d = g.getImageData(0, 0, W, H).data, y0 = Math.round(H * 0.17), y1 = Math.round(H * 0.94);
    let PL = W, PR = -1; for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (d[i] + d[i + 1] + d[i + 2] > 120) { if (x < PL) PL = x; if (x > PR) PR = x; } }
    const top = by[Ls[Ls.length - 1]], bot = by[0];
    return { perLayer: Ls.map(L => [by[L].n]).flat(), tileW: f(bot.w), bottomFace: [f(bot.l), f(W - bot.r)], bottomVisual: [f(bot.l), f(W - bot.r - strip)], topFace: [f(top.l), f(W - top.r)], pixels: [PL, W - 1 - PR], vert: [f(bot.t - __app.VP.y), f(__app.VP.y + __app.VP.h - bot.b)], rings, shot: c.toDataURL('image/jpeg', 0.9) };
  }, set);
  fs.writeFileSync(path.join(root, 'screenshots', name + '.jpg'), Buffer.from(r.shot.split(',')[1], 'base64')); delete r.shot;
  out.push([name, r]);
}
await page.evaluate(() => localStorage.clear());
await browser.close();
for (const [n, r] of out) console.log(n, JSON.stringify(r));
console.log('errors', JSON.stringify(errors));
