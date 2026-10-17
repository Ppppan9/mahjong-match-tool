# -*- coding: utf-8 -*-
"""麻将消除 3D 动画导入脚本（Blender 4.x）

用法（任选其一）：
  1) Blender → Scripting → 打开本文件 → Run Script（本文件需与 scene.glb 同目录）
  2) 命令行：blender --background --python blender_import.py -- [--fbx] [--save] [--render 0,30,60] [--out DIR] [--engine CYCLES|EEVEE] [--verify]

做的事：导入 scene.glb → 帧率/帧范围 → 正交俯视相机设为活动相机、分辨率与网页一致 →
材质改为“自发光 + 透明”（与网页的平面无光照效果一致）→ scene3d.json 里的淡入淡出曲线烘到材质 Alpha →
audio/*.wav 按时间加到视频序列编辑器（逐事件音效 + 静音的混合音轨）→ 可选导出 scene.fbx（给 C4D / UE5）。
"""
import bpy, json, os, sys, math, struct, re

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() and __file__ else os.getcwd()
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith("--") else True
    return default
DIR = arg("--dir", HERE)
OUT = arg("--out", DIR)
DO_FBX = bool(arg("--fbx", False))
DO_SAVE = bool(arg("--save", False))
ENGINE = arg("--engine", "EEVEE")
RENDER = arg("--render", None)
VERIFY = bool(arg("--verify", False))

meta = json.load(open(os.path.join(DIR, "scene3d.json"), encoding="utf-8"))
glb_path = os.path.join(DIR, "scene.glb")

def read_gltf_json(path):
    with open(path, "rb") as f:
        data = f.read()
    n = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + n].decode("utf-8"))
G = read_gltf_json(glb_path)
GMAT = {m.get("name"): m for m in G.get("materials", [])}

scene = bpy.context.scene
# 清空默认场景
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
fps = int(meta["fps"])
scene.render.fps = fps          # 导入前设置：glTF 导入器按场景帧率把秒换算成帧
scene.render.fps_base = 1.0
bpy.ops.import_scene.gltf(filepath=glb_path)

# 关键帧范围 → 帧偏移（导入器一般从第 0 帧开始）
def action_range():
    lo, hi = 1e9, -1e9
    for a in bpy.data.actions:
        r = a.frame_range
        lo, hi = min(lo, r[0]), max(hi, r[1])
    return lo, hi
lo, hi = action_range()
OFF = int(round(lo)) if lo < 1e8 else 0
scene.frame_start = OFF
scene.frame_end = OFF + int(meta["frameEnd"])
scene.frame_set(OFF)

# 相机
cam = bpy.data.objects.get(meta["camera"]["name"])
if cam is None:
    cam = next((o for o in bpy.data.objects if o.type == "CAMERA"), None)
if cam:
    scene.camera = cam
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = meta["camera"]["orthoScale"]
    cam.data.sensor_fit = "AUTO"
    cam.data.clip_start, cam.data.clip_end = 0.01, 50
scene.render.resolution_x = int(meta["width"])
scene.render.resolution_y = int(meta["height"])
scene.render.resolution_percentage = 100

# 色彩：Standard（不要 AgX/Filmic，否则颜色会和网页不同）
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
if scene.world is None:
    scene.world = bpy.data.worlds.new("World")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0, 0, 0, 1)
    bg.inputs[1].default_value = 0

# 材质：自发光 + 透明（平面无光照，与网页一致）
def first_image(mat):
    if not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            return n.image
    return None
INFO = {}
def info(mat):
    if mat.name not in INFO:
        g = GMAT.get(mat.name, {})
        INFO[mat.name] = (g.get("pbrMetallicRoughness", {}).get("baseColorFactor", [1, 1, 1, 1]), g.get("alphaMode", "OPAQUE"), g.get("alphaCutoff", 0.5), first_image(mat))
    return INFO[mat.name]
def principled(mat):
    """FBX 用：Principled BSDF（底色=贴图×颜色，自发光=同一贴图，Alpha=贴图 Alpha×不透明度），FBX 导出器只认这种结构"""
    fac, mode, cutoff, img = info(mat)
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear(); N, L = nt.nodes, nt.links
    out = N.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
    b = N.new("ShaderNodeBsdfPrincipled"); b.location = (250, 0)
    b.inputs["Base Color"].default_value = (fac[0], fac[1], fac[2], 1)
    b.inputs["Alpha"].default_value = fac[3]
    b.inputs["Roughness"].default_value = 1.0
    b.inputs["Emission Strength"].default_value = 1.0
    b.inputs["Emission Color"].default_value = (fac[0], fac[1], fac[2], 1)
    if img:
        tex = N.new("ShaderNodeTexImage"); tex.image = img; tex.location = (-200, 0)
        L.new(tex.outputs[0], b.inputs["Base Color"]); L.new(tex.outputs[0], b.inputs["Emission Color"])
        if mode != "OPAQUE":
            L.new(tex.outputs[1], b.inputs["Alpha"])
    L.new(b.outputs[0], out.inputs[0])
