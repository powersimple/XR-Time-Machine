"""Minimal pure-Python MessagePack + LZ4 block decoder for ENGAGE stream.msp files.

MessagePack-CSharp's Lz4BlockArray: top-level array whose first element is ext type 98
holding the uncompressed length of each chunk (as msgpack ints), followed by one bin per chunk.
"""
import struct


def lz4_block_decompress(src, out_len):
    dst = bytearray()
    i, n = 0, len(src)
    while i < n:
        token = src[i]; i += 1
        lit = token >> 4
        if lit == 15:
            while True:
                b = src[i]; i += 1; lit += b
                if b != 255: break
        dst += src[i:i + lit]; i += lit
        if i >= n: break
        off = src[i] | (src[i + 1] << 8); i += 2
        ml = token & 15
        if ml == 15:
            while True:
                b = src[i]; i += 1; ml += b
                if b != 255: break
        ml += 4
        start = len(dst) - off
        for k in range(ml):
            dst.append(dst[start + k])
    if len(dst) != out_len:
        raise ValueError(f"lz4 length mismatch {len(dst)} != {out_len}")
    return bytes(dst)


class Ext:
    __slots__ = ("type", "data")
    def __init__(self, t, d): self.type, self.data = t, d
    def __repr__(self): return f"Ext({self.type}, {len(self.data)}b)"


class Reader:
    def __init__(self, buf, pos=0):
        self.b, self.p = buf, pos

    def _take(self, n):
        v = self.b[self.p:self.p + n]; self.p += n; return v

    def read(self):
        c = self.b[self.p]; self.p += 1
        if c <= 0x7f: return c
        if c >= 0xe0: return c - 0x100
        if 0x80 <= c <= 0x8f: return self._map(c & 0x0f)
        if 0x90 <= c <= 0x9f: return self._arr(c & 0x0f)
        if 0xa0 <= c <= 0xbf: return self._take(c & 0x1f).decode("utf-8", "replace")
        u = struct.unpack_from
        if c == 0xc0: return None
        if c == 0xc2: return False
        if c == 0xc3: return True
        if c in (0xc4, 0xc5, 0xc6):
            ln = [1, 2, 4][c - 0xc4]; n = int.from_bytes(self._take(ln), "big"); return bytes(self._take(n))
        if c in (0xc7, 0xc8, 0xc9):
            ln = [1, 2, 4][c - 0xc7]; n = int.from_bytes(self._take(ln), "big")
            t = struct.unpack("b", self._take(1))[0]; return Ext(t, bytes(self._take(n)))
        if c == 0xca: v = u(">f", self.b, self.p)[0]; self.p += 4; return v
        if c == 0xcb: v = u(">d", self.b, self.p)[0]; self.p += 8; return v
        if 0xcc <= c <= 0xcf:
            ln = 1 << (c - 0xcc); return int.from_bytes(self._take(ln), "big")
        if 0xd0 <= c <= 0xd3:
            ln = 1 << (c - 0xd0); return int.from_bytes(self._take(ln), "big", signed=True)
        if 0xd4 <= c <= 0xd8:
            n = 1 << (c - 0xd4); t = struct.unpack("b", self._take(1))[0]; return Ext(t, bytes(self._take(n)))
        if c in (0xd9, 0xda, 0xdb):
            ln = [1, 2, 4][c - 0xd9]; n = int.from_bytes(self._take(ln), "big"); return self._take(n).decode("utf-8", "replace")
        if c in (0xdc, 0xdd):
            n = int.from_bytes(self._take(2 if c == 0xdc else 4), "big"); return self._arr(n)
        if c in (0xde, 0xdf):
            n = int.from_bytes(self._take(2 if c == 0xde else 4), "big"); return self._map(n)
        raise ValueError(f"bad msgpack byte 0x{c:02x} at {self.p - 1}")

    def _arr(self, n): return [self.read() for _ in range(n)]
    def _map(self, n): return {self._key(): self.read() for _ in range(n)} if n else {}
    def _key(self):
        k = self.read()
        return tuple(k) if isinstance(k, list) else k


def decode_lz4_block_array(buf):
    top = Reader(buf).read()
    if isinstance(top, list) and top and isinstance(top[0], Ext) and top[0].type == 98:
        r = Reader(top[0].data); lens = []
        while r.p < len(top[0].data): lens.append(r.read())
        raw = b"".join(lz4_block_decompress(c, l) for c, l in zip(top[1:], lens))
        return raw
    return None


def load(path):
    return load_bytes(open(path, "rb").read())


def load_bytes(buf):
    raw = decode_lz4_block_array(buf)
    return Reader(raw).read() if raw is not None else Reader(buf).read(), raw
