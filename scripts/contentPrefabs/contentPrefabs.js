// Colony overworld prefabs stamped by the overworld generator. Registered at level create() (NOT
// top-level — GMRT load-order), before the generator is built (PrefabStamp resolves Prefab.byTag).
// A def body is a LevelData in footprint-local coords — see Prefab.
globalThis.contentPrefabs = {
  register() {
    Prefab.register([
      // terrain flavor, no enemies — rock mesh entities (same rects the old collide-only
      // walls covered; the `rock` adapter branch rebuilds the identical solid footprint)
      {
        id: "boulder_cluster",
        tags: ["overworld"],
        weight: 4,
        cols: 4,
        rows: 4,
        spawns: [
          { preset: "rock", gx: 0, gy: 0, w: 1, h: 2 },
          { preset: "rock", gx: 2, gy: 0, w: 1, h: 1 },
          { preset: "rock", gx: 1, gy: 2, w: 2, h: 1 },
          { preset: "rock", gx: 3, gy: 3, w: 1, h: 1 },
        ],
      },
      // sheltered corner with a raider pack (one tougher)
      {
        id: "raider_camp",
        tags: ["overworld"],
        weight: 3,
        cols: 5,
        rows: 5,
        tiles: [
          {
            layer: "wall",
            rects: [
              [0, 0, 3, 1],
              [0, 1, 1, 2],
            ],
          },
        ],
        spawns: [
          { preset: "raider", gx: 3, gy: 2, hp: 3 },
          { preset: "raider", gx: 2, gy: 3, hp: 3 },
          { preset: "raider", gx: 4, gy: 4, hp: 5 },
        ],
      },
      // broken walls around a loot chest
      {
        id: "ruin",
        tags: ["overworld"],
        weight: 1,
        cols: 6,
        rows: 4,
        tiles: [
          {
            layer: "wall",
            rects: [
              [0, 0, 4, 1],
              [0, 1, 1, 2],
              [5, 0, 1, 3],
            ],
          },
        ],
        spawns: [
          {
            preset: "chest",
            gx: 2,
            gy: 2,
            capacity: 8,
            items: [
              { itemId: "coin", qty: 5 },
              { itemId: "scrap_metal", qty: 2 },
            ],
          },
        ],
      },
    ]);
  },
};
