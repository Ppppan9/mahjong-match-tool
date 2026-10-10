// 默认手指（SVG 绘制：白皙手掌 + 红色指甲，食指朝上）
export const DEFAULT_HAND_ANCHOR = { x: 0.49, y: 0.03 };
export const DEFAULT_HAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 330" width="400" height="660">
<defs>
<linearGradient id="s" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#eebfa6"/><stop offset=".45" stop-color="#fde7da"/><stop offset="1" stop-color="#e7b49a"/></linearGradient>
<linearGradient id="p" x1="0" x2="1" y1="0" y2=".3"><stop offset="0" stop-color="#f1c6ae"/><stop offset=".5" stop-color="#fbe0d2"/><stop offset="1" stop-color="#e2a98d"/></linearGradient>
<linearGradient id="n" x1="0" x2="1"><stop offset="0" stop-color="#b30f24"/><stop offset=".45" stop-color="#ec2a42"/><stop offset="1" stop-color="#a50c1f"/></linearGradient>
</defs>
<path d="M52 178 C44 230 50 285 56 330 L176 330 C180 285 186 230 178 182 Z" fill="url(#p)"/>
<path d="M118 150 C134 142 150 146 158 156 C176 152 190 162 188 182 C190 205 176 222 150 222 L100 222 C80 222 64 212 60 196 Z" fill="url(#p)" stroke="#d99d82" stroke-width="2"/>
<path d="M124 162 C140 158 154 162 158 176 M130 196 C146 194 160 196 170 190 M158 156 C164 168 166 180 164 192" fill="none" stroke="#d39478" stroke-width="2" stroke-linecap="round"/>
<path d="M74 176 L72 42 C72 20 85 9 98 9 C111 9 124 20 124 42 L126 178 C126 196 74 196 74 176 Z" fill="url(#s)" stroke="#d99d82" stroke-width="2"/>
<path d="M80 120 C90 124 106 124 118 120 M80 88 C92 91 104 91 117 88" fill="none" stroke="#dca088" stroke-width="2" stroke-linecap="round"/>
<path d="M81 40 C81 23 89 16 98 16 C107 16 115 23 115 40 L115 56 C106 60 90 60 81 56 Z" fill="url(#n)"/>
<path d="M88 26 C90 21 95 19 99 19" stroke="#ffd1d8" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
<path d="M60 186 C36 172 22 192 34 210 C48 230 84 236 104 218 C112 210 104 196 92 196 Z" fill="url(#s)" stroke="#d99d82" stroke-width="2"/>
<path d="M34 204 C30 196 34 188 42 188 C50 190 52 200 46 206 Z" fill="#c9132a"/>
</svg>`;
