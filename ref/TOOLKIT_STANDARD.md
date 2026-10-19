# 核玩工具通用规范（TOOLKIT STANDARD）

> **硬性要求（2026-10-18 用户确认）**：之后制作的每一个核玩工具都必须统一规格，**默认内置**「导出 AE 工程」和「导出 3D 动画（glTF / FBX / Blender，支持 UE5 / C4D）」，每个元素都是带关键帧的独立图层/节点，导出包结构、图层命名、设置键名与麻将工具一致；适用时还要支持导入任意透明通道图片生成关卡。

> **默认手指（2026-10-18 用户规定）**：所有核玩工具默认手指统一使用麻将工具的手图 `/workspace/mahjong-tool/src/default_hand.js`（含其旋转/翻转/大小/指尖锚点默认值），不再自绘手指；用户仍可上传 PNG 覆盖。

> **手指与鼠标（2026-10-19 用户反馈「手指和鼠标同时出现了」）**：只要手指图显示在游戏画面上（自动通关时手指可见、手动游玩手指跟随指针、拖动中——包括指针捕获期间），游戏画布 `cursor:none`，只看到手指；设置面板/按钮上保持正常鼠标；没有手指（未上传/关闭显示手指/手动跟随关闭/结束页隐藏手指）时画布保持 `cursor:pointer`。手动跟随时指尖锚点（handAnchorX/Y）严格落在指针位置（0 偏移，pointermove 当帧更新），鼠标隐藏时手指立即显示（不淡入）。由 `hideCursor`（默认 true）控制，每帧按状态更新。系统鼠标本来就不会被录制/AE/3D 采集，手指图层导出不变。测试：`npm run test:cursor`（test/cursor-test.mjs，三个工具同一份）。

> **H5 试玩广告（2026-10-19）**：每个核玩工具默认内置「导出 H5 试玩广告」面板（在「导出 3D」之后、「结束页」之前）。一键导出自包含试玩 ZIP（含用户勾选的全部渠道子目录），试玩包**不得**带完整编辑器 UI，仅游戏画面 + CTA；须多尺寸自适应（contain/letterbox），详见 §5。

以麻将消除工具（/workspace/mahjong-tool，v20）为基准整理；打螺丝工具 v1.3.1 起遵守。以后的新工具请按本文件实现**通用部分**，工具专有参数放在对应分组末尾或单独分组。

## 1. 单文件与设置
- `npm run build` → 单文件 `index.html`（离线可用）；设置保存在 localStorage，带 `version`，`migrate()` 只做：补默认值、把**仍等于旧默认值**的项换成新默认、旧键 → 新键（含单位换算）。不得覆盖用户改过的值。
- 顶部按钮（顺序/文字一致）：`▶ 自动通关`（运行中 `■ 停止`）、`⏺ 开始录制`（`■ 停止录制`）、`↻ 重新开始`、`🎲 换一局`、[工具专有按钮]、`📷 截图`、`导出设置`、`导入设置`、`恢复默认`。
- 导出设置 JSON：`{ app: '<tool-id>', version, settings }`。

## 2. 通用参数（键名 / 中文标签 / 分组 / 顺序）
面板分组顺序：…工具专有分组… → `音效` → `手指 / 自动通关` → `录制` → `导出 AE 工程` → `导出 3D 动画（UE5 / C4D / Blender）` → **`导出 H5 试玩广告`** → `结束页(End Card)`。

