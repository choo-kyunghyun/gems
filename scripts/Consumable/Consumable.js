// Item-component: marks an Item usable from the bag (one unit consumed for an instant effect).
// Flat class queried by `instanceof` (composition over inheritance — GMRT can't super/subclass).
globalThis.Consumable = class Consumable {
  /**
   * @param {Object} d
   * @param {number} [d.heal] HP restored (clamped to max-HP)
   * @param {string} [d.attr] permanent attribute grant — attribute key to raise (e.g. "pow"). Generic
   *   (no stat-model opinion); applied via the injected ConsumableSystem.grantAttr hook (Demo). How
   *   attributes grow now that there's no leveling.
   * @param {number} [d.amount] how much `attr` increases per use (default 1)
   * @param {string} [d.status] Status def id to apply (e.g. "regen"). Generic like `attr`; def +
   *   effects are content (Demo). "" = none.
   * @param {number} [d.statusDuration] override seconds; 0 = use the def's duration
   * @param {number} [d.thirst] survival: lowers Thirst (a drink)
   * @param {number} [d.hunger] survival: lowers Hunger (a food)
   * @param {string} [d.yields] item id left behind after use (e.g. an empty can). "" = none.
   */
  constructor(d) {
    this.heal = d.heal ?? 0;
    this.attr = d.attr ?? "";
    this.amount = d.amount ?? 1;
    this.status = d.status ?? "";
    this.statusDuration = d.statusDuration ?? 0;
    this.thirst = d.thirst ?? 0;
    this.hunger = d.hunger ?? 0;
    this.yields = d.yields ?? "";
  }
};
