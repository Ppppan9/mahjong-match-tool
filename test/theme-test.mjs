// 主题补充测试：国风与 v12（主题前）像素一致；导入 JSON 保留主题；“恢复默认”保留当前主题；旧存档无 theme → 国风；
// 自动通关中反复切换主题无报错；两种主题都能自动通关；无控制台错误、无外部网络请求。
// 用法：node test/theme-test.mjs [基准 index.html（默认跳过像素对比）]
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REF = process.argv[2];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [], requests = [], fails = [];
const check = (name, cond, info) => { console.log(cond ? 'PASS' : 'FAIL', name, info !== undefined ? JSON.stringify(info) : ''); if (!cond) fails.push(name); };
async function open(file, vp = { width: 1280, height: 900 }) {
  const p = await browser.newPage({ viewport: vp, acceptDownloads: true });
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  p.on('request', r => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) requests.push(u); });
  p.on('dialog', d => d.accept());
  await p.addInitScript(() => {
    // 冻结时钟：performance.now 只在 __tick 时前进，保证两个版本画出同一帧
    let t = 1000; performance.now = () => t; window.__tick = ms => { t += ms; };
    Math.random = (() => { let a = 12345; return () => { a = a + 0x6D2B79F5 | 0; let x = Math.imul(a ^ a >>> 15, 1 | a); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; })();
  });
  await p.goto('file://' + file); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => window.__app && window.__fontsReady === true, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(800);
  return p;
}
const realClock = () => browser.newPage().then(async p => {
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  p.on('request', r => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) requests.push(u); });
  p.on('dialog', d => d.accept());
  await p.goto('file://' + path.join(root, 'index.html')); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(2500); return p;
});
const frame = p => p.evaluate(async () => {
  __app.newGame(true); __tick(4000);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const st = document.getElementById('stage'), g = st.getContext('2d', { willReadFrequently: true });
  const parts = {};
  for (const [n, a] of [['bg', ['drawBackground']], ['top', ['drawTopBar', 5000, 'base']], ['end', ['drawEndCard', 5000, 'bg']], ['endAll', ['drawEndCard', 5000, 'btn']]]) {
    const c = document.createElement('canvas'); c.width = st.width; c.height = st.height; __app.drawPart(c.getContext('2d'), ...a); parts[n] = c.toDataURL('image/png');
  }
  return { stage: st.toDataURL('image/png'), ...parts };
});
const decode = (p, url) => p.evaluate(async u => { const im = new Image(); im.src = u; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return Array.from(g.getImageData(0, 0, c.width, c.height).data); }, url);

// ---------- 1. 国风与主题功能之前的版本逐像素一致 ----------
if (REF) {
  const pa = await open(path.resolve(REF)), pb = await open(path.join(root, 'index.html'));
  const A = await frame(pa), B = await frame(pb);
  for (const k of Object.keys(A)) {
    const a = await decode(pb, A[k]), b = await decode(pb, B[k]);
    let diff = 0, big = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) diff++; if (d > 8) big++; }
    check(`国风未改变: ${k}`, a.length === b.length && big === 0, { len: a.length / 4, diffPx: Math.round(diff / 4), bigDiff: big });
  }
  await pa.close(); await pb.close();
}

const p = await realClock();
// ---------- 2. 旧存档（无 theme 字段）→ 国风且保留数值 ----------
await p.evaluate(() => localStorage.setItem('mahjongTool.settings.v1', JSON.stringify({ settingsVersion: 11, topBarColor: '#224466', logoLine1: 'Hello', bgColor: '#101010', seed: 77, layers: 4 })));
await p.reload(); await p.waitForTimeout(1500);
const leg = await p.evaluate(() => ({ theme: __app.theme, v: __app.S.settingsVersion, top: __app.S.topBarColor, l1: __app.S.logoLine1, bg: __app.S.bgColor, seed: __app.S.seed, layers: __app.S.layers, sel: [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'mideast'))?.value }));
check('旧存档无 theme → 国风并保留数值', leg.theme === 'guofeng' && leg.v === 14 && leg.top === '#224466' && leg.l1 === 'Hello' && leg.bg === '#101010' && leg.seed === 77 && leg.layers === 4 && leg.sel === 'guofeng', leg);
await p.evaluate(() => localStorage.setItem('mahjongTool.settings.v1', JSON.stringify({ seed: 5 })));
await p.reload(); await p.waitForTimeout(1200);
check('最旧存档（无版本号）→ 国风', await p.evaluate(() => __app.theme === 'guofeng' && __app.S.seed === 5));

