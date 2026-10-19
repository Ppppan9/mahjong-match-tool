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

function serveHtml(html) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
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
export async function runResponsiveSmoke({ html, viewports = H5_TEST_VIEWPORTS, settleMs = 900 } = {}) {
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
