// ---- Shared: per-channel black-stage smoke (append to each tool's test/h5-export.mjs) ----
// Usage: await runAllChannelChecks({ baseHtml, toolId, outDir, fixturesDir })
import fsx from 'fs';
import pathx from 'path';
import { makePlayableHtml as mph, ALL_FORMATS as AF, CHANNEL_LIMITS as CL } from './index.js';
import { runChannelSmoke, formatChannelReport } from './responsive-smoke.mjs';

export async function runAllChannelChecks({ baseHtml, toolId, outDir, fixturesDir, defaultHand = '', endSettings = {} }) {
  const base = { canvasW: 720, canvasH: 1280, h5CtaText: '立即下载' };
  const png = (n) => 'data:image/png;base64,' + fsx.readFileSync(pathx.join(fixturesDir, n)).toString('base64');
  const variants = [
    { id: 'default', settings: { ...base }, formats: AF, viewports: null },
    { id: 'adaptive', settings: { ...base, h5Device: 'adaptive' }, formats: ['generic', 'applovin'], viewports: [{ name: 'desktop-landscape', width: 1024, height: 500 }] },
    { id: 'iphone-13', settings: { ...base, h5Device: 'iphone-13', h5DeviceW: 390, h5DeviceH: 844 }, formats: ['generic', 'unity'], viewports: [{ name: 'desktop-landscape', width: 1024, height: 500 }, { name: 'iPhone 12/13', width: 390, height: 844 }] },
    { id: 'bigfinger', settings: { ...base, handImage: png('big-finger.png'), manualHand: true }, formats: ['generic', 'facebook'], viewports: [{ name: 'desktop-landscape', width: 1024, height: 500 }] },
    { id: 'autoplay-end', settings: { ...base, ...endSettings }, autoPlay: true, waitEnd: true, formats: ['generic', 'applovin'], viewports: [{ name: 'desktop-landscape', width: 1024, height: 500 }] },
    { id: 'midfinger', settings: { ...base, handImage: png('mid-finger.png'), manualHand: true }, formats: ['generic', 'moloco'], viewports: [{ name: 'desktop-landscape', width: 1024, height: 500 }] },
  ];
  let ok = true;
  // Finger image data must never ship in the playable (tool default + uploaded).
  const forbid = [defaultHand, png('big-finger.png'), png('mid-finger.png')].filter(Boolean).map(d => d.slice(0, 400));
  const sizes = {};
  for (const v of variants) {
    const files = {};
    for (const f of v.formats) {
      files[f + '/index.html'] = mph(baseHtml, { format: f, toolId, settings: v.settings, orientation: 1, storeUrl: 'https://example.com/app', ctaText: '立即下载', gameName: toolId, autoPlay: !!v.autoPlay, stripDataUrls: defaultHand ? [defaultHand] : [] });
      if (v.id === 'default') sizes[f] = Buffer.byteLength(files[f + '/index.html']);
    }
    const opt = { files, forbidStrings: forbid, expectAutoPlay: !!v.autoPlay, waitEnd: !!v.waitEnd, shotDir: pathx.join(outDir, 'h5_channels'), shotPrefix: toolId + '_' + v.id };
    if (v.viewports) opt.viewports = v.viewports;
    const r = await runChannelSmoke(opt);
    console.log('Channel smoke [' + v.id + ']\n' + formatChannelReport(r));
    if (!r.ok) ok = false;
  }
  for (const [f, b] of Object.entries(sizes)) {
    const lim = (CL[f] && CL[f].mb) || 5;
    if (b > lim * 1048576) { console.error('FAIL', f, 'index.html', (b / 1048576).toFixed(2) + 'MB > ' + lim + 'MB channel limit'); ok = false; }
  }
  return { ok, sizes };
}
