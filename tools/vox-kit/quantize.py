#!/usr/bin/env python3
"""Lock a .vox (or folder of them) onto AAP-64 — the style-match lever for voxel props.

Rewrites the palette to the kit's AAP layout (slots 1..64 = AAP-64 entries 0..63) and remaps every
voxel to the entry nearest its old color (OKLab), so a MagicaVoxel model built on the default palette
lands on the project's ramps. Two old colors that snap to one entry merge. The output is the minimal
three-chunk file voxlib writes; MagicaVoxel opens it, the runtime reads it unchanged.

Usage:
  python quantize.py in.vox  out.vox
  python quantize.py in_dir  out_dir      # all *.vox
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voxlib as V


def quantize_model(m):
    """A new Model on the AAP palette; (old index -> new index) mapping alongside."""
    remap = {i: V.slot(c) for i, c in m.colors()}
    out = V.Model(m.size, {p: remap[i] for p, i in m.vox.items()}, V.AAP)
    return out, remap


def quantize_file(inp, outp):
    m = V.read(inp)
    if m.pal is None:
        raise ValueError(f"{inp}: no RGBA palette to quantize")
    q, remap = quantize_model(m)
    os.makedirs(os.path.dirname(os.path.abspath(outp)) or ".", exist_ok=True)
    V.write(outp, q)
    return len(remap), len(set(remap.values()))


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return
    src, dst = sys.argv[1], sys.argv[2]
    if os.path.isdir(src):
        os.makedirs(dst, exist_ok=True)
        n = 0
        for f in sorted(os.listdir(src)):
            if f.endswith(".vox"):
                before, after = quantize_file(os.path.join(src, f), os.path.join(dst, f))
                print(f"  {f}: {before} colors -> {after} tones")
                n += 1
        print(f"quantized {n} models -> {dst}")
    else:
        before, after = quantize_file(src, dst)
        print(f"quantized -> {dst}  ({before} colors -> {after} tones)")


if __name__ == "__main__":
    main()
