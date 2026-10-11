// 复刻参考视频 t=0.2s 的顶层排布（逐格同牌面），再做整盘与单牌放大对比：
// screenshots/compare_replica.jpg、screenshots/compare_detail_*.jpg
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VIDEO = process.env.REF_VIDEO || '/home/box/agent-data/agents/13473619-9b07-4a6a-9592-552b8a150b7e/attachments/9fe81825ac170d65dd59da2ecbe78e0ce0f9887f1ae0fc3bb7cad9055816ab26.mp4';
const tmp = '/tmp/replica'; fs.mkdirSync(tmp, { recursive: true });
// 参考 t=0.2s 顶层 6×8（逐行，左→右）
export const REF_LAYOUT = [
  'p1', 'TR:0', 'b3', 'f2', 'c5', 'gR',
  'TX:4', 'p2', 'c8', 'TA:3', 'd3', 'LT',
  'f1', 'TE:1', 'wS', 'b2', 'p3', 'd4',
  'c4', 'd8', 'p5', 'd8', 'TL:2', 'p4',
  'b4', 'LT', 'gG', 'c2', 'p1', 'wE',
  'TL:2', 'd3', 'd4', 'TX:4', 'p2', 'TE:1',
  'p4', 'TA:3', 'gR', 'TR:0', 'd8', 'c5',
  'gG', 'c3', 'd3', 'wN', 'f3', 'wN',
];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto('file://' + path.join(root, 'index.html'));
await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(800);
const res = await page.evaluate(async (LAY) => {
  __app.S.introWord = false; __app.newGame(true);
  await new Promise(r => setTimeout(r, 1500));
  const G = __app.G, top = Math.max(...G.tiles.map(t => t.layer));
  const tops = G.tiles.filter(t => t.layer === top).sort((a, b) => b.y - a.y || a.x - b.x);
  tops.forEach((t, i) => { if (LAY[i]) t.key = LAY[i]; });
  __app.setSetting('tileThick', __app.S.tileThick); // 重建模型
  await new Promise(r => setTimeout(r, 2500));
  const c = document.querySelector('#stage');
  return { shot: c.toDataURL('image/png'), rects: tops.map(t => { const s = __app.tileScreen(t); return { key: t.key, x: s.x, y: s.y, w: s.w, h: s.h }; }), W: c.width, H: c.height };
}, REF_LAYOUT);
await page.evaluate(() => localStorage.clear());
await browser.close();
fs.writeFileSync(`${tmp}/ours.png`, Buffer.from(res.shot.split(',')[1], 'base64'));
execSync(`ffmpeg -v error -y -ss 0.2 -i "${VIDEO}" -frames:v 1 -vf scale=${res.W}:${res.H}:flags=lanczos ${tmp}/ref.png`);
fs.writeFileSync(`${tmp}/rects.json`, JSON.stringify(res));
execSync(`python3 ${path.join(root, 'test', 'replica_crops.py')} ${tmp} ${path.join(root, 'screenshots')}`, { stdio: 'inherit' });
console.log('errors', JSON.stringify(errors));
