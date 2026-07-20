"""vox2vbuf - bake a MagicaVoxel .vox model into a GameMaker vertex-buffer binary.

The VOLUME art pipeline (see RenderMesh's JSDoc): author furniture in
MagicaVoxel, commit the .vox as editable source, bake to a raw vertex stream the runtime
loads with buffer_load -> vertex_create_buffer_from_buffer (RenderMesh draws it in the
depth pass).

Vertex layout (must mirror RenderMesh's declared format EXACTLY, little-endian):
    position 3 x f32 | colour 4 x u8 (RGBA albedo, UNSHADED palette color)
    | texcoord 2 x f32 (PACKED FACE NORMAL: u = nx, v = ny; the shader derives
      nz = -sqrt(max(0, 1 - u^2 - v^2)) -- valid because no BOTTOM face is ever
      emitted, so nz is always <= 0 in the up-is-negative-z convention)
    = 24 bytes per vertex, pr_trianglelist.

Shading is NOT baked: sh_meshlit lights the albedo live (directional sun + point
lights) from the packed normals. (Pre-lighting versions baked top x1.00 / south
x0.80 into the colour; re-run this converter after pulling to refresh old .vbuf.)

Coordinate map (MagicaVoxel is z-up):  game x = vox x,  game y = vox y (+y = south/front),
game z = -vox z (up is negative z, the RenderBillboard convention). The mesh is centered on
the footprint (Position = footprint center), feet at z = 0.

TOP + all FOUR side orientations are emitted, so a runtime Mesh yaw (`Mesh.yaw`) shows a
solid model from any facing (sh_meshlit rotates the packed normals by mat3(world)):
    TOP faces   (air above,  normal (0, 0, -1) -> packed (0, 0))
    SOUTH faces (air to +y,  normal (0, 1, 0)  -> packed (0, 1))
    NORTH faces (air to -y,  normal (0, -1, 0) -> packed (0, -1))
    EAST faces  (air to +x,  normal (1, 0, 0)  -> packed (1, 0))
    WEST faces  (air to -x,  normal (-1, 0, 0) -> packed (-1, 0))
BOTTOM faces are never emitted (nz > 0 is unrepresentable in the packing, and a bottom can
only show past a ~90-degree tip); unrotated meshes render identically to the old top+south
bake (north faces hide behind the body via the depth test, east/west are edge-on).

Exposed faces are GREEDY-MESHED per orientation plane: coplanar exposed faces of the same
palette color merge into one quad (flat vertex color + constant per-orientation normal, so
the merged output renders identically to the old one-quad-per-voxel bake at a fraction of
the vertex count).

Alongside the .vbuf, a shared MANIFEST (<outdir>/meshes.json, one JSON object keyed by
model name) records each bake's dimensions:
    "wooden_crate": { "size": [sx, sy, sz], "content": [w, h, d] }
`size` is the .vox canvas, `content` the tight non-empty-voxel extent (x, y, z order,
voxels = world px). The runtime derives mesh-prop colliders from `content`
(RpgSpawn.footprint), replacing hand-measured tables -- register meshes.json once in
gems.yyp IncludedFiles like any .vbuf; re-bakes only rewrite content.

Usage:  python tools/vox-kit/vox2vbuf.py <input.vox> <output.vbuf>
        python tools/vox-kit/vox2vbuf.py --all   (bake every templates/*.vox -> datafiles/meshes/)
Zero dependencies (stdlib only), deterministic output.
"""

import json
import os
import struct
import sys


