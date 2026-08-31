"""The runtime contract + the style, as one pass over `.mesh` files (default: every one in
datafiles/meshes). Errors are what the runtime or the palette rejects; warnings are what draws
wrong. Exit 1 on any error.

  python lint.py [file.mesh | dir ...]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import polylib as P
import palette as PAL

BUDGET = 1000  # triangles — far above any prop; a breach is a runaway generator


def lint(path):
    errors = []
    warnings = []
    try:
        (w, d, h), tris = P.read(path)
    except ValueError as e:
        return [str(e)], [], ""
    lo = [1e30] * 3
    hi = [-1e30] * 3
    for (pts, color, (nu, nv)) in tris:
        if color not in PAL.PALETTE:
            errors.append(f"color {color} off AAP-64")
        if nu * nu + nv * nv > 1.0001:
            errors.append(f"packed normal ({nu:.2f},{nv:.2f}) outside the unit disc")
        n = P.normal(*[(p[0], p[1], -p[2]) for p in pts])  # back to author space
        if n is None:
            warnings.append("degenerate triangle")
        for p in pts:
            for i in range(3):
                lo[i] = min(lo[i], p[i])
                hi[i] = max(hi[i], p[i])
    if len(tris) > BUDGET:
        errors.append(f"{len(tris)} triangles (budget {BUDGET})")
    if abs(hi[2]) > 0.01:
        warnings.append(f"feet off the ground (max z {hi[2]:.2f}, want 0)")
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    if abs(cx) > 1 or abs(cy) > 1:
        warnings.append(f"content off the footprint center by ({cx:.1f},{cy:.1f})")
    ex = (hi[0] - lo[0], hi[1] - lo[1], -lo[2])
    for a, b in zip(ex, (w, d, h)):
        if abs(a - b) > 0.01:
            warnings.append(f"header content {w:.0f}x{d:.0f}x{h:.0f} != geometry {ex[0]:.0f}x{ex[1]:.0f}x{ex[2]:.0f}")
            break
    line = f"{len(tris)} tris, content {ex[0]:.0f}x{ex[1]:.0f}x{ex[2]:.0f}"
    return errors, warnings, line


def main(argv):
    paths = []
    for a in argv or [P.MESHES]:
        if os.path.isdir(a):
            paths += [os.path.join(a, f) for f in sorted(os.listdir(a)) if f.endswith(".mesh")]
        else:
            paths.append(a)
    bad = 0
    for p in paths:
        errors, warnings, line = lint(p)
        state = "ERROR" if errors else ("warn" if warnings else "ok")
        print(f"{os.path.basename(p):28s} {state:5s} {line}")
        for e in errors:
            print(f"  error: {e}")
        for wmsg in warnings:
            print(f"  warn:  {wmsg}")
        bad += 1 if errors else 0
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
