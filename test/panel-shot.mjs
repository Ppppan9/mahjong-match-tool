import { chromium } from 'playwright-core';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForTimeout(400);
await page.evaluate(() => { __app.S.introDuration = 30; __app.newGame(true); });
await page.waitForTimeout(500);
await page.locator('#stage').screenshot({ path: path.join(root, 'screenshots/00_intro_word.jpg') });
// 展开全部分组，截取完整控制面板
await page.evaluate(() => { document.querySelectorAll('details').forEach(d => d.open = true); const b = document.querySelector('#panelBody'); b.style.overflow = 'visible'; document.querySelector('#panel').style.overflow = 'visible'; document.querySelector('#app').style.height = 'auto'; });
await page.locator('#panel').screenshot({ path: path.join(root, 'screenshots/08_control_panel_all_groups.jpg') });
await page.evaluate(() => localStorage.clear());
console.log('errors', errors);
await browser.close();
