// 碰撞粒子逐帧对比：参考视频第 2 次配对（汇合 ≈10.43 s）vs 本工具，均以“汇合瞬间”为 0，放大画面中心。
// 输出 screenshots/compare_burst_sequence.jpg（上排参考 / 下排本工具，8 个时刻）与 compare_burst_peak.jpg（峰值帧左右大图）。
// 用法：node test/burst-seq.mjs [参考视频] [主题 guofeng|mideast]
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VIDEO = process.argv[2] || process.env.REF_VIDEO || '/home/box/agent-data/agents/13473619-9b07-4a6a-9592-552b8a150b7e/attachments/9fe81825ac170d65dd59da2ecbe78e0ce0f9887f1ae0fc3bb7cad9055816ab26.mp4';
const THEME = process.argv[3] || 'guofeng';
const SUFFIX = THEME === 'guofeng' ? '' : '_' + THEME;
const OUT = process.env.OUT_DIR || path.join(root, 'screenshots');
const tmp = '/tmp/bseq'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
const OFFS = [0, 67, 133, 200, 300, 400, 533, 700];
const PEAK = 3; // 200 ms
const REF_MEET = 10.43;
// 采样率：视频按 1/3 速播放、输出 60 fps → 本工具以 180 fps 虚拟时钟逐帧采样 1.0 s（每帧都是真实渲染，非插帧）
const CAP = process.env.NO_VIDEO ? 60 : 180, SLOW = CAP / 60, DUR = 1.0;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript(() => { const real = performance.now.bind(performance); window.__manual = false; window.__vtime = 0; performance.now = () => (window.__manual ? window.__vtime : real()); });
await page.goto('file://' + path.join(root, 'index.html'));
await page.evaluate(th => { localStorage.clear(); localStorage.setItem('mahjongTool.settings.v1', JSON.stringify({ settingsVersion: 99, theme: th })); }, THEME);
await page.reload(); await page.waitForTimeout(800);
const res = await page.evaluate(async ([OFFS, CAP, DUR]) => {
  const wait = (c, ms = 60000) => new Promise((res, rej) => { const t0 = performance.now(); const f = () => { if (c()) res(); else if (performance.now() - t0 > ms) rej(new Error('timeout')); else requestAnimationFrame(f); }; f(); });
  const G = __app.G;
  await wait(() => performance.now() - G.introT0 > 3500);
  const free = G.tiles.filter(t => __app.isFree(t));
  let best = null, bs = -1;
  for (const a of free) for (const b of free) if (a !== b && a.key === b.key && a.x < b.x && !/^L/.test(a.key)) { const sc = Math.abs(a.x - b.x) + Math.abs(a.y - b.y); if (sc > bs) { bs = sc; best = [a, b]; } }
  __app.clickTile(best[1]); await new Promise(r => setTimeout(r, 300));
  const raf = () => new Promise(r => requestAnimationFrame(() => r()));
  let t = performance.now(); window.__vtime = t; window.__manual = true; __app.clickTile(best[0]);
  let guard = 0;
  while (!__app.G.particles.length && guard++ < 400) { t += 8; window.__vtime = t; await raf(); }
  const meet = t, out = [];
  const sps = __app.G.sprites.filter(s => s.tint); const pc = { x: sps.reduce((a, s) => a + s.x, 0) / sps.length, y: sps.reduce((a, s) => a + s.y, 0) / sps.length, tw: sps[0].w * sps[0].scale };
  // 按 CAP fps 逐帧推进虚拟时钟并截图，前 DUR 秒；对比图从中取 OFFS 对应帧
  for (let i = 0; i <= Math.round(DUR * CAP); i++) {
    const cur = i * 1000 / CAP; window.__vtime = meet + cur; await raf(); await raf();
    out.push({ t: Math.round(cur), n: __app.G.particles.length, d: document.querySelector('#stage').toDataURL('image/jpeg', 0.88) });
  }
  const c = document.querySelector('#stage');
  return { out, W: c.width, H: c.height, pc };
}, [OFFS, CAP, DUR]);
await browser.close();
const { W, H } = res; const all = res.out;
const out = OFFS.map(o => all[Math.round(o * CAP / 1000)]);
// 参考裁切：360×640 中以汇合点 (169,375) 为中心的 240×200；本工具按画布比例裁同一区域
const rw = 240, rh = 200, rcx = 169, rcy = 375;
// 按“汇合时牌宽”对齐比例：参考汇合时每张牌面宽 ≈70 px（360 宽原片）
const k = res.pc.tw / 70, ow = Math.round(rw * k), oh = Math.round(rh * k), ocx = Math.round(res.pc.x), ocy = Math.round(res.pc.y);
const font = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc';
const CW = 360, CH = 300;
out.forEach((s, i) => {
  fs.writeFileSync(`${tmp}/o${i}.png`, Buffer.from(s.d.split(',')[1], 'base64')); // (jpeg 数据)
  const t = (REF_MEET + OFFS[i] / 1000).toFixed(3);
  execSync(`ffmpeg -v error -y -ss ${t} -i "${VIDEO}" -frames:v 1 -vf "crop=${rw}:${rh}:${rcx - rw / 2}:${rcy - rh / 2},scale=${CW}:${CH}:flags=lanczos,drawtext=text='参考 +${OFFS[i]}ms':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6:fontfile=${font}" ${tmp}/r${i}.png`);
  execSync(`ffmpeg -v error -y -i ${tmp}/o${i}.png -vf "crop=${ow}:${oh}:${ocx - ow / 2}:${ocy - oh / 2},scale=${CW}:${CH}:flags=lanczos,drawtext=text='本工具 +${s.t}ms (${s.n})':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6:fontfile=${font}" ${tmp}/q${i}.png`);
});
const n = OFFS.length;
const inR = OFFS.map((_, i) => `-i ${tmp}/r${i}.png`).join(' '), inQ = OFFS.map((_, i) => `-i ${tmp}/q${i}.png`).join(' ');
const fc = `${OFFS.map((_, i) => `[${i}]`).join('')}hstack=${n}[top];${OFFS.map((_, i) => `[${i + n}]`).join('')}hstack=${n}[bot];[top][bot]vstack=2`;
execSync(`ffmpeg -v error -y ${inR} ${inQ} -filter_complex "${fc}" -q:v 4 ${OUT}/compare_burst_sequence${SUFFIX}.jpg`);
// 峰值帧大图（参考 3x）
const PW = 720, PH = 600, pt = (REF_MEET + OFFS[PEAK] / 1000).toFixed(3);
execSync(`ffmpeg -v error -y -ss ${pt} -i "${VIDEO}" -frames:v 1 -vf "crop=${rw}:${rh}:${rcx - rw / 2}:${rcy - rh / 2},scale=${PW}:${PH}:flags=lanczos,drawtext=text='参考 +${OFFS[PEAK]}ms':x=10:y=10:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6:fontfile=${font}" ${tmp}/pr.png`);
execSync(`ffmpeg -v error -y -i ${tmp}/o${PEAK}.png -vf "crop=${ow}:${oh}:${ocx - ow / 2}:${ocy - oh / 2},scale=${PW}:${PH}:flags=lanczos,drawtext=text='本工具 +${OFFS[PEAK]}ms':x=10:y=10:fontsize=28:fontcolor=yellow:box=1:boxcolor=black@0.6:fontfile=${font}" ${tmp}/pq.png`);
execSync(`ffmpeg -v error -y -i ${tmp}/pr.png -i ${tmp}/pq.png -filter_complex hstack -q:v 3 ${OUT}/compare_burst_peak${SUFFIX}.jpg`);
// 并排视频（H.264，60 fps，约 3 s）：左参考（minterpolate 插帧后 1/3 速），右本工具（180 fps 逐帧真实渲染，1/3 速播放 = 每个输出帧都是新画面）
if (!process.env.NO_VIDEO) {
  all.forEach((f, i) => fs.writeFileSync(`${tmp}/v${String(i).padStart(3, '0')}.jpg`, Buffer.from(f.d.split(',')[1], 'base64')));
  const vdir = path.join(root, 'samples'); fs.mkdirSync(vdir, { recursive: true });
  const NF = Math.round(DUR * CAP), lab = `1/${SLOW} 速`;
  execSync(`ffmpeg -v error -y -ss ${(REF_MEET - 0.0).toFixed(3)} -t ${DUR + 0.05} -i "${VIDEO}" -vf "crop=${rw}:${rh}:${rcx - rw / 2}:${rcy - rh / 2},minterpolate=fps=${CAP}:mi_mode=mci:mc_mode=aobmc:vsbmc=1,setpts=${SLOW}*PTS,fps=60,scale=${CW * 2}:${CH * 2}:flags=lanczos,drawtext=text='参考 (30fps 原片插帧, ${lab})':x=8:y=8:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.6:fontfile=${font}" -frames:v ${NF} -c:v libx264 -crf 18 ${tmp}/ref60.mp4`);
  execSync(`ffmpeg -v error -y -framerate 60 -i ${tmp}/v%03d.jpg -vf "crop=${ow}:${oh}:${ocx - ow / 2}:${ocy - oh / 2},scale=${CW * 2}:${CH * 2}:flags=lanczos,drawtext=text='本工具 (${CAP}fps 逐帧, ${lab})':x=8:y=8:fontsize=24:fontcolor=yellow:box=1:boxcolor=black@0.6:fontfile=${font}" -frames:v ${NF} -c:v libx264 -crf 18 ${tmp}/ours60.mp4`);
  execSync(`ffmpeg -v error -y -i ${tmp}/ref60.mp4 -i ${tmp}/ours60.mp4 -filter_complex "[0:v][1:v]hstack=shortest=1" -an -r 60 -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 23 -movflags +faststart ${vdir}/burst_compare${SUFFIX}.mp4`);
}
console.log('particles per frame', out.map(s => s.n), 'errors', errors);
if (errors.length) process.exit(1);
