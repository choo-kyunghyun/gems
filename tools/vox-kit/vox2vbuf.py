"""vox2vbuf - bake a MagicaVoxel .vox model into a GameMaker vertex-buffer binary.

The VOLUME art pipeline (ROADMAP.md - Art Rework): author furniture in MagicaVoxel,
commit the .vox as editable source, bake to a raw vertex stream the runtime loads with
buffer_load -> vertex_create_buffer_from_buffer (RenderMesh draws it in the depth pass).

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

Usage:  python tools/vox-kit/vox2vbuf.py <input.vox> <output.vbuf>
Zero dependencies (stdlib only), deterministic output.
"""

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


def bake(path_in, path_out):
    sx, sy, sz, voxels, palette = parse_vox(path_in)
    ox, oy = sx / 2.0, sy / 2.0  # center the footprint on Position

    verts = bytearray()

    def vert(x, y, z, r, g, b, nu, nv):
        verts.extend(struct.pack("<fffBBBBff", x, y, z, r, g, b, 255, nu, nv))

    def quad(p1, p2, p3, p4, rgb, nu, nv):
        # two triangles, consistent order (cull mode is off in-engine)
        for p in (p1, p2, p3, p1, p3, p4):
            vert(p[0], p[1], p[2], rgb[0], rgb[1], rgb[2], nu, nv)

    quads = 0
    for (x, y, z), c in voxels.items():
        rgb = palette[c - 1][:3]  # XYZI color index is 1-based; raw albedo
        gx, gy = x - ox, y - oy
        if (x, y, z + 1) not in voxels:  # TOP face, lying at height z+1
            h = -(z + 1)
            quad(
                (gx, gy, h),
                (gx + 1, gy, h),
                (gx + 1, gy + 1, h),
                (gx, gy + 1, h),
                rgb,
                0.0,
                0.0,  # normal (0, 0, -1)
            )
            quads += 1
        if (x, y + 1, z) not in voxels:  # SOUTH face (faces the camera when unrotated)
            quad(
                (gx, gy + 1, -(z + 1)),
                (gx + 1, gy + 1, -(z + 1)),
                (gx + 1, gy + 1, -z),
                (gx, gy + 1, -z),
                rgb,
                0.0,
                1.0,  # normal (0, 1, 0)
            )
            quads += 1
        if (x, y - 1, z) not in voxels:  # NORTH face (visible under a runtime yaw)
            quad(
                (gx + 1, gy, -(z + 1)),
                (gx, gy, -(z + 1)),
                (gx, gy, -z),
                (gx + 1, gy, -z),
                rgb,
                0.0,
                -1.0,  # normal (0, -1, 0)
            )
            quads += 1
        if (x + 1, y, z) not in voxels:  # EAST face
            quad(
                (gx + 1, gy + 1, -(z + 1)),
                (gx + 1, gy, -(z + 1)),
                (gx + 1, gy, -z),
                (gx + 1, gy + 1, -z),
                rgb,
                1.0,
                0.0,  # normal (1, 0, 0)
            )
            quads += 1
        if (x - 1, y, z) not in voxels:  # WEST face
            quad(
                (gx, gy, -(z + 1)),
                (gx, gy + 1, -(z + 1)),
                (gx, gy + 1, -z),
                (gx, gy, -z),
                rgb,
                -1.0,
                0.0,  # normal (-1, 0, 0)
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
