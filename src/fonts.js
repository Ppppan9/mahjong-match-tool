// 内置字体（离线、不依赖系统字体）：
//  MJ CJK  = Noto Sans CJK SC Bold 子集（仅牌面用到的 一…九 東南西北中發白），SIL OFL 1.1
//  MJ Latin = Roboto（wght 800 静态实例）ASCII 子集，Apache License 2.0
//  MJ Logo  = Lilita One（原版完整字体，未修改），SIL OFL 1.1
import cjk from './fonts/cjk.woff';
import latin from './fonts/latin.woff';
import logo from './fonts/logo.ttf';
import arabic from './fonts/arabic.woff';
export const FONT_CJK = '"MJ CJK","Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
export const FONT_LAT = '"MJ Latin","Arial Black",Arial,sans-serif';
export const FONT_LOGO = '"MJ Logo","Arial Black",Arial,sans-serif';
//  MJ Arabic = El Messiri（wght 700 静态实例）阿拉伯文 + 拉丁子集，保留全部 OpenType 排版特性（连写/字形变体），SIL OFL 1.1
export const FONT_AR = '"MJ Arabic","Noto Naskh Arabic","Geeza Pro",Tahoma,sans-serif';
export function loadFonts() {
  if (typeof FontFace === 'undefined') return Promise.resolve();
  const list = [['MJ CJK', cjk], ['MJ Latin', latin], ['MJ Logo', logo], ['MJ Arabic', arabic]].map(([n, u]) => {
    const f = new FontFace(n, `url(${u})`); document.fonts.add(f); return f.load().catch(e => console.warn('font', n, e));
  });
  return Promise.all(list);
}
