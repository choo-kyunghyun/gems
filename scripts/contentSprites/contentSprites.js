/**
 * Sprite metadata declarations.
 *
 * One idempotent register, run before any level spawns entities so the density bake reads the
 * declared values.
 */
globalThis.contentSprites = {
  registered: false,

  register() {
    if (contentSprites.registered) return;
    contentSprites.registered = true;
    AssetMeta.register([
      // world art drawn for a 32 px cell under the 128 px one
      { asset: pixPine, kind: "entity", density: 0.25 },
      { asset: pixRock, kind: "entity", density: 0.25 },
      { asset: pixBerryBush, kind: "entity", density: 0.25 },
      { asset: pixWheat, kind: "entity", density: 0.25 },
      { asset: pixTree, kind: "entity", density: 0.25 },
      { asset: pixTreeBig, kind: "entity", density: 0.25 },
      { asset: pixReef, kind: "entity", density: 0.25 },
      { asset: pixMissing, kind: "entity" },
    ]);
  },
};
