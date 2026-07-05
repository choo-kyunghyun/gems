"""vox2vbuf - bake a MagicaVoxel .vox model into a GameMaker vertex-buffer binary.

The VOLUME art pipeline (ROADMAP.md - Art Rework): author furniture in MagicaVoxel,
commit the .vox as editable source, bake to a raw vertex stream the runtime loads with
buffer_load -> vertex_create_buffer_from_buffer (RenderVolume draws it in the depth pass).

Vertex layout (must mirror RenderVolume's declared format EXACTLY, little-endian):
    position 3 x f32 | colour 4 x u8 (RGBA) | texcoord 2 x f32 (zeros, untextured)
    = 24 bytes per vertex, pr_trianglelist.

Coordinate map (MagicaVoxel is z-up):  game x = vox x,  game y = vox y (+y = south/front),
game z = -vox z (up is negative z, the RenderBillboard convention). The mesh is centered on
the footprint (Position = footprint center), feet at z = 0.

Only the two face orientations the fixed-yaw pitched camera can see are emitted:
    TOP faces   (air above)          at brightness 1.00
    SOUTH faces (air to +y)          at brightness 0.80  (one implied sun, baked)

Usage:  python tools/vox-kit/vox2vbuf.py <input.vox> <output.vbuf>
Zero dependencies (stdlib only), deterministic output.
"""

import struct
import sys

TOP_SHADE = 1.00
SOUTH_SHADE = 0.80


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


def bake(path_in, path_out):
    sx, sy, sz, voxels, palette = parse_vox(path_in)
    ox, oy = sx / 2.0, sy / 2.0  # center the footprint on Position

    verts = bytearray()

    def vert(x, y, z, r, g, b):
        verts.extend(struct.pack("<fffBBBBff", x, y, z, r, g, b, 255, 0.0, 0.0))

    def quad(p1, p2, p3, p4, rgb):
        # two triangles, consistent order (cull mode is off in-engine)
        for p in (p1, p2, p3, p1, p3, p4):
            vert(p[0], p[1], p[2], rgb[0], rgb[1], rgb[2])

    quads = 0
    for (x, y, z), c in voxels.items():
        pr, pg, pb, _pa = palette[c - 1]  # XYZI color index is 1-based
        gx, gy = x - ox, y - oy
        if (x, y, z + 1) not in voxels:  # TOP face, lying at height z+1
            s = TOP_SHADE
            rgb = (int(pr * s), int(pg * s), int(pb * s))
            h = -(z + 1)
            quad(
                (gx, gy, h),
                (gx + 1, gy, h),
                (gx + 1, gy + 1, h),
                (gx, gy + 1, h),
                rgb,
            )
            quads += 1
        if (x, y + 1, z) not in voxels:  # SOUTH face (faces the camera)
            s = SOUTH_SHADE
            rgb = (int(pr * s), int(pg * s), int(pb * s))
            quad(
                (gx, gy + 1, -(z + 1)),
                (gx + 1, gy + 1, -(z + 1)),
                (gx + 1, gy + 1, -z),
                (gx, gy + 1, -z),
                rgb,
            )
            quads += 1

    with open(path_out, "wb") as f:
        f.write(verts)
    n = len(verts) // 24
    print(
        f"{path_in} -> {path_out}: {sx}x{sy}x{sz} vox, {len(voxels)} voxels, "
        f"{quads} faces, {n} verts, {len(verts)} bytes"
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: vox2vbuf.py <input.vox> <output.vbuf>")
    bake(sys.argv[1], sys.argv[2])
