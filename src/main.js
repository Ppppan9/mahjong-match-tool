import * as THREE from 'three';
import { DEFAULTS, SCHEMA } from './settings.js';
import { drawFaceCanvas, roundRect as rr, shade, hexRgb } from './faces.js';
import { generateBoard, solve, repairPartition, validatePartition, isTarget, targetIndex, targetChar, mulberry32 } from './board.js';
import { DEFAULT_HAND_SVG } from './hand.js';

const LS_KEY = 'mahjongTool.settings.v1';
let S = loadSettings();
function loadSettings() {
  try { const j = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); return { ...DEFAULTS, ...j }; } catch (e) { return { ...DEFAULTS }; }
}
let saveTimer = 0;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { toast('本地保存失败（图片可能过大），请用“导出设置”保存'); }
  }, 300);
}

// ---------------- DOM ----------------
const $ = s => document.querySelector(s);
const canvas = $('#stage');
const ctx = canvas.getContext('2d');
let W = 720, H = 1280, U = 1;
const glCanvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
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
  const src = key === 'handImage' ? (S.handImage || 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(DEFAULT_HAND_SVG)) : S[key];
  if (!src) { IMG[key] = null; return; }
  const im = new Image();
  im.onload = () => { IMG[key] = im; if (key === 'handImage') drawHandPreview(); };
  im.src = src;
}
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
  camera.aspect = VP.w / VP.h;
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
    faceCache.set(key, drawFaceCanvas(S, k2, fw, fh, isTarget(key) ? targetColorFor(key) : null));
  }
  return faceCache.get(key);
}
function faceTexture(key) {
  if (!texCache.has(key)) {
    const t = new THREE.CanvasTexture(faceCanvas(key));
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
    word: b.word, order: b.order, tw: b.tw, th: b.th,
    selected: [], tray: new Array(S.slotCount).fill(null), sprites: [], particles: [], ripples: [], flashes: [],
    cleared: false, clearT: 0, wordDoneT: 0, introT0: performance.now(), touched: false, letterCount: 0,
  };
  computeBounds();
  buildMeshes();
  refreshDark(true);
  fitCamera();
  updateStatus();
}
function computeBounds() {
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, maxL = 0;
  for (const t of G.tiles) { minx = Math.min(minx, t.x - G.tw / 2); maxx = Math.max(maxx, t.x + G.tw / 2); miny = Math.min(miny, t.y - G.th / 2); maxy = Math.max(maxy, t.y + G.th / 2); maxL = Math.max(maxL, t.layer); }
  BOUNDS = { minx, maxx, miny, maxy, maxL };
}
function fitCamera() {
  if (!BOUNDS) return;
  const b = BOUNDS;
  const cx = (b.minx + b.maxx) / 2, cy = (b.miny + b.maxy) / 2;
  const bw = b.maxx - b.minx, bh = (b.maxy - b.miny) + S.tileThick * (b.maxL + 1) * Math.sin(S.cameraTilt * Math.PI / 180);
  camera.fov = S.cameraFov; camera.aspect = VP.w / VP.h;
  const t = Math.tan(S.cameraFov * Math.PI / 360);
  let d = Math.max((bh / 2) / t, (bw / 2) / (t * camera.aspect)) / S.boardScale;
  d += S.tileThick * (b.maxL + 1);
  const tilt = S.cameraTilt * Math.PI / 180;
  const ty = cy + S.boardOffsetY * bh;
  camera.position.set(cx, ty - d * Math.sin(tilt), d * Math.cos(tilt));
  camera.up.set(0, 1, 0);
  camera.lookAt(cx, ty, 0);
  camera.near = Math.max(0.1, d * 0.2); camera.far = d * 4;
  camera.updateProjectionMatrix();
}

