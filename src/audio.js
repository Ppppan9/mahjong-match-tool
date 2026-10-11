// 音效：全部用 WebAudio 实时合成（无外部文件/请求）。主输出同时接到扬声器和一个 MediaStreamDestination，
// 录制时把这条音轨混进 MediaRecorder 的流里。
let AC = null, master = null, recDest = null, getS = () => ({});
export function initAudio(getSettings) {
  getS = getSettings;
  const unlock = () => { ensure(); if (AC && AC.state !== 'running') AC.resume().catch(() => {}); };
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));
}
function ensure() {
  if (AC) return AC;
  const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null;
  AC = new Ctx();
  master = AC.createGain(); master.gain.value = 1;
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
  master.connect(comp); comp.connect(AC.destination);
  recDest = AC.createMediaStreamDestination(); comp.connect(recDest);
  return AC;
}
export function resumeAudio() { ensure(); return AC && AC.state !== 'running' ? AC.resume().catch(() => {}) : Promise.resolve(); }
export function audioTrack() { ensure(); return recDest ? recDest.stream.getAudioTracks()[0] : null; }
export function audioState() { return AC ? AC.state : 'none'; }
let noiseBuf = null;
function noise() {
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
}
function env(g, t, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }
function tone(out, type, f0, f1, t, a, d, peak) {
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  env(g, t, a, peak, d); o.connect(g); g.connect(out); o.start(t); o.stop(t + a + d + 0.05);
}
function burstNoise(out, t, dur, peak, type, f, q = 1, f1) {
  const n = noise(), bp = AC.createBiquadFilter(), g = AC.createGain(); bp.type = type; bp.frequency.setValueAtTime(f, t); if (f1) bp.frequency.exponentialRampToValueAtTime(f1, t + dur); bp.Q.value = q;
  env(g, t, Math.min(0.004, dur * 0.2), peak, dur); n.connect(bp); bp.connect(g); g.connect(out); n.start(t); n.stop(t + dur + 0.05);
}
const SYNTH = {
  // 选中：清脆的“哒”（短噪声 + 下滑的木质音）
  Tap(out, t) { burstNoise(out, t, 0.035, 0.5, 'bandpass', 3200, 2); tone(out, 'triangle', 1500, 700, t, 0.002, 0.06, 0.35); },
  // 飞行：带通噪声扫频，先升后降
  Whoosh(out, t, dur = 0.9) {
    const n = noise(), bp = AC.createBiquadFilter(), g = AC.createGain(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(1800, t + dur * 0.55); bp.frequency.exponentialRampToValueAtTime(700, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp); bp.connect(g); g.connect(out); n.start(t); n.stop(t + dur + 0.05);
  },
  // 碰撞：两张麻将牌相撞的“咔嗒”——高频硬击 + 两个衰减很快的谐振音 + 低频闷响
  Clack(out, t) {
    burstNoise(out, t, 0.05, 0.9, 'highpass', 2500, 0.7);
    tone(out, 'triangle', 2100, 1900, t, 0.001, 0.09, 0.45); tone(out, 'sine', 3300, 3100, t, 0.001, 0.06, 0.25);
    tone(out, 'sine', 190, 120, t, 0.002, 0.12, 0.5);
    burstNoise(out, t + 0.03, 0.04, 0.35, 'bandpass', 4000, 3);
  },
  // 树叶爆开：沙沙声 + 几个随机高音闪烁
  Burst(out, t) {
    burstNoise(out, t, 0.45, 0.22, 'bandpass', 5000, 0.8, 2500);
    for (let i = 0; i < 6; i++) { const f = 1800 + Math.random() * 2600; tone(out, 'sine', f, f * 1.02, t + 0.03 + i * 0.05 + Math.random() * 0.03, 0.003, 0.18, 0.12); }
  },
  // 字母入槽：“啵”一声 + 明亮的铃音
  Letter(out, t) { tone(out, 'sine', 300, 900, t, 0.004, 0.08, 0.5); tone(out, 'triangle', 1318.5, 1318.5, t + 0.05, 0.004, 0.35, 0.3); tone(out, 'sine', 1975.5, 1975.5, t + 0.05, 0.004, 0.3, 0.15); },
  // RELAX 集齐：上行琶音
  Word(out, t) { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { tone(out, 'triangle', f, f, t + i * 0.09, 0.005, 0.45, 0.32); tone(out, 'sine', f * 2, f * 2, t + i * 0.09, 0.005, 0.3, 0.1); }); },
  // 结束页：大三和弦小号式短奏
  End(out, t) {
    [[523.25, 0], [659.25, 0], [783.99, 0], [1046.5, 0.18]].forEach(([f, dt]) => { tone(out, 'sawtooth', f, f, t + dt, 0.03, 0.9, 0.08); tone(out, 'triangle', f, f, t + dt, 0.02, 1.0, 0.2); });
    for (let i = 0; i < 8; i++) { const f = 2000 + Math.random() * 3000; tone(out, 'sine', f, f, t + 0.25 + i * 0.07, 0.003, 0.25, 0.08); }
  },
};
export const SFX_NAMES = Object.keys(SYNTH);
export function sfx(name, opt = {}) {
  const S = getS();
  const vol = (S.sfxVolume ?? 0.7) * (S['sfx' + name + 'Vol'] ?? 1) * (opt.vol ?? 1);
  const audible = !(S.sfxMute || S['sfx' + name] === false) && vol > 0.001;
  if (sfxHook) try { sfxHook(name, vol, opt, audible); } catch (e) { console.warn(e); }
  if (!audible) return;
  if (!ensure() || AC.state !== 'running') return;
  const g = AC.createGain(); g.gain.value = vol; g.connect(master);
  try { SYNTH[name](g, AC.currentTime + 0.005 + (opt.delay || 0), opt.dur); } catch (e) { console.warn(e); }
  setTimeout(() => g.disconnect(), 3000);
}

// —— 导出 AE 工程用 ——
let sfxHook = null;
export function setSfxHook(fn) { sfxHook = fn; }
// 用 OfflineAudioContext 离线合成：events = [{t, name, vol, delay, dur}]，返回 AudioBuffer（单声道）
export async function renderSfxOffline(events, duration, sampleRate = 44100) {
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Off) return null;
  const len = Math.max(1, Math.ceil((duration + 0.05) * sampleRate));
  const off = new Off(1, len, sampleRate);
  const saveAC = AC, saveNoise = noiseBuf;
  AC = off; noiseBuf = null;
  try {
    const comp = off.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4; comp.connect(off.destination);
    for (const e of events) {
      const g = off.createGain(); g.gain.value = e.vol; g.connect(comp);
      try { SYNTH[e.name](g, e.t + 0.005 + (e.delay || 0), e.dur); } catch (err) { console.warn(err); }
    }
  } finally { AC = saveAC; noiseBuf = saveNoise; }
  return off.startRendering();
}
export function encodeWav(buf) {
  const ch = 1, sr = buf.sampleRate, d = buf.getChannelData(0), n = d.length;
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o, str) => { for (let i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true);
  out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, d[i])); out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
  return new Uint8Array(out.buffer);
}
