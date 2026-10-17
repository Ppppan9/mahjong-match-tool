# 麻将消除 · 3D 动画导出（Blender / Cinema 4D / Unreal Engine 5）

本包由网页工具「导出 3D 动画 (glTF/FBX/Blender)」按钮生成，复用 AE 导出同一条记录（自动通关或手动游玩）。

## 包内文件

| 文件 | 说明 |
|---|---|
| `scene.glb` | glTF 2.0 二进制场景：全部网格、贴图（已内嵌）、正交相机、**一个动画剪辑** `mahjong_game` |
| `scene.fbx` | （若有）由 `blender_import.py --fbx` 生成，给 C4D / UE5 用；贴图内嵌，动画逐帧烘焙 |
| `blender_import.py` | Blender 4.x 导入脚本（见下） |
| `scene3d.json` | 帧率、帧范围、分辨率、相机、单位、节点列表、**不透明度曲线**、**音频事件时间** |
| `timeline.json` | 与 AE 导出相同的完整时间轴（所有图层的关键帧、音效时间） |
| `audio/sfx_*.wav` | 逐事件音效（每种一个文件，时间见 `scene3d.json → audio[]`） |
| `audio/mix.wav` | 整段混合音轨（从第 0 帧开始） |

## 单位与坐标

- **1 画布像素 = 1 毫米**（720×1280 画面 = 0.72 m × 1.28 m）。glTF 标准 **Y 轴向上**，单位米。
- 画面平铺在 XZ 地面：屏幕右 = +X，屏幕下 = +Z，画面中心在原点；正交相机 `camera_ortho_topdown` 位于 (0, 10 m, 0) 垂直向下看，
  xmag/ymag = 画面半宽/半高，与网页画面一一对应。
- 牌是真实 3D 网格：挤出的圆角牌身（有厚度，顶点色做出白→灰→绿色底座的侧面渐变）+ 牌面平面（牌面贴图）。
  网页的 2.5D“露出右/下侧面”效果已烘进牌身几何（牌身随深度向右下错开），所以纯俯视也能看到侧面；换别的机位时牌身是斜的，这是有意的。
- 高度（Y）只用于前后遮挡：背景在最下，牌按层叠高，2D 元素（顶栏、托盘、飞行牌、字母、树叶、特效、结束页、手指）按 AE 图层顺序逐层略高。

## 关键帧内容（按项目帧率逐帧采样）

| 节点 | 动画 |
|---|---|
| `tile_###_<牌>` | 显示/隐藏（缩放 1/0，STEP） |
| `tile_###_<牌>_press` | 点击按下：位移 + 缩放（线性） |
| `tile_###_<牌>_v_d##[_sel]` | 状态变体：压暗程度（d = 变暗百分比，量化 5%）/ 选中绿色渐变，按时间切换（STEP） |
| `q####_<名称>_vis` | 2D 元素的显示区间（STEP） |
| `q####_<名称>` | 位置、旋转（绕 Y 轴）、缩放（线性；树叶含 3D 翻滚的压扁缩放） |

包含：背景、顶栏/Logo、托盘格、开场字母、托盘字母、配对飞行牌、碰撞接缝光/闪光、点击波纹、树叶/花瓣粒子、手指、结束页各部件、单词集齐发光/星星。
手指、粒子是否导出取决于面板「导出 3D 动画」里的开关；结束页是否有手指按「结束页显示手指」设置（默认不显示）。

## 不透明度 / 显示的处理（重要）

glTF 核心标准不能给材质透明度做动画，所以：
1. **显示/隐藏**：每个元素外层节点用 STEP 插值的缩放（1 = 显示，0 = 隐藏）。所有软件（Blender/C4D/UE5）都能正确读到。
2. **淡入淡出**：在 glTF/FBX 里按阈值处理——小元素只要不透明度 ≥ 1% 就显示，大面积半透明层（开场压暗、结束页背景、发光）≥ 50% 才显示。
3. **精确淡入淡出曲线**存放在 `scene3d.json → opacity`（节点名 → [[秒, 0..1], …]）。`blender_import.py` 会把它烘到每个材质的 `Opacity` 值节点上，
   并把这些元素的显示区间改回完整入点..出点，所以 **Blender 里淡入淡出与网页一致**。C4D/UE5 如需精确淡入淡出，可按同一 JSON 给材质透明度做关键帧。

## Blender（推荐，4.x）