// ---------- 3. 导入 JSON 保留主题 ----------
await p.evaluate(() => { localStorage.clear(); __app.importJSON(JSON.stringify({ settingsVersion: 12, theme: 'mideast', topBarColor: '#111111' })); });
let r = await p.evaluate(() => ({ theme: __app.theme, top: __app.S.topBarColor, sfx: __app.S.sfxScale }));
check('导入 {theme:mideast} → 中东风 + 导入值', r.theme === 'mideast' && r.top === '#111111' && r.sfx === 'hijaz', r);
// 中东风导出 → 切回国风 → 导入导出文件 → 中东风且数值一致
await p.evaluate(() => __app.setSetting('logoLine1', 'Oasis'));
const dl = p.waitForEvent('download'); await p.click('#btnExport'); const f = await (await dl).path(); const txt = fs.readFileSync(f, 'utf8');
await p.evaluate(() => __app.setSetting('theme', 'guofeng'));
r = await p.evaluate(t => { __app.importJSON(t); return { theme: __app.theme, l1: __app.S.logoLine1, top: __app.S.topBarColor }; }, txt);
check('导出→导入往返保留主题', JSON.parse(txt).theme === 'mideast' && r.theme === 'mideast' && r.l1 === 'Oasis' && r.top === '#111111', r);
r = await p.evaluate(() => { __app.importJSON(JSON.stringify({ settingsVersion: 11, topBarColor: '#333333' })); return { theme: __app.theme, top: __app.S.topBarColor }; });
check('导入无 theme 的旧 JSON → 国风', r.theme === 'guofeng' && r.top === '#333333', r);
r = await p.evaluate(() => { __app.importJSON(JSON.stringify({ theme: 'nope' })); return __app.theme; });
check('导入未知主题 → 国风', r === 'guofeng', r);

// ---------- 4. “恢复默认”保留当前主题 ----------
await p.evaluate(() => { __app.importJSON(JSON.stringify({ theme: 'mideast', layers: 5, logoLine1: 'X' })); });
await p.click('#btnReset'); await p.waitForTimeout(400);
r = await p.evaluate(() => ({ theme: __app.theme, layers: __app.S.layers, l1: __app.S.logoLine1, top: __app.S.topBarColor, store: __app.S.themeStore, sel: [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'mideast'))?.value }));
const md = await p.evaluate(() => __app.THEMES.mideast.defaults);
check('恢复默认保留中东风（数值回到中东风默认）', r.theme === 'mideast' && r.sel === 'mideast' && r.layers === 3 && r.l1 === md.logoLine1 && r.top === md.topBarColor && Object.keys(r.store).length === 0, r);
await p.evaluate(() => __app.setSetting('theme', 'guofeng')); await p.click('#btnReset'); await p.waitForTimeout(400);
check('恢复默认保留国风', await p.evaluate(() => __app.theme === 'guofeng'));

// ---------- 5. 自动通关中反复切换主题 + 两种主题通关 ----------
for (const th of ['guofeng', 'mideast']) {
  r = await p.evaluate(async th => {
    __app.setSetting('theme', th); Object.assign(__app.S, { autoRec: false, autoSpeed: 6, flyDuration: 150, moveMin: 60, moveMax: 80, delayMin: 0, delayMax: 10, thinkChance: 0, endDelay: 200, winCondition: 'clear' });
    __app.newGame(true); __app.autoSolve(); let sw = 0; const t0 = performance.now();
    while (!__app.G.cleared && performance.now() - t0 < 180000) { await new Promise(r => setTimeout(r, 700)); if (sw < 6) { __app.setSetting('theme', __app.theme === 'guofeng' ? 'mideast' : 'guofeng'); sw++; } }
    __app.setSetting('theme', th); await new Promise(r => setTimeout(r, 1500));
    return { cleared: __app.G.cleared, left: __app.G.tiles.filter(t => t.state !== 'gone').length, switches: sw, theme: __app.theme };
  }, th);
  check(`自动通关（${th}，中途切换 6 次）`, r.cleared && r.left === 0 && r.theme === th, r);
}
await p.evaluate(() => localStorage.clear());
await browser.close();
check('无控制台错误', errors.length === 0, errors.slice(0, 5));
check('无外部网络请求', requests.length === 0, requests.slice(0, 5));
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
