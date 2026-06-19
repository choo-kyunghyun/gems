// RPG item content: the rarity tiers + the full item set (consumables / weapons / armor /
// trinket / unique items / crafting materials). Registered once by RpgContent.register() at a
// scene's create() (NOT at top level — avoids GMRT load-order issues). An item's `rarity` is a
// tier id defined here, so rarities + items live together. wood_sword = melee (swings a hitbox
// in the facing dir); blaster = ranged (cursor-aimed bullet) — RpgController picks melee-swing
// vs fire by the Weapon `melee` flag.
const RPG_RARITIES = [
  { id: "common", name: "RARITY_COMMON", color: "#b0b0b0", valueMod: 1 },
  { id: "uncommon", name: "RARITY_UNCOMMON", color: "#4caf50", valueMod: 2 },
  { id: "rare", name: "RARITY_RARE", color: "#2196f3", valueMod: 5 },
  { id: "epic", name: "RARITY_EPIC", color: "#9c27b0", valueMod: 12 },
  { id: "legendary", name: "RARITY_LEGENDARY", color: "#ff9800", valueMod: 30 },
];

globalThis.RpgItems = {
  register() {
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
        description: "ITEM_POTION_DESC",
        weight: 1,
        value: 10,
        rarity: "uncommon",
        components: [new Consumable({ heal: 5 })],
      },
      // Buff consumables — apply a timed Status (Buff/Status system). Tonic = Regen (HoT over 8s);
      // Elixir = Fortify (+attack/+defense for 12s, folded into Stats via StatModel). The status id
      // is content (RpgStatuses); ConsumableSystem.use routes it to StatusSystem.apply.
      {
        id: "tonic",
        name: "ITEM_TONIC",
        description: "ITEM_TONIC_DESC",
        weight: 1,
        value: 15,
        rarity: "uncommon",
        components: [new Consumable({ status: "regen" })],
      },
      {
        id: "elixir",
        name: "ITEM_ELIXIR",
        description: "ITEM_ELIXIR_DESC",
        weight: 1,
        value: 35,
        rarity: "rare",
        components: [new Consumable({ status: "fortify" })],
      },
      // Permanent attribute-boost consumables (Terraria Life-Crystal style) — the item-driven
      // progression that replaced leveling. Each raises ONE primary attribute by +1 forever (via
      // ConsumableSystem.grantAttr → StatModel.recompute), so growth comes from finding/crafting
      // these, not an XP grind. One per StatModel.ATTRS key; obtained by crafting (RpgRecipes) +
      // quest rewards (RpgQuests). `attr` matches the Attributes bag key.
      {
        id: "power_shard",
        name: "ITEM_POWER_SHARD",
        description: "ITEM_POWER_SHARD_DESC",
        weight: 1,
        value: 50,
        rarity: "epic",
        components: [new Consumable({ attr: "pow", amount: 1 })],
      },
      {
        id: "vitality_shard",
        name: "ITEM_VITALITY_SHARD",
        description: "ITEM_VITALITY_SHARD_DESC",
        weight: 1,
        value: 50,
        rarity: "epic",
        components: [new Consumable({ attr: "vit", amount: 1 })],
      },
      {
        id: "agility_shard",
        name: "ITEM_AGILITY_SHARD",
        description: "ITEM_AGILITY_SHARD_DESC",
        weight: 1,
        value: 50,
        rarity: "epic",
        components: [new Consumable({ attr: "agi", amount: 1 })],
      },
      {
        id: "endurance_shard",
        name: "ITEM_ENDURANCE_SHARD",
        description: "ITEM_ENDURANCE_SHARD_DESC",
        weight: 1,
        value: 50,
        rarity: "epic",
        components: [new Consumable({ attr: "end", amount: 1 })],
      },
      // Weapons. wood_sword = melee (swings a hitbox in the facing dir); blaster = ranged
      // (cursor-aimed bullet). RpgController picks melee-swing vs fire by the Weapon `melee`
      // flag.
      {
        id: "wood_sword",
        name: "ITEM_WOOD_SWORD",
        description: "ITEM_WOOD_SWORD_DESC",
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
        description: "ITEM_LEATHER_ARMOR_DESC",
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
  },
};
