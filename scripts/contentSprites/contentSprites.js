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
    // TODO: the rigs are drawn at 128 px per cell; a redraw at the cell drops these, and a
    // garment keeps its rig's density
    const RIG = 4;
    AssetMeta.register([
      { asset: pixMissing, kind: "entity" },
      { asset: spineHuman, kind: "entity", density: RIG },
      { asset: spineRat, kind: "entity", density: RIG },
      { asset: pixBackpack, kind: "garment", density: RIG },
      { asset: pixBackpackBrown, kind: "garment", density: RIG },
      { asset: pixGloveLeather, kind: "garment", density: RIG },
      { asset: pixHatBeanie, kind: "garment", density: RIG },
      { asset: pixHatFedora, kind: "garment", density: RIG },
      { asset: pixHatHelmet, kind: "garment", density: RIG },
      { asset: pixHatJungle, kind: "garment", density: RIG },
      { asset: pixHatRedBandana, kind: "garment", density: RIG },
      { asset: pixOuterArmoredVest, kind: "garment", density: RIG },
      { asset: pixOuterDuster, kind: "garment", density: RIG },
      { asset: pixPantsKhaki, kind: "garment", density: RIG },
      { asset: pixShirtBlue, kind: "garment", density: RIG },
      { asset: pixShirtRedwine, kind: "garment", density: RIG },
      { asset: pixShirtWhite, kind: "garment", density: RIG },
      { asset: pixShoeBoot, kind: "garment", density: RIG },
      { asset: pixShoeBrown, kind: "garment", density: RIG },
      { asset: pixShoeDarkBrown, kind: "garment", density: RIG },
    ]);
  },
};
