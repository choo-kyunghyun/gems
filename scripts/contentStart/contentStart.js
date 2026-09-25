/**
 * A new colony's starting state: the quests open from the start, what the player carries (an
 * `equip` entry is worn, so the attack is item-driven from frame one) and the companion hired
 * beside it (`x`/`y` its offset from the player, `follower` the follower descriptor's fields).
 * Read on a new game only; a load restores all of it.
 */
globalThis.contentStart = {
  QUESTS: ["td_gather", "td_reach"],

  KIT: [
    { itemId: "lead_pipe", qty: 1, equip: true },
    { itemId: "filter_mask", qty: 1, equip: true },
    { itemId: "coin", qty: 1000 }, // carried across maps with the inventory
  ],

  COMPANION: {
    x: -28,
    y: 22,
    follower: { label: "Companion", bonusCapacity: 4, bonusWeight: 15 },
  },
};
