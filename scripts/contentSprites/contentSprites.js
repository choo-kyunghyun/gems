// Sprite metadata DECLARATIONS — the AssetMeta defs, as code. Only sprites whose density
// departs from the art-native 1 need a line: everything else resolves to the default.
/**
 * One idempotent register into AssetMeta, called from Game's Create (before any level spawns
 * entities, so the density bake reads declared values). Def shape at the AssetMeta declaration.
 */
globalThis.contentSprites = {
  registered: false,

  register() {
    if (contentSprites.registered) return;
    contentSprites.registered = true;
    AssetMeta.register([
      // the RenderGrass sheets: 128 px art over a 32 px cell
      { asset: pixGrass, kind: "grass", density: 4 },
      { asset: pixGrassFlowers, kind: "grass", density: 4 },
      { asset: pixGrassWeeds, kind: "grass", density: 4 },
      { asset: pixGrassLotus, kind: "grass", density: 4 },
      // entity dolls drawn finer than world scale
      { asset: spineHuman, kind: "entity", density: 4 },
      { asset: spineRat, kind: "entity", density: 4 },
      { asset: pixShoeBrown, kind: "overlay", density: 4 },
      { asset: pixShoeDarkBrown, kind: "overlay", density: 4 },
      { asset: pixShirtWhite, kind: "overlay", density: 4 },
      { asset: pixShirtRedwine, kind: "overlay", density: 4 },
      { asset: pixHatRedBandana, kind: "overlay", density: 4 },
      { asset: pixOuterArmoredVest, kind: "overlay", density: 4 },
      // the 128 px dual-grid terrain sets and the wall/floor face textures — declared for the
      // record: RenderTileMap and RenderWalls map a frame onto its cell by UV and read no
      // density, so these lines change no draw
      { asset: pixTerrainDeepWater, kind: "terrain", density: 4 },
      { asset: pixTerrainGravel, kind: "terrain", density: 4 },
      { asset: pixTerrainLawn, kind: "terrain", density: 4 },
      { asset: pixTerrainMud, kind: "terrain", density: 4 },
      { asset: pixTerrainRichSoil, kind: "terrain", density: 4 },
      { asset: pixTerrainRocky, kind: "terrain", density: 4 },
      { asset: pixTerrainSand, kind: "terrain", density: 4 },
      { asset: pixTerrainSoil, kind: "terrain", density: 4 },
      { asset: pixTerrainWater, kind: "terrain", density: 4 },
      { asset: pixTexBrick, kind: "tex", density: 4 },
      { asset: pixTexCarpet, kind: "tex", density: 4 },
      { asset: pixTexConcrete, kind: "tex", density: 4 },
      { asset: pixTexMetal, kind: "tex", density: 4 },
      { asset: pixTexMosaic, kind: "tex", density: 4 },
      { asset: pixTexPlaid, kind: "tex", density: 4 },
      { asset: pixTexPlank, kind: "tex", density: 4 },
      { asset: pixTexTile, kind: "tex", density: 4 },
    ]);
  },
};
