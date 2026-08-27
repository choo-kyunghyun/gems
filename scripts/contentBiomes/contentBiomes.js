// The colony's biome DATA — the terrain materials, and one generator PROFILE per biome that tunes
// OverworldGen for a level's character (terrain gradient, noise scale, scatter densities, prefab
// set, climate). Split out of OverworldGen so the generator file is logic-only.
/**
 * Pure data, no registration step (a plain top-level literal, like the design tables on GemsTheme).
 * A level names its profile in `meta.biome` (ColonyLevel._generate resolves it here), so a site's
 * character is one entry below — the generator machinery never changes for a new biome.
 */
globalThis.contentBiomes = {
  // Terrain MATERIALS by id — a TerrainField palette entry minus its gradient position (a biome
  // profile supplies that). `sprite` is the untinted dual-grid tileset the material's pass renders
  // with; `color` is the design-reference tint (not drawn — real colored art now). `pathCost` is
  // the WEIGHTED movement cost (TileType convention: null → impassable): it prices both pathfinding
  // (NavGrid samples it, MotionPlanner multiplies step distance by it) and movement-point
  // consumption (PathFollow.speedScale — a mover's speed × 1/cost). Easy ground 1, loose 1.5,
  // rough 2; shallow water is WADEABLE at 3 (slow, and A* only wades when it beats walking around)
  // but `spawnable: false` (travel yes, homes no); only deep water is null → collide-only colliders
  // greedy-meshed by TerrainField.solidRects.
  MATERIALS: {
    deepwater: {
      name: "Deep Water",
      color: "#3e5870",
      sprite: "pixTerrainDeepWater",
      pathCost: null,
    },
    water: {
      name: "Water",
      color: "#2e6b8f",
      sprite: "pixTerrainWater",
      pathCost: 3,
      spawnable: false,
    },
    sand: {
      name: "Sand",
      color: "#c2a878",
      sprite: "pixTerrainSand",
      pathCost: 1.5,
    },
    mud: {
      name: "Mud",
      color: "#605444",
      sprite: "pixTerrainMud",
      pathCost: 2,
    },
    soil: {
      name: "Soil",
      color: "#8c7558",
      sprite: "pixTerrainSoil",
      pathCost: 1,
    },
    richsoil: {
      name: "Rich Soil",
      color: "#6e5840",
      sprite: "pixTerrainRichSoil",
      pathCost: 1,
    },
    grass: {
      name: "Grass",
      color: "#5d8a46",
      sprite: "pixTerrainGrass",
      pathCost: 1,
    },
    gravel: {
      name: "Gravel",
      color: "#858178",
      sprite: "pixTerrainGravel",
      pathCost: 1.5,
    },
    rocky: {
      name: "Rocky",
      color: "#76746e",
      sprite: "pixTerrainRocky",
      pathCost: 2,
    },
  },

  // Generator PROFILES by biome id — everything OverworldGen tunes per level:
  //   name           i18n key (the world map's terrain readout)
  //   elevation      [material, threshold] pairs ascending over the ELEVATION noise — deep water →
  //                  water → shore; past the last threshold the cell is land. The order is also the
  //                  painter order (the terrain's dual-grid passes stack cumulatively, so each upper
  //                  material's border reveals the one below).
  //   ground         [material, threshold] pairs ascending over the independent GROUND-detail noise
  //                  (the last one Infinity) splitting the land into patchy features
  //   lattice        value-noise lattice spacing in cells (bigger = larger biome blobs);
  //   groundLattice  the same for the ground-detail channel (smaller = smaller patches)
  //   rocks/trees/rats  scatter densities per 1000 cells (OverworldGen's scatter passes)
  //   prefabs        { tag, density } — the Prefab scope tag PrefabStamp stamps + its per-1000 density
  //   climate?       { weather, tempMod } — the whole-map sky a SYNTHESIZED site's level carries as
  //                  its meta.climate (ColonyLevel._siteData); an authored level file authors its own
  BIOMES: {
    // the colony's home ground: temperate steppe, lakes and wet depressions, pine scatter
    steppe: {
      name: "BIOME_STEPPE",
      elevation: [
        ["deepwater", 0.22],
        ["water", 0.32],
        ["sand", 0.5],
      ],
      ground: [
        ["mud", 0.16],
        ["soil", 0.3],
        ["richsoil", 0.36],
        ["grass", 0.76],
        ["gravel", 0.86],
        ["rocky", Infinity],
      ],
      lattice: 10,
      groundLattice: 6,
      rocks: 5.9,
      trees: 6.8,
      rats: 3.9,
      prefabs: { tag: "overworld", density: 1.76 },
    },
    // frozen impact basin: scarce open water, gravel-and-rock ground with thin soil pockets, few
    // trees, little game — under constant snow
    frost: {
      name: "BIOME_FROST",
      elevation: [
        ["deepwater", 0.14],
        ["water", 0.2],
        ["sand", 0.28],
      ],
      ground: [
        ["soil", 0.2],
        ["grass", 0.4],
        ["gravel", 0.75],
        ["rocky", Infinity],
      ],
      lattice: 12,
      groundLattice: 5,
      rocks: 8,
      trees: 2.5,
      rats: 1.5,
      prefabs: { tag: "overworld", density: 2.2 },
      climate: { weather: "snow", tempMod: -20 },
    },
    // flooded crater floor: broad shallows, mud flats and rich soil between grassy hummocks,
    // swarming with vermin — under rain
    marsh: {
      name: "BIOME_MARSH",
      elevation: [
        ["deepwater", 0.3],
        ["water", 0.46],
        ["sand", 0.52],
      ],
      ground: [
        ["mud", 0.34],
        ["richsoil", 0.5],
        ["grass", 0.9],
        ["soil", Infinity],
      ],
      lattice: 8,
      groundLattice: 5,
      rocks: 2,
      trees: 5,
      rats: 7,
      prefabs: { tag: "overworld", density: 1.4 },
      climate: { weather: "rain", tempMod: 4 },
    },
    // dry ejecta plain: no standing water, sand and gravel under rocky outcrops, dense camps —
    // clear and hot
    badlands: {
      name: "BIOME_BADLANDS",
      elevation: [
        ["deepwater", 0.03],
        ["water", 0.06],
        ["sand", 0.42],
      ],
      ground: [
        ["soil", 0.15],
        ["gravel", 0.6],
        ["rocky", Infinity],
      ],
      lattice: 9,
      groundLattice: 7,
      rocks: 10,
      trees: 0.6,
      rats: 2.5,
      prefabs: { tag: "overworld", density: 3 },
      climate: { weather: "clear", tempMod: 12 },
    },
  },

  // Design-reference material palette (full set by id + name + intended tint). MATERIALS above is
  // the currently-WIRED subset; the remaining entries (thinice/ice — climate variants;
  // barren/jungle) await promotion into a profile.
  PALETTE: [
    { id: "water", name: "Water", color: "#639bff" },
    { id: "deepwater", name: "Deep Water", color: "#5b6ee1" },
    { id: "thinice", name: "Thin Ice", color: "#cbdbfc" },
    { id: "ice", name: "Ice", color: "#5fcde4" },
    { id: "sand", name: "Sand", color: "#eec39a" },
    { id: "mud", name: "Mud", color: "#695444" },
    { id: "soil", name: "Soil", color: "#8f563b" },
    { id: "barren", name: "Barren", color: "#d9a066" },
    { id: "richsoil", name: "Rich Soil", color: "#663931" },
    { id: "grass", name: "Grass", color: "#6abe30" },
    { id: "jungle", name: "Jungle", color: "#37946e" },
    { id: "gravel", name: "Gravel", color: "#9badb7" },
    { id: "rocky", name: "Rocky", color: "#847e87" },
  ],

  // ground-detail channel salt: decorrelates the land-material noise from elevation
  // (see TerrainField.materialAt)
  GROUND_SALT: 1013904223,
};