let shadowTex = null;
function makeShadowTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = Math.round(128 * S.tileRatio * 1.0);
  const g = c.getContext('2d');
  g.filter = 'blur(7px)';
  g.fillStyle = '#000';
  rr(g, 16, 16, c.width - 32, c.height - 32, 14); g.fill();
  const t = new THREE.CanvasTexture(c); return t;
}
function roundedShape(w, h, r) {
  r = Math.min(r, w * 0.45, h * 0.45);
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function buildMeshes() {
  boardGroup.traverse(o => { if (o.isMesh) { o.material.dispose(); } });
  scene.remove(boardGroup);
  boardGroup = new THREE.Group(); scene.add(boardGroup);
  if (shadowTex) shadowTex.dispose();
  shadowTex = makeShadowTex();
  const tw = G.tw, th = G.th, thick = S.tileThick;
  const shape = roundedShape(tw * 0.995, th * 0.995, S.cornerRadius);
  const baseH = thick * S.baseRatio, slabH = thick - baseH;
  const baseGeo = new THREE.ExtrudeGeometry(shape, { depth: baseH, bevelEnabled: false, curveSegments: 5 });
  const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: slabH, bevelEnabled: false, curveSegments: 5 });
  slabGeo.translate(0, 0, baseH);
  const faceGeo = new THREE.PlaneGeometry(tw * 0.995, th * 0.995); faceGeo.translate(0, 0, thick + 0.003);
  const shGeo = new THREE.PlaneGeometry(tw * 1.32, th * 1.28);
  for (const t of G.tiles) {
    const g = new THREE.Group();
    g.position.set(t.x, t.y, t.layer * thick);
    const base = new THREE.Mesh(baseGeo, new THREE.MeshLambertMaterial({ color: S.baseColor }));
    const slab = new THREE.Mesh(slabGeo, new THREE.MeshLambertMaterial({ color: S.sideColor }));
    const face = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ map: faceTexture(t.key), alphaTest: 0.5 }));
    const sh = new THREE.Mesh(shGeo, new THREE.MeshBasicMaterial({ color: 0x000000, map: shadowTex, transparent: true, opacity: S.shadowStrength, depthWrite: false }));
    sh.position.set(S.shadowOffset * tw * 0.8, -S.shadowOffset * th * 0.8, 0.004);
    sh.renderOrder = 1;
    base.userData.tile = slab.userData.tile = face.userData.tile = t;
    g.add(base, slab, face, sh);
    g.visible = t.state === 'board';
    t.obj = g; t.mBase = base.material; t.mSlab = slab.material; t.mFace = face.material; t.pick = [slab, face];
    boardGroup.add(g);
  }
  refreshDark(true);
}
function aliveOnBoard(t) { return t.state === 'board' || t.state === 'selected'; }
function isFree(t) { return aliveOnBoard(t) && t.coveredBy.every(j => !aliveOnBoard(G.tiles[j])); }
function refreshDark(instant) {
  for (const t of G.tiles) { t.darkTarget = isFree(t) ? 0 : S.blockedDarken; if (instant) t.dark = t.darkTarget; }
  applyDark();
}
const _c = new THREE.Color();
function applyDark() {
  for (const t of G.tiles) {
    if (!t.mFace) continue;
    const f = 1 - t.dark;
    t.mFace.color.setRGB(f, f, f);
    t.mBase.color.set(S.baseColor).multiplyScalar(f);
    t.mSlab.color.set(S.sideColor).multiplyScalar(f);
  }
}

// ---------------- Screen projections ----------------
const _v = new THREE.Vector3();
function project(x, y, z) {
  _v.set(x, y, z).project(camera);
  return { x: VP.x + (_v.x + 1) / 2 * VP.w, y: VP.y + (1 - _v.y) / 2 * VP.h };
}
function tileScreen(t) {
  const z = (t.layer + 1) * S.tileThick;
  const c = project(t.x, t.y, z), r = project(t.x + G.tw / 2, t.y, z), u = project(t.x, t.y + G.th / 2, z);
  return { x: c.x, y: c.y, w: Math.abs(r.x - c.x) * 2, h: Math.abs(u.y - c.y) * 2 };
}
function slotRect(i) {
  const n = S.slotCount, topH = H * S.topBarHeight;
  const ax = W * 0.385, aw = W * 0.6;
  let sh = topH * 0.66 * S.slotSize, sw = sh * 0.9;
  const gap = sw * 0.1;
  if (n * (sw + gap) > aw) { sw = aw / n - gap; sh = sw / 0.9; }
  const total = n * sw + (n - 1) * gap;
  const x0 = ax + (aw - total) / 2;
  return { x: x0 + i * (sw + gap), y: topH * 0.48 - sh / 2, w: sw, h: sh, cx: x0 + i * (sw + gap) + sw / 2, cy: topH * 0.48 };
}
function slotTileSize(i) {
  const r = slotRect(i); let w = r.w * 0.84, h = w * G.th / G.tw;
  const thk = w * S.tileThick * 0.5;
  if (h + thk > r.h * 0.9) { const k = r.h * 0.9 / (h + thk); w *= k; h *= k; }
  return { x: r.cx, y: r.cy - w * S.tileThick * 0.25, w, h };
}

