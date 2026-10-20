/**
 * Playwright viewport smoke for H5 playable HTML (contain/letterbox + CTA).
 * Usage: import { runResponsiveSmoke } from '.../responsive-smoke.mjs';
 *        await runResponsiveSmoke({ html, outDir? });
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { H5_TEST_VIEWPORTS } from './index.js';

async function launchBrowser() {
  const { chromium } = await import('playwright-core');
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  let lastErr;
  for (const executablePath of candidates) {
    try {
      return await chromium.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
    } catch (e) { lastErr = e; }
  }
  try {
    return await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  } catch (e) {
    throw lastErr || e;
  }
}

/** Minimal MRAID 2.0 stub served as /<channel>/mraid.js for local tests. */
export const MRAID_STUB = `(function(){var L={};window.mraid={getState:function(){return 'default'},getVersion:function(){return '2.0'},isViewable:function(){return true},
addEventListener:function(e,f){(L[e]=L[e]||[]).push(f)},removeEventListener:function(){},open:function(u){window.__mraidOpened=u}};})();`;

function serveHtml(html) { return serveFiles({ '/': html, '/index.html': html }); }

/** files: { '/path': string } ; mraid.js anywhere → stub; favicon → 204. */
function serveFiles(files) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const u = decodeURIComponent((req.url || '/').split('?')[0]);
      if (u.endsWith('/mraid.js')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(MRAID_STUB); return; }
      if (u === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const body = files[u] != null ? files[u] : (files[u.replace(/\/$/, '/index.html')]);
      if (body == null) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

/**
 * @returns {Promise<{ results: Array<object>, ok: boolean }>}
 */
export async function runResponsiveSmoke({ html, viewports = H5_TEST_VIEWPORTS, settleMs = 1500, minNonBlack = 0.05 } = {}) {
  if (!html || html.length < 1000) throw new Error('responsive smoke: html too short');
  const browser = await launchBrowser();
  const srv = await serveHtml(html);
  const results = [];
  let ok = true;
  try {
    for (const vp of viewports) {
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      const row = { name: vp.name, width: vp.width, height: vp.height, pass: false };
      const errs = watchErrors(page);
      try {
        await page.goto(srv.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(settleMs);
        const metrics = await page.evaluate(() => {
          const stage = document.getElementById('stage');
          const cta = document.getElementById('h5-cta');
          const wrap = document.getElementById('stageWrap');
          if (!stage) return { error: 'no #stage' };
          const sr = stage.getBoundingClientRect();
          const cr = cta ? cta.getBoundingClientRect() : null;
          const wr = wrap ? wrap.getBoundingClientRect() : null;
          const layout = window.__h5StageLayout || null;
          const cs = getComputedStyle(document.body);
          const overflowX = document.documentElement.scrollWidth > window.innerWidth + 1
            || document.body.scrollWidth > window.innerWidth + 1;
          const overflowY = document.documentElement.scrollHeight > window.innerHeight + 2
            || document.body.scrollHeight > window.innerHeight + 2;
          return {
            stage: { w: sr.width, h: sr.height, top: sr.top, left: sr.left, visible: sr.width > 8 && sr.height > 8 },
            cta: cr ? { w: cr.width, h: cr.height, top: cr.top, bottom: cr.bottom, visible: cr.height > 4 } : null,
            wrap: wr ? { w: wr.width, h: wr.height } : null,
            layout,
            vw: window.innerWidth,
            vh: window.innerHeight,
            overflowX,
            overflowY,
            bodyBg: cs.backgroundColor,
            hasFit: typeof window.__h5FitStage === 'function',
            playableCss: !!document.getElementById('h5-playable-css'),
          };
        });
        row.metrics = metrics;
        const checks = [];
        if (metrics.error) checks.push(metrics.error);
        if (!metrics.playableCss) checks.push('missing playable css');
        if (!metrics.hasFit) checks.push('missing __h5FitStage');
        if (!metrics.stage || !metrics.stage.visible) checks.push('stage not visible');
        if (!metrics.cta || !metrics.cta.visible) checks.push('CTA not visible');
        if (metrics.overflowX) checks.push('horizontal overflow');
        // CTA must sit within viewport (not clipped below fold)
        if (metrics.cta && metrics.cta.bottom > metrics.vh + 2) checks.push('CTA clipped below viewport');
        if (metrics.cta && metrics.cta.top < 0) checks.push('CTA above viewport');
        // Stage contained: within viewport and not larger than avail (allow 2px float)
        if (metrics.stage) {
          if (metrics.stage.w > metrics.vw + 2) checks.push('stage wider than viewport');
          if (metrics.stage.h > metrics.vh + 2) checks.push('stage taller than viewport');
          // Scale should preserve aspect ~9:16 (or design) within 3%
          const ar = metrics.stage.w / metrics.stage.h;
          const designAr = (metrics.layout && metrics.layout.designW && metrics.layout.designH)
            ? metrics.layout.designW / metrics.layout.designH
            : 720 / 1280;
          if (Math.abs(ar - designAr) / designAr > 0.04) checks.push('aspect drift ' + ar.toFixed(3) + ' vs ' + designAr.toFixed(3));
        }
        // On landscape-wide viewports, expect letterbox (stage height limited by height or width)
        if (vp.width > vp.height && metrics.stage && metrics.stage.w < metrics.vw * 0.98) {
          row.letterbox = 'side';
        } else if (vp.height >= vp.width && metrics.stage && metrics.stage.h < metrics.vh * 0.92) {
          row.letterbox = 'bottom-or-cta';
        }
        const blank = await stageNonBlackRatio(page);
        row.nonBlack = blank.ratio;
        if (blank.error) checks.push('stage sample: ' + blank.error);
        else if (blank.ratio < minNonBlack) checks.push('stage blank/black (non-black ' + (blank.ratio * 100).toFixed(1) + '%)');
        if (errs.length) checks.push('console errors: ' + errs.slice(0, 3).join(' | '));
        row.checks = checks;
        row.pass = checks.length === 0;
        if (!row.pass) ok = false;
      } catch (e) {
        row.pass = false;
        row.error = e.message || String(e);
        ok = false;
      } finally {
        await page.close().catch(() => {});
      }
      results.push(row);
    }
  } finally {
    await srv.close();
    await browser.close().catch(() => {});
  }
  return { results, ok };
}

export function formatSmokeReport(smoke) {
  const lines = [];
  for (const r of smoke.results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    const m = r.metrics;
    const dim = m && m.stage ? `stage ${Math.round(m.stage.w)}×${Math.round(m.stage.h)}` : '';
    const cta = m && m.cta ? `ctaH=${Math.round(m.cta.h)}` : '';
    const extra = r.checks && r.checks.length ? ' [' + r.checks.join('; ') + ']' : (r.error ? ' ' + r.error : '');
    lines.push(`  ${status} ${r.name} ${r.width}×${r.height} ${dim} ${cta}${extra}`);
  }
  return lines.join('\n');
}

/** Collect console errors + uncaught page errors. */
export function watchErrors(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e && e.message || e).slice(0, 200)));
  return errs;
}

