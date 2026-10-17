// v20：导出 3D 动画（glTF 2.0 .glb + Blender 脚本 + 音频 + timeline.json）
// 复用 AE 记录器的时间轴：牌用真实 3D 网格（挤出圆角牌身 + 牌面贴图），其余 2D 元素（背景/顶栏/托盘/飞行牌/字母/
// 树叶/特效/结束页/手指）取 AE 导出里同一张素材，做成带贴图的四边形，关键帧按项目帧率逐帧采样。
// 坐标：glTF 标准 Y 轴向上，单位米；1 画布像素 = 1 毫米（PX = 0.001 m）。画面平铺在 XZ 平面：
//   X = (屏幕x − W/2)·PX，Z = (屏幕y − H/2)·PX（屏幕向下 = +Z），高度 Y 只用于前后遮挡顺序；正交相机在 +Y 处朝下看。
// 不透明度：glTF 核心不能给材质透明度做动画 → 每个元素外层有一个“_vis”节点，用 STEP 插值的缩放 1/0 控制显示/隐藏；
//   连续的淡入淡出（树叶、手指、字母等）另存为 scene3d.json 的 opacity 曲线，blender_import.py 会把它烘到材质 Alpha 上。
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { makeZip } from '../ae/zip.js';
import PY_TEXT from './blender_import.py';
import README_TEXT from './README_3D.md';

export const PX = 0.001;
const SAFE = s => String(s).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
const r5 = x => Math.round(x * 1e5) / 1e5;

// 取 AE 属性在时间 t 的值（常量 / {t,v,hold}）
function evalProp(P, t, def) {
  if (P === undefined || P === null) return def;
  if (typeof P !== 'object' || Array.isArray(P)) return P;
  const T = P.t, V = P.v; if (!T || !T.length) return def;
  if (t <= T[0]) return V[0];
  if (t >= T[T.length - 1]) return V[V.length - 1];
  let i = 0; while (i < T.length - 2 && T[i + 1] <= t) i++;
  if (P.hold) return V[i];
  const u = (t - T[i]) / (T[i + 1] - T[i]), a = V[i], b = V[i + 1];
  return Array.isArray(a) ? a.map((x, k) => x + (b[k] - x) * u) : a + (b - a) * u;
}
const animated = P => P && typeof P === 'object' && !Array.isArray(P) && P.t && P.t.length > 1;

// 去掉与前后都相同的中间关键帧（对线性/阶梯插值都是无损的）
function reduceKeys(times, vals, n) {
  const T = [], V = [], same = (i, j) => { for (let k = 0; k < n; k++) if (Math.abs(vals[i * n + k] - vals[j * n + k]) > 1e-7) return false; return true; };
  const m = times.length;
  for (let i = 0; i < m; i++) {
    if (i > 0 && i < m - 1 && same(i, i - 1) && same(i, i + 1)) continue;
    T.push(times[i]); for (let k = 0; k < n; k++) V.push(vals[i * n + k]);
  }
  return { T, V };
}