// ---------------- Tweens / sprites ----------------
const tweens = [];
function tween(dur, fn, ease = easeInOut) {
  return new Promise(res => tweens.push({ t0: performance.now(), dur: Math.max(1, dur), fn, ease, res }));
}
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;
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
  if (isTarget(t.key)) return collectLetter(t);
  if (S.trayMode === 'tray') { const j = freeTraySlot(); if (j >= 0) return toTray(t, j); }
  const sel = G.selected.map(id => G.tiles[id]);
  if (sel.length && sel[0].key !== t.key) sel.forEach(deselect);
  select(t);
  if (S.trayMode === 'tray') {
    const tr = G.tray.map((e, i) => e && !e.letter && e.key === t.key ? i : -1).filter(i => i >= 0);
    if (tr.length && G.selected.length + tr.length >= S.matchCount) {
      tr.slice(0, S.matchCount - G.selected.length).forEach(i => { const e = G.tray[i]; G.tiles[e.id].state = 'gone'; G.tray[i] = null; burstSprite(e.sprite); });
      matchSelected(); return true;
    }
  }
  if (G.selected.length >= S.matchCount) matchSelected();
  return true;
}
function select(t) {
  t.state = 'selected'; t.obj.visible = false;
  const sp = makeSprite(t, tileScreen(t)); sp.glow = 1; t.sprite = sp;
  G.selected.push(t.id);
  tween(140, k => { sp.scale = lerp(1, S.selectScale, k); sp.lift = k; }, easeBack);
}
function deselect(t) {
  if (t.state !== 'selected') return;
  t.state = 'board';
  G.selected = G.selected.filter(id => id !== t.id);
  const sp = t.sprite; t.sprite = null;
  const s0 = sp.scale;
  tween(120, k => { sp.scale = lerp(s0, 1, k); sp.lift = 1 - k; if (k >= 1) { removeSprite(sp); t.obj.visible = t.state === 'board'; } }, easeOut);
}
function matchSelected() {
  const ts = G.selected.map(id => G.tiles[id]); G.selected = [];
  ts.forEach(t => { t.state = 'gone'; });
  refreshDark();
  const sps = ts.map(t => t.sprite);
  let cx = 0, cy = 0; sps.forEach(s => { cx += s.x; cy += s.y; }); cx /= sps.length; cy /= sps.length;
  const w = sps[0].w * S.selectScale;
  cx = Math.max(w * sps.length / 2 + 10, Math.min(W - w * sps.length / 2 - 10, cx));
  const dur = S.flyDuration * 0.75;
  sps.forEach((s, i) => {
    s.z = 5;
    const tx = cx + (i - (sps.length - 1) / 2) * w * 1.0;
    moveSprite(s, { x: tx, y: cy, scale: S.selectScale * 1.05 }, dur, easeIn).then(() => {
      if (i === sps.length - 1) {
        setTimeout(() => { sps.forEach(sp => burstSprite(sp)); updateStatus(); }, 90);
      }
    });
  });
  updateStatus();
}
function burstSprite(sp) {
  spawnParticles(sp.x, sp.y, sp.w * sp.scale);
  G.flashes.push({ x: sp.x, y: sp.y, r: sp.w * 0.9, t0: performance.now() });
  const s0 = sp.scale;
  tween(160, k => { sp.scale = s0 * (1 + k * 0.3); sp.alpha = 1 - k; if (k >= 1) removeSprite(sp); }, easeOut);
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
  updateStatus();
  return true;
}
function shake(t) {
  const x0 = t.obj.position.x;
  tween(300, k => { t.obj.position.x = x0 + Math.sin(k * 30) * 0.05 * (1 - k); }, x => x);
}
function spawnParticles(x, y, size) {
  const n = Math.round(S.particleCount);
  const c1 = hexRgb(S.particleColor), c2 = hexRgb(S.particleColor2);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = rand(0.25, 1) * size * 2.6 * S.particleSpeed;
    const m = Math.random();
    G.particles.push({
      x: x + rand(-0.3, 0.3) * size, y: y + rand(-0.4, 0.4) * size, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - size * 0.6,
      rot: Math.random() * 6.28, vr: rand(-8, 8), s: rand(0.12, 0.26) * size * S.particleSize,
      col: `rgb(${c1.map((v, k) => Math.round(lerp(v, c2[k], m))).join(',')})`, t0: performance.now(), life: S.burstDuration * rand(0.7, 1.1),
    });
  }
}

