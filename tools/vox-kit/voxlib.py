#!/usr/bin/env python3
"""voxlib — .vox I/O and the kit's paths (pure Python stdlib).

The game ships MagicaVoxel files as-is (datafiles/meshes/<name>.vox — the editable source IS the
asset) and scripts/Vox reads exactly this much of one: the FIRST SIZE + XYZI model and the RGBA
palette. So does `read`; `write` emits those three chunks and nothing else (MagicaVoxel opens the
result; its scene / material chunks are not carried, and a multi-model file collapses to its first).

Coordinates are MagicaVoxel's, which the game maps 1:1: x = east (width), y = south (+y is the face
toward the camera), z = UP with z = 0 the ground; 1 voxel = 1 world px. The runtime centers the
CANVAS (not the content) on the footprint, so a model sits where its canvas puts it. Palette indices
are 1-based in the file (0 = empty) and a Model keeps them so: `pal[i - 1]` is the color of index i.
`AAP` is the 256-slot palette the kit writes (slots 1..64 = AAP-64 entries 0..63, the order
`palette.magica` exports for MagicaVoxel) and `slot(rgb)` the 1-based index a color snaps to.

    import os, voxlib as V
    m = V.read("datafiles/meshes/rock.vox")
    m.size, len(m.vox), m.content()      # (32, 32, 32), 5085, (w, d, h) of the voxels
    V.write(os.path.join(V.out_dir("rock"), "rock.vox"), m)
"""
import os, sys, struct, zlib, binascii

KIT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(KIT, "out")
sys.path.insert(0, os.path.join(os.path.dirname(KIT), "palette"))   # `import palette` — tools/palette
import palette as PAL

AAP = PAL.PALETTE + [(0, 0, 0)] * (256 - len(PAL.PALETTE))


def out_dir(*parts):
    """Path under the shared out/, creating it. e.g. out_dir('rock') -> .../out/rock."""
    d = os.path.join(OUT, *parts)
    os.makedirs(d, exist_ok=True)
    return d


def slot(rgb):
    """The 1-based AAP palette index a color snaps to (OKLab nearest)."""
    return PAL.PALETTE.index(PAL.nearest(rgb)) + 1


class Model:
    """One voxel model: `size` (sx, sy, sz), `vox` {(x, y, z): 1-based palette index}, `pal` the
    256 (r, g, b) of the RGBA chunk (None when the file has none — the runtime rejects that).
    `models` counts the SIZE chunks the file held (the runtime uses the first only)."""

    def __init__(self, size, vox=None, pal=None):
        self.size = tuple(size)
        self.vox = dict(vox or {})
        self.pal = list(pal) if pal else None
        self.models = 1

    def color(self, idx):
        return self.pal[idx - 1]

    def colors(self):
        """Sorted (index, rgb) pairs of the palette entries in use."""
        return [(i, self.color(i)) for i in sorted(set(self.vox.values()))]

    def extent(self):
        """((x0, y0, z0), (x1, y1, z1)) of the voxels, inclusive; None when empty."""
        if not self.vox:
            return None
        xs, ys, zs = zip(*self.vox)
        return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))

    def content(self):
        """Tight voxel extent (w, d, h) — what ColonySpawn.footprint sizes a collider from."""
        e = self.extent()
        if e is None:
            return (0, 0, 0)
        (x0, y0, z0), (x1, y1, z1) = e
        return (x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1)


def read(path):
    """The first model of a .vox as a Model. ValueError on a malformed file."""
    b = open(path, "rb").read()
    if b[:4] != b"VOX ":
        raise ValueError(f"{path}: not a .vox file")
    off, sizes, xyzi, pal = 8, [], [], None
    while off + 12 <= len(b):
        cid = b[off:off + 4]
        n, _ = struct.unpack_from("<ii", b, off + 4)
        off += 12
        body = b[off:off + n]
        if cid == b"SIZE":
            sizes.append(struct.unpack_from("<iii", body))
        elif cid == b"XYZI":
            cnt = struct.unpack_from("<i", body)[0]
            xyzi.append([struct.unpack_from("<BBBB", body, 4 + 4 * i) for i in range(cnt)])
        elif cid == b"RGBA":
            pal = [struct.unpack_from("<BBB", body, 4 * i) for i in range(256)]
        off += n   # MAIN has n = 0, so its children are walked inline
    if not sizes or not xyzi:
        raise ValueError(f"{path}: no SIZE/XYZI model")
    m = Model(sizes[0], {(x, y, z): i for x, y, z, i in xyzi[0]}, pal)
    m.models = len(sizes)
    return m


def write(path, m):
    """Write a Model as a minimal SIZE + XYZI + RGBA file, voxels in (x, y, z) order (deterministic)."""
    if m.pal is None:
        raise ValueError("a model needs a palette to be written (the runtime requires RGBA)")
    sx, sy, sz = m.size
    for (x, y, z), i in m.vox.items():
        if not (0 <= x < sx and 0 <= y < sy and 0 <= z < sz) or not (1 <= i <= 255):
            raise ValueError(f"voxel {(x, y, z)} index {i} outside the {m.size} canvas / palette")

    def chunk(cid, body, children=b""):
        return cid + struct.pack("<ii", len(body), len(children)) + body + children

    items = sorted(m.vox.items())
    kids = (chunk(b"SIZE", struct.pack("<iii", sx, sy, sz))
            + chunk(b"XYZI", struct.pack("<i", len(items))
                    + b"".join(struct.pack("<BBBB", x, y, z, i) for (x, y, z), i in items))
            + chunk(b"RGBA", b"".join(struct.pack("<BBBB", r, g, b, 255) for r, g, b in m.pal)))
    with open(path, "wb") as f:
        f.write(b"VOX " + struct.pack("<i", 150) + chunk(b"MAIN", b"", kids))


def write_png(path, width, height, pixels):
    """RGBA PNG from a flat (r, g, b, a) list (the preview renderer's output)."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw += bytes(pixels[y * width + x])

    def chunk(typ, d):
        return (struct.pack(">I", len(d)) + typ + d +
                struct.pack(">I", binascii.crc32(typ + d) & 0xffffffff))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n"
                + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
                + chunk(b"IEND", b""))


def files(args, default):
    """Expand CLI args (files or directories) to sorted .vox paths; `default` when none given."""
    out = []
    for a in args or [default]:
        if os.path.isdir(a):
            out += sorted(os.path.join(a, f) for f in os.listdir(a) if f.endswith(".vox"))
        else:
            out.append(a)
    return out
