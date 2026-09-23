/**
 * Quest definition registry; it holds no progress.
 * @typedef {Object} QuestDef
 * @property {string} id
 * @property {string} name i18n key
 * @property {string} objLabel i18n key of the objective line, formatted with (progress, count);
 *   one label per def, shared by every objective
 * @property {Array<{kind:"kill"|"collect"|"reach"|"talk", target:string, count:number}>} objectives
 *   `target` is a component token for "kill", an item id for "collect", a marker for "reach", an
 *   NPC id for "talk"
 * @property {{items: Array<{itemId:string, qty:number}>}} [rewards] item-only by design: with no
 *   XP, a reward can never be a power shortcut around gathering
 */
globalThis.QuestLog = {
  register(defs) {
    Registry.register(QuestLog, defs);
  },

  def(id) {
    return Registry.get(QuestLog, id);
  },

  /** In registration order. */
  all() {
    return Registry.all(QuestLog);
  },

  /** In registration order. */
  ids() {
    return Registry.ids(QuestLog);
  },
};
