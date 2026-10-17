# 网页校验帧 vs Blender 渲染：PSNR + 对比图（左=网页，右=Blender）
import json, sys, math, os
import numpy as np
from PIL import Image, ImageDraw
D = sys.argv[1] if len(sys.argv) > 1 else '/tmp/export3d'
OUTJ = sys.argv[2] if len(sys.argv) > 2 else os.path.join(D, 'compare.jpg')
snaps = json.load(open(os.path.join(D, 'snaps.json')))
tiles, res = [], []
for i, s in enumerate(snaps):
    a = Image.open(os.path.join(D, 'web_%d.png' % i)).convert('RGB')
    b = Image.open(os.path.join(D, 'bl', 'render_%s.png' % ('%.4fs' % s['t']).replace('.', '_'))).convert('RGB')
    A, B = np.asarray(a, np.float64), np.asarray(b, np.float64)
    mse = ((A - B) ** 2).mean(); p = 10 * math.log10(255 ** 2 / max(mse, 1e-9))
    res.append({'t': round(s['t'], 4), 'psnr': round(p, 2)})
    w, h = a.size; c = Image.new('RGB', (w * 2 + 8, h + 40), (30, 30, 30)); c.paste(a, (0, 40)); c.paste(b, (w + 8, 40))
    ImageDraw.Draw(c).text((10, 12), 'web  t=%.2fs' % s['t'], fill=(255, 255, 255)); ImageDraw.Draw(c).text((w + 18, 12), 'Blender (Cycles)  PSNR %.1f dB' % p, fill=(255, 255, 255))
    tiles.append(c)
W = tiles[0].width; H = tiles[0].height
sheet = Image.new('RGB', (W * 2 + 16, H * ((len(tiles) + 1) // 2) + 8 * ((len(tiles) + 1) // 2)), (0, 0, 0))
for i, c in enumerate(tiles): sheet.paste(c, ((i % 2) * (W + 16), (i // 2) * (H + 8)))
sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
sheet.save(OUTJ, quality=85)
print('PSNR', json.dumps(res))
