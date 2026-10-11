# 导出 After Effects 工程：可行性调研（2026-10）

## 结论
**不直接写 .aep，而是导出“素材 + 时间轴 JSON + ExtendScript 构建脚本”的工程包**，用户在 AE 里 `文件 > 脚本 > 运行脚本文件…` 运行 `build_ae_project.jsx`，脚本在 AE 内部用官方脚本 API 新建项目、文件夹、合成、图层和关键帧，最后由 AE 自己另存为 `.aep`。这是唯一既不依赖第三方插件、又能保证 AE 2018+ 都能正确打开的方式。

## 调研要点

| 方案 | 结论 | 依据 |
|------|------|------|
| 直接生成二进制 `.aep` | **不可行/不可靠**。`.aep` 是大端 RIFF（RIFX，文件头 `RIFX…Egg!`），Adobe 没有公开格式。社区只有逆向工程：boltframe/aftereffects-aep-parser（只读解析）、inlife/aftereffects-project-research、Lottie 文档的 AEP 章节；py_aep（forticheprod）能解析、修改并新建“空项目”，但官方文档也写明不支持的字段会丢失、效果只能复用已有工程中的效果等，图层/关键帧的完整写入无法保证跨版本正确。 | github.com/boltframe/aftereffects-aep-parser；github.com/forticheprod/py-aep；github.com/inlife/aftereffects-project-research |
| `.aepx`（XML 工程） | **不适合生成**。AE 手册说明 .aepx 只是 .aep 的 XML 副本，大量图层/属性/关键帧仍是十六进制编码的二进制块，只适合改名称、素材路径、标记等少量字段，且 Adobe 建议仅作中间格式。 | Adobe After Effects 用户手册 “XML project files” 一节 |
| **ExtendScript (.jsx)** | **选用**。官方脚本 API 完整支持：`app.project.items.addComp / addFolder`、`importFile(new ImportOptions(File))`、`comp.layers.add / addSolid`、`Property.setValueAtTime / setValuesAtTimes`、`setInterpolationTypeAtKey`、`setSpatialTangentsAtKey`、`Layer.inPoint/outPoint/startTime/label/blendingMode`、`MarkerValue`、`app.project.save(File)`。AE CC 2018 起都可用（ExtendScript 为 ES3，需自带 JSON 解析）。 | ae-scripting.docsforadobe.dev（Property / CompItem / LayerCollection 等） |
| Lottie JSON + Bodymovin/LottieFiles 导入 | 可作为补充，但需用户另装扩展；导入的是 Lottie 能表达的子集，图片序列/音频/标记/层标签都不能保证，且仍是由插件在 AE 内用脚本重建。 | aescripts.com/bodymovin；docs.lottiefiles.com（Import from file） |
| 第三方生成器（compCode、nexrender 等） | compCode 能把已有合成转成 jsx（方向相反）；nexrender 是基于模板 + 脚本的渲染自动化，同样依赖 AE 内脚本。没有能离线“凭空”生成完整 .aep 的成熟开源工具。 | aescripts.com/compcode；github.com/inlife/nexrender |

## 采用的工程包结构
```
mahjong_ae_export_YYYYMMDD_HHMMSS.zip
├─ build_ae_project.jsx   ExtendScript 构建脚本（ES3 语法，自带 JSON 解析，路径相对脚本自身）
├─ timeline.json          时间轴：合成、图层、入/出点、关键帧、标记
├─ README_AE.md           中文使用步骤
├─ assets/                PNG：每种牌面（含 3D 侧面/底座）、选中变绿版、阴影、暗化剪影、左侧接触阴影、
│                         飞行牌、树叶、波纹、接缝光、背景、顶栏、Logo、托盘格、免责声明、结束页各部件、手指
└─ audio/                 WAV：混合音轨 mix.wav + 每种音效单独一份（sfx_*.wav）
```

## 层级（z-order）处理
AE 图层的上下顺序不能随时间关键帧变化，所以：棋盘每层一个预合成（阴影 → 牌/选中/压暗 → 接触阴影），牌被配对的那一帧在棋盘里出点结束，同一帧在主合成棋盘之上出现对应的“飞行牌”图层（按网页绘制的 z 值排序），飞完碰撞后出点结束。这样“飞起来总在最上面”无需任何层级关键帧。

## 校验结果（2026-10-11，AE 未在测试机上运行，脚本没有在真实 AE 中执行过）
- 语法：acorn `ecmaVersion: 3` 解析通过。
- 模拟 AE 对象模型（删除 JSON/forEach/indexOf/trim 等 ES5+ 内置后执行）：完整自动通关包 1201 图层 / 13130 关键帧 / 253 标记 / 30 个合成 / 152 个素材，与 timeline.json 期望完全一致；短手动包 596 图层 / 2300 关键帧；变体（逐帧烘焙、1080×1920、英文、不分组、树叶直接放主合成）567 图层 / 5146 关键帧；每层的顺序、入出点、插值类型、位置拆分维度、标记、标签色、混合模式全部核对通过。
- 重新合成对比（只用 timeline.json + PNG）：157 帧平均 PSNR 37.6 dB，平均绝对误差 0.94/255，>40 色阶的像素平均 0.16%；最差帧是结束页淡入的 450ms 内（网页里图标内部各部件分别乘透明度，AE 里是整张图层乘透明度），PSNR 28.8 dB。
- 发现并修复的问题：three.js 的压暗在线性色彩空间相乘，黑色叠加层的不透明度需换算为 1−sRGB(1−dark)；离屏画布未挂到页面时通用字体回退与主画布不同（中文 lang 下 sans-serif 解析不同），导出素材时把画布挂到隐藏容器里。