1. 解压整个包，打开 Blender → Scripting → 打开 `blender_import.py` → Run Script。
   它会：清空场景、导入 `scene.glb`、设置帧率/帧范围、把正交相机设为活动相机并设置分辨率（与网页一致）、
   材质改为“自发光 + 透明”（不受灯光影响，和网页的平面效果一致）、色彩管理设为 **Standard**（不要用 AgX/Filmic，否则偏色）、
   烘入不透明度曲线、把 `audio/` 的音效按时间加入视频序列编辑器（逐事件音效；`mix.wav` 也加入但默认静音）。
2. 命令行（无界面）：
   `blender --background --python blender_import.py -- --fbx --save --render 0,90,300 --engine CYCLES`
   - `--fbx` 导出 `scene.fbx`；`--save` 保存 `scene.blend`；`--render` 渲染指定帧（也可写秒数如 `3.5s`）；`--out 目录`。
3. 渲染：Eevee 或 Cycles 都可以（自发光材质，Cycles 用 16–32 采样即可）。

## Cinema 4D（2023+）

- 方式 A：文件 → 合并/打开 `scene.glb`（C4D 2023 起原生支持 glTF 导入）。
- 方式 B：打开 `scene.fbx`（先用 Blender 脚本 `--fbx` 生成，样例包里已附带）。
- 相机：使用导入的 `camera_ortho_topdown`（平行/正交投影）；渲染尺寸设为 `scene3d.json` 的 width × height，帧率按 fps。
- 材质：贴图已带入；想要和网页一样的平面效果，把材质的“发光”通道接同一张贴图并关闭“颜色/反射”，或使用 Redshift 的 Emission。
  牌身侧面颜色来自顶点色（FBX 里叫 Color），需要时在材质里用“顶点颜色”着色器。
- 音频：把 `audio/mix.wav` 拖到时间线（从 0 帧开始），或按 `scene3d.json → audio[]` 的秒数逐个放置音效。

## Unreal Engine 5

1. 导入场景与动画（二选一）：
   - **glTF（UE 5.3+ 推荐）**：启用 Interchange / glTF Importer 插件，`File → Import Into Level…` 选 `scene.glb`。节点动画会被导入为一个 **Level Sequence**（每个 Actor 一条 Transform 轨道）。
   - **FBX**：`File → Import Into Level…` 选 `scene.fbx` 先把全部 Actor（保留层级和名字）放进关卡；然后新建 Level Sequence，把这些 Actor 加进去，
     在 Sequencer 里右键 → **Import…** 选同一个 `scene.fbx`，按名字匹配写入变换关键帧。导入选项里勾选 **Import Animations**，
     **Convert Scene**（Y-up → Z-up）保持开启，**Force Front X Axis** 关闭；单位已在 FBX 里按米导出（UE 内自动为厘米）。
   - 动画都是对象变换动画（非骨骼），可见性是缩放 0/1 的阶梯关键帧。
2. 材质建议改为 **Unlit**：Shading Model = Unlit，Emissive Color = 贴图 RGB × 顶点色（牌身），Opacity / Opacity Mask = 贴图 Alpha；
   Blend Mode：牌面用 Masked，其他 2D 元素用 Translucent。这样颜色与网页一致（不受灯光/曝光影响，后处理里关掉自动曝光、色调映射可设为 Standard 近似）。
3. 相机：使用导入的 `camera_ortho_topdown`，Projection Mode = Orthographic，Ortho Width = `scene3d.json → camera.xmag × 2`（米 × 100 = 厘米）。
4. 音频：把 `audio/mix.wav` 导入为 Sound Wave，在 Level Sequence 里加 Audio 轨道从 0 帧开始；或按 `audio[]` 时间逐个放置音效。

## 限制

- **粒子**是“烘焙的小平面”（每片树叶/花瓣一个带贴图的四边形 + 逐帧关键帧），不是各软件原生的粒子系统。
- 选中绿色、压暗等材质变化用“状态变体网格”切换实现（压暗量化为 5% 一档），不是材质动画。
- 淡入淡出只有在 Blender 脚本里是精确的（见上）；FBX/glTF 中按阈值显示/隐藏。
- 接缝光的“相加”混合模式在 glTF 里没有对应，使用普通透明混合。
- 音频不在 glb/fbx 里，是单独的 WAV，时间见 `scene3d.json` / `timeline.json`。
- 网页在 sRGB 空间混合半透明，3D 软件多在线性空间混合，半透明边缘会有细微差别（Blender 脚本已对开场压暗层做 sRGB 等效换算）。
