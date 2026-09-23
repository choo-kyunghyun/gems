/**
 * The colony's tile material data: pure data plus its by-key lookup, no registration step.
 *
 * LAYERS is the layer stack, bottom→top, one material each: autotiling reads occupancy, not
 * tile type, so materials with different autotile modes can't share a layer. `type`: "dual"
 * corner-grid, 0 raw single-frame, 16 blob4, 47 blob8; a type-0 layer's id is its frame index.
 * `pathCost: null` blocks; order is nav priority (top wins). `name` is an I18n key, resolved at
 * build since top level runs before the locale loads.
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
      key: "floor",
      // a type-0 id is the frame index, and must be non-zero: 0 reads as empty
      id: 1,
      name: "BUILD_FLOOR",
      type: 0,
      sprite: pixTexPlaid,
      color: "#aa9472",
      solid: false,
      pathCost: 1,
    },
    // Floor variants, one layer per material; a generated map holds them empty until the
    // player builds.
    {
      key: "floorTile",
      id: 1,
      name: "BUILD_FLOOR_TILE",
      type: 0,
      sprite: pixTexTile,
      color: "#9dadb2",
      solid: false,
      pathCost: 1,
    },
    {
      key: "floorCarpet",
      id: 1,
      name: "BUILD_FLOOR_CARPET",
      type: 0,
      sprite: pixTexCarpet,
      color: "#a05a50",
      solid: false,
      pathCost: 1,
    },
    {
      key: "floorMosaic",
      id: 1,
      name: "BUILD_FLOOR_MOSAIC",
      type: 0,
      sprite: pixTexMosaic,
      color: "#7096a8",
      solid: false,
      pathCost: 1,
    },
    {
      // drawn only as lit boxes, so no `type`/`sprite`: there is no flat tilemap fallback
      key: "wall",
      id: 1,
      name: "BUILD_WALL",
      color: "#707888",
      solid: true,
      pathCost: null,
      // Wall materials are per-cell tile types within this one solid layer, so colliders and
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
