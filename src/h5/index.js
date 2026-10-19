/**
 * Shared H5 playable ad export for 核玩工具.
 * Injects window.__PLAYABLE__, strips editor chrome, wraps channel CTA shims, zips.
 * Playable shell is responsive: contain/letterbox the design stage across phones,
 * tablets, foldables; not fixed to a single 720×1280 CSS box.
 */
import { makeZip } from './zip.js';
import README_H5 from './README_H5.js';

export const ALL_FORMATS = ['tiktok', 'google', 'mintegral', 'generic'];
export const DEFAULT_STORE = 'https://play.google.com/store/apps/details?id=com.example.game';

/** Default design aspect (portrait-first playable). */
export const DESIGN_W = 720;
export const DESIGN_H = 1280;

/** Chrome DevTools–style preview/export device presets (id, label, width, height). */
export const H5_DEVICE_PRESETS = [
  { id: 'adaptive', label: '自适应（全机型，导出推荐）', width: null, height: null },
  { id: 'iphone-se', label: 'iPhone SE · 375×667', width: 375, height: 667 },
  { id: 'iphone-13', label: 'iPhone 12/13 · 390×844', width: 390, height: 844 },
  { id: 'iphone-14-plus', label: 'iPhone 14 Plus · 428×926', width: 428, height: 926 },
  { id: 'iphone-14-pro-max', label: 'iPhone 14 Pro Max · 430×932', width: 430, height: 932 },
  { id: 'pixel-7', label: 'Pixel 7 · 412×915', width: 412, height: 915 },
  { id: 'galaxy-s20', label: 'Galaxy S20 Ultra · 412×915', width: 412, height: 915 },
  { id: 'ipad-mini', label: 'iPad Mini · 768×1024', width: 768, height: 1024 },
  { id: 'ipad-air', label: 'iPad Air · 820×1180', width: 820, height: 1180 },
  { id: 'ipad-pro', label: 'iPad Pro 13 · 1032×1376', width: 1032, height: 1376 },
  { id: 'fold-cover', label: 'Galaxy Z Fold 5 外屏 · 344×882', width: 344, height: 882 },
  { id: 'nest-hub', label: 'Nest Hub / 横屏平板 · 1024×600', width: 1024, height: 600 },
  { id: 'custom', label: '自定义尺寸', width: null, height: null },
];

export function h5DeviceSelectOptions() {
  return H5_DEVICE_PRESETS.map(p => [p.id, p.label]);
}

/**
 * Resolve preview/export device from settings.
 * adaptive → design falls back to canvasW×canvasH (or 720×1280); W/H kept as last values.
 * preset → W/H from map; custom → S.h5DeviceW/H.
 */
export function resolveH5Device(S) {
  const id = (S && S.h5Device) || 'adaptive';
  const preset = H5_DEVICE_PRESETS.find(p => p.id === id) || H5_DEVICE_PRESETS[0];
  let w = S && S.h5DeviceW != null ? +S.h5DeviceW : 390;
  let h = S && S.h5DeviceH != null ? +S.h5DeviceH : 844;
  if (!(w > 0)) w = 390;
  if (!(h > 0)) h = 844;
  if (preset.width && preset.height && id !== 'custom' && id !== 'adaptive') {
    w = preset.width;
    h = preset.height;
  }
  return { id: preset.id, w, h, label: preset.label, adaptive: preset.id === 'adaptive' };
}

/** When selecting a non-adaptive/non-custom preset, write W/H from the map. */
export function applyH5DevicePresetToSettings(S) {
  if (!S || typeof S !== 'object') return resolveH5Device(S);
  const id = S.h5Device || 'adaptive';
  const p = H5_DEVICE_PRESETS.find(x => x.id === id);
  if (p && p.width && p.height) {
    S.h5DeviceW = p.width;
    S.h5DeviceH = p.height;
  }
  return resolveH5Device(S);
}

