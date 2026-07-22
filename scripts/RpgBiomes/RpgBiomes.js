// The RPG overworld's biome DATA — the material palette + noise tuning OverworldGen feeds TerrainField
// (Core). Split out of OverworldGen so the generator file is logic-only.
/**
 * Pure data, no registration step (a plain top-level literal, like the design tables on GemsTheme); a
 * sibling generator (cave/desert) authors its own table and the machinery never changes.
 */
globalThis.RpgBiomes = {
  // Biome palette (the TerrainField contract): material id = index = painter order (TerrainStream
  // stacks cumulatively, so each upper terrain's dual border reveals the one below). `threshold`
  // entries are the ELEVATION gradient (ascending — deep water → water → sand; past the last one
  // the cell is land), `ground` entries (ascending over the independent ground-detail noise) split
  // the land — grass dominant, with wet depressions (richsoil → soil → mud going in) and rock
  // outcrops (gravel ringing rocky) as patchy features. `sprite` is the untinted dual-grid tileset
  // TerrainStream renders the layer with; `color` is the design-reference tint (no longer drawn —
  // real colored art now). `pathCost` is the WEIGHTED movement cost (TileType convention: null →
  // impassable): it prices both pathfinding (NavGrid samples it, MotionPlanner multiplies step
  // distance by it) and movement-point consumption (PathFollow.speedScale — a mover's speed ×
  // 1/cost). Easy ground 1, loose 1.5, rough 2; shallow water is WADEABLE at 3 (slow, and A* only
  // wades when it beats walking around) but `spawnable: false` (travel yes, homes no); only deep
  // water is null → a collide-only collider per chunk via TerrainField.solidTerrain.
  TERRAIN: [
    {
      id: "deepwater",
      name: "Deep Water",
      color: "#3e5870",
      sprite: "spr_terrain_deepwater",
      threshold: 0.22,
      pathCost: null,
    },
    {
      id: "water",
      name: "Water",
      color: "#2e6b8f",
      sprite: "spr_terrain_water",
      threshold: 0.32,
      pathCost: 3,
      spawnable: false,
    },
    {
      id: "sand",
      name: "Sand",
      color: "#c2a878",
      sprite: "spr_terrain_sand",
      threshold: 0.5,
      pathCost: 1.5,
    },
    {
      id: "mud",
      name: "Mud",
      color: "#605444",
      sprite: "spr_terrain_mud",
      ground: 0.16,
      pathCost: 2,
    },
    {
      id: "soil",
      name: "Soil",
      color: "#8c7558",
      sprite: "spr_terrain_soil",
      ground: 0.3,
      pathCost: 1,
    },
    {
      id: "richsoil",
      name: "Rich Soil",
      color: "#6e5840",
      sprite: "spr_terrain_richsoil",
      ground: 0.36,
      pathCost: 1,
    },
    {
      id: "grass",
      name: "Grass",
      color: "#5d8a46",
      sprite: "spr_terrain_grass",
      ground: 0.76,
      pathCost: 1,
    },
    {
      id: "gravel",
      name: "Gravel",
      color: "#858178",
      sprite: "spr_terrain_gravel",
      ground: 0.86,
      pathCost: 1.5,
    },
    {
      id: "rocky",
      name: "Rocky",
      color: "#76746e",
      sprite: "spr_terrain_rocky",
      ground: Infinity,
      pathCost: 2,
    },
  ],

  // Design-reference material palette (full set by id + name + intended tint). TERRAIN above is
  // the currently-WIRED subset; the remaining entries (thinice/ice — climate variants;
  // barren/jungle) await promotion into the active gradient.
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

  // value-noise lattice spacing in cells (bigger = larger biome blobs)
  LATTICE: 10,
  // ground-detail channel: independent land-material noise (see TerrainField.materialAt). Smaller
  // lattice = smaller patches than the biome blobs; the salt decorrelates it from elevation.
  GROUND_LATTICE: 6,
  GROUND_SALT: 1013904223,
};
