// Platformer-specific content, layered over the shared RpgContent (rarity tiers,
// universal items, recipes). Called once from scenePlatformer.create() (not at top level
// — avoids GMRT load-order issues). Idempotent.
//
// Extras here: a `coin` loot item, plus this genre's WEAPONS — the platformer's
// `wood_sword` is MELEE (swings a hitbox in the facing direction via MeleeSystem) and the
// `blaster` is ranged (cursor-aimed bullet). Unarmed falls back to the controller's jab.
globalThis.PlatformerContent = {
  registered: false,

  register() {
    if (this.registered) return;
    this.registered = true;

    RpgContent.register(); // shared rarities + universal items + recipes

    Item.register([
      // Currency + loot trash (the former "coins", now a stackable item).
      { id: "coin", name: "ITEM_COIN", weight: 0, value: 1, rarity: "common" },
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
    ]);
  },
};
