// Quest DEFINITIONS — a pure content registry, like Item/Rarity. The runtime side (accepting,
// objective progress, turn-in) lives in Tracker, which reads defs from here.
/**
 * @typedef {Object} QuestDef
 * @property {string} id
 * @property {string} name i18n key
 * @property {string} objLabel i18n key of the objective line, formatted with (progress, count) —
 *   one label per def, reused by every objective (UIQuestTracker).
 * @property {Array<{kind:"kill"|"collect"|"reach"|"talk", target:string, count:number}>} objectives
 *   `target` is a component token for "kill", an item id for "collect", a marker for "reach", an
 *   NPC id for "talk"; Tracker counts each up to `count`.
 * @property {{items: Array<{itemId:string, qty:number}>}} [rewards] item-only BY DESIGN — there is
 *   no XP, so a reward can never be a power shortcut around gathering (see Progression). The
 *   wrapper object is what `Tracker.complete`'s `?? {}` fallback stands in for.
 */
globalThis.QuestLog = {
  // ── Registry facade (Registry owns the store's contract) ──
  _defs: new Map(),
  _order: [],

  register(defs) {
    Registry.register(QuestLog, defs);
    return this;
  },

  def(id) {
    return Registry.get(QuestLog, id);
  },

  /**
   * every quest def in registration order — the editor's quest picker.
   */
  all() {
    return Registry.all(QuestLog);
  },

  /**
   * the registered ids in order — Tracker walks these to match objectives and list active quests.
   */
  ids() {
    return this._order;
  },
};