// ---------------- Hand ----------------
const HAND = { x: 0, y: 0, press: 0, visible: false, alpha: 0 };
function resetHand() { HAND.x = W * 0.82; HAND.y = H * 1.15; HAND.press = 0; }
function handMoveTo(x, y, dur) {
  const fx = HAND.x, fy = HAND.y;
  const dx = x - fx, dy = y - fy, dist = Math.hypot(dx, dy);
  const bend = (Math.random() < 0.5 ? -1 : 1) * S.curve * dist * rand(0.4, 1);
  const cx = (fx + x) / 2 - dy / (dist || 1) * bend, cy = (fy + y) / 2 + dx / (dist || 1) * bend;
  return tween(dur, k => {
    const a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
    HAND.x = a * fx + b * cx + c * x; HAND.y = a * fy + b * cy + c * y;
  }, easeInOut);
}
function addRipple(x, y) { G && G.ripples.push({ x, y, t0: performance.now() }); }
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
  const introLeft = S.introWord ? S.introDuration * 1000 - (performance.now() - G.introT0) : 0;
  await sleep(Math.max(250, introLeft));
  if (!alive()) return;
  const m = S.matchCount;
  let groups = null;
  if (!G.touched) groups = G.order.map(g => g.slice());
  if (!groups) groups = repairPartition(G.tiles, G.order, m);
  if (!groups) { const p = solve(G.tiles, m, null); if (p && validatePartition(G.tiles, p)) groups = p; }
  if (!groups) { toast('当前局面无解（手动操作造成），请重新开始'); AUTO.running = false; updateButtons(); return; }
  groups = groups.map(g => g.filter(id => G.tiles[id].state !== 'gone')).filter(g => g.length);
  const isLetterG = g => isTarget(G.tiles[g[0]].key);
  const gFree = g => g.every(id => { const t = G.tiles[id]; return t.state === 'tray' || (t.state === 'board' && isFree(t)); });
  const doClick = async (t) => {
    const sc = tileScreen(t);
    const j = S.jitter * U;
    const tx = sc.x + Math.max(-sc.w * 0.3, Math.min(sc.w * 0.3, rand(-j, j)));
    const ty = sc.y + Math.max(-sc.h * 0.3, Math.min(sc.h * 0.3, rand(-j, j)));
    const dist = Math.hypot(tx - HAND.x, ty - HAND.y);
    const base = rand(S.moveMin, Math.max(S.moveMin, S.moveMax));
    const dur = base * (0.55 + Math.min(1, dist / (H * 0.5)) * 0.6) / spd;
    await handMoveTo(tx, ty, dur);
    if (!alive()) return false;
    await sleep(rand(15, 60) / spd);
    const ok = await handPress(() => clickTile(t, true), spd);
    let d = rand(S.delayMin, Math.max(S.delayMin, S.delayMax));
    if (Math.random() < S.thinkChance) d += rand(0.3, 1) * S.thinkMax;
    await sleep(d / spd);
    return ok;
  };
  const dScreen = (id, p) => { const s = tileScreen(G.tiles[id]); return Math.hypot(s.x - p.x, s.y - p.y); };
  let stuck = 0;
  while (groups.length && alive()) {
    const free = groups.filter(gFree);
    const letterG = free.filter(isLetterG).sort((a, b) => targetIndex(G.tiles[a[0]].key) - targetIndex(G.tiles[b[0]].key));
    const normalG = free.filter(g => !isLetterG(g));
    const allLetters = groups.filter(isLetterG).sort((a, b) => targetIndex(G.tiles[a[0]].key) - targetIndex(G.tiles[b[0]].key));
    let pick = null;
    if (letterG.length) {
      if (S.letterOrder === 'early') pick = letterG[0];
      else if (S.letterOrder === 'word') { if (letterG[0] === allLetters[0]) pick = letterG[0]; }
      else if (S.letterOrder === 'natural') { if (Math.random() < 0.15) pick = letterG[Math.floor(Math.random() * letterG.length)]; }
    }
    if (!pick && normalG.length) {
      const hp = { x: HAND.x, y: Math.min(HAND.y, H) };
      let best = Infinity;
      for (const g of normalG) {
        const sorted = g.slice().sort((a, b) => dScreen(a, hp) - dScreen(b, hp));
        let sc = dScreen(sorted[0], hp);
        for (let i = 1; i < sorted.length; i++) sc += dScreen(sorted[i], tileScreen(G.tiles[sorted[i - 1]])) * 0.6;
        sc *= rand(0.75, 1.25);
        if (sc < best) { best = sc; pick = sorted; }
      }
    }
    if (!pick && letterG.length) pick = letterG[0];
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
    await sleep(S.endDelay + 700);
    if (!alive()) return;
    for (let i = 0; i < 2 && alive(); i++) {
      const b = endButtonRect();
      await handMoveTo(b.x + rand(-10, 10) * U, b.y + rand(-5, 5) * U, 600 / spd);
      await handPress(null, spd); await sleep(450 / spd);
    }
  } else {
    await handMoveTo(W * 0.85, H * 1.2, 700 / spd);
  }
  AUTO.running = false; updateButtons();
}

// ---------------- Recording ----------------
const REC = { rec: null, chunks: [], mime: '', t0: 0, auto: false, list: [] };
function pickMime() {
  const mp4 = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4'];
  const webm = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const order = S.recFormat === 'webm' ? webm.concat(mp4) : S.recFormat === 'mp4' ? mp4.concat(webm) : mp4.concat(webm);
  return order.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}
function startRecording(auto = false) {
  if (REC.rec) return;
  if (!window.MediaRecorder || !canvas.captureStream) { toast('当前浏览器不支持录制'); return; }
  const stream = canvas.captureStream(+S.recFps);
  const mime = pickMime();
  let rec;
  try { rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: Math.round(S.recBitrate * 1e6) }); }
  catch (e) { toast('录制启动失败：' + e.message); return; }
  REC.rec = rec; REC.chunks = []; REC.mime = rec.mimeType || mime; REC.t0 = performance.now(); REC.auto = auto;
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
    toast(`录制完成：${name}（${(blob.size / 1048576).toFixed(1)} MB）`);
  };
  rec.start(250);
  updateButtons();
  toast('开始录制（' + (REC.mime || 'default') + '）');
}
function stopRecording() { if (REC.rec && REC.rec.state !== 'inactive') REC.rec.stop(); }

function onCleared() {
  G.cleared = true; G.clearT = performance.now();
  updateStatus();
  if (REC.rec && S.autoStop && REC.auto) {
    const wait = (S.endCard ? S.endDelay + 2600 / Math.max(0.5, S.autoSpeed) : 600) + S.tailSec * 1000;
    const recRef = REC.rec;
    setTimeout(() => { if (REC.rec === recRef) stopRecording(); }, wait);
  }
}

