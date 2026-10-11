// 分层调试与“洞”对比：每层单独显示 + 按层着色；参考视频若干次消除后 vs 本工具同样消除次数后
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VIDEO = '/home/box/agent-data/agents/13473619-9b07-4a6a-9592-552b8a150b7e/attachments/9fe81825ac170d65dd59da2ecbe78e0ce0f9887f1ae0fc3bb7cad9055816ab26.mp4';
const tmp = process.env.TMP || '/tmp/ldbg'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
const V9 = process.env.V9 === '1'; // 复现修复前（v9）的分层显示
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(process.env.PAGE || 'file://' + path.join(root, 'index.html'));
await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(800);
const shot = async name => { const d = await page.evaluate(() => document.querySelector('#stage').toDataURL('image/jpeg', 0.9)); fs.writeFileSync(`${tmp}/${name}.jpg`, Buffer.from(d.split(',')[1], 'base64')); };
const info = await page.evaluate(async ([V9, EXTRA]) => {
  if (V9) { __app.setSetting('insetX', 0); __app.setSetting('layerOffsetX', 0); __app.setSetting('layerOffsetY', 0); __app.setSetting('depthDarken', 0); }
  __app.setSetting('introWord', false); __app.setSetting('winCondition', 'clear');
  for (const [k, v] of Object.entries(JSON.parse(EXTRA))) __app.setSetting(k, v);
  __app.newGame(true);
  await new Promise(r => setTimeout(r, 600));
  const G = __app.G, L = {}; for (const t of G.tiles) L[t.layer] = (L[t.layer] || 0) + 1;
  return { n: G.tiles.length, perLayer: L };
}, [V9, process.env.EXTRA || '{}']);
const NL = Object.keys(info.perLayer).length;
for (let l = 0; l < NL; l++) { await page.evaluate(l => { __app.setSetting('layerDebug', 'only'); __app.setSetting('layerOnly', l); }, l); await page.waitForTimeout(250); await shot('only' + l); }
await page.evaluate(() => { __app.setSetting('layerDebug', 'tint'); __app.setSetting('layerOnly', -1); }); await page.waitForTimeout(250); await shot('tint0');
// 清除若干对（优先字母与最高层，与参考的消除顺序相近），每次等动画结束
const clear = n => page.evaluate(async n => {
  const G = __app.G; window.__rs = window.__rs || 12345; const rnd = () => { window.__rs = (window.__rs * 16807) % 2147483647; return window.__rs / 2147483647; };
  for (let i = 0; i < n; i++) {
    const free = G.tiles.filter(t => __app.isFree(t) && t.state === 'board');
    let best = null, bs = -1e9;
    for (const a of free) for (const b of free) if (a.id < b.id && a.key === b.key) { const s = (a.key[0] === 'T' ? 3 : 0) + a.layer + b.layer + rnd() * 2; if (s > bs) { bs = s; best = [a, b]; } }
    if (!best) break;
    __app.clickTile(best[0]); __app.clickTile(best[1]);
    await new Promise(r => setTimeout(r, 2800));
  }
}, n);
await clear(8); await shot('tint8');
await page.evaluate(() => __app.setSetting('layerDebug', 'off')); await page.waitForTimeout(250); await shot('plain8');
// 同一局从头：0 / 4 / 8 / 10 次消除，不着色
await page.evaluate(() => { __app.setSetting('layerDebug', 'off'); __app.newGame(true); }); await page.waitForTimeout(600);
await shot('h0'); await clear(4); await shot('h4'); await clear(4); await shot('h8');
await page.evaluate(() => __app.setSetting('layerDebug', 'tint')); await page.waitForTimeout(250); await shot('h8t'); await page.evaluate(() => __app.setSetting('layerDebug', 'off')); await page.waitForTimeout(250);
await clear(2); await shot('h10');
await page.screenshot({ path: `${tmp}/viewport.png` });
// 量取：每层牌面在屏幕上的平均位置差（应为向右下 0.045/0.075 牌宽）
const geo = await page.evaluate(() => { const G = __app.G, by = {}; for (const t of G.tiles) { const s = __app.tileScreen(t); (by[t.layer + ':' + t.col + ':' + t.row] = s); } const out = []; for (const t of G.tiles) { const up = by[(t.layer + 1) + ':' + (t.col + 1) + ':' + t.row]; if (up) { const s = by[t.layer + ':' + t.col + ':' + t.row]; out.push([(s.x - up.x) / s.w, (s.y - up.y) / s.w]); } } return { tileW: by[Object.keys(by)[0]].w, samples: out.length, dx: out.length ? out.reduce((a, b) => a + b[0], 0) / out.length : null, dy: out.length ? out.reduce((a, b) => a + b[1], 0) / out.length : null }; });
await page.evaluate(() => localStorage.clear());
await browser.close();
console.log(JSON.stringify({ V9, info, geo, errors }));
