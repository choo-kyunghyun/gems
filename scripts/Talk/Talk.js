/**
 * What an NPC says when talked to: a line for its quest's state, as an i18n key. A merchant greets
 * instead of offering a quest.
 */
globalThis.Talk = {
  /** "" when `id` is no NPC. */
  line(entities, id) {
    const npc = entities.get(id, NPC);
    if (npc === undefined) return "";
    if (entities.has(id, Merchant)) return "TRADE_GREET";
    const qid = npc.questId;
    if (Tracker.isDone(qid)) return "NPC_ELDER_THANKS";
    if (Tracker.isReady(qid)) return "NPC_ELDER_DONE";
    if (Tracker.isActive(qid)) return "NPC_ELDER_WIP";
    return "NPC_ELDER_OFFER";
  },
};
