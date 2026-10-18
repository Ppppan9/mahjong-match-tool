import * as THREE from 'three';
import { DEFAULTS, SCHEMA } from './settings.js';
import { drawFaceCanvas, roundRect as rr, shade, hexRgb, decoyLetterKeys } from './faces.js';
import { loadFonts, FONT_LOGO, FONT_AR } from './fonts.js';
import { THEMES, THEME_KEYS, themeDefaults } from './themes/index.js';
import { initAudio, sfx, resumeAudio, audioTrack, audioState, SFX_NAMES } from './audio.js';
import { createAERecorder } from './ae/recorder.js';
import { export3D } from './export3d/export3d.js';
import { generateBoard, solve, repairPartition, validatePartition, isTarget, targetIndex, targetChar, mulberry32 } from './board.js';

const LS_KEY = 'mahjongTool.settings.v1';
const SETTINGS_VERSION = 21;
// v1/v2 的旧默认值：本地保存的旧设置若仍是这些旧默认值，则升级为 v3 新默认值（用户手动改过的值保留）
const OLD_DEFAULTS = {
  cameraTilt: [22, 18, 12], tileThick: [0.42, 0.34], baseRatio: [0.6, 0.55, 0.5], tileRatio: [1.22], cornerRadius: [0.12],
  faceColor: ['#f6f3e8'], sideColor: ['#e6e1d0'], baseColor: ['#2e9a4c'], blockedDarken: [0.42], shadowStrength: [0.45],
  introDuration: [1.2], targetColorsCustom: [''], decoyLetters: ['TALXE'], letterColor: ['#1f9a3c'], flyDuration: [420],
  burstDuration: [650], particleColor: ['#3fae3a'], particleColor2: ['#a8e25a'], particleCount: [22], selectScale: [1.15],
};
// v3 的旧默认值（牌面构成/布局取景在 v4 调整）
const OLD_DEFAULTS_V3 = { faceKinds: [20], offsetX: [0.5], boardScale: [0.88], boardOffsetY: [0.05] };
// v4 的旧默认值（配对飞行在 v5 改为飞向画面固定汇合点）
const OLD_DEFAULTS_V4 = { flyDuration: [1100], flyScale: [1.25], letterFlyDuration: [220] };
// v6 默认（居中金字塔、较小的牌）；v7 起默认改回参考视频的同尺寸居中堆叠与取景
const OLD_DEFAULTS_V6 = { insetX: [0.5], insetY: [0.5], boardScale: [0.86], boardOffsetY: [0.068], tileRatio: [1.18], gapY: [0.04] };
// v7 默认（牌身细节/字色/顶栏在 v8 按参考视频逐像素校准）
const OLD_DEFAULTS_V10 = { depthDarken: [0.12], shadowStrength: [0.8], shadowDX: [-0.1], shadowDY: [0.04], boardOffsetY: [0.062], stackGridRef: ['top'], baseCols: [6], insetX: [-1], insetY: [0], rowStagger: [0.5] };
const OLD_DEFAULTS_V9 = { insetX: [0], shadowStrength: [0.5], shadowDX: [-0.07], shadowDY: [0.03] };
const OLD_DEFAULTS_V7 = {
  baseRatio: [0.4], cornerRadius: [0.1], sideColor: ['#deded4'], baseColor: ['#3aa655'], sideRevealX: [0.035], sideRevealY: [0.09],
  targetColorsCustom: ['#1d3f7a,#c62828,#1d4f9e,#2e9a3e,#2e9a3e'], letterColor: ['#c62828'], bgColor: ['#0a0503'], topBarColor: ['#6a2a14'],
};
// v9：用户长期使用在线版，旧存档里可能残留旧版布局/阴影/动画参数（单向错位、层微调、旧汇合点、旧阴影等），
// 导致棋盘偏移、阴影异常。从本地存档升级到 v9 时，这些键一律恢复新默认，并备份旧值、在页面上提示可撤销。
const V9_RESET_KEYS = ['stackMode', 'stackGridRef', 'insetX', 'insetY', 'stackNudgeX', 'stackNudgeY', 'revealCompensate', 'offsetX', 'offsetY', 'shrinkCols', 'shrinkRows', 'altOffset',
  'boardOffsetX', 'boardOffsetY', 'boardScale', 'centerOn', 'cameraTilt', 'cameraOrtho', 'cameraFov', 'sideRevealX', 'sideRevealY', 'shadowStrength', 'shadowDX', 'shadowDY', 'leftShadow', 'leftShadowWidth',
  'tileRatio', 'tileThick', 'baseRatio', 'gapX', 'gapY', 'meetMode', 'meetX', 'meetY', 'arcBend', 'flyScale', 'flyDuration', 'flyEase', 'flyRotate', 'meetGrow', 'burstDuration', 'layers', 'baseCols', 'baseRows'];
let MIGRATED = null;
const LEGACY_STACK = { offsetX: 0.08, offsetY: 0, shrinkCols: 0, shrinkRows: 0 };
let S = loadSettings();
let THEME = THEMES[S.theme] || THEMES.guofeng;
const themeEnv = (extra = {}) => ({ W, H, U, S, VP, th: H * S.topBarHeight, ...extra });
initAudio(() => S);
// 设置迁移：fromStorage=true 表示来自 localStorage（会升级旧默认值）；导入的 JSON 只做安全清理，数值原样保留
function migrate(j, fromStorage = false) {
  j = { ...j };
  // 无效的 handImage（旧版 SVG 默认手等）→ 清空；没有这个键 → 用默认手指
  if ('handImage' in j && (typeof j.handImage !== 'string' || (j.handImage && !/^data:image\/(png|webp|gif|jpe?g);/i.test(j.handImage)))) j.handImage = '';
  if (fromStorage && (j.settingsVersion || 1) < 3) {
    for (const [k, olds] of Object.entries(OLD_DEFAULTS)) if (k in j && olds.some(o => String(o).toLowerCase() === String(j[k]).toLowerCase())) delete j[k];
  }
  if (fromStorage && (j.settingsVersion || 1) < 5) {
    for (const [k, olds] of Object.entries(OLD_DEFAULTS_V4)) if (k in j && olds.some(o => String(o) === String(j[k]))) delete j[k];
  }
  if (fromStorage && (j.settingsVersion || 1) < 4) {
    for (const [k, olds] of Object.entries(OLD_DEFAULTS_V3)) if (k in j && olds.some(o => String(o) === String(j[k]))) delete j[k];
  }
  if ((j.settingsVersion || 1) < 6 && !('stackMode' in j)) {
    // v6 起默认“居中金字塔”堆叠。旧存档若自定义过单向错位/层数递减，或是导入的旧版 JSON（含错位参数），保持旧版单向错位以原样还原
    const custom = ['offsetX', 'offsetY', 'shrinkCols', 'shrinkRows'].some(k => k in j && String(j[k]) !== String(LEGACY_STACK[k])) || ('altOffset' in j && j.altOffset === false);
    if (custom || (!fromStorage && 'offsetX' in j)) j.stackMode = 'offset';
    else if (fromStorage && String(j.boardOffsetX) === '0.005') delete j.boardOffsetX;
  }
  if (fromStorage && (j.settingsVersion || 1) < 7) {
    for (const [k, olds] of Object.entries(OLD_DEFAULTS_V6)) if (k in j && olds.some(o => String(o) === String(j[k]))) delete j[k];
  }
  if (fromStorage && (j.settingsVersion || 1) < 8) {
    for (const [k, olds] of Object.entries(OLD_DEFAULTS_V7)) if (k in j && olds.some(o => String(o).toLowerCase() === String(j[k]).toLowerCase())) delete j[k];
  }
  if (fromStorage && (j.settingsVersion || 1) <= 10) {
    for (const [k, olds] of Object.entries(OLD_DEFAULTS_V10)) if (k in j && olds.some(o => String(o) === String(j[k]))) delete j[k];
  }
  if (fromStorage && (j.settingsVersion || 1) === 9) {
    for (const [k, olds] of Object.entries(OLD_DEFAULTS_V9)) if (k in j && olds.some(o => String(o) === String(j[k]))) delete j[k];
  }
  if (fromStorage && (j.settingsVersion || 1) < 9 && Object.keys(j).length > 1) {
    const changed = V9_RESET_KEYS.filter(k => k in j && String(j[k]) !== String(DEFAULTS[k]));
    if (changed.length) {
      try { localStorage.setItem(LS_KEY + '.backup', JSON.stringify(j)); } catch (e) { }
      MIGRATED = { keys: changed, old: Object.fromEntries(changed.map(k => [k, j[k]])) };
      changed.forEach(k => delete j[k]);
    }
  }
  delete j.shadowOffset;
  // v13：点击反馈改为“按下”效果，默认去掉点击波纹圈与选中描边（参考视频都没有）。
  //  本地旧存档：自定义过波纹参数的保留波纹；其余用新默认。导入的旧 JSON：原样还原旧观感（波纹+描边、无按下）。
  if ((j.settingsVersion || 1) < 13 && Object.keys(j).length > 1) {
    if (fromStorage) {
      const RIP0 = { rippleColor: '#ffe14d', rippleSize: 0.09, rippleWidth: 4, rippleDuration: 450 };
      if (!('tapRipple' in j) && Object.entries(RIP0).some(([k, v]) => k in j && String(j[k]).toLowerCase() !== String(v))) j.tapRipple = true;
    } else {
      for (const [k, v] of Object.entries({ tapRipple: true, selectBorder: true, pressEnabled: false })) if (!(k in j)) j[k] = v;
    }
  }
  // v14：自动通关默认不再自动开始录制。本地旧存档里的 autoRec 一直是旧默认值 true → 改为 false；导入的 JSON 保留其值
  if (fromStorage && (j.settingsVersion || 1) < 14 && j.autoRec === true) j.autoRec = false;
  // v15：碰撞粒子按参考重做。本地旧存档里仍是旧默认值的粒子参数 → 用新默认（主题各自的默认）；自定义值与导入的 JSON 保留
  if (fromStorage && (j.settingsVersion || 1) < 15) {
    const OLD_P = { particleColor: ['#2e7d32', '#a8102f'], particleColor2: ['#7cc576', '#ff8fa6'], particleCount: [12, 14], particleSize: [1.4, 1], particleSpeed: [1] };
    const clean = o => { if (o) for (const [k, olds] of Object.entries(OLD_P)) if (k in o && olds.some(v => String(v).toLowerCase() === String(o[k]).toLowerCase())) delete o[k]; };
    clean(j); if (j.themeStore && typeof j.themeStore === 'object') Object.values(j.themeStore).forEach(clean);
  }
  // v17：新增手指避让与消除动画图层顺序设置；新键直接取默认值（DEFAULTS 合并），自定义/导入值原样保留，无需改写旧键
  // v18：手指避让默认改为关。本地存档若仍是旧默认 handAvoid===true → 改为 false；导入的 JSON 原样保留
  if (fromStorage && (j.settingsVersion || 1) < 18 && j.handAvoid === true) j.handAvoid = false;
  // v19：新增 endCardHand（默认 false）。新键取 DEFAULTS；自定义/导入值原样保留，无需改写旧键
  // v20：新增 3D 动画导出设置（export3dFps / export3dParticles / export3dHand）。只补默认值，旧键原样保留
  // v21：新增 hideCursor（手指出现时隐藏鼠标，默认开）。只补默认值
  // v16（v15.2）：默认设置改为用户导出的配置（中东风主题、seed 20261980、8 层、飞行 400ms/弧度 0.7/sine、用户上传的手指 PNG 与指尖锚点）。
  // 本地旧存档里仍是旧默认值的键 → 删除以取新默认；改过的值保留；导入的 JSON 原样保留
  if (fromStorage && (j.settingsVersion || 1) < 16 && Object.keys(j).length > 1) {
    const OLD16 = { seed: 20261011, layers: 3, flyDuration: 1050, arcBend: 1, flyEase: 'linear', handImage: '', handAnchorX: 0.49, handAnchorY: 0.03 };
    for (const [k, v] of Object.entries(OLD16)) if (k in j && String(j[k]) === String(v)) delete j[k];
    // 主题仍是旧默认“国风”且国风外观一个都没改过 → 换成新默认主题
    if (j.theme === 'guofeng' && !Object.keys(j.themeStore || {}).some(t => Object.keys(j.themeStore[t] || {}).length)) {
      const gd = themeDefaults(DEFAULTS, 'guofeng');
      if (THEME_KEYS.every(k => !(k in j) || JSON.stringify(j[k]) === JSON.stringify(gd[k]))) { for (const k of THEME_KEYS) delete j[k]; j.theme = DEFAULTS.theme; }
    }
  }
  // v12：主题。旧存档没有 theme → 国风（外观设置原样保留）；全新（空）存档 → 默认主题
  if (!j.theme || !THEMES[j.theme]) j.theme = Object.keys(j).length === 0 ? DEFAULTS.theme : 'guofeng';
  if (!j.themeStore || typeof j.themeStore !== 'object' || Array.isArray(j.themeStore)) j.themeStore = {};
  j.settingsVersion = SETTINGS_VERSION;
  return j;
}
function loadSettings() {
  try { const j = migrate(JSON.parse(localStorage.getItem(LS_KEY) || '{}'), true); return { ...DEFAULTS, ...themeDefaults(DEFAULTS, j.theme), ...j }; } catch (e) { return { ...DEFAULTS, ...themeDefaults(DEFAULTS, DEFAULTS.theme) }; }
}
let saveTimer = 0;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { toast('本地保存失败（图片可能过大），请用“导出设置”保存'); }
  }, 300);
}
// 关闭/刷新页面前立即写入（防抖定时器可能还没触发）
window.addEventListener('pagehide', () => { if (!saveTimer) return; clearTimeout(saveTimer); try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { } });

// ---------------- DOM ----------------
const $ = s => document.querySelector(s);
const canvas = $('#stage');
let ctx = canvas.getContext('2d'); // 导出 AE 素材时会临时切换到离屏画布
let W = 720, H = 1280, U = 1;
const glCanvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const perspCam = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
let camera = perspCam;
scene.add(new THREE.AmbientLight(0xffffff, 1.15));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(-0.4, -0.9, 1.6);
scene.add(dirLight);
let boardGroup = new THREE.Group();
scene.add(boardGroup);
const raycaster = new THREE.Raycaster();

// ---------------- Images ----------------
const IMG = {};
function loadImg(key) {
  const src = S[key];
  if (!src) { IMG[key] = null; if (key === 'handImage') { drawHandPreview(); updateCursor(); } return; }
  const im = new Image();
  im.onload = () => { if (S[key] !== src) return; IMG[key] = im; if (key === 'handImage') { drawHandPreview(); updateCursor(); } };
  im.src = src;
}
// 有上传手指且开启“手动时显示手指”时，隐藏系统光标，用手指图片当光标
// 手指出现在画面上时隐藏系统鼠标（hideCursor，三个工具统一）：手动游玩手指跟随指针（指尖锚点 = 指针位置）/ 自动通关手指可见时；结束页隐藏手指时恢复鼠标
function handCursorHidden() { return !!(S.hideCursor && IMG.handImage && !endCardHidesHand() && (AUTO.running ? HAND.visible : S.manualHand)); }
function updateCursor() { const c = handCursorHidden() ? 'none' : 'pointer'; if (canvas.style.cursor !== c) canvas.style.cursor = c; }
['bgImage', 'logoImage', 'endIcon', 'handImage'].forEach(loadImg);

// ---------------- Layout ----------------
function setResolution() {
  const [w, h] = S.recRes.split('x').map(Number);
  W = w; H = h; U = W / 720;
  canvas.width = W; canvas.height = H;
  layoutViewport();
}
let VP = { x: 0, y: 0, w: 1, h: 1 };
function layoutViewport() {
  const top = Math.round(H * S.topBarHeight + H * 0.012);
  const bottom = Math.round(H * (1 - 0.035));
  VP = { x: 0, y: top, w: W, h: bottom - top };
  renderer.setSize(VP.w, VP.h, false);
  fitCamera();
}

