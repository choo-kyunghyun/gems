/**
 * The colony's build catalog: pure data plus its lookups, no registration step.
 *
 * An item is a TILE (`layer` the tile layer it edits, `mat` a wall's per-cell material) or an
 * ENTITY, whose `spawn` fields lay over the build descriptor defaults (`orient` turns it to match
 * a N-S wall run). `cost` is wood per placement; `id` is persisted in saves, so it MUST be unique
 * across the catalog; `species` marks a crop whose ground gates the cell. A new buildable is an
 * entry here, never a code edit.
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
        // solid like a wall, with its own colliders; a built-entity record carrying this id lands
        // as the tile
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
          mat: "parquet",
        },
        {
          id: "floor_tile",
          labelKey: "BUILD_FLOOR_TILE",
          cost: 1,
          kind: "tile",
          layer: "floor",
          mat: "tile",
        },
        {
          id: "floor_carpet",
          labelKey: "BUILD_FLOOR_CARPET",
          cost: 2,
          kind: "tile",
          layer: "floor",
          mat: "carpet",
        },
        {
          id: "floor_mosaic",
          labelKey: "BUILD_FLOOR_MOSAIC",
          cost: 2,
          kind: "tile",
          layer: "floor",
          mat: "mosaic",
        },
      ],
    },
    {
      // solid props; colliders come from the model's footprint, no per-item wiring
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
        // openable, auto-oriented at placement
        {
          id: "door",
          labelKey: "BUILD_DOOR",
          cost: 4,
          kind: "entity",
          spawn: { kind: "door" },
          orient: true,
        },
        {
          id: "bed",
          labelKey: "BUILD_BED",
          cost: 6,
          kind: "entity",
          spawn: { kind: "bed", color: "#b06a4f" },
        },
        // a cheaper bed
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
        // steadier, wider, whiter light than the torch
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
      // props whose Interaction acts on the player
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
      // crops, put down as a seedling
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

  item(id) {
    for (let c = 0; c < contentBuild.CATEGORIES.length; c++) {
      const items = contentBuild.CATEGORIES[c].items;
      for (let i = 0; i < items.length; i++)
        if (items[i].id === id) return items[i];
    }
    return undefined;
  },

  /** The tile item painting (layer, material); undefined `material` matches an item with no `mat`. */
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

  // the distinct layer keys the tile items edit, derived once
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
