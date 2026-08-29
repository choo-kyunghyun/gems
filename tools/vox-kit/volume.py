#!/usr/bin/env python3
"""volume — a 3D canvas of palette tones for prototype voxel props (pure Python stdlib).

The voxel analog of pixel-art-kit's Canvas: place solids in AAP-64 tones on an sx x sy x sz grid
(x east, y south = the front, z up from the ground at z = 0; 1 voxel = 1 world px), then `model()`
snaps every color onto the palette and hands back a voxlib.Model to write. Shading is NOT authored:
shMeshlit lights the flat albedo live (tops a step brighter than the south face, the north side in
ambient — what `preview` shows), so a voxel carries only its base tone. `speckle` is the one
surface treatment, the grain that keeps a wide flat face from reading as plastic.

    import os, volume as VOL, voxlib as V, palette as PAL
    v = VOL.Volume(32, 32, 32)
    v.box(4, 4, 0, 27, 27, 23, PAL.tone("leather", 3))     # body (inclusive corners)
    v.box(4, 4, 10, 27, 27, 11, PAL.tone("steel", 2))       # strapping band
    v.speckle(PAL.tone("leather", 3), 0.06, seed=7)         # plywood grain
    V.write(os.path.join(V.out_dir("crate"), "plywood_crate.vox"), v.model())
"""
import os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voxlib as V
import palette as PAL

NEIGHBORS = ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))


class Volume:
    def __init__(self, sx, sy, sz):
        self.size = (sx, sy, sz)
        self.vox = {}   # (x, y, z) -> (r, g, b)

    def inside(self, x, y, z):
        sx, sy, sz = self.size
        return 0 <= x < sx and 0 <= y < sy and 0 <= z < sz

    def set(self, x, y, z, color):
        if self.inside(x, y, z):
            self.vox[(x, y, z)] = tuple(color[:3])

    def get(self, x, y, z):
        return self.vox.get((x, y, z))

    def clear(self, x, y, z):
        self.vox.pop((x, y, z), None)

    # ---- solids (all corners inclusive, clipped to the canvas) ----------------

    def box(self, x0, y0, z0, x1, y1, z1, color):
        for z in range(min(z0, z1), max(z0, z1) + 1):
            for y in range(min(y0, y1), max(y0, y1) + 1):
                for x in range(min(x0, x1), max(x0, x1) + 1):
                    self.set(x, y, z, color)

    def cyl(self, cx, cy, z0, z1, r, color):
        """Vertical cylinder: axis through (cx, cy) in voxel units (a .5 centers on a voxel), radius r
        measured to voxel centers."""
        rr = r * r
        for z in range(min(z0, z1), max(z0, z1) + 1):
            for y in range(int(cy - r) - 1, int(cy + r) + 2):
                for x in range(int(cx - r) - 1, int(cx + r) + 2):
                    if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rr:
                        self.set(x, y, z, color)

    def sphere(self, cx, cy, cz, r, color):
        rr = r * r
        for z in range(int(cz - r) - 1, int(cz + r) + 2):
            for y in range(int(cy - r) - 1, int(cy + r) + 2):
                for x in range(int(cx - r) - 1, int(cx + r) + 2):
                    if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 + (z + 0.5 - cz) ** 2 <= rr:
                        self.set(x, y, z, color)

    def mirror_x(self):
        """Copy the west half onto the east (about the canvas midline) — a symmetric prop in half
        the calls. Draw x < sx / 2, then mirror."""
        sx = self.size[0]
        for (x, y, z), c in list(self.vox.items()):
            if x < sx / 2:
                self.set(sx - 1 - x, y, z, c)

    # ---- surface ---------------------------------------------------------------

    def exposed(self):
        """Voxels with at least one empty 6-neighbor (the ones a face is emitted for)."""
        out = []
        for (x, y, z) in self.vox:
            for dx, dy, dz in NEIGHBORS:
                if (x + dx, y + dy, z + dz) not in self.vox:
                    out.append((x, y, z))
                    break
        return out

    def speckle(self, color, density, seed, step=-1):
        """Re-tone a `density` share of the exposed voxels of `color` one ramp step (default darker):
        grain on plywood, oxide on steel, lichen on basalt. Deterministic per seed."""
        rng = random.Random(seed)
        color, alt = tuple(color[:3]), PAL.step(color, step)
        for p in sorted(self.exposed()):
            if self.vox[p] == color and rng.random() < density:
                self.vox[p] = alt

    # ---- out -------------------------------------------------------------------

    def model(self):
        """A voxlib.Model on the AAP palette, every color snapped to its nearest entry."""
        return V.Model(self.size, {p: V.slot(c) for p, c in self.vox.items()}, V.AAP)

    def write(self, path):
        V.write(path, self.model())
