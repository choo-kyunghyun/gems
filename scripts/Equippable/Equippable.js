// Item-component: marks an Item as wearable in an Equipment slot and carries the
// flat stat deltas applied while it is worn. Presence on an item (via
// item.hasComponent(Equippable)) is what makes it equippable. A flat, standalone
// class — queried by `instanceof` (see Item.getComponent); no inheritance, which
// GMRT can't do.
globalThis.Equippable = class Equippable {
  /**
   * @param {Object} d
   * @param {string} d.slot   "weapon" | "armor" | "trinket" | "backpack"
   * @param {Object} [d.mods] flat stat deltas, e.g. { attack, defense, maxHp, speed }
   */
  constructor(d) {
    this.slot = d.slot;
    this.mods = d.mods ?? {};
  }
};
