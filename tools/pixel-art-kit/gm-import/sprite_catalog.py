#!/usr/bin/env python3
"""sprite_catalog — the project's per-sprite frame SIZES + the recommended-ratio reference.

The single source of truth for a sprite's frame W x H on the **AI-import path** (import_hero / import_items
read it so a size is declared ONCE, not repeated across the framing + build calls). Procedural sprites
declare their size inline in the generator's own SPRITES table instead (the art coords are size-specific),
so each sprite's size lives in exactly one place — this catalog for AI-imported sprites, the SPRITES tuple
for hand-drawn ones.

Sizes come from `common/spritesize.py` (measure the candidate's silhouette -> snap to the 16px menu); run
it on a candidate to get the entry to paste here. Anchor is by name convention, matching the two emitters:
`spr_item_*` icons are CENTERED, everything else (entities) is FOOT-anchored — so the catalog only needs
the (w, h); the anchor is derived.

Omit a sprite to leave it square (the caller's default cell). Only NON-square sprites need an entry.
"""

# name -> (w, h). The commented rows are the recommended ratios from GEMS.md — uncomment + adjust as the
# matching art is drawn/generated (the numbers are a starting point; re-measure with spritesize.py).
SIZES = {
    # --- entities (foot-anchored, spr_*) — a standing biped reads best at 1:2 ---
    "spr_hero":          (32, 64),   # player humanoid 1:2
    "spr_raider":        (32, 64),   # human enemy 1:2
    # "spr_doorway":     (32, 48),   # tall prop 1:1.5

    # --- item icons (centered, spr_item_*) — guns are wide; size by the barrel length ---
    # "spr_item_blaster":  (64, 32),   # rifle 2:1
    # "spr_item_pistol":   (48, 32),   # pistol 1.5:1
    # "spr_item_sniper":   (96, 32),   # long rifle 3:1
    # "spr_item_wood_sword": (32, 64), # tall blade 1:2
}


def size_of(name, default=32):
    """(w, h) for a sprite — its catalog entry, else a square `default` (32 for entities, 16 for icons)."""
    return SIZES.get(name, (default, default))


def anchor_of(name):
    """"center" for item icons (spr_item_*), "foot" for entities — the convention the two emitters use."""
    return "center" if name.startswith("spr_item_") else "foot"
