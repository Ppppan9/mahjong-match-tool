// 交叉校验：只用 timeline.json + assets/ 按 AE 的图层语义（锚点/位置/缩放/旋转/不透明度/混合/入出点/预合成/线性与定格插值）
// 在无头浏览器里重新合成画面，与网页工具记录时的真实帧逐像素比较，并输出 screenshots/ae_export_check.jpg
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const zip = process.argv[2] || path.join(root, 'samples/ae_export_sample.zip');
const snapDir = process.argv[3] || '/tmp/aeexp/snapsA';
const dir = '/tmp/aecomp'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir + '/check', { recursive: true });
execSync(`python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "${zip}" "${dir}"`);
const snaps = fs.readdirSync(snapDir).filter(f => f.endsWith('.png')).sort();
for (const f of snaps) fs.copyFileSync(path.join(snapDir, f), path.join(dir, 'check', f));
fs.writeFileSync(dir + '/composite.html', `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#222"><script>
async function loadImg(src) { const im = new Image(); im.src = src; await im.decode(); return im; }
function val(P, t, def) {
  if (P === undefined || P === null) return def;
  if (typeof P !== 'object' || Array.isArray(P)) return P;
  const T = P.t, V = P.v; if (t <= T[0]) return V[0]; if (t >= T[T.length - 1]) return V[V.length - 1];
  let i = 0; while (T[i + 1] <= t) i++;
  if (P.hold) return V[i];
  const u = (t - T[i]) / (T[i + 1] - T[i]), a = V[i], b = V[i + 1];
  return Array.isArray(a) ? a.map((x, k) => x + (b[k] - x) * u) : a + (b - a) * u;
}
window.run = async (snapList) => {
  const TL = await (await fetch('timeline.json')).json();
  const imgs = {}; for (const a of TL.assets) if (a.file.endsWith('.png')) imgs[a.id] = await loadImg(a.file);
  const comps = {}; for (const c of TL.comps) comps[c.id] = c;
  const fps = TL.meta.fps;
  function render(c, t, g) {
    for (const L of c.layers) {
      const tin = L.in ?? 0, tout = L.out ?? c.duration;
      if (t < tin - 1e-6 || t >= tout - 1e-6) continue;
      const src = L.src; let w, h, draw;
      if (src.asset) { const im = imgs[src.asset]; if (!im) continue; w = im.width; h = im.height; draw = () => g.drawImage(im, 0, 0); }
      else if (src.comp) { const cc = comps[src.comp]; w = cc.w; h = cc.h; draw = () => { const o = document.createElement('canvas'); o.width = w; o.height = h; render(cc, t - (L.start || 0), o.getContext('2d')); g.drawImage(o, 0, 0); }; }
      else if (src.solid) { w = src.w; h = src.h; draw = () => { g.fillStyle = 'rgb(' + src.solid.map(x => Math.round(x * 255)).join(',') + ')'; g.fillRect(0, 0, w, h); }; }
      else continue;
      const tr = L.tr || {};
      const an = val(tr.anchor, t, [w / 2, h / 2]), pos = val(tr.position, t, [c.w / 2, c.h / 2]), sc = val(tr.scale, t, [100, 100]), rot = val(tr.rotation, t, 0), op = val(tr.opacity, t, 100);
      if (op <= 0) continue;
      g.save(); g.globalAlpha *= op / 100; if (L.blend === 'add') g.globalCompositeOperation = 'lighter';
      g.translate(pos[0], pos[1]); g.rotate(rot * Math.PI / 180); g.scale(sc[0] / 100, sc[1] / 100); g.translate(-an[0], -an[1]);
      g.imageSmoothingQuality = 'high'; draw(); g.restore();
    }
  }
  const main = comps[TL.mainComp], out = [];
  for (const s of snapList) {
    const t = Math.round(s.t * fps) / fps;
    const cv = document.createElement('canvas'); cv.width = main.w; cv.height = main.h; const g = cv.getContext('2d');
    g.fillStyle = 'rgb(' + (main.bg || [0, 0, 0]).map(x => x * 255).join(',') + ')'; g.fillRect(0, 0, main.w, main.h);
    render(main, t, g);
    const ref = await loadImg('check/' + s.file);
    const rc = document.createElement('canvas'); rc.width = main.w; rc.height = main.h; const rg = rc.getContext('2d'); rg.drawImage(ref, 0, 0, main.w, main.h);
    const A = g.getImageData(0, 0, main.w, main.h).data, B = rg.getImageData(0, 0, main.w, main.h).data;
    let sum = 0, sq = 0, big = 0; const n = main.w * main.h;
    const dc = document.createElement('canvas'); dc.width = main.w; dc.height = main.h; const dg = dc.getContext('2d'), DI = dg.createImageData(main.w, main.h);
    for (let i = 0; i < n; i++) { let m = 0; for (let k = 0; k < 3; k++) { const d = Math.abs(A[i * 4 + k] - B[i * 4 + k]); sum += d; sq += d * d; if (d > m) m = d; } if (m > 40) big++; const v = Math.min(255, m * 4); DI.data[i * 4] = v; DI.data[i * 4 + 1] = v * 0.6; DI.data[i * 4 + 2] = 0; DI.data[i * 4 + 3] = 255; }
    dg.putImageData(DI, 0, 0);
    const mse = sq / (n * 3), psnr = 10 * Math.log10(255 * 255 / Math.max(1e-9, mse));
    const active = main.layers.filter(L => t >= (L.in ?? 0) - 1e-6 && t < (L.out ?? main.duration) - 1e-6).map(L => L.name);
    out.push({ file: s.file, t, mean: sum / (n * 3), psnr, bigPct: big / n * 100, active, ours: cv.toDataURL('image/png'), ref: rc.toDataURL('image/png'), diff: dc.toDataURL('image/png') });
  }
  return out;
};
</script>`);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + dir + '/composite.html');
const fps = 30;
const tmap = fs.existsSync(path.join(snapDir, 'snaps.json')) ? JSON.parse(fs.readFileSync(path.join(snapDir, 'snaps.json'), 'utf8')) : {};
const list = snaps.map(f => ({ file: f, t: tmap[f] ?? (parseInt(f) + 1) / fps }));
// 分批计算，避免一次返回太大
const res = [];
for (let i = 0; i < list.length; i += 10) {
  const part = await page.evaluate(l => run(l), list.slice(i, i + 10));
  for (const r of part) { res.push({ ...r, ours: undefined, ref: undefined, diff: undefined, _img: { ours: r.ours, ref: r.ref, diff: r.diff } }); }
}
await browser.close();
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
console.log('frames', res.length, 'meanAbs avg', mean(res.map(r => r.mean)).toFixed(3), 'PSNR avg', mean(res.map(r => r.psnr)).toFixed(2), 'min PSNR', Math.min(...res.map(r => r.psnr)).toFixed(2), 'pixels>40 avg %', mean(res.map(r => r.bigPct)).toFixed(3), 'max %', Math.max(...res.map(r => r.bigPct)).toFixed(3));
const worst = res.slice().sort((a, b) => a.psnr - b.psnr).slice(0, 5); console.log('worst', worst.map(r => `${r.file} t=${r.t.toFixed(2)} psnr=${r.psnr.toFixed(1)} big=${r.bigPct.toFixed(2)}%`).join(' | '));
// 选 6 个有代表性的时刻
if (process.env.DUMP) for (const r of res.filter(r => r.file === process.env.DUMP)) for (const k of ['ref', 'ours', 'diff']) fs.writeFileSync(`/tmp/dump_${k}.png`, Buffer.from(r._img[k].split(',')[1], 'base64'));
const has = (r, re) => r.active.some(n => re.test(n));
const pick = [];
const want = [[/^开场字母/, '开场字母'], [/^飞行牌/, '飞行中'], [/^碰撞/, '碰撞瞬间'], [/^树叶爆开/, '树叶爆开'], [/^单词集齐发光/, 'RELAX 集齐'], [/^结束页/, '结束页']];
for (const [re, label] of want) {
  const cands = res.filter(r => has(r, re) && !pick.some(p => p.r === r) && (label === '结束页' || !has(r, /^结束页/)));
  if (!cands.length) continue;
  let c = cands[Math.floor(cands.length / 2)];
  if (label === '碰撞瞬间' || label === '树叶爆开') c = cands.find(r => has(r, /^飞行牌/) || has(r, /^碰撞/)) || c;
  pick.push({ r: c, label });
}
const tmp = '/tmp/aecheck'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
const font = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc';
pick.forEach((p, i) => {
  for (const k of ['ref', 'ours', 'diff']) fs.writeFileSync(`${tmp}/${k}${i}.png`, Buffer.from(p.r._img[k].split(',')[1], 'base64'));
  const lab = { ref: `网页实际帧 ${p.label} t=${p.r.t.toFixed(2)}s`, ours: `AE 数据重建 PSNR ${p.r.psnr.toFixed(1)}dB`, diff: `差异x4  大差异像素 ${p.r.bigPct.toFixed(2)} pct` };
  for (const k of ['ref', 'ours', 'diff']) execSync(`ffmpeg -v error -y -i ${tmp}/${k}${i}.png -vf "scale=300:-2,drawtext=text='${lab[k]}':x=6:y=6:fontsize=15:fontcolor=${k === 'ours' ? 'yellow' : 'white'}:box=1:boxcolor=black@0.65:fontfile=${font}" ${tmp}/s_${k}${i}.png`);
});
const n = pick.length, rows = ['ref', 'ours', 'diff'];
const inputs = rows.flatMap(k => pick.map((_, i) => `-i ${tmp}/s_${k}${i}.png`)).join(' ');
const fc = rows.map((k, ri) => `${pick.map((_, i) => `[${ri * n + i}]`).join('')}hstack=${n}[r${ri}]`).join(';') + `;[r0][r1][r2]vstack=3`;
execSync(`ffmpeg -v error -y ${inputs} -filter_complex "${fc}" -q:v 4 ${root}/screenshots/ae_export_check.jpg`);
console.log('picked', pick.map(p => `${p.label}@${p.r.t.toFixed(2)} psnr ${p.r.psnr.toFixed(1)} big ${p.r.bigPct.toFixed(2)}%`).join(' | '), 'errors', errors);
fs.writeFileSync('/tmp/aecheck/results.json', JSON.stringify(res.map(r => ({ file: r.file, t: r.t, mean: r.mean, psnr: r.psnr, bigPct: r.bigPct }))));
