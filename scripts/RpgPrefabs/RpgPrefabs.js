// RPG overworld prefabs stamped by the overworld generator. Registered at level create() (NOT
// top-level — GMRT load-order), before the generator is built (PrefabStamp resolves Prefab.byTag
// in its constructor).
globalThis.RpgPrefabs = {
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
          { preset: "rock", lx: 0, ly: 0, w: 1, h: 2 },
          { preset: "rock", lx: 2, ly: 0, w: 1, h: 1 },
          { preset: "rock", lx: 1, ly: 2, w: 2, h: 1 },
          { preset: "rock", lx: 3, ly: 3, w: 1, h: 1 },
        ],
      },
      // sheltered corner with a raider pack (one tougher)
      {
        id: "raider_camp",
        tags: ["overworld"],
        weight: 3,
        cols: 5,
        rows: 5,
        walls: [
          [0, 0, 3, 1],
          [0, 1, 1, 2],
        ],
        spawns: [
          { preset: "raider", lx: 3, ly: 2, hp: 3 },
          { preset: "raider", lx: 2, ly: 3, hp: 3 },
          { preset: "raider", lx: 4, ly: 4, hp: 5 },
        ],
      },
      // broken walls around a loot chest
      {
        id: "ruin",
        tags: ["overworld"],
        weight: 1,
        cols: 6,
        rows: 4,
        walls: [
          [0, 0, 4, 1],
          [0, 1, 1, 2],
          [5, 0, 1, 3],
        ],
        spawns: [
          {
            preset: "chest",
            lx: 2,
            ly: 2,
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
