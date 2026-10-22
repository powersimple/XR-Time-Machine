// A minimal software rasterizer into an RGB buffer: fills, discs, thick lines and a 5×7 bitmap font.
// Enough to draw stick-figure avatars, a floor and name tags with no native dependencies.

export class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.rgb = Buffer.alloc(width * height * 3);
  }

  // Vertical gradient from top colour to bottom colour.
  gradient(top, bottom) {
    const { width, height, rgb } = this;
    for (let y = 0; y < height; y++) {
      const k = y / (height - 1);
      const r = top[0] + (bottom[0] - top[0]) * k, g = top[1] + (bottom[1] - top[1]) * k, b = top[2] + (bottom[2] - top[2]) * k;
      let i = y * width * 3;
      for (let x = 0; x < width; x++) { rgb[i++] = r; rgb[i++] = g; rgb[i++] = b; }
    }
  }

  // Blend a colour into one pixel with coverage a (0–1).
  blend(x, y, c, a) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || a <= 0) return;
    const i = (y * this.width + x) * 3;
    const r = this.rgb;
    if (a >= 1) { r[i] = c[0]; r[i + 1] = c[1]; r[i + 2] = c[2]; return; }
    r[i] += (c[0] - r[i]) * a; r[i + 1] += (c[1] - r[i + 1]) * a; r[i + 2] += (c[2] - r[i + 2]) * a;
  }

  // Anti-aliased filled disc.
  disc(cx, cy, radius, c, alpha = 1) {
    const r = Math.max(0.5, radius);
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        this.blend(x, y, c, Math.min(1, r - d + 0.5) * alpha);
      }
    }
  }

  // Anti-aliased ring (circle outline) of the given thickness.
  ring(cx, cy, radius, thickness, c, alpha = 1) {
    const r = radius + thickness;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - radius);
        this.blend(x, y, c, Math.min(1, thickness / 2 - d + 0.5) * alpha);
      }
    }
  }

  // Anti-aliased line with round caps, width w0 at the start tapering to w1 at the end. Only pixels within reach
  // of the stroke are visited: it steps along the line's major axis and covers a narrow band across it.
  line(x0, y0, x1, y1, w0, c, w1 = w0, alpha = 1) {
    const dx = x1 - x0, dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1e-9;
    const reach = Math.max(w0, w1) / 2 + 1;
    const { width, height, rgb } = this;
    const steep = Math.abs(dy) > Math.abs(dx);
    // Major axis range, extended by the reach for the round caps.
    const a0 = Math.max(0, Math.floor((steep ? Math.min(y0, y1) : Math.min(x0, x1)) - reach));
    const a1 = Math.min((steep ? height : width) - 1, Math.ceil((steep ? Math.max(y0, y1) : Math.max(x0, x1)) + reach));
    const slope = steep ? dx / (dy || 1e-9) : dy / (dx || 1e-9);
    const band = reach * Math.sqrt(1 + slope * slope) + 1; // half-width of the stroke measured along the minor axis
    for (let a = a0; a <= a1; a++) {
      const center = steep ? x0 + (a + 0.5 - y0) * slope : y0 + (a + 0.5 - x0) * slope;
      const b0 = Math.max(0, Math.floor(center - band)), b1 = Math.min((steep ? width : height) - 1, Math.ceil(center + band));
      for (let b = b0; b <= b1; b++) {
        const x = steep ? b : a, y = steep ? a : b;
        const px = x + 0.5, py = y + 0.5;
        let t = ((px - x0) * dx + (py - y0) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t);
        const cover = Math.min(1, (w0 + (w1 - w0) * t) / 2 - Math.sqrt(ex * ex + ey * ey) + 0.5) * alpha;
        if (cover <= 0) continue;
        const i = (y * width + x) * 3;
        if (cover >= 1) { rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2]; }
        else { rgb[i] += (c[0] - rgb[i]) * cover; rgb[i + 1] += (c[1] - rgb[i + 1]) * cover; rgb[i + 2] += (c[2] - rgb[i + 2]) * cover; }
      }
    }
  }

  rect(x, y, w, h, c, alpha = 1) {
    for (let j = Math.max(0, Math.floor(y)); j < Math.min(this.height, Math.ceil(y + h)); j++) {
      for (let i = Math.max(0, Math.floor(x)); i < Math.min(this.width, Math.ceil(x + w)); i++) this.blend(i, j, c, alpha);
    }
  }

  // Text in a 5×7 bitmap font at `size` pixels per font pixel. Characters outside the font draw as '?'.
  text(str, x, y, size, c, alpha = 1) {
    let cx = x;
    for (const ch of str) {
      const glyph = FONT[ch] ?? FONT[ch.toUpperCase()] ?? FONT['?'];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (glyph[row] & (1 << (4 - col))) this.rect(cx + col * size, y + row * size, size, size, c, alpha);
        }
      }
      cx += 6 * size;
    }
    return cx - x;
  }

  textWidth(str, size) { return [...str].length * 6 * size; }

  // Composite another canvas over this one with opacity a (for dissolves).
  mix(other, a) {
    const r = this.rgb, o = other.rgb;
    for (let i = 0; i < r.length; i++) r[i] += (o[i] - r[i]) * a;
  }
}

