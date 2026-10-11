// 导出 After Effects 工程：时间轴记录器 + 素材渲染 + timeline.json / build_ae_project.jsx 打包
import { makeZip } from './zip.js';
import JSX_TEXT from './build_ae_project.jsx';
import README_TEXT from './README_AE.md';
import { renderSfxOffline, encodeWav, setSfxHook } from '../audio.js';

const LABEL = { layer: [11, 9, 8, 2, 13, 14, 6, 10], fly: 1, letter: 2, fx: 3, leaf: 7, ui: 15, end: 5, hand: 12, audio: 16, dim: 15 };
const r3 = v => Math.round(v * 1000) / 1000;

export function createAERecorder(api) {
  let R = null;
  const ids = new WeakMap(); let nextId = 1;
  const idOf = o => { let v = ids.get(o); if (!v) { v = nextId++; ids.set(o, v); } return v; };

  function active() { return !!R; }
  function elapsed() { return R ? (performance.now() - R.t0) / 1000 : 0; }

  function start(opt = {}) {
    const E = api.env();
    R = {
      t0: performance.now(), W: E.W, H: E.H, U: E.U, VP: { ...E.VP }, frames: 0, prevT: 0, lastT: 0, gen: 0, G: null,
      tiles: new Map(), tileAssets: new Map(), shared: null, boards: [],
      sprites: new Map(), parts: new Map(), ripples: new Map(), seams: new Map(), flashes: new Map(), intro: new Map(),
      dim: { s: [] }, glow: [], stars: new Map(), end: [], hand: [], handWH: null, events: [], sfx: [], snaps: [], snapAt: opt.snapAt || null,
      tapTimes: new Map(),
    };
    setSfxHook((name, vol, o, audible) => {
      if (!R) return; const t = elapsed();
      R.events.push([t, name]);
      if (audible) R.sfx.push({ t, name, vol, delay: o.delay || 0, dur: o.dur });
    });
  }
  function stop() { setSfxHook(null); const r = R; R = null; return r; }

  function onTap(tile) {
    if (!R || !R.G) return;
    const k = R.gen + '_' + tile.id; if (!R.tapTimes.has(k)) R.tapTimes.set(k, []);
    R.tapTimes.get(k).push(elapsed());
  }

  function pushChange(tr, t, vals) {
    const s = tr.s, last = s[s.length - 1];
    if (!last) { s.push([t, ...vals]); return; }
    let diff = false; for (let i = 0; i < vals.length; i++) if (last[i + 1] !== vals[i]) { diff = true; break; }
    if (!diff) return;
    if (last[0] < R.prevT - 1e-6) s.push([R.prevT, ...last.slice(1)]); // 先补一帧旧值，保证“保持→变化”在线性插值下不提前开始
    s.push([t, ...vals]);
  }

  function newBoard(G, t) {
    // 旧棋盘的牌全部在此刻结束
    for (const tr of R.tiles.values()) if (tr.gen === R.gen) { const last = tr.s[tr.s.length - 1]; if (last && last[1]) pushChange(tr, t, [0, last[2], last[3]]); }
    R.gen++; R.G = G;
    R.boards.push({ gen: R.gen, t0: t, layers: Math.max(...G.tiles.map(x => x.layer)) + 1 });
    if (!R.shared) R.shared = api.renderTileShared(G.tiles[0]);
    for (const tile of G.tiles) {
      for (const v of ['n', 's']) {
        const k = tile.key + '|' + v;
        if (!R.tileAssets.has(k)) R.tileAssets.set(k, api.renderTile(tile, v === 's'));
      }
      const p = api.tileScreen(tile);
      R.tiles.set(R.gen + '_' + tile.id, { id: R.gen + '_' + tile.id, gen: R.gen, tid: tile.id, key: tile.key, layer: tile.layer, col: tile.col, row: tile.row, x: p.x, y: p.y, s: [] });
    }
  }

  function sample(now) {
    if (!R) return;
    const E = api.env(), G = E.G, t = (now - R.t0) / 1000;
    if (G && G.tiles.length && G !== R.G) newBoard(G, t);
    if (G && G === R.G) {
      for (const tile of G.tiles) {
        const tr = R.tiles.get(R.gen + '_' + tile.id); if (!tr) continue;
        pushChange(tr, t, [tile.obj && tile.obj.visible ? 1 : 0, r3(tile.dark || 0), tile.state === 'selected' ? 1 : 0]);
      }
      for (const sp of G.sprites) {
        const id = idOf(sp);
        let tr = R.sprites.get(id);
        if (!tr) { tr = { id, key: sp.key, tint: sp.tint ? 1 : 0, z: sp.z || 0, s: [] }; R.sprites.set(id, tr); }
        tr.z = sp.z || 0;
        tr.s.push([t, sp.x, sp.y, sp.w * sp.scale * (sp.sx || 1), sp.h * sp.scale * (sp.sy || 1), sp.rot || 0, sp.alpha ?? 1]);
      }
      for (const p of G.particles) {
        const q = api.particleState(p, now); if (!q) continue;
        const id = idOf(p);
        let tr = R.parts.get(id);
        if (!tr) { tr = { id, burst: Math.round(p.t0) + '_' + Math.round(p.cx) + '_' + Math.round(p.cy), s0: p.s, m: p.m ?? 0, s: [] }; R.parts.set(id, tr); }
        tr.s.push([t, q.x, q.y, q.rot * 180 / Math.PI, q.alpha]);
      }
      const simple = (list, map, fn) => { for (const o of list || []) { const q = fn(o, now); if (!q) continue; const id = idOf(o); let tr = map.get(id); if (!tr) { tr = { id, s: [] }; map.set(id, tr); } tr.s.push([t, ...q]); } };
      simple(G.ripples, R.ripples, (o, n) => { const q = api.rippleState(o, n); return q && [q.x, q.y, q.R, q.alpha]; });
      simple(G.seams, R.seams, (o, n) => { const q = api.seamState(o, n); return q && [q.x, q.y, q.h, q.gw, q.R, q.a]; });
      simple(G.flashes, R.flashes, (o, n) => { const q = api.flashState(o, n); return q && [q.x, q.y, q.r, q.a]; });
      for (const L of api.introLetterStates(now)) {
        let tr = R.intro.get(R.gen + '_' + L.i);
        if (!tr) { tr = { id: R.gen + '_' + L.i, key: L.key, s: [] }; R.intro.set(tr.id, tr); }
        tr.s.push([t, L.x, L.y, L.w, L.h, L.alpha]);
      }
      pushChange(R.dim, t, [r3(api.introDimState(now))]);
      const gq = api.wordGlowState(now);
      if (gq) {
        R.glow.push([t, gq.opacity]);
        if (gq.stars.length) { const w = R.gen + '_' + gq.win; const e = R.stars.get(w); if (e) e.t1 = t; else R.stars.set(w, { t0: t, t1: t, stars: gq.stars }); }
      }
      const eq = api.endCardState(now);
      if (eq) R.end.push([t, eq.a, eq.icon, eq.pul]);
    }
    const hq = api.handState();
    if (E.IMG.handImage) {
      if (hq) { R.handWH = [hq.w, hq.h]; R.hand.push([t, hq.x, hq.y, hq.rot, hq.sx, hq.sy, hq.alpha]); }
      else if (R.hand.length) { const l = R.hand[R.hand.length - 1]; if (l[6] !== 0) R.hand.push([t, l[1], l[2], l[3], l[4], l[5], 0]); }
    }
    if (R.snapAt && R.snapAt.includes(R.frames)) R.snaps.push({ t, frame: R.frames, url: E.canvas.toDataURL('image/png') });
    R.prevT = t; R.lastT = t; R.frames++;
  }

  // ---------------- 导出 ----------------
  async function exportZip(S, rec = R) {
    if (!rec) throw new Error('没有可导出的记录');
    const E = api.env();
    if (E.W !== rec.W || E.H !== rec.H) throw new Error('记录后修改了分辨率，请重新记录');
    const fps = +S.aeFps || 30;
    let CW = rec.W, CH = rec.H;
    if (S.aeSize && S.aeSize !== 'canvas') { const [w, h] = S.aeSize.split('x').map(Number); CW = w; CH = Math.round(rec.H * w / rec.W); if (Math.abs(CH - h) <= 2) CH = h; }
    const K = CW / rec.W, U = rec.U, W = rec.W, H = rec.H;
    const zh = S.aeNames !== 'en';
    const N = (a, b) => zh ? a : b;
    const D = Math.max(1 / fps, Math.ceil((rec.lastT + 1 / fps) * fps - 1e-6) / fps);
    const bake = S.aeSampling === 'bake';

    // ---- 素材 ----
    const assets = [], assetFiles = [];
    const folders = [
      { id: 'root', name: N('麻将消除_AE工程', 'Mahjong_AE') },
      { id: 'img', name: N('素材', 'Assets'), parent: 'root' },
      { id: 'tiles', name: N('牌面', 'Tiles'), parent: 'img' },
      { id: 'sprites', name: N('飞行牌与字母', 'Sprites'), parent: 'img' },
      { id: 'fx', name: N('特效', 'FX'), parent: 'img' },
      { id: 'ui', name: N('界面', 'UI'), parent: 'img' },
      { id: 'aud', name: N('音频', 'Audio'), parent: 'root' },
      { id: 'pre', name: N('预合成', 'Precomps'), parent: 'root' },
    ];
    const toPng = c => new Promise(res => c.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/png'));
    const pending = [];
    function addAsset(id, folder, canvas, ax = 0, ay = 0, name) {
      const file = 'assets/' + id + '.png';
      const a = { id, file, folder, w: canvas.width, h: canvas.height, ax, ay, name: name || id + '.png' };
      assets.push(a); pending.push(toPng(canvas).then(data => assetFiles.push({ name: file, data })));
      return a;
    }
    // 离屏画布挂到页面里（隐藏）：通用字体族（sans-serif 等）的回退会参考元素所在文档/语言，与主画布保持一致
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden;visibility:hidden'; document.body.appendChild(host);
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); host.appendChild(c); return c; };
    function crop(c, pad = 1) {
      const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) return { c: mk(1, 1), ox: 0, oy: 0 };
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
      const o = mk(x1 - x0 + 1, y1 - y0 + 1); o.getContext('2d').drawImage(c, -x0, -y0); return { c: o, ox: x0, oy: y0 };
    }
    // 在整幅画布上画一部分，裁掉透明边；返回素材（锚点=左上角）+ 偏移
    function full(id, folder, fn) {
      const c = mk(W, H); api.withCtx(c.getContext('2d'), fn);
      const r = crop(c); const a = addAsset(id, folder, r.c); a.ox = r.ox; a.oy = r.oy; return a;
    }
    // 以 (cx,cy) 为锚点的局部素材
    function local(id, folder, w, h, fn) {
      const c = mk(w, h); api.withCtx(c.getContext('2d'), () => fn(w / 2, h / 2));
      const r = crop(c); return addAsset(id, folder, r.c, w / 2 - r.ox, h / 2 - r.oy);
    }
    const placeFull = a => ({ anchor: [0, 0], position: [a.ox * K, a.oy * K], scale: [100 * K, 100 * K] });

    const A = {};
    A.bg = full('bg', 'ui', () => api.drawBackground());
    A.bar = full('topbar', 'ui', () => api.drawTopBar(0, 'base'));
    A.logo = full('logo', 'ui', () => api.drawTopBar(0, 'logo'));
    A.slots = []; for (let i = 0; i < S.slotCount; i++) A.slots.push(full('slot_' + (i + 1), 'ui', () => api.drawTopBar(0, 'slot', i)));
    if (S.disclaimer) A.disc = full('disclaimer', 'ui', () => api.drawDisclaimer());

    // 牌（3D 渲染出的单张牌，含侧面/底座；锚点=牌面中心）
    const tileAsset = new Map();
    for (const [k, v] of rec.tileAssets) {
      const [key, var_] = k.split('|');
      tileAsset.set(k, addAsset('tile_' + safe(key) + (var_ === 's' ? '_sel' : ''), 'tiles', v.canvas, v.ax, v.ay, (var_ === 's' ? N('选中_', 'sel_') : '') + key + '.png'));
    }
    const sh = rec.shared;
    if (sh) {
      A.shadow = addAsset('tile_shadow', 'tiles', sh.shadow.canvas, sh.shadow.ax, sh.shadow.ay, N('牌_阴影.png', 'tile_shadow.png'));
      A.sil = addAsset('tile_dark', 'tiles', sh.sil.canvas, sh.sil.ax, sh.sil.ay, N('牌_压暗剪影.png', 'tile_dark.png'));
      if (sh.band) A.band = addAsset('tile_leftshadow', 'tiles', sh.band.canvas, sh.band.ax, sh.band.ay, N('牌_左侧接触阴影.png', 'tile_leftshadow.png'));
    }
    // 2D 飞行牌/托盘字母
    const G = rec.G; const tw0 = G ? api.tileScreen(G.tiles[0]).w : 80;
    const RW = Math.round(tw0 * 2), RH = G ? RW * G.th / G.tw : RW * 1.2;
    const spriteAsset = new Map();
    function spriteA(key, tint) {
      const k = key + '|' + tint; if (spriteAsset.has(k)) return spriteAsset.get(k);
      const a = local('sprite_' + safe(key) + (tint ? '_sel' : ''), 'sprites', RW * 1.9, RH * 1.9, (cx, cy) => api.drawTile2D(key, cx, cy, RW, RH, 1, tint));
      spriteAsset.set(k, a); return a;
    }
    const LEAF_N = 8, LR = 100;
    const leafA = []; if (S.aeLeaves !== 'off' && rec.parts.size) for (let i = 0; i < LEAF_N; i++) {
      const c1 = hex(S.particleColor), c2 = hex(S.particleColor2), m = (i + 0.5) / LEAF_N;
      const col = `rgb(${c1.map((v, k) => Math.round(v + (c2[k] - v) * m)).join(',')})`;
      leafA.push(local('leaf_' + i, 'fx', LR * 1.3, LR * 0.6, (cx, cy) => api.withTransform(cx, cy, () => api.drawLeaf(LR, LR * 0.28, col))));
    }
    const RR = 100, Rmid = W * S.rippleSize * 0.906, LWa = S.rippleWidth * U * 0.75 * RR / Math.max(1, Rmid);
    if (rec.ripples.size) A.ripple = local('ripple', 'fx', RR * 2 + LWa * 2 + 6, RR * 2 + LWa * 2 + 6, (cx, cy) => api.drawRipple(cx, cy, RR, LWa, 1));
    const GW0 = 40, H0 = 100, R0 = 100;
    if (rec.seams.size) {
      A.seamBand = local('seam_band', 'fx', GW0 * 2 + 4, H0 * 1.2, (cx, cy) => api.drawSeamBand(cx, cy, H0, GW0, 1));
      A.seamGlow = local('seam_glow', 'fx', R0 * 2 + 4, R0 * 2 + 4, (cx, cy) => api.drawSeamGlow(cx, cy, R0, 1));
    }
    if (rec.flashes.size) A.flash = local('flash', 'fx', R0 * 2 + 4, R0 * 2 + 4, (cx, cy) => api.drawFlash(cx, cy, R0, 1));
    const ST0 = 20;
    if (rec.stars.size) A.star = local('star', 'fx', ST0 * 2 + 4, ST0 * 2 + 4, (cx, cy) => api.star(cx, cy, ST0, S.glowColor));
    if (rec.glow.length) A.glow = full('relax_glow', 'fx', () => api.drawWordGlowRing(1, 1));
    if (rec.end.length) {
      A.ecBg = full('end_bg', 'ui', () => api.drawEndCard(0, 'bg'));
      A.ecGlow = full('end_glow', 'ui', () => api.drawEndCard(0, 'glow'));
      A.ecIcon = full('end_icon', 'ui', () => api.drawEndCard(0, 'icon'));
      A.ecTitle = full('end_title', 'ui', () => api.drawEndCard(0, 'title'));
      A.ecBtn = full('end_button', 'ui', () => api.drawEndCard(0, 'button'));
    }
    if (rec.hand.length && E.IMG.handImage && rec.handWH) {
      const [hw, hh] = rec.handWH, pad = Math.max(hw, hh) * 1.6;
      A.hand = local('hand', 'ui', pad * 2, pad * 2, (cx, cy) => api.drawHand({ x: cx, y: cy, rot: 0, sx: 1, sy: 1, alpha: 1, press: 0, w: hw, h: hh }));
    }

    // ---- 关键帧工具 ----
    function frames(s) { // 线性插值重采样到 fps 网格
      const f0 = Math.round(s[0][0] * fps), f1 = Math.max(f0, Math.round(s[s.length - 1][0] * fps)), out = [];
      let j = 0;
      for (let f = f0; f <= f1; f++) {
        const tau = f / fps;
        while (j < s.length - 2 && s[j + 1][0] <= tau + 1e-9) j++;
        const a = s[j], b = s[j + 1] || a, u = b[0] > a[0] ? Math.min(1, Math.max(0, (tau - a[0]) / (b[0] - a[0]))) : 0;
        out.push({ t: tau, v: a.map((x, i) => i === 0 ? tau : x + (b[i] - x) * u) });
      }
      return { f0, f1, list: out, in: f0 / fps, out: (f1 + 1) / fps };
    }
    function prop(fr, get, tol, hold = false) {
      const t = fr.list.map(o => o.t), v = fr.list.map(o => get(o.v));
      const same = (a, b, e) => Array.isArray(a) ? a.every((x, i) => Math.abs(x - b[i]) <= e) : Math.abs(a - b) <= e;
      if (v.every(x => same(x, v[0], 1e-6))) return rnd(v[0]);
      let keep;
      if (hold) { keep = [0]; for (let i = 1; i < v.length; i++) if (!same(v[i], v[i - 1], 1e-6)) keep.push(i); }
      else if (bake) keep = v.map((_, i) => i);
      else {
        keep = [0]; let a = 0;
        for (let b = 2; b < v.length; b++) {
          let ok = true;
          for (let m = a + 1; m < b && ok; m++) {
            const u = (t[m] - t[a]) / (t[b] - t[a]);
            const lin = Array.isArray(v[a]) ? v[a].map((x, i) => x + (v[b][i] - x) * u) : v[a] + (v[b] - v[a]) * u;
            ok = same(lin, v[m], tol);
          }
          if (!ok) { keep.push(b - 1); a = b - 1; }
        }
        if (v.length > 1) keep.push(v.length - 1);
      }
      const P = { t: keep.map(i => r4(t[i])), v: keep.map(i => rnd(v[i])) };
      if (hold) P.hold = true;
      return P;
    }
    const rnd = v => Array.isArray(v) ? v.map(x => Math.round(x * 100) / 100) : Math.round(v * 100) / 100;
    const r4 = x => Math.round(x * 10000) / 10000;
    const TOL = { pos: 0.25, scale: 0.25, rot: 0.2, op: 0.5 };
    const keyCount = P => (P && typeof P === 'object' && !Array.isArray(P) && P.t) ? P.t.length : 0;

    // ---- 合成与图层 ----
    const comps = [], mainLayers = [], mainMarkers = [];
    const compDef = (id, name, layers, folder = 'pre') => { const c = { id, name, w: CW, h: CH, duration: D, fps, folder, layers }; comps.push(c); return c; };
    const L = (name, src, o = {}) => ({ name, src, ...o });

    mainLayers.push(L(N('背景', 'Background'), { asset: A.bg.id }, { label: LABEL.ui, tr: placeFull(A.bg) }));

    // 棋盘：每局 × 每层一个预合成；层内顺序：本层阴影 → 牌(+选中+压暗)（上行先、左列先，保证下/右邻牌盖住侧面）→ 左侧接触阴影
    for (const bd of rec.boards) {
      const all = [...rec.tiles.values()].filter(x => x.gen === bd.gen);
      for (let li = 0; li < bd.layers; li++) {
        const tiles = all.filter(x => x.layer === li).sort((a, b) => (a.y - b.y) || (a.x - b.x));
        if (!tiles.length) continue;
        const lab = LABEL.layer[li % LABEL.layer.length];
        const shadows = [], body = [], bands = [];
        for (const tr of tiles) {
          // 可见区间
          const s = tr.s; let tin = null, tout = null;
          for (const e of s) { if (e[1] && tin === null) tin = e[0]; if (!e[1] && tin !== null && tout === null) tout = e[0]; }
          if (tin === null) continue;
          const fin = Math.round(tin * fps) / fps, fout = tout === null ? D : Math.max(fin + 1 / fps, Math.round(tout * fps) / fps);
          const nm = `${N('第' + (li + 1) + '层', 'L' + (li + 1))} r${tr.row + 1}c${tr.col + 1} ${tr.key}`;
          const pos = [tr.x * K, tr.y * K], sc = [100 * K, 100 * K];
          const base = { in: fin, out: fout, label: lab };
          const taps = (rec.tapTimes.get(tr.id) || []).map(t => [r4(t), N('点击', 'tap')]);
          const na = tileAsset.get(tr.key + '|n');
          if (A.shadow) shadows.push(L(N('阴影 ', 'shadow ') + nm, { asset: A.shadow.id }, { ...base, tr: { anchor: [A.shadow.ax, A.shadow.ay], position: pos, scale: sc } }));
          body.push(L(N('牌 ', 'tile ') + nm, { asset: na.id }, { ...base, markers: taps.length ? taps : undefined, tr: { anchor: [na.ax, na.ay], position: pos, scale: sc } }));
          const live = s.filter(e => e[0] <= fout + 1e-9);
          const fr = frames(live.length > 1 ? live : [live[0], [fout, ...live[0].slice(1)]]);
          if (s.some(e => e[3])) {
            const sa = tileAsset.get(tr.key + '|s');
            body.push(L(N('选中 ', 'selected ') + nm, { asset: sa.id }, { ...base, tr: { anchor: [sa.ax, sa.ay], position: pos, scale: sc, opacity: prop(fr, v => v[3] ? 100 : 0, 0, true) } }));
          }
          if (A.sil && s.some(e => e[2] > 0.001)) {
            body.push(L(N('压暗 ', 'dark ') + nm, { asset: A.sil.id }, { ...base, tr: { anchor: [A.sil.ax, A.sil.ay], position: pos, scale: sc, opacity: prop(fr, v => (1 - srgbEnc(1 - v[2])) * 100, TOL.op) } }));
          }
          if (A.band) bands.push(L(N('接触阴影 ', 'contact ') + nm, { asset: A.band.id }, { ...base, tr: { anchor: [A.band.ax, A.band.ay], position: pos, scale: sc } }));
        }
        const layers = [...shadows, ...body, ...bands];
        const title = N(`第${li + 1}层`, `Layer ${li + 1}`) + (rec.boards.length > 1 ? N(`（第${bd.gen}局）`, ` (game ${bd.gen})`) : '');
        if (S.aeGroupLayers !== false) {
          const c = compDef(`board_${bd.gen}_${li}`, title, layers);
          mainLayers.push(L(title, { comp: c.id }, { label: lab, in: Math.round(bd.t0 * fps) / fps }));
        } else mainLayers.push(...layers);
      }
    }
    // 开场压暗
    if (rec.dim.s.some(e => e[1] > 0)) {
      const fr = frames(rec.dim.s.length > 1 ? rec.dim.s : [rec.dim.s[0], [D, rec.dim.s[0][1]]]);
      const VP = rec.VP;
      mainLayers.push(L(N('开场压暗', 'Intro dim'), { solid: [0, 0, 0], w: Math.round(VP.w * K), h: Math.round(VP.h * K) }, { label: LABEL.dim, tr: { position: [(VP.x + VP.w / 2) * K, (VP.y + VP.h / 2) * K], opacity: prop(fr, v => v[1] * 100, TOL.op) } }));
    }
    mainLayers.push(L(N('顶栏', 'Top bar'), { asset: A.bar.id }, { label: LABEL.ui, tr: placeFull(A.bar) }));
    mainLayers.push(L('Logo', { asset: A.logo.id }, { label: LABEL.ui, tr: placeFull(A.logo) }));
    A.slots.forEach((a, i) => mainLayers.push(L(N('托盘格 ', 'Slot ') + (i + 1), { asset: a.id }, { label: LABEL.ui, tr: placeFull(a) })));

    // 2D 牌（开场字母 / 飞行牌 / 托盘字母）
    const spriteLayer = (name, key, tint, s, label, markers) => {
      const a = spriteA(key, tint), fr = frames(s);
      return L(name, { asset: a.id }, { in: fr.in, out: Math.min(D, fr.out), label, markers, tr: {
        anchor: [a.ax, a.ay],
        position: prop(fr, v => [v[1] * K, v[2] * K], TOL.pos),
        scale: prop(fr, v => [v[3] / RW * 100 * K, v[4] / RH * 100 * K], TOL.scale),
        rotation: prop(fr, v => v[5], TOL.rot),
        opacity: prop(fr, v => v[6] * 100, TOL.op),
      } });
    };
    for (const tr of rec.intro.values()) mainLayers.push(spriteLayer(N('开场字母 ', 'Intro letter ') + tr.key, tr.key, 0, tr.s.map(e => [e[0], e[1], e[2], e[3], e[4], 0, e[5]]), LABEL.letter));
    // RELAX 发光
    if (rec.glow.length && A.glow) {
      const fr = frames(rec.glow);
      mainLayers.push(L(N('单词集齐发光', 'Word glow'), { asset: A.glow.id }, { in: fr.in, out: D, label: LABEL.fx, tr: { ...placeFull(A.glow), opacity: prop(fr, v => v[1] * 100, TOL.op) } }));
      if (rec.stars.size) {
        const starLayers = [];
        let n = 0;
        for (const w of rec.stars.values()) for (const st of w.stars) {
          n++;
          starLayers.push(L(N('星星 ', 'Star ') + n, { asset: A.star.id }, { in: Math.round(w.t0 * fps) / fps, out: Math.round(w.t1 * fps) / fps + 1 / fps, label: LABEL.fx, tr: { anchor: [A.star.ax, A.star.ay], position: [st.x * K, st.y * K], scale: [st.r / ST0 * 100 * K, st.r / ST0 * 100 * K] } }));
        }
        const c = compDef('stars', N('单词集齐_闪光星星', 'Word stars'), starLayers);
        mainLayers.push(L(c.name, { comp: c.id }, { label: LABEL.fx }));
      }
    }
    // 飞行牌、托盘字母（按绘制层级 z，同 z 按出现先后）
    const sprites = [...rec.sprites.values()].sort((a, b) => (a.z - b.z) || (a.id - b.id));
    let fly = 0;
    for (const tr of sprites) {
      const isLetter = /^[TL]/.test(tr.key) && !tr.tint;
      fly++;
      const nm = isLetter ? N('字母 ', 'Letter ') + tr.key : N('飞行牌 #', 'Flying #') + fly + ' ' + tr.key;
      mainLayers.push(spriteLayer(nm, tr.key, tr.tint, tr.s, isLetter ? LABEL.letter : LABEL.fly, [[r4(Math.round(tr.s[0][0] * fps) / fps), isLetter ? N('字母入槽', 'letter') : N('配对飞行', 'match')]]));
    }
    // 接缝光 / 闪光
    let n = 0;
    for (const tr of rec.seams.values()) {
      const fr = frames(tr.s); n++;
      mainLayers.push(L(N('碰撞接缝光带 #', 'Seam band #') + n, { asset: A.seamBand.id }, { in: fr.in, out: fr.out, label: LABEL.fx, blend: 'add', markers: [[r4(fr.in), N('碰撞', 'impact')]], tr: { anchor: [A.seamBand.ax, A.seamBand.ay], position: prop(fr, v => [v[1] * K, v[2] * K], TOL.pos), scale: prop(fr, v => [v[4] / GW0 * 100 * K, v[3] / H0 * 100 * K], TOL.scale), opacity: prop(fr, v => Math.min(100, v[6] * 100), TOL.op) } }));
      mainLayers.push(L(N('碰撞光晕 #', 'Seam glow #') + n, { asset: A.seamGlow.id }, { in: fr.in, out: fr.out, label: LABEL.fx, blend: 'add', tr: { anchor: [A.seamGlow.ax, A.seamGlow.ay], position: prop(fr, v => [v[1] * K, v[2] * K], TOL.pos), scale: prop(fr, v => [v[5] / R0 * 100 * K, v[5] / R0 * 100 * K], TOL.scale), opacity: prop(fr, v => Math.min(100, v[6] * 100), TOL.op) } }));
    }
    n = 0;
    for (const tr of rec.flashes.values()) {
      const fr = frames(tr.s); n++;
      mainLayers.push(L(N('闪光 #', 'Flash #') + n, { asset: A.flash.id }, { in: fr.in, out: fr.out, label: LABEL.fx, tr: { anchor: [A.flash.ax, A.flash.ay], position: prop(fr, v => [v[1] * K, v[2] * K], TOL.pos), scale: prop(fr, v => [v[3] / R0 * 100 * K, v[3] / R0 * 100 * K], TOL.scale), opacity: prop(fr, v => v[4] * 100, TOL.op) } }));
    }
    // 树叶
    if (S.aeLeaves !== 'off' && leafA.length) {
      const bursts = new Map();
      for (const tr of rec.parts.values()) { if (!bursts.has(tr.burst)) bursts.set(tr.burst, []); bursts.get(tr.burst).push(tr); }
      let bi = 0;
      for (const list of bursts.values()) {
        bi++;
        const ls = list.map((tr, i) => {
          const a = leafA[Math.min(LEAF_N - 1, Math.floor(tr.m * LEAF_N))], fr = frames(tr.s), s = tr.s0 / LR * 100 * K;
          return L(N(`树叶 ${bi}-${i + 1}`, `Leaf ${bi}-${i + 1}`), { asset: a.id }, { in: fr.in, out: fr.out, label: LABEL.leaf, tr: { anchor: [a.ax, a.ay], position: prop(fr, v => [v[1] * K, v[2] * K], TOL.pos), scale: [s, s], rotation: prop(fr, v => v[3], TOL.rot), opacity: prop(fr, v => v[4] * 100, TOL.op) } });
        });
        if (S.aeLeaves === 'precomp') {
          const c = compDef('burst_' + bi, N('树叶爆开 #', 'Leaf burst #') + bi, ls);
          const tin = Math.min(...ls.map(x => x.in)), tout = Math.max(...ls.map(x => x.out));
          mainLayers.push(L(c.name, { comp: c.id }, { in: tin, out: tout, label: LABEL.leaf, markers: [[r4(tin), N('树叶爆开', 'burst')]] }));
        } else mainLayers.push(...ls);
      }
    }
    // 点击波纹
    n = 0;
    for (const tr of rec.ripples.values()) {
      const fr = frames(tr.s); n++;
      mainLayers.push(L(N('点击波纹 #', 'Ripple #') + n, { asset: A.ripple.id }, { in: fr.in, out: fr.out, label: LABEL.fx, markers: [[r4(fr.in), N('点击', 'tap')]], tr: { anchor: [A.ripple.ax, A.ripple.ay], position: [tr.s[0][1] * K, tr.s[0][2] * K], scale: prop(fr, v => [v[3] / RR * 100 * K, v[3] / RR * 100 * K], TOL.scale), opacity: prop(fr, v => v[4] * 100, TOL.op) } }));
    }
    if (A.disc) mainLayers.push(L(N('免责声明', 'Disclaimer'), { asset: A.disc.id }, { label: LABEL.ui, tr: placeFull(A.disc) }));
    // 结束页
    if (rec.end.length) {
      const fr = frames(rec.end);
      const b = api.endButtonRect(), gy = H * 0.3;
      // 网页里每个部件各自乘淡入透明度（而不是整体淡入），所以不透明度关键帧放在每个部件图层上
      const fade = () => prop(fr, v => v[1] * 100, TOL.op);
      const ecl = [
        L(N('结束页_背景', 'End bg'), { asset: A.ecBg.id }, { label: LABEL.end, tr: { ...placeFull(A.ecBg), opacity: fade() } }),
        L(N('结束页_光晕', 'End glow'), { asset: A.ecGlow.id }, { label: LABEL.end, tr: { ...placeFull(A.ecGlow), opacity: fade() } }),
        L(N('结束页_图标', 'End icon'), { asset: A.ecIcon.id }, { label: LABEL.end, tr: { anchor: [W / 2 - A.ecIcon.ox, gy - A.ecIcon.oy], position: [W / 2 * K, gy * K], scale: prop(fr, v => [v[2] * 100 * K, v[2] * 100 * K], TOL.scale), opacity: fade() } }),
        L(N('结束页_标题', 'End title'), { asset: A.ecTitle.id }, { label: LABEL.end, tr: { ...placeFull(A.ecTitle), opacity: fade() } }),
        L(N('结束页_按钮', 'End button'), { asset: A.ecBtn.id }, { label: LABEL.end, tr: { anchor: [b.x - A.ecBtn.ox, b.y - A.ecBtn.oy], position: [b.x * K, b.y * K], scale: prop(fr, v => [v[3] * 100 * K, v[3] * 100 * K], TOL.scale), opacity: fade() } }),
      ];
      const c = compDef('endcard', N('结束页', 'End card'), ecl);
      mainLayers.push(L(c.name, { comp: c.id }, { in: fr.in, label: LABEL.end, markers: [[r4(fr.in), N('结束页', 'end card')]] }));
    }
    // 手指
    if (A.hand && rec.hand.length) {
      const fr = frames(rec.hand);
      mainLayers.push(L(N('手指', 'Hand'), { asset: A.hand.id }, { in: fr.in, label: LABEL.hand, tr: { anchor: [A.hand.ax, A.hand.ay], position: prop(fr, v => [v[1] * K, v[2] * K], TOL.pos), rotation: prop(fr, v => v[3], TOL.rot), scale: prop(fr, v => [v[4] * 100 * K, v[5] * 100 * K], TOL.scale), opacity: prop(fr, v => v[6] * 100, TOL.op) } }));
    }
    // 音频
    const audioFiles = [];
    if (S.aeAudio !== 'none' && rec.sfx.length) {
      try {
        if (S.aeAudio === 'both' || S.aeAudio === 'mixed') {
          const buf = await renderSfxOffline(rec.sfx, D);
          if (buf) { audioFiles.push({ name: 'audio/mix.wav', data: encodeWav(buf) }); assets.push({ id: 'mix', file: 'audio/mix.wav', folder: 'aud', name: 'mix.wav' }); mainLayers.push(L(N('混合音轨', 'Mixed audio'), { asset: 'mix' }, { label: LABEL.audio })); }
        }
        if (S.aeAudio === 'both' || S.aeAudio === 'events') {
          const names = [...new Set(rec.sfx.map(e => e.name))], layers = [];
          for (const nm of names) {
            const first = rec.sfx.find(e => e.name === nm);
            const buf = await renderSfxOffline([{ t: 0, name: nm, vol: 1, dur: first.dur }], nm === 'End' ? 2.2 : 1.6);
            if (!buf) continue;
            audioFiles.push({ name: `audio/sfx_${nm}.wav`, data: encodeWav(buf) }); assets.push({ id: 'sfx_' + nm, file: `audio/sfx_${nm}.wav`, folder: 'aud', name: `sfx_${nm}.wav` });
          }
          rec.sfx.forEach((e, i) => { const st = r4(e.t + (e.delay || 0)); layers.push(L(`${N('音效', 'SFX')} ${i + 1} ${SFX_ZH[e.name] && zh ? SFX_ZH[e.name] : e.name}`, { asset: 'sfx_' + e.name }, { start: st, in: st, label: LABEL.audio, audioDb: Math.round(20 * Math.log10(Math.max(1e-4, e.vol)) * 10) / 10 })); });
          const c = compDef('sfx', N('音效_逐事件', 'SFX events'), layers);
          mainLayers.push(L(c.name, { comp: c.id }, { label: LABEL.audio }));
        }
      } catch (e) { console.warn('audio export', e); }
    }
    for (const [t, name] of rec.events) mainMarkers.push([r4(t), SFX_ZH[name] && zh ? SFX_ZH[name] : name]);
    const d = new Date(), p2 = x => String(x).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    const main = { id: 'main', name: N('主合成_麻将消除', 'Main_Mahjong'), w: CW, h: CH, duration: D, fps, folder: 'root', bg: [0, 0, 0], layers: mainLayers, markers: mainMarkers };
    comps.push(main);
    // 期望统计（供校验）
    const stats = { comps: comps.length, layers: 0, keys: 0, perComp: {} };
    for (const c of comps) {
      stats.perComp[c.id] = c.layers.length; stats.layers += c.layers.length;
      for (const l of c.layers) if (l.tr) for (const k of ['position', 'scale', 'rotation', 'opacity']) { const kc = keyCount(l.tr[k]); if (kc > 1) stats.keys += kc; }
    }
    const timeline = {
      meta: { tool: 'mahjong-match-tool', format: 1, created: d.toISOString(), fps, width: CW, height: CH, duration: D, canvas: [W, H], scale: K, sampling: bake ? 'bake' : 'reduce',
        saveAep: S.aeSaveAep !== false, aepName: `mahjong_${stamp}.aep`, newProject: true, stats, note: '图层从下到上排列；时间单位秒；位置/锚点单位像素（合成坐标）；缩放为百分比' },
      folders, assets: assets.map(({ id, file, folder, w, h, name }) => ({ id, file, folder, w, h, name })), comps, mainComp: 'main',
    };
    await Promise.all(pending);
    host.remove();
    const enc = new TextEncoder();
    const files = [
      { name: 'build_ae_project.jsx', data: enc.encode(JSX_TEXT) },
      { name: 'timeline.json', data: enc.encode(JSON.stringify(timeline)) },
      { name: 'README_AE.md', data: enc.encode(README_TEXT) },
      ...assetFiles.sort((a, b) => a.name < b.name ? -1 : 1), ...audioFiles,
    ];
    const blob = makeZip(files);
    return { blob, name: `mahjong_ae_export_${stamp}.zip`, timeline, stats, files: files.length, snaps: rec.snaps.map(s => ({ t: s.t, frame: s.frame })) };
  }

  return { start, stop, sample, onTap, exportZip, active, elapsed, get rec() { return R; } };
}
const SFX_ZH = { Tap: '点击', Whoosh: '飞行', Clack: '碰撞', Burst: '树叶爆开', Letter: '字母入槽', Word: '单词集齐', End: '结束页' };
// three.js 在线性空间里把颜色乘以 (1-dark)，输出再做 sRGB 编码；黑色叠加层需换算成 sRGB 下的等效不透明度
function srgbEnc(x) { x = Math.max(0, Math.min(1, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; }
function safe(k) { return String(k).replace(/[^A-Za-z0-9_-]/g, m => '_' + m.charCodeAt(0).toString(16)); }
function hex(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || '#000000'); const n = parseInt(m ? m[1] : '000000', 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function dataUrlBytes(u) { const b = atob(u.split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
