// The colony's biome DATA — the terrain materials, and one generator PROFILE per biome: the
// stage-by-stage tuning OverworldGen composes a level's passes from (ground gradient, lakes, walls,
// prefab set, scatter densities, climate). Split out of OverworldGen so the generator file is
// logic-only.
/**
 * Pure data, no registration step (a plain top-level literal, like the design tables on FacetTheme).
 * A site names its profile in `biome` (ColonyLevel._siteData carries it as meta.biome), so a
 * site's character is one entry below — the generator machinery never changes for a new biome.
 */
globalThis.contentBiomes = {
  // Terrain MATERIALS by id — a generator palette entry minus its band position (a biome profile
  // supplies that). `sprite` is the untinted dual-grid tileset the material's pass renders with —
  // the one-tone `*Flat` sets (the textured pixTerrain<Material> sets stay in the project as
  // spares); `color` is the design-reference tint (not drawn — real colored art now). `pathCost` is the
  // WEIGHTED movement cost (TileType convention: null → impassable): it prices both pathfinding
  // (NavGrid samples it, MotionPlanner multiplies step distance by it) and movement-point
  // consumption (PathFollow.speedScale — a mover's speed × 1/cost). Easy ground 1, loose 1.5,
  // rough 2; shallow water is WADEABLE at 3 (slow, and A* only wades when it beats walking around)
  // but `spawnable: false` (travel yes, homes no); only deep water is null → collide-only colliders
  // greedy-meshed by LevelGen into the level's `solid` rects.
  MATERIALS: {
    // `wave` marks a FLOWING material: the crest tone shMeshlit's wave mode paints over the
    // flat sheet, drifting on the sim clock (ColonyMap wires it into the material's pass)
    deepwater: {
      name: "Deep Water",
      color: "#3e5870",
      sprite: "pixTerrainDeepWaterFlat",
      wave: "#285cc4",
      pathCost: null,
    },
    water: {
      name: "Water",
      color: "#2e6b8f",
      sprite: "pixTerrainWaterFlat",
      wave: "#249fde",
      pathCost: 3,
      spawnable: false,
    },
    sand: {
      name: "Sand",
      color: "#c2a878",
      sprite: "pixTerrainSandFlat",
      pathCost: 1.5,
    },
    mud: {
      name: "Mud",
      color: "#605444",
      sprite: "pixTerrainMudFlat",
      pathCost: 2,
    },
    soil: {
      name: "Soil",
      color: "#8c7558",
      sprite: "pixTerrainSoilFlat",
      pathCost: 1,
    },
    richsoil: {
      name: "Rich Soil",
      color: "#6e5840",
      sprite: "pixTerrainRichSoilFlat",
      pathCost: 1,
    },
    // `decor` strews identity pieces over the material's interior cells (RenderDecor, wired by
    // ColonyMap): { sprite, density (share of cells), upright? } — a tuft stands, a stone lies
    grass: {
      name: "Grass",
      color: "#5d8a46",
      sprite: "pixTerrainGrassFlat",
      decor: [{ sprite: "pixDecorGrass", density: 0.16, upright: true }],
      pathCost: 1,
    },
    gravel: {
      name: "Gravel",
      color: "#858178",
      sprite: "pixTerrainGravelFlat",
      decor: [{ sprite: "pixDecorStones", density: 0.05 }],
      pathCost: 1.5,
    },
    rocky: {
      name: "Rocky",
      color: "#76746e",
      sprite: "pixTerrainRockyFlat",
      pathCost: 2,
    },
  },

  // Generator PROFILES by biome id — one section per stage OverworldGen composes, present exactly
  // when the stage is:
  //   name       i18n key (the world map's terrain readout)
  //   indoor?    true for a sealed map — no sky passes, the interior BGM (meta.indoor)
  //   ground     { lattice, bands } — GenGround: [material, threshold] pairs ascending over the
  //              ground noise (the last one Infinity) splitting the land into patchy features;
  //              lattice = value-noise blob spacing in cells (smaller = smaller patches). The
  //              FIRST band is also what a drained anchor footprint fills with (GenAnchor `fill`)
  //   lakes?     { lattice, bands } — GenLakes: pairs ascending over an independent noise — deep
  //              water → water → shore; past the last threshold the cell keeps its ground. The
  //              band order is also the painter order (the terrain's dual-grid passes stack
  //              cumulatively, lake bands under ground bands, so each upper material's border
  //              reveals the one below)
  //   walls?     { lattice, threshold, border?, material? } — GenWalls: noise ≥ threshold is a wall
  //              cell; border rings the level
  //   prefabs?   { tag, density, tries? } — PrefabStamp: the Prefab scope tag stamped + its per-1000
  //              density (+ placement tries per stamp, for a level where open room is scarce)
  //   scatter?   { rock?, rat? } — one GenScatter per key (OverworldGen.SCATTER) at that
  //              per-1000-cell density
  //   flora?     { density, pool } — OverworldGen.flora: the plant species (contentFlora) strewn
  //              at that per-1000 density, `pool` the [species, weight] roll; FloraSystem keeps
  //              spreading the same pool afterwards, season-weighted, up to its cap
  //   climate?   { weather, tempMod } — the whole-map sky the site's level carries as its
  //              meta.climate (ColonyLevel._siteData)
  BIOMES: {
    // the colony's home ground: temperate steppe, lakes and wet depressions, pine scatter
    steppe: {
      name: "BIOME_STEPPE",
      ground: {
        lattice: 6,
        bands: [
          ["mud", 0.16],
          ["soil", 0.3],
          ["richsoil", 0.36],
          ["grass", 0.76],
          ["gravel", 0.86],
          ["rocky", Infinity],
        ],
      },
      lakes: {
        lattice: 10,
        bands: [
          ["deepwater", 0.22],
          ["water", 0.32],
          ["sand", 0.5],
        ],
      },
      prefabs: { tag: "overworld", density: 1.76 },
      scatter: { rock: 5.9, rat: 3.9 },
      flora: {
        density: 6.8,
        pool: [
          ["pine", 6],
          ["berry_bush", 2],
          ["wheat", 0.5],
        ],
      },
    },
    // frozen impact basin: scarce open water, gravel-and-rock ground with thin soil pockets, few
    // trees, little game — under constant snow
    frost: {
      name: "BIOME_FROST",
      ground: {
        lattice: 5,
        bands: [
          ["soil", 0.2],
          ["grass", 0.4],
          ["gravel", 0.75],
          ["rocky", Infinity],
        ],
      },
      lakes: {
        lattice: 12,
        bands: [
          ["deepwater", 0.14],
          ["water", 0.2],
          ["sand", 0.28],
        ],
      },
      prefabs: { tag: "overworld", density: 2.2 },
      scatter: { rock: 8, rat: 1.5 },
      flora: {
        density: 2.5,
        pool: [
          ["pine", 5],
          ["berry_bush", 1],
        ],
      },
      climate: { weather: "snow", tempMod: -20 },
    },
    // flooded crater floor: broad shallows, mud flats and rich soil between grassy hummocks,
    // swarming with vermin — under rain
    marsh: {
      name: "BIOME_MARSH",
      ground: {
        lattice: 5,
        bands: [
          ["mud", 0.34],
          ["richsoil", 0.5],
          ["grass", 0.9],
          ["soil", Infinity],
        ],
      },
      lakes: {
        lattice: 8,
        bands: [
          ["deepwater", 0.3],
          ["water", 0.46],
          ["sand", 0.52],
        ],
      },
      prefabs: { tag: "overworld", density: 1.4 },
      scatter: { rock: 2, rat: 7 },
      flora: {
        density: 5,
        pool: [
          ["pine", 4],
          ["berry_bush", 3],
          ["wheat", 1],
        ],
      },
      climate: { weather: "rain", tempMod: 4 },
    },
    // dry ejecta plain: no standing water, sand and gravel under rocky outcrops, dense camps —
    // clear and hot
    badlands: {
      name: "BIOME_BADLANDS",
      ground: {
        lattice: 7,
        bands: [
          ["soil", 0.15],
          ["gravel", 0.6],
          ["rocky", Infinity],
        ],
      },
      lakes: {
        lattice: 9,
        bands: [
          ["deepwater", 0.03],
          ["water", 0.06],
          ["sand", 0.42],
        ],
      },
      prefabs: { tag: "overworld", density: 3 },
      scatter: { rock: 10, rat: 2.5 },
      flora: {
        density: 0.6,
        pool: [
          ["pine", 1],
          ["berry_bush", 1],
        ],
      },
      climate: { weather: "clear", tempMod: 12 },
    },
    // sealed lava tube: a noise-carved rock shell over mud and gravel, no water, no sky — raider
    // stashes in the pockets, vermin everywhere
    cave: {
      name: "BIOME_CAVE",
      indoor: true,
      ground: {
        lattice: 5,
        bands: [
          ["mud", 0.2],
          ["gravel", 0.55],
          ["rocky", Infinity],
        ],
      },
      walls: { lattice: 6, threshold: 0.58, border: true },
      // pockets are scarce between the walls, so a stash gets many more placement tries
      prefabs: { tag: "cave", density: 1.6, tries: 32 },
      scatter: { rat: 6 },
    },
    // DEV: the scratch pad's canvas — one flat material and nothing else, so what stands on it
    // is only what was built there (contentSites `scratch`)
    flat: {
      name: "BIOME_FLAT",
      ground: { lattice: 8, bands: [["grass", Infinity]] },
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
};
