/*  build_ae_project.jsx — 麻将消除 · After Effects 工程构建脚本
 *  用法：After Effects > 文件 > 脚本 > 运行脚本文件… 选择本文件（与 timeline.json、assets/、audio/ 放在同一文件夹）。
 *  语法：ExtendScript（ES3），不依赖 JSON 内置对象；适用于 AE CC 2018 及以上。
 *  由“麻将消除小游戏网页工具”自动生成，请勿手改 timeline.json 的结构。
 */
(function () {
    var SCRIPT_NAME = "麻将消除 AE 工程构建";

    // ---------- 小工具 ----------
    function isArray(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
    function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }

    // ---------- JSON 解析（ES3，递归下降，不使用 eval） ----------
    function parseJSON(text) {
        var at = 0, ch = " ";
        var escapee = { "\"": "\"", "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        function error(m) { throw new Error("timeline.json 解析失败：" + m + " @" + at); }
        function next(c) {
            if (c && c !== ch) { error("应为 '" + c + "' 实为 '" + ch + "'"); }
            ch = text.charAt(at); at += 1; return ch;
        }
        function white() { while (ch && ch <= " ") { next(); } }
        function number() {
            var s = "";
            if (ch === "-") { s = "-"; next("-"); }
            while (ch >= "0" && ch <= "9") { s += ch; next(); }
            if (ch === ".") { s += "."; while (next() && ch >= "0" && ch <= "9") { s += ch; } }
            if (ch === "e" || ch === "E") {
                s += ch; next();
                if (ch === "-" || ch === "+") { s += ch; next(); }
                while (ch >= "0" && ch <= "9") { s += ch; next(); }
            }
            var n = +s; if (isNaN(n)) { error("数字格式错误"); } return n;
        }
        function string() {
            var s = "", i, u, hex;
            if (ch === "\"") {
                while (next()) {
                    if (ch === "\"") { next(); return s; }
                    if (ch === "\\") {
                        next();
                        if (ch === "u") {
                            u = 0;
                            for (i = 0; i < 4; i += 1) { hex = parseInt(next(), 16); if (!isFinite(hex)) { break; } u = u * 16 + hex; }
                            s += String.fromCharCode(u);
                        } else if (typeof escapee[ch] === "string") { s += escapee[ch]; } else { break; }
                    } else { s += ch; }
                }
            }
            error("字符串格式错误");
        }
        function word() {
            if (ch === "t") { next("t"); next("r"); next("u"); next("e"); return true; }
            if (ch === "f") { next("f"); next("a"); next("l"); next("s"); next("e"); return false; }
            if (ch === "n") { next("n"); next("u"); next("l"); next("l"); return null; }
            error("非法字符 '" + ch + "'");
        }
        var value;
        function array() {
            var a = [];
            next("["); white();
            if (ch === "]") { next("]"); return a; }
            while (ch) { a.push(value()); white(); if (ch === "]") { next("]"); return a; } next(","); white(); }
            error("数组格式错误");
        }
        function object() {
            var o = {}, k;
            next("{"); white();
            if (ch === "}") { next("}"); return o; }
            while (ch) {
                k = string(); white(); next(":"); o[k] = value(); white();
                if (ch === "}") { next("}"); return o; }
                next(","); white();
            }
            error("对象格式错误");
        }
        value = function () {
            white();
            switch (ch) {
                case "{": return object();
                case "[": return array();
                case "\"": return string();
                case "-": return number();
                default: return (ch >= "0" && ch <= "9") ? number() : word();
            }
        };
        var result = value(); white(); if (ch) { error("多余内容"); }
        return result;
    }

    function readText(f) {
        f.encoding = "UTF-8";
        if (!f.open("r")) { throw new Error("无法读取 " + f.fsName); }
        var s = f.read(); f.close();
        if (s.charCodeAt(0) === 0xFEFF) { s = s.substring(1); }
        return s;
    }

    // ---------- 读取时间轴 ----------
    var scriptFile = new File($.fileName);
    var baseDir = scriptFile.parent;
    var tlFile = new File(baseDir.fsName + "/timeline.json");
    if (!tlFile.exists) { alert("找不到 timeline.json，请把本脚本与 timeline.json、assets、audio 文件夹放在同一目录后再运行。", SCRIPT_NAME); return; }
    var TL;
    try { TL = parseJSON(readText(tlFile)); } catch (e) { alert(e.toString(), SCRIPT_NAME); return; }

    var META = TL.meta || {};
    var LINEAR = KeyframeInterpolationType.LINEAR, HOLD = KeyframeInterpolationType.HOLD;
    var missing = [], warnings = [];
    var stats = { layers: 0, keys: 0, markers: 0 };

    if (META.newProject !== false) { app.newProject(); }
    var proj = app.project;
    app.beginUndoGroup(SCRIPT_NAME);

    // ---------- 文件夹 ----------
    var folders = {};
    var i, j;
    for (i = 0; i < TL.folders.length; i += 1) {
        var fd = TL.folders[i];
        var fo = proj.items.addFolder(fd.name);
        if (fd.parent && folders[fd.parent]) { fo.parentFolder = folders[fd.parent]; }
        folders[fd.id] = fo;
    }

    // ---------- 导入素材 ----------
    var items = {};
    for (i = 0; i < TL.assets.length; i += 1) {
        var a = TL.assets[i];
        var af = new File(baseDir.fsName + "/" + a.file);
        if (!af.exists) { missing.push(a.file); continue; }
        try {
            var io = new ImportOptions(af);
            if (io.canImportAs(ImportAsType.FOOTAGE)) { io.importAs = ImportAsType.FOOTAGE; }
            var it = proj.importFile(io);
            if (a.folder && folders[a.folder]) { it.parentFolder = folders[a.folder]; }
            if (a.name) { it.name = a.name; }
            items[a.id] = it;
        } catch (eImp) { warnings.push("导入失败 " + a.file + "：" + eImp.toString()); }
    }

    // ---------- 合成（预合成在前，主合成在后） ----------
    var comps = {};
    for (i = 0; i < TL.comps.length; i += 1) {
        var cd = TL.comps[i];
        var comp = proj.items.addComp(cd.name, cd.w, cd.h, 1, cd.duration, cd.fps);
        if (cd.bg) { comp.bgColor = cd.bg; }
        if (cd.folder && folders[cd.folder]) { comp.parentFolder = folders[cd.folder]; }
        comps[cd.id] = comp;
    }

    function tr(layer, mn) { return layer.property("ADBE Transform Group").property(mn); }

    function setKeys(prop, P) {
        if (P === null || P === undefined) { return; }
        if (typeof P !== "object" || isArray(P)) { prop.setValue(P); return; }
        if (!P.t || P.t.length === 0) { return; }
        if (P.t.length === 1) { prop.setValue(P.v[0]); return; }
        prop.setValuesAtTimes(P.t, P.v);
        var n = prop.numKeys, type = P.hold ? HOLD : LINEAR, k;
        for (k = 1; k <= n; k += 1) { prop.setInterpolationTypeAtKey(k, type, type); }
        stats.keys += P.t.length;
    }

    // 位置：有关键帧时拆分 X/Y 维度，避免 AE 默认的“自动贝塞尔空间插值”让路径走样
    function setPosition(layer, P) {
        var pos = tr(layer, "ADBE Position");
        if (P && typeof P === "object" && !isArray(P) && P.t && P.t.length > 1) {
            pos.dimensionsSeparated = true;
            var xs = [], ys = [], k;
            for (k = 0; k < P.v.length; k += 1) { xs.push(P.v[k][0]); ys.push(P.v[k][1]); }
            setKeys(tr(layer, "ADBE Position_0"), { t: P.t, v: xs, hold: P.hold });
            setKeys(tr(layer, "ADBE Position_1"), { t: P.t, v: ys, hold: P.hold });
            stats.keys -= P.t.length;
        } else { setKeys(pos, P); }
    }

    function addLayer(comp, L) {
        var layer = null, src = L.src;
        if (src.asset) {
            if (!items[src.asset]) { warnings.push("缺少素材，跳过图层：" + L.name); return null; }
            layer = comp.layers.add(items[src.asset]);
        } else if (src.comp) {
            layer = comp.layers.add(comps[src.comp]);
        } else if (src.solid) {
            layer = comp.layers.addSolid(src.solid, L.name, src.w || comp.width, src.h || comp.height, 1, comp.duration);
        }
        if (!layer) { return null; }
        layer.name = L.name;
        if (L.start) { layer.startTime = L.start; }
        if (L["in"] !== undefined && L["in"] > 0) { layer.inPoint = Math.max(L["in"], layer.startTime); }
        if (L.out !== undefined && L.out < layer.outPoint) { layer.outPoint = L.out; }
        if (L.label) { layer.label = L.label; }
        if (L.blend === "add") { layer.blendingMode = BlendingMode.ADD; }
        if (L.audioDb !== undefined) {
            try { layer.property("ADBE Audio Group").property("ADBE Audio Levels").setValue([L.audioDb, L.audioDb]); } catch (eAu) {}
        }
        if (L.tr) {
            if (L.tr.anchor) { tr(layer, "ADBE Anchor Point").setValue(L.tr.anchor); }
            if (L.tr.position !== undefined) { setPosition(layer, L.tr.position); }
            if (L.tr.scale !== undefined) { setKeys(tr(layer, "ADBE Scale"), L.tr.scale); }
            if (L.tr.rotation !== undefined) { setKeys(tr(layer, "ADBE Rotate Z"), L.tr.rotation); }
            if (L.tr.opacity !== undefined) { setKeys(tr(layer, "ADBE Opacity"), L.tr.opacity); }
        }
        if (L.markers) {
            var mk = layer.property("ADBE Marker"), m;
            for (m = 0; m < L.markers.length; m += 1) { mk.setValueAtTime(L.markers[m][0], new MarkerValue(L.markers[m][1])); stats.markers += 1; }
        }
        if (L.comment) { layer.comment = L.comment; }
        stats.layers += 1;
        return layer;
    }

    for (i = 0; i < TL.comps.length; i += 1) {
        var cdef = TL.comps[i], c = comps[cdef.id];
        // timeline.json 中图层按“从下到上”排列；AE 新加的图层总在最上面，所以顺序添加即可得到正确叠放
        for (j = 0; j < cdef.layers.length; j += 1) {
            try { addLayer(c, cdef.layers[j]); } catch (eL) { warnings.push("图层 " + cdef.layers[j].name + "：" + eL.toString()); }
        }
        if (cdef.markers && c.markerProperty) {
            for (j = 0; j < cdef.markers.length; j += 1) {
                try { c.markerProperty.setValueAtTime(cdef.markers[j][0], new MarkerValue(cdef.markers[j][1])); stats.markers += 1; } catch (eM) {}
            }
        }
    }

    var main = comps[TL.mainComp];
    app.endUndoGroup();
    if (main) { try { main.openInViewer(); } catch (eV) {} }

    // ---------- 保存 .aep ----------
    var savedTo = "";
    if (META.saveAep) {
        var outFile = new File(baseDir.fsName + "/" + (META.aepName || "mahjong_export.aep"));
        if (confirm("工程已生成。是否另存为：\n" + outFile.fsName + " ？", false, SCRIPT_NAME)) {
            try { proj.save(outFile); savedTo = outFile.fsName; } catch (eS) { warnings.push("保存失败：" + eS.toString()); }
        }
    }

    var msg = "完成！\n图层：" + stats.layers + "　关键帧：" + stats.keys + "　标记：" + stats.markers;
    if (savedTo) { msg += "\n已保存：" + savedTo; }
    if (missing.length) { msg += "\n缺少素材 " + missing.length + " 个（例如 " + missing[0] + "）"; }
    if (warnings.length) { msg += "\n警告 " + warnings.length + " 条：\n" + warnings.slice(0, 8).join("\n"); }
    alert(msg, SCRIPT_NAME);
    $.global.__MJ_BUILD_STATS = stats; // 便于自动化测试读取
}());
