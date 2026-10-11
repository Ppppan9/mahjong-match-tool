# 由 replica.mjs 调用：拼整盘对比与单牌 3 倍放大对比
import sys, json
from PIL import Image, ImageDraw, ImageFont
tmp, out = sys.argv[1], sys.argv[2]
d = json.load(open(f'{tmp}/rects.json'))
ref, ours = Image.open(f'{tmp}/ref.png').convert('RGB'), Image.open(f'{tmp}/ours.png').convert('RGB')
font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 22)
# 整盘
W, H = ref.size
o = Image.new('RGB', (W * 2 + 10, H + 40), (34, 34, 34)); o.paste(ref, (0, 40)); o.paste(ours, (W + 10, 40))
dr = ImageDraw.Draw(o); dr.text((10, 6), '参考 t=0.2s', fill='white', font=font); dr.text((W + 20, 6), '本工具（同排布复刻）', fill='yellow', font=font)
o.resize((o.width // 2, o.height // 2), Image.LANCZOS).save(f'{out}/compare_replica.jpg', quality=88)
# 单牌：每种牌面取第一次出现的位置；裁剪包含侧面/阴影
groups = {
  'letters': ['TR:0', 'TX:4', 'TA:3', 'TE:1', 'TL:2', 'LT'],
  'chars': ['wS', 'wE', 'wN', 'gR', 'gG', 'c5', 'c8', 'c4', 'c2', 'c3'],
  'pics': ['p1', 'p2', 'p3', 'p4', 'p5', 'f1', 'f2', 'f3'],
  'dots_bamboo': ['d3', 'd4', 'd8', 'b2', 'b3', 'b4'],
}
first = {}
for r in d['rects']:
  first.setdefault(r['key'], r)
S = 3
for name, keys in groups.items():
  cells = []
  for k in keys:
    if k not in first: continue
    r = first[k]; x0, y0 = int(r['x'] - r['w'] * 0.62), int(r['y'] - r['h'] * 0.6); x1, y1 = int(r['x'] + r['w'] * 0.7), int(r['y'] + r['h'] * 0.68)
    a = ref.crop((x0, y0, x1, y1)); b = ours.crop((x0, y0, x1, y1))
    a = a.resize((a.width * S // 2, a.height * S // 2), Image.LANCZOS); b = b.resize((b.width * S // 2, b.height * S // 2), Image.LANCZOS)
    cells.append((a, b))
  cw, ch = cells[0][0].size
  img = Image.new('RGB', (cw * len(cells) + 6 * len(cells), ch * 2 + 60), (34, 34, 34))
  dr = ImageDraw.Draw(img); dr.text((6, 2), '上：参考', fill='white', font=font); dr.text((6, ch + 30), '下：本工具', fill='yellow', font=font)
  for i, (a, b) in enumerate(cells):
    img.paste(a, (i * (cw + 6), 28)); img.paste(b, (i * (cw + 6), ch + 56))
  img.save(f'{out}/compare_detail_{name}.jpg', quality=90)
print('ok', list(first.keys())[:5])
