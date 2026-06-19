// The RPG scene's own content — its quests + achievements — layered over the shared
// RpgContent (rarities + the full item set + recipes). Called once from sceneRpg.create()
// (not at top level — avoids GMRT load-order issues). Idempotent.
globalThis.RpgQuests = {
  registered: false,

  // Quest ids (shared between content, scene, and NPC data).
  QUEST_SLIMES: "td_slimes",
  QUEST_GATHER: "td_gather",
  QUEST_REACH: "td_reach",

  register() {
    if (this.registered) return;
    this.registered = true;

    RpgContent.register(); // shared rarities + items + recipes (the whole item set)

    QuestLog.register([
      {
        id: this.QUEST_SLIMES,
        name: "QUEST_SLIMES_NAME",
        objLabel: "QUEST_SLIMES_OBJ", // formatted as text(label, done, count)
        objectives: [{ kind: "kill", target: "slime", count: 5 }],
        rewards: { items: [{ itemId: "potion", qty: 2 }] },
      },
      {
        id: this.QUEST_GATHER,
        name: "QUEST_GATHER_NAME",
        objLabel: "QUEST_GATHER_OBJ",
        objectives: [{ kind: "collect", target: "slime_gel", count: 3 }],
        rewards: { items: [{ itemId: "gem", qty: 1 }] },
      },
      {
        id: this.QUEST_REACH,
        name: "QUEST_REACH_NAME",
        objLabel: "QUEST_REACH_OBJ",
        // Explore the ruins → find a permanent attribute boost (the item-driven progression
        // that replaced XP). Shows the *_shard consumable as a quest reward as well as a craft.
        objectives: [{ kind: "reach", target: "ruins", count: 1 }],
        rewards: { items: [{ itemId: "vitality_shard", qty: 1 }] },
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
