/**
 * What an NPC says in the dialogue panel: a line for its quest's state and the action E takes on
 * it, as i18n keys. A merchant greets instead of offering a quest.
 */
globalThis.Talk = {
  // shared rows, never written
  TRADE: { line: "TRADE_GREET", action: "TRADE_ACTION" },
  OFFER: { line: "NPC_ELDER_OFFER", action: "QUEST_ACCEPT" },
  ACTIVE: { line: "NPC_ELDER_WIP", action: "" },
  READY: { line: "NPC_ELDER_DONE", action: "QUEST_TURNIN" },
  DONE: { line: "NPC_ELDER_THANKS", action: "" },

  /** `{ line, action }`, action "" when E does nothing; null when `id` is no NPC. */
  line(entities, id) {
    const npc = entities.get(id, NPC);
    if (npc === undefined) return null;
    if (entities.has(id, Merchant)) return Talk.TRADE;
    const qid = npc.questId;
    if (Tracker.isDone(qid)) return Talk.DONE;
    if (Tracker.isReady(qid)) return Talk.READY;
    if (Tracker.isActive(qid)) return Talk.ACTIVE;
    return Talk.OFFER;
  },
};
