/**
 * Colony crafting recipes, all made at a bare workbench.
 */
globalThis.contentRecipes = {
  register() {
    Recipe.register([
      {
        id: "craft_bandage",
        station: "workbench",
        inputs: [{ itemId: "cloth", qty: 1 }],
        output: { itemId: "bandage", qty: 2 },
      },
      {
        id: "craft_first_aid_kit",
        station: "workbench",
        inputs: [
          { itemId: "bandage", qty: 2 },
          { itemId: "ointment", qty: 1 },
          { itemId: "cloth", qty: 1 },
        ],
        output: { itemId: "first_aid_kit", qty: 1 },
      },
      {
        id: "craft_cooked_meat",
        station: "workbench",
        inputs: [
          { itemId: "raw_meat", qty: 1 },
          { itemId: "plank", qty: 1 },
        ],
        output: { itemId: "cooked_meat", qty: 1 },
      },
      {
        id: "craft_tarp",
        station: "workbench",
        inputs: [{ itemId: "cloth", qty: 3 }],
        output: { itemId: "tarp", qty: 1 },
      },

      {
        id: "craft_iron_pipe",
        station: "workbench",
        inputs: [{ itemId: "scrap_metal", qty: 2 }],
        output: { itemId: "iron_pipe", qty: 1 },
      },
      {
        id: "craft_spanner",
        station: "workbench",
        inputs: [{ itemId: "scrap_metal", qty: 3 }],
        output: { itemId: "spanner", qty: 1 },
      },
      {
        id: "craft_kitchen_knife",
        station: "workbench",
        inputs: [
          { itemId: "scrap_metal", qty: 2 },
          { itemId: "plank", qty: 1 },
        ],
        output: { itemId: "kitchen_knife", qty: 1 },
      },

      // hand-loaded rounds: the guns themselves are issue-only
      {
        id: "craft_pistol_ammo",
        station: "workbench",
        inputs: [{ itemId: "scrap_metal", qty: 1 }],
        output: { itemId: "pistol_ammo", qty: 12 },
      },
      {
        id: "craft_rifle_ammo",
        station: "workbench",
        inputs: [{ itemId: "scrap_metal", qty: 2 }],
        output: { itemId: "rifle_ammo", qty: 10 },
      },
      {
        id: "craft_sniper_ammo",
        station: "workbench",
        inputs: [{ itemId: "scrap_metal", qty: 3 }],
        output: { itemId: "sniper_ammo", qty: 5 },
      },
    ]);
  },
};
