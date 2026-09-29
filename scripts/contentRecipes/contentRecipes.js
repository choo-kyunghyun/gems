/**
 * Colony crafting recipes, each made at a bench carrying its tag.
 */
globalThis.contentRecipes = {
  register() {
    Recipe.register([
      {
        id: "craft_bandage",
        tag: "basic",
        inputs: [{ itemId: "cloth", qty: 1 }],
        output: { itemId: "bandage", qty: 2 },
      },
      {
        id: "craft_first_aid_kit",
        tag: "medical",
        inputs: [
          { itemId: "bandage", qty: 2 },
          { itemId: "ointment", qty: 1 },
          { itemId: "cloth", qty: 1 },
        ],
        output: { itemId: "first_aid_kit", qty: 1 },
      },
      {
        id: "craft_cooked_meat",
        tag: "cooking",
        inputs: [
          { itemId: "raw_meat", qty: 1 },
          { itemId: "plank", qty: 1 },
        ],
        output: { itemId: "cooked_meat", qty: 1 },
      },
      {
        id: "craft_tarp",
        tag: "basic",
        inputs: [{ itemId: "cloth", qty: 3 }],
        output: { itemId: "tarp", qty: 1 },
      },

      {
        id: "craft_iron_pipe",
        tag: "machining",
        inputs: [{ itemId: "scrap_metal", qty: 2 }],
        output: { itemId: "iron_pipe", qty: 1 },
      },
      {
        id: "craft_spanner",
        tag: "machining",
        inputs: [{ itemId: "scrap_metal", qty: 3 }],
        output: { itemId: "spanner", qty: 1 },
      },
      {
        id: "craft_kitchen_knife",
        tag: "machining",
        inputs: [
          { itemId: "scrap_metal", qty: 2 },
          { itemId: "plank", qty: 1 },
        ],
        output: { itemId: "kitchen_knife", qty: 1 },
      },

      // hand-loaded rounds: the guns themselves are issue-only
      {
        id: "craft_pistol_ammo",
        tag: "machining",
        inputs: [{ itemId: "scrap_metal", qty: 1 }],
        output: { itemId: "pistol_ammo", qty: 12 },
      },
      {
        id: "craft_rifle_ammo",
        tag: "machining",
        inputs: [{ itemId: "scrap_metal", qty: 2 }],
        output: { itemId: "rifle_ammo", qty: 10 },
      },
      {
        id: "craft_sniper_ammo",
        tag: "machining",
        inputs: [{ itemId: "scrap_metal", qty: 3 }],
        output: { itemId: "sniper_ammo", qty: 5 },
      },
    ]);
  },
};