| 分组 | 键 | 标签 | 类型/范围 | 麻将默认 | 打螺丝默认 |
|---|---|---|---|---|---|
| 音效 | sfxMute | 静音 | bool | false | false |
| 音效 | sfxVolume | 总音量 | 0~1.5 | 0.7 | 0.8 |
| 手指 / 自动通关 | autoSpeed | 整体速度倍率 | 0.25~6 | 1 | 1 |
| | moveMin / moveMax | 移动耗时最小/最大(ms) | 50~2000 / 50~3000 | 380/700 | 220/300 |
| | delayMin / delayMax | 点击间隔最小/最大(ms) | 0~2000 / 0~4000 | 120/420 | 150/350 |
| | thinkChance / thinkMax | “思考停顿”概率 / 思考停顿最长(ms) | 0~0.6 / 0~4000 | 0.12/900 | 0/900 |
| | jitter | 落点随机抖动(px) | 0~40 | 10 | 4 |
| | handSize | 手指大小(画面宽比例) | 0.1~0.9 | 0.42 | 0.42 |
| | handAnchorX / handAnchorY | 指尖锚点 X(0~1) / 指尖锚点 Y(0~1) | 0~1 | 工具图而定 | 0.05/0.05 |
| | handImage | 上传手指图片(透明PNG，不上传则不显示手指) | file(dataURL) | 内置手 | 空 |
| | pressDepth | 按压幅度（按下时手指缩小比例） | 0~0.3 | 0.08 | 0.07 |
| | pressEnabled | 点击按下效果 | bool | true | true（手指按压） |
| | tapRipple | 点击处显示波纹圈（参考视频没有） | bool | false | false |
| | hideCursor | 手指出现时隐藏鼠标 | bool | true | true |
| 录制 | recFps / recFormat / recBitrate | 帧率 / 格式(自动(优先 MP4)/MP4/WebM) / 码率(Mbps) | | 30/auto/8 | 30/auto/8 |
| | autoRec | 自动通关开始时自动录制（默认关） | bool | false | false |
| | autoStop | 自动通关通关后停止录制并下载（仅在正在录制时） | bool | true | true |
| | tailSec | 通关后继续录制(秒) | 0~10 | 2.5 | 1.2 |
| 导出 AE 工程 | _aeToggle | 按钮 `● 开始记录` / `■ 停止并导出（N.Ns）` | button | | |
| | _aeExport | 按钮 `⬇ 导出 ZIP`（重新导出上一次记录） | button | | |
| | aeWithRec | 录制视频时同步记录，停止录制后自动导出 | bool | true | true |
| | aeFps | AE 合成帧率 | 24/25/30/60 | 30 | 30 |
| | aeSize | AE 合成尺寸 | canvas/720x1280/1080x1920 | canvas | canvas |
| | aeSampling | 关键帧方式 | reduce/bake | reduce | reduce |
| | aeNames | 图层命名 | zh/en | zh | zh |
| | aeAudio | 音频 | both/mixed/events/none | both | both |
| | aeSaveAep | 脚本跑完后提示另存为 .aep | bool | true | true |
| 导出 3D | _export3d | 按钮 `导出 3D 动画 (glTF/FBX/Blender)` | button | | |
| | export3dFps | 3D 动画帧率 | 24/25/30/60 | 30 | 30 |
| | export3dHand | 包含手指（贴图平面；结束页是否显示仍按“结束页显示手指”） | bool | true | true |
| 导出 H5 试玩广告 | _exportH5 | 按钮 `⬇ 导出 H5 试玩 ZIP` | button | | |
| | h5Format | 渠道（多选 CSV 或 select） | `tiktok`\|`google`\|`mintegral`\|`generic`；默认 `tiktok,google,mintegral,generic`（全部）或至少 tiktok+generic | all | all |
| | h5Orientation | 试玩方向 | 0 双端 / 1 竖屏 / 2 横屏 | 1 | 1 |
| | h5Device | 预览机型 | select：adaptive / iphone-se / … / custom | adaptive | adaptive |
| | h5DeviceW | 预览宽度(px) | 240~1440 | 390 | 390 |
| | h5DeviceH | 预览高度(px) | 400~2560 | 844 | 844 |
| | h5CtaText | CTA 按钮文案 | text | 立即下载 | 立即下载 |
| | h5StoreUrl | 应用商店 / 落地页 URL | text | placeholder | placeholder |
| | h5GameName | 游戏名（可选，显示在 CTA 旁） | text | 工具中文名 | 工具中文名 |
| | h5Icon | 应用图标（可选 dataURL） | file | 空 | 空 |
| | h5MaxMb | 单渠道 / 总包体积告警阈值(MB) | number | 5 | 5 |
| | h5AutoPlay | 试玩打开后自动通关演示 | bool | true | true |
| 结束页(End Card) | endCard | 显示结束页 | bool | true | false（参考视频无结束页） |
| | endCardHand | 结束页显示手指（自动通关点按钮） | bool | false | false |
| | endDelay | 通关后出现延迟(ms) | 0~5000 | 900 | 600 |
| | endTitle | 标题 | text | | |

