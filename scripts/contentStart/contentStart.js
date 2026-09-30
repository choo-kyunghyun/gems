/**
 * A new colony's starting state: the quests open from the start, what the player carries (an
 * `equip` entry is worn, so the attack is item-driven from frame one), the companion hired
 * beside it (`x`/`y` its offset from the player, `follower` the follower descriptor's fields) and
 * the vehicle parked near it (the one the carried `key` item summons, at the `x`/`y` offset).
 * Read on a new game only; a load restores all of it.
 */
globalThis.contentStart = {
  QUESTS: ["td_gather", "td_reach"],

  KIT: [
    { itemId: "iron_pipe", qty: 1, equip: true },
    { itemId: "bandage", qty: 3 },
    { itemId: "water_bottle", qty: 1 },
    { itemId: "workbench", qty: 1 }, // the bench every other set-down item is made at
    { itemId: "wheat_seed", qty: 4 },
    { itemId: "coin", qty: 1000 }, // carried across maps with the inventory
  ],

  COMPANION: {
    x: -28,
    y: 22,
    follower: { label: "Companion", bonusWeight: 15 },
  },

  VEHICLE: { key: "buggy_key", x: 32, y: -112 },
};
