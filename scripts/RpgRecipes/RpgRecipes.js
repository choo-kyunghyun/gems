// RPG crafting recipes (Station kind "workbench"). Inputs are pulled from, and the output
// deposited into, the player's bag (CraftSystem). Registered once by RpgContent.register() at a
// scene's create() (NOT at top level — avoids GMRT load-order issues).
globalThis.RpgRecipes = {
  register() {
    Recipe.register([
      {
        id: "craft_wood_sword",
        station: "workbench",
        inputs: [{ itemId: "wood", qty: 3 }],
        output: { itemId: "wood_sword", qty: 1 },
      },
      {
        id: "craft_potion",
        station: "workbench",
        inputs: [
          { itemId: "slime_gel", qty: 2 },
          { itemId: "wood", qty: 1 },
        ],
        output: { itemId: "potion", qty: 1 },
      },
      {
        id: "craft_leather_armor",
        station: "workbench",
        inputs: [{ itemId: "iron", qty: 2 }],
        output: { itemId: "leather_armor", qty: 1 },
      },
      // Buff consumables (Buff/Status system): Tonic = Regen, Elixir = Fortify.
      {
        id: "craft_tonic",
        station: "workbench",
        inputs: [{ itemId: "slime_gel", qty: 3 }],
        output: { itemId: "tonic", qty: 1 },
      },
      {
        id: "craft_elixir",
        station: "workbench",
        inputs: [
          { itemId: "iron", qty: 2 },
          { itemId: "slime_gel", qty: 2 },
        ],
        output: { itemId: "elixir", qty: 1 },
      },
      // Survival drink + foods (cooking abstraction over current mats; farming/fishing is roadmap).
      {
        id: "craft_water_bottle",
        station: "workbench",
        inputs: [{ itemId: "slime_gel", qty: 1 }],
        output: { itemId: "water_bottle", qty: 1 },
      },
      {
        id: "craft_bread",
        station: "workbench",
        inputs: [{ itemId: "wood", qty: 2 }],
        output: { itemId: "bread", qty: 1 },
      },
      {
        id: "craft_cooked_meat",
        station: "workbench",
        inputs: [
          { itemId: "slime_gel", qty: 2 },
          { itemId: "wood", qty: 1 },
        ],
        output: { itemId: "cooked_meat", qty: 1 },
      },
      // Attribute-boost shards — the crafted, item-driven path to permanent growth (no leveling).
      // Each costs a gem (rare drop) + a themed common material, so growth is gated on gathering,
      // not playtime. One per StatModel.ATTRS key.
      {
        id: "craft_power_shard",
        station: "workbench",
        inputs: [
          { itemId: "gem", qty: 1 },
          { itemId: "iron", qty: 3 },
        ],
        output: { itemId: "power_shard", qty: 1 },
      },
      {
        id: "craft_vitality_shard",
        station: "workbench",
        inputs: [
          { itemId: "gem", qty: 1 },
          { itemId: "slime_gel", qty: 4 },
        ],
        output: { itemId: "vitality_shard", qty: 1 },
      },
      {
        id: "craft_agility_shard",
        station: "workbench",
        inputs: [
          { itemId: "gem", qty: 1 },
          { itemId: "wood", qty: 4 },
        ],
        output: { itemId: "agility_shard", qty: 1 },
      },
      {
        id: "craft_endurance_shard",
        station: "workbench",
        inputs: [
          { itemId: "gem", qty: 1 },
          { itemId: "iron", qty: 2 },
        ],
        output: { itemId: "endurance_shard", qty: 1 },
      },
    ]);
  },
};
