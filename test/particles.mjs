// 碰撞粒子（v15）：默认数量/外形/运动参数、3D 翻转、干扰字母不爆叶、旧设置迁移、AE 记录 scale-x 翻转、无控制台错误。
import { chromium } from 'playwright-core';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const URL_ = 'file://' + path.join(root, 'index.html');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const fails = [], errors = [], requests = [];
const check = (n, c, info) => { console.log(c ? 'PASS' : 'FAIL', n, info !== undefined ? JSON.stringify(info) : ''); if (!c) fails.push(n); };
const LS = 'mahjongTool.settings.v1';
async function open(saved) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  p.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) requests.push(r.url()); });
  await p.goto(URL_);
  if (saved) { await p.evaluate(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [LS, saved]); await p.reload(); }
  await p.waitForFunction(() => window.__app && __app.G && __app.G.tiles.length);
  return { p, ctx };
}
const P = p => p.evaluate(() => { const S = __app.S; return { v: S.settingsVersion, theme: S.theme, n: S.particleCount, c1: S.particleColor, c2: S.particleColor2, size: S.particleSize, life: S.particleLife }; });
{ // 新存档
  const { p, ctx } = await open(null);
  const s = await P(p);
  check('新存档国风：粒子默认 36 片、v15 配色', s.n === 36 && s.c1 === '#25603a' && s.v >= 15, s);
  // 一次爆开：数量、发射时间、翻转、尺寸差异
  const r = await p.evaluate(async () => {
    const G = __app.G; G.particles.length = 0;
    __app.spawnParticles(300, 600, 100, true, 1, 100);
    const ps = [...G.particles];
    const t0 = Math.min(...ps.map(q => q.t0)), t1 = Math.max(...ps.map(q => q.t0));
    const lens = ps.map(q => q.s).sort((a, b) => a - b);
    return { n: ps.length, emitMs: t1 - t0, lenMin: lens[0], lenMax: lens[lens.length - 1], buckets: new Set(ps.map(q => q.m)).size };
  });
  check('一次爆开 36 片、40 ms 内全部发射、大小差异明显、8 种外形色档', r.n === 36 && r.emitMs <= 40 && r.lenMax / r.lenMin > 2 && r.buckets >= 5, r);
  // 运动：逐 20 ms 采样 particleState（AE 记录用的同一函数）——scale-x 翻转过 0、向外扩散、平面自转、尾段淡出变小
  const mv = await p.evaluate(() => {
    const G = __app.G; G.particles.length = 0;
    __app.spawnParticles(300, 600, 100, true, 1, 100);
    let flips = 0, outward = 0, spin = 0, fade = 0, jumps = 0;
    for (const q of G.particles) {
      const st = []; for (let t = q.t0; t < q.t0 + q.life; t += 20) { const s = __app.particleState(q, t); if (s) st.push(s); }
      if (st.some(s => s.sy > 0.05) && st.some(s => s.sy < -0.05)) flips++;
      const a = st[1], b = st[st.length - 1];
      if (Math.hypot(b.x - 300, b.y - 600) > Math.hypot(a.x - 300, a.y - 600)) outward++;
      if (Math.abs(b.rot - a.rot) > 0.3) spin++;
      if (b.alpha < 0.3 && Math.abs(b.sx) < Math.abs(st[Math.floor(st.length / 3)].sx)) fade++;
      // 平滑：相邻 20 ms 采样位移 >12 px（牌宽 12%）且比上一步突增 1.5 倍以上才算跳变（出生后 ease-out“弹出”段位移大但连续递减，不算）
      for (let i = 2; i < st.length; i++) { const d = Math.hypot(st[i].x - st[i - 1].x, st[i].y - st[i - 1].y), d0 = Math.hypot(st[i - 1].x - st[i - 2].x, st[i - 1].y - st[i - 2].y); if (d > 12 && d > d0 * 1.5) jumps++; }
    }
    return { n: G.particles.length, flips, outward, spin, fade, jumps };
  });
  check('运动：多数叶片 3D 翻滚、向外扩散、自转、尾段变小淡出、轨迹平滑无跳变', mv.flips >= 16 && mv.outward >= 27 && mv.spin >= 16 && mv.fade >= 31 && mv.jumps === 0, mv);
  // AE 记录：每条轨迹带 sx/sy（7 元组）
  const ae = await p.evaluate(async () => {
    const G = __app.G; G.particles.length = 0;
    __app.AE.start(); __app.spawnParticles(300, 600, 100, true, 1, 100);
    await new Promise(r => setTimeout(r, 600));
    const rec = __app.AE.stop(); const tr = [...rec.parts.values()];
    return { tracks: tr.length, tuple: tr[0] && tr[0].s[0].length };
  });
  check('AE 记录粒子轨迹含 scale-x/scale-y', ae.tracks > 0 && ae.tuple === 7, ae);
  // 真实配对：普通牌爆叶、干扰字母不爆
  const m = await p.evaluate(async () => {
    const G = __app.G, S = __app.S;
    const pairOf = pred => { const free = G.tiles.filter(t => __app.isFree(t) && pred(t)); for (const a of free) for (const b of free) if (a !== b && a.key === b.key) return [a, b]; return null; };
    const wait = c => new Promise(r => { const f = () => c() ? r() : setTimeout(f, 30); f(); });
    await new Promise(r => setTimeout(r, 3500));
    const pr = pairOf(t => !/^L/.test(t.key)); G.particles.length = 0;
    __app.clickTile(pr[0]); __app.clickTile(pr[1]);
    await wait(() => G.particles.length > 0);
    const normal = G.particles.length;
    return { normal };
  });
  check('普通配对汇合时爆出 36 片', m.normal === 36, m);
  await ctx.close();
}
{ // 中东风新存档
  const { p, ctx } = await open({ settingsVersion: 15, theme: 'mideast' });
  const s = await P(p);
  check('中东风：36 片（花瓣 + 金色闪光）', s.n === 36 && s.c1 === '#a50f2d', s);
  const k = await p.evaluate(() => { __app.G.particles.length = 0; __app.spawnParticles(300, 600, 100, true, 1, 100); const ps = __app.G.particles; return { spark: ps.filter(q => q.m < 0.375).length, petal: ps.filter(q => q.m >= 0.375).length }; });
  check('中东风：同时有闪光与花瓣', k.spark > 3 && k.petal > 10, k);
  await ctx.close();
}
{ // 迁移：本地旧默认 → 新默认；自定义保留
  const { p, ctx } = await open({ settingsVersion: 14, particleCount: 12, particleColor: '#2e7d32', particleColor2: '#7cc576', particleSize: 1.4, seed: 3 });
  const s = await P(p);
  check('本地 v14 旧默认粒子参数 → v15 新默认', s.n === 36 && s.c1 === '#25603a' && s.c2 === '#45a046' && s.size === 1 && s.v >= 15, s);
  await ctx.close();
}
{
  const { p, ctx } = await open({ settingsVersion: 14, particleCount: 20, particleColor: '#ff0000', particleSize: 2, theme: 'mideast', themeStore: { guofeng: { particleColor: '#2e7d32', particleCount: 25 } } });
  const s = await P(p);
  const store = await p.evaluate(() => __app.S.themeStore);
  check('本地自定义粒子参数保留（含另一主题的自定义）', s.n === 20 && s.c1 === '#ff0000' && s.size === 2 && store.guofeng?.particleCount === 25 && !('particleColor' in (store.guofeng || {})), { s, store });
  await ctx.close();
}
{
  const { p, ctx } = await open(null);
  const r = await p.evaluate(() => { __app.importJSON(JSON.stringify({ settingsVersion: 14, particleCount: 12, particleColor: '#2e7d32' })); return { n: __app.S.particleCount, c1: __app.S.particleColor }; });
  check('导入旧 JSON：粒子值原样保留', r.n === 12 && r.c1 === '#2e7d32', r);
  await ctx.close();
}
check('无控制台错误/外部请求', !errors.length && !requests.length, { errors, requests });
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