def parse_vox(path):
    """First model only: returns (sx, sy, sz, {(x,y,z): color_index}, palette[256])."""
    data = open(path, "rb").read()
    if data[:4] != b"VOX ":
        raise SystemExit(f"not a .vox file: {path}")
    size = None
    voxels = None
    palette = None
    sizes_seen = 0

    def walk(off, end):
        nonlocal size, voxels, palette, sizes_seen
        while off < end:
            cid = data[off : off + 4]
            n, m = struct.unpack_from("<ii", data, off + 4)
            content = data[off + 12 : off + 12 + n]
            if cid == b"SIZE":
                sizes_seen += 1
                if size is None:
                    size = struct.unpack("<iii", content)
            elif cid == b"XYZI" and voxels is None:
                (cnt,) = struct.unpack_from("<i", content, 0)
                voxels = {}
                for i in range(cnt):
                    x, y, z, c = struct.unpack_from("<BBBB", content, 4 + i * 4)
                    voxels[(x, y, z)] = c
            elif cid == b"RGBA":
                palette = [
                    struct.unpack_from("<BBBB", content, i * 4) for i in range(256)
                ]
            if m > 0:
                walk(off + 12 + n, off + 12 + n + m)
            off += 12 + n + m

    walk(20, len(data))  # skip "VOX " + version + MAIN header
    if size is None or voxels is None:
        raise SystemExit("no SIZE/XYZI model found")
    if palette is None:
        raise SystemExit("no RGBA palette chunk (re-save from MagicaVoxel)")
    if sizes_seen > 1:
        print(f"warning: {sizes_seen} models in file - baking the FIRST only")
    return size[0], size[1], size[2], voxels, palette


def greedy_rects(cells):
    """Merge {(u,v): color} cells into maximal same-color rects: [(u0, v0, w, h, color)].

    Row-major scan (v outer), extend along +u first, then grow +v while the whole run
    matches. Deterministic for a given cell set."""
    out = []
    done = set()
    for key in sorted(cells, key=lambda k: (k[1], k[0])):
        if key in done:
            continue
        u0, v0 = key
        c = cells[key]
        w = 1
        while (u0 + w, v0) in cells and (u0 + w, v0) not in done and cells[
            (u0 + w, v0)
        ] == c:
            w += 1
        h = 1
        while all(
            (u0 + i, v0 + h) in cells
            and (u0 + i, v0 + h) not in done
            and cells[(u0 + i, v0 + h)] == c
            for i in range(w)
        ):
            h += 1
        for i in range(w):
            for j in range(h):
                done.add((u0 + i, v0 + j))
        out.append((u0, v0, w, h, c))
    return out


