import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildPlayableZip, parseFormats, makePlayableHtml, resolveH5Device, bakeH5DeviceIntoSettings, applyH5DevicePresetToSettings, H5_DEVICE_PRESETS } from '../src/h5/index.js';
import { runResponsiveSmoke, formatSmokeReport } from '../src/h5/responsive-smoke.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
if (!fs.existsSync(htmlPath)) { console.error('missing index.html — run npm run build first'); process.exit(1); }
const baseHtml = fs.readFileSync(htmlPath, 'utf8');
const formats = parseFormats('tiktok,google,mintegral,generic');
const r = await buildPlayableZip({
  toolId: 'mahjong-match-tool',
  formats,
  baseHtml,
  opts: {
    settings: { canvasW: 720, canvasH: 1280, h5CtaText: '立即下载', bgColor: '#000' },
    ctaText: '立即下载',
    storeUrl: 'https://example.com/app',
    gameName: 'mahjong-match-tool',
    orientation: 1,
    autoPlay: true,
    h5MaxMb: 5,
  },
});
const outDir = path.join(root, 'screenshots');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'mahjong_h5_sample.zip');
const buf = Buffer.from(await r.blob.arrayBuffer());
fs.writeFileSync(out, buf);
fs.writeFileSync(path.join('/workspace', 'mahjong_h5_sample.zip'), buf);

for (const f of formats) {
  const h = makePlayableHtml(baseHtml, { format: f, toolId: 'mahjong-match-tool', settings: { canvasW: 720, canvasH: 1280 }, orientation: 1, storeUrl: 'https://example.com/app', ctaText: '立即下载' });
  if (!h.includes('window.__PLAYABLE__')) throw new Error(f + ' missing __PLAYABLE__');
  if (!h.includes('h5-playable-css')) throw new Error(f + ' missing playable css');
  if (!h.includes('viewport-fit=cover')) throw new Error(f + ' missing viewport-fit=cover');
  if (!h.includes('__h5FitStage')) throw new Error(f + ' missing __h5FitStage');
  if (!h.includes('100dvh')) throw new Error(f + ' missing 100dvh');
  if (f === 'tiktok' && !h.includes('openAppStore')) throw new Error('tiktok CTA shim missing');
  if (f === 'google' && !h.includes('ExitApi')) throw new Error('google ExitApi missing');
  if (f === 'mintegral' && !h.includes('gameEnd')) throw new Error('mintegral install shim missing');
}
if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('not a zip');
const asStr = buf.toString('binary');
for (const n of ['README_H5.md', 'tiktok/index.html', 'tiktok/config.json', 'google/index.html', 'mintegral/index.html', 'generic/index.html', 'generic/README.txt']) {
  if (!asStr.includes(n)) throw new Error('zip missing ' + n);
}
const mb = buf.length / 1048576;
if (mb >= 5) throw new Error('sample zip too large: ' + mb.toFixed(2) + 'MB');
console.log('OK', path.basename(out), mb.toFixed(2) + 'MB', 'formats=' + r.formats.join('+'), r.warn || '');
for (const [k, v] of Object.entries(r.sizes)) console.log(' ', k, 'html', (v / 1048576).toFixed(2) + 'MB');




// Device preset bake: non-adaptive locks designW/H + canvas
{
  const S = { h5Device: 'iphone-se', h5DeviceW: 390, h5DeviceH: 844, canvasW: 720, canvasH: 1280 };
  applyH5DevicePresetToSettings(S);
  if (S.h5DeviceW !== 375 || S.h5DeviceH !== 667) throw new Error('preset should set 375x667');
  const baked = bakeH5DeviceIntoSettings(S);
  if (baked.settings.canvasW !== 375 || baked.settings.canvasH !== 667) throw new Error('bake should lock canvas');
  const htmlDev = makePlayableHtml(baseHtml, { format: 'google', toolId: 't', settings: S, orientation: 1, storeUrl: 'https://example.com', ctaText: 'x' });
  if (!htmlDev.includes('"designW":375') || !htmlDev.includes('width=375,height=667')) throw new Error('export html missing device design size');
  const adapt = bakeH5DeviceIntoSettings({ h5Device: 'adaptive', canvasW: 720, canvasH: 1280 });
  if (adapt.settings.canvasW !== 720) throw new Error('adaptive must keep canvas');
  if (!H5_DEVICE_PRESETS.some(p => p.id === 'ipad-pro')) throw new Error('missing presets');
  const proMax = H5_DEVICE_PRESETS.find(p => p.id === 'iphone-14-pro-max');
  if (!proMax || proMax.width !== 430 || proMax.height !== 932) throw new Error('iphone-14-pro-max must be 430x932');
  const fold = H5_DEVICE_PRESETS.find(p => p.id === 'fold-cover');
  if (!fold || fold.width !== 344 || fold.height !== 882) throw new Error('fold-cover must be 344x882');
  const ipad = H5_DEVICE_PRESETS.find(p => p.id === 'ipad-pro');
  if (!ipad || ipad.width !== 1032 || ipad.height !== 1376) throw new Error('ipad-pro must be 1032x1376');
  if (!H5_DEVICE_PRESETS.some(p => p.id === 'iphone-14-plus' && p.width === 428 && p.height === 926)) throw new Error('missing iphone-14-plus 428x926');
  if (!baseHtml.includes('h5Device') || !(baseHtml.includes('预览机型') || baseHtml.includes('\\u9884\\u89C8\\u673A\\u578B'))) throw new Error('built index missing h5Device panel keys — rebuild');
  console.log('Device preset bake OK', resolveH5Device(S).label);
}

// Responsive viewport smoke (generic channel HTML)
const playableHtml = makePlayableHtml(baseHtml, {
  format: 'generic',
  toolId: 'mahjong-match-tool',
  settings: { canvasW: 720, canvasH: 1280, bgColor: '#000' },
  orientation: 1,
  storeUrl: 'https://example.com/app',
  ctaText: '立即下载',
  gameName: 'mahjong-match-tool',
  autoPlay: false,
});
console.log('Responsive smoke…');
const smoke = await runResponsiveSmoke({ html: playableHtml, settleMs: 1200 });
console.log(formatSmokeReport(smoke));
const reportPath = path.join(outDir, 'h5_responsive_smoke.json');
fs.writeFileSync(reportPath, JSON.stringify(smoke, null, 2));
if (!smoke.ok) {
  console.error('FAIL responsive viewport smoke');
  process.exit(1);
}
console.log('Responsive OK', smoke.results.length, 'viewports');

// Per-channel black-stage + console-error + CTA-hook smoke (all channels)
{
  const { runAllChannelChecks } = await import('../src/h5/channel-smoke.mjs');
  const ch = await runAllChannelChecks({ baseHtml, toolId: 'mahjong-match-tool', outDir, fixturesDir: path.join(root, 'src/h5/fixtures'), endSettings: { layers: 2, autoSpeed: 6 }, defaultHand: (fs.existsSync(path.join(root, 'src/default_hand.js')) ? (await import('../src/default_hand.js')).DEFAULT_HAND : '') });
  fs.writeFileSync(path.join(outDir, 'h5_channel_sizes.json'), JSON.stringify(ch.sizes, null, 2));
  if (!ch.ok) { console.error('FAIL channel smoke'); process.exit(1); }
  console.log('Channel smoke OK', Object.entries(ch.sizes).map(([k, v]) => k + '=' + (v / 1048576).toFixed(2) + 'MB').join(' '));
}
