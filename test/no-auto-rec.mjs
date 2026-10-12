// 回归测试（v14.1）：真实点击「自动通关」不会开始录制（视频 / AE 时间轴都不开始），新存档与各旧版本存档、两种主题，1440×900。
// 录制只由「开始录制」按钮（或 AE「开始记录」）开始；手动开始录制后自动通关通关，仍会自动停止并下载。导入的 JSON 保留 autoRec 值。
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const URL_ = process.argv[2] || 'file://' + path.join(root, 'index.html');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const fails = [];
const check = (n, c, info) => { console.log(c ? 'PASS' : 'FAIL', n, info !== undefined ? JSON.stringify(info) : ''); if (!c) fails.push(n); };
const LS = 'mahjongTool.settings.v1';

async function open(saved) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const st = { errors: [], requests: [], downloads: [] };
  p.on('pageerror', e => st.errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') st.errors.push(m.text()); });
  p.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) st.requests.push(r.url()); });
  p.on('download', async d => { const f = '/tmp/noautorec_' + d.suggestedFilename(); try { await d.saveAs(f); st.downloads.push({ name: d.suggestedFilename(), size: fs.statSync(f).size }); } catch (e) {} });
  await p.goto(URL_);
  if (saved) { await p.evaluate(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [LS, saved]); await p.reload(); }
  await p.waitForFunction(() => window.__app && __app.G && __app.G.tiles.length);
  await p.waitForTimeout(400);
  return { p, ctx, st };
}
const state = p => p.evaluate(() => ({ autoRec: __app.S.autoRec, v: __app.S.settingsVersion, theme: __app.S.theme, rec: !!__app.REC.rec, ae: __app.AE.active(), running: __app.AUTO.running, btnRec: document.querySelector('#btnRec').textContent }));

const cases = [
  ['新存档 国风', null],
  ['新存档 中东风', { settingsVersion: 14, theme: 'mideast' }],
  ['v13 存档（autoRec 旧默认 true）中东风', { settingsVersion: 13, theme: 'mideast', autoRec: true, autoStop: true, aeWithRec: true, seed: 11 }],
  ['v12 存档（autoRec true）', { settingsVersion: 12, autoRec: true, seed: 5 }],
  ['v11 存档（没有 autoRec 键）', { settingsVersion: 11, seed: 5, layers: 3 }],
  ['v1 存档（无版本号，autoRec true）', { seed: 5, autoRec: true }],
];
for (const [name, saved] of cases) {
  const { p, ctx, st } = await open(saved);
  const s0 = await state(p);
  check(`${name}：迁移后 autoRec=false、版本 16`, s0.autoRec === false && s0.v === 16 && (!saved?.theme || s0.theme === saved.theme), s0);
  await p.locator('#btnAuto').click();
  await p.waitForTimeout(3000);
  const s1 = await state(p);
  check(`${name}：点击自动通关 → 自动通关运行，但没有开始录制（视频/AE 都没有）`, s1.running && !s1.rec && !s1.ae && /开始录制/.test(s1.btnRec), s1);
  check(`${name}：无控制台错误/外部请求`, !st.errors.length && !st.requests.length, { e: st.errors, r: st.requests });
  await ctx.close();
}

// 自动通关到通关全程都不录制、不下载
{
  const { p, ctx, st } = await open({ settingsVersion: 13, autoRec: true, seed: 8, autoSpeed: 4, tailSec: 0.5, endDelay: 500 });
  await p.locator('#btnAuto').click();
  await p.waitForFunction(() => __app.G.cleared, null, { timeout: 240000 });
  await p.waitForTimeout(4000);
  const s = await state(p);
  check('旧存档完整自动通关：全程没有录制、没有下载', !s.rec && !s.ae && st.downloads.length === 0, { s, d: st.downloads });
  await ctx.close();
}

// 手动「开始录制」后自动通关：通关后自动停止并下载（视频 + AE 包）
{
  const { p, ctx, st } = await open({ settingsVersion: 14, seed: 8, autoSpeed: 4, tailSec: 0.5, endDelay: 500 });
  await p.locator('#btnRec').click();
  await p.waitForTimeout(300);
  const s0 = await state(p);
  check('点「开始录制」→ 录制 + AE 记录开始', s0.rec && s0.ae, s0);
  await p.locator('#btnAuto').click();
  await p.waitForFunction(() => __app.G.cleared, null, { timeout: 240000 });
  await p.waitForFunction(() => !__app.REC.rec, null, { timeout: 30000 });
  await p.waitForTimeout(8000);
  const vids = st.downloads.filter(d => /\.(mp4|webm)$/.test(d.name)), zips = st.downloads.filter(d => /ae_export.*\.zip$/.test(d.name));
  check('手动录制 + 自动通关：通关后自动停止并下载视频与 AE 包', vids.length === 1 && vids[0].size > 50000 && zips.length === 1, st.downloads);
  check('手动录制流程无控制台错误/外部请求', !st.errors.length && !st.requests.length, { e: st.errors, r: st.requests });
  await ctx.close();
}

// 导入的 JSON 保留 autoRec 值（旧版本 JSON 显式 true 仍为 true）
{
  const { p, ctx } = await open(null);
  const r = await p.evaluate(() => { __app.importJSON(JSON.stringify({ settingsVersion: 12, autoRec: true })); const a = __app.S.autoRec; __app.importJSON(JSON.stringify({ settingsVersion: 11 })); return { explicitTrue: a, missing: __app.S.autoRec }; });
  check('导入旧 JSON：显式 autoRec=true 保留；未写则用新默认 false', r.explicitTrue === true && r.missing === false, r);
  await ctx.close();
}

await browser.close();
console.log(fails.length ? `FAILED ${fails.length}: ${fails.join(' | ')}` : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
