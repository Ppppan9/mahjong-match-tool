#!/bin/bash
# v20：用 Blender 无头验证 3D 导出：导入 scene.glb → 统计/关键帧范围 → Cycles 渲染对比帧 → 导出 scene.fbx 并放回样例 zip
# 先跑 node test/export3d.mjs（生成 samples/export3d_sample.zip 与 /tmp/export3d/web_*.png）
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BL=${BLENDER:-/workspace/blender/blender-4.2.3-linux-x64/blender}
D=${E3D_OUT:-/tmp/export3d}
ZIP=$ROOT/samples/export3d_sample.zip
rm -rf $D/zip $D/bl && mkdir -p $D/zip $D/bl
python3 -c "import zipfile; zipfile.ZipFile('$ZIP').extractall('$D/zip')"
T=$(python3 -c "import json;print(','.join('%.4fs'%s['t'] for s in json.load(open('$D/snaps.json'))))")
cd $D/zip
"$BL" --background --factory-startup --python blender_import.py -- --engine CYCLES --samples ${SAMPLES:-24} --fbx --render $T --out $D/bl 2>&1 | grep -E "EXPORT3D_REPORT|Traceback|Error" | tee $D/blender_report.txt
python3 $ROOT/test/export3d_compare.py $D $ROOT/screenshots/export3d_blender_compare.jpg | tee -a $D/blender_report.txt
# scene.fbx 放回样例 zip
python3 - <<PY
import zipfile, shutil
z = zipfile.ZipFile('$ZIP', 'a', zipfile.ZIP_STORED)
if 'scene.fbx' not in z.namelist(): z.write('$D/bl/scene.fbx', 'scene.fbx')
z.close()
shutil.copy('$ZIP', '/workspace/mahjong_3d_sample.zip')
PY
python3 - <<PY
import json, re, sys
r = open('$D/blender_report.txt').read()
m = re.search(r'EXPORT3D_REPORT (\{.*\})', r); rep = json.loads(m.group(1)); meta = json.load(open('$D/zip/scene3d.json'))
ps = json.loads(re.search(r'PSNR (\[.*\])', r).group(1))
ok = rep['cameras'] == 1 and rep['camera'] == meta['camera']['name'] and rep['tiles'] == meta['stats']['tiles'] and rep['frame_range'] == [0, meta['frameEnd']] \
  and abs(rep['action_range'][1] - meta['frameEnd']) < 0.01 and rep['opacity_curves'] == len(meta['opacity']) and rep['sound_strips'] == len(meta['audio']) + 1 \
  and rep['fbx_size'] > 0 and all(p['psnr'] > 20 for p in ps)
print('BLENDER', 'PASS' if ok else 'FAIL', json.dumps({k: rep[k] for k in ['objects','meshes','empties','actions','fcurves','keyframes','frame_range','action_range','tiles','opacity_curves','vis_overrides','sound_strips','fbx_size']}), 'tiles(meta)', meta['stats']['tiles'])
sys.exit(0 if ok else 1)
PY
