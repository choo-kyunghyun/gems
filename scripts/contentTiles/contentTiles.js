/**
 * The colony's tile material data: pure data plus its by-key lookup, no registration step.
 *
 * LAYERS is the layer stack, bottom→top: autotiling reads occupancy, not tile type, so materials
 * with different autotile modes can't share a layer, and those that can share one carry it as
 * `materials`, per-cell tile types with `materials[0]` the default. `type`: "dual" corner-grid,
 * 0 raw single-frame, 16 blob4, 47 blob8. `pathCost: null` blocks; order is nav priority (top
 * wins). `name` is an I18n key, resolved at build since top level runs before the locale loads.
 */
globalThis.contentTiles = {
  LAYERS: [
    {
      key: "terrain",
      id: 1,
      name: "TILE_TERRAIN",
      type: "dual",
      sprite: pixTileDual,
      // desaturated olive matching the grass base
      color: "#79825a",
      solid: false,
      pathCost: 1,
      emptyCost: 1,
    },
    {
      // a generated map holds it empty until the player builds
      key: "floor",
      name: "BUILD_FLOOR",
      type: 0,
      color: "#aa9472",
      solid: false,
      pathCost: 1,
      // each material draws from its own sheet; a material id is non-zero, as 0 reads as empty
      materials: [
        {
          key: "parquet",
          id: 1,
          name: "BUILD_FLOOR",
          sprite: pixTexPlaid,
          color: "#aa9472",
        },
        {
          key: "tile",
          id: 2,
          name: "BUILD_FLOOR_TILE",
          sprite: pixTexTile,
          color: "#9dadb2",
        },
        {
          key: "carpet",
          id: 3,
          name: "BUILD_FLOOR_CARPET",
          sprite: pixTexCarpet,
          color: "#a05a50",
        },
        {
          key: "mosaic",
          id: 4,
          name: "BUILD_FLOOR_MOSAIC",
          sprite: pixTexMosaic,
          color: "#7096a8",
        },
      ],
    },
    {
      // drawn only as lit boxes, so no `type`/`sprite`: there is no flat tilemap fallback
      key: "wall",
      id: 1,
      name: "BUILD_WALL",
      color: "#707888",
      solid: true,
      pathCost: null,
      // Wall materials are per-cell tile types within this one solid layer, so collision and
      // nav stay untouched by a material swap. materials[0] is the default.
      materials: [
        {
          key: "brick",
          id: 1,
          name: "BUILD_WALL",
          sprite: pixTexBrick,
          color: "#707888",
        },
        {
          key: "concrete",
          id: 2,
          name: "BUILD_WALL_CONCRETE",
          sprite: pixTexConcrete,
          color: "#9aa0a4",
        },
        {
          key: "metal",
          id: 3,
          name: "BUILD_WALL_METAL",
          sprite: pixTexMetal,
          color: "#7d8a96",
        },
        {
          key: "plank",
          id: 4,
          name: "BUILD_WALL_PLANK",
          sprite: pixTexPlank,
          color: "#a08050",
        },
      ],
    },
    {
      // a pitched map draws lit post-and-rail boxes; the sheet and tint are the flat fallback
      key: "fence",
      id: 1,
      name: "BUILD_FENCE",
      type: 16,
      sprite: pixTile16,
      color: "#8a6d3b",
      solid: true,
      pathCost: null,
    },
  ],

  get(key) {
    for (let i = 0; i < contentTiles.LAYERS.length; i++)
      if (contentTiles.LAYERS[i].key === key) return contentTiles.LAYERS[i];
    return undefined;
  },
};
