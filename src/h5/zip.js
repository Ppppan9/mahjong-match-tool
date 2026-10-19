// ZIP writer with optional DEFLATE (CompressionStream) for H5 playable packages.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

async function deflateRaw(u8) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter();
    w.write(u8); w.close();
    const chunks = [];
    const r = cs.readable.getReader();
    for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
    let n = 0; for (const c of chunks) n += c.length;
    const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  } catch { return null; }
}

function encStr(s) { return new TextEncoder().encode(s); }
function toU8(data) {
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') return encStr(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return encStr(String(data));
}

/** files: [{name, data: string|Uint8Array}] → Blob (application/zip) */
export async function makeZip(files, { compress = true } = {}) {
  const parts = [], central = [];
  let offset = 0;
  const d = new Date(), dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | ((d.getSeconds() / 2) | 0), dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = encStr(f.name), raw = toU8(f.data), crc = crc32(raw);
    let method = 0, payload = raw;
    if (compress && raw.length > 64) {
      const def = await deflateRaw(raw);
      if (def && def.length < raw.length) { method = 8; payload = def; }
    }
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true);
    h.setUint16(10, dosT, true); h.setUint16(12, dosD, true); h.setUint32(14, crc, true);
    h.setUint32(18, payload.length, true); h.setUint32(22, raw.length, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, payload);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true);
    c.setUint16(12, dosT, true); c.setUint16(14, dosD, true); c.setUint32(16, crc, true);
    c.setUint32(20, payload.length, true); c.setUint32(24, raw.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + payload.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
