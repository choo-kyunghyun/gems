/**
 * The colony's biome data: pure data, no registration step. A site names its profile in
 * `biome`, so a site's character is one entry below and the generator never changes for a new
 * biome.
 */
globalThis.contentBiomes = {
  // Terrain materials by id; a biome profile supplies each one's band position. `sprite` is the
  // untinted dual-grid tileset; `color` is a design-reference tint, not drawn. `pathCost` is the
  // weighted movement cost for both pathfinding and movement speed (null = impassable).
  // Shallow water wades at 3 but is not `spawnable`.
  MATERIALS: {
    // `wave` marks a flowing material: the crest tone drifted over the flat sheet.
    deepwater: {
      name: "Deep Water",
      color: "#3e5870",
      sprite: pixTerrainDeepWater,
      wave: "#285cc4",
      pathCost: null,
    },
    water: {
      name: "Water",
      color: "#2e6b8f",
      sprite: pixTerrainWater,
      wave: "#249fde",
      pathCost: 3,
      spawnable: false,
    },
    sand: {
      name: "Sand",
      color: "#c2a878",
      sprite: pixTerrainSand,
      pathCost: 1.5,
    },
    mud: {
      name: "Mud",
      color: "#605444",
      sprite: pixTerrainMud,
      pathCost: 2,
    },
    soil: {
      name: "Soil",
      color: "#8c7558",
      sprite: pixTerrainSoil,
      clutter: [
        {
          sprite: pixGrassWeeds,
          tint: "#a08662", // dry scrub, apart from the living field's green
          chance: 0.1,
          min: 1,
          max: 1,
          scaleMin: 0.7,
          scaleMax: 1.2,
        },
      ],
      pathCost: 1,
    },
    richsoil: {
      name: "Rich Soil",
      color: "#6e5840",
      sprite: pixTerrainRichSoil,
      pathCost: 1,
    },
    // `clump` grows a volume layer dense enough to carry the green itself over the soil sheet,
    // so grass needs no tileset of its own. `clutter` entries are sparse accents of the same
    // shape plus `chance` (share of cells that carry any); a white-mask sheet takes a `tint`,
    // and `flat` lays an entry on the ground plane instead of standing it.
    grass: {
      name: "Grass",
      color: "#5d8a46",
      sprite: pixTerrainSoil,
      clump: {
        sprite: pixGrass,
        tint: "#328464", // the sheet is a white mask, so this is the field's green
        min: 4,
        max: 6,
        scaleMin: 0.7,
        scaleMax: 1.35,
        edge: true,
      },
      clutter: [
        {
          sprite: pixGrassFlowers,
          chance: 0.06,
          min: 1,
          max: 1,
          scaleMin: 0.8,
          scaleMax: 1.15,
        },
      ],
      pathCost: 1,
    },
    // Maintained grass: flat reads as designed ground, so it takes no clumps. Never a biome
    // band; only stamped.
    lawn: {
      name: "Lawn",
      color: "#328464",
      sprite: pixTerrainLawn,
      pathCost: 1,
    },
    gravel: {
      name: "Gravel",
      color: "#858178",
      sprite: pixTerrainGravel,
      pathCost: 1.5,
    },
    rocky: {
      name: "Rocky",
      color: "#76746e",
      sprite: pixTerrainRocky,
      pathCost: 2,
    },
  },

  // Generator profiles by biome id; a section is present exactly when its stage runs:
  //   name       i18n key
  //   indoor?    true for a sealed map with no sky
  //   extras?    [material] — materials no band paints but a stamp may, painted above the bands
  //   clumpTint? "#hex" — the biome's grass color over the white clump mask
  //   clutter?   { <material>: [entry] } — this biome's own accents, appended to the material's
  //   wind?      0..1 — constant whole-map wind strength; absent = still
  //   ground     { lattice, bands } — [material, threshold] pairs ascending over the ground noise,
  //              the last one Infinity; lattice is the blob spacing in cells. The first band
  //              also fills a drained anchor footprint
  //   lakes?     { lattice, bands } — pairs over an independent noise; past the last threshold
  //              the cell keeps its ground. Band order is also the painter order
  //   walls?     { lattice, threshold, border?, material? } — noise ≥ threshold is a wall cell
  //   prefabs?   { tag, density, tries? } — stamp tag at a per-1000 density
  //   scatter?   { rock?, rat? } — per-1000-cell density per key
  //   flora?     { density, pool } — per-1000 density and the [species, weight] roll
  //   climate?   { weather, tempMod } — the whole-map sky
  BIOMES: {
    // temperate steppe, lakes and wet depressions, pine scatter
    steppe: {
      name: "BIOME_STEPPE",
      wind: 0.6,
      extras: ["lawn"],
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
      clumpTint: "#477d85", // grass gone cold
      wind: 0.9,
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
      wind: 0.35,
      // lotus pads on the shallows only, never the deep
      clutter: {
        water: [
          {
            sprite: pixGrassLotus,
            flat: true,
            chance: 0.22,
            min: 1,
            max: 2,
            scaleMin: 0.55,
            scaleMax: 0.95,
          },
        ],
      },
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
      wind: 1,
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
    // DEV: a blank canvas — one flat material and nothing else, so what stands on it is only
    // what was built there
    flat: {
      name: "BIOME_FLAT",
      ground: { lattice: 8, bands: [["grass", Infinity]] },
    },
  },

  // Design-reference material palette; MATERIALS is the wired subset, the rest await a profile.
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
    { id: "lawn", name: "Lawn", color: "#328464" },
    { id: "jungle", name: "Jungle", color: "#37946e" },
    { id: "gravel", name: "Gravel", color: "#9badb7" },
    { id: "rocky", name: "Rocky", color: "#847e87" },
  ],
};
