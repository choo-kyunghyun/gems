// Shared RPG content for both genre templates (platformer + top-down): the common
// rarity tiers, the universal item set (consumables / armor / trinket / crafting
// materials), and the workbench recipes. Each genre's *Content module calls
// RpgContent.register() first, then registers its own extras (genre weapons + unique
// items, and — top-down — quests/achievements). Idempotent; called from a scene's
// create() (not at top level — avoids GMRT load-order issues).
//
// Genre WEAPONS are deliberately NOT here: `wood_sword` is melee in the platformer but
// ranged in top-down, and `blaster` differs in cadence — each genre registers its own.
const RPG_RARITIES = [
  { id: "common", name: "RARITY_COMMON", color: "#b0b0b0", valueMod: 1 },
  { id: "uncommon", name: "RARITY_UNCOMMON", color: "#4caf50", valueMod: 2 },
  { id: "rare", name: "RARITY_RARE", color: "#2196f3", valueMod: 5 },
  { id: "epic", name: "RARITY_EPIC", color: "#9c27b0", valueMod: 12 },
  { id: "legendary", name: "RARITY_LEGENDARY", color: "#ff9800", valueMod: 30 },
];

globalThis.RpgContent = {
  registered: false,

  register() {
    if (this.registered) return;
    this.registered = true;

    Rarity.register(RPG_RARITIES);

    Item.register([
      // Loot trash + currency-ish.
      {
        id: "slime_gel",
        name: "ITEM_SLIME_GEL",
        weight: 1,
        value: 2,
        rarity: "common",
      },
      // Consumable — heals from the bag.
      {
        id: "potion",
        name: "ITEM_POTION",
        weight: 1,
        value: 10,
        rarity: "uncommon",
        components: [new Consumable({ heal: 5 })],
      },
      // Armor + trinket (flat Stats deltas while worn).
      {
        id: "leather_armor",
        name: "ITEM_LEATHER_ARMOR",
        stack: 1,
        weight: 8,
        value: 20,
        rarity: "uncommon",
        components: [
          new Equippable({ slot: "armor", mods: { defense: 2, maxHp: 5 } }),
        ],
      },
      {
        id: "swift_ring",
        name: "ITEM_SWIFT_RING",
        stack: 1,
        weight: 1,
        value: 40,
        rarity: "rare",
        components: [new Equippable({ slot: "trinket", mods: { speed: 40 } })],
      },
      // Crafting materials (no behavior — consumed by Recipes at a workbench).
      { id: "wood", name: "ITEM_WOOD", weight: 1, value: 1, rarity: "common" },
      { id: "iron", name: "ITEM_IRON", weight: 2, value: 4, rarity: "common" },
    ]);

    // Workbench recipes (Station kind "workbench"). Inputs are pulled from, and the
    // output deposited into, the player's bag (CraftSystem). `wood_sword` is registered
    // per genre, but the recipe only references its id, so it resolves either variant.
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
