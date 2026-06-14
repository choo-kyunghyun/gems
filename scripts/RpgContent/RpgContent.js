// Shared RPG content for both genre templates (platformer + top-down): the rarity tiers,
// the full item set (consumables / weapons / armor / trinket / unique items / crafting
// materials), and the workbench recipes. Both genres now register the SAME items —
// `wood_sword` is melee and `blaster` is ranged in BOTH (each controller honors a weapon's
// `melee` flag, swinging or firing accordingly). The only per-genre content left is
// top-down's quests + achievements (in RpgQuests; platformer has none). Idempotent;
// called from a scene's create() (not at top level — avoids GMRT load-order issues).
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
      // Weapons. wood_sword = melee (swings a hitbox in the facing dir); blaster = ranged
      // (cursor-aimed bullet). Each controller picks melee-swing vs fire by the `melee`
      // flag, so both work in both genres.
      {
        id: "wood_sword",
        name: "ITEM_WOOD_SWORD",
        stack: 1,
        weight: 4,
        value: 8,
        rarity: "common",
        components: [
          new Equippable({ slot: "weapon", mods: { attack: 1 } }),
          new Weapon({ damage: 3, fireCd: 18, melee: true, reach: 34 }),
        ],
      },
      {
        id: "blaster",
        name: "ITEM_BLASTER",
        stack: 1,
        weight: 5,
        value: 60,
        rarity: "rare",
        components: [
          new Equippable({ slot: "weapon", mods: { attack: 2 } }),
          new Weapon({ damage: 6, fireCd: 8, bulletSpeed: 700 }),
        ],
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
      // Backpack: equippable that grows the wearer's Inventory capacity (Container).
      {
        id: "backpack",
        name: "ITEM_BACKPACK",
        stack: 1,
        weight: 3,
        value: 30,
        rarity: "uncommon",
        components: [
          new Equippable({ slot: "backpack" }),
          new Container({ capacity: 8 }),
        ],
      },
      // Currency + unique loot.
      { id: "coin", name: "ITEM_COIN", weight: 0, value: 1, rarity: "common" },
      { id: "gem", name: "ITEM_GEM", weight: 1, value: 50, rarity: "rare" },
      {
        id: "key",
        name: "ITEM_KEY",
        stack: 1,
        weight: 0,
        value: 0,
        rarity: "epic",
      },
      // Crafting materials (no behavior — consumed by Recipes at a workbench).
      { id: "wood", name: "ITEM_WOOD", weight: 1, value: 1, rarity: "common" },
      { id: "iron", name: "ITEM_IRON", weight: 2, value: 4, rarity: "common" },
    ]);

    // Workbench recipes (Station kind "workbench"). Inputs are pulled from, and the
    // output deposited into, the player's bag (CraftSystem).
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

    // Overworld prefabs — structured clusters OverworldGen stamps into procedural chunks
    // (tagged "overworld"; local grid coords, footprint cols/rows kept inside a chunk). Loot-less
    // slimes get the generator's standard scatter loot.
    Prefab.register([
      // A loose field of rocks — terrain flavor, no enemies.
      {
        id: "boulder_cluster",
        tags: ["overworld"],
        weight: 4,
        cols: 4,
        rows: 4,
        walls: [
          [0, 0, 1, 2],
          [2, 0, 1, 1],
          [1, 2, 2, 1],
          [3, 3, 1, 1],
        ],
      },
      // A slime den — a sheltering rock corner with a pack of slimes (one tougher).
      {
        id: "slime_den",
        tags: ["overworld"],
        weight: 3,
        cols: 5,
        rows: 5,
        walls: [
          [0, 0, 3, 1],
          [0, 1, 1, 2],
        ],
        spawns: [
          { preset: "slime", lx: 3, ly: 2, hp: 3 },
          { preset: "slime", lx: 2, ly: 3, hp: 3 },
          { preset: "slime", lx: 4, ly: 4, hp: 5 },
        ],
      },
      // A ruin — broken walls around a loot chest (the rare reward prefab).
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
              { itemId: "iron", qty: 2 },
            ],
          },
        ],
      },
    ]);
  },
};