/**
 * Screenshot the #stage rect (what the user actually sees, works for WebGL
 * without preserveDrawingBuffer) and measure the share of non-black pixels.
 */
export async function stageNonBlackRatio(page, { threshold = 28 } = {}) {
  const box = await page.evaluate(() => {
    const s = document.getElementById('stage');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(r.width, innerWidth), height: Math.min(r.height, innerHeight) };
  });
  if (!box || box.width < 4 || box.height < 4) return { ratio: 0, error: 'no stage rect' };
  // Hide CTA overlay while sampling so its gradient/button don't count.
  await page.evaluate(() => { const c = document.getElementById('h5-cta'); if (c) c.style.visibility = 'hidden'; });
  const png = await page.screenshot({ clip: box, type: 'png' });
  await page.evaluate(() => { const c = document.getElementById('h5-cta'); if (c) c.style.visibility = ''; });
  return page.evaluate(async ({ b64, threshold }) => {
    const im = new Image();
    await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, t = 0;
    for (let i = 0; i < d.length; i += 4 * 7) { t++; if (d[i] + d[i + 1] + d[i + 2] > threshold) n++; }
    return { ratio: t ? n / t : 0 };
  }, { b64: png.toString('base64'), threshold });
}

/** Expected CTA hook text per channel (must appear in channel index.html). */
export const CHANNEL_CTA_HOOKS = {
  applovin: ['mraid.open(', 'mraid' + '.js'],
  facebook: ['FbPlayableAd.onCTAClick()'],
  google: ['ExitApi.exit()'],
  mintegral: ['window.install()'],
  moloco: ['FbPlayableAd.onCTAClick()'],
  tiktok: ['window.openAppStore()'],
  unity: ['mraid.open(', 'viewableChange'],
  generic: ['__h5Install'],
};

