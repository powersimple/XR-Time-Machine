// Reads frames back out of a still-image QuickTime movie (as written by ./mov.mjs, or any single-track
// Photo-JPEG/PNG .mov): for thumbnails, checks and tests.
//   node core/studio/movframes.mjs <movie.mov> <seconds> <out.jpg>
import { closeSync, openSync, readSync, fstatSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function openMov(path) {
  const fd = openSync(path, 'r');
  const size = fstatSync(fd).size;
  const read = (pos, len) => { const b = Buffer.alloc(len); readSync(fd, b, 0, len, pos); return b; };
  // Walk top-level boxes to find moov, then parse the parts we need.
  let pos = 0, moov = null;
  while (pos < size) {
    const h = read(pos, 16);
    let len = h.readUInt32BE(0);
    const type = h.toString('ascii', 4, 8);
    if (len === 1) len = Number(h.readBigUInt64BE(8));
    if (len === 0) len = size - pos;
    if (type === 'moov') moov = read(pos, len);
    pos += len;
  }
  if (!moov) throw new Error(`${path}: no moov box`);
  const find = (buf, path_, start = 8) => {
    let p = start;
    const [head, ...rest] = path_;
    while (p < buf.length - 8) {
      const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
      if (type === head) return rest.length ? find(buf.subarray(p, p + len), rest) : buf.subarray(p, p + len);
      p += len;
    }
    return null;
  };
  const stbl = find(moov, ['trak', 'mdia', 'minf', 'stbl']);
  const mdhd = find(moov, ['trak', 'mdia', 'mdhd']);
  const stsd = find(stbl, ['stsd']), stsz = find(stbl, ['stsz']), stts = find(stbl, ['stts']);
  const co64 = find(stbl, ['co64']), stco = find(stbl, ['stco']);
  const n = stsz.readUInt32BE(16);
  const sizes = Array.from({ length: n }, (_, i) => stsz.readUInt32BE(20 + i * 4));
  const offsets = co64 ? Array.from({ length: n }, (_, i) => Number(co64.readBigUInt64BE(16 + i * 8))) : Array.from({ length: n }, (_, i) => stco.readUInt32BE(16 + i * 4));
  const timescale = mdhd.readUInt32BE(20);
  const frameDuration = stts.readUInt32BE(20);
  return {
    codec: stsd.toString('ascii', 20, 24), width: stsd.readUInt16BE(48), height: stsd.readUInt16BE(50),
    frames: n, fps: timescale / frameDuration,
    frame: (i) => read(offsets[i], sizes[i]),
    close: () => closeSync(fd),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [path, seconds, out] = process.argv.slice(2);
  const mov = openMov(path);
  const i = Math.min(mov.frames - 1, Math.round(Number(seconds) * mov.fps));
  writeFileSync(out, mov.frame(i));
  console.log(`${path}: ${mov.codec} ${mov.width}×${mov.height}, ${mov.frames} frames at ${mov.fps} fps; wrote frame ${i} to ${out}`);
  mov.close();
}
