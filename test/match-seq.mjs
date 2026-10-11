// 单次配对的逐帧对比：参考视频 T 对（第二次点击 ≈27.45s）vs 本工具同一时刻
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VIDEO = process.env.REF_VIDEO || '/home/box/agent-data/agents/13473619-9b07-4a6a-9592-552b8a150b7e/attachments/9fe81825ac170d65dd59da2ecbe78e0ce0f9887f1ae0fc3bb7cad9055816ab26.mp4';
const tmp = '/tmp/mseq'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
const OFFS = [0, 300, 700, 1000, 1060, 1110, 1200, 1450, 1700];
const REF_T0 = 27.45;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
// 虚拟时钟：截图时冻结 performance.now，保证每帧正好是目标时刻（无头渲染慢，不冻结会有抖动）
await page.addInitScript(() => { const real = performance.now.bind(performance); window.__manual = false; window.__vtime = 0; performance.now = () => (window.__manual ? window.__vtime : real()); });
await page.goto('file://' + path.join(root, 'index.html'));
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(800);
const shots = await page.evaluate(async (OFFS) => {
  const wait = (c, ms = 60000) => new Promise((res, rej) => { const t0 = performance.now(); const f = () => { if (c()) res(); else if (performance.now() - t0 > ms) rej(new Error('timeout')); else requestAnimationFrame(f); }; f(); });
  const G = __app.G;
  await wait(() => performance.now() - G.introT0 > 3500);
  // 选一对：一张靠左上、一张靠右下（与参考 T 对相似），优先干扰字母 T
  const free = G.tiles.filter(t => __app.isFree(t));
  let best = null, bs = -1;
  for (const a of free) for (const b of free) if (a !== b && a.key === b.key && a.x < b.x) { const sc = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (a.key === 'LT' ? 5 : 0); if (sc > bs) { bs = sc; best = [a, b]; } }
  __app.clickTile(best[1]); await new Promise(r => setTimeout(r, 300));
  const out = []; const t0 = performance.now(); window.__vtime = t0; window.__manual = true; __app.clickTile(best[0]);
  const raf = () => new Promise(r => requestAnimationFrame(() => r()));
  let cur = 0;
  for (const o of OFFS) {
    while (cur < o) { cur = Math.min(o, cur + 16); window.__vtime = t0 + cur; await raf(); } // 逐帧推进，保证补间/回调按序触发
    await raf(); await raf();
    const sp = __app.G.sprites.filter(s => s.tint).map(s => ({ x: +s.x.toFixed(1), y: +s.y.toFixed(1), faceW: +(s.w * s.scale * (s.sx || 1)).toFixed(1), scale: +(s.scale * (s.sx || 1)).toFixed(3) }));
    out.push({ t: Math.round(performance.now() - t0), sp, boardW: +__app.tileScreen(best[0]).w.toFixed(1), vp: __app.VP, d: document.querySelector('#stage').toDataURL('image/jpeg', 0.9) });
  }
  return out;
}, OFFS);
await browser.close();
shots.forEach((s, i) => fs.writeFileSync(`${tmp}/o${i}.jpg`, Buffer.from(s.d.split(',')[1], 'base64')));
const font = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc';
OFFS.forEach((o, i) => {
  const t = (REF_T0 + o / 1000).toFixed(2);
  execSync(`ffmpeg -v error -y -ss ${t} -i "${VIDEO}" -frames:v 1 -vf "scale=270:480,drawtext=text='参考 +${o}ms':x=8:y=448:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6:fontfile=${font}" ${tmp}/r${i}.png`);
  execSync(`ffmpeg -v error -y -i ${tmp}/o${i}.jpg -vf "scale=270:480,drawtext=text='本工具 +${shots[i].t}ms':x=8:y=448:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.6:fontfile=${font}" ${tmp}/q${i}.png`);
});
const inR = OFFS.map((_, i) => `-i ${tmp}/r${i}.png`).join(' '), inQ = OFFS.map((_, i) => `-i ${tmp}/q${i}.png`).join(' ');
const n = OFFS.length;
const fc = `${OFFS.map((_, i) => `[${i}]`).join('')}hstack=${n}[top];${OFFS.map((_, i) => `[${i + n}]`).join('')}hstack=${n}[bot];[top][bot]vstack=2`;
execSync(`ffmpeg -v error -y ${inR} ${inQ} -filter_complex "${fc}" -q:v 5 ${root}/screenshots/compare_match_sequence.jpg`);
console.log('times', shots.map(s => s.t), 'errors', errors);
for (const s of shots) console.log(s.t, 'boardFaceW', s.boardW, 'vp', JSON.stringify(s.vp), 'sprites', JSON.stringify(s.sp));
