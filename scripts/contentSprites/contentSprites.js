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
    // the Item family: 32 px icons, one cell wide in the world. BUG: the id list reaches JS
    // opaque, so it is walked with array_length/array_get (docs/GMRT.md)
    const ids = asset_get_ids(asset_sprite);
    const items = [{ asset: pixBackpack, kind: "item", density: 0.25 }];
    for (let i = 0; i < array_length(ids); i++) {
      const spr = array_get(ids, i);
      if (sprite_get_name(spr).startsWith("pixItem"))
        items.push({ asset: spr, kind: "item", density: 0.25 });
    }
    AssetMeta.register(items);
  },
};