// 5×7 font: each glyph is 7 rows of 5 bits. Uppercase, digits and common punctuation; lowercase maps to upper.
const G = (s) => s.split(' ').map((r) => parseInt(r, 2));
const FONT = {
  A: G('01110 10001 10001 11111 10001 10001 10001'), B: G('11110 10001 10001 11110 10001 10001 11110'),
  C: G('01110 10001 10000 10000 10000 10001 01110'), D: G('11110 10001 10001 10001 10001 10001 11110'),
  E: G('11111 10000 10000 11110 10000 10000 11111'), F: G('11111 10000 10000 11110 10000 10000 10000'),
  G: G('01110 10001 10000 10111 10001 10001 01111'), H: G('10001 10001 10001 11111 10001 10001 10001'),
  I: G('01110 00100 00100 00100 00100 00100 01110'), J: G('00111 00010 00010 00010 00010 10010 01100'),
  K: G('10001 10010 10100 11000 10100 10010 10001'), L: G('10000 10000 10000 10000 10000 10000 11111'),
  M: G('10001 11011 10101 10101 10001 10001 10001'), N: G('10001 10001 11001 10101 10011 10001 10001'),
  O: G('01110 10001 10001 10001 10001 10001 01110'), P: G('11110 10001 10001 11110 10000 10000 10000'),
  Q: G('01110 10001 10001 10001 10101 10010 01101'), R: G('11110 10001 10001 11110 10100 10010 10001'),
  S: G('01111 10000 10000 01110 00001 00001 11110'), T: G('11111 00100 00100 00100 00100 00100 00100'),
  U: G('10001 10001 10001 10001 10001 10001 01110'), V: G('10001 10001 10001 10001 10001 01010 00100'),
  W: G('10001 10001 10001 10101 10101 10101 01010'), X: G('10001 10001 01010 00100 01010 10001 10001'),
  Y: G('10001 10001 01010 00100 00100 00100 00100'), Z: G('11111 00001 00010 00100 01000 10000 11111'),
  0: G('01110 10001 10011 10101 11001 10001 01110'), 1: G('00100 01100 00100 00100 00100 00100 01110'),
  2: G('01110 10001 00001 00010 00100 01000 11111'), 3: G('11111 00010 00100 00010 00001 10001 01110'),
  4: G('00010 00110 01010 10010 11111 00010 00010'), 5: G('11111 10000 11110 00001 00001 10001 01110'),
  6: G('00110 01000 10000 11110 10001 10001 01110'), 7: G('11111 00001 00010 00100 01000 01000 01000'),
  8: G('01110 10001 10001 01110 10001 10001 01110'), 9: G('01110 10001 10001 01111 00001 00010 01100'),
  ' ': G('00000 00000 00000 00000 00000 00000 00000'), '.': G('00000 00000 00000 00000 00000 01100 01100'),
  ',': G('00000 00000 00000 00000 01100 00100 01000'), ':': G('00000 01100 01100 00000 01100 01100 00000'),
  '-': G('00000 00000 00000 11111 00000 00000 00000'), '_': G('00000 00000 00000 00000 00000 00000 11111'),
  '!': G('00100 00100 00100 00100 00100 00000 00100'), '?': G('01110 10001 00001 00010 00100 00000 00100'),
  "'": G('00100 00100 01000 00000 00000 00000 00000'), '(': G('00010 00100 01000 01000 01000 00100 00010'),
  ')': G('01000 00100 00010 00010 00010 00100 01000'), '/': G('00001 00010 00010 00100 01000 01000 10000'),
  '#': G('01010 01010 11111 01010 11111 01010 01010'), '+': G('00000 00100 00100 11111 00100 00100 00000'),
  '&': G('01100 10010 10100 01000 10101 10010 01101'), '@': G('01110 10001 10111 10101 10111 10000 01110'),
};
