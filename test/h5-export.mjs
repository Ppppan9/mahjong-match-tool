import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildPlayableZip, parseFormats, makePlayableHtml } from '../src/h5/index.js';

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
    settings: { canvasW: 720, canvasH: 1280, h5CtaText: '立即下载' },
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
// Also write under /workspace for convenience
fs.writeFileSync(path.join('/workspace', 'mahjong_h5_sample.zip'), buf);

// Validate zip magic + contain paths via naive scan
const names = [];
// re-parse local file list from our builder by checking makePlayableHtml markers
for (const f of formats) {
  const h = makePlayableHtml(baseHtml, { format: f, toolId: 'mahjong-match-tool', settings: {}, orientation: 1, storeUrl: 'https://example.com/app', ctaText: '立即下载' });
  if (!h.includes('window.__PLAYABLE__')) throw new Error(f + ' missing __PLAYABLE__');
  if (!h.includes('h5-playable-css')) throw new Error(f + ' missing playable css');
  if (f === 'tiktok' && !h.includes('openAppStore')) throw new Error('tiktok CTA shim missing');
  if (f === 'google' && !h.includes('ExitApi')) throw new Error('google ExitApi missing');
  if (f === 'mintegral' && !h.includes('gameEnd')) throw new Error('mintegral install shim missing');
  names.push(f + '/index.html');
}
if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('not a zip');
// Ensure zip contains expected filenames as utf8 substrings in central directory
const asStr = buf.toString('binary');
for (const n of ['README_H5.md', 'tiktok/index.html', 'tiktok/config.json', 'google/index.html', 'mintegral/index.html', 'generic/index.html', 'generic/README.txt']) {
  if (!asStr.includes(n)) throw new Error('zip missing ' + n);
}
console.log('OK', path.basename(out), (buf.length / 1048576).toFixed(2) + 'MB', 'formats=' + r.formats.join('+'), r.warn || '');
for (const [k, v] of Object.entries(r.sizes)) console.log(' ', k, 'html', (v / 1048576).toFixed(2) + 'MB');
