// Registers the platformer RPG's rarity tiers + item set. Called once from
// scenePlatformer.create() (not at top level — avoids GMRT load-order issues),
// mirroring TopDownContent. Idempotent.
//
// Weapons carry a Weapon component: a `melee` weapon swings a hitbox (reach px)
// in the facing direction (MeleeSystem); a ranged weapon fires a cursor-aimed
// bullet (ProjectileSystem). Unarmed falls back to the controller's melee jab.
const PLATF_RARITIES = [
  { id: "common", name: "RARITY_COMMON", color: "#b0b0b0", valueMod: 1 },
  { id: "uncommon", name: "RARITY_UNCOMMON", color: "#4caf50", valueMod: 2 },
  { id: "rare", name: "RARITY_RARE", color: "#2196f3", valueMod: 5 },
  { id: "epic", name: "RARITY_EPIC", color: "#9c27b0", valueMod: 12 },
  { id: "legendary", name: "RARITY_LEGENDARY", color: "#ff9800", valueMod: 30 },
];

globalThis.PlatformerContent = {
  registered: false,

  register() {
    if (this.registered) return;
    this.registered = true;

    Rarity.register(PLATF_RARITIES);

    Item.register([
      // Currency + loot trash (the former "coins", now a stackable item).
      { id: "coin", name: "ITEM_COIN", weight: 0, value: 1, rarity: "common" },
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
      // Melee weapon — swings a short hitbox in the facing direction.
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
      // Ranged weapon — fires a cursor-aimed bullet.
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
    ]);
  },
};
