// RPG quest data, layered over RpgContent (achievements live in RpgAchievements). Called once
// from sceneRpg.create() (not top-level — GMRT load-order). Idempotent.
globalThis.RpgQuests = {
  registered: false,

  // quest ids shared between content, scene, and NPC data
  QUEST_HUMANS: "td_humans",
  QUEST_GATHER: "td_gather",
  QUEST_REACH: "td_reach",

  register() {
    if (this.registered) return;
    this.registered = true;

    RpgContent.register(); // shared rarities + items + recipes

    QuestLog.register([
      {
        id: this.QUEST_HUMANS,
        name: "QUEST_HUMANS_NAME",
        objLabel: "QUEST_HUMANS_OBJ",
        objectives: [{ kind: "kill", target: "raider", count: 5 }],
        rewards: { items: [{ itemId: "medkit", qty: 2 }] },
      },
      {
        id: this.QUEST_GATHER,
        name: "QUEST_GATHER_NAME",
        objLabel: "QUEST_GATHER_OBJ",
        objectives: [{ kind: "collect", target: "rags", count: 3 }],
        rewards: { items: [{ itemId: "circuitry", qty: 1 }] },
      },
      {
        id: this.QUEST_REACH,
        name: "QUEST_REACH_NAME",
        objLabel: "QUEST_REACH_OBJ",
        // permanent attribute boost reward — the item-driven progression path, gated on exploration
        objectives: [{ kind: "reach", target: "ruins", count: 1 }],
        rewards: { items: [{ itemId: "vitality_serum", qty: 1 }] },
      },
    ]);
  },
};
