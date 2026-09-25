/**
 * A new colony's starting state: the quests open from the start, what the player carries (an
 * `equip` entry is worn, so the attack is item-driven from frame one), the companion hired
 * beside it (`x`/`y` its offset from the player, `follower` the follower descriptor's fields) and
 * the traders on the road. Read on a new game only; a load restores all of it.
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

  TRADERS: [
    {
      id: "peddler",
      name: "NPC_TRADER_NAME",
      travelH: 2, // in-game hours in transit between stops
      route: [
        { map: "hub", dwellH: 6 },
        { map: "cave", dwellH: 6 },
      ],
      merchant: {
        infinite: true,
        currencyId: "coin",
        buyMargin: 1.2,
        sellMargin: 0.5,
        stock: [
          { itemId: "medkit", qty: 1 },
          { itemId: "water_bottle", qty: 1 },
          { itemId: "ration_pack", qty: 1 },
          { itemId: "ammo_light", qty: 1 },
          { itemId: "wood", qty: 1 },
          { itemId: "scrap_metal", qty: 1 },
        ],
      },
    },
  ],
};
