// Sprite metadata DECLARATIONS — the SpriteMeta defs, as code. Only sprites whose density
// departs from the art-native 1 need a line: everything else resolves to the default.
/**
 * One idempotent register into SpriteMeta, called from Game's Create (before any level spawns
 * entities, so the density bake reads declared values). Def shape at the SpriteMeta declaration.
 */
globalThis.contentSprites = {
  registered: false,

  register() {
    if (this.registered) return;
    this.registered = true;
    SpriteMeta.register([
      // the RenderGrass sheets: 128 px art over a 32 px cell
      { sprite: "pixGrassClump", kind: "decor", density: 4 },
      { sprite: "pixGrassFlowers", kind: "decor", density: 4 },
      { sprite: "pixGrassWeeds", kind: "decor", density: 4 },
      // entity dolls drawn finer than world scale
      { sprite: "spineHuman", kind: "entity", density: 1.5 },
      { sprite: "spineRat", kind: "entity", density: 1.4 },
    ]);
  },
};
