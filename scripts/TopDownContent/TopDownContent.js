// Registers this genre's items, quests, and achievements. Called once from
// sceneTopDown.create() (not at top level — avoids GMRT load-order issues).
// Rarity tiers are registered separately by TopDownController.create.
globalThis.TopDownContent = {
  registered: false,

  // Quest ids (shared between content, scene, and NPC data).
  QUEST_SLIMES: "td_slimes",
  QUEST_GATHER: "td_gather",
  QUEST_REACH: "td_reach",

  register() {
    if (this.registered) return;
    this.registered = true;

    // Base fields are identity + the near-universal scalars (value, stack);
    // capabilities/markers attach as `components` (Equippable, Weapon, ...).
    // Equipment weapons sit clearly above the unarmed default damage of 1.
    Item.register([
      {
        id: "slime_gel",
        name: "ITEM_SLIME_GEL",
        weight: 1,
        value: 2,
        rarity: "common",
      },
      {
        id: "potion",
        name: "ITEM_POTION",
        weight: 1,
        value: 10,
        rarity: "uncommon",
        components: [new Consumable({ heal: 5 })],
      },
      { id: "gem", name: "ITEM_GEM", weight: 1, value: 50, rarity: "rare" },
      {
        id: "key",
        name: "ITEM_KEY",
        stack: 1,
        weight: 0,
        value: 0,
        rarity: "epic",
      },
      {
        id: "wood_sword",
        name: "ITEM_WOOD_SWORD",
        stack: 1,
        weight: 4,
        value: 8,
        rarity: "common",
        components: [
          new Equippable({ slot: "weapon", mods: { attack: 1 } }),
          new Weapon({ damage: 3, fireCd: 14, bulletSpeed: 520 }),
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
          new Weapon({ damage: 6, fireCd: 6, bulletSpeed: 700 }),
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
    ]);

    QuestLog.register([
      {
        id: this.QUEST_SLIMES,
        name: "QUEST_SLIMES_NAME",
        objLabel: "QUEST_SLIMES_OBJ", // formatted as text(label, done, count)
        objectives: [{ kind: "kill", target: "slime", count: 5 }],
        rewards: { xp: 25, items: [{ itemId: "potion", qty: 2 }] },
      },
      {
        id: this.QUEST_GATHER,
        name: "QUEST_GATHER_NAME",
        objLabel: "QUEST_GATHER_OBJ",
        objectives: [{ kind: "collect", target: "slime_gel", count: 3 }],
        rewards: { xp: 15, items: [{ itemId: "gem", qty: 1 }] },
      },
      {
        id: this.QUEST_REACH,
        name: "QUEST_REACH_NAME",
        objLabel: "QUEST_REACH_OBJ",
        objectives: [{ kind: "reach", target: "ruins", count: 1 }],
        rewards: { xp: 10 },
      },
    ]);

    Achievement.register([
      {
        id: "td_first_kill",
        name: "ACH_FIRST_KILL_NAME",
        desc: "ACH_FIRST_KILL_DESC",
        condition: (c) => (c.enemiesKilled ?? 0) >= 1,
      },
      {
        id: "td_slayer",
        name: "ACH_SLAYER_NAME",
        desc: "ACH_SLAYER_DESC",
        condition: (c) => (c.enemiesKilled ?? 0) >= 10,
      },
      {
        id: "td_collector",
        name: "ACH_COLLECTOR_NAME",
        desc: "ACH_COLLECTOR_DESC",
        condition: (c) => (c.itemsCollected ?? 0) >= 10,
      },
      {
        id: "td_quester",
        name: "ACH_QUESTER_NAME",
        desc: "ACH_QUESTER_DESC",
        condition: (c) => (c.questsCompleted ?? 0) >= 1,
      },
    ]);
  },
};
