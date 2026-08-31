"""Triangle-soup container + the `.mesh` bake the runtime `Poly` script loads (the 24 B/vertex
stream RenderMesh's vertex format declares, behind a 24 B header), plus the author->game
transform every consumer shares. The palette is the project's (`tools/palette`)."""
import os
import struct
import sys
import math

KIT = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(KIT))
MESHES = os.path.join(ROOT, "datafiles", "meshes")
sys.path.insert(0, os.path.join(os.path.dirname(KIT), "palette"))

MAGIC = b"PMSH"
VERSION = 1
HEADER = struct.Struct("<4sII3f")  # magic, version, vertex count, content w/d/h
VERTEX = struct.Struct("<3f4B2f")  # game x,y,z + r,g,b,255 + packed normal nx,ny


class Mesh:
    """AUTHOR space: x east, y south, z UP, feet at z = 0, footprint centered on the origin.
    `tris` = [(p1, p2, p3, (r, g, b))] wound CCW seen from OUTSIDE (shape.py emits it; the
    face normal derives from the winding)."""

    def __init__(self):
        self.tris = []

    def tri(self, p1, p2, p3, color):
        self.tris.append((tuple(p1), tuple(p2), tuple(p3), tuple(color[:3])))

    def quad(self, p1, p2, p3, p4, color):
        self.tri(p1, p2, p3, color)
        self.tri(p1, p3, p4, color)

    def extents(self):
        """((min x, y, z), (max x, y, z)) over every vertex, author space."""
        xs = [p[0] for t in self.tris for p in t[:3]]
        ys = [p[1] for t in self.tris for p in t[:3]]
        zs = [p[2] for t in self.tris for p in t[:3]]
        return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))

    def content(self):
        """Tight (w, d, h) — what ColonySpawn.footprint derives the collider from."""
        lo, hi = self.extents()
        return (hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])

    def write(self, path):
        """Bake to `.mesh`. Raises on a color off the palette or a bottom-facing tri."""
        import palette as PAL
        data = []
        for t in game_tris(self):
            if t is None:
                raise ValueError("degenerate or bottom-facing triangle")
            (g1, g2, g3), color, (nu, nv) = t
            if color not in PAL.PALETTE:
                raise ValueError(f"color {color} not on AAP-64")
            for p in (g1, g2, g3):
                data.append(VERTEX.pack(p[0], p[1], p[2], *color, 255, nu, nv))
        w, d, h = self.content()
        with open(path, "wb") as f:
            f.write(HEADER.pack(MAGIC, VERSION, len(data), w, d, h))
            f.write(b"".join(data))


def normal(p1, p2, p3):
    """Author-space unit face normal off the CCW-from-outside winding; None when degenerate."""
    ux, uy, uz = (p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2])
    vx, vy, vz = (p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2])
    nx, ny, nz = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
    l = math.sqrt(nx * nx + ny * ny + nz * nz)
    if l < 1e-9:
        return None
    return (nx / l, ny / l, nz / l)


def game_tris(mesh):
    """Per tri: ((p1, p2, p3) game space, color, packed normal (nu, nv)) — or None for a
    degenerate tri. Game space = (x, y, -z); an UNDERSIDE normal (author nz < 0 — e.g. a
    barrel's lower bulge) clamps to horizontal, since the packing (nz = -sqrt(1-u^2-v^2),
    shMeshlit.vsh) has no downward hemisphere and the camera never sees one; a straight-down
    face is unrepresentable -> None."""
    out = []
    for p1, p2, p3, color in mesh.tris:
        n = normal(p1, p2, p3)
        if n is None:
            out.append(None)
            continue
        nx, ny, nz = n
        if nz < 0:
            l = math.sqrt(nx * nx + ny * ny)
            if l < 1e-6:
                out.append(None)
                continue
            nx, ny, nz = nx / l, ny / l, 0.0
        s = math.sqrt(nx * nx + ny * ny)
        if s > 1:  # float guard: keep u^2+v^2 <= 1 for the shader's sqrt
            nx, ny = nx / s, ny / s
        g = tuple((p[0], p[1], 0.0 - p[2]) for p in (p1, p2, p3))
        out.append((g, color, (nx, ny)))
    return out


def read(path):
    """Parse a `.mesh` back: (content (w, d, h), [((p1, p2, p3) game space, color, (nu, nv))])."""
    with open(path, "rb") as f:
        raw = f.read()
    magic, version, count, w, d, h = HEADER.unpack_from(raw, 0)
    if magic != MAGIC or version != VERSION:
        raise ValueError(f"{path}: not a PMSH v{VERSION} file")
    if len(raw) != HEADER.size + count * VERTEX.size:
        raise ValueError(f"{path}: body size mismatch")
    verts = [VERTEX.unpack_from(raw, HEADER.size + i * VERTEX.size) for i in range(count)]
    tris = []
    for i in range(0, count, 3):
        v = verts[i : i + 3]
        tris.append((tuple(tuple(x[:3]) for x in v), tuple(v[0][3:6]), (v[0][7], v[0][8])))
    return (w, d, h), tris


def out_dir(name):
    d = os.path.join(KIT, "out", name)
    os.makedirs(d, exist_ok=True)
    return d
