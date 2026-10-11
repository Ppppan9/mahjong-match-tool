// 主题注册表。一个主题 = 默认设置覆盖（defaults）+ 可选的绘制钩子（背景/顶栏/托盘/Logo/牌面/粒子/结束页…）
// 国风 = 原有外观（全部沿用 settings.js 的 DEFAULTS 与 main.js 内置绘制）
import { THEME as MIDEAST } from './mideast.js';
export const THEMES = {
  guofeng: { id: 'guofeng', name: '国风', defaults: {}, fonts: {} },
  mideast: MIDEAST,
};
// 跟随主题保存的设置键（切换主题时各自独立保存用户的改动）
export const THEME_KEYS = [...new Set([...Object.keys(MIDEAST.defaults), 'bgImage', 'logoImage', 'endIcon', 'logoScale', 'disclaimerSize', 'particleSize', 'particleSpeed'])];
export function themeDefaults(DEFAULTS, id) {
  const base = {}; for (const k of THEME_KEYS) base[k] = DEFAULTS[k];
  return { ...base, ...((THEMES[id] || THEMES.guofeng).defaults) };
}
