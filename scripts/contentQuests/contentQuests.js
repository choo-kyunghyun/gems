// Colony quest data, layered over the shared content. Registered on demand, not at top level
// (docs/GMRT.md). Idempotent.
globalThis.contentQuests = {
  registered: false,

  // shared with level and NPC data
  QUEST_HUMANS: "td_humans",
  QUEST_GATHER: "td_gather",
  QUEST_REACH: "td_reach",

  register() {
    if (contentQuests.registered) return;
    contentQuests.registered = true;

    content.register();

    QuestLog.register([
      {
        id: contentQuests.QUEST_HUMANS,
        name: "QUEST_HUMANS_NAME",
        objLabel: "QUEST_HUMANS_OBJ",
        objectives: [{ kind: "kill", target: "raider", count: 5 }],
        rewards: { items: [{ itemId: "medkit", qty: 2 }] },
      },
      {
        id: contentQuests.QUEST_GATHER,
        passive: true,
        name: "QUEST_GATHER_NAME",
        objLabel: "QUEST_GATHER_OBJ",
        objectives: [{ kind: "collect", target: "rags", count: 3 }],
        rewards: { items: [{ itemId: "circuitry", qty: 1 }] },
      },
      {
        id: contentQuests.QUEST_REACH,
        passive: true,
        name: "QUEST_REACH_NAME",
        objLabel: "QUEST_REACH_OBJ",
        // a permanent attribute boost, gated on exploration
        objectives: [{ kind: "reach", target: "ruins", count: 1 }],
        rewards: { items: [{ itemId: "vitality_serum", qty: 1 }] },
      },
    ]);
  },
};
