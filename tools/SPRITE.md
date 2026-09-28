# Pixel Art

This is what a sprite has to be to work in the game. There is no code here. Draw in Aseprite or in
a throwaway script (Pillow or numpy) kept outside the repository, then import the PNG. The palette
is in `tools/PALETTE.md`.

## Sprites

| | |
|---|---|
| Cell | The world cell is 32 px, and a sprite is authored 1:1 at 32 px per cell: `density` `1` (sprite px per world px). A tile set's tile must be the 32 px cell, because the runtime draws tile maps unscaled, so it is drawn at 32×32 and imported with no upscale. A wall texture is stretched over its face, so it is drawn at 32×32 and imported as is. |
| Alpha | Binary. Entities are alpha-tested billboards, so every pixel is either fully opaque or fully clear. |
| Palette | AAP-64 only. Snap anything foreign as `tools/PALETTE.md` describes. |
| Item | An item's art is what lies in the world and what a hand holds: authored at 32 px per cell, pointing right, on a canvas whose width and height are each a multiple of 8 px, at least 16×16. The world draws it at its world size and a hand at half. The bag shows its category's icon instead. |
| Anchor | Set on import: entities at the foot (bottom-center), items at the center, held gear at the grip, garments at their slot's bone, tiles at the top-left. |

## Garments

A garment dresses one slot of a skeletal rig — a slot the rig's setup pose leaves empty. It is
mounted rigidly on that slot's bone: its origin on the bone, upright in the setup pose, at the
rig's density. So it is drawn on the setup pose, never by eye:

1. From the skeleton `.json` and its atlas, render the bone's own parts in the setup pose onto a
   32×32 canvas with the bone at 16,16.
2. Draw the garment over that template, then drop the template.
3. Import with the origin at 16,16.

| | |
|---|---|
| Cover | The garment covers its part completely, outline included. Slot alpha does not hide a part, so a garment overdraws the body; it never cuts it away. |
| Colour | The body is a white template tinted per skin; a garment keeps its authored colours. |
| Limbs | A garment follows one bone. Nothing bends with a limb mesh, so a sleeve or a trouser leg is not a garment. |

A garment is not an item's art: the item carries its own sprite, drawn to the item rule.

## Dual-grid tiles

A display tile sits on each data-grid corner. Its mask has one bit per neighbouring cell, and a bit
is set when that cell is filled. There are two forms, and their bit orders differ:

| form | layout | bits |
|---|---|---|
| sprite strip (the `"dual"` tile map, e.g. `pixTileDual`) | 16 frames, frame = mask | TL=1 TR=2 BR=4 BL=8 |
| tile set (terrain, `ts*` over a `pixTerrain*` sprite) | one 512×32 image of 16 tiles, tile = mask; tile 0 is never drawn | TL=1 TR=2 BL=4 BR=8 |

Frames must agree wherever two meet: along a shared edge, both sides show the same coverage and
the same material, so any arrangement tiles.

## Registration

Import the PNG as a `GMSprite` through the IDE or `gm-cli resourcetool` (`docs/GMCLI.md`), never by
editing the yyp. Set the origin, collision mask and playback speed there; through `resourcetool`,
the origin point and the bounding box are each set explicitly. A tile set also needs its
`output_tileset.png` saved once in the IDE (`docs/GMCLI.md`).

A sprite at 32 px per cell declares nothing. One authored at another scale declares its `density` in
`contentSprites`, and a garment declares its rig's. A tile set and a wall texture declare nothing.
