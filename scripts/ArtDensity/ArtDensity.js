// Per-sprite ART DENSITY registry: source pixels per world pixel, default 1 (today's baseline —
// 1 sprite px draws 1 world px at design scale 1). Density is DECLARED, never inferred: a 32px
// cell can mean a denser subject OR a taller one, and only the art's author knows which — a sheet
// that needs more detail declares >1 and draws at the same world size as its 1x counterpart.
//
// Split of concerns: Visual.scale is the entity's DESIGN size (RpgSpawn.SCALE x per-spawn scale —
// bosses/Alpha mobs), which also scales the BBox; density is an art fact that divides the DRAW
// scale only (xscale/yscale = scale / density) and never touches the BBox. Bake sites:
// RpgSpawn._visual / RpgPlayer.spawn; AnimationSystem refits when a graph state swaps sheets.
//
// Storage is PARALLEL ARRAYS keyed by the sprite handle via === (opaque-ref identity) — a Map
// keyed by a sprite ref crashes GMRT 0.20 natively at .get ("Bad optional access"), verified
// 2026-07 (the lookup, not the top-level `new Map()`, is the trigger). Declarations are a
// handful of sheets, so the linear scan is nothing.
globalThis.ArtDensity = {
  _sprites: [],
  _densities: [],

  /** Declare a sheet's density (source px per world px). Call where art intent is known
   *  (content registration / import kits), before entities using the sheet spawn. */
  declare(sprite, density) {
    let i = 0;
    while (i < ArtDensity._sprites.length) {
      if (ArtDensity._sprites[i] === sprite) {
        ArtDensity._densities[i] = density;
        return;
      }
      i++;
    }
    ArtDensity._sprites.push(sprite);
    ArtDensity._densities.push(density);
  },

  /** Density of a sprite — declared value, else 1 (the art-native baseline). */
  of(sprite) {
    let i = 0;
    while (i < ArtDensity._sprites.length) {
      if (ArtDensity._sprites[i] === sprite) {
        const d = ArtDensity._densities[i];
        return d > 0 ? d : 1;
      }
      i++;
    }
    return 1;
  },

  /** Final draw scale for a design scale on a sheet: scale / density. */
  fit(scale, sprite) {
    return scale / ArtDensity.of(sprite);
  },
};
