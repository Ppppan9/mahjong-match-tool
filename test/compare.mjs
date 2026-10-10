// 参考视频帧 vs 本工具渲染：生成并排对比图 screenshots/compare_*.jpg
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VIDEO = process.env.REF_VIDEO || '/home/box/agent-data/agents/13473619-9b07-4a6a-9592-552b8a150b7e/attachments/9fe81825ac170d65dd59da2ecbe78e0ce0f9887f1ae0fc3bb7cad9055816ab26.mp4';
const tmp = '/tmp/cmp'; fs.mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto('file://' + path.join(root, 'index.html'));
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(800);
const snap = async (name, fn) => {
  const data = await page.evaluate(fn);
  fs.writeFileSync(path.join(tmp, name + '.jpg'), Buffer.from(data.split(',')[1], 'base64'));
};
const helpers = `
  window.__wait = (c, ms = 60000) => new Promise((res, rej) => { const t0 = performance.now(); const f = () => { if (c()) res(); else if (performance.now() - t0 > ms) rej(new Error('timeout')); else requestAnimationFrame(f); }; f(); });
  window.__shot = () => document.querySelector('#stage').toDataURL('image/jpeg', 0.9);
  window.__pair = () => { const G = __app.G; const free = G.tiles.filter(t => __app.isFree(t) && t.key[0] !== 'T'); for (const a of free) { const b = free.find(x => x !== a && x.key === a.key && Math.abs(x.y - a.y) > 2); if (b) return [a, b]; } return null; };
`;
await page.evaluate(helpers);
await snap('ours_intro', async () => { __app.newGame(true); await new Promise(r => setTimeout(r, 1500)); return __shot(); });
await snap('ours_initial', async () => { await __wait(() => performance.now() - __app.G.introT0 > 3200); return __shot(); });
await snap('ours_select', async () => { const [a, b] = __pair(); window.__p = [a, b]; __app.clickTile(a); await new Promise(r => setTimeout(r, 150)); return __shot(); });
await snap('ours_fly', async () => { const t0 = performance.now(); __app.clickTile(__p[1]); await __wait(() => performance.now() - t0 > __app.S.flyDuration * 0.45); return __shot(); });
await snap('ours_burst', async () => { await __wait(() => __app.G.particles.length > 0); await new Promise(r => setTimeout(r, __app.S.burstDuration * 0.3)); return __shot(); });
await snap('ours_letters', async () => {
  Object.assign(__app.S, { autoRec: false, autoSpeed: 3, endCard: true });
  __app.autoSolve(); await __wait(() => __app.G.letterCount >= 2, 400000); await new Promise(r => setTimeout(r, 400)); return __shot();
});
await snap('ours_word', async () => { await __wait(() => __app.G.wordDoneT > 0, 400000); await new Promise(r => setTimeout(r, 300)); return __shot(); });
await snap('ours_end', async () => { await __wait(() => __app.G.cleared, 400000); await new Promise(r => setTimeout(r, __app.S.endDelay + 900)); return __shot(); });
await page.evaluate(() => localStorage.clear());
await browser.close();
const pairs = [['initial', 0.2, 'ours_initial', '初始棋盘'], ['intro', 1.6, 'ours_intro', '开场展示RELAX'], ['first_tap', 3.6, 'ours_select', '第一次点击(选中变绿)'],
  ['match_fly', 5.2, 'ours_fly', '配对飞行(向外再汇合)'], ['match_burst', 6.1, 'ours_burst', '汇合绿叶爆开'], ['letters_tray', 47, 'ours_letters', '字母进入托盘'], ['word_or_end', 53.5, 'ours_end', '结束页']];
for (const [name, t, ours, label] of pairs) {
  execSync(`ffmpeg -v error -y -ss ${t} -i "${VIDEO}" -frames:v 1 -vf scale=540:960 ${tmp}/ref_${name}.png`);
  execSync(`ffmpeg -v error -y -i ${tmp}/ref_${name}.png -i ${tmp}/${ours}.jpg -filter_complex "[1]scale=540:960[b];[0][b]hstack=2,pad=iw:ih+50:0:50:color=0x222222,drawtext=text='参考视频 t=${t}s':x=20:y=12:fontsize=26:fontcolor=white:fontfile=/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc,drawtext=text='本工具 · ${label}':x=560:y=12:fontsize=26:fontcolor=yellow:fontfile=/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc" -q:v 6 ${root}/screenshots/compare_${name}.jpg`);
}
console.log('errors', errors);
