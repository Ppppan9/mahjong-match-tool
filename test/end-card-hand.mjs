// v19：结尾页默认不显示手指；通关后检查手消失，截图 screenshots/end_card_no_hand.jpg
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const URL_ = 'file://' + path.join(root, 'index.html');
const PNG = path.join(root, 'test/assets/test_hand.png');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const fails = [], errors = [];
const check = (n, c, info) => { console.log(c ? 'PASS' : 'FAIL', n, info !== undefined ? JSON.stringify(info) : ''); if (!c) fails.push(n); };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => m.type() === 'error' && errors.push(m.text()));
await p.goto(URL_);
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForFunction(() => window.__app && __app.G && __app.G.tiles.length);

const def = await p.evaluate(() => ({ v: __app.S.settingsVersion, endCardHand: __app.S.endCardHand, handAvoid: __app.S.handAvoid, endCard: __app.S.endCard }));
check('默认 v20、endCardHand=false、handAvoid=false、endCard=true', def.v === 20 && def.endCardHand === false && def.handAvoid === false && def.endCard === true, def);

const sw = await p.evaluate(() => {
  const row = [...document.querySelectorAll('.row')].find(r => /结束页显示手指/.test(r.textContent || ''));
  const input = row && row.querySelector('input.switch-input');
  return { hasRow: !!row, isSwitch: !!(input && input.closest('label.switch')), checked: !!(input && input.checked) };
});
check('面板有结束页手指滑动开关且默认关', sw.hasRow && sw.isSwitch && sw.checked === false, sw);

await p.locator('.row', { hasText: '上传手指图片' }).locator('input[type=file]').setInputFiles(PNG);
await p.waitForFunction(() => __app.S.handImage.startsWith('data:image/png'));
await p.evaluate(() => {
  Object.assign(__app.S, { autoRec: false, autoSpeed: 6, flyDuration: 150, moveMin: 50, moveMax: 70, delayMin: 0, delayMax: 5, thinkChance: 0, endDelay: 400, layers: 3, winCondition: 'clear', introWord: false, handAvoid: false });
  __app.setSetting('handAnchorX', 0.48); __app.setSetting('handAnchorY', 0.03);
  __app.newGame(true);
});
await p.waitForTimeout(400);
await p.evaluate(() => __app.autoSolve());
await p.waitForFunction(() => __app.G && __app.G.cleared, null, { timeout: 180000 });
await p.waitForFunction(() => __app.endCardState(performance.now()), null, { timeout: 30000 });
await p.waitForTimeout(500);

const after = await p.evaluate(() => {
  const now = performance.now();
  const ec = __app.endCardState(now);
  const hs = __app.handState();
  const hide = __app.endCardHidesHand(now);
  // 品红测试手指像素
  const c = document.querySelector('#stage'), g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let mag = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i + 1] < 40 && d[i + 2] > 235) mag++;
  return { ec: !!ec, hs, hide, alpha: __app.HAND.alpha, visible: __app.HAND.visible, mag, endCardHand: __app.S.endCardHand };
});
check('通关后结束页已出现且隐藏手指', after.ec && after.hide && after.hs === null && after.alpha === 0 && after.visible === false, after);
check('画布上无品红手指像素', after.mag === 0, { mag: after.mag });

fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
await p.locator('#stage').screenshot({ path: path.join(root, 'screenshots', 'end_card_no_hand.jpg'), type: 'jpeg', quality: 85 });
check('已保存 end_card_no_hand.jpg', fs.existsSync(path.join(root, 'screenshots', 'end_card_no_hand.jpg')));

// 打开开关后应能再次显示（仅验证设置读写，不重跑通关）
await p.evaluate(() => __app.setSetting('endCardHand', true));
check('可打开 endCardHand', await p.evaluate(() => __app.S.endCardHand === true));

check('无控制台错误', errors.length === 0, errors.slice(0, 5));
await browser.close();
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
