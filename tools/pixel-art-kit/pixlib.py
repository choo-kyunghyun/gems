#!/usr/bin/env python3
"""pixlib — shared pixel primitives for the kit (pure Python stdlib, no PIL).

PNG decode/encode, an animated-GIF writer and nearest-neighbor compositing — the I/O half
of the kit (`raster` is the drawing half; colors are `palette`'s, the project module beside the
kit). Path helpers (KIT/OUT) resolve the toolkit root so every script writes to the one shared
out/.
"""
import zlib, struct, binascii, os, sys

KIT = os.path.dirname(os.path.abspath(__file__))    # toolkit root
OUT = os.path.join(KIT, "out")                       # shared output root (gitignored)
sys.path.insert(0, os.path.join(os.path.dirname(KIT), "palette"))   # `import palette` — tools/palette


def out_dir(*parts):
    """Path under the shared out/, creating it. e.g. out_dir('agent') -> .../out/agent."""
    d = os.path.join(OUT, *parts)
    os.makedirs(d, exist_ok=True)
    return d


# ---- PNG decode (8-bit, non-interlaced; color types 0/2/3/6) ---------------


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def read_png(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    pos = 8
    width = height = colortype = None
    idat = bytearray()
    plte = trns = None
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if typ == b"IHDR":
            width, height, bitdepth, colortype, comp, filt, interlace = \
                struct.unpack(">IIBBBBB", chunk)
            assert bitdepth == 8 and interlace == 0, "only 8-bit non-interlaced"
        elif typ == b"PLTE":
            plte = chunk
        elif typ == b"tRNS":
            trns = chunk
        elif typ == b"IDAT":
            idat += chunk
        elif typ == b"IEND":
            break
    raw = zlib.decompress(bytes(idat))
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colortype]
    stride = width * ch
    prev = bytearray(stride)
    pos = 0
    rows = []
    for _ in range(height):
        f = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos + stride]); pos += stride
        if f == 1:
            for i in range(stride):
                line[i] = (line[i] + (line[i - ch] if i >= ch else 0)) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                c = prev[i - ch] if i >= ch else 0
                line[i] = (line[i] + _paeth(a, prev[i], c)) & 255
        prev = line
        rows.append(line)
    out = []
    for y in range(height):
        line = rows[y]
        for x in range(width):
            if colortype == 6:
                out.append((line[x*4], line[x*4+1], line[x*4+2], line[x*4+3]))
            elif colortype == 2:
                out.append((line[x*3], line[x*3+1], line[x*3+2], 255))
            elif colortype == 0:
                v = line[x]; out.append((v, v, v, 255))
            else:  # 3 indexed
                idx = line[x]
                a = trns[idx] if (trns and idx < len(trns)) else 255
                out.append((plte[idx*3], plte[idx*3+1], plte[idx*3+2], a))
    return width, height, out

# ---- PNG encode ------------------------------------------------------------


def write_png(path, width, height, pixels):
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            raw += bytes((r, g, b, a))

    def chunk(typ, d):
        return (struct.pack(">I", len(d)) + typ + d +
                struct.pack(">I", binascii.crc32(typ + d) & 0xffffffff))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n"
                + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
                + chunk(b"IEND", b""))

# ---- animated GIF (GIF89a, stdlib) -----------------------------------------


def _gif_lzw(indices, mcs):
    """Uncompressed-GIF LZW: fixed code width (mcs+1), leading clear, proactive clear
    before the decoder's table would force a width bump. Avoids the variable-width
    off-by-one; negligible overhead for small frames."""
    clear, end = 1 << mcs, (1 << mcs) + 1
    size = mcs + 1
    out = bytearray()
    bitbuf = bitcnt = 0

    def emit(code):
        nonlocal bitbuf, bitcnt
        bitbuf |= code << bitcnt
        bitcnt += size
        while bitcnt >= 8:
            out.append(bitbuf & 0xFF)
            bitbuf >>= 8
            bitcnt -= 8

    emit(clear)
    count, limit = 0, clear - 2
    for px in indices:
        if count == limit:
            emit(clear)
            count = 0
        emit(px)
        count += 1
    emit(end)
    if bitcnt:
        out.append(bitbuf & 0xFF)
    return bytes(out)


def _subblocks(data):
    out = bytearray()
    for i in range(0, len(data), 255):
        chunk = data[i:i + 255]
        out.append(len(chunk))
        out += chunk
    out.append(0)
    return bytes(out)


def write_gif(path, frames, width, height, delay_cs=8):
    """frames: list of flat [(r,g,b,a)] (same shape as write_png pixels). Builds a shared
    palette (index 0 = transparent, for any a==0 pixel); loops forever at delay_cs (1/100s)."""
    order, lut = [], {}

    def idx(px):
        if px[3] == 0:
            return 0
        key = px[:3]
        if key not in lut:
            order.append(key)
            lut[key] = len(order)  # 1-based; 0 reserved for transparent
        return lut[key]

    frame_idx = [[idx(px) for px in fr] for fr in frames]
    ncolors = 1 + len(order)
    bits = max(2, (ncolors - 1).bit_length())
    while (1 << bits) < ncolors:
        bits += 1
    mcs, table = bits, 1 << bits
    gct = bytearray([0, 0, 0])
    for (r, g, b) in order:
        gct += bytes((r, g, b))
    gct += bytes(3 * (table - ncolors))
    buf = bytearray(b"GIF89a")
    buf += struct.pack("<HH", width, height)
    buf += bytes((0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0))
    buf += gct
    buf += b"\x21\xFF\x0BNETSCAPE2.0\x03\x01" + struct.pack("<H", 0) + b"\x00"
    for fi in frame_idx:
        buf += b"\x21\xF9\x04" + bytes((0x09,)) + struct.pack("<H", delay_cs) + bytes((0, 0))
        buf += b"\x2C" + struct.pack("<HHHH", 0, 0, width, height) + bytes((0,))
        buf += bytes((mcs,)) + _subblocks(_gif_lzw(fi, mcs))
    buf += b"\x3B"
    open(path, "wb").write(bytes(buf))

# ---- compositing -----------------------------------------------------------

CK_A, CK_B = (90, 90, 100, 255), (60, 60, 70, 255)


def checker(X, Y, cell=8):
    return CK_A if ((X // cell) + (Y // cell)) % 2 == 0 else CK_B


def over(fg, bg):
    r, g, b, a = fg
    if a == 255:
        return (r, g, b, 255)
    if a == 0:
        return bg
    t = a / 255.0
    return (round(r*t + bg[0]*(1-t)), round(g*t + bg[1]*(1-t)),
            round(b*t + bg[2]*(1-t)), 255)


def blit(dst, dw, ox, oy, src, sw, sh, scale, ck=12):
    """nearest-neighbor blit src (sw x sh) into dst at (ox,oy), upscaled, on checker."""
    for j in range(sh * scale):
        sy = j // scale
        for i in range(sw * scale):
            sx = i // scale
            X, Y = ox + i, oy + j
            dst[Y * dw + X] = over(src[sy * sw + sx], checker(X, Y, ck))

