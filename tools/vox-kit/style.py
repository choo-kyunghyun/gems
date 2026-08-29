#!/usr/bin/env python3
"""style — the reference board: one of everything, built through the kit's own pipeline.

A plywood crate (box), a steel drum (cylinder) and a basalt boulder (spheres), all on AAP-64 ramps
with `speckle` grain, written as .vox and rendered under the game camera onto one board — what a
new voxel prop should sit beside. The models also land as .vox in out/style/ for `lint.py`.

Usage:  python style.py   # -> out/style/board.png + plywood_crate.vox, steel_drum.vox, basalt_boulder.vox
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voxlib as V, volume as VOL, preview as PV
import palette as PAL


def plywood_crate():
    """32^3 supply crate: plank seams, a steel strapping band, a hazard label on the front."""
    v = VOL.Volume(32, 32, 32)
    body = PAL.tone("leather", 3)
    v.box(4, 4, 0, 27, 27, 23, body)
    for z in (7, 15):                                     # plank seams
        v.box(4, 4, z, 27, 27, z, PAL.tone("leather", 2))
    v.box(4, 4, 10, 27, 27, 11, PAL.tone("steel", 2))     # strapping band
    v.box(12, 27, 14, 19, 27, 17, PAL.tone("hazard", 1))  # label, south face
    v.box(14, 27, 15, 17, 27, 16, PAL.INK)
    v.speckle(body, 0.06, seed=7)                         # grain
    return v


def steel_drum():
    """32^3 drum: ribbed shell, a hazard band, a lighter lid, oxide freckles."""
    v = VOL.Volume(32, 32, 32)
    shell = PAL.tone("steel", 2)
    v.cyl(16, 16, 0, 27, 10, shell)
    for z in (8, 19):                                     # ribs
        v.cyl(16, 16, z, z + 1, 10.6, PAL.tone("steel", 1))
    v.cyl(16, 16, 12, 15, 10.3, PAL.tone("hazard", 1))    # band
    v.cyl(16, 16, 27, 27, 10, PAL.tone("steel", 3))       # lid
    v.speckle(shell, 0.05, seed=7)
    return v


def basalt_boulder():
    """32^3 boulder: two sunk spheres, darker pits and a few lit facets."""
    v = VOL.Volume(32, 32, 32)
    rock = PAL.tone("steel", 1)
    v.sphere(15, 17, 9, 12, rock)
    v.sphere(22, 12, 7, 8, rock)
    v.speckle(rock, 0.15, seed=7, step=-1)                # pits
    v.speckle(rock, 0.06, seed=8, step=+1)                # facets
    return v


PROPS = {
    "plywood_crate": plywood_crate,
    "steel_drum": steel_drum,
    "basalt_boulder": basalt_boulder,
}


def main():
    out = V.out_dir("style")
    images = []
    for name, build in PROPS.items():
        m = build().model()
        V.write(os.path.join(out, name + ".vox"), m)
        images.append(PV.render(m))
    w, h, px = PV.sheet(images, cols=len(images))
    V.write_png(os.path.join(out, "board.png"), w, h, px)
    print("out/style: board.png, " + ", ".join(f"{n}.vox" for n in PROPS))


if __name__ == "__main__":
    main()