def rebuild(mat):
    fac, mode, cutoff, img = info(mat)
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear(); N, L = nt.nodes, nt.links
    out = N.new("ShaderNodeOutputMaterial"); out.location = (900, 0)
    em = N.new("ShaderNodeEmission"); em.location = (500, 100)
    tr = N.new("ShaderNodeBsdfTransparent"); tr.location = (500, -100)
    mix = N.new("ShaderNodeMixShader"); mix.location = (700, 0)
    col = N.new("ShaderNodeRGB"); col.location = (-200, 200); col.outputs[0].default_value = (fac[0], fac[1], fac[2], 1)
    col.label = "baseColorFactor"
    mul = N.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.location = (100, 150)
    mul.inputs[0].default_value = 1.0
    L.new(col.outputs[0], mul.inputs[6])
    alpha_val = N.new("ShaderNodeValue"); alpha_val.name = alpha_val.label = "Opacity"; alpha_val.location = (-200, -250)
    alpha_val.outputs[0].default_value = fac[3]
    alpha = alpha_val.outputs[0]
    if img:
        tex = N.new("ShaderNodeTexImage"); tex.image = img; tex.location = (-450, 50); tex.interpolation = "Linear"
        tex.extension = "CLIP"
        L.new(tex.outputs[0], mul.inputs[7])
        am = N.new("ShaderNodeMath"); am.operation = "MULTIPLY"; am.location = (100, -200)
        L.new(tex.outputs[1], am.inputs[0]); L.new(alpha_val.outputs[0], am.inputs[1]); alpha = am.outputs[0]
    else:
        mul.inputs[7].default_value = (1, 1, 1, 1)
    c = mul.outputs[2]
    if mat.name.startswith("mat_body"):  # 牌身用顶点色（白→灰→绿 渐变）
        vc = N.new("ShaderNodeVertexColor"); vc.location = (100, 400)
        m2 = N.new("ShaderNodeMix"); m2.data_type = "RGBA"; m2.blend_type = "MULTIPLY"; m2.location = (300, 250); m2.inputs[0].default_value = 1
        L.new(c, m2.inputs[6]); L.new(vc.outputs[0], m2.inputs[7]); c = m2.outputs[2]
    L.new(c, em.inputs[0]); em.inputs[1].default_value = 1.0
    if mode == "MASK":
        st = N.new("ShaderNodeMath"); st.operation = "GREATER_THAN"; st.inputs[1].default_value = cutoff - 1e-4; st.location = (300, -250)
        L.new(alpha, st.inputs[0]); alpha = st.outputs[0]
    if mode == "OPAQUE":
        L.new(em.outputs[0], out.inputs[0])
    else:
        L.new(alpha, mix.inputs[0]); L.new(tr.outputs[0], mix.inputs[1]); L.new(em.outputs[0], mix.inputs[2]); L.new(mix.outputs[0], out.inputs[0])
    try:
        mat.surface_render_method = "BLENDED" if mode == "BLEND" else "DITHERED"
    except Exception:
        mat.blend_method = "BLEND" if mode == "BLEND" else ("CLIP" if mode == "MASK" else "OPAQUE")
    return alpha_val

# 淡入淡出：scene3d.json 的 opacity 曲线 → 材质 Opacity 值关键帧
# 音频：逐事件音效 + 混合音轨（静音，需要时可改为取消静音并静音逐事件轨）
seq = scene.sequence_editor_create()
n_snd = 0
if meta.get("mix"):
    p = os.path.join(DIR, meta["mix"]["file"])
    if os.path.exists(p):
        s = seq.sequences.new_sound("mix", p, 1, OFF); s.mute = True; n_snd += 1
for i, e in enumerate(meta.get("audio", [])):
    p = os.path.join(DIR, e["file"])
    if not os.path.exists(p):
        continue
    s = seq.sequences.new_sound("sfx_%03d" % (i + 1), p, 2 + (i % 6), OFF + int(round(e["t"] * fps)))
    s.volume = 10 ** (e.get("db", 0) / 20.0)
    n_snd += 1
try:
    scene.render.ffmpeg.audio_codec = "AAC"
except Exception:
    pass

# 渲染设置
if ENGINE.upper().startswith("CYCLES"):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = int(arg("--samples", 16))
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 0
    scene.cycles.transparent_max_bounces = 64
else:
    for e in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = e; break
        except Exception:
            pass
scene.render.film_transparent = False

