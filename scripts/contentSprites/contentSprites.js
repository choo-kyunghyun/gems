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
      { sprite: "pixGrass", kind: "grass", density: 4 },
      { sprite: "pixGrassFlowers", kind: "grass", density: 4 },
      { sprite: "pixGrassWeeds", kind: "grass", density: 4 },
      // entity dolls drawn finer than world scale
      { sprite: "spineHuman", kind: "entity", density: 4 },
      { sprite: "spineRat", kind: "entity", density: 4 },
      { sprite: "pixShoeBrown", kind: "overlay", density: 4 },
      { sprite: "pixShoeDarkBrown", kind: "overlay", density: 4 },
      { sprite: "pixShirtWhite", kind: "overlay", density: 4 },
      { sprite: "pixShirtRedwine", kind: "overlay", density: 4 },
      { sprite: "pixHatRedBandana", kind: "overlay", density: 4 },
      // the site beacon: 128 px art over its one-cell box
      { sprite: "pixPortal", kind: "entity", density: 4 },
      // the 128 px dual-grid terrain sets and the wall/floor face textures — declared for the
      // record: RenderTileMap and RenderWalls map a frame onto its cell by UV and read no
      // density, so these lines change no draw
      { sprite: "pixTerrainDeepWater", kind: "terrain", density: 4 },
      { sprite: "pixTerrainGravel", kind: "terrain", density: 4 },
      { sprite: "pixTerrainLawn", kind: "terrain", density: 4 },
      { sprite: "pixTerrainMud", kind: "terrain", density: 4 },
      { sprite: "pixTerrainRichSoil", kind: "terrain", density: 4 },
      { sprite: "pixTerrainRocky", kind: "terrain", density: 4 },
      { sprite: "pixTerrainSand", kind: "terrain", density: 4 },
      { sprite: "pixTerrainSoil", kind: "terrain", density: 4 },
      { sprite: "pixTerrainWater", kind: "terrain", density: 4 },
      { sprite: "pixTexBrick", kind: "tex", density: 4 },
      { sprite: "pixTexCarpet", kind: "tex", density: 4 },
      { sprite: "pixTexConcrete", kind: "tex", density: 4 },
      { sprite: "pixTexMetal", kind: "tex", density: 4 },
      { sprite: "pixTexMosaic", kind: "tex", density: 4 },
      { sprite: "pixTexPlaid", kind: "tex", density: 4 },
      { sprite: "pixTexPlank", kind: "tex", density: 4 },
      { sprite: "pixTexTile", kind: "tex", density: 4 },
    ]);
  },
};