/**
 * Serve every channel folder (files: { 'tiktok/index.html': html, ... }) over http
 * and open each channel index.html: no console/page errors, stage not black,
 * CTA hook present. viewports default: desktop landscape 1024×500 + 390×844.
 */
export async function runChannelSmoke({ files, viewports = [{ name: 'desktop-landscape', width: 1024, height: 500 }, { name: 'iPhone 12/13', width: 390, height: 844 }], settleMs = 1500, minNonBlack = 0.05, shotDir = null, shotPrefix = 'h5' } = {}) {
  const map = {};
  const channels = [];
  for (const [k, v] of Object.entries(files)) {
    map['/' + k] = v;
    const m = /^([^/]+)\/index\.html$/.exec(k);
    if (m) channels.push(m[1]);
  }
  const browser = await launchBrowser();
  const srv = await serveFiles(map);
  const results = [];
  let ok = true;
  try {
    for (const ch of channels) {
      const html = map['/' + ch + '/index.html'];
      const hooks = CHANNEL_CTA_HOOKS[ch] || ['__h5Install'];
      const missingHooks = hooks.filter(h => !html.includes(h));
      if (ch === 'moloco' && html.includes('mraid' + '.js')) missingHooks.push('moloco must not reference mraid' + '.js');
      for (const vp of viewports) {
        const row = { channel: ch, name: vp.name, width: vp.width, height: vp.height, bytes: Buffer.byteLength(html), pass: false, checks: [] };
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        const errs = watchErrors(page);
        try {
          await page.goto(srv.url + ch + '/index.html', { waitUntil: 'load', timeout: 60000 });
          await page.waitForTimeout(settleMs);
          const st = await page.evaluate(() => ({ playable: !!window.__PLAYABLE__, cta: !!document.querySelector('#h5-cta button'), install: typeof window.__h5Install === 'function' }));
          if (!st.playable) row.checks.push('no __PLAYABLE__');
          if (!st.cta) row.checks.push('no CTA button');
          if (!st.install) row.checks.push('no __h5Install');
          const b = await stageNonBlackRatio(page);
          row.nonBlack = b.ratio;
          if (b.error) row.checks.push(b.error);
          else if (b.ratio < minNonBlack) row.checks.push('stage blank/black (non-black ' + (b.ratio * 100).toFixed(1) + '%)');
          if (missingHooks.length) row.checks.push('CTA hook missing: ' + missingHooks.join(','));
          if (errs.length) row.checks.push('errors: ' + errs.slice(0, 3).join(' | '));
          if (shotDir) {
            fs.mkdirSync(shotDir, { recursive: true });
            row.shot = path.join(shotDir, `${shotPrefix}_${ch}_${vp.width}x${vp.height}.png`);
            await page.screenshot({ path: row.shot });
          }
        } catch (e) { row.checks.push('exception: ' + (e.message || e)); }
        finally { await page.close().catch(() => {}); }
        row.pass = row.checks.length === 0;
        if (!row.pass) ok = false;
        results.push(row);
      }
    }
  } finally {
    await srv.close();
    await browser.close().catch(() => {});
  }
  return { results, ok };
}

export function formatChannelReport(smoke) {
  return smoke.results.map(r => `  ${r.pass ? 'PASS' : 'FAIL'} ${r.channel.padEnd(9)} ${r.width}×${r.height} ${(r.bytes / 1048576).toFixed(2)}MB nonBlack=${((r.nonBlack || 0) * 100).toFixed(0)}%` + (r.checks.length ? ' [' + r.checks.join('; ') + ']' : '')).join('\n');
}
