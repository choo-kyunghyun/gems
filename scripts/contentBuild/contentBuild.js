/**
 * The colony's build catalog.
 *
 * Pure data plus its lookups, no registration step (a plain top-level literal, like contentTiles).
 * An item is one of two kinds: a TILE (`layer` names the contentTiles.LAYERS key it edits, `mat`
 * a wall's per-cell material) or an ENTITY, whose `spawn` fields lay over the build descriptor
 * defaults — a "prop" preset at the cell, named by the item's label — before ColonySpawn.spawnEntity
 * reads them (the adapter is BuildMode.descriptor; `orient` turns the door vertical in a N-S wall
 * run). `cost` is wood per placement; `id` is the token persisted in the level's build record and
 * the map cache, so it MUST be unique across the catalog; `species` marks a crop (a contentFlora
 * id) whose ground gates the cell. A new buildable is an entry here, never a BuildMode edit.
 */
globalThis.contentBuild = {
  CATEGORIES: [
    {
      labelKey: "BUILD_CAT_TILES",
      items: [
        {
          id: "wall",
          labelKey: "BUILD_WALL",
          cost: 1,
          kind: "tile",
          layer: "wall",
          mat: "brick",
        },
        {
          id: "wall_concrete",
          labelKey: "BUILD_WALL_CONCRETE",
          cost: 2,
          kind: "tile",
          layer: "wall",
          mat: "concrete",
        },
        {
          id: "wall_metal",
          labelKey: "BUILD_WALL_METAL",
          cost: 3,
          kind: "tile",
          layer: "wall",
          mat: "metal",
        },
        {
          id: "wall_plank",
          labelKey: "BUILD_WALL_PLANK",
          cost: 1,
          kind: "tile",
          layer: "wall",
          mat: "plank",
        },
        // the fence layer — solid like a wall (own colliders + nav block), drawn by RenderFence as
        // post-and-rail boxes joined to their 4-neighbors. The id predates the tile form: a
        // blueprint's built-entity record carrying it lands as this tile (Blueprint.stamp).
        {
          id: "fence",
          labelKey: "BUILD_FENCE",
          cost: 1,
          kind: "tile",
          layer: "fence",
        },
        {
          id: "floor",
          labelKey: "BUILD_FLOOR",
          cost: 1,
          kind: "tile",
          layer: "floor",
        },
        {
          id: "floor_tile",
          labelKey: "BUILD_FLOOR_TILE",
          cost: 1,
          kind: "tile",
          layer: "floorTile",
        },
        {
          id: "floor_carpet",
          labelKey: "BUILD_FLOOR_CARPET",
          cost: 2,
          kind: "tile",
          layer: "floorCarpet",
        },
        {
          id: "floor_mosaic",
          labelKey: "BUILD_FLOOR_MOSAIC",
          cost: 2,
          kind: "tile",
          layer: "floorMosaic",
        },
      ],
    },
    {
      // furniture: solid props over the vox models (contentPresets.FURN_MODELS by `furn`, a mesh
      // per Interaction `kind`); colliders come from the voxel footprint, no per-item wiring
      labelKey: "BUILD_CAT_FURNITURE",
      items: [
        {
          id: "crate",
          labelKey: "BUILD_CRATE",
          cost: 2,
          kind: "entity",
          spawn: { furn: "crate" },
        },
        {
          id: "barrel",
          labelKey: "BUILD_BARREL",
          cost: 2,
          kind: "entity",
          spawn: { furn: "barrel" },
        },
        // openable door (the "door" InteractAction toggles Collision.solid), auto-oriented at placement
        {
          id: "door",
          labelKey: "BUILD_DOOR",
          cost: 4,
          kind: "entity",
          spawn: { kind: "door" },
          orient: true,
        },
        // the "bed" InteractAction routes E to scene.sleep (fast-forward + drain Drowsiness)
        {
          id: "bed",
          labelKey: "BUILD_BED",
          cost: 6,
          kind: "entity",
          spawn: { kind: "bed", color: "#b06a4f" },
        },
        // cheaper cot: the same sleep Interaction over the bunk mesh
        {
          id: "cot",
          labelKey: "BUILD_COT",
          cost: 4,
          kind: "entity",
          spawn: { kind: "bed", furn: "cot" },
        },
        {
          id: "table",
          labelKey: "BUILD_TABLE",
          cost: 4,
          kind: "entity",
          spawn: { furn: "table" },
        },
        {
          id: "table_coffee",
          labelKey: "BUILD_TABLE_COFFEE",
          cost: 3,
          kind: "entity",
          spawn: { furn: "table_coffee" },
        },
        {
          id: "table_small",
          labelKey: "BUILD_TABLE_SMALL",
          cost: 3,
          kind: "entity",
          spawn: { furn: "table_small" },
        },
        {
          id: "dresser",
          labelKey: "BUILD_DRESSER",
          cost: 5,
          kind: "entity",
          spawn: { furn: "dresser" },
        },
        {
          id: "dresser_double",
          labelKey: "BUILD_DRESSER_DOUBLE",
          cost: 7,
          kind: "entity",
          spawn: { furn: "dresser_double" },
        },
        {
          id: "stool",
          labelKey: "BUILD_STOOL",
          cost: 1,
          kind: "entity",
          spawn: { furn: "stool" },
        },
        {
          id: "stool_round",
          labelKey: "BUILD_STOOL_ROUND",
          cost: 1,
          kind: "entity",
          spawn: { furn: "stool_round" },
        },
        {
          id: "nightstand",
          labelKey: "BUILD_NIGHTSTAND",
          cost: 2,
          kind: "entity",
          spawn: { furn: "nightstand" },
        },
      ],
    },
    {
      labelKey: "BUILD_CAT_LIGHTING",
      items: [
        {
          id: "torch",
          labelKey: "BUILD_TORCH",
          cost: 3,
          kind: "entity",
          spawn: { preset: "torch", color: "#ff9a3c" },
        },
        // standing lantern — steadier, wider, whiter light than the torch
        {
          id: "lantern",
          labelKey: "BUILD_LANTERN",
          cost: 5,
          kind: "entity",
          spawn: { preset: "lantern" },
        },
      ],
    },
    {
      labelKey: "BUILD_CAT_STATIONS",
      items: [
        {
          id: "chest",
          labelKey: "BUILD_CHEST",
          cost: 5,
          kind: "entity",
          spawn: { preset: "chest", capacity: 12 },
        },
        {
          id: "workbench",
          labelKey: "BUILD_WORKBENCH",
          cost: 8,
          kind: "entity",
          spawn: { kind: "workbench", color: "#6b8caa" },
        },
      ],
    },
    {
      labelKey: "BUILD_CAT_DEFENSE",
      items: [
        {
          id: "turret",
          labelKey: "BUILD_TURRET",
          cost: 10,
          kind: "entity",
          spawn: { preset: "turret" },
        },
      ],
    },
    {
      // survival stations — props carrying an Interaction whose InteractAction acts on the player
      // (hydrate / feed / buff); the action is data (contentInteractions)
      labelKey: "BUILD_CAT_SURVIVAL",
      items: [
        {
          id: "watertank",
          labelKey: "BUILD_WATERTANK",
          cost: 4,
          kind: "entity",
          spawn: { kind: "hydrate" },
        },
        {
          id: "rationbox",
          labelKey: "BUILD_RATIONBOX",
          cost: 4,
          kind: "entity",
          spawn: { kind: "feed" },
        },
        {
          id: "shrine",
          labelKey: "BUILD_SHRINE",
          cost: 12,
          kind: "entity",
          spawn: { kind: "buff" },
        },
      ],
    },
    {
      // crops — a `plant` species (contentFlora) put down as a seedling; FloraSystem grows it and
      // serves its harvest
      labelKey: "BUILD_CAT_FARMING",
      items: [
        {
          id: "wheat",
          labelKey: "BUILD_WHEAT",
          cost: 1,
          kind: "entity",
          species: "wheat",
          spawn: { preset: "plant", species: "wheat", progress: 0 },
        },
        {
          id: "berry_bush",
          labelKey: "BUILD_BERRY_BUSH",
          cost: 2,
          kind: "entity",
          species: "berry_bush",
          spawn: { preset: "plant", species: "berry_bush", progress: 0 },
        },
      ],
    },
  ],

  /** the item under `id` (a persisted build-record token back to its layer / cost), else undefined */
  item(id) {
    for (let c = 0; c < contentBuild.CATEGORIES.length; c++) {
      const items = contentBuild.CATEGORIES[c].items;
      for (let i = 0; i < items.length; i++)
        if (items[i].id === id) return items[i];
    }
    return undefined;
  },

  /** the tile item painting (layer, material) — `material` undefined is the layer's default */
  tileItem(layer, material) {
    for (let c = 0; c < contentBuild.CATEGORIES.length; c++) {
      const items = contentBuild.CATEGORIES[c].items;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "tile" && it.layer === layer && it.mat === material)
          return it;
      }
    }
    return undefined;
  },

  // the distinct layer keys the tile items edit (derived once) — the cell-occupancy check spans
  // them all, so one built thing per cell across every wall/floor variant
  _tileLayers: null,
  tileLayers() {
    if (contentBuild._tileLayers !== null) return contentBuild._tileLayers;
    const keys = [];
    for (let c = 0; c < contentBuild.CATEGORIES.length; c++) {
      const items = contentBuild.CATEGORIES[c].items;
      for (let i = 0; i < items.length; i++)
        if (items[i].kind === "tile" && keys.indexOf(items[i].layer) === -1)
          keys.push(items[i].layer);
    }
    contentBuild._tileLayers = keys;
    return keys;
  },
};
