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

    Item.register([
      { id: "slime_gel", name: "ITEM_SLIME_GEL", type: "material", value: 2, rarity: "common" },
      { id: "potion", name: "ITEM_POTION", type: "consumable", value: 10, rarity: "uncommon" },
      { id: "gem", name: "ITEM_GEM", type: "material", value: 50, rarity: "rare" },
      { id: "key", name: "ITEM_KEY", type: "key", stack: 1, value: 0, rarity: "epic" },
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
