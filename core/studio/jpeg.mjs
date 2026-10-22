// Baseline JPEG encoder (JFIF, 4:2:0 chroma, standard Huffman tables) for RGB buffers.
// Used for Photo-JPEG QuickTime movies, which macOS (AVFoundation), Premiere and Resolve all decode.

const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const LUMA_Q = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const CHROMA_Q = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];

// Standard Huffman tables (JPEG spec, Annex K): code counts per length 1–16, then symbols.
const DC_LUMA = [[0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]];
const DC_CHROMA = [[0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]];
const AC_LUMA = [[0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa]];
const AC_CHROMA = [[0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77], [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
  0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
  0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
  0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa]];

// symbol -> code and length, as flat typed arrays (indexed by symbol) for speed.
function buildCodes([counts, symbols]) {
  const code = new Uint16Array(256), len = new Uint8Array(256);
  let c = 0, k = 0;
  for (let l = 1; l <= 16; l++) {
    for (let i = 0; i < counts[l - 1]; i++) { code[symbols[k]] = c++; len[symbols[k++]] = l; }
    c <<= 1;
  }
  return { code, len };
}
const H = { dcL: buildCodes(DC_LUMA), dcC: buildCodes(DC_CHROMA), acL: buildCodes(AC_LUMA), acC: buildCodes(AC_CHROMA) };

function scaledTable(base, quality) {
  const q = Math.max(1, Math.min(100, quality));
  const s = q < 50 ? 5000 / q : 200 - q * 2;
  return base.map((v) => Math.max(1, Math.min(255, Math.floor((v * s + 50) / 100))));
}

// AAN forward DCT scale factors, folded into the quantizer.
const AAN = [1, 1.387039845, 1.306562965, 1.175875602, 1, 0.785694958, 0.5411961, 0.275899379];
function divisors(table) {
  const d = new Float64Array(64);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) d[r * 8 + c] = 1 / (table[r * 8 + c] * AAN[r] * AAN[c] * 8);
  return d;
}

function fdct(b) {
  for (let i = 0; i < 64; i += 8) dct1(b, i, 1);
  for (let i = 0; i < 8; i++) dct1(b, i, 8);
}
function dct1(d, o, s) {
  const d0 = d[o], d1 = d[o + s], d2 = d[o + 2 * s], d3 = d[o + 3 * s], d4 = d[o + 4 * s], d5 = d[o + 5 * s], d6 = d[o + 6 * s], d7 = d[o + 7 * s];
  const t0 = d0 + d7, t7 = d0 - d7, t1 = d1 + d6, t6 = d1 - d6, t2 = d2 + d5, t5 = d2 - d5, t3 = d3 + d4, t4 = d3 - d4;
  let t10 = t0 + t3; const t13 = t0 - t3; let t11 = t1 + t2; let t12 = t1 - t2;
  d[o] = t10 + t11; d[o + 4 * s] = t10 - t11;
  const z1 = (t12 + t13) * 0.707106781;
  d[o + 2 * s] = t13 + z1; d[o + 6 * s] = t13 - z1;
  t10 = t4 + t5; t11 = t5 + t6; t12 = t6 + t7;
  const z5 = (t10 - t12) * 0.382683433, z2 = 0.5411961 * t10 + z5, z4 = 1.306562965 * t12 + z5, z3 = t11 * 0.707106781;
  const z11 = t7 + z3, z13 = t7 - z3;
  d[o + 5 * s] = z13 + z2; d[o + 3 * s] = z13 - z2; d[o + s] = z11 + z4; d[o + 7 * s] = z11 - z4;
}

class Bits {
  constructor(capacity) { this.buf = Buffer.allocUnsafe(capacity); this.pos = 0; this.acc = 0; this.n = 0; }
  put(code, len) {
    this.acc = (this.acc << len) | code; this.n += len;
    while (this.n >= 8) {
      const b = (this.acc >>> (this.n - 8)) & 0xff;
      if (this.pos + 2 > this.buf.length) { const bigger = Buffer.allocUnsafe(this.buf.length * 2); this.buf.copy(bigger, 0, 0, this.pos); this.buf = bigger; }
      this.buf[this.pos++] = b; if (b === 0xff) this.buf[this.pos++] = 0; // byte stuffing
      this.n -= 8; this.acc &= (1 << this.n) - 1;
    }
  }
  flush() { if (this.n > 0) this.put((1 << (8 - this.n)) - 1, 8 - this.n); }
  bytes() { return this.buf.subarray(0, this.pos); }
}

