/**
 * Colony loot tables, each rolled into the carry of a generated body.
 */
globalThis.contentLoot = {
  register() {
    LootTable.register([
      // a wilderness raider that authored none
      {
        id: "raider",
        pools: [
          { entries: [{ itemId: "cloth", qty: [1, 2] }] },
          {
            entries: [
              { weight: 60 },
              { itemId: "coin", qty: [1, 3], weight: 25 },
              { itemId: "floppy_disk", weight: 15 },
            ],
          },
        ],
      },
      {
        id: "rat",
        pools: [{ entries: [{ weight: 1 }, { itemId: "raw_meat", weight: 1 }] }],
      },
    ]);
  },
};
