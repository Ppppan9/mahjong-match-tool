// 堆叠居中检查：截默认棋盘与 5 层棋盘，并按像素量出棋盘左右边距
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto('file://' + path.join(root, 'index.html'));
await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(800);
const measure = async (name, set) => page.evaluate(async ([name, set]) => {
  for (const [k, v] of Object.entries(set)) __app.setSetting(k, v);
  __app.newGame(true);
  await new Promise(r => setTimeout(r, 4500));
  const c = document.querySelector('#stage'), g = c.getContext('2d');
  const W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
  const y0 = Math.round(H * 0.17), y1 = Math.round(H * 0.94); // 托盘以下、底部免责声明以上
  let L = W, R = -1, T = H, B = -1;
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (d[i] + d[i + 1] + d[i + 2] > 120) { if (x < L) L = x; if (x > R) R = x; if (y < T) T = y; if (y > B) B = y; } }
  const G = __app.G, layers = {};
  for (const t of G.tiles) { const l = layers[t.layer] ||= { minx: 1e9, maxx: -1e9, n: 0 }; l.minx = Math.min(l.minx, t.x); l.maxx = Math.max(l.maxx, t.x); l.n++; }
  for (const l of Object.values(layers)) l.cx = +((l.minx + l.maxx) / 2).toFixed(3);
  const top = Math.max(...G.tiles.map(t => t.layer)); const ts = G.tiles.filter(t => t.layer === top).map(t => __app.tileScreen(t));
  const tl = Math.min(...ts.map(q => q.x - q.w / 2)), tr = W - Math.max(...ts.map(q => q.x + q.w / 2));
  return { name, W, H, topFaceL: +tl.toFixed(2), topFaceR: +tr.toFixed(2), left: L, right: W - 1 - R, top: T, bottom: H - 1 - B, layers: Object.fromEntries(Object.entries(layers).map(([k, l]) => [k, { n: l.n, cx: l.cx }])), shot: c.toDataURL('image/jpeg', 0.9) };
}, [name, set]);
const out = [];
for (const [name, set] of [['stack_centered', {}], ['stack_centered_5layers', { layers: 5 }], ['stack_pyramid_4layers', { layers: 4, insetX: 0.5, insetY: 0.5 }]]) {
  const r = await measure(name, set);
  fs.writeFileSync(path.join(root, 'screenshots', name + '.jpg'), Buffer.from(r.shot.split(',')[1], 'base64'));
  delete r.shot; out.push(r);
}
await page.evaluate(() => localStorage.clear());
await browser.close();
for (const r of out) console.log(r.name, 'canvas', r.W + 'x' + r.H, 'topLayerFace L/R', r.topFaceL, r.topFaceR, 'pixels(incl. sides)', 'left', r.left, 'right', r.right, 'top', r.top, 'bottom', r.bottom, 'perLayer', JSON.stringify(r.layers));
console.log('errors', JSON.stringify(errors));