const category = (v) => { let a = Math.abs(v), n = 0; while (a) { n++; a >>= 1; } return n; };
const amplitudeBits = (v, n) => (v < 0 ? v + (1 << n) - 1 : v);

const Q = new Int32Array(64);
function encodeBlock(bits, block, div, prevDc, dc, ac) {
  fdct(block);
  for (let i = 0; i < 64; i++) { const z = ZIGZAG[i]; const v = block[z] * div[z]; Q[i] = v < 0 ? -Math.round(-v) : Math.round(v); }
  const diff = Q[0] - prevDc;
  const c = category(diff);
  bits.put(dc.code[c], dc.len[c]);
  if (c) bits.put(amplitudeBits(diff, c), c);
  let run = 0;
  for (let i = 1; i < 64; i++) {
    const v = Q[i];
    if (v === 0) { run++; continue; }
    while (run > 15) { bits.put(ac.code[0xf0], ac.len[0xf0]); run -= 16; }
    const n = category(v);
    const sym = (run << 4) | n;
    bits.put(ac.code[sym], ac.len[sym]);
    bits.put(amplitudeBits(v, n), n);
    run = 0;
  }
  if (run) bits.put(ac.code[0], ac.len[0]); // end of block
  return Q[0];
}

const cache = new Map();
function tables(quality) {
  if (!cache.has(quality)) {
    const lq = scaledTable(LUMA_Q, quality), cq = scaledTable(CHROMA_Q, quality);
    cache.set(quality, { lq, cq, ld: divisors(lq), cd: divisors(cq) });
  }
  return cache.get(quality);
}

export function encodeJpeg(rgb, width, height, quality = 88) {
  const { lq, cq, ld, cd } = tables(quality);
  const bits = new Bits(Math.max(65536, width * height));
  let dy = 0, du = 0, dv = 0;
  const Y = new Float64Array(64), U = new Float64Array(64), V = new Float64Array(64), Ub = new Float64Array(256), Vb = new Float64Array(256);
  for (let my = 0; my < height; my += 16) {
    for (let mx = 0; mx < width; mx += 16) {
      // Colour convert the 16×16 macroblock; keep full-res chroma to average down to 8×8.
      for (let by = 0; by < 2; by++) {
        for (let bx = 0; bx < 2; bx++) {
          for (let y = 0; y < 8; y++) {
            const py = Math.min(height - 1, my + by * 8 + y);
            const row = py * width;
            for (let x = 0; x < 8; x++) {
              const px = Math.min(width - 1, mx + bx * 8 + x);
              const i = (row + px) * 3;
              const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
              Y[y * 8 + x] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
              const ci = (by * 8 + y) * 16 + bx * 8 + x;
              Ub[ci] = -0.168736 * r - 0.331264 * g + 0.5 * b;
              Vb[ci] = 0.5 * r - 0.418688 * g - 0.081312 * b;
            }
          }
          dy = encodeBlock(bits, Y, ld, dy, H.dcL, H.acL);
        }
      }
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const a = (y * 2) * 16 + x * 2;
          U[y * 8 + x] = (Ub[a] + Ub[a + 1] + Ub[a + 16] + Ub[a + 17]) / 4;
          V[y * 8 + x] = (Vb[a] + Vb[a + 1] + Vb[a + 16] + Vb[a + 17]) / 4;
        }
      }
      du = encodeBlock(bits, U, cd, du, H.dcC, H.acC);
      dv = encodeBlock(bits, V, cd, dv, H.dcC, H.acC);
    }
  }
  bits.flush();
  return Buffer.concat([header(width, height, lq, cq), bits.bytes(), Buffer.from([0xff, 0xd9])]);
}

function header(width, height, lq, cq) {
  const seg = (marker, body) => Buffer.concat([Buffer.from([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255]), Buffer.from(body)]);
  const dht = (cls, id, [counts, symbols]) => [(cls << 4) | id, ...counts, ...symbols];
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), // JFIF 1.01
    seg(0xdb, [0, ...ZIGZAG.map((z) => lq[z]), 1, ...ZIGZAG.map((z) => cq[z])]),
    seg(0xc0, [8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    seg(0xc4, [...dht(0, 0, DC_LUMA), ...dht(1, 0, AC_LUMA), ...dht(0, 1, DC_CHROMA), ...dht(1, 1, AC_CHROMA)]),
    seg(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]),
  ]);
}
