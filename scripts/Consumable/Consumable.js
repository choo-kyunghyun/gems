// Item-component: marks an Item as usable from the bag, consuming one unit to
// apply an instant effect. Presence on an item (item.hasComponent(Consumable))
// is what makes it usable; ConsumableSystem.use reads the fields below. A flat,
// standalone class queried by `instanceof` (see Item.getComponent) — no
// inheritance, which GMRT can't do.
globalThis.Consumable = class Consumable {
  /**
   * @param {Object} d
   * @param {number} [d.heal] HP restored on use (clamped to Stats.maxHp)
   */
  constructor(d) {
    this.heal = d.heal ?? 0;
  }
};