工具专有（示例）：麻将 aeLeaves/aeGroupLayers/export3dParticles/handRotation/handFlip/manualHand/handAvoid*；打螺丝 export3dScrew、autoSelectGap、autoStartDelay、handShow、handRest、ratchet*/fallSfx/bgm。

## 3. AE 导出 ZIP
```
build_ae_project.jsx   timeline.json   README_AE.md
assets/<英文id>.png    （AE 中显示名随 aeNames）
audio/mix.wav          audio/sfx_<事件>.wav
```
- 文件名：`<tool>_ae_export_YYYYMMDD_HHMMSS.zip`；.aep 名 `meta.aepName = <tool>_<stamp>.aep`。
- `timeline.json` = `{ meta, folders, assets, comps, mainComp: 'main' }`
  - `meta`: `tool, format:1, created, fps, width, height, duration, canvas:[w,h], scale(K), sampling('reduce'|'bake'), saveAep, aepName, newProject:true, stats{comps,layers,keys,perComp}, note` + 工具专有字段（如 screwBlock）。
  - `folders`: `[{id:'root'},{id:'img',parent:'root'},…,{id:'aud'},{id:'pre'}]`，名称中/英随 aeNames（`<工具>_AE工程` / `<Tool>_AE`、素材/Assets、界面/UI、音频/Audio、预合成/Precomps）。
  - `assets`: `{id,file,folder,w,h,name}`；`comps`: `{id,name,w,h,duration,fps,folder,layers[,bg,markers]}`。
  - 图层：`{name, src:{asset|comp|solid}, in, out, start, label, blend, markers:[[t,text]], audioDb, tr:{anchor,position,scale,rotation,opacity}}`；动画属性 `{t:[…], v:[…], hold?}`，常量直接给值。图层**从下到上**排列；时间秒；位置/锚点像素（合成坐标）；缩放百分比。
- 主合成名 `主合成_<工具中文名>` / `Main_<Tool>`；预合成放 `pre` 文件夹；音频：`混合音轨`/`Mixed audio` 图层 + `音效_逐事件`/`SFX events` 预合成（每事件一层，start=in=事件时刻），两者默认都开启（aeAudio=both），主合成每个音效事件一个标记。
- 手指图层名 `手指`/`Hand`，结束页 `结束页`/`End card`，免责声明 `免责声明`/`Disclaimer`，背景 `背景`/`Background`。
- jsx 行为：检查 timeline.json 与素材存在（缺失给出中文提示并中止）、新建工程、按 folders 建文件夹、导入素材、按 comps 建合成与图层、设置关键帧/标记、弹出统计、按 meta.saveAep 询问另存 .aep（无写权限时提示首选项设置）；测试钩子 `$.global.__<TOOL>_BUILD_STATS`。

## 4. 3D 导出 ZIP
```
scene.glb  scene.fbx  scene3d.json  blender_import.py  README_3D.md  timeline.json
audio/mix.wav  audio/sfx_*.wav
```
- 复用 AE 记录：以 `aeFps=export3dFps, aeSize=canvas, aeSampling=bake, aeNames=en, aeAudio=both` 重新导出时间轴后生成。
- `scene3d.json`: `tool, format('export3d/1'), fps, frames, frameStart, frameEnd, duration, width, height, units, camera, nodes, visibility, opacity, audio, mix, stats` + 工具专有字段。
- 结束页是否显示手指遵守 endCardHand。

## 5. H5 试玩广告 ZIP
共享实现：`/workspace/game-toolkit-standard/h5-playable/`（各工具 `src/h5/` 拷贝同一份）。

