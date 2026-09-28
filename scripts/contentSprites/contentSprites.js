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
    AssetMeta.register([{ asset: pixMissing, kind: "entity" }]);
  },
};
