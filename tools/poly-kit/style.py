"""The reference board — one of everything through the kit's own pipeline: a plywood crate
(box), a wooden drum (lathe, the curved-prop case) and a pedestal (a mixed profile with a
clamped underside lip). What a new prop is judged against.

  python style.py   # -> out/style/board.png
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import polylib as P
import shape as S
import preview as PV
import palette as PAL


def crate():
    m = P.Mesh()
    S.box(m, -12, -12, 0, 12, 12, 22, PAL.tone("leather", 3))
    S.box(m, -12.2, -12.2, 9, 12.2, 12.2, 13, PAL.tone("steel", 2))  # strapping band
    return m


def drum():
    m = P.Mesh()
    wood, hoop = PAL.tone("leather", 2), PAL.tone("leather", 0)
    S.lathe(m, [(8.5, 0), (9.5, 3), (9.9, 4.5, hoop), (10.0, 12), (9.9, 19.5), (9.5, 21, hoop), (8.5, 24)], n=8, color=wood)
    return m


def pedestal():
    m = P.Mesh()
    S.lathe(m, [(9, 0), (9, 2), (5.5, 3.5), (5.5, 13), (8, 14), (8, 16)], n=8, color=PAL.tone("steel", 3))
    return m


def main():
    out = P.out_dir("style")
    images = [PV.render(f(), scale=4) for f in (crate, drum, pedestal)]
    PV.write_png(os.path.join(out, "board.png"), *PV.sheet(images, cols=3))
    print(os.path.join(out, "board.png"))


if __name__ == "__main__":
    main()
