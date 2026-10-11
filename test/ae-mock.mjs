// 在 Node 里用“模拟 AE 对象模型”运行 build_ae_project.jsx：
//  (a) acorn 以 ecmaVersion 3 解析，保证 ExtendScript(ES3) 语法兼容；
//  (b) 删除 ES5+ 内置（JSON、forEach、indexOf、trim…）后在 vm 中执行，记录所有调用，并按 AE 的约束做检查；
//  (c) 与 timeline.json 中的期望统计对比：每个合成的图层数、关键帧总数、标记、素材导入、入出点。
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { execSync } from 'child_process';
import * as acorn from 'acorn';
export function runMock(dir) {
  const jsx = fs.readFileSync(path.join(dir, 'build_ae_project.jsx'), 'utf8');
  acorn.parse(jsx, { ecmaVersion: 3 }); // 语法不兼容会抛错
  const TL = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  const errs = [], log = { imports: 0, folders: 0, comps: [], saved: null, alerts: [] };
  const fail = m => errs.push(m);
  const KIT = { LINEAR: 6612, HOLD: 6613, BEZIER: 6614 };
  class MFile {
    constructor(p) { this.fsName = path.resolve(String(p)); this.encoding = 'BINARY'; this._pos = null; }
    get exists() { return fs.existsSync(this.fsName); }
    get parent() { return new MFile(path.dirname(this.fsName)); }
    get name() { return path.basename(this.fsName); }
    open(mode) { if (mode === 'r' && !this.exists) return false; this._mode = mode; return true; }
    read() { if (this._mode !== 'r') throw new Error('file not open'); return fs.readFileSync(this.fsName, this.encoding === 'UTF-8' ? 'utf8' : 'latin1'); }
    close() { this._mode = null; }
  }
  class Prop {
    constructor(name, dims, owner) { this.name = name; this.dims = dims; this.keys = []; this.value = null; this.owner = owner; this.dimensionsSeparated = false; }
    get numKeys() { return this.keys.length; }
    check(v) {
      if (this.dims === 1) { if (typeof v !== 'number' || !isFinite(v)) fail(`${this.owner.name} ${this.name}: 非数值 ${v}`); if (this.name === 'ADBE Opacity' && (v < -1e-6 || v > 100.0001)) fail(`${this.owner.name} 不透明度越界 ${v}`); }
      else if (!Array.isArray(v) || v.length < 2 || v.length > 3 || [].slice.call(v).some(x => typeof x !== 'number' || !isFinite(x))) fail(`${this.owner.name} ${this.name}: 维度/数值错误 ${JSON.stringify(v)}`);
    }
    setValue(v) { if (this.keys.length) fail(`${this.owner.name} ${this.name}: 有关键帧时不能 setValue`); this.check(v); this.value = v; }
    setValueAtTime(t, v) { if (this.name === 'ADBE Marker') { if (!(v instanceof MarkerValue)) fail('marker 需要 MarkerValue'); this.keys.push({ t, v }); return; } this.check(v); this.keys.push({ t, v }); }
    setValuesAtTimes(ts, vs) {
      if (this.name === 'ADBE Position' && this.owner._posSep) fail(`${this.owner.name}: 已拆分维度后仍对 Position 设关键帧`);
      if (ts.length !== vs.length) fail(`${this.owner.name} ${this.name}: 时间/数值数量不一致`);
      for (let i = 0; i < ts.length; i++) { if (i && !(ts[i] > ts[i - 1])) fail(`${this.owner.name} ${this.name}: 关键帧时间未递增`); if (ts[i] < -1e-6 || ts[i] > this.owner.comp.duration + 1e-6) fail(`${this.owner.name} ${this.name}: 关键帧时间越界 ${ts[i]}`); this.check(vs[i]); this.keys.push({ t: ts[i], v: vs[i] }); }
    }
    setInterpolationTypeAtKey(k, a, b) { if (k < 1 || k > this.keys.length) fail(`${this.owner.name} ${this.name}: key 下标越界`); if (![KIT.LINEAR, KIT.HOLD, KIT.BEZIER].includes(a)) fail('插值类型错误'); this.keys[k - 1].interp = a; }
  }
  class Layer {
    constructor(comp, src, kind) {
      this.comp = comp; this.src = src; this.kind = kind; this.name = ''; this.label = 0; this.blendingMode = 'NORMAL'; this.comment = '';
      this._start = 0; this._in = 0; this._out = kind === 'audio' ? Math.min(comp.duration, (src.duration || 1)) : comp.duration;
      const P = (n, d) => new Prop(n, d, this);
      const tg = { 'ADBE Anchor Point': P('ADBE Anchor Point', 2), 'ADBE Position': P('ADBE Position', 2), 'ADBE Position_0': P('ADBE Position_0', 1), 'ADBE Position_1': P('ADBE Position_1', 1), 'ADBE Scale': P('ADBE Scale', 2), 'ADBE Rotate Z': P('ADBE Rotate Z', 1), 'ADBE Opacity': P('ADBE Opacity', 1) };
      const self = this;
      Object.defineProperty(tg['ADBE Position'], 'dimensionsSeparated', { get() { return self._posSep || false; }, set(v) { self._posSep = !!v; } });
      this._tg = tg; this._marker = P('ADBE Marker', 0); this._audio = { 'ADBE Audio Levels': P('ADBE Audio Levels', 2) };
    }
    get startTime() { return this._start; } set startTime(v) { const d = v - this._start; this._start = v; this._in += d; this._out = this.kind === 'audio' ? Math.min(this.comp.duration, v + (this.src.duration || 1)) : this._out + d; }
    get inPoint() { return this._in; } set inPoint(v) { if (v > this._out) fail(`${this.name}: inPoint > outPoint`); this._in = v; }
    get outPoint() { return this._out; } set outPoint(v) { if (v < this._in) fail(`${this.name}: outPoint < inPoint (${v} < ${this._in})`); if (v > this.comp.duration + 1e-6) fail(`${this.name}: outPoint 超出合成时长`); this._out = v; }
    property(n) {
      if (n === 'ADBE Transform Group') { const tg = this._tg, self = this; return { property(m) { if ((m === 'ADBE Position_0' || m === 'ADBE Position_1') && !self._posSep) fail(`${self.name}: 未拆分维度就访问 ${m}`); if (!tg[m]) fail('未知属性 ' + m); return tg[m]; } }; }
      if (n === 'ADBE Marker') return this._marker;
      if (n === 'ADBE Audio Group') { if (this.kind !== 'audio') throw new Error('no audio'); const a = this._audio; return { property(m) { return a[m]; } }; }
      fail('未知属性组 ' + n);
    }
  }
  class Comp {
    constructor(name, w, h, par, dur, fps) { if (!(w >= 4 && h >= 4 && w <= 30000 && h <= 30000)) fail('合成尺寸非法'); if (!(dur > 0 && fps > 0)) fail('时长/帧率非法'); Object.assign(this, { name, width: w, height: h, pixelAspect: par, duration: dur, frameRate: fps, typeName: 'Composition' }); this.layerList = []; const self = this; this.markerProperty = new Prop('ADBE Marker', 0, { name: 'comp ' + name, comp: this }); this.layers = { add(item) { if (!item || !item.typeName) fail('layers.add 参数不是素材/合成'); if (item === self) fail('合成不能包含自身'); const L = new Layer(self, item, item.isAudio ? 'audio' : (item.typeName === 'Composition' ? 'comp' : 'image')); self.layerList.unshift(L); return L; }, addSolid(color, name, w, h, par, dur) { if (!Array.isArray(color) || color.length !== 3) fail('solid 颜色错误'); const L = new Layer(self, { typeName: 'Solid', width: w, height: h }, 'solid'); L.name = name; self.layerList.unshift(L); return L; } }; log.comps.push(this); }
    openInViewer() { this._opened = true; }
  }
  class Folder { constructor(name) { this.name = name; this.typeName = 'Folder'; } }
  class ImportOptions { constructor(f) { if (!(f instanceof MFile)) fail('ImportOptions 需要 File'); this.file = f; this.importAs = null; } canImportAs() { return true; } }
  class MarkerValue { constructor(c) { this.comment = c; } }
  const project = {
    items: { addFolder(n) { log.folders++; return new Folder(n); }, addComp(...a) { return new Comp(...a); } },
    importFile(io) { if (!io.file.exists) fail('导入不存在的文件 ' + io.file.fsName); log.imports++; const ext = path.extname(io.file.fsName).toLowerCase(); const it = { typeName: 'Footage', name: path.basename(io.file.fsName), file: io.file, isAudio: ext === '.wav' }; if (it.isAudio) { const st = fs.statSync(io.file.fsName); it.duration = (st.size - 44) / 2 / 44100; } return it; },
    save(f) { log.saved = f.fsName; },
  };
  const sandbox = {
    app: { project, newProject() { log.newProject = true; return project; }, beginUndoGroup() { log.undo = (log.undo || 0) + 1; }, endUndoGroup() { log.undo--; } },
    $: { fileName: path.join(dir, 'build_ae_project.jsx'), global: {} },
    File: MFile, Folder: MFile, ImportOptions, ImportAsType: { FOOTAGE: 1, COMP: 2, PROJECT: 3 }, MarkerValue,
    KeyframeInterpolationType: KIT, BlendingMode: { ADD: 'ADD', NORMAL: 'NORMAL' },
    alert(m) { log.alerts.push(String(m)); }, confirm() { return true; },
  };
  vm.createContext(sandbox);
  // ExtendScript(ES3) 没有这些 ES5+ 内置；删掉后若脚本用到会直接报错
  vm.runInContext('delete this.JSON; Array.prototype.forEach=Array.prototype.map=Array.prototype.filter=Array.prototype.indexOf=Array.prototype.reduce=Array.prototype.some=Array.prototype.every=undefined; Array.isArray=undefined; String.prototype.trim=undefined; Object.keys=undefined; Object.create=undefined; Function.prototype.bind=undefined; Date.now=undefined;', sandbox);
  vm.runInContext(jsx, sandbox, { filename: 'build_ae_project.jsx' });
  // ---- 对比 ----
  const st = sandbox.$.global.__MJ_BUILD_STATS;
  const exp = TL.meta.stats;
  if (!st) fail('脚本没有跑完（没有统计）');
  const byName = {}; for (const c of log.comps) byName[c.name] = c;
  for (const c of TL.comps) {
    const mc = byName[c.name]; if (!mc) { fail('缺少合成 ' + c.name); continue; }
    if (mc.layerList.length !== c.layers.length) fail(`合成 ${c.name} 图层数 ${mc.layerList.length} ≠ 期望 ${c.layers.length}`);
    // 叠放顺序：AE 图层 1 在最上 = timeline 最后一个
    const names = mc.layerList.map(l => l.name).reverse();
    for (let i = 0; i < c.layers.length; i++) if (names[i] !== c.layers[i].name) { fail(`合成 ${c.name} 第 ${i} 层顺序错误：${names[i]} vs ${c.layers[i].name}`); break; }
    // 入出点 & 关键帧逐项核对
    const layers = mc.layerList.slice().reverse();
    c.layers.forEach((L, i) => {
      const ml = layers[i]; if (!ml) return;
      if (L.in !== undefined && L.in > 0 && Math.abs(ml.inPoint - Math.max(L.in, L.start || 0)) > 1e-6) fail(`${L.name} inPoint ${ml.inPoint} ≠ ${L.in}`);
      if (L.out !== undefined && L.out < c.duration && Math.abs(ml.outPoint - L.out) > 1e-6) fail(`${L.name} outPoint ${ml.outPoint} ≠ ${L.out}`);
      if (L.tr) for (const [k, mn] of [['scale', 'ADBE Scale'], ['rotation', 'ADBE Rotate Z'], ['opacity', 'ADBE Opacity']]) {
        const P = L.tr[k]; if (P && P.t && P.t.length > 1) { const pk = ml._tg[mn].keys; if (pk.length !== P.t.length) fail(`${L.name} ${k} 关键帧 ${pk.length} ≠ ${P.t.length}`); if (P.hold && pk.some(x => x.interp !== KIT.HOLD)) fail(`${L.name} ${k} 应为定格插值`); if (!P.hold && pk.some(x => x.interp !== KIT.LINEAR)) fail(`${L.name} ${k} 应为线性插值`); }
      }
      if (L.tr && L.tr.position && L.tr.position.t && L.tr.position.t.length > 1) { if (!ml._posSep) fail(`${L.name} 位置未拆分维度`); if (ml._tg['ADBE Position_0'].keys.length !== L.tr.position.t.length) fail(`${L.name} X 关键帧数错误`); }
      if (L.markers && ml._marker.keys.length !== L.markers.length) fail(`${L.name} 标记数错误`);
      if (L.label && ml.label !== L.label) fail(`${L.name} 标签色错误`);
      if (L.blend === 'add' && ml.blendingMode !== 'ADD') fail(`${L.name} 混合模式错误`);
    });
  }
  if (st && exp) { if (st.layers !== exp.layers) fail(`图层总数 ${st.layers} ≠ 期望 ${exp.layers}`); if (st.keys !== exp.keys) fail(`关键帧总数 ${st.keys} ≠ 期望 ${exp.keys}`); }
  if (log.imports !== TL.assets.length) fail(`导入素材 ${log.imports} ≠ ${TL.assets.length}`);
  if (log.undo !== 0) fail('undo group 未闭合');
  const main = byName[TL.comps.find(c => c.id === TL.mainComp).name];
  if (!main._opened) fail('主合成未打开');
  if (TL.meta.saveAep && !log.saved) fail('未保存 .aep');
  const tiles = log.comps.flatMap(c => c.layerList).filter(l => /^(牌|tile) /.test(l.name));
  const ended = tiles.filter(l => l.outPoint < l.comp.duration - 1e-6).length;
  return { errs, stats: st, expected: exp, imports: log.imports, folders: log.folders, comps: log.comps.length, saved: log.saved && path.basename(log.saved), tileLayers: tiles.length, tilesEnded: ended, compMarkers: main.markerProperty.keys.length, alert: log.alerts[log.alerts.length - 1] };
}
if (process.argv[2]) {
  const zips = process.argv.slice(2), results = [];
  for (const z of zips) {
    const dir = '/tmp/aemock_' + path.basename(z, '.zip'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    execSync(`python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "${z}" "${dir}"`);
    const r = runMock(dir); results.push(r);
    console.log(path.basename(z), JSON.stringify({ ok: r.errs.length === 0, errs: r.errs.slice(0, 10), nErr: r.errs.length, layers: r.stats && r.stats.layers, keys: r.stats && r.stats.keys, markers: r.stats && r.stats.markers, expected: { layers: r.expected.layers, keys: r.expected.keys }, imports: r.imports, folders: r.folders, comps: r.comps, tileLayers: r.tileLayers, tilesEnded: r.tilesEnded, compMarkers: r.compMarkers, saved: r.saved }));
  }
  if (results.some(r => r.errs.length)) process.exit(1);
}