export async function export3D({ S, rec, aeResult, api }) {
  const fps = +S.export3dFps || 30;
  const tl = aeResult.timeline, files = aeResult.fileList;
  const W = rec.W, H = rec.H, D = tl.meta.duration;
  const NF = Math.round(D * fps); // 帧 0..NF
  const fileMap = new Map(files.map(f => [f.name, f.data]));
  const assetById = new Map(tl.assets.map(a => [a.id, a]));
  const compById = new Map(tl.comps.map(c => [c.id, c]));
  const X = x => (x - W / 2) * PX, Z = y => (y - H / 2) * PX;

  const root = new THREE.Scene(); root.name = 'mahjong_scene';
  const tracks = [], opacityTracks = {}, nodes = [];
  const stats = { tiles: 0, tileVariants: 0, quads: 0, leaves: 0, hand: 0 };
  const addTrack = (name, prop, times, vals, n, interp) => {
    const { T, V } = reduceKeys(times, vals, n);
    if (T.length === 1) { T.push(D); for (let k = 0; k < n; k++) V.push(V[k]); }
    const Tr = prop === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    const tr = new Tr(name + '.' + prop, T, V, interp); tracks.push(tr); return tr;
  };
  const frameTimes = (f0, f1) => { const a = []; for (let f = f0; f <= f1; f++) a.push(r5(f / fps)); return a; };
  // 显示/隐藏：STEP 缩放 1/0，覆盖整个 0..D
  function visTrack(name, visAt) {
    const times = [], vals = [];
    for (let f = 0; f <= NF; f++) { const v = visAt(f / fps) ? 1 : 0; times.push(r5(f / fps)); vals.push(v, v, v); }
    addTrack(name, 'scale', times, vals, 3, THREE.InterpolateDiscrete);
  }

  // ---------- 贴图 ----------
  const texCache = new Map();
  async function texFromPng(file) {
    if (texCache.has(file)) return texCache.get(file);
    const bmp = await createImageBitmap(new Blob([fileMap.get(file)], { type: 'image/png' }));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.name = file.replace(/^assets\//, '').replace(/\.png$/, '');
    texCache.set(file, t); return t;
  }
  const canvasTex = (c, name) => { if (texCache.has(c)) return texCache.get(c); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.name = name; texCache.set(c, t); return t; };

  // ---------- 牌（真实 3D 网格） ----------
  const T3 = api.tile3D(); // { bodyGeo, tw, th, thick, shadow:{canvas,w,h,dx,dy,z,opacity}, band:{canvas,w,h,x,z,opacity}|null, selectTint }
  const tilesAll = [...rec.tiles.values()];
  const t0 = rec.G && rec.G.tiles[0];
  const k = t0 ? api.tileScreen(t0).w / T3.tw : 100; // 世界单位 → 像素
  const sh = api.tileShear(); // 牌顶→牌底的屏幕偏移(px)：2.5D 侧面露出
  const thickPx = T3.thick * k;
  // 世界(牌局部, z 向上) → glTF(米, Y 向上)：x,y 按 k 缩放成像素，按深度加剪切偏移
  function toGl(geo) {
    const g = geo.clone(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 1 - z / T3.thick;
      p.setXYZ(i, (x * k + f * sh.dx) * PX, z * k * PX, (-y * k + f * sh.dy) * PX);
    }
    g.deleteAttribute('normal'); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
  const bodyGeo = toGl(T3.bodyGeo);
  const faceGeo = toGl(new THREE.PlaneGeometry(T3.tw * 0.995, T3.th * 0.995).translate(0, 0, T3.thick + 0.003));
  const shGeo = toGl(new THREE.PlaneGeometry(T3.shadow.w, T3.shadow.h).translate(T3.shadow.dx, T3.shadow.dy, 0.004));
  const bandGeo = T3.band ? toGl(new THREE.PlaneGeometry(T3.band.w, T3.band.h).translate(T3.band.x, 0, T3.thick + 0.006)) : null;
  const shMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: canvasTex(T3.shadow.canvas, 'tile_shadow'), transparent: true, opacity: T3.shadow.opacity, depthWrite: false }); shMat.name = 'mat_tile_shadow';
  const bandMat = T3.band ? new THREE.MeshBasicMaterial({ color: 0x000000, map: canvasTex(T3.band.canvas, 'tile_contact_shadow'), transparent: true, opacity: T3.band.opacity, depthWrite: false }) : null; if (bandMat) bandMat.name = 'mat_tile_contact';
  const matCache = new Map();
  function bodyMat(d, sel) {
    const key = 'b' + d + sel; if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true }); const f = 1 - d;
    if (sel) m.color.set(T3.selectTint).multiplyScalar(f); else m.color.setRGB(f, f, f);
    m.name = `mat_body_d${Math.round(d * 100)}${sel ? '_sel' : ''}`; matCache.set(key, m); return m;
  }
  function faceMat(tkey, d, sel) {
    const key = 'f' + tkey + d + sel; if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshBasicMaterial({ map: canvasTex(api.faceCanvas(tkey, sel), 'face_' + SAFE(tkey) + (sel ? '_sel' : '')), alphaTest: 0.5 });
    m.color.setRGB(1 - d, 1 - d, 1 - d); m.name = `mat_face_${SAFE(tkey)}_d${Math.round(d * 100)}${sel ? '_sel' : ''}`; matCache.set(key, m); return m;
  }
  const tileGroup = new THREE.Group(); tileGroup.name = 'tiles'; root.add(tileGroup);
  let ti = 0;
  for (const tr of tilesAll) {
    const s = tr.s; if (!s.length || !s.some(e => e[1])) continue;
    ti++; stats.tiles++;
    const nm = `tile_${String(ti).padStart(3, '0')}_${SAFE(tr.key)}`;
    const at = t => { let j = 0; while (j < s.length - 1 && s[j + 1][0] <= t + 1e-9) j++; return s[j]; };
    const lerpAt = t => { let j = 0; while (j < s.length - 2 && s[j + 1][0] <= t + 1e-9) j++; const a = s[j], b = s[j + 1] || a; const u = b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 0; return a.map((x, i) => x + (b[i] - x) * u); };
    const vis = new THREE.Group(); vis.name = nm; vis.position.set(X(tr.x), tr.layer * thickPx * PX, Z(tr.y));
    vis.userData = { key: tr.key, layer: tr.layer + 1, row: tr.row + 1, col: tr.col + 1, game: tr.gen };
    const press = new THREE.Group(); press.name = nm + '_press'; vis.add(press);
    visTrack(nm, t => t >= s[0][0] - 1e-9 && !!at(t)[1]);
    // 按下：位移(px) + 缩放（以牌面中心为原点）
    const times = frameTimes(0, NF), pv = [], sv = [];
    for (const t of times) { const v = lerpAt(t); pv.push((v[4] || 0) * PX, 0, (v[5] || 0) * PX); const q = v[6] ?? 1; sv.push(q, q, q); }
    addTrack(press.name, 'position', times, pv, 3, THREE.InterpolateLinear);
    addTrack(press.name, 'scale', times, sv, 3, THREE.InterpolateLinear);
    // 状态变体：压暗程度（量化 0.05）× 选中
    const vkey = e => `${Math.round((e[2] || 0) * 20) / 20}|${e[3] ? 1 : 0}`;
    const variants = [...new Set(s.filter(e => e[1]).map(vkey))];
    for (const vk of variants) {
      const [d, sel] = vk.split('|').map(Number);
      const vn = new THREE.Group(); vn.name = `${nm}_v_d${Math.round(d * 100)}${sel ? '_sel' : ''}`; press.add(vn);
      const body = new THREE.Mesh(bodyGeo, bodyMat(d, sel)); body.name = vn.name + '_body';
      const face = new THREE.Mesh(faceGeo, faceMat(tr.key, d, sel)); face.name = vn.name + '_face';
      vn.add(body, face); stats.tileVariants++;
      if (variants.length > 1) visTrack(vn.name, t => vkey(at(t)) === vk);
    }
    const shm = new THREE.Mesh(shGeo, shMat); shm.name = nm + '_shadow'; press.add(shm);
    if (bandGeo) { const b = new THREE.Mesh(bandGeo, bandMat); b.name = nm + '_contact'; press.add(b); }
    tileGroup.add(vis);
  }
  const tileTop = (Math.max(1, ...tilesAll.map(x => x.layer + 1)) + 1) * thickPx * PX;

  // ---------- 2D 元素 → 带贴图的四边形 ----------
  const fx = new THREE.Group(); fx.name = 'overlays'; root.add(fx);
  const quadGeoCache = new Map();
  function quadGeo(w, h, ax, ay) {
    const key = [w, h, ax, ay].join(','); if (quadGeoCache.has(key)) return quadGeoCache.get(key);
    const g = new THREE.PlaneGeometry(w * PX, h * PX); g.rotateX(-Math.PI / 2); g.translate((w / 2 - ax) * PX, 0, (h / 2 - ay) * PX);
    quadGeoCache.set(key, g); return g;
  }
  let order = 0, beforeBoard = true, preOrder = 0, qi = 0;
  const flat = [];
  function walk(comp, t0w, t1w, prefix) {
    for (const L of comp.layers) {
      if (L.src.comp) {
        if (/^board_/.test(L.src.comp)) { beforeBoard = false; continue; }
        const c = compById.get(L.src.comp); if (!c) continue;
        walk(c, Math.max(t0w, L.in ?? 0), Math.min(t1w, L.out ?? D), prefix + SAFE(c.name) + '_');
        continue;
      }
      const a = L.src.asset ? assetById.get(L.src.asset) : null;
      if (a && !/\.png$/.test(a.file)) continue; // 音频层
      if (!a && !L.src.solid) continue;
      flat.push({ L, a, tin: Math.max(t0w, L.in ?? 0), tout: Math.min(t1w, L.out ?? D), y: beforeBoard ? -0.002 - 0.0002 * (50 - preOrder++) : tileTop + 0.002 + 0.0004 * order++, prefix });
    }
  }
  walk(compById.get(tl.mainComp), 0, D, '');
  for (const it of flat) {
    const { L, a } = it, tr = L.tr || {};
    const isLeaf = /^Leaf /.test(L.name), isHand = L.name === 'Hand';
    if (isLeaf && S.export3dParticles === false) continue;
    if (isHand && S.export3dHand === false) continue;
    qi++;
    const nm = `q${String(qi).padStart(4, '0')}_${SAFE(it.prefix + L.name)}`;
    let geo, mat;
    if (a) {
      const anc = tr.anchor || [0, 0];
      geo = quadGeo(a.w, a.h, anc[0], anc[1]);
      mat = new THREE.MeshBasicMaterial({ map: await texFromPng(a.file), transparent: true, depthWrite: false });
    } else {
      const [w, h] = [L.src.w, L.src.h]; geo = quadGeo(w, h, w / 2, h / 2);
      mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }); mat.color.setRGB(...L.src.solid.map(v => v > 1 ? v / 255 : v));
    }
    mat.name = 'mat_' + nm;
    const op0 = evalProp(tr.opacity, 0, 100);
    if (!animated(tr.opacity) && op0 < 100) mat.opacity = op0 / 100;
    const vis = new THREE.Group(); vis.name = nm + '_vis'; vis.position.y = it.y;
    const mesh = new THREE.Mesh(geo, mat); mesh.name = nm; vis.add(mesh); fx.add(vis);
    stats.quads++; if (isLeaf) stats.leaves++; if (isHand) stats.hand++;
    // 大面积半透明（开场压暗/结束页背景/发光）低于 50% 视为隐藏；小元素只要还看得见就显示
    const big = !a || a.w * a.h > W * H * 0.25, TH = big ? 50 : 1;
    const f0 = Math.max(0, Math.round(it.tin * fps)), f1 = Math.min(NF, Math.round(it.tout * fps));
    visTrack(vis.name, t => t >= f0 / fps - 1e-9 && t < f1 / fps - 1e-9 && evalProp(tr.opacity, t, 100) >= TH);
    if (animated(tr.position) || animated(tr.scale) || animated(tr.rotation)) {
      const times = frameTimes(0, NF), pv = [], qv = [], sv = [], q = new THREE.Quaternion(), ax = new THREE.Vector3(0, 1, 0);
      for (const t of times) {
        const tt = Math.min(Math.max(t, f0 / fps), Math.max(f0, f1 - 1) / fps);
        const p = evalProp(tr.position, tt, [0, 0]), sc = evalProp(tr.scale, tt, [100, 100]), r = evalProp(tr.rotation, tt, 0);
        pv.push(X(p[0]), 0, Z(p[1])); sv.push(sc[0] / 100, 1, sc[1] / 100);
        q.setFromAxisAngle(ax, -r * Math.PI / 180); qv.push(q.x, q.y, q.z, q.w);
      }
      addTrack(nm, 'position', times, pv, 3, THREE.InterpolateLinear);
      addTrack(nm, 'scale', times, sv, 3, THREE.InterpolateLinear);
      if (animated(tr.rotation)) addTrack(nm, 'quaternion', times, qv, 4, THREE.InterpolateLinear);
    }
    { const p = evalProp(tr.position, it.tin, [0, 0]), sc = evalProp(tr.scale, it.tin, [100, 100]), r = evalProp(tr.rotation, it.tin, 0);
      mesh.position.set(X(p[0]), 0, Z(p[1])); mesh.scale.set(sc[0] / 100, 1, sc[1] / 100); mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -r * Math.PI / 180); }
    if (animated(tr.opacity)) {
      const T = [], V = [];
      for (let f = f0; f <= f1; f++) { T.push(r5(f / fps)); V.push(Math.round(evalProp(tr.opacity, f / fps, 100)) / 100); }
      const rk = reduceKeys(T, V, 1); opacityTracks[nm] = rk.T.map((t, i) => [t, rk.V[i]]);
    }
    nodes.push({ name: nm, kind: isLeaf ? 'leaf' : isHand ? 'hand' : (a ? 'quad' : 'solid'), src: a ? a.file : null, in: r5(f0 / fps), out: r5(f1 / fps) });
  }

  // ---------- 相机 ----------
  // three r160 的 GLTFExporter 把 xmag/ymag 写成 right*2 / top*2（规范要求半宽/半高），这里传入 1/4 使写出的 xmag = W/2·PX、ymag = H/2·PX
  const cam = new THREE.OrthographicCamera(-W / 4 * PX, W / 4 * PX, H / 4 * PX, -H / 4 * PX, 0.01, 50);
  cam.name = 'camera_ortho_topdown'; cam.position.set(0, 10, 0); cam.rotation.set(-Math.PI / 2, 0, 0); root.add(cam);

  const clip = new THREE.AnimationClip('mahjong_game', D, tracks);
  const glb = await new GLTFExporter().parseAsync(root, { binary: true, animations: [clip], onlyVisible: false, trs: true });

  // 音频事件
  const audio = [];
  const mixA = tl.assets.find(a => a.id === 'mix');
  const sfxC = compById.get('sfx');
  if (sfxC) for (const L of sfxC.layers) { const a = assetById.get(L.src.asset); if (a) audio.push({ file: a.file, t: L.start || 0, db: L.audioDb || 0, name: L.name }); }
  const scene3d = {
    tool: 'mahjong-match-tool', format: 'export3d/1', fps, frames: NF + 1, frameStart: 0, frameEnd: NF, duration: D, width: W, height: H,
    units: { meter: 1, px: PX, note: '1 画布像素 = 1 mm；Y 轴向上；画面在 XZ 平面，屏幕右 = +X，屏幕下 = +Z' },
    camera: { name: cam.name, type: 'orthographic', xmag: W / 2 * PX, ymag: H / 2 * PX, orthoScale: Math.max(W, H) * PX, position: [0, 10, 0] },
    visibility: 'STEP 缩放：*_vis / tile_### 节点 scale=1 显示，scale=0 隐藏；牌的状态变体 *_v_d##[_sel] 同理',
    opacity: opacityTracks, nodes, audio, mix: mixA ? { file: mixA.file, t: 0 } : null, stats: { ...stats, tracks: tracks.length },
  };
  const enc = new TextEncoder();
  const out = [
    { name: 'scene.glb', data: new Uint8Array(glb) },
    { name: 'scene3d.json', data: enc.encode(JSON.stringify(scene3d)) },
    { name: 'timeline.json', data: fileMap.get('timeline.json') },
    { name: 'blender_import.py', data: enc.encode(PY_TEXT) },
    { name: 'README_3D.md', data: enc.encode(README_TEXT) },
    ...files.filter(f => f.name.startsWith('audio/')),
  ];
  const d = new Date(), p2 = x => String(x).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  return { blob: makeZip(out), name: `mahjong_3d_export_${stamp}.zip`, stats: scene3d.stats, duration: D, fps, glbSize: glb.byteLength };
}
