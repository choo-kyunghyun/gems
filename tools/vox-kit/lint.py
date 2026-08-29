#!/usr/bin/env python3
"""lint — check .vox files against the runtime's contract and the style (pure Python stdlib).

What scripts/Vox demands of a shipped file, and what the style demands of its look, as one pass:

  error  not a .vox / no model          the runtime logs an error and draws nothing
  error  no RGBA palette                 same — re-save from MagicaVoxel or write through voxlib
  error  color outside AAP-64            the style rule; `quantize.py` fixes it
  warn   more than one model             the runtime uses the FIRST only
  warn   lowest voxel above z = 0        the model floats that many px off the ground
  warn   content off the canvas center   the runtime centers the CANVAS on the footprint, so the
                                         prop draws that far off its collider
  warn   detached parts                  voxel groups not connected (6-way) to the grounded one
  info   size / voxels / content / footprint — the collider ColonySpawn.footprint derives:
                                         max(8, w - 2) x max(8, d - 2)

Usage:  python lint.py [file.vox | dir ...]     # default: datafiles/meshes; exit 1 on any error
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voxlib as V
import palette as PAL
from volume import NEIGHBORS

MESHES = os.path.join(os.path.dirname(os.path.dirname(V.KIT)), "datafiles", "meshes")


def components(vox):
    """6-connected groups of voxel positions, largest first."""
    seen, groups = set(), []
    for start in sorted(vox):
        if start in seen:
            continue
        group, stack = [], [start]
        seen.add(start)
        while stack:
            p = stack.pop()
            group.append(p)
            for dx, dy, dz in NEIGHBORS:
                q = (p[0] + dx, p[1] + dy, p[2] + dz)
                if q in vox and q not in seen:
                    seen.add(q)
                    stack.append(q)
        groups.append(group)
    return sorted(groups, key=len, reverse=True)


def check(path):
    """(errors, warnings, info) for one file, each a list of strings."""
    errors, warns, info = [], [], []
    try:
        m = V.read(path)
    except ValueError as e:
        return [str(e)], warns, info
    if m.pal is None:
        errors.append("no RGBA palette (re-save from MagicaVoxel)")
    if m.models > 1:
        warns.append(f"{m.models} models in the file — the runtime uses the first only")
    if not m.vox:
        errors.append("the first model is empty")
        return errors, warns, info

    if m.pal is not None:
        foreign = [(i, c) for i, c in m.colors() if c not in PAL.INDEX]
        for i, c in foreign:
            name, t = PAL.locate(c)
            errors.append("index %d #%02x%02x%02x is outside AAP-64 (nearest: %s %d)" % (i, *c, name, t))

    (x0, y0, z0), (x1, y1, z1) = m.extent()
    w, d, h = m.content()
    sx, sy, sz = m.size
    if z0 > 0:
        warns.append(f"lowest voxel at z = {z0}: the model floats {z0} px above the ground")
    offx = (x0 + x1 + 1) / 2 - sx / 2
    offy = (y0 + y1 + 1) / 2 - sy / 2
    if abs(offx) > 1 or abs(offy) > 1:
        warns.append(f"content center is ({offx:+.1f}, {offy:+.1f}) px off the canvas center")
    groups = components(m.vox)
    grounded = [g for g in groups if any(p[2] == z0 for p in g)]
    loose = len(groups) - len(grounded)
    if loose:
        n = sum(len(g) for g in groups if g not in grounded)
        warns.append(f"{loose} detached part(s), {n} voxels, not connected to the grounded body")

    fw, fd = max(8, w - 2), max(8, d - 2)
    info.append(f"size {sx}x{sy}x{sz}  voxels {len(m.vox)}  colors {len(m.colors())}  "
                f"content {w}x{d}x{h}  footprint {fw}x{fd}")
    return errors, warns, info


def main():
    paths = V.files(sys.argv[1:], MESHES)
    bad = 0
    for p in paths:
        errors, warns, info = check(p)
        flag = "ERR " if errors else ("warn" if warns else " ok ")
        print(f"{flag} {os.path.basename(p)}")
        for s in info:
            print(f"       {s}")
        for s in warns:
            print(f"     ! {s}")
        for s in errors:
            print(f"     X {s}")
        bad += bool(errors)
    print(f"\n{len(paths)} files, {bad} with errors")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
