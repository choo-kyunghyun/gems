# Pixel Art

This is what a sprite has to be to work in the game. There is no code here. Draw in Aseprite or in
a throwaway script (Pillow or numpy) kept outside the repository, then import the PNG. The palette
is in `tools/palette`.

## Sprites

| | |
|---|---|
| Cell | The world cell is 128 px, and a sprite is authored at that scale: one sprite px per world px. Art authored at another scale declares its `density` (sprite px per world px), e.g. `0.25` for 32 px per cell. A terrain tile set's tile is the 128 px cell itself. |
| Alpha | Binary. Entities are alpha-tested billboards, so every pixel is either fully opaque or fully clear. |
| Palette | AAP-64 only. Snap anything foreign as `tools/palette` describes. |
| Item | An item's art is what lies in the world and what a hand holds, both at its world size: authored at the cell's scale, it fills a 64×64 px box, a long one (a rifle, a pipe) a 128×64 box, pointing right. The size serves legibility, not measurement: a small thing fills its box, and a long thin one is drawn thicker than true. The bag shows its category's icon instead. |
| Anchor | Set on import: entities at the foot (bottom-center), items at the center, held gear at the grip, garments at their slot's bone, tiles at the top-left. |

## Hardening

Shapes drawn with anti-aliasing (curves, ellipses, rotated shapes) are hardened before export:

1. Draw at 4×.
2. Box-downsample to 1×.
3. Make a pixel opaque when at least half of its supersamples are covered.
4. Snap its mean colour to the palette.

## Garments

A garment dresses one slot of a skeletal rig — a slot the rig's setup pose leaves empty. It is
mounted rigidly on that slot's bone: its origin on the bone, upright in the setup pose, at the
rig's density. So it is drawn on the setup pose, never by eye:

1. From the skeleton `.json` and its atlas, render the bone's own parts in the setup pose onto a
   64×64 canvas with the bone at 32,32.
2. Draw the garment over that template, then drop the template.
3. Import with the origin at 32,32.

| | |
|---|---|
| Cover | The garment covers its part completely, outline included. Slot alpha does not hide a part, so a garment overdraws the body; it never cuts it away. |
| Colour | The body is a white template tinted per skin; a garment keeps its authored colours. Keep it distinct from every skin tone after the world's colour grading. |
| Style | A `void` outline, a fill, and a shade along the bottom edge. |
| Limbs | A garment follows one bone. Nothing bends with a limb mesh, so a sleeve or a trouser leg is not a garment. |

A garment is not an item's art: the item carries its own sprite, drawn to the item rule.

## Dual-grid tiles

A display tile sits on each data-grid corner. Its mask has one bit per neighbouring cell, and a bit
is set when that cell is filled. There are two forms, and their bit orders differ:

| form | layout | bits |
|---|---|---|
| sprite strip (the `"dual"` tile map, e.g. `pixTileDual`) | 16 frames, frame = mask | TL=1 TR=2 BR=4 BL=8 |
| tile set (terrain, `ts*` over a `pixTerrain*` sprite) | one 2048×128 image of 16 tiles, tile = mask; tile 0 is never drawn | TL=1 TR=2 BL=4 BR=8 |

Cut every frame from one seamless material patch. A frame's coverage is the bilinear interpolation
of its four corner bits, thresholded at 0.5. Because that is continuous across a shared edge, the
set tiles by construction; frames drawn independently never do. A patch is seamless when it wraps:
tileable noise, periodic functions, or content that stays clear of the border.

## Registration

Import the PNG as a `GMSprite` through the IDE or `gm-cli resourcetool` (`docs/GMCLI.md`), never by
editing the yyp. Set the origin, collision mask and playback speed there; through `resourcetool`,
the origin point and the bounding box are each set explicitly. A tile set also needs its
`output_tileset.png` saved once in the IDE (`docs/GMCLI.md`).

A sprite authored at 128 px per cell needs no declaration. One authored at another scale declares
its `density` in `contentSprites`, or it draws at the wrong size.
