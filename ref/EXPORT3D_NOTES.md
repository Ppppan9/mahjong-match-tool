# v20 3D 动画导出 — 进度笔记（给接手的人）

## 结构
- `src/export3d/export3d.js`：`export3D({S, rec, aeResult, api})`。先用 AE 记录器 `AE.exportZip(S2, rec)`（S2 强制 canvas 尺寸、bake、en 名称、audio both、leaves layers）拿 timeline + 素材 PNG + WAV（recorder 返回值新增 `fileList`），
  然后：牌 = 真实 3D 网格（main.js `tile3D()` 给挤出牌身几何+阴影参数，`tileShear()` 给 2.5D 侧面露出的屏幕偏移，几何按深度剪切烘进顶点），
  其他 AE 图层（非 board_ 预合成，展开 precomp）= 带贴图四边形。GLTFExporter (three 0.160, 打包进 index.html) 输出 glb。
- `src/export3d/blender_import.py`（作为 text 打包，.py loader 加在 build.mjs）、`src/export3d/README_3D.md`。
- main.js：`export3DZip(rec)`，按钮 action `export3d`（id `btn_export3d`），`__app.export3DZip`。
- settings v20：export3dFps / export3dParticles / export3dHand（只补默认）。测试里 19→20 断言已改。
- 坐标：1 px = 1 mm，Y 向上，画面在 XZ 平面（屏幕右 +X，屏幕下 +Z），相机在 (0,10,0) 朝下。高度只用于遮挡顺序。
- 显示/隐藏：`*_vis` / `tile_###_key` 节点 STEP scale 1/0；牌状态变体 `_v_d##[_sel]`（压暗量化 0.05 × 选中）STEP；按下 `_press` LINEAR。
  连续不透明度 → scene3d.json `opacity`，Blender 脚本烘到材质 Opacity 值节点。大面积（>25% 画面）元素 opacity<50% 隐藏，小元素 <1% 隐藏。
- three GLTFExporter bug：ortho xmag = right*2 → 相机用 ±W/4。

## 测试
- `node test/export3d.mjs`（~2.5 min）→ samples/export3d_sample.zip + /workspace/mahjong_3d_sample.zip，网页校验帧 /tmp/export3d/web_*.png + snaps.json。
- Blender 4.2.3 解压在 /workspace/blender/blender-4.2.3-linux-x64/blender（官方 tarball，box 上无 xz，用 python tarfile 解压）。

## 进度
- [x] M1 导出 + 按钮 + 设置 + 测试通过（相机 xmag 修复后需重跑）
- [x] M2 Blender 无头验证（test/export3d-blender.sh：导入、统计、Cycles 渲染 4 帧、PSNR 26–31 dB、scene.fbx 放回样例 zip；FBX 前临时改 Principled 材质让贴图进 FBX）
- [x] M3 README_3D.md 正文；theme-test、no-auto-rec、test:ae 通过；还原 ae_export_check.jpg；保留 export3d_blender_compare.jpg
- [x] M4 zip / squash 提交 'v20: 新增 3D 动画导出（glTF/FBX/Blender，支持 UE5/C4D）' / push / Pages / deploy
