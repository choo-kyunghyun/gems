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
    ]);
  },
};