/** If user edits W/H while a fixed preset is selected, switch to custom. */
export function markH5DeviceCustomIfSizeEdited(S) {
  if (!S || typeof S !== 'object') return;
  const id = S.h5Device || 'adaptive';
  if (id === 'adaptive' || id === 'custom') return;
  const p = H5_DEVICE_PRESETS.find(x => x.id === id);
  if (p && p.width && (+S.h5DeviceW !== p.width || +S.h5DeviceH !== p.height)) {
    S.h5Device = 'custom';
  }
}

/**
 * Bake design size into settings for export.
 * adaptive: keep canvasW/H (or recRes); non-adaptive: lock canvasW/H + recRes to device W×H.
 */
export function bakeH5DeviceIntoSettings(S) {
  const src = S && typeof S === 'object' ? { ...S } : {};
  const device = resolveH5Device(src);
  if (!device.adaptive) {
    src.canvasW = device.w;
    src.canvasH = device.h;
    src.recRes = device.w + 'x' + device.h;
    src.h5DeviceW = device.w;
    src.h5DeviceH = device.h;
  }
  return { settings: src, device };
}

/**
 * Editor-only device frame around #stage. No-op in playable mode (__PLAYABLE__ / .h5-playable).
 */
export function applyEditorDevicePreview(S, { onFit } = {}) {
  if (typeof document === 'undefined') return null;
  if (typeof window !== 'undefined' && window.__PLAYABLE__) return null;
  if (document.documentElement.classList.contains('h5-playable')) return null;
  const wrap = document.getElementById('stageWrap');
  const stage = document.getElementById('stage');
  if (!wrap || !stage) return null;
  const resolved = resolveH5Device(S);
  let style = document.getElementById('h5-editor-device-css');
  if (!style) {
    style = document.createElement('style');
    style.id = 'h5-editor-device-css';
    document.head.appendChild(style);
  }
  if (resolved.adaptive) {
    style.textContent = '';
    wrap.classList.remove('h5-device-preview');
    stage.style.removeProperty('width');
    stage.style.removeProperty('height');
    stage.style.removeProperty('max-width');
    stage.style.removeProperty('max-height');
    stage.style.removeProperty('aspect-ratio');
    if (typeof onFit === 'function') onFit(null);
    return { adaptive: true };
  }
  wrap.classList.add('h5-device-preview');
  const pad = 20;
  const availW = Math.max(40, wrap.clientWidth - pad * 2);
  const availH = Math.max(40, wrap.clientHeight - pad * 2);
  const dw = Math.max(240, Math.min(1440, resolved.w));
  const dh = Math.max(400, Math.min(2560, resolved.h));
  const scale = Math.min(1, availW / dw, availH / dh);
  const cssW = Math.max(1, Math.round(dw * scale));
  const cssH = Math.max(1, Math.round(dh * scale));
  style.textContent = [
    '#stageWrap.h5-device-preview{background:#0a0b0e!important}',
    '#stageWrap.h5-device-preview #stage{',
    '  height:auto!important;width:' + cssW + 'px!important;max-width:none!important;',
    '  max-height:none!important;aspect-ratio:auto!important;',
    '  border:2px solid #6a7384!important;border-radius:12px!important;',
    '  box-shadow:0 0 0 1px rgba(255,255,255,.06),0 14px 42px rgba(0,0,0,.55)!important;',
    '}',
  ].join('\n');
  stage.style.setProperty('width', cssW + 'px');
  stage.style.setProperty('height', cssH + 'px');
  const layout = { adaptive: false, cssW, cssH, deviceW: dw, deviceH: dh, scale, id: resolved.id, label: resolved.label };
  if (typeof onFit === 'function') onFit(layout);
  return layout;
}

export function bindEditorDevicePreview(getS, opts = {}) {
  const fit = () => applyEditorDevicePreview(typeof getS === 'function' ? getS() : getS, opts);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', fit, { passive: true });
    try {
      if (window.visualViewport) window.visualViewport.addEventListener('resize', fit, { passive: true });
    } catch (e) { /* ignore */ }
    window.__h5EditorDeviceFit = fit;
  }
  fit();
  return fit;
}

