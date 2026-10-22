// Writes QuickTime .mov files of still-image frames. Default codec is Photo-JPEG ('jpeg', frames from ./jpeg.mjs),
// which macOS (AVFoundation), Premiere and Resolve all decode. 'png ' (lossless) is also possible, but AVFoundation
// won't decode it, so it's not the default. Frames stream to disk as they're added; the index (moov) comes last.
import { closeSync, openSync, writeSync } from 'node:fs';

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xffff); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const fixed16 = (n) => u32(Math.round(n * 65536));
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'ascii'), body]); };
const full = (type, version, flags, ...parts) => box(type, Buffer.from([version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts);
const MATRIX = Buffer.concat([fixed16(1), fixed16(0), u32(0), fixed16(0), fixed16(1), u32(0), fixed16(0), fixed16(0), u32(0x40000000)]);
const pascal = (s, size) => { const b = Buffer.alloc(size); b[0] = Math.min(s.length, size - 1); b.write(s.slice(0, size - 1), 1, 'ascii'); return b; };

export class MovWriter {
  // fps: frames per second (integer, e.g. 30). Timescale is fps × 100, so each frame lasts 100 units.
  constructor(path, { width, height, fps = 30, codec = 'jpeg' }) {
    const name = { jpeg: 'Photo - JPEG', 'png ': 'PNG' }[codec];
    if (!name) throw new RangeError(`MovWriter: unsupported codec ${codec}`);
    Object.assign(this, { path, width, height, fps, codec, codecName: name, timescale: fps * 100, sizes: [], offsets: [] });
    this.fd = openSync(path, 'w');
    this.pos = 0;
    this.write(box('ftyp', Buffer.from('qt  ', 'ascii'), u32(0x20050300), Buffer.from('qt  ', 'ascii')));
    this.mdatStart = this.pos;
    // 64-bit mdat header (size patched on close), so files over 4 GB still work.
    this.write(Buffer.concat([u32(1), Buffer.from('mdat', 'ascii'), u64(0)]));
  }

  write(buf) { writeSync(this.fd, buf, 0, buf.length, this.pos); this.pos += buf.length; }

  addFrame(image) {
    this.offsets.push(this.pos);
    this.sizes.push(image.length);
    this.write(image);
  }

  close() {
    const mdatSize = this.pos - this.mdatStart;
    writeSync(this.fd, u64(mdatSize), 0, 8, this.mdatStart + 8);
    const n = this.sizes.length;
    const duration = n * 100;
    const { width, height, timescale } = this;
    const stsd = full('stsd', 0, 0, u32(1), box(this.codec,
      Buffer.alloc(6), u16(1), // reserved, data reference index
      u16(0), u16(0), Buffer.from('appl', 'ascii'), u32(0), u32(1024), // version, revision, vendor, temporal and spatial quality
      u16(width), u16(height), fixed16(72), fixed16(72), u32(0), u16(1),
      pascal(this.codecName, 32), u16(24), u16(0xffff)));
    const stbl = box('stbl', stsd,
      full('stts', 0, 0, u32(1), u32(n), u32(100)),
      full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
      full('stsz', 0, 0, u32(0), u32(n), ...this.sizes.map(u32)),
      full('co64', 0, 0, u32(n), ...this.offsets.map(u64)));
    const minf = box('minf',
      full('vmhd', 0, 1, u16(0x40), u16(0x8000), u16(0x8000), u16(0x8000)),
      full('hdlr', 0, 0, Buffer.from('dhlralis', 'ascii'), u32(0), u32(0), u32(0), pascal('DataHandler', 12)),
      box('dinf', full('dref', 0, 0, u32(1), full('alis', 0, 1))),
      stbl);
    const mdia = box('mdia',
      full('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0), u16(0)),
      full('hdlr', 0, 0, Buffer.from('mhlrvide', 'ascii'), u32(0), u32(0), u32(0), pascal('VideoHandler', 13)),
      minf);
    const tkhd = full('tkhd', 0, 0x3, u32(0), u32(0), u32(1), u32(0), u32(duration), Buffer.alloc(8), u16(0), u16(0), u16(0), u16(0), MATRIX, fixed16(width), fixed16(height));
    const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), fixed16(1), Buffer.from([1, 0]), Buffer.alloc(10), MATRIX,
      u32(0), u32(0), u32(0), u32(0), u32(0), u32(0), u32(2));
    this.write(box('moov', mvhd, box('trak', tkhd, mdia)));
    closeSync(this.fd);
    return { frames: n, seconds: n / this.fps, bytes: this.pos };
  }
}
