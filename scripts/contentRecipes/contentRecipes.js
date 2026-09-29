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

      // furniture and stations, set down from the bag
      {
        id: "craft_crate",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 2 }],
        output: { itemId: "crate", qty: 1 },
      },
      {
        id: "craft_barrel",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 2 }],
        output: { itemId: "barrel", qty: 1 },
      },
      {
        id: "craft_bed",
        tag: "basic",
        inputs: [
          { itemId: "plank", qty: 4 },
          { itemId: "cloth", qty: 2 },
        ],
        output: { itemId: "bed", qty: 1 },
      },
      {
        id: "craft_cot",
        tag: "basic",
        inputs: [
          { itemId: "plank", qty: 3 },
          { itemId: "cloth", qty: 1 },
        ],
        output: { itemId: "cot", qty: 1 },
      },
      {
        id: "craft_table",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 4 }],
        output: { itemId: "table", qty: 1 },
      },
      {
        id: "craft_table_coffee",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 3 }],
        output: { itemId: "table_coffee", qty: 1 },
      },
      {
        id: "craft_table_small",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 3 }],
        output: { itemId: "table_small", qty: 1 },
      },
      {
        id: "craft_dresser",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 5 }],
        output: { itemId: "dresser", qty: 1 },
      },
      {
        id: "craft_dresser_double",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 7 }],
        output: { itemId: "dresser_double", qty: 1 },
      },
      {
        id: "craft_stool",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 1 }],
        output: { itemId: "stool", qty: 1 },
      },
      {
        id: "craft_stool_round",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 1 }],
        output: { itemId: "stool_round", qty: 1 },
      },
      {
        id: "craft_nightstand",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 2 }],
        output: { itemId: "nightstand", qty: 1 },
      },
      {
        id: "craft_torch",
        tag: "basic",
        inputs: [
          { itemId: "plank", qty: 2 },
          { itemId: "cloth", qty: 1 },
        ],
        output: { itemId: "torch", qty: 1 },
      },
      {
        id: "craft_lantern",
        tag: "basic",
        inputs: [
          { itemId: "plank", qty: 1 },
          { itemId: "scrap_metal", qty: 2 },
        ],
        output: { itemId: "lantern", qty: 1 },
      },
      {
        id: "craft_chest",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 5 }],
        output: { itemId: "chest", qty: 1 },
      },
      {
        id: "craft_watertank",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 4 }],
        output: { itemId: "watertank", qty: 1 },
      },
      {
        id: "craft_rationbox",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 4 }],
        output: { itemId: "rationbox", qty: 1 },
      },
      {
        id: "craft_shrine",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 12 }],
        output: { itemId: "shrine", qty: 1 },
      },
      {
        id: "craft_workbench",
        tag: "basic",
        inputs: [{ itemId: "plank", qty: 8 }],
        output: { itemId: "workbench", qty: 1 },
      },
      {
        id: "craft_medical_bench",
        tag: "basic",
        inputs: [
          { itemId: "plank", qty: 6 },
          { itemId: "cloth", qty: 2 },
        ],
        output: { itemId: "medical_bench", qty: 1 },
      },
      {
        id: "craft_cooking_bench",
        tag: "basic",
        inputs: [
          { itemId: "plank", qty: 6 },
          { itemId: "scrap_metal", qty: 2 },
        ],
        output: { itemId: "cooking_bench", qty: 1 },
      },
      {
        id: "craft_machining_bench",
        tag: "basic",
        inputs: [
          { itemId: "plank", qty: 6 },
          { itemId: "scrap_metal", qty: 4 },
        ],
        output: { itemId: "machining_bench", qty: 1 },
      },
      {
        id: "craft_mod_bench",
        tag: "machining",
        inputs: [
          { itemId: "plank", qty: 6 },
          { itemId: "scrap_metal", qty: 4 },
        ],
        output: { itemId: "mod_bench", qty: 1 },
      },

      {
        id: "craft_turret",
        tag: "machining",
        inputs: [
          { itemId: "plank", qty: 4 },
          { itemId: "scrap_metal", qty: 6 },
        ],
        output: { itemId: "turret", qty: 1 },
      },
      {
        id: "craft_machine_gun_mount",
        tag: "machining",
        inputs: [
          { itemId: "plank", qty: 5 },
          { itemId: "scrap_metal", qty: 10 },
        ],
        output: { itemId: "machine_gun_mount", qty: 1 },
      },
    ]);
  },
};