### 5.1 包结构（推荐：一个 ZIP 含全部勾选渠道子目录）
```
<tool>_h5_playable_YYYYMMDD_HHMMSS.zip
  README_H5.md
  tiktok/index.html
  tiktok/config.json          {"playable_orientation":1}
  google/index.html
  mintegral/index.html
  generic/index.html
  generic/README.txt
```
- 仅包含用户在 `h5Format` 中勾选的渠道；默认四个全开。
- 每个渠道的 `index.html` 为**自包含**单文件试玩：内嵌当前设置（`window.__PLAYABLE__`），**不显示**设置面板 / 顶部工具栏，仅游戏画布 + CTA 条 + 可选教程手指。
- **多尺寸自适应（responsive playable）**：不得只按固定 720×1280 CSS 盒子导出。舞台在手机（SE→14 Pro Max、Pixel、Galaxy…）、平板（iPad Mini/Air/Pro、Surface）、折叠屏（Z Fold 外屏、Duo）等视口上须可玩。缩放策略默认 **contain / letterbox**：保持设计画幅比例（`canvasW×canvasH` 或 9:16），居中等比缩放，letterbox 条与背景色一致；全视口 `100vw`/`100dvh` + `safe-area-inset-*`；CTA 底部 sticky 并预留 safe-area。
- 目标：单渠道与总 ZIP 尽量 < `h5MaxMb`（默认 5MB）。超限时 UI 警告；可尝试 minify、去掉 AE 录制器逻辑（playable 构建不跑 AE）、压缩贴图。three.js 体量大时文档说明已知限制。

### 5.2 渠道 CTA
| 渠道 | CTA 行为 |
|---|---|
| TikTok / Pangle | `window.openAppStore()`（若存在），否则 `location.href = storeUrl`；可带 playable-sdk 文档化 script 注释 |
| Google Ads Playable | `ExitApi.exit()`（附 ExitApi stub / 注释，按 Google HTML5 试玩规范）；相对路径；portrait meta |
| Mintegral | `window.install()` → 否则 `window.gameEnd()` → 否则 `location.href = storeUrl` |
| Generic offline | 点击打开 `h5StoreUrl`（`window.open` / `location.href`），无跳转环；附 `README.txt` |

### 5.3 试玩壳（playable shell）
- 注入 `window.__PLAYABLE__ = { toolId, format, settings, ctaText, storeUrl, gameName, icon, orientation, autoPlay }`。
- 主程序检测 `__PLAYABLE__`：应用 settings、隐藏 `#panel`、舞台全屏、挂 CTA、可选自动通关。
- **禁止**在试玩包中暴露完整编辑器（导入/导出设置、AE/3D 按钮、参数面板）。
- meta viewport：`width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`。
- `h5Orientation` / `config.json` `playable_orientation`：`1` 竖屏，`2` 横屏，`0` 双端。双端时横屏设备仍用 contain 放下竖屏内容（可玩、不裁切），勿写死仅竖屏视口。
- `h5Device` / `h5DeviceW` / `h5DeviceH`：**预览与导出共用**。`adaptive` → 设计画幅 = `canvasW×canvasH`，全机型 contain/letterbox；指定机型或 `custom` → 设计画幅锁定为 W×H，导出烘焙 `canvasW/H`（及麻将 `recRes`）、`designW/H`、`ad.size`、README「本包目标尺寸」。编辑器非 adaptive 时显示设备预览框。
- `resize` / `orientationchange` / `visualViewport`：调用 `window.__h5FitStage()` 重算舞台 CSS；`window.__h5StageLayout` 暴露 `{designW,designH,cssW,cssH,scale,…}`。2D 画布靠 CSS 缩放（点击已用 `getBoundingClientRect`）；three.js 工具可在 `applyPlayableMode({ onResize })` 里 `setSize` + 更新 camera aspect。
- 测试：`npm run test:h5` 须覆盖 ZIP 结构 **以及** Playwright 视口冒烟（如 375×667、390×844、430×932、768×1024、1032×1376、344×882、1024×600）：`#stage` 可见、CTA 未被裁切、舞台等比缩放无横向溢出。

### 5.4 共享 API
```js
buildPlayableZip({ toolId, formats, baseHtml, opts })
makePlayableHtml(baseHtml, { format, ...opts })
parseFormats(h5Format)  // → ['tiktok',…]
H5_DEVICE_PRESETS / resolveH5Device(S) / bakeH5DeviceIntoSettings(S)
applyEditorDevicePreview(S) / bindEditorDevicePreview(getS)
```

## 6. 测试
`npm run test:logic`、`npm test`（自动通关+截图）、`npm run test:ae`（导出 + jsx mock + 合成 PSNR）、`npm run test:3d`（Blender 导入 + 渲染对比）、`npm run test:h5`（ZIP 含 index.html + tiktok/config.json；Playwright 多视口冒烟：stage 可见、CTA 不裁切、contain 缩放）。
