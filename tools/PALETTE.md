# Palette

AAP-64 is the project palette. Every sprite, mesh and `.aseprite` source uses these 64 colors and
nothing else. `aap-64.gpl` is the palette in GIMP/Aseprite format: its `R G B` lines are entries 0..63
in order. The `.aseprite` sources under `art/` embed the same 64 colors, and they win when the two
disagree.

## Matching

To bring a foreign color onto the palette, use the entry nearest to it in OKLab, measured as
squared distance. Never match on raw RGB: it sends a dark red to a dark green. When snapping an
image, alpha becomes a hard cutout at 128.
