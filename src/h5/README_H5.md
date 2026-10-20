# H5 试玩广告包（核玩工具导出）

本 ZIP 含一个或多个广告渠道子目录。每个子目录是**自包含** HTML5 试玩：打开 `index.html` 即可离线游玩（无编辑器面板），底部 CTA 跳转应用商店 / 落地页。

## 机型 / 尺寸与自适应

面板「预览机型」同时作用于**编辑器预览**与**导出 ZIP**：

- **自适应（`h5Device=adaptive`，导出推荐）**：设计画幅沿用 `canvasW×canvasH`（或缺省 720×1280）；壳层 **contain / letterbox**，全机型可玩。
- **指定机型或自定义宽高**：设计画幅 / 舞台逻辑尺寸锁定为 `h5DeviceW×h5DeviceH`（如 iPhone SE 375×667）；导出 HTML 的 `designW/H`、`ad.size`、烘焙设置中的 `canvasW/H`（及麻将 `recRes`）均按该分辨率定稿。壳层仍可用 contain 适配略有差异的视口。

- 视口：`width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`
- 全屏：`100vw` / `100dvh` + `safe-area-inset-*`
- CTA：底部 sticky，预留 `safe-area-inset-bottom`
- `h5Orientation`：`1` 竖屏优先，`2` 横屏创意，`0` 双端
- 运行时：`window.__h5FitStage()` / `window.__h5StageLayout`；`resize` / `orientationchange` / `visualViewport` 时重算

## 目录

| 文件夹 | 渠道 | CTA / 运行时 | 单文件上限 |
|--------|------|-----|-----|
| `applovin/` | AppLovin | MRAID 2.0：head 引入 MRAID 脚本标签，等 `ready`；`mraid.open(商店URL)` | 5MB |
| `facebook/` | Meta (Facebook) Playable | 单 `index.html`，资源全内联、无外部请求；`FbPlayableAd.onCTAClick()` | **2MB**（超出会告警） |
| `google/` | Google Ads Playable | `ExitApi.exit()`（含 stub）；相对路径；竖屏 meta | 5MB / ≤512 文件 |
| `mintegral/` | Mintegral | `window.install()` → `window.gameEnd()` → 商店 URL | 5MB |
| `moloco/` | Moloco | 单 HTML，**不得**引入 MRAID 脚本、不得用 XHR / 外部请求；`FbPlayableAd.onCTAClick()`（Moloco 官方要求） | <5MB |
| `tiktok/` | TikTok / Pangle 试玩 | `window.openAppStore()`，否则打开商店 URL；含 `config.json`（`playable_orientation`） | 5MB |
| `unity/` | Unity Ads | MRAID 由 webview 注入（无需 script 标签）；`ready` + `viewableChange` 可见后才开始自动演示；`mraid.open(商店URL)` | <5MB |
| `generic/` | 通用离线包 | 点击打开商店 URL；附 `README.txt` | — |

> MRAID 渠道（AppLovin / Unity）：`window.__h5WhenViewable(cb)` 在 ready 且可见后才启动自动演示；`viewableChange` 以 `h5-playable-viewable` 事件转发。

## 限制

- 目标体积 ≤ 5MB（超限请压缩贴图 / 关闭多余资源）。Google：≤512 文件。
- 试玩包**不含**设置面板、AE/3D 导出等编辑器功能；设置已烘焙进页面。
- three.js 工具体积较大时可能接近上限，属已知限制。

## 本地预览

用本地静态服务器打开对应渠道的 `index.html`（部分渠道 SDK 在 `file://` 下行为不同）。用 Chrome DevTools Device Toolbar 切换 SE / 14 Pro Max / iPad / Z Fold 等验证 letterbox 与 CTA；若导出时选了指定机型，优先用该分辨率核对。
