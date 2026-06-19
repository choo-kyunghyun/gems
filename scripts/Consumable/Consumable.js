// Item-component: marks an Item as usable from the bag, consuming one unit to
// apply an instant effect. Presence on an item (item.hasComponent(Consumable))
// is what makes it usable; ConsumableSystem.use reads the fields below. A flat,
// standalone class queried by `instanceof` (see Item.getComponent) — no
// inheritance, which GMRT can't do.
globalThis.Consumable = class Consumable {
  /**
   * @param {Object} d
   * @param {number} [d.heal] HP restored on use (clamped to the max-HP cap)
   * @param {string} [d.attr] a PERMANENT attribute grant: the attribute key to raise (e.g. "pow").
   *   Generic by design (a bare string key, no stat-model opinion) — the actual attribute set +
   *   how it derives is the game's (Demo) concern, applied via the injected ConsumableSystem.grantAttr
   *   hook. The kit just carries the intent. This is how attributes grow now that there's no leveling.
   * @param {number} [d.amount] how much `attr` increases per use (default 1)
   */
  constructor(d) {
    this.heal = d.heal ?? 0;
    this.attr = d.attr ?? "";
    this.amount = d.amount ?? 1;
  }
};