// ---------------- Drawing ----------------
function drawTile2D(key, x, y, w, h, alpha = 1, glow = 0) {
  const th = w * S.tileThick * 0.5, slabT = th * (1 - S.baseRatio);
  const r = S.cornerRadius * w;
  ctx.save(); ctx.globalAlpha = alpha;
  const x0 = x - w / 2, y0 = y - h / 2;
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = w * 0.15; ctx.shadowOffsetX = w * 0.06; ctx.shadowOffsetY = w * 0.08;
  if (glow) { ctx.shadowColor = `rgba(120,255,120,${0.9 * glow})`; ctx.shadowBlur = w * 0.45 * glow; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
  ctx.fillStyle = shade(S.baseColor, 0.85); rr(ctx, x0, y0 + th, w, h, r); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = S.baseColor; rr(ctx, x0, y0 + th * 0.92, w, h, r); ctx.fill();
  ctx.fillStyle = shade(S.sideColor, 0.92); rr(ctx, x0, y0 + slabT, w, h, r); ctx.fill();
  ctx.drawImage(faceCanvas(key), x0, y0, w, h);
  if (glow) { ctx.strokeStyle = `rgba(110,240,110,${glow})`; ctx.lineWidth = Math.max(2, w * 0.05); rr(ctx, x0, y0, w, h + slabT, r); ctx.stroke(); }
  ctx.restore();
}
function drawBackground() {
  if (IMG.bgImage) {
    const im = IMG.bgImage, k = Math.max(W / im.width, H / im.height);
    ctx.drawImage(im, (W - im.width * k) / 2, (H - im.height * k) / 2, im.width * k, im.height * k);
  } else {
    const g = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, H * 0.65);
    g.addColorStop(0, S.bgColor); g.addColorStop(1, S.bgColor2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}
function drawTopBar(now) {
  const th = H * S.topBarHeight;
  const g = ctx.createLinearGradient(0, 0, 0, th);
  g.addColorStop(0, shade(S.topBarColor, 0.85)); g.addColorStop(0.5, S.topBarColor); g.addColorStop(1, shade(S.topBarColor, 0.75));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, th);
  // 木纹
  ctx.save(); ctx.globalAlpha = 0.07; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5 * U;
  for (let i = 0; i < 9; i++) { ctx.beginPath(); const yy = th * (0.1 + i * 0.1); ctx.moveTo(0, yy); ctx.bezierCurveTo(W * 0.3, yy + 4 * U, W * 0.6, yy - 4 * U, W, yy + 2 * U); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = shade(S.topBarColor, 1.35); ctx.fillRect(0, th - 5 * U, W, 2 * U);
  ctx.fillStyle = shade(S.topBarColor, 0.5); ctx.fillRect(0, th - 3 * U, W, 3 * U);
  const sg = ctx.createLinearGradient(0, th, 0, th + 14 * U); sg.addColorStop(0, 'rgba(0,0,0,.5)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, th, W, 14 * U);
  drawLogo(th);
  // 托盘格
  const sc = hexRgb(S.slotColor);
  for (let i = 0; i < S.slotCount; i++) {
    const r = slotRect(i);
    ctx.fillStyle = `rgba(${sc.join(',')},0.55)`; rr(ctx, r.x, r.y, r.w, r.h, r.w * 0.12); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 3 * U; rr(ctx, r.x + 1.5 * U, r.y + 1.5 * U, r.w - 3 * U, r.h - 3 * U, r.w * 0.11); ctx.stroke();
    ctx.strokeStyle = shade(S.topBarColor, 1.6); ctx.lineWidth = 1.5 * U; rr(ctx, r.x, r.y, r.w, r.h, r.w * 0.12); ctx.stroke();
  }
  // 开场目标词
  if (S.introWord && G) {
    const el = (now - G.introT0) / 1000, dur = S.introDuration;
    if (el < dur + 0.35) {
      const a = el < dur ? 1 : 1 - (el - dur) / 0.35;
      for (let i = 0; i < G.word.length; i++) {
        if (G.tray[i] && G.tray[i].letter) continue;
        const s = slotTileSize(i);
        drawTile2D('T' + G.word[i] + ':' + i, s.x, s.y, s.w, s.h, a);
      }
    }
  }
  // 单词集齐发光
  if (G && G.wordDoneT) {
    const el = (now - G.wordDoneT) / 1000;
    const pulse = el < 2 ? 0.6 + 0.4 * Math.sin(el * 10) : 0.55 + 0.15 * Math.sin(el * 3);
    const a = slotRect(0), b = slotRect(G.word.length - 1);
    ctx.save(); ctx.shadowColor = S.glowColor; ctx.shadowBlur = 28 * U * pulse; ctx.strokeStyle = S.glowColor; ctx.globalAlpha = Math.min(1, pulse + 0.2);
    ctx.lineWidth = 4 * U; rr(ctx, a.x - 5 * U, a.y - 5 * U, b.x + b.w - a.x + 10 * U, a.h + 10 * U, a.w * 0.18); ctx.stroke(); ctx.stroke();
    ctx.restore();
    if (el < 2.2) { // 闪光星星
      const rnd = mulberry32(Math.floor(el * 12));
      for (let i = 0; i < 6; i++) { const x = lerp(a.x, b.x + b.w, rnd()), y = lerp(a.y, a.y + a.h, rnd()); star(x, y, (6 + rnd() * 8) * U, S.glowColor); }
    }
  }
}
function star(x, y, r, col) {
  ctx.save(); ctx.fillStyle = col; ctx.globalAlpha = 0.9; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr2 = i % 2 ? r * 0.3 : r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawLogo(th) {
  const ax = W * 0.015, aw = W * 0.36 * S.logoScale, ah = th * 0.94 * S.logoScale, ay = (th - ah) / 2 - 2 * U;
  if (IMG.logoImage) {
    const im = IMG.logoImage, k = Math.min(aw / im.width, ah / im.height);
    ctx.drawImage(im, ax + (aw - im.width * k) / 2, ay + (ah - im.height * k) / 2, im.width * k, im.height * k); return;
  }
  const cx = ax + aw / 2;
  const gold = (y0, y1) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#fff6c2'); g.addColorStop(0.45, '#ffcf2e'); g.addColorStop(1, '#e27a00'); return g; };
  const line = (txt, y, size, italic, maxW) => {
    if (!txt) return;
    ctx.font = `${italic ? 'italic ' : ''}900 ${size}px "Arial Black","Trebuchet MS",Arial,"Microsoft YaHei",sans-serif`;
    const mw = ctx.measureText(txt).width; const k = Math.min(1, maxW / mw);
    ctx.save(); ctx.translate(cx, y); ctx.scale(k, 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#5a1a00'; ctx.fillText(txt, 0, size * 0.08);
    ctx.strokeStyle = '#7a2a00'; ctx.lineWidth = size * 0.16; ctx.strokeText(txt, 0, 0);
    ctx.fillStyle = gold(-size / 2, size / 2); ctx.fillText(txt, 0, 0);
    ctx.restore();
  };
  if (S.logoRibbon) {
    ctx.save(); ctx.strokeStyle = '#c8102e'; ctx.lineWidth = ah * 0.12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax + aw * 0.08, ay + ah * 0.78); ctx.quadraticCurveTo(cx, ay + ah * 1.02, ax + aw * 0.92, ay + ah * 0.74); ctx.stroke();
    ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = ah * 0.03; ctx.beginPath(); ctx.moveTo(ax + aw * 0.1, ay + ah * 0.75); ctx.quadraticCurveTo(cx, ay + ah * 0.98, ax + aw * 0.9, ay + ah * 0.71); ctx.stroke();
    ctx.restore();
  }
  line(S.logoLine1, ay + ah * 0.17, ah * 0.22, true, aw * 0.5);
  line(S.logoLine2, ay + ah * 0.47, ah * 0.4, false, aw * 0.96);
  line(S.logoLine3, ay + ah * 0.78, ah * 0.27, true, aw * 0.5);
}
function drawDisclaimer() {
  if (!S.disclaimer) return;
  const size = H * S.disclaimerSize;
  ctx.font = `${size}px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",Arial,sans-serif`;
  const mw = ctx.measureText(S.disclaimer).width, k = Math.min(1, W * 0.96 / mw);
  ctx.save(); ctx.translate(W / 2, H - size * 1.1); ctx.scale(k, 1);
  ctx.fillStyle = S.disclaimerColor; ctx.globalAlpha = 0.85; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(S.disclaimer, 0, 0); ctx.restore();
}
function drawEffects(now) {
  // 闪光
  G.flashes = G.flashes.filter(f => {
    const k = (now - f.t0) / 350; if (k >= 1) return false;
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (1 + k));
    const c = hexRgb(S.particleColor2);
    g.addColorStop(0, `rgba(255,255,220,${0.8 * (1 - k)})`); g.addColorStop(0.4, `rgba(${c.join(',')},${0.5 * (1 - k)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + k), 0, 7); ctx.fill(); return true;
  });
  // 树叶粒子
  const dt = 1 / 60;
  G.particles = G.particles.filter(p => {
    const k = (now - p.t0) / p.life; if (k >= 1) return false;
    p.vy += H * 0.9 * dt * 0.6; p.vx *= 0.97; p.vy *= 0.97; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = Math.max(1, p.s * 0.08); ctx.beginPath(); ctx.moveTo(-p.s * 0.9, 0); ctx.lineTo(p.s * 0.9, 0); ctx.stroke();
    ctx.restore(); return true;
  });
  // 点击波纹
  G.ripples = G.ripples.filter(r => {
    const k = (now - r.t0) / S.rippleDuration; if (k >= 1) return false;
    const R = W * S.rippleSize * (0.25 + easeOut(k) * 0.75);
    ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = S.rippleColor; ctx.lineWidth = S.rippleWidth * U * (1 - k * 0.5);
    ctx.beginPath(); ctx.arc(r.x, r.y, R, 0, 7); ctx.stroke();
    ctx.globalAlpha = (1 - k) * 0.25; ctx.fillStyle = S.rippleColor; ctx.fill();
    ctx.restore(); return true;
  });
}
function drawHand() {
  if (!IMG.handImage || HAND.alpha <= 0.01) return;
  const im = IMG.handImage;
  const w = W * S.handSize, h = w * im.height / im.width;
  const ax = S.handAnchorX * w, ay = S.handAnchorY * h;
  const p = HAND.press * S.pressDepth;
  ctx.save(); ctx.globalAlpha = HAND.alpha;
  ctx.translate(HAND.x, HAND.y + p * h * 0.15);
  ctx.rotate(S.handRotation * Math.PI / 180);
  ctx.scale((S.handFlip ? -1 : 1) * (1 - p * 0.5), 1 - p * 0.6);
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 18 * U; ctx.shadowOffsetX = 8 * U * (1 - HAND.press); ctx.shadowOffsetY = 10 * U * (1 - HAND.press);
  ctx.drawImage(im, -ax, -ay, w, h);
  ctx.restore();
}
function endButtonRect() { return { x: W / 2, y: H * 0.68, w: W * 0.56, h: H * 0.066 }; }
function drawEndCard(now) {
  if (!S.endCard || !G.cleared) return;
  const el = now - G.clearT - S.endDelay; if (el < 0) return;
  const a = Math.min(1, el / 450);
  ctx.save(); ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.45, H * 0.7);
  g.addColorStop(0, S.endBg1); g.addColorStop(1, S.endBg2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 光线
  ctx.save(); ctx.translate(W / 2, H * 0.36); ctx.rotate(el / 6000);
  ctx.fillStyle = 'rgba(255,255,220,0.06)';
  for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(H, -H * 0.12); ctx.lineTo(H, H * 0.12); ctx.fill(); }
  ctx.restore();
  // 图标
  const s = W * 0.36 * (0.85 + 0.15 * easeBack(Math.min(1, el / 500))), ix = W / 2 - s / 2, iy = H * 0.36 - s / 2;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 30 * U; ctx.shadowOffsetY = 10 * U;
  rr(ctx, ix, iy, s, s, s * 0.22); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
  ctx.save(); rr(ctx, ix + s * 0.03, iy + s * 0.03, s * 0.94, s * 0.94, s * 0.2); ctx.clip();
  if (IMG.endIcon) ctx.drawImage(IMG.endIcon, ix, iy, s, s);
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
    domino(ix + s * 0.38, iy + s * 0.5, -0.35, [[-.22, -.36], [.22, -.14], [0, -.25], [-.22, .14], [.22, .36]]);
    domino(ix + s * 0.63, iy + s * 0.48, 0.3, [[0, -.25], [-.22, .14], [.22, .36], [0, .25]]);
  }
  ctx.restore();
  // 标题
  ctx.font = `900 ${W * 0.1}px "Arial Black","Microsoft YaHei",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.strokeStyle = '#4a2a00'; ctx.lineWidth = W * 0.016; ctx.strokeText(S.endTitle, W / 2, H * 0.56);
  ctx.fillStyle = S.endTitleColor; ctx.fillText(S.endTitle, W / 2, H * 0.56);
  // 按钮
  const b = endButtonRect(), pul = 1 + 0.04 * Math.sin(el / 160);
  ctx.save(); ctx.translate(b.x, b.y); ctx.scale(pul, pul);
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 16 * U; ctx.shadowOffsetY = 6 * U;
  const bg = ctx.createLinearGradient(0, -b.h / 2, 0, b.h / 2); bg.addColorStop(0, shade(S.endBtnColor, 1.25)); bg.addColorStop(1, shade(S.endBtnColor, 0.75));
  ctx.fillStyle = bg; rr(ctx, -b.w / 2, -b.h / 2, b.w, b.h, b.h / 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 3 * U; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `bold ${b.h * 0.45}px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif`; ctx.fillText(S.endButton, 0, 2 * U);
  ctx.restore();
  ctx.restore();
}

let lastFrame = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  // tweens
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; const k = Math.min(1, (now - tw.t0) / tw.dur);
    tw.fn(tw.ease(k)); if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  if (G) {
    let changed = false;
    for (const t of G.tiles) { if (Math.abs(t.dark - t.darkTarget) > 0.002) { t.dark += (t.darkTarget - t.dark) * Math.min(1, dt * 10); changed = true; } }
    if (changed) applyDark();
    if (!G.cleared && G.tiles.length && G.tiles.every(t => t.state === 'gone') && !G.sprites.some(s => s.moving)) onCleared();
  }
  HAND.alpha += ((HAND.visible ? 1 : 0) - HAND.alpha) * Math.min(1, dt * 12);
  // draw
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawBackground();
  if (G) {
    renderer.render(scene, camera);
    ctx.drawImage(glCanvas, VP.x, VP.y, VP.w, VP.h);
  }
  drawTopBar(now);
  if (G) {
    // 托盘内的牌
    const sorted = G.sprites.slice().sort((a, b) => a.z - b.z);
    for (const sp of sorted) drawTile2D(sp.key, sp.x, sp.y - (sp.lift || 0) * sp.h * 0.06, sp.w * sp.scale, sp.h * sp.scale, sp.alpha, sp.glow ? 1 : 0);
    drawEffects(now);
  }
  drawDisclaimer();
  if (G) drawEndCard(now);
  drawHand();
  if (REC.rec) updateRecTime();
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
  for (const t of G.tiles) if (t.state === 'board') objs.push(...t.pick);
  const hits = raycaster.intersectObjects(objs, false);
  if (!hits.length) return null;
  let best = null;
  for (const h of hits) { const t = h.object.userData.tile; if (!best || t.layer > best.layer) best = t; }
  return best;
}
canvas.addEventListener('pointermove', e => {
  if (AUTO.running || !S.manualHand) return;
  const p = canvasPoint(e); HAND.x = p.x; HAND.y = p.y; HAND.visible = true;
});
canvas.addEventListener('pointerleave', () => { if (!AUTO.running) HAND.visible = false; });
canvas.addEventListener('pointerdown', e => {
  if (AUTO.running) return;
  const p = canvasPoint(e);
  if (S.manualHand) { HAND.x = p.x; HAND.y = p.y; HAND.visible = true; handPress(null, 1.5); }
  else addRipple(p.x, p.y);
  const t = pickTile(p);
  if (t) clickTile(t);
});

// ---------------- Panel ----------------
const panelBody = $('#panelBody');
const controls = {};
let regenTimer = 0;
function scheduleRegen() { clearTimeout(regenTimer); regenTimer = setTimeout(() => newGame(true), 180); }
function onSetting(item, v) {
  S[item.k] = v; saveSettings();
  if (item.type === 'file') loadImg(item.k);
  if (item.kind === 'regen') scheduleRegen();
  else if (item.kind === 'mesh') { if (G) { clearFaceCache(); buildMeshes(); fitCamera(); } }
  else if (item.kind === 'res') { if (REC.rec) { toast('录制中不能修改分辨率'); return; } setResolution(); if (G) { G.sprites.forEach(s => { }); } newGame(true); }
  else { if (['cameraTilt', 'cameraFov', 'boardScale', 'boardOffsetY'].includes(item.k)) fitCamera(); if (item.k === 'topBarHeight') layoutViewport(); if (item.k === 'blockedDarken' && G) refreshDark(); }
  if (item.k.startsWith('hand')) drawHandPreview();
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
      } else if (it.type === 'select') {
        el = document.createElement('select');
        it.options.forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; el.appendChild(o); });
        el.onchange = () => onSetting(it, it.num ? +el.value : el.value); row.appendChild(el);
      } else if (it.type === 'text') {
        el = document.createElement('input'); el.type = 'text'; if (it.placeholder) el.placeholder = it.placeholder;
        el.onchange = () => onSetting(it, el.value); row.appendChild(el);
      } else if (it.type === 'textarea') {
        el = document.createElement('textarea'); el.rows = 2; el.oninput = () => onSetting(it, el.value); row.appendChild(el);
      } else if (it.type === 'file') {
        el = document.createElement('input'); el.type = 'file'; el.accept = 'image/*';
        el.onchange = () => { const f = el.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => onSetting(it, fr.result); fr.readAsDataURL(f); };
        const clr = document.createElement('button'); clr.textContent = '清除'; clr.onclick = () => { el.value = ''; onSetting(it, ''); };
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
  const hp = $('#handPrev'); if (!hp || !IMG.handImage) return;
  const c = hp.getContext('2d'); c.clearRect(0, 0, hp.width, hp.height);
  c.fillStyle = '#333'; c.fillRect(0, 0, hp.width, hp.height);
  const b = handPrevBox(); c.drawImage(IMG.handImage, b.x, b.y, b.w, b.h);
  const x = b.x + S.handAnchorX * b.w, y = b.y + S.handAnchorY * b.h;
  c.strokeStyle = '#0f0'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 8, y); c.lineTo(x + 8, y); c.moveTo(x, y - 8); c.lineTo(x, y + 8); c.stroke();
  c.beginPath(); c.arc(x, y, 5, 0, 7); c.stroke();
}
function syncPanel() {
  for (const k in controls) {
    const { it, el, val } = controls[k]; const v = S[k];
    if (it.type === 'checkbox') el.checked = !!v;
    else if (it.type === 'file') { }
    else el.value = v;
    if (val) val.value = fmt(v, it.step);
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
  $('#status').textContent = G.cleared ? `🎉 通关！共 ${G.tiles.length} 张牌` : `剩余 ${left}/${G.tiles.length} 张 · 可点击 ${free} 张 · 层数 ${BOUNDS.maxL + 1}`;
}
let toastTimer = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }

$('#btnNew').onclick = () => newGame(true);
$('#btnSeed').onclick = () => newGame(false);
$('#btnAuto').onclick = () => autoSolve();
$('#btnRec').onclick = () => REC.rec ? stopRecording() : startRecording(false);
$('#btnShot').onclick = () => canvas.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mahjong_screenshot.png'; a.click(); });
$('#btnExport').onclick = () => {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mahjong-settings.json'; a.click();
};
$('#btnImport').onclick = () => $('#importFile').click();
$('#importFile').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(txt => { try { S = { ...DEFAULTS, ...JSON.parse(txt) }; applyAll(); toast('设置已导入'); } catch (err) { toast('导入失败：' + err.message); } });
  e.target.value = '';
};
$('#btnReset').onclick = () => { if (!confirm('确定恢复全部默认设置？')) return; S = { ...DEFAULTS }; applyAll(); toast('已恢复默认'); };
function applyAll() { saveSettings(); syncPanel(); ['bgImage', 'logoImage', 'endIcon', 'handImage'].forEach(loadImg); setResolution(); newGame(true); }

// 供测试/外部脚本使用
window.__app = {
  get S() { return S; }, get G() { return G; }, get AUTO() { return AUTO; }, get REC() { return REC; },
  setSetting(k, v) { const it = SCHEMA.flatMap(g => g.items).find(i => i.k === k); if (it) { onSetting(it, v); syncPanel(); } else S[k] = v; },
  newGame, autoSolve, startRecording, stopRecording, clickTile, tileScreen, isFree,
};

buildPanel();
setResolution();
resetHand();
newGame(true);
renderRecList();
updateButtons();
requestAnimationFrame(frame);