def bake(path_in, path_out, manifest=None):
    sx, sy, sz, voxels, palette = parse_vox(path_in)
    ox, oy = sx / 2.0, sy / 2.0  # center the footprint on Position

    verts = bytearray()

    def vert(x, y, z, r, g, b, nu, nv):
        verts.extend(struct.pack("<fffBBBBff", x, y, z, r, g, b, 255, nu, nv))

    def quad(p1, p2, p3, p4, c, nu, nv):
        # two triangles, consistent order (cull mode is off in-engine)
        rgb = palette[c - 1][:3]  # XYZI color index is 1-based; raw albedo
        for p in (p1, p2, p3, p1, p3, p4):
            vert(p[0], p[1], p[2], rgb[0], rgb[1], rgb[2], nu, nv)

    quads = 0

    # Per-orientation exposed-face sets, greedy-merged per plane. Plane iteration and the
    # in-plane row-major scan are both sorted, so output is deterministic.
    # TOP: plane per z, cells keyed (x, y)
    for z in range(sz):
        cells = {
            (x, y): c
            for (x, y, vz), c in voxels.items()
            if vz == z and (x, y, z + 1) not in voxels
        }
        for x0, y0, w, h, c in greedy_rects(cells):
            gx, gy, hh = x0 - ox, y0 - oy, -(z + 1)
            quad(
                (gx, gy, hh),
                (gx + w, gy, hh),
                (gx + w, gy + h, hh),
                (gx, gy + h, hh),
                c,
                0.0,
                0.0,  # normal (0, 0, -1)
            )
            quads += 1

    # SOUTH: plane per y, cells keyed (x, z), face lies at y+1
    for y in range(sy):
        cells = {
            (x, z): c
            for (x, vy, z), c in voxels.items()
            if vy == y and (x, y + 1, z) not in voxels
        }
        for x0, z0, w, h, c in greedy_rects(cells):
            gx, gy = x0 - ox, y + 1 - oy
            quad(
                (gx, gy, -(z0 + h)),
                (gx + w, gy, -(z0 + h)),
                (gx + w, gy, -z0),
                (gx, gy, -z0),
                c,
                0.0,
                1.0,  # normal (0, 1, 0)
            )
            quads += 1

    # NORTH: plane per y, cells keyed (x, z), face lies at y
    for y in range(sy):
        cells = {
            (x, z): c
            for (x, vy, z), c in voxels.items()
            if vy == y and (x, y - 1, z) not in voxels
        }
        for x0, z0, w, h, c in greedy_rects(cells):
            gx, gy = x0 - ox, y - oy
            quad(
                (gx + w, gy, -(z0 + h)),
                (gx, gy, -(z0 + h)),
                (gx, gy, -z0),
                (gx + w, gy, -z0),
                c,
                0.0,
                -1.0,  # normal (0, -1, 0)
            )
            quads += 1

    # EAST: plane per x, cells keyed (y, z), face lies at x+1
    for x in range(sx):
        cells = {
            (y, z): c
            for (vx, y, z), c in voxels.items()
            if vx == x and (x + 1, y, z) not in voxels
        }
        for y0, z0, w, h, c in greedy_rects(cells):
            gx, gy = x + 1 - ox, y0 - oy
            quad(
                (gx, gy + w, -(z0 + h)),
                (gx, gy, -(z0 + h)),
                (gx, gy, -z0),
                (gx, gy + w, -z0),
                c,
                1.0,
                0.0,  # normal (1, 0, 0)
            )
            quads += 1

    # WEST: plane per x, cells keyed (y, z), face lies at x
    for x in range(sx):
        cells = {
            (y, z): c
            for (vx, y, z), c in voxels.items()
            if vx == x and (x - 1, y, z) not in voxels
        }
        for y0, z0, w, h, c in greedy_rects(cells):
            gx, gy = x - ox, y0 - oy
            quad(
                (gx, gy, -(z0 + h)),
                (gx, gy + w, -(z0 + h)),
                (gx, gy + w, -z0),
                (gx, gy, -z0),
                c,
                -1.0,
                0.0,  # normal (-1, 0, 0)
            )
            quads += 1

    with open(path_out, "wb") as f:
        f.write(verts)

    # tight content extent (x, y, z) — the manifest's collider-relevant dims
    xs = [v[0] for v in voxels]
    ys = [v[1] for v in voxels]
    zs = [v[2] for v in voxels]
    content = (max(xs) - min(xs) + 1, max(ys) - min(ys) + 1, max(zs) - min(zs) + 1)
    if manifest is not None:
        name = os.path.splitext(os.path.basename(path_out))[0]
        manifest[name] = {"size": [sx, sy, sz], "content": list(content)}

    n = len(verts) // 24
    print(
        f"{path_in} -> {path_out}: {sx}x{sy}x{sz} vox, {len(voxels)} voxels, "
        f"content {content[0]}x{content[1]}x{content[2]}, "
        f"{quads} faces, {n} verts, {len(verts)} bytes"
    )


def manifest_path(out_dir):
    return os.path.join(out_dir, "meshes.json")


def load_manifest(out_dir):
    path = manifest_path(out_dir)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_manifest(out_dir, manifest):
    path = manifest_path(out_dir)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump({k: manifest[k] for k in sorted(manifest)}, f, indent=2)
        f.write("\n")
    print(f"manifest: {path} ({len(manifest)} models)")


def main(argv):
    root = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if len(argv) == 2 and argv[1] == "--all":
        tpl_dir = os.path.join(root, "tools", "vox-kit", "templates")
        out_dir = os.path.join(root, "datafiles", "meshes")
        manifest = {}
        for fname in sorted(os.listdir(tpl_dir)):
            if not fname.endswith(".vox"):
                continue
            name = os.path.splitext(fname)[0]
            bake(
                os.path.join(tpl_dir, fname),
                os.path.join(out_dir, name + ".vbuf"),
                manifest,
            )
        save_manifest(out_dir, manifest)
    elif len(argv) == 3:
        out_dir = os.path.dirname(os.path.abspath(argv[2]))
        manifest = load_manifest(out_dir)
        bake(argv[1], argv[2], manifest)
        save_manifest(out_dir, manifest)
    else:
        raise SystemExit(
            "usage: vox2vbuf.py <input.vox> <output.vbuf>  |  vox2vbuf.py --all"
        )


if __name__ == "__main__":
    main(sys.argv)