report = {"objects": len(bpy.data.objects), "meshes": sum(1 for o in bpy.data.objects if o.type == "MESH"),
          "empties": sum(1 for o in bpy.data.objects if o.type == "EMPTY"), "cameras": sum(1 for o in bpy.data.objects if o.type == "CAMERA"),
          "actions": len(bpy.data.actions), "fcurves": sum(len(a.fcurves) for a in bpy.data.actions),
          "keyframes": sum(len(fc.keyframe_points) for a in bpy.data.actions for fc in a.fcurves),
          "frame_range": [scene.frame_start, scene.frame_end], "action_range": [lo, hi], "offset": OFF, "fps": fps,
          "sound_strips": n_snd,
          "tiles": sum(1 for o in bpy.data.objects if re.match(r"^tile_\d{3}_", o.name) and not re.search(r"_(press|body|face|shadow|contact|v_d\d+(_sel)?)(\.\d+)?$", o.name)),
          "camera": scene.camera.name if scene.camera else None, "resolution": [scene.render.resolution_x, scene.render.resolution_y]}

os.makedirs(OUT, exist_ok=True)
MATS = [m for m in bpy.data.materials if m.users]
for m in MATS:
    info(m)
if DO_FBX:
    for m in MATS:
        principled(m)
    fbx = os.path.join(OUT, "scene.fbx")
    bpy.ops.export_scene.fbx(filepath=fbx, use_selection=False, object_types={"MESH", "CAMERA", "EMPTY"},
                             bake_anim=True, bake_anim_use_all_bones=False, bake_anim_use_nla_strips=False, bake_anim_use_all_actions=False,
                             bake_anim_force_startend_keying=True, bake_anim_step=1.0, bake_anim_simplify_factor=1.0,
                             path_mode="COPY", embed_textures=True, axis_forward="-Z", axis_up="Y", apply_unit_scale=True, add_leaf_bones=False, colors_type="SRGB")
    report["fbx"] = fbx
    report["fbx_size"] = os.path.getsize(fbx)
# Blender 内渲染用：自发光 + 透明材质（FBX 已导出，不受影响）
opacity_node = {}
for m in MATS:
    opacity_node[m.name] = rebuild(m)
report["materials"] = len(opacity_node)
# 网页在 sRGB 空间混合，Blender 在线性空间混合：纯黑压暗层（开场压暗）按 sRGB 等效换算，使变暗程度一致
def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
KIND = {n["name"]: n.get("kind") for n in meta.get("nodes", [])}
n_op = 0
for name, keys in meta.get("opacity", {}).items():
    if KIND.get(name) == "solid":
        keys = [[t, 1 - srgb_to_lin(1 - a)] for t, a in keys]
    o = bpy.data.objects.get(name)
    if not o or not o.active_material:
        continue
    v = opacity_node.get(o.active_material.name)
    if not v:
        continue
    for t, a in keys:
        v.outputs[0].default_value = a
        v.outputs[0].keyframe_insert("default_value", frame=OFF + t * fps)
    n_op += 1

report["opacity_curves"] = n_op
# glTF/FBX 里淡入淡出元素按阈值显示/隐藏；在 Blender 里已有精确的材质 Opacity 曲线，
# 所以把这些元素外层 *_vis 的显示区间改为完整的入点..出点（FBX 已在上面导出，不受影响）
NODE = {n["name"]: n for n in meta.get("nodes", [])}
n_vis = 0
for name in meta.get("opacity", {}):
    o = bpy.data.objects.get(name); n = NODE.get(name)
    if not o or not n or not o.parent:
        continue
    p = o.parent
    ad = p.animation_data
    if ad and ad.action:
        for fc in [fc for fc in ad.action.fcurves if fc.data_path == "scale"]:
            ad.action.fcurves.remove(fc)
    for fr, v in ((OFF, 1.0 if n["in"] <= 0 else 0.0), (OFF + n["in"] * fps, 1.0), (OFF + n["out"] * fps, 0.0)):
        p.scale = (v, v, v)
        p.keyframe_insert("scale", frame=fr)
    for fc in p.animation_data.action.fcurves:
        if fc.data_path == "scale":
            for kp in fc.keyframe_points:
                kp.interpolation = "CONSTANT"
    n_vis += 1
report["vis_overrides"] = n_vis
if RENDER:
    os.makedirs(OUT, exist_ok=True)
    report["renders"] = []
    for tok in str(RENDER).split(","):
        tsec = float(tok[:-1]) if tok.endswith("s") else None
        fr = OFF + tsec * fps if tsec is not None else OFF + float(tok)
        fi = int(math.floor(fr)); sub = fr - fi
        scene.frame_set(fi, subframe=sub)
        scene.render.filepath = os.path.join(OUT, "render_%s.png" % tok.replace(".", "_"))
        bpy.ops.render.render(write_still=True)
        report["renders"].append(scene.render.filepath)
if DO_SAVE:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "scene.blend"))
print("EXPORT3D_REPORT " + json.dumps(report))