// ---------------- Game state ----------------
let G = null;
let BOUNDS = null;
const faceCache = new Map();
const texCache = new Map();
function targetColorFor(k) {
  const list = (S.targetColorsCustom || '').split(/[,，\s]+/).filter(s => /^#?[0-9a-f]{3,6}$/i.test(s));
  const idx = targetIndex(k);
  if (list.length) return (list[idx % list.length].startsWith('#') ? '' : '#') + list[idx % list.length];
  return S.targetColor;
}
function faceCanvas(key) {
  if (!faceCache.has(key)) {
    const fw = 192, fh = Math.round(192 * S.tileRatio);
    const k2 = isTarget(key) ? 'T' + targetChar(key) : key;
    faceCache.set(key, drawFaceCanvas(S, k2, fw, fh, isTarget(key) ? targetColorFor(key) : null, THEME));
  }
  return faceCache.get(key);
}
// 选中/飞行时的牌面：左下角向右上渐变的绿色覆盖（视频同款）
function faceCanvasSel(key) {
  const ck = key + '#sel';
  if (!faceCache.has(ck)) {
    const src = faceCanvas(key);
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    const tint = hexRgb(S.selectTint);
    const gr = g.createLinearGradient(0, c.height, c.width * 0.85, c.height * 0.15);
    gr.addColorStop(0, `rgba(${tint.join(',')},0.9)`); gr.addColorStop(0.45, `rgba(${tint.join(',')},0.4)`); gr.addColorStop(1, `rgba(${tint.join(',')},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    if (S.selectBorder) { // 旧版的绿色描边“框”（参考视频没有，默认关闭）
      g.strokeStyle = shade(S.selectTint, 0.8); g.lineWidth = c.width * 0.035;
      rr(g, g.lineWidth / 2, g.lineWidth / 2, c.width - g.lineWidth, c.height - g.lineWidth, S.cornerRadius * c.width * 0.9); g.stroke();
    }
    faceCache.set(ck, c);
  }
  return faceCache.get(ck);
}
function faceTexture(key) {
  if (!texCache.has(key)) {
    const t = new THREE.CanvasTexture(key.endsWith('#sel') ? faceCanvasSel(key.slice(0, -4)) : faceCanvas(key));
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    texCache.set(key, t);
  }
  return texCache.get(key);
}
function clearFaceCache() { faceCache.clear(); texCache.forEach(t => t.dispose()); texCache.clear(); }

function newGame(keepSeed = true) {
  if (!keepSeed) { S.seed = (S.seed + 1 + Math.floor(Math.random() * 1000)) >>> 0; saveSettings(); syncPanel(); }
  stopAuto(true);
  let b;
  try { b = generateBoard(S); } catch (e) { toast(e.message); console.warn(e); return; }
  clearFaceCache();
  G = {
    tiles: b.tiles.map(t => ({ ...t, state: 'board', dark: 0 })),
    word: b.word, order: b.order, tw: b.tw, th: b.th, letterPairs: b.letterPairs, letterLogical: 0, winT: 0,
    selected: [], tray: new Array(S.slotCount).fill(null), sprites: [], particles: [], ripples: [], flashes: [], seams: [], shake: null,
    cleared: false, clearT: 0, wordDoneT: 0, introT0: performance.now(), touched: false, letterCount: 0,
  };
  computeBounds();
  buildMeshes();
  refreshDark(true);
  fitCamera();
  updateStatus();
}
// 2.5D 侧面露出：对棋盘做剪切变换，高度 z 越高越向左上偏移，使牌的右/下侧面和绿色底座在纯俯视下可见
function shearK() {
  const th = Math.max(0.01, S.tileThick), tw = G ? G.tw : 1;
  return { kx: S.sideRevealX * tw / th, ky: S.sideRevealY * tw / th };
}
// 居中模式下抵消 2.5D 侧面剪切带来的“每层向左上偏移”，让各层牌面在屏幕上真正以同一中心堆叠
// v10：不再把层间错位完全抵消（那样各层牌面完全重合，看不出哪张在第几层）。参考视频里每低一层，
// 牌面在屏幕上向右下错开约 0.045 / 0.075 牌宽。以最高层为基准（最高层位置不变，取景/居中不受影响）。
function layerComp(L) {
  if (S.stackMode === 'offset' || !S.revealCompensate) return { x: 0, y: 0 };
  const tw = G ? G.tw : 1, d = L - (BOUNDS ? BOUNDS.maxL : 0);
  // 金字塔 + ringBalance：每层外圈在屏幕上左右/上下等宽，各层（牌面+侧面）以同一中心叠放；
  // 2.5D 的立体感由每张上层牌压在下层边圈上的白色侧面/绿色底边、阴影和逐层变暗体现
  const bal = S.ringBalance && ((S.insetX || 0) > 0 || (S.insetY || 0) > 0);
  const ox = bal ? 0 : (S.layerOffsetX || 0), oy = bal ? 0 : (S.layerOffsetY || 0);
  return { x: d * tw * (S.sideRevealX - ox), y: -d * tw * (S.sideRevealY - oy) };
}
const wX = t => t.x + layerComp(t.layer).x, wY = t => t.y + layerComp(t.layer).y;
function applyShear() {
  if (G) for (const t of G.tiles) if (t.obj) { t.obj.position.set(wX(t), wY(t), t.layer * S.tileThick); t.obj.userData.base = { x: t.obj.position.x, y: t.obj.position.y, z: t.obj.position.z }; applyPress(t); }
  const { kx, ky } = shearK();
  boardGroup.matrixAutoUpdate = false;
  boardGroup.matrix.set(1, 0, -kx, 0, 0, 1, ky, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  boardGroup.matrixWorldNeedsUpdate = true;
}
function computeBounds() {
  let maxL = 0; for (const t of G.tiles) maxL = Math.max(maxL, t.layer);
  BOUNDS = { maxL };
}
function shearedBounds(topOnly = false) {
  const { kx, ky } = shearK();
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const t of G.tiles) if (!topOnly || t.layer === BOUNDS.maxL) for (const z of [t.layer * S.tileThick, (t.layer + 1) * S.tileThick]) {
    const x = wX(t) - kx * z, y = wY(t) + ky * z;
    minx = Math.min(minx, x - G.tw / 2); maxx = Math.max(maxx, x + G.tw / 2); miny = Math.min(miny, y - G.th / 2); maxy = Math.max(maxy, y + G.th / 2);
  }
  return { minx, maxx, miny, maxy };
}
function topFaceBounds() {
  const { kx } = shearK(), L = BOUNDS.maxL; let minx = 1e9, maxx = -1e9;
  for (const t of G.tiles) if (t.layer === L) { const x = wX(t) - kx * (L + 1) * S.tileThick; minx = Math.min(minx, x - G.tw / 2); maxx = Math.max(maxx, x + G.tw / 2); }
  return maxx > minx ? { minx, maxx } : null;
}
function fitCamera() {
  if (!BOUNDS || !G) return;
  // 取景以最高层（牌面+侧面）为准，下层只是在其下方露出一点时不改变顶层的取景；下层明显更大（金字塔）时用全部
  const ball = shearedBounds(), btop = shearedBounds(true), tw = G.tw;
  const b = S.centerOn !== 'all' && ball.minx > btop.minx - 0.3 * tw && ball.maxx < btop.maxx + 0.3 * tw && ball.miny > btop.miny - 0.3 * tw && ball.maxy < btop.maxy + 0.3 * tw ? btop : ball;
  let cx = (b.minx + b.maxx) / 2; const cy = (b.miny + b.maxy) / 2;
  // 水平居中：默认以“最高层牌面”在屏幕上的实际范围居中（不含向右露出的侧面/底座），保证顶层严格位于画面正中
  if (S.centerOn !== 'all') { const tb = topFaceBounds(); if (tb) cx = (tb.minx + tb.maxx) / 2; }
  const tilt = S.cameraTilt * Math.PI / 180;
  const zr = S.tileThick * (BOUNDS.maxL + 1);
  const bw = b.maxx - b.minx, bh = (b.maxy - b.miny) * Math.cos(tilt) + zr * Math.sin(tilt);
  const aspect = VP.w / VP.h;
  const ty = cy + S.boardOffsetY * bh;
  const tx = cx - (S.boardOffsetX || 0) * bw;
  if (S.cameraOrtho) {
    camera = orthoCam;
    const halfH = Math.max(bh / 2, bw / 2 / aspect) / S.boardScale;
    orthoCam.left = -halfH * aspect; orthoCam.right = halfH * aspect; orthoCam.top = halfH; orthoCam.bottom = -halfH;
    const d = 100;
    orthoCam.position.set(tx, ty - d * Math.sin(tilt), d * Math.cos(tilt));
    orthoCam.up.set(0, 1, 0); orthoCam.lookAt(tx, ty, 0);
    orthoCam.near = 1; orthoCam.far = d * 2 + 50;
    orthoCam.updateProjectionMatrix();
  } else {
    camera = perspCam;
    perspCam.fov = S.cameraFov; perspCam.aspect = aspect;
    const t = Math.tan(S.cameraFov * Math.PI / 360);
    let d = Math.max((bh / 2) / t, (bw / 2) / (t * aspect)) / S.boardScale + zr;
    perspCam.position.set(tx, ty - d * Math.sin(tilt), d * Math.cos(tilt));
    perspCam.up.set(0, 1, 0); perspCam.lookAt(tx, ty, 0);
    perspCam.near = Math.max(0.1, d * 0.2); perspCam.far = d * 4;
    perspCam.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
}

let shadowTex = null;
function makeShadowTex() {
  // 上层牌投到下层牌面上的柔和阴影（同层邻牌牌面更高，会挡住它；所以只在下层牌上看得见）
  const sp = Math.max(0.2, S.shadowSpread ?? 1), ex = 1 + 0.42 * sp, ey = 1 + 0.36 * sp;
  const c = document.createElement('canvas'); c.width = 128; c.height = Math.round(128 * S.tileRatio * ey / ex);
  const g = c.getContext('2d'), cw = 128 / ex, ch = c.height / ey, px = (128 - cw) / 2, py = (c.height - ch) / 2;
  g.filter = `blur(${Math.max(2, Math.min(px, py) * 0.45).toFixed(1)}px)`;
  g.fillStyle = '#000';
  rr(g, px, py, cw, ch, 14); g.fill();
  const t = new THREE.CanvasTexture(c); return t;
}
let leftShadowTex = null;
function makeLeftShadowTex() {
  // 柔和的接触阴影：横向按平方曲线渐暗（贴近牌边最深），上下两端也淡出，避免出现生硬的长方形色带
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'), img = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const u = x / 63, v = Math.min(1, Math.min(y, 63 - y) / 12);
    const a = Math.pow(u, 2.2) * (v * v * (3 - 2 * v));
    img.data[(y * 64 + x) * 4 + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); return t;
}
// 侧面颜色渐变：f=0 牌面边缘，f=1 牌底
function sideGrad(f) {
  const slab = 1 - S.baseRatio;
  if (f <= slab) return mixHex(S.sideColor, shade(S.sideColor, S.sideShade ?? 0.72), slab > 0 ? f / slab : 1);
  const u = (f - slab) / Math.max(1e-6, S.baseRatio);
  return mixHex(S.baseColor, S.baseColorDark || S.baseColor, Math.pow(u, 1.15));
}
function mixHex(a, b, t) {
  const pa = toRgb(a), pb = toRgb(b);
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}
function toRgb(c) { const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(c); return m ? [+m[1], +m[2], +m[3]] : hexRgb(c); }
function roundedShape(w, h, r) {
  r = Math.min(r, w * 0.45, h * 0.45);
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function makeBodyGeo(shape, thick) {
  const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 6, steps: 12 });
  const pos = bodyGeo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.setStyle(sideGrad(1 - pos.getZ(i) / thick)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return bodyGeo;
}
// v20：3D 导出用的牌几何/参数（与 buildMeshes 同一套尺寸、颜色）
function tile3D() {
  const tw = G.tw, th = G.th, thick = S.tileThick, shSp = Math.max(0.2, S.shadowSpread ?? 1), lsw = Math.max(0.001, S.leftShadowWidth) * tw;
  return {
    bodyGeo: makeBodyGeo(roundedShape(tw * 0.995, th * 0.995, S.cornerRadius), thick), tw, th, thick, selectTint: S.selectTint,
    shadow: { canvas: shadowTex.image, w: tw * (1 + 0.42 * shSp), h: th * (1 + 0.36 * shSp), dx: S.shadowDX * tw, dy: -S.shadowDY * tw, opacity: S.shadowStrength },
    band: S.leftShadow > 0 ? { canvas: leftShadowTex.image, w: lsw, h: th * 0.97, x: -tw * 0.4975 - lsw / 2 + tw * 0.01, opacity: S.leftShadow } : null,
  };
}
// 牌顶 → 牌底在屏幕上的偏移（px），即 2.5D 剪切露出侧面的量
function tileShear() {
  const t = G.tiles[0], a = project(wX(t), wY(t), (t.layer + 1) * S.tileThick), b = project(wX(t), wY(t), t.layer * S.tileThick);
  return { dx: b.x - a.x, dy: b.y - a.y };
}
function buildMeshes() {
  boardGroup.traverse(o => { if (o.isMesh) { o.material.dispose(); } });
  scene.remove(boardGroup);
  boardGroup = new THREE.Group(); scene.add(boardGroup);
  applyShear();
  if (shadowTex) shadowTex.dispose();
  shadowTex = makeShadowTex();
  if (leftShadowTex) leftShadowTex.dispose();
  leftShadowTex = makeLeftShadowTex();
  const tw = G.tw, th = G.th, thick = S.tileThick;
  const shape = roundedShape(tw * 0.995, th * 0.995, S.cornerRadius);
  // 牌身：一体挤出，按高度上顶点色渐变（牌面边缘白→灰→浅绿底座→深绿），与参考视频的侧面/底座过渡一致
  const bodyGeo = makeBodyGeo(shape, thick);
  const faceGeo = new THREE.PlaneGeometry(tw * 0.995, th * 0.995); faceGeo.translate(0, 0, thick + 0.003);
  const shSp = Math.max(0.2, S.shadowSpread ?? 1), shGeo = new THREE.PlaneGeometry(tw * (1 + 0.42 * shSp), th * (1 + 0.36 * shSp));
  // 向左投在相邻牌面上的柔和阴影（参考视频每张牌左侧邻牌的右缘都有一条渐暗带）
  const lsw = Math.max(0.001, S.leftShadowWidth) * tw;
  const lsGeo = new THREE.PlaneGeometry(lsw, th * 0.97); lsGeo.translate(-tw * 0.4975 - lsw / 2 + tw * 0.01, 0, thick + 0.006);
  for (const t of G.tiles) {
    const g = new THREE.Group();
    g.position.set(wX(t), wY(t), t.layer * thick); g.userData.base = { x: g.position.x, y: g.position.y, z: g.position.z };
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    const face = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ map: faceTexture(t.key), alphaTest: 0.5 }));
    const sh = new THREE.Mesh(shGeo, new THREE.MeshBasicMaterial({ color: 0x000000, map: shadowTex, transparent: true, opacity: S.shadowStrength, depthWrite: false }));
    sh.position.set(S.shadowDX * tw, -S.shadowDY * tw, 0.004);
    sh.renderOrder = 1;
    body.userData.tile = face.userData.tile = t;
    g.add(body, face, sh);
    if (S.leftShadow > 0) {
      const ls = new THREE.Mesh(lsGeo, new THREE.MeshBasicMaterial({ color: 0x000000, map: leftShadowTex, transparent: true, opacity: S.leftShadow, depthWrite: false }));
      ls.renderOrder = 2; g.add(ls);
    }
    g.visible = t.state === 'board' && layerVisible(t);
    t.obj = g; t.mBase = t.mSlab = body.material; t.mFace = face.material; t.pick = [body, face];
    if (t.state !== 'selected') t.press = 0; applyPress(t);
    boardGroup.add(g);
  }
  refreshDark(true);
}
function aliveOnBoard(t) { return t.state === 'board' || t.state === 'selected'; }
function isFree(t) { return aliveOnBoard(t) && t.coveredBy.every(j => !aliveOnBoard(G.tiles[j])); }
function refreshDark(instant) {
  const top = BOUNDS ? BOUNDS.maxL : 0;
  for (const t of G.tiles) {
    // 每低一层固定变暗一点（参考里露出的下层牌比顶层牌面暗 ~5%），被压住的再叠加 blockedDarken
    const dd = 1 - Math.pow(1 - Math.min(0.9, S.depthDarken || 0), top - t.layer); // 逐层相乘，层数多时最底层也不会全黑
    t.darkTarget = 1 - (1 - dd) * (1 - (isFree(t) ? 0 : S.blockedDarken)); if (instant) t.dark = t.darkTarget;
  }
  applyDark();
}
const _c = new THREE.Color();
const LAYER_TINTS = ['#ff7a7a', '#7ad67a', '#7aa8ff', '#ffd25a', '#d67aff', '#5ae0e0', '#ffa65a', '#bbbbbb'];
function layerVisible(t) { return S.layerDebug !== 'only' || S.layerOnly < 0 || t.layer === S.layerOnly; }
function applyDark() {
  for (const t of G.tiles) {
    if (!t.mFace) continue;
    const f = (1 - t.dark) * (1 - (S.pressDarken || 0) * Math.max(0, Math.min(1, t.press || 0))), sel = t.state === 'selected' && t.tintOn !== false;
    const map = faceTexture(sel ? t.key + '#sel' : t.key);
    if (t.mFace.map !== map) { t.mFace.map = map; t.mFace.needsUpdate = true; }
    t.mFace.color.setRGB(f, f, f);
    if (sel) t.mSlab.color.set(S.selectTint).multiplyScalar(f); else t.mSlab.color.setRGB(f, f, f);
    if (S.layerDebug === 'tint') { const c = LAYER_TINTS[t.layer % LAYER_TINTS.length]; t.mFace.color.multiply(_c.set(c)); t.mSlab.color.multiply(_c.set(c)); }
  }
}

// ---------------- Screen projections ----------------
const _v = new THREE.Vector3();
function project(x, y, z) {
  const { kx, ky } = shearK();
  _v.set(x - kx * z, y + ky * z, z).project(camera);
  return { x: VP.x + (_v.x + 1) / 2 * VP.w, y: VP.y + (1 - _v.y) / 2 * VP.h };
}
function tileScreen(t) {
  const z = (t.layer + 1) * S.tileThick;
  const x = wX(t), y = wY(t);
  const c = project(x, y, z), r = project(x + G.tw / 2, y, z), u = project(x, y + G.th / 2, z);
  return { x: c.x, y: c.y, w: Math.abs(r.x - c.x) * 2, h: Math.abs(u.y - c.y) * 2 };
}
// 按下姿态下牌面的屏幕中心与缩放（飞行起点 / AE 关键帧）
function tileScreenPressed(t, p = t.press || 0) {
  const q = pressPose(t, p), k = t.selS || 1;
  const z = t.layer * S.tileThick + (1 - q.c) * S.tileThick;
  const c = project(wX(t) + q.ox, wY(t) + q.oy, z), c0 = tileScreen(t);
  return { x: c.x, y: c.y, s: q.s * k, dx: c.x - c0.x, dy: c.y - c0.y };
}
function slotRect(i) {
  // 参考：5 格从 x≈0.392W 到 0.958W，格宽≈73/720，高≈87/1280，竖直中心≈0.487×顶栏高
  const n = S.slotCount, topH = H * S.topBarHeight;
  const ax = W * 0.372, aw = W * 0.58;
  let sh = topH * 0.58 * S.slotSize, sw = sh * 0.835;
  let gap = sw * 0.115;
  if (n * (sw + gap) > aw) { sw = aw / n - gap; sh = sw / 0.835; }
  const total = n * sw + (n - 1) * gap;
  const x0 = ax + (aw - total) / 2, cy = topH * 0.487;
  return { x: x0 + i * (sw + gap), y: cy - sh / 2, w: sw, h: sh, cx: x0 + i * (sw + gap) + sw / 2, cy };
}
function slotTileSize(i) {
  const r = slotRect(i); let w = r.w * 0.98, h = w * G.th / G.tw;
  const ry = Math.abs(S.sideRevealY) * w;
  if (h + ry > r.h * 1.0) { const k = r.h * 1.0 / (h + ry); w *= k; h *= k; }
  return { x: r.cx - S.sideRevealX * w / 2, y: r.cy - S.sideRevealY * w / 2, w, h };
}
function boardCenterScreen() { return { x: VP.x + VP.w / 2, y: VP.y + VP.h / 2 }; }

// ---------------- Tweens / sprites ----------------
const tweens = [];
function tween(dur, fn, ease = easeInOut) {
  return new Promise(res => tweens.push({ t0: performance.now(), dur: Math.max(1, dur), fn, ease, res }));
}
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;
const EASES = { linear: t => t, sine: t => 0.5 - 0.5 * Math.cos(Math.PI * t), cubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), out: t => 1 - Math.pow(1 - t, 3), in: t => t * t * t };
const easeBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
const rand = (a, b) => a + Math.random() * (b - a);

function makeSprite(t, from) {
  const sp = { key: t.key, x: from.x, y: from.y, w: from.w, h: from.h, scale: 1, alpha: 1, glow: 0, z: 0, id: t.id, moving: false };
  G.sprites.push(sp); return sp;
}
function removeSprite(sp) { const i = G.sprites.indexOf(sp); if (i >= 0) G.sprites.splice(i, 1); }
function moveSprite(sp, to, dur, ease = easeInOut, arc = 0) {
  const f = { x: sp.x, y: sp.y, w: sp.w, h: sp.h, scale: sp.scale };
  sp.moving = true;
  return tween(dur, k => {
    sp.x = lerp(f.x, to.x, k); sp.y = lerp(f.y, to.y, k) - Math.sin(k * Math.PI) * arc;
    sp.w = lerp(f.w, to.w ?? f.w, k); sp.h = lerp(f.h, to.h ?? f.h, k);
    if (to.scale != null) sp.scale = lerp(f.scale, to.scale, k);
    if (k >= 1) sp.moving = false;
  }, ease);
}

// ---------------- Game actions ----------------
function clickTile(t, fromHand = false) {
  if (!G || G.cleared || !t) return false;
  G.touched = true;
  if (t.state === 'selected') { deselect(t); return true; }
  if (t.state !== 'board' || !isFree(t)) return false;
  if (isTarget(t.key) && !G.letterPairs) return collectLetter(t);
  if (S.trayMode === 'tray') { const j = freeTraySlot(); if (j >= 0) return toTray(t, j); }
  const sel = G.selected.map(id => G.tiles[id]);
  if (sel.length && sel[0].key !== t.key) sel.forEach(deselect);
  select(t);
  if (S.trayMode === 'tray') {
    const tr = G.tray.map((e, i) => e && !e.letter && e.key === t.key ? i : -1).filter(i => i >= 0);
    if (tr.length && G.selected.length + tr.length >= S.matchCount) {
      sfx('Clack');
      tr.slice(0, S.matchCount - G.selected.length).forEach(i => { const e = G.tray[i]; G.tiles[e.id].state = 'gone'; G.tray[i] = null; burstSprite(e.sprite); });
      matchSelected(); return true;
    }
  }
  if (G.selected.length >= S.matchCount) matchSelected();
  return true;
}
// ---------------- 点击按下（参考视频：牌面缩小并向底座下沉，像按钮被按下去；选中期间保持） ----------------
// t.press：0=未按下 1=完全按下（过冲时可略超出 0..1）。3D：整张牌 xy 缩放 pressScale、z 方向压缩 pressSide（牌面随之
// 沿 2.5D 侧面方向向右下移动、露出的侧面变薄），再加 pressOffsetX/Y 的额外偏移
const easeOutBackK = c1 => t => { if (c1 <= 0) return 1 - Math.pow(1 - t, 3); const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function pressPose(t, p = t.press || 0) {
  const s = 1 + (S.pressScale - 1) * p, c = Math.max(-0.5, Math.min(0.95, S.pressSide * p));
  return { s, c, ox: S.pressOffsetX * p * G.tw, oy: -S.pressOffsetY * p * G.th };
}
function applyPress(t) {
  if (!t.obj) return;
  const q = pressPose(t), k = t.selS || 1, b = t.obj.userData.base;
  t.obj.scale.set(q.s * k, q.s * k, 1 - q.c);
  if (b) t.obj.position.set(b.x + q.ox, b.y + q.oy, b.z);
}
function pressTo(t, target) {
  const tok = t.pressTok = (t.pressTok || 0) + 1;
  if (!S.pressEnabled) { t.press = 0; applyPress(t); return; }
  const p0 = t.press || 0, dur = target > p0 ? S.pressDownMs : S.pressReleaseMs, ease = easeOutBackK(S.pressOvershoot || 0);
  if (dur <= 0) { t.press = target; applyPress(t); applyDark(); return; }
  tween(dur, k => { if (t.pressTok !== tok) return; t.press = p0 + (target - p0) * ease(k); applyPress(t); if (S.pressDarken > 0) applyDark(); }, x => x);
}
// 选中：牌留在原位，染上绿色（视频：点击后立即变绿，等待第二张）
function select(t) {
  AE.onTap(t);
  sfx('Tap');
  t.state = 'selected';
  G.selected.push(t.id);
  pressTo(t, 1);
  // 参考：先按下，约 1 帧后才变绿（selectTintDelay）
  if (S.selectTintDelay > 0) { t.tintOn = false; const tok = t.pressTok; tween(S.selectTintDelay, (k, raw) => { if (raw >= 1 && t.pressTok === tok && t.state === 'selected') { t.tintOn = true; applyDark(); } }, x => x); }
  else t.tintOn = true;
  applyDark();
  if (S.selectScale > 1.001) tween(160, k => { const s = 1 + (S.selectScale - 1) * Math.sin(k * Math.PI / 2); if (t.state === 'selected') { t.selS = s; applyPress(t); } }, easeOut);
}
function deselect(t) {
  if (t.state !== 'selected') return;
  t.state = 'board';
  G.selected = G.selected.filter(id => id !== t.id);
  t.selS = 1; pressTo(t, 0); applyPress(t);
  applyDark();
}
const bez3 = (a, b, c, d, k) => { const u = 1 - k; return u * u * u * a + 3 * u * u * k * b + 3 * u * k * k * c + k * k * k * d; };
// 配对：两张牌同时脱离棋盘，放大并先向外侧飞出，再弧线汇合到中间并排，随后绿叶爆开、缩小消失
function matchSelected() {
  const ts = G.selected.map(id => G.tiles[id]); G.selected = [];
  const scr = ts.map(t => tileScreen(t));
  const ps = ts.map(t => tileScreenPressed(t)); // 参考：从按下的姿态直接起飞
  const key = ts[0].key;
  ts.forEach(t => { t.state = 'gone'; t.obj.visible = false; t.pressTok = (t.pressTok || 0) + 1; t.press = 0; t.selS = 1; applyPress(t); });
  if (isTarget(key)) G.letterLogical = (G.letterLogical || 0) + 1;
  refreshDark();
  const n = ts.length;
  const sps = ts.map((t, i) => { const sp = makeSprite(t, { ...scr[i], x: ps[i].x, y: ps[i].y }); sp.scale = ps[i].s; sp.tint = 1; sp.z = 5; sp.moving = true; return sp; });
  sfx('Whoosh', { dur: Math.max(0.25, S.flyDuration / 1000) });
  const w = scr[0].w * S.flyScale, hh = scr[0].h * S.flyScale;
  let mx, my;
  if (S.meetMode === 'pair') { // 旧逻辑：两牌中点并向棋盘中心靠拢
    const bc = boardCenterScreen();
    mx = sps.reduce((a, s) => a + s.x, 0) / n; my = sps.reduce((a, s) => a + s.y, 0) / n;
    mx = lerp(mx, bc.x, S.meetCenterPull); my = lerp(my, bc.y, S.meetCenterPull * 0.5);
    mx = Math.max(w * n / 2 + 8 * U, Math.min(W - w * n / 2 - 8 * U, mx));
    my = Math.max(VP.y + hh, Math.min(VP.y + VP.h - hh, my));
  } else { // 参考视频：无论牌在哪，都飞到画面固定位置（默认画面中部偏下）并排消除
    mx = VP.x + VP.w * S.meetX; my = VP.y + VP.h * S.meetY;
  }
  // v16：中央碰撞区（自动通关时手指需避开）。持续到碰撞+爆开结束
  const zt = performance.now();
  G.clearZone = { x: mx, y: my, t0: zt, until: zt + S.flyDuration + S.burstDuration + (S.handAvoidHold || 0), w: w * n };
  const order = sps.map((s, i) => i).sort((a, b) => sps[a].x - sps[b].x);
  const ease = EASES[S.flyEase] || EASES.sine;
  const flights = order.map((si, rank) => {
    const sp = sps[si];
    sp.z = 5 + rank * 0.01; // 参考：右边那张压在左边那张上
    const tx = mx + (rank - (n - 1) / 2) * w, ty = my;
    const side = n === 1 ? (sp.x < mx ? -1 : 1) : rank < (n - 1) / 2 ? -1 : rank > (n - 1) / 2 ? 1 : 0;
    const p0 = { x: sp.x, y: sp.y };
    let p1, p2;
    if (S.meetMode === 'pair') {
      const D = S.outwardAmount * scr[0].w, clampX = x => Math.max(w * 0.45, Math.min(W - w * 0.45, x));
      let ax = sp.x - mx, ay = (sp.y - my) * 0.5; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
      if (Math.abs(ax) < 0.4) ax = (side || 1) * 0.6;
      p1 = { x: clampX(sp.x + ax * D * 1.3), y: sp.y + ay * D * 0.8 }; p2 = { x: clampX(tx + (side || 1) * D), y: ty };
    } else {
      // 弧线：先水平冲向自己一侧的屏幕边缘（略向上、可略出屏），沿边缘转向汇合点高度，再收进中间
      const edge = side < 0 ? -W * 0.05 : side > 0 ? W * 1.05 : sp.x;
      const ex = sp.x + (edge - sp.x) * S.arcBend;
      p1 = { x: ex, y: sp.y - H * 0.03 * S.arcBend }; p2 = { x: ex, y: ty };
    }
    const p3 = { x: tx, y: ty };
    const w0 = sp.w, h0 = sp.h, s0 = sp.scale;
    return tween(S.flyDuration, (k, raw) => {
      sp.x = bez3(p0.x, p1.x, p2.x, p3.x, k); sp.y = bez3(p0.y, p1.y, p2.y, p3.y, k);
      const u = raw ?? k; // 放大按真实时间走：前段长得快，接近汇合时已到最大
      sp.scale = s0 + (S.flyScale - s0) * (1 - (1 - u) * (1 - u));
      sp.rot = S.flyRotate * Math.sin(Math.PI * k) * (side || 1);
      sp.w = w0; sp.h = h0;
    }, ease);
  });
  Promise.all(flights).then(() => burstPair(sps, mx, my, key, w));
  updateStatus();
}
async function burstPair(sps, mx, my, key, w) {
  // 碰撞瞬间：咔嗒声 + 接缝闪光 + 树叶从接触点爆开；两张牌轻微挤压后各自回弹再贴合（参考里两牌是“啪”地贴住，右牌压左牌）
  sfx('Clack'); sfx('Burst', { delay: 0.05 });
  const n = sps.length, hh = sps[0].h * sps[0].scale;
  if (S.impactFlash > 0) for (let i = 1; i < n; i++) G.seams.push({ x: mx + (i - n / 2) * w, y: my, h: hh, w, t0: performance.now(), a: S.impactFlash });
  if (S.impactShake > 0) G.shake = { t0: performance.now(), amp: S.impactShake * U };
  if (S.decoyParticles || isTarget(key) || !decoyLetterKeys(S).includes(key)) spawnParticles(mx, my, w * n / 2, true, 1, w); // 参考：干扰字母（T）消除时没有树叶
  const b = S.burstDuration;
  const s0 = sps.map(s => s.scale), x0 = sps.map(s => s.x);
  const order = sps.map((s, i) => i).sort((p, q) => x0[p] - x0[q]);
  const side = []; order.forEach((si, rank) => { side[si] = n === 1 ? 0 : (rank - (n - 1) / 2) / ((n - 1) / 2); });
  const imp = Math.min(180, b * 0.3), sq = S.impactSquash, bo = S.impactBounce * w;
  // 汇合后在原地停留并轻微放大（视频约 +4%，0.5 s），碰撞形变叠加在前 ~180 ms
  await tween(b * 0.76, (k, raw) => {
    const tms = raw * b * 0.76, u = Math.min(1, tms / imp);
    const e = u < 1 ? Math.sin(Math.PI * u) * (1 - u * 0.35) : 0; // 0→1→0 的冲击包络
    const settle = u < 1 ? 0 : 0;
    sps.forEach((s, i) => {
      s.scale = s0[i] * (1 + S.meetGrow * k);
      s.sx = 1 - sq * e; s.sy = 1 + sq * 0.6 * e;
      // 先互相挤进去一点（前 35%），再向外回弹（后 65%），最后贴合
      const push = u < 0.35 ? -Math.sin(Math.PI * u / 0.35) * 0.4 : Math.sin(Math.PI * (u - 0.35) / 0.65) * (1 - (u - 0.35) * 0.5);
      s.x = x0[i] + side[i] * bo * (u < 1 ? push : settle);
    });
  }, t => t);
  sps.forEach((s, i) => { s.sx = s.sy = 1; s.x = x0[i]; });
  const s1 = sps.map(s => s.scale);
  await tween(b * 0.24, k => sps.forEach((s, i) => { s.scale = s1[i] * (1 - 0.7 * k); s.alpha = 1 - k; }), easeIn);
  sps.forEach(s => { s.moving = false; removeSprite(s); });
  updateStatus();
  if (isTarget(key) && G.letterPairs) letterToSlot(key, mx, my, w / S.flyScale);
}
function letterToSlot(key, x, y, w) {
  const idx = targetIndex(key);
  if (idx >= S.slotCount) return;
  const sp = { key, x, y, w, h: w * G.th / G.tw, scale: 1, alpha: 1, z: 6, moving: true };
  G.sprites.push(sp);
  const entry = { id: -1, key, sprite: sp, arrived: false, letter: true };
  if (G.tray[idx] && !G.tray[idx].letter) { const j = freeTraySlot(); if (j >= 0 && j !== idx) { G.tray[j] = G.tray[idx]; moveSprite(G.tray[j].sprite, slotTileSize(j), 200); } }
  G.tray[idx] = entry;
  const to = slotTileSize(idx);
  // 视频中字母不从中心飞过去：中心那对缩没的同时，字母直接在托盘格里弹出（带绿叶）。letterFlyDuration>0 时改为飞入
  if (S.letterFlyDuration <= 0) { sp.x = to.x; sp.y = to.y; sp.w = to.w; sp.h = to.h; }
  (S.letterFlyDuration > 0 ? moveSprite(sp, to, S.letterFlyDuration, easeOut) : Promise.resolve()).then(() => {
    entry.arrived = true; sp.z = 0; sp.moving = false;
    sp.scale = 1.35; tween(260, k => { sp.scale = lerp(1.35, 1, k); }, easeBack);
    spawnParticles(to.x, to.y, to.w * 0.6, true, S.slotParticleScale, to.w);
    sfx('Letter');
    G.letterCount++;
    if (G.letterCount >= G.word.length) { G.wordDoneT = performance.now(); sfx('Word', { delay: 0.25 }); }
    updateStatus();
  });
}
function burstSprite(sp) {
  sfx('Burst', { vol: 0.7 });
  spawnParticles(sp.x, sp.y, sp.w * sp.scale * 0.6, true, S.slotParticleScale, sp.w * sp.scale);
  const s0 = sp.scale;
  tween(220, k => { sp.scale = s0 * (1 - 0.5 * k); sp.alpha = 1 - k; if (k >= 1) removeSprite(sp); }, easeIn);
}
function freeTraySlot() {
  const order = [];
  for (let i = 0; i < S.slotCount; i++) if (!G.tray[i]) order.push(i);
  // 优先使用不属于目标字母的格子，其次是靠后的字母格
  order.sort((a, b) => (a >= G.word.length ? -100 : 0) - (b >= G.word.length ? -100 : 0) || b - a);
  return order.length ? order[0] : -1;
}
function toTray(t, j) {
  t.state = 'tray'; t.obj.visible = false;
  const sp = makeSprite(t, tileScreen(t)); sp.z = 3;
  G.tray[j] = { id: t.id, key: t.key, sprite: sp, arrived: false };
  const entry = G.tray[j];
  refreshDark();
  moveSprite(sp, slotTileSize(j), S.flyDuration, easeInOut, H * 0.03).then(() => {
    entry.arrived = true; sp.z = 0; bounce(sp);
    const same = G.tray.map((e, i) => e && e.arrived && !e.letter && e.key === t.key ? i : -1).filter(i => i >= 0);
    if (same.length >= S.matchCount) {
      same.slice(0, S.matchCount).forEach(i => { const e = G.tray[i]; G.tiles[e.id].state = 'gone'; G.tray[i] = null; burstSprite(e.sprite); });
      updateStatus();
    }
  });
  updateStatus();
  return true;
}
function bounce(sp) { const s0 = sp.scale; tween(220, k => { sp.scale = s0 * (1 + Math.sin(k * Math.PI) * 0.12); }, t => t); }
function collectLetter(t) {
  const idx = targetIndex(t.key);
  const occ = G.tray[idx];
  if (occ) {
    if (occ.letter) return false;
    const j = G.tray.findIndex((e, i) => !e && i !== idx && i >= G.word.length) >= 0 ? G.tray.findIndex((e, i) => !e && i >= G.word.length) : G.tray.findIndex((e, i) => !e && i !== idx);
    if (j < 0) { shake(t); return false; }
    G.tray[j] = occ; G.tray[idx] = null;
    moveSprite(occ.sprite, slotTileSize(j), 220);
  }
  t.state = 'gone'; t.obj.visible = false;
  const sp = makeSprite(t, tileScreen(t)); sp.z = 4;
  const entry = { id: t.id, key: t.key, sprite: sp, arrived: false, letter: true };
  G.tray[idx] = entry;
  refreshDark();
  moveSprite(sp, slotTileSize(idx), S.flyDuration * 1.1, easeInOut, H * 0.04).then(() => {
    entry.arrived = true; sp.z = 0; bounce(sp);
    G.letterCount++;
    if (G.letterCount >= G.word.length) G.wordDoneT = performance.now();
  });
  G.letterLogical = (G.letterLogical || 0) + 1;
  updateStatus();
  return true;
}
function shake(t) {
  const x0 = t.obj.position.x;
  tween(300, k => { t.obj.position.x = x0 + Math.sin(k * 30) * 0.05 * (1 - k); }, x => x);
}
// ---------------- 碰撞粒子（v15，按参考视频逐帧实测，见 ref/ANALYSIS.md 第十轮） ----------------
// 国风：约 32 片细长尖叶（柳叶/竹叶形，深绿/中绿/浅黄绿三档双色叶面 + 浅色叶脉 + 一侧高光边），
// 在两牌周围一次性爆出（约 2 帧内全部出现），绕竖直轴旋涡式向外扩散、上扬后下坠，
// 叶片在平面内自转并像翻滚的纸片一样 3D 翻转（scale-x 余弦摆动，经过 0 时只剩一条细线），
// 越往后越小、最后 30% 淡出，寿命约 0.75 s。中东风：金色星形闪光 + 玫瑰花瓣，同一运动模型。
// 绘制：每种外形（m 分 8 档）预渲染成离屏贴图，逐粒子 drawImage（批量贴图，100+ 粒子也保持 60 fps），
// AE 导出用同一贴图做素材、每片一层（位置/旋转/缩放/不透明度关键帧），画面与导出一致。
const LEAF_BUCKETS = 8, LEAF_RES = 100;
const leafSpriteCache = new Map();
const pBucket = () => (Math.floor(Math.random() * LEAF_BUCKETS) + 0.5) / LEAF_BUCKETS;
function particleKind(m) { return THEME.particleKind ? THEME.particleKind(m) : 'leaf'; }
function leafColor(m) {
  const c1 = hexRgb(S.particleColor), c2 = hexRgb(S.particleColor2);
  return `rgb(${c1.map((v, k) => Math.round(lerp(v, c2[k], m))).join(',')})`;
}
function particleSprite(m, back = false) {
  const key = [THEME.id, m, back, S.particleColor, S.particleColor2, S.particleColor3, S.particleAspect, S.particleGlow, S.particleSoft].join('|');
  let c = leafSpriteCache.get(key);
  if (!c) {
    if (leafSpriteCache.size > 64) leafSpriteCache.clear();
    const pad = 1.3; c = document.createElement('canvas'); c.width = c.height = Math.ceil(LEAF_RES * pad * 2);
    const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.scale(2, 2);
    const old = ctx; ctx = g; try { drawParticleShape(LEAF_RES, LEAF_RES * S.particleAspect, back ? shade(rgbToHex(leafColor(m)), 0.78) : leafColor(m), m); } finally { ctx = old; } // back：背面（翻过去的一面）略暗
    leafSpriteCache.set(key, c);
  }
  return c;
}
// size：两牌半宽（云团半径基准），tileW：牌宽（叶长基准）
function spawnParticles(x, y, size, swirl = true, countScale = 1, tileW = size) {
  const n = Math.round(S.particleCount * countScale);
  if (n <= 0) return;
  const dir = Math.random() < 0.5 ? -1 : 1, now = performance.now(), sp = S.particleSpeed;
  for (let i = 0; i < n; i++) {
    const m = pBucket(), u = Math.random();
    const len = tileW * S.particleSize * lerp(S.particleSizeMin, S.particleSizeMax, Math.pow(u, 1.6));
    const a = (i / n) * Math.PI * 2 + rand(-0.35, 0.35);
    G.particles.push({
      cx: x, cy: y, a, m, s: len, R: size,
      r0: Math.pow(Math.random(), 0.8) * 0.78 * size, // 出生在两牌范围内（不是只在接缝处），靠近两牌更密
      dr: size * S.particleSpread * rand(0.35, 1.15),
      va: (swirl ? dir : 0) * S.particleSwirl * rand(0.6, 1.25) * sp,
      up: size * S.particleUp * rand(0.3, 1.2),
      rot: rand(0, Math.PI * 2), vrot: rand(-1, 1) * S.particleSpin * sp,
      fl: rand(0, Math.PI * 2), vfl: S.particleFlip * rand(0.6, 1.4) * Math.PI * 2 * sp * (Math.random() < 0.5 ? -1 : 1),
      depth: rand(-1, 1), tw: tileW,
      // 平滑“噪声”：每片固定的几组低频正弦（相位/频率在出生时定好，之后不再取随机数 → 任意帧率下都连续无跳变）
      sw: [rand(0, 6.28), rand(0.75, 1.3), rand(0, 6.28), rand(0.4, 0.8)], wob: [rand(0, 6.28), rand(0.5, 1.1), rand(0.3, 1)],
      col: leafColor(m), t0: now + Math.random() * S.particleEmit, life: S.particleLife * rand(0.72, 1.05) / Math.max(0.3, sp),
    });
  }
}
// 粒子外形随主题：国风=树叶，中东风=金色闪光+玫瑰花瓣（m 决定类型/色档，AE 导出按 m 分 8 档取同一贴图）
function drawParticleShape(len, wid, col, m = 0.5) {
  const soft = S.particleSoft || 0, oldF = ctx.filter; // 边缘柔化：贴图与 AE 素材同样生效
  if (soft > 0) ctx.filter = `blur(${(len * 0.022 * soft).toFixed(2)}px)`;
  try { drawParticleShapeRaw(len, wid, col, m); } finally { ctx.filter = oldF || 'none'; }
}
function drawParticleShapeRaw(len, wid, col, m) {
  if (THEME.particle) { THEME.particle(ctx, len, wid, col, m, S); return; } // 主题自己处理辉光
  const glow = S.particleGlow || 0;
  if (glow > 0) { ctx.shadowColor = S.particleColor3 || '#ffffcc'; ctx.shadowBlur = len * 0.18 * glow; }
  drawLeaf(len, wid, col, m);
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
}
// 细长尖叶：叶柄端圆钝、叶尖细长，微弯；以叶脉为界两半深浅不同（一半受光一半背光），
// 叶尖方向渐亮，浅色叶脉，受光一侧边缘一道细高光
function drawLeaf(len, wid, col, m = 0.5) {
  // 柔和版：不对称（一侧更宽）、整片微弯（弯曲的叶脉），无深色描边；两半明暗差小、整体略透
  const L = len / 2, w = wid / 2 * 1.12, bend = (m - 0.5) * wid * 1.3 + wid * 0.18;
  const base = hexRgb(rgbToHex(col)), hi = hexRgb(S.particleColor3 || '#b9e08a');
  const mix = (c, d, t, a = 1) => `rgba(${c.map((v, k) => Math.round(lerp(v, d[k], t))).join(',')},${a})`;
  const dark = base.map(v => v * 0.8);
  const edgeU = () => { ctx.moveTo(-L, 0); ctx.bezierCurveTo(-L * 0.5, -w * 1.32, L * 0.3, -w * 1.0 + bend * 0.4, L, bend); };
  const rib = () => ctx.quadraticCurveTo(0, bend * 0.75, -L, 0);
  const upper = () => { ctx.beginPath(); edgeU(); rib(); ctx.closePath(); };
  const lower = () => { ctx.beginPath(); ctx.moveTo(-L, 0); ctx.bezierCurveTo(-L * 0.5, w * 0.98, L * 0.3, w * 0.78 + bend * 0.4, L, bend); rib(); ctx.closePath(); };
  // 受光半边：叶柄略深 → 叶尖浅黄绿
  let g = ctx.createLinearGradient(-L, -w, L, w * 0.3);
  g.addColorStop(0, mix(base, dark, 0.25, 0.95)); g.addColorStop(0.55, mix(base, hi, 0.08, 0.96)); g.addColorStop(1, mix(base, hi, 0.22, 0.92));
  upper(); ctx.fillStyle = g; ctx.fill();
  // 背光半边：只略深一点
  g = ctx.createLinearGradient(-L, 0, L, 0);
  g.addColorStop(0, mix(dark, [0, 0, 0], 0.08, 0.95)); g.addColorStop(1, mix(base, hi, 0.12, 0.93));
  lower(); ctx.fillStyle = g; ctx.fill();
  // 柔和高光：受光侧一条宽而淡的光带
  ctx.save(); upper(); ctx.clip();
  ctx.strokeStyle = mix(hi, [255, 255, 255], 0.1, 0.18); ctx.lineWidth = Math.max(0.8, wid * 0.22); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-L * 0.7, -w * 0.55); ctx.bezierCurveTo(-L * 0.3, -w * 0.9, L * 0.3, -w * 0.62 + bend * 0.4, L * 0.9, bend); ctx.stroke();
  ctx.restore();
  // 弯曲的淡色叶脉
  ctx.strokeStyle = mix(hi, base, 0.35, 0.32); ctx.lineWidth = Math.max(0.6, wid * 0.05); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-L * 0.92, 0); ctx.quadraticCurveTo(0, bend * 0.75, L * 0.88, bend * 0.97); ctx.stroke();
}
function rgbToHex(c) { const r = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(c); return r ? '#' + [r[1], r[2], r[3]].map(v => (+v).toString(16).padStart(2, '0')).join('') : c; }
// ---------------- Hand ----------------
const HAND = { x: 0, y: 0, press: 0, visible: false, alpha: 0 };
function resetHand() { HAND.x = W * 0.82; HAND.y = H * 1.15; HAND.press = 0; }
function handMoveTo(x, y, dur, via = null) {
  const fx = HAND.x, fy = HAND.y;
  const dx = x - fx, dy = y - fy, dist = Math.hypot(dx, dy);
  const bend = (Math.random() < 0.5 ? -1 : 1) * S.curve * dist * rand(0.4, 1);
  let cx = (fx + x) / 2 - dy / (dist || 1) * bend, cy = (fy + y) / 2 + dx / (dist || 1) * bend;
  if (via) { cx = 2 * via.x - (fx + x) / 2; cy = 2 * via.y - (fy + y) / 2; } // 二次曲线在中点经过 via（绕开碰撞区）
  return tween(dur, k => {
    const a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
    HAND.x = a * fx + b * cx + c * x; HAND.y = a * fy + b * cy + c * y;
  }, easeInOut);
}
// ---- v16：自动通关时手指避让中央碰撞区 ----
const zoneActive = () => !!(G && G.clearZone && S.handAvoid && performance.now() < G.clearZone.until);
function avoidRadius() { return Math.max(0, S.handAvoidRadius) * W; }
// 手指图片主体（不是指尖）的中心相对指尖的偏移：手指图从指尖向下/侧方延伸
function handBodyOffset() {
  const im = IMG.handImage; if (!im) return { x: 0, y: 0, r: 0 };
  const w = W * S.handSize, h = w * im.height / im.width, f = S.handFlip ? -1 : 1;
  return { x: f * (0.5 - S.handAnchorX) * w, y: (0.5 - S.handAnchorY) * h, r: Math.min(w, h) * 0.3 };
}
// 指尖位于 (x,y) 时手指主体离碰撞中心的“侵入量”（>0 表示挡住）
function zoneIntrude(x, y, z = G.clearZone) {
  const o = handBodyOffset(), R = avoidRadius();
  const dTip = Math.hypot(x - z.x, y - z.y), dBody = Math.hypot(x + o.x - z.x, y + o.y - z.y);
  return Math.max(R * 0.75 - dTip, R + o.r - dBody);
}
function avoidPoint() {
  const z = G.clearZone, o = handBodyOffset(), R = avoidRadius();
  const mode = S.handAvoidDir || 'auto';
  let dirs;
  const v = { x: HAND.x - z.x, y: Math.min(HAND.y, H) - z.y };
  if (mode === 'down') dirs = [[0, 1]];
  else if (mode === 'left') dirs = [[-0.75, 0.66]];
  else if (mode === 'right') dirs = [[0.75, 0.66]];
  else { // auto：朝手指当前所在一侧（最近的侧边），并偏向下方角落（手掌本来就在指尖下方，移动距离最短也最自然）
    const sx = Math.abs(v.x) > 2 ? Math.sign(v.x) : (z.x < W / 2 ? 1 : -1);
    dirs = [[sx * 0.8, 0.6], [sx * 0.45, 0.9], [0, 1], [-sx * 0.8, 0.6]];
  }
  const clampX = x => Math.max(W * 0.06, Math.min(W * 0.94, x)), clampY = y => Math.max(VP.y + H * 0.04, Math.min(H * 1.02, y));
  for (const [ux, uy] of dirs) {
    const l = Math.hypot(ux, uy), nx = ux / l, ny = uy / l;
    for (let k = 1; k < 3.5; k += 0.25) { // 沿该方向找最近的不挡住位置
      const bx = z.x + nx * (R + o.r) * k, by = z.y + ny * (R + o.r) * k; // 主体中心
      const p = { x: clampX(bx - o.x + rand(-0.03, 0.03) * W), y: clampY(by - o.y + rand(-0.02, 0.02) * H) };
      if (zoneIntrude(p.x, p.y) <= 0) return p;
    }
  }
  return { x: z.x < W / 2 ? W * 0.9 : W * 0.1, y: H * 1.02 };
}
// 指尖从当前位置到 (x,y) 的路径若穿过碰撞区，返回一个绕行点
function routeAround(x, y) {
  if (!zoneActive()) return null;
  const z = G.clearZone, fx = HAND.x, fy = HAND.y, R = avoidRadius(), o = handBodyOffset();
  let hit = false;
  for (let i = 1; i < 10; i++) { const k = i / 10; if (zoneIntrude(fx + (x - fx) * k, fy + (y - fy) * k) > 0) { hit = true; break; } }
  if (!hit) return null;
  const mx = (fx + x) / 2, my = (fy + y) / 2; let nx = mx - z.x - o.x * 0.5, ny = my - z.y - o.y * 0.5; // 从中心向外推中点
  let l = Math.hypot(nx, ny); if (l < 1) { nx = -(y - fy); ny = x - fx; l = Math.hypot(nx, ny) || 1; if (ny < 0) { nx = -nx; ny = -ny; } }
  const d = (R + o.r) * 1.25;
  return { x: z.x + nx / l * d - o.x * 0.5, y: z.y + ny / l * d - o.y * 0.5 };
}
function addRipple(x, y) { if (G && S.tapRipple) G.ripples.push({ x, y, t0: performance.now() }); }
async function handPress(onDown, spd = 1) {
  await tween(90 / spd, k => { HAND.press = k; }, easeOut);
  addRipple(HAND.x, HAND.y);
  const r = onDown && onDown();
  await tween(130 / spd, k => { HAND.press = 1 - k; }, easeOut);
  return r;
}

// ---------------- Auto solve ----------------
const AUTO = { running: false, token: 0 };
function stopAuto(silent) {
  AUTO.token++; if (AUTO.running) { AUTO.running = false; if (!silent) toast('已停止自动通关'); }
  updateButtons();
}
async function autoSolve() {
  if (AUTO.running) { stopAuto(); return; }
  if (!G || G.cleared || G.tiles.every(t => t.state === 'gone')) newGame(true);
  const tok = ++AUTO.token; AUTO.running = true; updateButtons();
  const alive = () => tok === AUTO.token;
  const spd = S.autoSpeed;
  [...G.selected].forEach(id => deselect(G.tiles[id]));
  if (S.autoRec && !REC.rec) startRecording(true);
  HAND.visible = true;
  if (HAND.y > H) resetHand();
  // 等待开场展示
  const introLeft = S.introWord ? (S.introDelay + S.introDuration + 0.3) * 1000 - (performance.now() - G.introT0) : 0;
  await sleep(Math.max(250, introLeft));
  if (!alive()) return;
  const m = S.matchCount;
  let groups = null;
  if (!G.touched) groups = G.order.map(g => g.slice());
  if (!groups) groups = repairPartition(G.tiles, G.order, m);
  if (!groups) { const p = solve(G.tiles, m, null); if (p && validatePartition(G.tiles, p)) groups = p; }
  if (!groups && S.winCondition === 'word' && G.word.length) { // 整盘无解时，只要还能集齐单词也可以继续
    const p = solve(G.tiles, m, null, 60000, al => !G.tiles.some((t, i) => al[i] && isTarget(t.key)));
    if (p && validatePartition(G.tiles, p)) groups = p;
  }
  if (!groups) { toast('当前局面无解（手动操作造成），请重新开始'); AUTO.running = false; updateButtons(); return; }
  groups = groups.map(g => g.filter(id => G.tiles[id].state !== 'gone')).filter(g => g.length);
  const isLetterG = g => isTarget(G.tiles[g[0]].key);
  const gFree = g => g.every(id => { const t = G.tiles[id]; return t.state === 'tray' || (t.state === 'board' && isFree(t)); });
  const doClick = async (t) => {
    const sc = tileScreen(t);
    const j = S.jitter * U;
    const tx = sc.x + Math.max(-sc.w * 0.3, Math.min(sc.w * 0.3, rand(-j, j)));
    const ty = sc.y + Math.max(-sc.h * 0.3, Math.min(sc.h * 0.3, rand(-j, j)));
    // v16：碰撞区仍在爆开时，先在区外等它结束（'zone' 模式只在目标牌本身在区内时等，否则绕开碰撞区直接去）
    if (zoneActive() && (S.handAvoidWait !== 'zone' || zoneIntrude(tx, ty) > 0)) {
      // 速度倍率 >1 时等待按比例缩短（剩余时间改为绕行），保证“整体速度倍率”仍然有效
      const z = G.clearZone, until = spd > 1 && zoneIntrude(tx, ty) <= 0 ? z.t0 + (z.until - z.t0) / spd : z.until;
      while (zoneActive() && G.clearZone === z && performance.now() < until && alive()) await sleep(40);
      await sleep(rand(40, 140) / spd); if (!alive()) return false;
    }
    const via = routeAround(tx, ty);
    const dist = Math.hypot(tx - HAND.x, ty - HAND.y) * (via ? 1.25 : 1);
    const base = rand(S.moveMin, Math.max(S.moveMin, S.moveMax));
    const dur = base * (0.55 + Math.min(1, dist / (H * 0.5)) * 0.6) / spd;
    await handMoveTo(tx, ty, dur, via);
    if (!alive()) return false;
    await sleep(rand(15, 60) / spd);
    const z0 = G.clearZone;
    let follow = null, t1 = 0;
    // v17：点下的那一刻就知道这一下会配对（两牌将飞向中央）→ 抬指的同时开始“顺势离开”，与松开动作连成一个动作（参考视频：点击后 0 ms 起步，约 0.45 s 内离开）
    const ok = await handPress(() => {
      const r = clickTile(t, true);
      if (S.handAvoid && G.clearZone && G.clearZone !== z0) { t1 = performance.now(); follow = followThrough(); }
      return r;
    }, spd);
    if (follow) await follow;
    if (!alive()) return false;
    let d = rand(S.delayMin, Math.max(S.delayMin, S.delayMax));
    if (Math.random() < S.thinkChance) d += rand(0.3, 1) * S.thinkMax;
    if (t1) d = Math.max(0, d - (performance.now() - t1) * spd);
    await sleep(d / spd);
    return ok;
  };
  // v17：配对那一下点下时就规划好抬指后的路线：下一组（此刻就选好）的第一张若在碰撞区外 → 沿绕开碰撞区的弧线朝它去，悬停在它旁边；
  // 否则（或没有下一组）→ 停到碰撞区旁（自动：朝最近侧边/下方，参考视频里手指退到画面下缘）
  let planned = null;
  const followThrough = () => {
    if (S.handAvoidDir === 'next' || !S.handAvoidDir) planned = choose();
    let dest = null;
    if (planned) {
      const ft = G.tiles[planned.find(id => G.tiles[id].state === 'board') ?? planned[0]], sc = tileScreen(ft);
      // 悬停点：牌的下方一点（抬起的手指不挡住牌），整只手不进碰撞区
      for (const k of [0.55, 0.9, 1.3]) {
        const hx = sc.x + rand(-0.1, 0.1) * sc.w, hy = sc.y + sc.h * k;
        if (zoneIntrude(hx, hy) <= 0 && zoneIntrude(sc.x, sc.y) <= 0) { dest = { x: hx, y: hy }; break; }
      }
    }
    if (!dest) dest = avoidPoint();
    // 路线：三次贝塞尔。起步方向 = 从碰撞中心指向手指、并偏向下方（参考：抬指后手往下/往侧边带走），
    // 末段从碰撞区外侧进入目标；逐点检查，一旦离开碰撞区就不再回到区内
    const z = G.clearZone, P0 = { x: HAND.x, y: HAND.y }, R = avoidRadius();
    let ex = P0.x - z.x, ey = P0.y - z.y + R * 0.6; const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
    if (Math.hypot(P0.x - z.x, P0.y - z.y) < R * 0.15) { ex = Math.sign(dest.x - z.x) * 0.6 || 0.6; ey = 0.8; }
    let qx = dest.x - z.x, qy = dest.y - z.y; const ql = Math.hypot(qx, qy) || 1; qx /= ql; qy /= ql;
    let path = null;
    for (const k of [0.5, 0.8, 1.1, 1.5]) {
      const P1 = { x: P0.x + ex * R * k, y: P0.y + ey * R * k }, P2 = { x: dest.x + qx * R * k * 0.5, y: dest.y + qy * R * k * 0.5 };
      let left = false, bad = false;
      for (let i = 1; i <= 24; i++) { const u = i / 24, x = bez3(P0.x, P1.x, P2.x, dest.x, u), y = bez3(P0.y, P1.y, P2.y, dest.y, u); const inside = zoneIntrude(x, y, z) > 0; if (!inside) left = true; else if (left) { bad = true; break; } }
      path = { P1, P2 }; if (!bad) break;
    }
    let len = 0, lx = P0.x, ly = P0.y; for (let i = 1; i <= 16; i++) { const u = i / 16, x = bez3(P0.x, path.P1.x, path.P2.x, dest.x, u), y = bez3(P0.y, path.P1.y, path.P2.y, dest.y, u); len += Math.hypot(x - lx, y - ly); lx = x; ly = y; }
    const dur = S.handAvoidDuration * (0.75 + 0.8 * Math.min(1.6, len / (H * 0.5))) * rand(0.92, 1.1) / spd;
    return tween(dur, k => { HAND.x = bez3(P0.x, path.P1.x, path.P2.x, dest.x, k); HAND.y = bez3(P0.y, path.P1.y, path.P2.y, dest.y, k); }, easeInOut);
  };
  // 选下一组（自动通关主循环与“点下时预先规划”共用）
  const choose = () => {
      const free = groups.filter(gFree);
      const letterG = free.filter(isLetterG).sort((a, b) => targetIndex(G.tiles[a[0]].key) - targetIndex(G.tiles[b[0]].key));
      const normalG = free.filter(g => !isLetterG(g));
      const allLetters = groups.filter(isLetterG).sort((a, b) => targetIndex(G.tiles[a[0]].key) - targetIndex(G.tiles[b[0]].key));
      let pick = null;
      if (letterG.length) {
        if (S.letterOrder === 'early') pick = letterG[0];
        else if (S.letterOrder === 'word') { if (letterG[0] === allLetters[0]) pick = letterG[0]; }
        else if (S.letterOrder === 'natural') { if (Math.random() < (G.letterPairs ? 0.6 : 0.15)) pick = letterG[Math.floor(Math.random() * letterG.length)]; }
      }
      if (!pick && normalG.length) {
        const hp = { x: HAND.x, y: Math.min(HAND.y, H) };
        let best = Infinity, pool = normalG;
        if (targetsLeft() && S.letterOrder !== 'late') {
          const need = neededSet(); const helpful = normalG.filter(g => g.some(id => need.has(id)));
          if (helpful.length && Math.random() >= S.extraPairChance) pool = helpful;
        }
        for (const g of pool) {
          const sorted = g.slice().sort((a, b) => dScreen(a, hp) - dScreen(b, hp));
          let sc = dScreen(sorted[0], hp);
          for (let i = 1; i < sorted.length; i++) sc += dScreen(sorted[i], tileScreen(G.tiles[sorted[i - 1]])) * 0.6;
          sc *= rand(0.75, 1.25);
          if (sc < best) { best = sc; pick = sorted; }
        }
      }
      if (!pick && letterG.length) pick = letterG[0];
      return pick;
  };
  const dScreen = (id, p) => { const s = tileScreen(G.tiles[id]); return Math.hypot(s.x - p.x, s.y - p.y); };
  let stuck = 0;
  const wordWin = S.winCondition === 'word' && G.word.length > 0;
  const targetsLeft = () => G.tiles.some(t => isTarget(t.key) && (t.state === 'board' || t.state === 'selected' || t.state === 'tray'));
  // 目标字母上方（直接或间接）压着的牌：优先消除它们以尽快解放字母
  const neededSet = () => {
    const need = new Set(), st = G.tiles.filter(t => isTarget(t.key) && aliveOnBoard(t));
    while (st.length) { const t = st.pop(); for (const j of t.coveredBy) { const u = G.tiles[j]; if (aliveOnBoard(u) && !need.has(j)) { need.add(j); st.push(u); } } }
    return need;
  };
  while (groups.length && alive()) {
    if (wordWin && !targetsLeft()) break;
    let pick = planned && groups.some(g => g.length === planned.length && g.every(id => planned.includes(id))) && gFree(planned) ? planned : choose();
    planned = null;
    if (!pick) { if (++stuck > 30) { toast('自动通关卡住了，请重新开始'); break; } await sleep(150); continue; }
    stuck = 0;
    groups.splice(groups.findIndex(g => g.every(id => pick.includes(id)) && g.length === pick.length), 1);
    for (const id of pick) {
      const t = G.tiles[id];
      if (t.state === 'tray') continue;
      await doClick(t); if (!alive()) return;
    }
    if (pick.some(id => G.tiles[id].state === 'board')) { groups.push(pick.filter(id => G.tiles[id].state !== 'gone')); await sleep(250); }
  }
  // 等待通关
  while (!G.cleared && alive()) await sleep(100);
  if (!alive()) return;
  if (S.endCard) {
    // 等到结束页开始出现；默认不显示手指也不自动点按钮（endCardHand=false）
    while (alive() && performance.now() - G.clearT < S.endDelay) await sleep(30);
    if (!alive()) return;
    if (!S.endCardHand) { HAND.visible = false; HAND.alpha = 0; await sleep(700 / spd); }
    else {
      await sleep(700);
      if (!alive()) return;
      for (let i = 0; i < 2 && alive(); i++) {
        const b = endButtonRect();
        await handMoveTo(b.x + rand(-10, 10) * U, b.y + rand(-5, 5) * U, 600 / spd);
        await handPress(null, spd); await sleep(450 / spd);
      }
    }
  } else {
    await handMoveTo(W * 0.85, H * 1.2, 700 / spd);
  }
  AUTO.running = false; updateButtons();
}

// ---------------- Recording ----------------
const REC = { rec: null, chunks: [], mime: '', t0: 0, auto: false, list: [] };
function pickMime(audio = false) {
  const mp4 = [...(audio ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus'] : []), 'video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4'];
  const webm = [...(audio ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'] : []), 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const order = S.recFormat === 'webm' ? webm.concat(mp4) : S.recFormat === 'mp4' ? mp4.concat(webm) : mp4.concat(webm);
  return order.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}
function startRecording(auto = false) {
  if (REC.rec) return;
  if (!window.MediaRecorder || !canvas.captureStream) { toast('当前浏览器不支持录制'); return; }
  const stream = canvas.captureStream(+S.recFps);
  resumeAudio();
  const at = audioTrack(); // 音效混音轨（即使静音也保留音轨，保证视频始终带音频）
  if (at) stream.addTrack(at);
  const mime = pickMime(!!at);
  let rec;
  try { rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: Math.round(S.recBitrate * 1e6), audioBitsPerSecond: 128000 }); }
  catch (e) { toast('录制启动失败：' + e.message); return; }
  REC.rec = rec; REC.chunks = []; REC.mime = rec.mimeType || mime; REC.t0 = performance.now(); REC.auto = auto;
  REC.ae = false; if (S.aeWithRec && !AE.active()) { aeStart(); REC.ae = true; }
  rec.ondataavailable = e => { if (e.data && e.data.size) REC.chunks.push(e.data); };
  rec.onstop = () => {
    const type = REC.mime || 'video/webm';
    const blob = new Blob(REC.chunks, { type });
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const name = `mahjong_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${W}x${H}.${ext}`;
    const url = URL.createObjectURL(blob);
    REC.list.unshift({ name, url, size: blob.size });
    window.__lastRecording = { name, url, size: blob.size, type };
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    REC.rec = null; renderRecList(); updateButtons();
    if (REC.ae && AE.active()) { REC.ae = false; aeStopAndExport(); }
    toast(`录制完成：${name}（${(blob.size / 1048576).toFixed(1)} MB）`);
  };
  rec.start(250);
  updateButtons();
  toast('开始录制（' + (REC.mime || 'default') + '）');
}
function stopRecording() { if (REC.rec && REC.rec.state !== 'inactive') REC.rec.stop(); }

function onCleared() {
  G.cleared = true; G.clearT = performance.now();
  if (S.endCard) { const gid = G; setTimeout(() => { if (G === gid) sfx('End'); }, S.endDelay); }
  updateStatus();
  // 只在已有录制时生效：自动通关开启的录制，或用户手动开始录制后在自动通关中通关
  if (REC.rec && S.autoStop && (REC.auto || AUTO.running)) {
    const wait = (S.endCard ? S.endDelay + 2600 / Math.max(0.5, S.autoSpeed) : 600) + S.tailSec * 1000;
    const recRef = REC.rec;
    setTimeout(() => { if (REC.rec === recRef) stopRecording(); }, wait);
  }
}

// ---------------- Drawing ----------------
// 2D 牌（飞行/托盘用），与 3D 牌外观一致：牌面 + 向右下露出的白色侧面与绿色底座
function drawTile2D(key, x, y, w, h, alpha = 1, tint = 0) {
  const r = S.cornerRadius * w;
  const rx = S.sideRevealX * w, ry = S.sideRevealY * w;
  ctx.save(); ctx.globalAlpha = alpha;
  const x0 = x - w / 2, y0 = y - h / 2;
  const steps = 14;
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = w * 0.18; ctx.shadowOffsetX = S.shadowDX * w * 1.5; ctx.shadowOffsetY = S.shadowDY * w * 1.5 + w * 0.04;
  ctx.fillStyle = tint ? shade(S.selectTint, 0.6) : (S.baseColorDark || S.baseColor); rr(ctx, x0 + rx, y0 + ry, w, h, r); ctx.fill();
  ctx.shadowColor = 'transparent';
  for (let i = steps; i >= 1; i--) {
    const f = i / steps, c = sideGrad(f);
    ctx.fillStyle = tint ? mixHex(c, S.selectTint, 0.6) : c;
    rr(ctx, x0 + rx * f, y0 + ry * f, w, h, r); ctx.fill();
  }
  ctx.drawImage(tint ? faceCanvasSel(key) : faceCanvas(key), x0, y0, w, h);
  ctx.restore();
}
function drawBackground() {
  if (IMG.bgImage) {
    const im = IMG.bgImage, k = Math.max(W / im.width, H / im.height);
    ctx.drawImage(im, (W - im.width * k) / 2, (H - im.height * k) / 2, im.width * k, im.height * k);
  } else if (THEME.background) THEME.background(ctx, themeEnv());
  else {
    const g = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, H * 0.65);
    g.addColorStop(0, S.bgColor); g.addColorStop(1, S.bgColor2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}
// part：'all' | 'base' | 'logo' | 'slot'（配合 onlySlot） | 'intro' | 'glow'，供导出 AE 素材时单独绘制某一部分
function drawTopBar(now, part = 'all', onlySlot = -1) {
  const th = H * S.topBarHeight;
  const P = x => part === 'all' || part === x;
  if (P('base') && THEME.topBar) THEME.topBar(ctx, themeEnv());
  else if (P('base')) {
  // 参考：纯色深棕木板（几乎无渐变）+ 极淡木纹，底部一条较亮的倒角，再下面是黑色
  ctx.fillStyle = S.topBarColor; ctx.fillRect(0, 0, W, th);
  ctx.save(); ctx.globalAlpha = 0.05; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2 * U;
  const rnd = mulberry32(7);
  for (let i = 0; i < 16; i++) { ctx.beginPath(); const yy = th * (0.04 + i * 0.058) + rnd() * 3 * U; ctx.moveTo(0, yy); ctx.bezierCurveTo(W * 0.3, yy + (rnd() - 0.5) * 6 * U, W * 0.6, yy + (rnd() - 0.5) * 6 * U, W, yy + (rnd() - 0.5) * 4 * U); ctx.stroke(); }
  ctx.globalAlpha = 0.035; ctx.strokeStyle = '#fff';
  for (let i = 0; i < 8; i++) { ctx.beginPath(); const yy = th * (0.08 + i * 0.11) + rnd() * 4 * U; ctx.moveTo(0, yy); ctx.bezierCurveTo(W * 0.35, yy + 3 * U, W * 0.65, yy - 3 * U, W, yy + 1 * U); ctx.stroke(); }
  ctx.restore();
  const bv = 9 * U, bg = ctx.createLinearGradient(0, th - bv, 0, th + 3 * U);
  bg.addColorStop(0, shade(S.topBarColor, 1.08)); bg.addColorStop(0.25, shade(S.topBarColor, 1.2)); bg.addColorStop(0.7, shade(S.topBarColor, 1.12)); bg.addColorStop(1, shade(S.topBarColor, 0.55));
  ctx.fillStyle = bg; ctx.fillRect(0, th - bv, W, bv + 3 * U);
  const sg = ctx.createLinearGradient(0, th + 3 * U, 0, th + 12 * U); sg.addColorStop(0, 'rgba(0,0,0,.6)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, th + 3 * U, W, 9 * U);
  }
  if (P('logo')) drawLogo(th);
  // 托盘格：参考为“刻进木板”的圆角槽——内部与木板同色，上/左缘深色内阴影，下/右缘亮色高光
  const sc = hexRgb(S.slotColor);
  for (let i = 0; i < S.slotCount; i++) {
    if (!(part === 'all' || (part === 'slot' && (onlySlot < 0 || onlySlot === i)))) continue;
    const r = slotRect(i), rad = r.w * 0.13;
    if (THEME.slot) { THEME.slot(ctx, r, themeEnv()); continue; }
    ctx.save();
    ctx.fillStyle = `rgba(${sc.join(',')},0.18)`; rr(ctx, r.x, r.y, r.w, r.h, rad); ctx.fill();
    rr(ctx, r.x, r.y, r.w, r.h, rad); ctx.clip();
    ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 4 * U; ctx.shadowOffsetX = 1.5 * U; ctx.shadowOffsetY = 2.5 * U;
    ctx.strokeStyle = 'rgba(20,5,0,.9)'; ctx.lineWidth = 4 * U; rr(ctx, r.x - 2 * U, r.y - 2 * U, r.w + 4 * U, r.h + 4 * U, rad + 2 * U); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.strokeStyle = shade(S.topBarColor, 1.45); ctx.lineWidth = 1.6 * U;
    ctx.beginPath(); ctx.moveTo(r.x + rad * 0.6, r.y + r.h + 0.8 * U); ctx.lineTo(r.x + r.w - rad, r.y + r.h + 0.8 * U); ctx.quadraticCurveTo(r.x + r.w + 0.8 * U, r.y + r.h + 0.8 * U, r.x + r.w + 0.8 * U, r.y + r.h - rad); ctx.lineTo(r.x + r.w + 0.8 * U, r.y + rad * 0.6); ctx.stroke();
    ctx.strokeStyle = 'rgba(25,6,0,.75)'; ctx.lineWidth = 1.4 * U;
    ctx.beginPath(); ctx.moveTo(r.x - 0.6 * U, r.y + r.h - rad * 0.6); ctx.lineTo(r.x - 0.6 * U, r.y + rad); ctx.quadraticCurveTo(r.x - 0.6 * U, r.y - 0.6 * U, r.x + rad, r.y - 0.6 * U); ctx.lineTo(r.x + r.w - rad * 0.6, r.y - 0.6 * U); ctx.stroke();
    ctx.restore();
  }
  // 开场目标词：字母逐个弹出，停留后淡出（视频 0.4s~2.6s）
  if (P('intro')) for (const L of introLetterStates(now)) drawTile2D(L.key, L.x, L.y, L.w, L.h, L.alpha);
  // 单词集齐发光
  const gs = wordGlowState(now);
  if (gs && P('glow')) {
    drawWordGlowRing(gs.pulse);
    for (const st of gs.stars) star(st.x, st.y, st.r, S.glowColor);
  }
}
function introLetterStates(now) {
  const out = [];
  if (!(S.introWord && G)) return out;
  const el = (now - G.introT0) / 1000, end = S.introDelay + S.introDuration;
  if (!(el > S.introDelay && el < end + 0.3)) return out;
  const fade = el < end ? 1 : 1 - (el - end) / 0.3;
  for (let i = 0; i < G.word.length; i++) {
    if (G.tray[i] && G.tray[i].letter) continue;
    const t0 = S.introDelay + 0.1 + i * S.introStagger; if (el < t0) continue;
    const k = Math.min(1, (el - t0) / 0.25), sc = 0.4 + 0.6 * easeBack(k);
    const sl = slotTileSize(i);
    out.push({ i, key: 'T' + G.word[i] + ':' + i, x: sl.x, y: sl.y, w: sl.w * sc, h: sl.h * sc, alpha: fade * Math.min(1, k * 2) });
  }
  return out;
}
function wordGlowState(now) {
  if (!(G && G.wordDoneT)) return null;
  const el = (now - G.wordDoneT) / 1000;
  const pulse = el < 2 ? 0.6 + 0.4 * Math.sin(el * 10) : 0.55 + 0.15 * Math.sin(el * 3);
  const a = slotRect(0), b = slotRect(G.word.length - 1), stars = [];
  const win = Math.floor(el * 12);
  if (el < 2.2) { // 闪光星星（每 1/12 秒换一批位置）
    const rnd = mulberry32(win);
    for (let i = 0; i < 6; i++) { const x = lerp(a.x, b.x + b.w, rnd()), y = lerp(a.y, a.y + a.h, rnd()); stars.push({ x, y, r: (6 + rnd() * 8) * U }); }
  }
  return { el, pulse, win, stars, opacity: Math.min(1, pulse + 0.2) };
}
function drawWordGlowRing(pulse, alphaOverride) {
  const a = slotRect(0), b = slotRect(G.word.length - 1);
  ctx.save(); ctx.shadowColor = S.glowColor; ctx.shadowBlur = 28 * U * pulse; ctx.strokeStyle = S.glowColor; ctx.globalAlpha = alphaOverride ?? Math.min(1, pulse + 0.2);
  ctx.lineWidth = 4 * U; rr(ctx, a.x - 5 * U, a.y - 5 * U, b.x + b.w - a.x + 10 * U, a.h + 10 * U, a.w * 0.18); ctx.stroke(); ctx.stroke();
  ctx.restore();
}
function star(x, y, r, col) {
  ctx.save(); ctx.fillStyle = col; ctx.globalAlpha = 0.9; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr2 = i % 2 ? r * 0.3 : r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawLogo(th) {
  const ax = W * 0.012, aw = W * 0.33 * S.logoScale, ah = th * 0.98 * S.logoScale, ay = (th - ah) / 2 - 3 * U;
  if (IMG.logoImage) {
    const im = IMG.logoImage, k = Math.min(aw / im.width, ah / im.height);
    ctx.drawImage(im, ax + (aw - im.width * k) / 2, ay + (ah - im.height * k) / 2, im.width * k, im.height * k); return;
  }
  if (THEME.logo) { THEME.logo(ctx, themeEnv({ ax, ay, aw, ah })); return; }
  // 参考：金色立体描边字 “online / DOMINO / Cafe”，深棕粗描边 + 外发光；上方金色圆顶剪影、DOMINO 左侧金色光环、Cafe 左侧咖啡杯
  const cx = ax + aw * 0.5;
  const goldG = (y0, y1) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#fff7c8'); g.addColorStop(0.35, '#ffd640'); g.addColorStop(0.7, '#f7a313'); g.addColorStop(1, '#c86a00'); return g; };
  const word = (txt, x, y, size, maxW, opt = {}) => {
    if (!txt) return;
    ctx.save();
    ctx.font = `${opt.italic ? 'italic ' : ''}${size}px ${FONT_LOGO}`;
    const mw = ctx.measureText(txt).width, k = Math.min(1, maxW / mw);
    ctx.translate(x, y); if (opt.italic) ctx.transform(1, 0, -0.18, 1, 0, 0); ctx.scale(k * (opt.sx || 1), 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255,170,30,.55)'; ctx.shadowBlur = size * 0.35;
    ctx.strokeStyle = '#3a1203'; ctx.lineWidth = size * 0.24; ctx.strokeText(txt, 0, size * 0.04);
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#8a3a06'; ctx.lineWidth = size * 0.12; ctx.strokeText(txt, 0, size * 0.03);
    ctx.fillStyle = '#9a4a05'; ctx.fillText(txt, 0, size * 0.07); // 立体下沿
    ctx.fillStyle = goldG(-size * 0.45, size * 0.45); ctx.fillText(txt, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.restore();
    ctx.fillStyle = 'rgba(255,255,240,.55)'; ctx.save(); ctx.beginPath(); ctx.rect(-mw, -size * 0.5, mw * 2, size * 0.22); ctx.clip(); ctx.fillText(txt, 0, 0); ctx.restore();
    ctx.restore();
  };
  const gold = goldG(ay, ay + ah);
  if (S.logoDeco) {
    // 上方金色圆顶/塔尖剪影（online 右侧）
    ctx.save(); ctx.fillStyle = gold; ctx.strokeStyle = '#3a1203'; ctx.lineWidth = 2 * U; ctx.lineJoin = 'round';
    const by = ay + ah * 0.3, bx = ax + aw * 0.6;
    const dome = (x, w, h) => { ctx.beginPath(); ctx.moveTo(x - w / 2, by); ctx.quadraticCurveTo(x - w / 2, by - h * 0.7, x, by - h); ctx.quadraticCurveTo(x + w / 2, by - h * 0.7, x + w / 2, by); ctx.closePath(); ctx.stroke(); ctx.fill(); };
    const tower = (x, w, h) => { ctx.beginPath(); ctx.rect(x - w / 2, by - h, w, h); ctx.stroke(); ctx.fill(); ctx.beginPath(); ctx.arc(x, by - h - w * 0.4, w * 0.45, 0, 7); ctx.stroke(); ctx.fill(); };
    ctx.fillStyle = goldG(ay + ah * 0.05, by); ctx.lineWidth = 1.6 * U;
    tower(bx - aw * 0.3, aw * 0.03, ah * 0.17); dome(bx - aw * 0.18, aw * 0.1, ah * 0.15); dome(bx + aw * 0.0, aw * 0.14, ah * 0.2); tower(bx + aw * 0.13, aw * 0.035, ah * 0.21); dome(bx + aw * 0.24, aw * 0.09, ah * 0.13); tower(bx + aw * 0.33, aw * 0.028, ah * 0.15);
    ctx.restore();
    // DOMINO 左侧的金色光环（椭圆弧）
    ctx.save(); ctx.strokeStyle = '#3a1203'; ctx.lineWidth = ah * 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(cx - aw * 0.06, ay + ah * 0.5, aw * 0.47, ah * 0.3, -0.08, Math.PI * 0.55, Math.PI * 1.45); ctx.stroke();
    ctx.strokeStyle = gold; ctx.lineWidth = ah * 0.035; ctx.stroke();
    ctx.restore();
  }
  if (S.logoRibbon) {
    ctx.save(); ctx.strokeStyle = '#c8102e'; ctx.lineWidth = ah * 0.12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax + aw * 0.08, ay + ah * 0.78); ctx.quadraticCurveTo(cx, ay + ah * 1.02, ax + aw * 0.92, ay + ah * 0.74); ctx.stroke();
    ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = ah * 0.03; ctx.beginPath(); ctx.moveTo(ax + aw * 0.1, ay + ah * 0.75); ctx.quadraticCurveTo(cx, ay + ah * 0.98, ax + aw * 0.9, ay + ah * 0.71); ctx.stroke();
    ctx.restore();
  }
  word(S.logoLine1, cx + aw * 0.1, ay + ah * 0.22, ah * 0.2, aw * 0.4);
  word(S.logoLine2, cx, ay + ah * 0.5, ah * 0.44, aw * 0.94, { sx: 0.92 });
  word(S.logoLine3, cx + aw * 0.06, ay + ah * 0.79, ah * 0.28, aw * 0.42, { italic: true });
  if (S.logoDeco) { // Cafe 左侧咖啡杯
    const x = cx - aw * 0.24, y = ay + ah * 0.78, k = ah * 0.075;
    ctx.save(); ctx.fillStyle = gold; ctx.strokeStyle = '#3a1203'; ctx.lineWidth = 2 * U; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - k, y - k * 0.7); ctx.lineTo(x + k, y - k * 0.7); ctx.quadraticCurveTo(x + k, y + k, x, y + k); ctx.quadraticCurveTo(x - k, y + k, x - k, y - k * 0.7); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.beginPath(); ctx.arc(x + k * 1.05, y - k * 0.05, k * 0.4, -1.3, 1.3); ctx.lineWidth = 4 * U; ctx.stroke(); ctx.strokeStyle = '#ffd640'; ctx.lineWidth = 1.8 * U; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y + k * 1.15, k * 1.4, k * 0.3, 0, 0, 7); ctx.strokeStyle = '#3a1203'; ctx.lineWidth = 2 * U; ctx.stroke(); ctx.fill();
    ctx.restore();
  }
}
function drawDisclaimer() {
  if (!S.disclaimer) return;
  const size = H * S.disclaimerSize;
  ctx.font = `${size}px ${THEME.fonts?.disclaimer || '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",Arial,sans-serif'}`;
  ctx.direction = THEME.fonts?.rtl ? 'rtl' : 'ltr';
  const mw = ctx.measureText(S.disclaimer).width, k = Math.min(1, W * 0.96 / mw);
  ctx.save(); ctx.translate(W / 2, H - size * 1.1); ctx.scale(k, 1);
  ctx.fillStyle = S.disclaimerColor; ctx.globalAlpha = 0.85; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(S.disclaimer, 0, 0); ctx.restore(); ctx.direction = 'ltr';
}
// v16：配对飞行/碰撞中的牌（z 5.x）属于消除动画；托盘牌（z 0）与飞向字母槽的字母（z 6）不算
const isClearSprite = sp => sp.z >= 5 && sp.z < 6;
function drawSprites(pred) {
  for (const sp of G.sprites.filter(pred).sort((a, b) => a.z - b.z)) {
    const sw = sp.w * sp.scale * (sp.sx || 1), sh = sp.h * sp.scale * (sp.sy || 1);
    if (sp.rot) { ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.rot * Math.PI / 180); drawTile2D(sp.key, 0, 0, sw, sh, sp.alpha, sp.tint ? 1 : 0); ctx.restore(); }
    else drawTile2D(sp.key, sp.x, sp.y, sw, sh, sp.alpha, sp.tint ? 1 : 0);
  }
}
function drawEffects(now) {
  // 碰撞接缝闪光：沿两牌接触线的一道白色光带，约 220 ms 淡出
  G.seams = (G.seams || []).filter(f => {
    const q = seamState(f, now); if (!q) return false;
    drawSeam(f.x, f.y, f.h, q.gw, q.R, q.a);
    return true;
  });
  // 闪光
  G.flashes = G.flashes.filter(f => {
    const q = flashState(f, now); if (!q) return false;
    drawFlash(f.x, f.y, q.r, q.a); return true;
  });
  drawParticles(now);
}
function seamState(f, now) {
  const k = (now - f.t0) / 240; if (k >= 1) return null;
  return { x: f.x, y: f.y, h: f.h, a: f.a * (1 - k) * (k < 0.15 ? k / 0.15 : 1), gw: f.w * (0.16 + 0.25 * k), R: f.h * (0.35 + 0.4 * k) };
}
function flashState(f, now) { const k = (now - f.t0) / 350; return k >= 1 ? null : { x: f.x, y: f.y, r: f.r * (1 + k), a: 1 - k }; }
function drawSeam(x, y, h, gw, R, a) { drawSeamBand(x, y, h, gw, a); drawSeamGlow(x, y, R, a); }
function drawSeamBand(x, y, h, gw, a) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(x - gw, 0, x + gw, 0);
  const sc = hexRgb(S.seamColor || '#ffffe6').join(',');
  g.addColorStop(0, `rgba(${sc},0)`); g.addColorStop(0.5, `rgba(${sc},${a})`); g.addColorStop(1, `rgba(${sc},0)`);
  ctx.fillStyle = g; ctx.fillRect(x - gw, y - h * 0.55, gw * 2, h * 1.1);
  ctx.restore();
}
function drawSeamGlow(x, y, R, a) {
  const r = ctx.createRadialGradient(x, y, 0, x, y, R);
  const sc = hexRgb(S.seamColor || '#ffffe6').join(',');
  r.addColorStop(0, `rgba(${sc},${a * 0.8})`); r.addColorStop(1, `rgba(${sc},0)`);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = r; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill(); ctx.restore();
}
function drawFlash(x, y, rad, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
  const c = hexRgb(THEME.flashColor || S.particleColor2);
  g.addColorStop(0, `rgba(255,255,220,${0.8 * a})`); g.addColorStop(0.4, `rgba(${c.join(',')},${0.5 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
}
function drawParticles(now) {
  // 粒子（贴图批量绘制）
  const blur = S.particleBlur || 0, base = ctx.getTransform(); // 保留外层变换（震屏等）
  G.particles = G.particles.filter(p => {
    if (now < p.t0) return true; // 还没到发射时刻
    const q = particleState(p, now); if (!q) return false;
    const k = p.s / LEAF_RES / 2;
    const draw = (q, a) => {
      const img = particleSprite(p.m, q.sy < 0), iw = img.width; // 叶宽过 0 的瞬间换成背面贴图（不可见切换）
      ctx.setTransform(base); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(q.sx * k, q.sy * k);
      ctx.globalAlpha = a; ctx.drawImage(img, -iw / 2, -iw / 2);
    };
    ctx.save();
    // 沿速度方向的运动模糊：取同一条轨迹上稍早的几个时刻（确定性，不引入随机）
    if (blur > 0) { for (const [dt, w] of [[27, 0.22], [18, 0.3], [9, 0.4]]) { const g = particleState(p, now - dt); if (g) draw(g, g.alpha * blur * w); } }
    draw(q, q.alpha);
    ctx.restore(); return true;
  });
}
function drawRipples(now) {
  // 点击波纹
  G.ripples = G.ripples.filter(r => {
    const q = rippleState(r, now); if (!q) return false;
    drawRipple(q.x, q.y, q.R, q.lw, q.alpha);
    return true;
  });
}
// 粒子状态（画面与 AE 记录共用）：x,y 屏幕位置，rot 平面内旋转，sx/sy 缩放（sx 含 3D 翻转），alpha
const smooth01 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function particleState(p, now) {
  if (p.vr !== undefined) return particleStateV14(p, now);
  const age = now - p.t0; if (age < 0) return null;
  const k = age / p.life; if (k >= 1) return null;
  const t = age / 1000, T = p.life / 1000;
  // 强 ease-out：出生瞬间“弹”出去，然后像羽毛一样慢慢飘（指数阻尼，drag 越大越早停下）
  const d = Math.max(0.01, S.particleDrag), ease = x => (1 - Math.exp(-d * x)) / (1 - Math.exp(-d));
  const e = ease(k);
  const r = p.r0 + p.dr * e;
  // 旋涡：角速度随阻尼衰减（角度 = 角速度的积分），路径是向外张开的弧线
  const a = p.a + p.va * T * e * 0.85;
  const z = Math.sin(a); // 绕竖直轴：z>0 朝向镜头（略大略亮）
  // 轻柔摆动（垂直于径向的正弦飘动，随时间渐强），两组频率叠加避免机械感
  const swA = (S.particleSwayAmp || 0) * p.tw * smooth01(0, 0.25, k), swF = (S.particleSwayFreq || 0) * Math.PI * 2;
  const sway = swA * (Math.sin(p.sw[0] + swF * p.sw[1] * t) * 0.75 + Math.sin(p.sw[2] + swF * p.sw[3] * t * 1.7) * 0.25);
  const nx = -Math.sin(a), ny = Math.cos(a) * 0.5;
  const x = p.cx + Math.cos(a) * r + nx * sway;
  const y = p.cy + p.depth * p.R * 0.7 * (0.75 + 0.5 * e) + z * r * 0.22 + ny * sway
    - p.up * ease(Math.min(1, k * 1.25)) + S.particleGravity * p.R * k * k; // 先上扬（ease-out）后缓缓下坠
  const persp = 1 + 0.16 * z;
  const sc = smooth01(0, 0.06, k) * (1 - 0.45 * smooth01(0.2, 1, k)) * persp; // 平滑长出 → 渐小
  const kind = particleKind(p.m);
  // 平面自转：匀速 + 低频摆动；3D 翻滚：沿叶长轴翻面（叶宽按余弦变化，过 0 时只剩一条细线），频率带低频变化
  const rot = p.rot + p.vrot * T * (0.35 + 0.65 * e) + 0.35 * Math.sin(p.wob[0] + p.wob[1] * 6.28 * t) * p.wob[2];
  const ph = p.fl + p.vfl * t + 0.8 * Math.sin(p.wob[0] * 1.3 + p.wob[1] * 4.4 * t);
  let sx, sy;
  if (kind === 'spark') { const tw = 0.75 + 0.25 * Math.cos(ph); sx = sy = sc * tw; }
  else { const c = Math.cos(ph); sx = sc * (0.88 + 0.12 * Math.cos(ph * 0.5 + p.wob[2] * 3)); sy = sc * Math.sign(c) * Math.pow(Math.abs(c), 0.6); } // |cos|^0.6：连续过 0，但正面朝镜头的时间更长（参考多数叶片可见叶面）
  const alpha = smooth01(0, 0.04, k) * (1 - smooth01(0.7, 1, k)) * (0.86 + 0.14 * z) * (S.particleOpacity ?? 1);
  return { x, y, rot, sx, sy, alpha: Math.max(0, alpha) };
}
// v14 及以前的粒子（旧录制数据兼容）
function particleStateV14(p, now) {
  const k = (now - p.t0) / p.life; if (k >= 1) return null;
  const t = k * p.life / 1000;
  const r = p.r0 + p.vr * t * (1 - k * 0.4), a = p.a + p.va * t * (1 - k * 0.5);
  const x = p.cx + Math.cos(a) * r, y = p.cy + Math.sin(a) * r * 0.85 + k * k * p.s * 0.8;
  return { x, y, rot: a + Math.PI / 2 * Math.sign(p.va) + p.rot + p.vrot * t * 0.3, sx: 1, sy: 1, alpha: Math.max(0, Math.min(1, k * 6) * (k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35)) };
}
function rippleState(r, now) {
  const k = (now - r.t0) / S.rippleDuration; if (k >= 1) return null;
  return { x: r.x, y: r.y, R: W * S.rippleSize * (0.25 + easeOut(k) * 0.75), lw: S.rippleWidth * U * (1 - k * 0.5), alpha: 1 - k };
}
function drawRipple(x, y, R, lw, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = S.rippleColor; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke();
  ctx.globalAlpha = alpha * 0.25; ctx.fillStyle = S.rippleColor; ctx.fill();
  ctx.restore();
}
function endCardHidesHand(now = performance.now()) {
  return !!(S.endCard && !S.endCardHand && G && G.cleared && (now - G.clearT - S.endDelay) >= 0);
}
function handState() {
  if (!IMG.handImage || HAND.alpha <= 0.01) return null;
  if (endCardHidesHand()) return null;
  const im = IMG.handImage, w = W * S.handSize, h = w * im.height / im.width;
  const p = HAND.press * S.pressDepth;
  return { x: HAND.x, y: HAND.y + p * h * 0.15, rot: S.handRotation, sx: (S.handFlip ? -1 : 1) * (1 - p * 0.5), sy: 1 - p * 0.6, alpha: HAND.alpha, press: HAND.press, w, h };
}
// asset：传入固定状态（导出 AE 素材时在原点绘制、未按下）
function drawHand(asset = null) {
  const q = asset || handState(); if (!q) return;
  const im = IMG.handImage;
  const ax = S.handAnchorX * q.w, ay = S.handAnchorY * q.h;
  ctx.save(); ctx.globalAlpha = q.alpha;
  ctx.translate(q.x, q.y);
  ctx.rotate(q.rot * Math.PI / 180);
  ctx.scale(q.sx, q.sy);
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 18 * U; ctx.shadowOffsetX = 8 * U * (1 - q.press); ctx.shadowOffsetY = 10 * U * (1 - q.press);
  ctx.drawImage(im, -ax, -ay, q.w, q.h);
  ctx.restore();
}
function endButtonRect() { return { x: W / 2, y: H * 0.69, w: W * 0.62, h: H * 0.082 }; }
function endCardState(now) {
  if (!S.endCard || !G || !G.cleared) return null;
  const el = now - G.clearT - S.endDelay; if (el < 0) return null;
  return { el, a: Math.min(1, el / 450), icon: 0.85 + 0.15 * easeBack(Math.min(1, el / 500)), pul: 1 + 0.04 * Math.sin(el / 160) };
}
// part：'all' | 'bg' | 'glow' | 'icon' | 'title' | 'button'（导出 AE 时分部件绘制，部件模式下不做淡入/缩放/闪烁）
function drawEndCard(now, part = 'all') {
  const P = x => part === 'all' || part === x;
  let el, a;
  if (part === 'all') { const q = endCardState(now); if (!q) return; el = q.el; a = q.a; } else { el = 1e9; a = 1; }
  ctx.save(); ctx.globalAlpha = a;
  if (P('bg') && THEME.endBg) THEME.endBg(ctx, themeEnv(), part === 'all', el);
  else if (P('bg')) {
  const g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.45, H * 0.7);
  g.addColorStop(0, S.endBg1); g.addColorStop(1, S.endBg2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 顶部挂灯与星星（视频结束页同款）
  ctx.save(); ctx.strokeStyle = 'rgba(255,230,150,.35)'; ctx.lineWidth = 1.2 * U;
  for (const [x1, x2, sag] of [[-0.05, 0.55, 0.06], [0.45, 1.05, 0.07], [0.1, 0.9, 0.11]]) {
    ctx.beginPath(); ctx.moveTo(W * x1, 0); ctx.quadraticCurveTo(W * (x1 + x2) / 2, H * sag * 2, W * x2, 0); ctx.stroke();
    for (let k = 1; k < 12; k++) { const tt = k / 12, x = lerp(W * x1, W * x2, tt), y = H * sag * 2 * 2 * tt * (1 - tt); ctx.fillStyle = `rgba(255,236,170,${part === 'all' ? 0.5 + 0.5 * Math.sin(el / 200 + k) : 0.75})`; ctx.beginPath(); ctx.arc(x, y, 2 * U, 0, 7); ctx.fill(); }
  }
  for (const [x, len] of [[0.06, 0.2], [0.14, 0.13], [0.92, 0.2], [0.96, 0.08]]) {
    ctx.beginPath(); ctx.moveTo(W * x, 0); ctx.lineTo(W * x, H * len); ctx.stroke(); star(W * x, H * len + 8 * U, 11 * U, '#f5d36b');
  }
  ctx.restore();
  }
  // 图标背后的光晕
  const gy = H * 0.3;
  if (P('glow')) {
  const hg = ctx.createRadialGradient(W / 2, gy, 0, W / 2, gy, W * 0.42);
  const eg = THEME.endGlow || ['rgba(255,255,170,.75)', 'rgba(200,255,120,.25)', 'rgba(200,255,120,0)'];
  hg.addColorStop(0, eg[0]); hg.addColorStop(0.45, eg[1]); hg.addColorStop(1, eg[2]);
  ctx.fillStyle = hg; ctx.fillRect(0, gy - W * 0.45, W, W * 0.9);
  }
  // 图标
  if (P('icon')) {
  const s = W * 0.41 * (part === 'all' ? 0.85 + 0.15 * easeBack(Math.min(1, el / 500)) : 1), ix = W / 2 - s / 2, iy = gy - s / 2;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24 * U; ctx.shadowOffsetY = 8 * U;
  rr(ctx, ix, iy, s, s, s * 0.2); const bgd = ctx.createLinearGradient(0, iy, 0, iy + s); bgd.addColorStop(0, '#ffe58a'); bgd.addColorStop(1, '#b8801e'); ctx.fillStyle = bgd; ctx.fill(); ctx.restore();
  ctx.save(); rr(ctx, ix + s * 0.03, iy + s * 0.03, s * 0.94, s * 0.94, s * 0.18); ctx.clip();
  if (IMG.endIcon) ctx.drawImage(IMG.endIcon, ix, iy, s, s);
  else if (THEME.endIcon) THEME.endIcon(ctx, ix, iy, s, themeEnv());
  else {
    const ig = ctx.createLinearGradient(0, iy, 0, iy + s); ig.addColorStop(0, '#3ed36a'); ig.addColorStop(1, '#0b7a33'); ctx.fillStyle = ig; ctx.fillRect(ix, iy, s, s);
    const domino = (x, y, ang, pips) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); const dw = s * 0.26, dh = s * 0.5;
      ctx.fillStyle = '#d9d4c4'; rr(ctx, -dw / 2 + 4 * U, -dh / 2 + 6 * U, dw, dh, dw * 0.15); ctx.fill();
      ctx.fillStyle = '#fbfaf5'; rr(ctx, -dw / 2, -dh / 2, dw, dh, dw * 0.15); ctx.fill();
      ctx.fillStyle = '#333'; ctx.fillRect(-dw * 0.38, -1.5 * U, dw * 0.76, 3 * U);
      pips.forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px * dw, py * dh, dw * 0.09, 0, 7); ctx.fill(); });
      ctx.restore();
    };
    domino(ix + s * 0.38, iy + s * 0.46, -0.35, [[-.22, -.36], [.22, -.14], [0, -.25], [-.22, .14], [.22, .36]]);
    domino(ix + s * 0.63, iy + s * 0.44, 0.3, [[0, -.25], [-.22, .14], [.22, .36], [0, .25]]);
    ctx.fillStyle = '#d8202a'; ctx.beginPath(); ctx.ellipse(ix + s / 2, iy + s * 1.02, s * 0.62, s * 0.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe14d'; ctx.font = `900 ${s * 0.16}px "Arial Black","Microsoft YaHei",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('cash', ix + s / 2, iy + s * 0.9);
  }
  ctx.restore();
  }
  // 标题：金色渐变 + 深红描边
  const ty = H * 0.53;
  if (P('title')) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = THEME.fonts?.title ? `${THEME.fonts.titleWeight || 700} ${W * 0.11}px ${THEME.fonts.title}` : `900 ${W * 0.105}px "Arial Black","Microsoft YaHei",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.strokeStyle = '#7a1d0c'; ctx.lineWidth = W * 0.02; ctx.strokeText(S.endTitle, W / 2, ty + 3 * U);
  const tg = ctx.createLinearGradient(0, ty - W * 0.05, 0, ty + W * 0.05); tg.addColorStop(0, '#fff6b0'); tg.addColorStop(0.5, S.endTitleColor); tg.addColorStop(1, '#e08a12');
  ctx.fillStyle = tg; ctx.fillText(S.endTitle, W / 2, ty);
  }
  // 按钮
  if (P('button')) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const b = endButtonRect(), pul = part === 'all' ? 1 + 0.04 * Math.sin(el / 160) : 1;
  ctx.save(); ctx.translate(b.x, b.y); ctx.scale(pul, pul);
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 16 * U; ctx.shadowOffsetY = 6 * U;
  const bg = ctx.createLinearGradient(0, -b.h / 2, 0, b.h / 2); bg.addColorStop(0, shade(S.endBtnColor, 1.25)); bg.addColorStop(1, shade(S.endBtnColor, 0.75));
  ctx.fillStyle = bg; rr(ctx, -b.w / 2, -b.h / 2, b.w, b.h, b.h / 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#e8b830'; ctx.lineWidth = 4 * U; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.28)'; rr(ctx, -b.w / 2 + b.h * 0.25, -b.h / 2 + b.h * 0.1, b.w - b.h * 0.5, b.h * 0.32, b.h * 0.16); ctx.fill();
  if (THEME.endButtonText) THEME.endButtonText(ctx, b, themeEnv());
  else { ctx.fillStyle = '#fff'; ctx.font = `bold ${b.h * 0.45}px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif`; ctx.fillText(S.endButton, 0, 2 * U); }
  ctx.restore();
  }
  ctx.restore();
}

// 开场时棋盘整体压暗（视频 0.5s 起变暗，字母出完后恢复）
function introDimState(now) {
  if (!S.introWord || !G || S.introDim <= 0) return 0;
  const el = (now - G.introT0) / 1000, st = S.introDelay, end = S.introDelay + S.introDuration;
  if (el < st || el > end + 0.3) return 0;
  return S.introDim * (el < st + 0.15 ? (el - st) / 0.15 : el < end ? 1 : 1 - (el - end) / 0.3);
}
function drawIntroDim(now) {
  const a = introDimState(now); if (a <= 0) return;
  ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(VP.x, VP.y, VP.w, VP.h);
}
let lastFrame = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  // tweens
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; const k = Math.min(1, (now - tw.t0) / tw.dur);
    tw.fn(tw.ease(k), k); if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  if (G) {
    let changed = false;
    for (const t of G.tiles) { if (Math.abs(t.dark - t.darkTarget) > 0.002) { t.dark += (t.darkTarget - t.dark) * Math.min(1, dt * 10); changed = true; } }
    if (changed) applyDark();
    if (!G.cleared && G.tiles.length) {
      const wordWin = S.winCondition === 'word' && G.word.length > 0;
      const done = wordWin ? G.letterCount >= G.word.length : G.tiles.every(t => t.state === 'gone');
      if (done && !G.sprites.some(s => s.moving)) { if (!G.winT) G.winT = now; if (now - G.winT > (wordWin ? 1000 : 0)) onCleared(); }
    }
  }
  updateCursor();
  if (endCardHidesHand(now)) { HAND.visible = false; HAND.alpha = 0; }
  else HAND.alpha += ((HAND.visible ? 1 : 0) - HAND.alpha) * Math.min(1, dt * 12);
  // draw
  const clearAbove = S.clearAnimLayer !== 'belowHand';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawBackground();
  if (G && G.shake) { const k = (now - G.shake.t0) / 220; if (k >= 1) G.shake = null; else { const a = G.shake.amp * (1 - k); ctx.setTransform(1, 0, 0, 1, Math.sin(k * 60) * a, Math.cos(k * 47) * a * 0.6); } }
  if (G) {
    renderer.render(scene, camera);
    ctx.drawImage(glCanvas, VP.x, VP.y, VP.w, VP.h);
    drawIntroDim(now);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawTopBar(now);
  if (G) {
    // 托盘内的牌（消除动画的飞行牌按设置画在手指之上或之下）
    drawSprites(sp => !isClearSprite(sp));
    if (!clearAbove) { drawSprites(isClearSprite); drawEffects(now); }
    drawRipples(now);
  }
  drawDisclaimer();
  if (G) drawEndCard(now);
  drawHand();
  if (G && clearAbove) { drawSprites(isClearSprite); drawEffects(now); } // v16：消除动画（飞行/碰撞牌、接缝光、树叶）在手指之上
  if (REC.rec) updateRecTime();
  if (AE.active()) { AE.sample(now); updateAEButtons(); }
  requestAnimationFrame(frame);
}

// ---------------- Input ----------------
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
function pickTile(p) {
  if (!G) return null;
  // 先检测选中浮起的 2D 牌
  for (const id of G.selected) { const sp = G.tiles[id].sprite; if (sp && Math.abs(p.x - sp.x) < sp.w * sp.scale / 2 && Math.abs(p.y - sp.y) < sp.h * sp.scale / 2) return G.tiles[id]; }
  if (p.y < VP.y || p.y > VP.y + VP.h) return null;
  const nd = new THREE.Vector2((p.x - VP.x) / VP.w * 2 - 1, -((p.y - VP.y) / VP.h * 2 - 1));
  raycaster.setFromCamera(nd, camera);
  const objs = [];
  for (const t of G.tiles) if ((t.state === 'board' || t.state === 'selected') && t.obj && t.obj.visible) objs.push(...t.pick);
  const hits = raycaster.intersectObjects(objs, false);
  if (!hits.length) return null;
  let best = null;
  for (const h of hits) { const t = h.object.userData.tile; if (!best || t.layer > best.layer) best = t; }
  return best;
}
canvas.addEventListener('pointermove', e => {
  if (AUTO.running || !S.manualHand) return;
  const p = canvasPoint(e); HAND.x = p.x; HAND.y = p.y; HAND.visible = true; if (S.hideCursor) HAND.alpha = 1; // 鼠标已隐藏：手指立即出现，不淡入
});
canvas.addEventListener('pointerleave', () => { if (!AUTO.running) HAND.visible = false; });
canvas.addEventListener('pointerdown', e => {
  if (AUTO.running) return;
  const p = canvasPoint(e);
  if (S.manualHand) { HAND.x = p.x; HAND.y = p.y; HAND.visible = true; if (S.hideCursor) HAND.alpha = 1; handPress(null, 1.5); }
  else addRipple(p.x, p.y);
  const t = pickTile(p);
  if (t) clickTile(t);
});

// ---------------- Panel ----------------
const panelBody = $('#panelBody');
const controls = {};
let regenTimer = 0;
function scheduleRegen() { clearTimeout(regenTimer); regenTimer = setTimeout(() => newGame(true), 180); }
// ---------------- 主题切换 ----------------
function themeDiff(id) { const d = themeDefaults(DEFAULTS, id), o = {}; for (const k of THEME_KEYS) if (JSON.stringify(S[k]) !== JSON.stringify(d[k])) o[k] = S[k]; return o; }
function setTheme(id) {
  if (!THEMES[id]) id = 'guofeng';
  const old = S.theme || 'guofeng';
  if (id !== old) {
    // 先把当前主题下用户改过的外观存起来，再套用新主题默认值 + 用户在新主题下的改动
    S.themeStore = { ...(S.themeStore || {}), [old]: themeDiff(old) };
    Object.assign(S, themeDefaults(DEFAULTS, id), S.themeStore[id] || {});
    S.theme = id;
  }
  THEME = THEMES[id];
  refreshTheme();
}
function resetTheme() {
  Object.assign(S, themeDefaults(DEFAULTS, S.theme));
  S.themeStore = { ...(S.themeStore || {}) }; delete S.themeStore[S.theme];
  refreshTheme(); toast('已恢复「' + THEME.name + '」主题默认外观');
}
// 实时重绘：不重开棋盘，保留当前对局进度（棋盘牌、托盘、飞行中的牌都换成新主题的牌面）
function refreshTheme() {
  ['bgImage', 'logoImage', 'endIcon'].forEach(loadImg);
  if (G) { clearFaceCache(); buildMeshes(); fitCamera(); }
  saveSettings(); syncPanel();
}
function onSetting(item, v) {
  if (item.k === 'theme') { setTheme(v); return; }
  if (/^press/.test(item.k) && G) { S[item.k] = v; saveSettings(); for (const t of G.tiles) { if (t.state === 'selected') { t.pressTok = (t.pressTok || 0) + 1; t.press = S.pressEnabled ? 1 : 0; } applyPress(t); } applyDark(); return; }
  S[item.k] = v; saveSettings();
  if (item.type === 'file') loadImg(item.k);
  if (item.kind === 'regen') scheduleRegen();
  else if (item.kind === 'mesh') { if (G) { clearFaceCache(); buildMeshes(); fitCamera(); } }
  else if (item.kind === 'res') { if (REC.rec) { toast('录制中不能修改分辨率'); return; } setResolution(); if (G) { G.sprites.forEach(s => { }); } newGame(true); }
  else { if (['cameraTilt', 'cameraFov', 'boardScale', 'boardOffsetY', 'boardOffsetX', 'cameraOrtho', 'sideRevealX', 'sideRevealY', 'centerOn'].includes(item.k)) { if (G) applyShear(); fitCamera(); } if (item.k === 'topBarHeight') layoutViewport(); if ((item.k === 'blockedDarken' || item.k === 'depthDarken') && G) refreshDark(); }
  if (item.k.startsWith('hand')) drawHandPreview();
  if (item.k === 'manualHand') updateCursor();
}
function fmt(v, step) { return step && step < 1 ? (+v).toFixed(String(step).split('.')[1].length) : v; }
function buildPanel() {
  panelBody.innerHTML = '';
  for (const grp of SCHEMA) {
    const det = document.createElement('details'); if (grp.open) det.open = true;
    const sum = document.createElement('summary'); sum.textContent = grp.group; det.appendChild(sum);
    for (const it of grp.items) {
      const row = document.createElement('div'); row.className = 'row';
      const lab = document.createElement('label'); lab.textContent = it.label; row.appendChild(lab);
      let el, val;
      if (it.type === 'range') {
        el = document.createElement('input'); el.type = 'range'; el.min = it.min; el.max = it.max; el.step = it.step;
        val = document.createElement('input'); val.type = 'number'; val.className = 'val'; val.step = it.step;
        el.oninput = () => { val.value = fmt(el.value, it.step); onSetting(it, +el.value); };
        val.onchange = () => { el.value = val.value; onSetting(it, +val.value); };
        row.appendChild(el); row.appendChild(val);
      } else if (it.type === 'number') {
        el = document.createElement('input'); el.type = 'number'; el.onchange = () => onSetting(it, +el.value);
        row.appendChild(el);
        if (it.k === 'seed') { const b = document.createElement('button'); b.textContent = '随机'; b.onclick = () => newGame(false); row.appendChild(b); }
      } else if (it.type === 'color') {
        el = document.createElement('input'); el.type = 'color'; el.oninput = () => onSetting(it, el.value); row.appendChild(el);
      } else if (it.type === 'checkbox') {
        el = document.createElement('input'); el.type = 'checkbox'; el.onchange = () => onSetting(it, el.checked); row.appendChild(el);
      } else if (it.type === 'switch') {
        el = document.createElement('input'); el.type = 'checkbox'; el.className = 'switch-input';
        const wrap = document.createElement('label'); wrap.className = 'switch';
        const slider = document.createElement('span'); slider.className = 'slider';
        wrap.appendChild(el); wrap.appendChild(slider);
        el.onchange = () => { onSetting(it, el.checked); syncHandAvoidDeps(); };
        row.appendChild(wrap);
      } else if (it.type === 'select') {
        el = document.createElement('select');
        it.options.forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; el.appendChild(o); });
        el.onchange = () => onSetting(it, it.num ? +el.value : el.value); row.appendChild(el);
      } else if (it.type === 'text') {
        el = document.createElement('input'); el.type = 'text'; if (it.placeholder) el.placeholder = it.placeholder;
        el.onchange = () => onSetting(it, el.value); row.appendChild(el);
      } else if (it.type === 'textarea') {
        el = document.createElement('textarea'); el.rows = 2; el.oninput = () => onSetting(it, el.value); row.appendChild(el);
      } else if (it.type === 'button') {
        el = document.createElement('button'); el.textContent = it.text || '▶ 试听'; if (it.action) el.id = 'btn_' + it.action;
        el.onclick = it.action ? () => BUTTON_ACTIONS[it.action]() : () => { resumeAudio().then(() => SFX_NAMES.forEach((n, i) => setTimeout(() => sfx(n), i * 650))); };
        row.appendChild(el);
      } else if (it.type === 'file') {
        el = document.createElement('input'); el.type = 'file'; el.accept = 'image/*';
        el.onchange = () => { const f = el.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => onSetting(it, fr.result); fr.readAsDataURL(f); };
        const clr = document.createElement('button'); clr.textContent = it.k === 'handImage' ? '清除已上传手指' : '清除'; if (it.k === 'handImage') clr.id = 'btnClearHand'; clr.onclick = () => { el.value = ''; onSetting(it, ''); };
        row.appendChild(el); row.appendChild(clr);
      }
      row.classList.add('t-' + it.type);
      controls[it.k] = { it, el, val };
      det.appendChild(row);
      if (it.k === 'handImage') {
        const pr = document.createElement('div'); pr.className = 'row handprev';
        pr.innerHTML = '<label>手指预览（点击图片设置指尖锚点）</label><canvas id="handPrev" width="150" height="190"></canvas>';
        det.appendChild(pr);
      }
    }
    panelBody.appendChild(det);
  }
  syncPanel();
  const hp = $('#handPrev');
  hp.addEventListener('click', e => {
    const im = IMG.handImage; if (!im) return;
    const r = hp.getBoundingClientRect(); const box = handPrevBox();
    const x = (e.clientX - r.left) * hp.width / r.width, y = (e.clientY - r.top) * hp.height / r.height;
    S.handAnchorX = Math.max(0, Math.min(1, (x - box.x) / box.w)); S.handAnchorY = Math.max(0, Math.min(1, (y - box.y) / box.h));
    saveSettings(); syncPanel(); drawHandPreview();
  });
}
function handPrevBox() {
  const hp = $('#handPrev'), im = IMG.handImage; const k = Math.min(hp.width / im.width, hp.height / im.height);
  return { x: (hp.width - im.width * k) / 2, y: (hp.height - im.height * k) / 2, w: im.width * k, h: im.height * k };
}
function drawHandPreview() {
  const hp = $('#handPrev'); if (!hp) return;
  const c = hp.getContext('2d'); c.clearRect(0, 0, hp.width, hp.height);
  c.fillStyle = '#333'; c.fillRect(0, 0, hp.width, hp.height);
  if (!IMG.handImage) {
    c.fillStyle = '#999'; c.font = '13px sans-serif'; c.textAlign = 'center';
    c.fillText('未上传手指图片', hp.width / 2, hp.height / 2 - 10); c.fillText('（不显示手指，', hp.width / 2, hp.height / 2 + 10); c.fillText('仅显示点击波纹）', hp.width / 2, hp.height / 2 + 28);
    return;
  }
  const b = handPrevBox(); c.drawImage(IMG.handImage, b.x, b.y, b.w, b.h);
  const x = b.x + S.handAnchorX * b.w, y = b.y + S.handAnchorY * b.h;
  c.strokeStyle = '#0f0'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 8, y); c.lineTo(x + 8, y); c.moveTo(x, y - 8); c.lineTo(x, y + 8); c.stroke();
  c.beginPath(); c.arc(x, y, 5, 0, 7); c.stroke();
}
function syncPanel() {
  for (const k in controls) {
    const { it, el, val } = controls[k]; const v = S[k];
    if (it.type === 'checkbox' || it.type === 'switch') el.checked = !!v;
    else if (it.type === 'file' || it.type === 'button') { }
    else el.value = v;
    if (val) val.value = fmt(v, it.step);
  }
  syncHandAvoidDeps();
}
const HAND_AVOID_DEPS = ['handAvoidRadius', 'handAvoidDir', 'handAvoidDuration', 'handAvoidWait', 'handAvoidHold'];
function syncHandAvoidDeps() {
  const on = !!S.handAvoid;
  for (const k of HAND_AVOID_DEPS) {
    const c = controls[k]; if (!c || !c.el) continue;
    const row = c.el.closest('.row'); if (row) row.classList.toggle('dimmed', !on);
    c.el.disabled = !on;
    if (c.val) c.val.disabled = !on;
  }
}
function updateButtons() {
  $('#btnAuto').textContent = AUTO.running ? '⏹ 停止自动通关' : '▶ 自动通关';
  $('#btnAuto').classList.toggle('on', AUTO.running);
  $('#btnRec').textContent = REC.rec ? '⏹ 停止录制' : '⏺ 开始录制';
  $('#btnRec').classList.toggle('on', !!REC.rec);
}
function updateRecTime() { $('#recInfo').textContent = `录制中 ${((performance.now() - REC.t0) / 1000).toFixed(1)}s · ${REC.mime.split(';')[0]} · ${W}×${H}@${S.recFps}`; }
function renderRecList() {
  const box = $('#recList'); box.innerHTML = '';
  $('#recInfo').textContent = REC.list.length ? '' : '尚无录制';
  REC.list.forEach(r => { const a = document.createElement('a'); a.href = r.url; a.download = r.name; a.textContent = `⬇ ${r.name} (${(r.size / 1048576).toFixed(1)}MB)`; box.appendChild(a); });
}
function updateStatus() {
  if (!G) return;
  const left = G.tiles.filter(t => t.state !== 'gone').length;
  const free = G.tiles.filter(t => t.state === 'board' && isFree(t)).length;
  $('#status').textContent = (G.cleared ? '🎉 通关！' : '') + `剩余 ${left}/${G.tiles.length} 张 · 可点击 ${free} 张 · 层数 ${BOUNDS.maxL + 1} · 目标字母 ${G.letterCount}/${G.word.length}`;
}
let toastTimer = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }

$('#btnNew').onclick = () => newGame(true);
$('#btnSeed').onclick = () => newGame(false);
$('#btnAuto').onclick = () => { resumeAudio(); autoSolve(); };
$('#btnRec').onclick = () => REC.rec ? stopRecording() : startRecording(false);
$('#btnShot').onclick = () => canvas.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mahjong_screenshot.png'; a.click(); });
$('#btnExport').onclick = () => {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mahjong-settings.json'; a.click();
};
// 导入的 JSON 原样采用（不做旧默认值升级）
function importJSON(txt) { const j = migrate(JSON.parse(txt), false); S = { ...DEFAULTS, ...themeDefaults(DEFAULTS, j.theme), ...j }; applyAll(); }
$('#btnImport').onclick = () => $('#importFile').click();
$('#importFile').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(txt => { try { importJSON(txt); toast('设置已导入'); } catch (err) { toast('导入失败：' + err.message); } });
  e.target.value = '';
};
$('#btnReset').onclick = () => { if (!confirm('确定恢复全部默认设置？')) return; S = { ...DEFAULTS, ...themeDefaults(DEFAULTS, S.theme), theme: S.theme, themeStore: {} }; applyAll(); toast('已恢复默认'); };
function showMigrationBanner() {
  if (!MIGRATED) return;
  const bar = document.createElement('div'); bar.id = 'migrateBanner';
  bar.innerHTML = `<b>已升级到新版</b>：检测到旧版本保存的设置，已把 ${MIGRATED.keys.length} 项棋盘布局 / 阴影 / 配对动画参数恢复为新版默认（与参考视频一致、顶层严格居中）。
    <button id="mbUndo">撤销，用回旧值</button><button id="mbReset">全部恢复默认</button><button id="mbClose">知道了</button>`;
  document.body.appendChild(bar);
  bar.querySelector('#mbUndo').onclick = () => { Object.assign(S, MIGRATED.old); applyAll(); bar.remove(); toast('已恢复旧版数值'); };
  bar.querySelector('#mbReset').onclick = () => { S = { ...DEFAULTS }; applyAll(); bar.remove(); toast('已恢复全部默认'); };
  bar.querySelector('#mbClose').onclick = () => bar.remove();
  window.__migrated = MIGRATED;
}
function applyAll() { THEME = THEMES[S.theme] || THEMES.guofeng; clearFaceCache(); saveSettings(); syncPanel(); ['bgImage', 'logoImage', 'endIcon', 'handImage'].forEach(loadImg); setResolution(); newGame(true); }

// ---------------- 导出 AE 工程 ----------------
// 单张牌的“隔离渲染”：只显示这一张牌的指定部件，用真实 three.js 相机渲染一帧，裁出来作为 AE 素材（锚点=牌面中心）
function isolateRender(t, o) {
  const vis = G.tiles.map(x => x.obj.visible);
  G.tiles.forEach(x => { x.obj.visible = false; });
  t.obj.visible = true;
  const ch = t.obj.children, cvis = ch.map(c => c.visible);
  const [body, face, sh, ls] = ch;
  body.visible = !!o.body; face.visible = !!o.face; sh.visible = !!o.sh; if (ls) ls.visible = !!o.ls;
  const fm = t.mFace.map, fc = t.mFace.color.clone(), sc = t.mSlab.color.clone(), osc = t.obj.scale.clone(), opos = t.obj.position.clone();
  t.obj.scale.set(1, 1, 1); if (t.obj.userData.base) t.obj.position.set(t.obj.userData.base.x, t.obj.userData.base.y, t.obj.userData.base.z);
  t.mFace.map = faceTexture(o.sel ? t.key + '#sel' : t.key);
  if (o.black) { t.mFace.color.setRGB(0, 0, 0); t.mSlab.color.setRGB(0, 0, 0); }
  else { t.mFace.color.setRGB(1, 1, 1); if (o.sel) t.mSlab.color.set(S.selectTint); else t.mSlab.color.setRGB(1, 1, 1); }
  renderer.render(scene, camera);
  const full = document.createElement('canvas'); full.width = VP.w; full.height = VP.h;
  const g = full.getContext('2d'); g.drawImage(glCanvas, 0, 0, VP.w, VP.h);
  // 还原
  t.mFace.map = fm; t.mFace.color.copy(fc); t.mSlab.color.copy(sc); t.obj.scale.copy(osc); t.obj.position.copy(opos);
  ch.forEach((c, i) => { c.visible = cvis[i]; });
  G.tiles.forEach((x, i) => { x.obj.visible = vis[i]; });
  // 裁切
  const p = tileScreen(t), cx = p.x - VP.x, cy = p.y - VP.y, R0 = Math.max(p.w, p.h) * 1.6;
  const x0 = Math.max(0, Math.floor(cx - R0)), y0 = Math.max(0, Math.floor(cy - R0)), x1 = Math.min(VP.w, Math.ceil(cx + R0)), y1 = Math.min(VP.h, Math.ceil(cy + R0));
  const d = g.getImageData(x0, y0, x1 - x0, y1 - y0), w = x1 - x0;
  let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
  for (let y = 0; y < d.height; y++) for (let x = 0; x < w; x++) if (d.data[(y * w + x) * 4 + 3]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  if (bx1 < 0) { bx0 = by0 = 0; bx1 = by1 = 0; }
  const out = document.createElement('canvas'); out.width = bx1 - bx0 + 1; out.height = by1 - by0 + 1;
  out.getContext('2d').drawImage(full, -(x0 + bx0), -(y0 + by0));
  return { canvas: out, ax: cx - (x0 + bx0), ay: cy - (y0 + by0) };
}
const AE = createAERecorder({
  env: () => ({ S, G, W, H, U, VP, IMG, canvas }),
  renderTile: (t, sel) => isolateRender(t, { body: true, face: true, sel }),
  tilePress: t => { if (!G || !t.obj || (!(t.press) && (t.selS || 1) === 1)) return { dx: 0, dy: 0, s: 1 }; const q = tileScreenPressed(t); return { dx: q.dx, dy: q.dy, s: q.s }; },
  renderTileShared: t => ({ shadow: isolateRender(t, { sh: true }), sil: isolateRender(t, { body: true, face: true, black: true }), band: S.leftShadow > 0 ? isolateRender(t, { ls: true }) : null }),
  tileScreen, particleState, rippleState, seamState, flashState, introLetterStates, introDimState, wordGlowState, endCardState, endCardHidesHand, handState, endButtonRect,
  withCtx(c2d, fn) { const old = ctx; ctx = c2d; try { fn(); } finally { ctx = old; } },
  withTransform(x, y, fn) { ctx.save(); ctx.translate(x, y); try { fn(); } finally { ctx.restore(); } },
  drawBackground, drawTopBar, drawDisclaimer, drawTile2D, drawLeaf: drawParticleShape, drawRipple, drawSeamBand, drawSeamGlow, drawFlash, star, drawWordGlowRing, drawEndCard, drawHand,
});
let aeLastRec = null;
function aeStart(opt) { AE.start(opt); updateAEButtons(); toast('开始记录 AE 时间轴'); }
async function aeStopAndExport() {
  const rec = AE.stop(); updateAEButtons();
  if (!rec || !rec.frames) { toast('没有记录到内容'); return null; }
  aeLastRec = rec;
  return aeExport(rec);
}
async function aeExport(rec = aeLastRec) {
  if (!rec) { toast('请先记录一段（自动通关或手动游玩）'); return null; }
  toast('正在生成 AE 工程包…');
  try {
    const r = await AE.exportZip(S, rec);
    const url = URL.createObjectURL(r.blob);
    const a = document.createElement('a'); a.href = url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove();
    window.__lastAEExport = { name: r.name, url, size: r.blob.size, stats: r.stats, snaps: r.snaps };
    toast(`AE 工程已导出：${r.name}（${(r.blob.size / 1048576).toFixed(1)} MB，${r.stats.layers} 个图层）`);
    return window.__lastAEExport;
  } catch (e) { console.error(e); toast('导出失败：' + e.message); return null; }
}
// v20：导出 3D 动画（glTF/FBX/Blender）。复用 AE 记录（同一时间轴），没有记录时提示先记录
async function export3DZip(rec = aeLastRec) {
  if (!rec) { toast('请先用“开始记录”记录一段（自动通关或手动游玩）'); return null; }
  toast('正在生成 3D 动画包（glTF）…');
  try {
    const fps = +S.export3dFps || 30;
    const S2 = { ...S, aeFps: fps, aeSize: 'canvas', aeSampling: 'bake', aeGroupLayers: true, aeNames: 'en', aeAudio: 'both', aeLeaves: S.export3dParticles === false ? 'off' : 'layers' };
    const ae = await AE.exportZip(S2, rec);
    const r = await export3D({ S, rec, aeResult: ae, api: { tile3D, tileShear, tileScreen, faceCanvas: (k, sel) => sel ? faceCanvasSel(k) : faceCanvas(k) } });
    const url = URL.createObjectURL(r.blob);
    const a = document.createElement('a'); a.href = url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove();
    window.__last3DExport = { name: r.name, url, size: r.blob.size, stats: r.stats, duration: r.duration, fps: r.fps, glbSize: r.glbSize, snaps: ae.snaps };
    toast(`3D 动画已导出：${r.name}（${(r.blob.size / 1048576).toFixed(1)} MB，${r.stats.tiles} 张牌，${r.stats.quads} 个平面）`);
    return window.__last3DExport;
  } catch (e) { console.error(e); toast('3D 导出失败：' + e.message); return null; }
}
const BUTTON_ACTIONS = {
  export3d: () => export3DZip(),
  aeToggle: () => AE.active() ? aeStopAndExport() : aeStart(),
  aeExport: () => aeExport(),
  resetTheme: () => resetTheme(),
};
function updateAEButtons() {
  const b = document.getElementById('btn_aeToggle'); if (!b) return;
  b.textContent = AE.active() ? `■ 停止并导出（${AE.elapsed().toFixed(1)}s）` : '● 开始记录';
  b.classList.toggle('on', AE.active());
}

// 供测试/外部脚本使用
window.__app = {
  setTheme, resetTheme, THEMES, get theme() { return S.theme; }, faceCanvas, drawTile2DTo(c2d, ...a) { const old = ctx; ctx = c2d; try { drawTile2D(...a); } finally { ctx = old; } },
  drawPart(c2d, fn, ...args) { const old = ctx; ctx = c2d; try { ({ drawEndCard, drawTopBar, drawBackground })[fn](...args); } finally { ctx = old; } },
  AE, aeStart, aeStopAndExport, aeExport, export3DZip, get aeLastRec() { return aeLastRec; },
  get S() { return S; }, get G() { return G; }, get HAND() { return HAND; }, zoneIntrude, avoidRadius, get AUTO() { return AUTO; }, get REC() { return REC; },
  setSetting(k, v) { const it = SCHEMA.flatMap(g => g.items).find(i => i.k === k); if (it) { onSetting(it, v); syncPanel(); } else S[k] = v; },
  newGame, autoSolve, startRecording, stopRecording, clickTile, tileScreen, tileScreenPressed, spawnParticles, particleState, isFree, importJSON, get VP() { return VP; }, audioState, sfx, resumeAudio,
  endCardState, endCardHidesHand, handState, endButtonRect,
};

buildPanel();
drawHandPreview();
showMigrationBanner();
setResolution();
resetHand();
newGame(true);
renderRecList();
updateButtons();
requestAnimationFrame(frame);
// 内置字体加载完成后重绘牌面纹理（data URL，通常几十毫秒内完成）
loadFonts().then(() => { window.__fontsReady = true; if (G) { clearFaceCache(); buildMeshes(); } });
