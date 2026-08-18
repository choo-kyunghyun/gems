// The colony's tile MATERIAL data — the resident tile-layer stack a level's grid is built from.
// Split out of ColonyLevel so that file is logic-only.
/**
 * Pure data plus its by-key lookup, no registration step (a plain top-level literal, like
 * contentBiomes' palette); a sibling stack authors its own table and the builder never changes.
 *
 * LAYERS is the layer stack, bottom→top — one material each. RenderTileMap autotiles by
 * OCCUPANCY (not tile-type), so materials with different autotile modes (wall=corner,
 * fence=blob16) CAN'T share a TileLayer — each gets its own layer + pass. `type`: "dual"
 * corner-grid, "corner" 13-piece sub-tile, 0 raw single-frame, 16 blob4, 47 blob8. For a
 * type-0 layer RenderTileMap uses TileType.id as the frame index, so `floor.id` MUST be a real
 * frame. `pathCost: null` → blocking; `solid` layers are greedy-meshed. `fill` auto-fills the
 * grid (walkable base) on authored maps; a generated map paints the terrain layer per cell from
 * its biome palette instead (ColonyLevel._generate). Order = nav priority (top wins).
 * `name` is an I18n key (resolved at build in ColonyLevel._makeLayers — top level runs before the
 * locale loads).
 */
globalThis.contentTiles = {
  LAYERS: [
    {
      key: "terrain",
      id: 1,
      name: "TILE_TERRAIN",
      type: "dual",
      sprite: "spr_tiledual",
      // desaturated olive matching the streamed grass base (style-spec GROUND band)
      color: "#79825a",
      solid: false,
      pathCost: 1,
      emptyCost: 1,
      fill: true,
    },
    {
      key: "floor",
      // spr_tex_plaid = near-white checker weave (spr_tex_brick is the WALL texture — see
      // ColonyMap._buildRenderer); wood-tan tint -> parquet flooring. For a type-0 layer the
      // id IS the frame index (and must be non-zero: 0 reads as empty occupancy).
      id: 1,
      name: "BUILD_FLOOR",
      type: 0,
      sprite: "spr_tex_plaid",
      color: "#aa9472",
      solid: false,
      pathCost: 1,
    },
    // Floor VARIANTS — one type-0 layer per material (the LAYERS design rule: one material
    // per layer + pass; the spare near-white spr_tex_* sheets each get their own tint).
    // Build-Mode-only surfaces: level files paint only `floor`, generated maps hold them empty.
    {
      key: "floorTile",
      id: 1,
      name: "BUILD_FLOOR_TILE",
      type: 0,
      sprite: "spr_tex_tile",
      color: "#9dadb2",
      solid: false,
      pathCost: 1,
    },
    {
      key: "floorCarpet",
      id: 1,
      name: "BUILD_FLOOR_CARPET",
      type: 0,
      sprite: "spr_tex_carpet",
      color: "#a05a50",
      solid: false,
      pathCost: 1,
    },
    {
      key: "floorMosaic",
      id: 1,
      name: "BUILD_FLOOR_MOSAIC",
      type: 0,
      sprite: "spr_tex_mosaic",
      color: "#7096a8",
      solid: false,
      pathCost: 1,
    },
    {
      key: "wall",
      id: 1,
      name: "EDITOR_WALL",
      type: "corner",
      sprite: "spr_tilecorner",
      color: "#707888",
      solid: true,
      pathCost: null,
      // Wall MATERIALS — per-cell TileTypes within this ONE solid layer (unlike the floor
      // variants above, walls stay a single layer so colliders/remesh/nav are untouched —
      // TileEdit meshes by occupancy). Each material = a near-white face texture + tint;
      // RenderWalls buckets cells by TileType id and submits per material (ColonyMap wires it).
      // materials[0] is the default (file walls, the editor, streamed occupancy views).
      materials: [
        {
          key: "brick",
          id: 1,
          name: "BUILD_WALL",
          sprite: "spr_tex_brick",
          color: "#707888",
        },
        {
          key: "concrete",
          id: 2,
          name: "BUILD_WALL_CONCRETE",
          sprite: "spr_tex_concrete",
          color: "#9aa0a4",
        },
        {
          key: "metal",
          id: 3,
          name: "BUILD_WALL_METAL",
          sprite: "spr_tex_metal",
          color: "#7d8a96",
        },
        {
          key: "plank",
          id: 4,
          name: "BUILD_WALL_PLANK",
          sprite: "spr_tex_plank",
          color: "#a08050",
        },
      ],
    },
    {
      key: "fence",
      id: 1,
      name: "BUILD_FENCE",
      type: 16,
      sprite: "spr_tile16",
      color: "#8a6d3b",
      solid: true,
      pathCost: null,
    },
  ],

  /** LAYERS entry by key (BuildMode reads `solid`/`materials` off it). */
  get(key) {
    for (let i = 0; i < this.LAYERS.length; i++)
      if (this.LAYERS[i].key === key) return this.LAYERS[i];
    return undefined;
  },
};
