#!/usr/bin/env python3
"""draw — render sprite TEMPLATES to PNGs (pixlib-based, stdlib only).

This generator carries NO art or palette — it reads them from data files in `templates/` (see
pixlib.load_template): `.txt` index grids (sharing `templates/palette.hex`) or self-contained `.json`
(palette embedded). Drop a new template in `templates/` and it renders; nothing here changes.

Outputs to out/agent/: <name>.png (native) + <name>_x16.png (NN preview) + sheet.png (contact sheet).
"""
import os
import pixlib as P

OUT = P.out_dir("agent")
TEMPLATES = os.path.join(P.KIT, "templates")
PAL_FILE = os.path.join(TEMPLATES, "palette.hex")


def load_all():
    """Every .txt / .json in templates/ -> {name: (w, h, pixels)}."""
    palette = P.load_palette(PAL_FILE) if os.path.isfile(PAL_FILE) else None
    sprites = {}
    for fn in sorted(os.listdir(TEMPLATES)):
        base, ext = os.path.splitext(fn)
        if ext.lower() in (".txt", ".json"):
            rows, charmap = P.load_template(os.path.join(TEMPLATES, fn), palette)
            sprites[base] = P.template_pixels(rows, charmap)
    return sprites


def main():
    if not os.path.isdir(TEMPLATES):
        print(f"no templates/ dir at {TEMPLATES} — add .txt/.json sprite data (see README)")
        return
    sprites = load_all()
    if not sprites:
        print(f"no .txt/.json templates in {TEMPLATES}")
        return

    for name, (w, h, px) in sprites.items():
        P.write_png(os.path.join(OUT, f"{name}.png"), w, h, px)
        SW, SH = w * 16, h * 16
        buf = [None] * (SW * SH)
        P.blit(buf, SW, 0, 0, px, w, h, 16, ck=16)
        P.write_png(os.path.join(OUT, f"{name}_x16.png"), SW, SH, buf)

    # contact sheet: BOX-fit so mixed sizes render at matched on-screen size
    names = sorted(sprites)
    BOX, PAD = 192, 12
    cols = min(len(names), 4)
    rows_n = (len(names) + cols - 1) // cols
    SW, SH = PAD + cols * (BOX + PAD), PAD + rows_n * (BOX + PAD)
    sheet = [P.checker(0, 0)] * (SW * SH)
    for Y in range(SH):
        for X in range(SW):
            sheet[Y * SW + X] = P.checker(X, Y, 12)
    for idx, name in enumerate(names):
        w, h, px = sprites[name]
        scale = max(1, BOX // max(w, h))
        gx, gy = idx % cols, idx // cols
        ox = PAD + gx * (BOX + PAD) + (BOX - w * scale) // 2
        oy = PAD + gy * (BOX + PAD) + (BOX - h * scale) // 2
        P.blit(sheet, SW, ox, oy, px, w, h, scale, ck=12)
    P.write_png(os.path.join(OUT, "sheet.png"), SW, SH, sheet)

    print(f"rendered {len(sprites)} templates (+previews +sheet) to {OUT}: {', '.join(names)}")


if __name__ == "__main__":
    main()
