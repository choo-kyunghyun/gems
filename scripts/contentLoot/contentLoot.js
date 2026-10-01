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
      // a supply crate's haul: a supply, a material, and a rare find
      {
        id: "supply_crate",
        pools: [
          {
            entries: [
              { itemId: "bandage", qty: [1, 3], weight: 30 },
              { itemId: "first_aid_kit", weight: 10 },
              { itemId: "water_bottle", qty: [1, 2], weight: 20 },
              { itemId: "canned_tuna", weight: 20 },
              { itemId: "energy_bar", qty: [1, 2], weight: 20 },
            ],
          },
          {
            entries: [
              { itemId: "scrap_metal", qty: [1, 3], weight: 35 },
              { itemId: "plank", qty: [2, 4], weight: 35 },
              { itemId: "coin", qty: [5, 15], weight: 30 },
            ],
          },
          {
            entries: [
              { weight: 80 },
              { itemId: "floppy_disk", weight: 10 },
              { itemId: "helmet", weight: 6 },
              { itemId: "body_armor", weight: 4 },
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