export function buildH5Readme(device) {
  const base = typeof README_H5 === 'string' ? README_H5 : String(README_H5);
  const d = device || { adaptive: true, id: 'adaptive', label: '自适应', w: DESIGN_W, h: DESIGN_H };
  const block = d.adaptive
    ? [
        '',
        '## 本包目标尺寸',
        '',
        '- **模式**：自适应（全机型 contain/letterbox）',
        '- **设计画幅**：`canvasW×canvasH`（缺省 ' + DESIGN_W + '×' + DESIGN_H + '）',
        '- 在任意手机/平板/折叠屏视口上可玩；壳层等比缩放并 letterbox。',
        '',
      ].join('\n')
    : [
        '',
        '## 本包目标尺寸',
        '',
        '- **目标机型**：' + (d.label || d.id),
        '- **分辨率**：' + d.w + '×' + d.h,
        '- 设计画幅 / 舞台逻辑尺寸已按该分辨率定稿；壳层仍可用 contain 适配略有差异的视口。',
        '- 建议用 Chrome DevTools Device Toolbar 选对应机型或自定义 ' + d.w + '×' + d.h + ' 预览。',
        '',
      ].join('\n');
  return base.trimEnd() + '\n' + block;
}

export function parseFormats(h5Format) {
  if (!h5Format || h5Format === 'all') return [...ALL_FORMATS];
  if (Array.isArray(h5Format)) return h5Format.filter(f => ALL_FORMATS.includes(f));
  const parts = String(h5Format).split(/[,|;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const out = [...new Set(parts.filter(f => ALL_FORMATS.includes(f)))];
  return out.length ? out : [...ALL_FORMATS];
}

/** Slim settings for bake: drop huge dataURLs that bloat the zip; keep small icons. */
export function slimSettings(S, { maxDataUrl = 180000 } = {}) {
  if (!S || typeof S !== 'object') return {};
  const out = {};
  for (const k of Object.keys(S)) {
    const v = S[k];
    if (typeof v === 'string' && v.startsWith('data:') && v.length > maxDataUrl) continue;
    if (k === 'themeStore' && v && typeof v === 'object') continue;
    out[k] = v;
  }
  return out;
}

function escJson(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/-->/g, '--\\>');
}

function ctaShim(format, storeUrl) {
  const url = JSON.stringify(storeUrl || DEFAULT_STORE);
  if (format === 'tiktok') {
    return `function __h5Install(){try{if(typeof window.openAppStore==='function'){window.openAppStore();return;}}catch(e){}try{location.href=${url};}catch(e){}}`;
  }
  if (format === 'google') {
    return `window.ExitApi=window.ExitApi||{exit:function(){try{location.href=${url};}catch(e){}}};function __h5Install(){try{if(window.ExitApi&&typeof ExitApi.exit==='function'){ExitApi.exit();return;}}catch(e){}try{location.href=${url};}catch(e){}}`;
  }
  if (format === 'mintegral') {
    return `function __h5Install(){try{if(typeof window.install==='function'){window.install();return;}}catch(e){}try{if(typeof window.gameEnd==='function'){window.gameEnd();return;}}catch(e){}try{location.href=${url};}catch(e){}}`;
  }
  return `function __h5Install(){try{var u=${url};if(window.open)window.open(u,'_blank');else location.href=u;}catch(e){try{location.href=${url};}catch(x){}}}`;
}

/**
 * Responsive playable shell CSS.
 * Strategy: object-fit style **contain** — stage keeps design aspect, centered in
 * the viewport with letterbox bars (stageWrap bg). Uses dvh + safe-area insets.
 */
function playableCss(bg) {
  const bar = bg || '#000';
  return `<style id="h5-playable-css">
html,body{margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:${bar}!important;
  overscroll-behavior:none;-webkit-text-size-adjust:100%;touch-action:manipulation}
html.h5-playable,body.h5-playable{width:100vw!important;height:100vh!important;height:100dvh!important}
#panel,#panelHead,#panelBody,#migrateBanner{display:none!important}
#app{display:block!important;position:fixed!important;inset:0!important;width:100%!important;height:100%!important;padding:0!important;gap:0!important;margin:0!important;background:${bar}!important}
#stageWrap{position:fixed!important;inset:0!important;display:flex!important;align-items:center!important;justify-content:center!important;
  background:${bar}!important;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)!important;
  box-sizing:border-box!important;overflow:hidden!important}
#stage{display:block!important;position:relative!important;flex:none!important;
  max-width:100%!important;max-height:100%!important;border-radius:0!important;box-shadow:none!important;
  touch-action:none!important;object-fit:contain!important;aspect-ratio:9/16}
#h5-cta{position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;align-items:center;justify-content:center;gap:10px;
  padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));
  background:linear-gradient(transparent,rgba(0,0,0,.78));pointer-events:none;box-sizing:border-box}
#h5-cta button{pointer-events:auto;border:none;border-radius:28px;padding:12px 28px;font:700 16px/1.2 system-ui,"PingFang SC","Microsoft YaHei",sans-serif;
  color:#fff;background:linear-gradient(180deg,#ff7a3c,#ff3d6e);box-shadow:0 6px 20px rgba(255,60,100,.45);cursor:pointer;-webkit-tap-highlight-color:transparent}
#h5-cta button:active{transform:scale(.97)}
#h5-cta .h5-name{color:#fff;font:600 13px/1.2 system-ui,sans-serif;text-shadow:0 1px 4px #000;max-width:36vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#h5-cta img.h5-icon{width:36px;height:36px;border-radius:8px;object-fit:cover;flex:none}
@media (max-height:500px){#h5-cta{padding:6px 12px calc(6px + env(safe-area-inset-bottom,0px))}#h5-cta button{padding:8px 20px;font-size:14px}#h5-cta img.h5-icon{width:28px;height:28px}}
</style>`;
}

/**
 * Inline boot: mount CTA + responsive fitStage (contain) on resize/orientationchange.
 * Exposes window.__h5FitStage / window.__h5StageLayout for tools & tests.
 */
function playableBootScript(payload, format) {
  const shim = ctaShim(format, payload.storeUrl);
  return `<script>
window.__PLAYABLE__=${escJson(payload)};
${shim}
(function(){
  var P=window.__PLAYABLE__||{};
  var CTA_RESERVE=72;
  function designSize(){
    var s=P.settings||{};
    var w=+(P.designW||0), h=+(P.designH||0);
    if(!(w>0&&h>0)){
      w=+(s.canvasW||s.width||0); h=+(s.canvasH||s.height||0);
    }
    if(!(w>0&&h>0) && typeof s.recRes==='string' && /\\d+x\\d+/.test(s.recRes)){
      var p=s.recRes.split('x'); w=+p[0]; h=+p[1];
    }
    if(!(w>0&&h>0)){ w=${DESIGN_W}; h=${DESIGN_H}; }
    var o=P.orientation==null?1:+P.orientation;
    var vw=window.innerWidth||1, vh=window.innerHeight||1;
    /* orientation 2 = landscape creative; 0 = both → follow device, keep gameplay aspect via contain */
    if(o===2 && w<h){ var t=w; w=h; h=t; }
    if(o===0 && vw>vh && w<h){ /* keep design w/h; contain will letterbox — do not swap content */ }
    return {w:w,h:h,o:o,device:P.device||null};
  }
  function availRect(){
    var st=getComputedStyle(document.documentElement);
    var saT=parseFloat(st.getPropertyValue('env(safe-area-inset-top)'))||0;
    var saR=parseFloat(st.getPropertyValue('--sat-r'))||0;
    var saB=parseFloat(st.getPropertyValue('env(safe-area-inset-bottom)'))||0;
    var saL=parseFloat(st.getPropertyValue('--sat-l'))||0;
    /* env() may not parse via getPropertyValue in all engines — fall back to 0; CSS padding still applies */
    var cta=document.getElementById('h5-cta');
    var ctaH=CTA_RESERVE;
    if(cta){ var r=cta.getBoundingClientRect(); if(r.height>0) ctaH=Math.ceil(r.height); }
    var vw=window.innerWidth||document.documentElement.clientWidth||320;
    var vh=window.innerHeight||document.documentElement.clientHeight||480;
    /* Prefer visualViewport when present (mobile browser chrome) */
    try{ if(window.visualViewport){ vw=window.visualViewport.width; vh=window.visualViewport.height; } }catch(e){}
    return {x:0,y:0,w:Math.max(1,vw), h:Math.max(1,vh-ctaH), ctaH:ctaH, vw:vw, vh:vh};
  }
  function fitStage(){
    var stage=document.getElementById('stage');
    if(!stage) return null;
    var d=designSize(), a=availRect();
    var scale=Math.min(a.w/d.w, a.h/d.h);
    if(!(scale>0) || !isFinite(scale)) scale=1;
    var cssW=Math.max(1, Math.floor(d.w*scale));
    var cssH=Math.max(1, Math.floor(d.h*scale));
    stage.style.setProperty('width', cssW+'px', 'important');
    stage.style.setProperty('height', cssH+'px', 'important');
    stage.style.setProperty('max-width', '100%', 'important');
    stage.style.setProperty('max-height', '100%', 'important');
    stage.style.setProperty('aspect-ratio', d.w+' / '+d.h, 'important');
    var layout={designW:d.w,designH:d.h,cssW:cssW,cssH:cssH,scale:scale,orientation:d.o,availW:a.w,availH:a.h,ctaH:a.ctaH,vw:a.vw,vh:a.vh};
    window.__h5StageLayout=layout;
    try{
      var ev=new CustomEvent('h5-playable-resize',{detail:layout});
      window.dispatchEvent(ev);
      if(stage) stage.dispatchEvent(ev);
    }catch(e){}
    return layout;
  }
  window.__h5FitStage=fitStage;
  function mount(){
    if(!document.getElementById('h5-cta')){
      var bar=document.createElement('div'); bar.id='h5-cta';
      if(P.icon){var im=document.createElement('img');im.className='h5-icon';im.alt='';im.src=P.icon;bar.appendChild(im);}
      if(P.gameName){var n=document.createElement('span');n.className='h5-name';n.textContent=P.gameName;bar.appendChild(n);}
      var b=document.createElement('button');b.type='button';b.textContent=P.ctaText||'立即下载';
      b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();__h5Install();});
      bar.appendChild(b);document.body.appendChild(bar);
    }
    var panel=document.getElementById('panel'); if(panel) panel.remove();
    document.documentElement.classList.add('h5-playable');
    document.body.classList.add('h5-playable');
    fitStage();
  }
  var _fitTimer=null;
  function scheduleFit(){ if(_fitTimer) clearTimeout(_fitTimer); _fitTimer=setTimeout(function(){ _fitTimer=null; fitStage(); }, 50); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else mount();
  window.addEventListener('resize', scheduleFit, {passive:true});
  window.addEventListener('orientationchange', function(){ setTimeout(fitStage, 100); setTimeout(fitStage, 350); }, {passive:true});
  try{ if(window.visualViewport){ window.visualViewport.addEventListener('resize', scheduleFit, {passive:true}); window.visualViewport.addEventListener('scroll', scheduleFit, {passive:true}); } }catch(e){}
  /* Late layout after fonts/images */
  setTimeout(fitStage, 0);
  setTimeout(fitStage, 300);
})();
<\/script>`;
}

function channelHeadExtras(format, orientation, design) {
  const o = orientation == null ? 1 : +orientation;
  const dw = design && design.w > 0 ? design.w : DESIGN_W;
  const dh = design && design.h > 0 ? design.h : DESIGN_H;
  const parts = [
    '<meta name="ad.orientation" content="' + (o === 2 ? 'landscape' : o === 0 ? 'both' : 'portrait') + '">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">',
    '<meta name="h5.device" content="' + ((design && design.id) || 'adaptive') + '">',
    '<meta name="h5.design" content="' + dw + 'x' + dh + '">',
  ];
  if (format === 'google') {
    parts.push('<!-- Google Ads HTML5 Playable: call ExitApi.exit() on CTA. Stub provided when ExitApi missing. -->');
    parts.push('<meta name="ad.size" content="width=' + dw + ',height=' + dh + '">');
  }
  if (format === 'tiktok') {
    parts.push('<!-- TikTok/Pangle playable: prefer window.openAppStore() on CTA. Optional SDK script may be injected by network. -->');
  }
  if (format === 'mintegral') {
    parts.push('<!-- Mintegral: window.install() / window.gameEnd() on CTA. -->');
  }
  return parts.join('\n');
}
function letterboxBg(settings) {
  if (!settings || typeof settings !== 'object') return '#000';
  return settings.bgColor || settings.bg || settings.stageBg || '#000';
}

/**
 * Wrap a built tool index.html into a channel-specific playable HTML.
 */
export function makePlayableHtml(baseHtml, opts = {}) {
  const format = opts.format || 'generic';
  const orientation = opts.orientation == null ? 1 : +opts.orientation;
  const baked = bakeH5DeviceIntoSettings(opts.settings || {});
  const device = baked.device;
  const settings = slimSettings(baked.settings);
  let designW, designH;
  if (device.adaptive) {
    designW = +(settings.canvasW || settings.width || 0);
    designH = +(settings.canvasH || settings.height || 0);
    if (!(designW > 0 && designH > 0) && typeof settings.recRes === 'string' && /\d+x\d+/.test(settings.recRes)) {
      const p = settings.recRes.split('x'); designW = +p[0]; designH = +p[1];
    }
    if (!(designW > 0 && designH > 0)) { designW = DESIGN_W; designH = DESIGN_H; }
  } else {
    designW = device.w;
    designH = device.h;
  }
  const payload = {
    toolId: opts.toolId || 'tool',
    format,
    settings,
    ctaText: opts.ctaText || '立即下载',
    storeUrl: opts.storeUrl || DEFAULT_STORE,
    gameName: opts.gameName || '',
    icon: opts.icon || '',
    orientation,
    autoPlay: opts.autoPlay !== false,
    designW,
    designH,
    device: { id: device.id, label: device.label, w: designW, h: designH, adaptive: !!device.adaptive },
  };
  let html = String(baseHtml);
  // Ensure we don't nest playable twice
  html = html.replace(/<script>\s*window\.__PLAYABLE__[\s\S]*?<\/script>/i, '');
  html = html.replace(/<style id="h5-playable-css">[\s\S]*?<\/style>/i, '');
  // Replace any existing viewport with playable one (avoid duplicates)
  html = html.replace(/<meta[^>]+name=["']viewport["'][^>]*>/gi, '');
  const inject = channelHeadExtras(format, orientation, { w: designW, h: designH, id: device.id }) + '\n' + playableCss(letterboxBg(settings)) + '\n' + playableBootScript(payload, format);
  if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, inject + '\n</head>');
  else html = inject + html;
  // Title hint
    const titleExtra = device.adaptive ? '' : (' · ' + designW + '×' + designH);
  html = html.replace(/<title>[^<]*<\/title>/i, '<title>' + (payload.gameName || payload.toolId) + ' · H5试玩' + titleExtra + '</title>');
  return html;
}

export function channelExtraFiles(format, opts = {}) {
  const orientation = opts.orientation == null ? 1 : +opts.orientation;
  const files = [];
  if (format === 'tiktok') {
    files.push({ name: 'config.json', data: JSON.stringify({ playable_orientation: orientation }, null, 2) + '\n' });
  }
  if (format === 'generic') {
    files.push({
      name: 'README.txt',
      data: [
        'Generic offline H5 playable',
        'Open index.html in a browser (preferably via a local static server).',
        'CTA opens: ' + (opts.storeUrl || DEFAULT_STORE),
        'Responsive: stage uses contain/letterbox to fit phones, tablets, foldables.',
        (function(){ var d=resolveH5Device(opts.settings||{}); return d.adaptive
          ? 'Target: adaptive (design canvasW×canvasH).'
          : ('Target device: ' + d.label + ' @ ' + d.w + 'x' + d.h); })(),
        'No ad-network SDK required.',
        '',
      ].join('\n'),
    });
  }
  return files;
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

/**
 * Build one zip with subfolders per format.
 * @returns {{ blob: Blob, name: string, sizes: Record<string,number>, totalBytes: number, formats: string[], warn?: string }}
 */
export async function buildPlayableZip({ toolId, formats, baseHtml, opts = {} }) {
  const fmts = parseFormats(formats);
  const maxMb = +(opts.h5MaxMb || opts.maxMb || 5);
  const deviceInfo = resolveH5Device(opts.settings || {});
  const files = [{ name: 'README_H5.md', data: buildH5Readme(deviceInfo) }];
  const sizes = {};
  const enc = new TextEncoder();
  for (const format of fmts) {
    const html = makePlayableHtml(baseHtml, { ...opts, format, toolId });
    const path = format + '/index.html';
    files.push({ name: path, data: html });
    sizes[format] = enc.encode(html).length;
    for (const extra of channelExtraFiles(format, opts)) {
      files.push({ name: format + '/' + extra.name, data: extra.data });
    }
  }
  const blob = await makeZip(files, { compress: true });
  const totalBytes = blob.size;
  const name = (toolId || 'tool').replace(/[^a-z0-9_-]+/gi, '_') + '_h5_playable_' + stamp() + '.zip';
  let warn;
  if (totalBytes > maxMb * 1048576) warn = 'ZIP 约 ' + (totalBytes / 1048576).toFixed(2) + ' MB，超过 ' + maxMb + ' MB 告警阈值';
  for (const f of fmts) {
    if (sizes[f] > maxMb * 1048576) warn = (warn ? warn + '；' : '') + f + ' 的 index.html 未压缩约 ' + (sizes[f] / 1048576).toFixed(2) + ' MB';
  }
  return { blob, name, sizes, totalBytes, formats: fmts, warn };
}

/**
 * Runtime helper: apply playable chrome + optional settings merge + autoPlay + responsive fit.
 * Call once from main.js after S is loaded.
 * hooks.onResize(layout) — optional; three.js tools can setSize + update camera aspect.
 * @returns {{ active: boolean, autoPlay: boolean, format: string } | null}
 */
export function applyPlayableMode(hooks = {}) {
  const P = typeof window !== 'undefined' ? window.__PLAYABLE__ : null;
  if (!P) return null;
  try {
    document.documentElement.classList.add('h5-playable');
    document.body.classList.add('h5-playable');
    const panel = document.getElementById('panel');
    if (panel) panel.style.display = 'none';
  } catch (e) { /* ignore */ }
  if (P.settings && typeof hooks.applySettings === 'function') {
    try { hooks.applySettings(P.settings); } catch (e) { console.warn('playable settings', e); }
  }
  const runFit = () => {
    let layout = null;
    try { if (typeof window.__h5FitStage === 'function') layout = window.__h5FitStage(); } catch (e) { /* ignore */ }
    if (typeof hooks.onResize === 'function') {
      try { hooks.onResize(layout || window.__h5StageLayout || null); } catch (e) { console.warn('playable onResize', e); }
    }
    return layout;
  };
  try {
    window.addEventListener('h5-playable-resize', (ev) => {
      if (typeof hooks.onResize === 'function') {
        try { hooks.onResize(ev.detail || window.__h5StageLayout || null); } catch (e) { /* ignore */ }
      }
    });
  } catch (e) { /* ignore */ }
  // Defer fit until after first paint / canvas exists
  setTimeout(runFit, 0);
  setTimeout(runFit, 200);
  if (P.autoPlay && typeof hooks.autoPlay === 'function') {
    setTimeout(() => { try { hooks.autoPlay(); } catch (e) { console.warn('playable autoPlay', e); } }, 600);
  }
  return { active: true, autoPlay: !!P.autoPlay, format: P.format || 'generic', fit: runFit };
}

/** Fetch the tool's own built HTML (works on http(s); may fail on file://). */
export async function fetchBaseHtml() {
  const candidates = [];
  try {
    const u = new URL(location.href);
    u.search = ''; u.hash = '';
    candidates.push(u.href);
    if (!u.pathname.endsWith('/') && !u.pathname.endsWith('.html')) candidates.push(u.href.replace(/\/?$/, '/') + 'index.html');
    if (u.pathname.endsWith('/')) candidates.push(u.href + 'index.html');
  } catch { /* ignore */ }
  candidates.push('index.html', './index.html');
  let lastErr;
  for (const href of candidates) {
    try {
      const res = await fetch(href, { cache: 'no-store' });
      if (!res.ok) continue;
      const t = await res.text();
      if (t && t.length > 5000 && /<html/i.test(t) && /<script/i.test(t)) return t;
    } catch (e) { lastErr = e; }
  }
  throw new Error('无法读取工具自身 HTML（请用 http/https 打开后再导出；file:// 不支持）。' + (lastErr ? ' (' + lastErr.message + ')' : ''));
}

export async function exportH5PlayableFromPage({ toolId, S, status, toast } = {}) {
  const say = (m) => { if (status) status(m); if (toast) toast(m); };
  say('正在打包 H5 试玩…');
  const baseHtml = await fetchBaseHtml();
  const formats = parseFormats(S && S.h5Format);
  const r = await buildPlayableZip({
    toolId: toolId || (S && S.app) || 'tool',
    formats,
    baseHtml,
    opts: {
      settings: S,
      ctaText: (S && S.h5CtaText) || '立即下载',
      storeUrl: (S && S.h5StoreUrl) || DEFAULT_STORE,
      gameName: (S && S.h5GameName) || '',
      icon: (S && S.h5Icon) || '',
      orientation: S && S.h5Orientation != null ? +S.h5Orientation : 1,
      autoPlay: !(S && S.h5AutoPlay === false),
      h5MaxMb: (S && S.h5MaxMb) || 5,
    },
  });
  const url = URL.createObjectURL(r.blob);
  const a = document.createElement('a'); a.href = url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove();
  const msg = 'H5 试玩已导出：' + r.name + '（' + (r.totalBytes / 1048576).toFixed(2) + ' MB，渠道 ' + r.formats.join('+') + '）' + (r.warn ? ' ⚠ ' + r.warn : '');
  say(msg);
  if (typeof window !== 'undefined') window.__lastH5Export = r;
  return r;
}

/** Viewport matrix used by npm run test:h5 responsive smoke. */
export const H5_TEST_VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 12/13', width: 390, height: 844 },
  { name: 'iPhone 14 Pro Max', width: 430, height: 932 },
  { name: 'iPad Mini', width: 768, height: 1024 },
  { name: 'iPad Pro 13', width: 1032, height: 1376 },
  { name: 'Galaxy Z Fold 5 cover', width: 344, height: 882 },
  { name: 'Nest Hub / landscape tablet', width: 1024, height: 600 },
];
